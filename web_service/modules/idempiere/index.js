import fp from 'fastify-plugin'
import autoload from '@fastify/autoload'
import { join } from 'desm'
import oracleDB from "../../configs/dbOracle.js";

class Idempiere {
    async insertProductWithBOM(server) {
        let dbClientOracle;
        let dbClientPostgres;

        try {
            dbClientOracle = await oracleDB.openConnection();


            // ========== 1. EXTRACT: Ambil data dari ADempiere ==========
            const extractQuery = `
           SELECT
                -- Info Produk Jadi (Parent)
                p_parent.m_product_id AS parent_product_id,
                p_parent.ad_client_id,
                p_parent.ad_org_id,
                p_parent.value AS parent_value,
                p_parent.name AS parent_name,
                -- Info BOM Line
                b.line,
                b.bomqty,
                b.description,
                b.bomtype,
                b.isactive,
                b.created,
                b.createdby,
                b.updated,
                b.updatedby,
                -- Info Produk Komponen
                p_component.m_product_id AS component_product_id
            FROM m_product_bom b
            JOIN m_product p_parent ON b.m_product_id = p_parent.m_product_id
            JOIN m_product p_component ON b.m_productbom_id = p_component.m_product_id
            WHERE p_parent.M_PRODUCT_ID = 1051330 --77200-K2F -NC00-20 1/2
            ORDER BY p_parent.m_product_id, b.line
        `;
            const { rows: adempiereBOMs } = await dbClientOracle.execute(extractQuery, {}, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });

            // ========== 2. TRANSFORM: Ubah data menjadi struktur Header/Line ==========
            const transformedBOMs = new Map();

            for (const row of adempiereBOMs) {
                // Jika kita belum pernah melihat produk jadi ini, buat entry header baru
                if (!transformedBOMs.has(row.parent_product_id)) {
                    transformedBOMs.set(row.parent_product_id, {
                        header: {
                            m_product_id: row.parent_product_id,
                            ad_client_id: 1000003,
                            ad_org_id: 1000003,
                            value: `${row.parent_value}-BOM`,
                            name: `${row.parent_name} - Bill of Material`,
                            description: 'Migrated from ADempiere',
                            bomtype: 'A', // Current Active
                            bomuse: 'A', // Master
                        },
                        lines: []
                    });
                }
                // Tambahkan komponen ke dalam array 'lines'
                transformedBOMs.get(row.parent_product_id).lines.push({
                    line: row.line,
                    m_product_id: row.component_product_id,
                    qtybom: row.bomqty,
                    description: row.description,
                    isactive: row.isactive,
                    created: row.created,
                    createdby: row.createdby,
                    updated: row.updated,
                    updatedby: row.updatedby,
                });
            }

            // ========== 3. LOAD: Masukkan data ke iDempiere ==========
            let successCount = 0;
            let errorCount = 0;
            const errorDetails = [];

            dbClientPostgres = await server.pg.connect();


            try {
                for (const [productId, bom] of transformedBOMs.entries()) {
                    try {
                        // Mulai Transaksi
                        await dbClientPostgres.query('BEGIN');

                        // Masukkan Header
                        const insertHeaderQuery = `
                        INSERT INTO pp_product_bom (
                            pp_product_bom_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, 
                            value, name, description, m_product_id, bomtype, bomuse, pp_product_bom_uu
                        ) VALUES (
                            nextval('pp_product_bom_sq'), $1, $2, 'Y', NOW(), 100, NOW(), 100,
                            $3, $4, $5, $6, $7, $8, gen_random_uuid()
                        ) RETURNING pp_product_bom_id;
                    `;
                        const headerValues = [
                            bom.header.ad_client_id, bom.header.ad_org_id, bom.header.value,
                            bom.header.name, bom.header.description, bom.header.m_product_id,
                            bom.header.bomtype, bom.header.bomuse
                        ];
                        const headerResult = await dbClientPostgres.query(insertHeaderQuery, headerValues);
                        const newBomId = headerResult.rows[0].pp_product_bom_id;

                        // Masukkan Lines
                        for (const line of bom.lines) {
                            const insertLineQuery = `
                            INSERT INTO pp_product_bomline (
                                pp_product_bomline_id, pp_product_bom_id, ad_client_id, ad_org_id, isactive, 
                                created, createdby, updated, updatedby, line, m_product_id, qtybom, 
                                description, scrap, pp_product_bomline_uu
                            ) VALUES (
                                nextval('pp_product_bomline_sq'), $1, $2, $3, $4,
                                $5, $6, $7, $8, $9, $10, $11,
                                $12, $13, gen_random_uuid()
                            );
                         `;
                            const lineValues = [
                                newBomId, bom.header.ad_client_id, bom.header.ad_org_id, line.isactive,
                                line.created, line.createdby, line.updated, line.updatedby, line.line,
                                line.m_product_id, line.qtybom, line.description, line.scrap
                            ];
                            await dbClientPostgres.query(insertLineQuery, lineValues);
                        }

                        // Commit Transaksi jika berhasil
                        await dbClientPostgres.query('COMMIT');
                        successCount++;

                    } catch (err) {
                        console.log(`Error saat memproses BOM untuk produk ID ${productId}:`, err);

                        // Rollback Transaksi jika terjadi error
                        await dbClientPostgres.query('ROLLBACK');
                        errorCount++;

                        errorDetails.push({
                            productId: productId,
                            error: err.message, // err.message berisi pesan error yang jelas
                            parentValue: bom.header.value,
                        });
                    }
                }
            } finally {
                // Lepaskan koneksi client kembali ke pool
                dbClientPostgres.release();
            }

            if (errorCount > 0) {
                return {
                    message: 'Migration process finished with some errors.',
                    success: successCount,
                    errors: errorCount,
                    details: errorDetails // <-- INI DIA
                };
            }

            return ({
                message: 'Migration process finished.',
                success: successCount,
                errors: errorCount,
                details: []
            });


        } catch (error) {
            console.error('Error saat insertProductWithBOM:', error);
            return {
                status: 'FAIL',
                message: 'A critical error occurred that stopped the entire process.',
                error: error.message
            };
        } finally {
            if (dbClientOracle) {
                try { await dbClientOracle.close(); } catch (e) { console.error('Gagal tutup Oracle:', e); }
            }
            if (dbClientPostgres) {
                try { await dbClientPostgres.release(); } catch (e) { console.error('Gagal release Postgres:', e); }
            }
        }
    }
}

async function idempiere(fastify, opts) {
    // This will be published to the root fastify instance
    // it could also be extracted to a separate plugin
    fastify.decorate('idempiere', new Idempiere())

    // These routes would be created in their own child instances
    fastify.register(autoload, {
        dir: join(import.meta.url, 'routes'),
        options: {
            prefix: opts.prefix
        }
    })
}

export default fp(idempiere)