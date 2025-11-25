import fp from 'fastify-plugin'
import autoload from '@fastify/autoload'
import { join } from 'desm'
import oracleDB from "../../configs/dbOracle.js";

class Idempiere {

    async insertProductWithBOM(server) {
        let dbClientOracle;
        let dbClientPostgres;
        const allResults = []; // Array untuk menyimpan hasil dari setiap produk

        try {
            dbClientPostgres = await server.pg.connect();

            const sourceProductQuery = `
            SELECT
                mp.value
            FROM m_product mp
            WHERE
                mp.m_product_category_id IN (1000006, 1000017, 1000016, 1000034) --FG, FG Inj, WIP, WIP Inj
                AND mp.value IN ('77200-K2F -NC00-20 1/2', 'R3220090')
            `;

            const resultSourceProductRows = await dbClientPostgres.query(sourceProductQuery);

            // Pastikan koneksi Postgres awal dirilis jika tidak digunakan lagi di loop
            // Jika Anda ingin menggunakannya kembali di dalam loop, biarkan tetap terbuka
            // Tetapi untuk kasus ini, lebih baik buka dan tutup koneksi per iterasi
            dbClientPostgres.release(); // Rilis koneksi awal jika tidak akan digunakan lagi di luar loop for

            for (const source of resultSourceProductRows.rows) {
                dbClientOracle = await oracleDB.openConnection(); // Buka koneksi Oracle per iterasi
                let currentProductResult = { // Objek untuk menyimpan hasil produk saat ini
                    product: source.value,
                    success: 0,
                    errors: 0,
                    details: []
                };

                try {
                    // 1. EXTRACT dari Oracle
                    const extractQuery = `
                    SELECT
                        p_parent.value AS "parent_value",
                        p_parent.name AS "parent_name",
                        p_parent.ad_client_id AS "ad_client_id",
                        p_parent.ad_org_id AS "ad_org_id",
                        p_parent.c_uom_id AS "c_uom_id",
                        p_component.value AS "component_value",
                        b.line AS "line",
                        b.bomqty AS "bomqty",
                        b.description AS "description",
                        b.bomtype AS "bomtype",
                        b.isactive AS "isactive",
                        b.created AS "created",
                        b.createdby AS "createdby",
                        b.updated AS "updated",
                        b.updatedby AS "updatedby"
                    FROM m_product_bom b
                    JOIN m_product p_parent ON b.m_product_id = p_parent.m_product_id
                    JOIN m_product p_component ON b.m_productbom_id = p_component.m_product_id
                    WHERE p_parent.value = :value
                    ORDER BY p_parent.m_product_id, b.line
                `;

                    const { rows: adempiereBOMs } = await dbClientOracle.execute(extractQuery, { value: source.value }, {
                        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
                    });

                    // 2. TRANSFORM
                    const transformedBOMs = new Map();

                    for (const row of adempiereBOMs) {
                        if (!row.parent_value) {
                            console.warn("❗️Data tidak valid. Lewati row:", row);
                            continue;
                        }

                        if (!transformedBOMs.has(row.parent_value)) {
                            transformedBOMs.set(row.parent_value, {
                                header: {
                                    product_value: row.parent_value,
                                    ad_client_id: 1000003, //row.ad_client_id,
                                    ad_org_id: 1000003, //row.ad_org_id,
                                    c_uom_id: row.c_uom_id,
                                    value: `${row.parent_value}-BOM`,
                                    name: `${row.parent_name} - Bill of Material`,
                                    description: 'Migrated from ADempiere',
                                    bomtype: 'A',
                                    bomuse: 'A',
                                },
                                lines: []
                            });
                        }

                        transformedBOMs.get(row.parent_value).lines.push({
                            line: row.line,
                            component_value: row.component_value, // lookup nanti di Postgres
                            qtybom: row.bomqty,
                            description: row.description,
                            isactive: row.isactive,
                            created: row.created,
                            createdby: row.createdby,
                            updated: row.updated,
                            updatedby: row.updatedby,
                        });
                    }

                    // 3. LOAD ke PostgreSQL
                    dbClientPostgres = await server.pg.connect(); // Buka koneksi Postgres per iterasi untuk bagian LOAD

                    try {
                        for (const [parentValue, bom] of transformedBOMs.entries()) {
                            try {
                                await dbClientPostgres.query('BEGIN');

                                // ✅ Lookup parent ID
                                const parentRes = await dbClientPostgres.query(
                                    `SELECT m_product_id FROM m_product WHERE value = $1`,
                                    [bom.header.product_value]
                                );

                                if (parentRes.rowCount === 0) {
                                    throw new Error(`Parent product '${bom.header.product_value}' not found in m_product`);
                                }

                                const parentProductId = parentRes.rows[0].m_product_id;

                                // ✅ Insert Header
                                const insertHeaderQuery = `
                                INSERT INTO pp_product_bom (
                                    pp_product_bom_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
                                    value, name, description, m_product_id, bomtype, bomuse, pp_product_bom_uu, copyfrom, processing,
                                    validfrom, c_uom_id
                                ) VALUES (
                                    (nextid((select ad_sequence_id from ad_sequence where name = 'PP_Product_BOM')::Integer, 'N'::Varchar)), $1, $2, 'Y', NOW(), 100, NOW(), 100,
                                    $3, $4, $5, $6, $7, $8, gen_random_uuid(), 'N', 'N',
                                    NOW(), $9
                                ) RETURNING pp_product_bom_id;
                            `;

                                const headerValues = [
                                    bom.header.ad_client_id,
                                    bom.header.ad_org_id,
                                    bom.header.value,
                                    bom.header.name,
                                    bom.header.description,
                                    parentProductId,
                                    bom.header.bomtype,
                                    bom.header.bomuse,
                                    bom.header.c_uom_id
                                ];

                                const headerResult = await dbClientPostgres.query(insertHeaderQuery, headerValues);
                                const newBomId = headerResult.rows[0].pp_product_bom_id;

                                // ✅ Insert Lines (with lookup component ID)
                                for (const line of bom.lines) {
                                    // Lookup component ID from value
                                    const compRes = await dbClientPostgres.query(
                                        `SELECT m_product_id FROM m_product WHERE value = $1`,
                                        [line.component_value]
                                    );

                                    if (compRes.rowCount === 0) {
                                        throw new Error(`Component product '${line.component_value}' not found in m_product`);
                                    }

                                    const componentProductId = compRes.rows[0].m_product_id;

                                    const insertLineQuery = `
                                    INSERT INTO pp_product_bomline (
                                        pp_product_bomline_id, pp_product_bom_id, ad_client_id, ad_org_id, isactive,
                                        created, createdby, updated, updatedby, line, m_product_id, qtybom,
                                        description, scrap, pp_product_bomline_uu, assay, c_uom_id, forecast, isqtypercentage,
                                        leadtimeoffset, qtybatch, validfrom
                                    ) VALUES (
                                        (nextid((select ad_sequence_id from ad_sequence where name = 'PP_Product_BOMLine')::Integer, 'N'::Varchar)), $1, $2, $3, $4,
                                        $5, $6, $7, $8, $9, $10, $11,
                                        $12, 0, gen_random_uuid(), 0, $13, 0, 'N',
                                        0, 0, NOW()
                                    );
                                `;

                                    const lineValues = [
                                        newBomId,
                                        bom.header.ad_client_id,
                                        bom.header.ad_org_id,
                                        line.isactive,
                                        line.created,
                                        line.createdby,
                                        line.updated,
                                        line.updatedby,
                                        line.line,
                                        componentProductId,
                                        line.qtybom,
                                        line.description,
                                        bom.header.c_uom_id,
                                    ];

                                    await dbClientPostgres.query(insertLineQuery, lineValues);
                                }

                                await dbClientPostgres.query('COMMIT');
                                currentProductResult.success++;

                            } catch (err) {
                                await dbClientPostgres.query('ROLLBACK');
                                currentProductResult.errors++;
                                currentProductResult.details.push({
                                    parentValue,
                                    error: err.message
                                });
                            }
                        }
                    } finally {
                        dbClientPostgres.release(); // Pastikan koneksi Postgres dirilis setelah setiap produk
                    }
                } catch (err) {
                    console.error(`Error processing product ${source.value}:`, err);
                    currentProductResult.errors++;
                    currentProductResult.details.push({
                        product: source.value,
                        error: err.message
                    });
                } finally {
                    if (dbClientOracle) {
                        try { await dbClientOracle.close(); } catch (e) { console.error('Gagal tutup Oracle:', e); }
                    }
                }
                allResults.push(currentProductResult); // Tambahkan hasil produk saat ini ke array
            }

            // Kumpulkan ringkasan akhir
            const totalSuccess = allResults.reduce((sum, res) => sum + res.success, 0);
            const totalErrors = allResults.reduce((sum, res) => sum + res.errors, 0);
            const allErrorDetails = allResults.flatMap(res => res.details);

            return {
                message: totalErrors > 0
                    ? 'Migration process finished with some errors for some products.'
                    : 'Migration process finished successfully for all products.',
                totalProductsProcessed: resultSourceProductRows.rows.length,
                totalSuccess: totalSuccess,
                totalErrors: totalErrors,
                details: allResults, // Mengembalikan detail per produk
                allErrorDetails: allErrorDetails // Mengembalikan semua error dalam satu array
            };

        } catch (error) {
            console.error('Error saat insertProductWithBOM:', error);
            return {
                status: 'FAIL',
                message: 'A critical error occurred that stopped the entire process.',
                error: error.message
            };
        } finally {
            // Pastikan tidak ada koneksi yang tersisa jika terjadi error fatal di luar loop
            // Koneksi di dalam loop sudah dihandle oleh finally-nya masing-masing
            if (dbClientOracle) { // Ini hanya akan dijalankan jika dbClientOracle masih ada dan belum ditutup di dalam loop
                try { await dbClientOracle.close(); } catch (e) { console.error('Gagal tutup Oracle di final outer:', e); }
            }
            if (dbClientPostgres) { // Ini hanya akan dijalankan jika dbClientPostgres masih ada dan belum dirilis di dalam loop
                try { await dbClientPostgres.release(); } catch (e) { console.error('Gagal release Postgres di final outer:', e); }
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