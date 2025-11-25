import fp from 'fastify-plugin'
import autoload from '@fastify/autoload'
import { join } from 'desm'
import oracleDB from "../../configs/dbOracle.js";


class Handover {
    async listDeliveryToDPK(server) {
        let connection;
        let dbClient;

        if (!server) {
            // Ini menggantikan blok 'default' pada switch
            return { success: false, message: "Unable connection db" };
        }

        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            const queryOracle = `
                SELECT
                    mi.M_INOUT_ID,
                    mi.DOCUMENTNO,
                    cb.NAME AS CUSTOMER,
                    TO_DATE(
					    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
					    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
					    'YYYY-MM-DD HH24:MI:SS'
					) AS PLANTIME
                FROM
                    M_INOUT mi
                    INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                    INNER JOIN C_ORDER co ON co.C_ORDER_ID = mi.C_ORDER_ID 
                WHERE
                    mi.MOVEMENTDATE >= TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') + 20
                    AND mi.DOCSTATUS = 'CO' AND ISSOTRX = 'Y' 
                    AND cb.ISSUBCONTRACT = 'N'
                    AND co.ISMILKRUN = 'N'
                    AND mi.ADW_TMS_ID IS NULL
                    ORDER BY mi.DOCUMENTNO DESC
                `;

            // Eksekusi query tanpa parameter
            const resultOracle = await connection.execute(queryOracle, [], {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });
            const oracleRows = resultOracle.rows || [];




            if (oracleRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // 3. Query untuk mengambil SEMUA ID yang sudah pernah tercatat di PostgreSQL
            // Asumsi: jika ID sudah ada, berarti sudah diproses dan tidak perlu ditampilkan lagi.
            const queryPostgres = `SELECT m_inout_id, checkpoin_id FROM adw_trackingsj`;
            const resultPg = await dbClient.query(queryPostgres);

            // 4. Buat Set dari ID yang sudah ada, jangan lupa konversi ke STRING
            const existingTrackingData = new Map(
                resultPg.rows.map(row => [String(row.m_inout_id), row.checkpoin_id])
            );

            // 5. Filter hasil dari Oracle DENGAN LOGIKA DIBALIK (!)
            // Hanya simpan baris dari Oracle yang ID-nya TIDAK ADA (!) di dalam Set.
            const filteredData = oracleRows.filter(oracleRow => {
                const oracleId = String(oracleRow.M_INOUT_ID);

                // Cek apakah ID dari Oracle ada di dalam data tracking
                if (existingTrackingData.has(oracleId)) {
                    // Jika ada, periksa apakah checkpoin_id nya adalah 9.
                    // Data akan ditampilkan HANYA JIKA kondisinya true.
                    // (Menggunakan == 9 agar bisa menangani tipe data number atau string '9')
                    return existingTrackingData.get(oracleId) == 9;
                } else {
                    // Jika tidak ada, berarti ini data baru, jadi kita tampilkan.
                    return true;
                }
            });
            const mappingData = filteredData.map(row => {
                const oracleId = String(row.M_INOUT_ID);
                const checkpointId = existingTrackingData.get(oracleId) ?? 1;
                return {
                    m_inout_id: row.M_INOUT_ID,
                    documentno: row.DOCUMENTNO,
                    customer: row.CUSTOMER,
                    plantime: row.PLANTIME,
                    checkpoin_id: Number(checkpointId),
                }
            })

            // 6. Kembalikan data yang sudah difilter
            return {
                success: true,
                count: mappingData.length,
                data: mappingData,
            };

        } catch (error) {
            console.log(error);
            return { success: false, message: 'Server error' }
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeErr) {
                    console.log('Error closing Oracle connection:', closeErr);
                }
            }
            if (dbClient) {
                try {
                    dbClient.release();
                } catch (closeErr) {
                    console.log('Error releasing pg connection:', closeErr);
                }
            }
        }
    }

    async listDPKToDriver(server) {
        let connection;
        let dbClient;

        if (!server) {
            // Ini menggantikan blok 'default' pada switch
            return { success: false, message: "Unable connection db" };
        }

        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            const queryOracle = `
                SELECT
                    mi.M_INOUT_ID,
                    mi.DOCUMENTNO,
                    cb.NAME AS CUSTOMER,
                    TO_DATE(
					    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
					    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
					    'YYYY-MM-DD HH24:MI:SS'
					) AS PLANTIME
                FROM
                    M_INOUT mi
                    INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                    INNER JOIN C_ORDER co ON co.C_ORDER_ID = mi.C_ORDER_ID 
                WHERE
                    mi.MOVEMENTDATE >= TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') + 20
                    AND mi.DOCSTATUS = 'CO' AND ISSOTRX = 'Y' 
                    AND cb.ISSUBCONTRACT = 'N'
                    AND co.ISMILKRUN = 'N'
                    AND mi.ADW_TMS_ID IS NULL
                    ORDER BY mi.DOCUMENTNO DESC
                `;

            // Eksekusi query tanpa parameter
            const resultOracle = await connection.execute(queryOracle, [], {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });
            const oracleRows = resultOracle.rows || [];

            if (oracleRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            const queryPostgres = `SELECT m_inout_id, checkpoin_id FROM adw_trackingsj`;
            const resultPg = await dbClient.query(queryPostgres);

            const existingTrackingData = new Map(
                resultPg.rows.map(row => [String(row.m_inout_id), row.checkpoin_id])
            );

            const filteredData = oracleRows.filter(oracleRow => {
                const oracleId = String(oracleRow.M_INOUT_ID);

                // Hanya ambil yang ADA di adw_trackingsj dan checkpoint = 3
                return existingTrackingData.get(oracleId) == 3;
            });


            const mappingData = filteredData.map(row => {
                const oracleId = String(row.M_INOUT_ID);

                return {
                    m_inout_id: row.M_INOUT_ID,
                    documentno: row.DOCUMENTNO,
                    customer: row.CUSTOMER,
                    plantime: row.PLANTIME,
                    checkpoin_id: 3, // Karena filter sudah memastikan selalu 3
                };
            });

            return {
                success: true,
                count: mappingData.length,
                data: mappingData,
            };

        } catch (error) {
            console.log(error);
            return { success: false, message: 'Server error' }
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeErr) {
                    console.log('Error closing Oracle connection:', closeErr);
                }
            }
            if (dbClient) {
                try {
                    dbClient.release();
                } catch (closeErr) {
                    console.log('Error releasing pg connection:', closeErr);
                }
            }
        }
    }

    async processDeliveryToDPK(server, payload, userId) {
        const dbClient = await server.pg.connect();

        try {
            await dbClient.query('BEGIN');
            let result;

            let fromActor;
            let toActor;



            const { data } = payload;
            fromActor = 'Delivery';
            toActor = 'DPK';

            if (!data || !Array.isArray(data) || data.length === 0) {
                throw { statusCode: 400, message: 'Data is required for handover.' };
            }

            const validDestinations = ['DPK', 'MKT'];
            if (!validDestinations.includes(toActor)) {
                throw { statusCode: 400, message: `Invalid destination actor: ${toActor}.` };
            }

            // ============================================================
            // 1️⃣ Buat Handover Group SATU KALI SAJA
            // ============================================================


            // Ambil nomor sequence
            const seqRow = await dbClient.query(`SELECT nextval('adw_handover_group_seq') AS seq`);
            const seq = seqRow.rows[0].seq;

            const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
            const documentno = `HOPD${yymm}${String(seq).padStart(4, "0")}`;


            // Insert group
            const insertGroupQuery = `
                        INSERT INTO adw_handover_group (
                            createdby, documentno, checkpoint, notes
                        ) VALUES ($1, $2, $3, $4)
                        RETURNING adw_handover_group_id;
                    `;

            const groupRes = await dbClient.query(insertGroupQuery, [
                userId,
                documentno,
                '2',
                'ho delivery to dpk'
            ]);

            const groupId = groupRes.rows[0].adw_handover_group_id;
            if (!groupId) throw new Error("Failed to insert handover group");

            // ============================================================
            // 2️⃣ Loop setiap SJ → Insert Tracking → Insert pivot adw_group_sj
            // ============================================================

            let insertedCount = 0;

            for (const item of data) {

                // 2.1 INSERT TRACKING
                const insertTrackingQuery = `
                        INSERT INTO adw_trackingsj(
                            ad_client_id, ad_org_id, checkpoin_id, created, createdby,
                            isactive, m_inout_id, updated, updatedby, plantime, documentno
                        ) VALUES(
                            1000003, 1000003, '2', NOW(), $1, 
                            'Y', $2, NOW(), $1, $3, $4
                        )
                        RETURNING adw_trackingsj_id;
                    `;

                const trackingRes = await dbClient.query(insertTrackingQuery, [
                    userId,
                    item.m_inout_id,
                    item.plantime,
                    item.documentno
                ]);

                const newTrackingId = trackingRes.rows[0].adw_trackingsj_id;
                if (!newTrackingId) throw new Error("Failed to insert tracking");

                // 2.2 INSERT KE TABEL PIVOT adw_group_sj
                const insertPivotQuery = `
                            INSERT INTO adw_group_sj(
                                adw_handover_group_id,
                                adw_trackingsj_id,
                                checkpoint
                            ) VALUES ($1, $2, $3);
                        `;

                await dbClient.query(insertPivotQuery, [groupId, newTrackingId, '2']);

                // 2.3 INSERT EVENT
                const insertEventQuery = `
                        INSERT INTO adw_trackingsj_events(
                            ad_client_id, ad_org_id, ad_user_id,
                            adw_event_type, adw_from_actor, adw_to_actor,
                            adw_trackingsj_id, created, createdby, isactive,
                            updated, updatedby, checkpoin_id
                        ) VALUES(
                            1000003, 1000003, $1,
                            'HANDOVER', $2, $3,
                            $4, NOW(), $1, 'Y',
                            NOW(), $1, $5
                        );
                    `;

                await dbClient.query(insertEventQuery, [
                    userId,
                    fromActor,
                    toActor,
                    newTrackingId,
                    '2'
                ]);

                insertedCount++;
            }

            // ============================================================
            // 3️⃣ OUTPUT
            // ============================================================
            result = {
                handover_group_id: groupId,
                insertedCount,
                message: "Handover created successfully"
            };

            await dbClient.query('COMMIT');
            return result;

        } catch (error) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error("Transaction Error in toHandover:", error.message);
            throw error;
        } finally {
            if (dbClient) await dbClient.release();
        }
    }

    async processDPKToDriver(server, payload, userId) {
        const dbClient = await server.pg.connect();

        try {
            await dbClient.query('BEGIN');
            let result;

            const { data, driverId, tnkbId } = payload;

            if (!data || !Array.isArray(data) || data.length === 0) {
                throw { statusCode: 400, message: 'Data is required for handover.' };
            }

            const inoutIds = data.map(item => item.m_inout_id);

            // ============================================================
            // 1️⃣ Buat Handover Group (1 kali saja)
            // ============================================================

            const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
            const seq = seqRow.rows[0].seq;

            const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
            const documentno = `HODD${yymm}${String(seq).padStart(4, "0")}`;

            const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes
            ) VALUES ($1, $2, $3, $4)
            RETURNING adw_handover_group_id;
        `;

            const groupRes = await dbClient.query(insertGroupQuery, [
                userId,
                documentno,
                '4',
                'handover dpk ke driver'
            ]);

            const groupId = groupRes.rows[0].adw_handover_group_id;
            if (!groupId) throw new Error("Failed to insert handover group");

            // ============================================================
            // 2️⃣ UPDATE adw_trackingsj (checkpoint 3 → 4)
            // ============================================================

            const updateQuery = `
            UPDATE adw_trackingsj 
            SET
                checkpoin_id = $1,
                updated = NOW(),
                updatedby = $2,
                driverby = $4,
                tnkb_id = $5
            WHERE 
                m_inout_id = ANY($3::integer[])
                AND checkpoin_id = $6
            RETURNING adw_trackingsj_id, m_inout_id;
        `;

            const updateValues = [
                '4',        // pindah checkpoint ke 4
                userId,
                inoutIds,
                driverId,
                tnkbId,
                '3'         // hanya checkpoint 3
            ];

            const updateResult = await dbClient.query(updateQuery, updateValues);

            if (updateResult.rows.length === 0) {
                throw new Error('No items updated — wrong checkpoint or already processed.');
            }

            const updatedTracking = updateResult.rows;

            // ============================================================
            // 3️⃣ INSERT adw_group_sj + INSERT event per SJ
            // ============================================================

            for (const row of updatedTracking) {
                const trackingId = row.adw_trackingsj_id;

                // 3.1 Insert ke pivot adw_group_sj
                const insertPivotQuery = `
                INSERT INTO adw_group_sj (
                    adw_handover_group_id,
                    adw_trackingsj_id,
                    checkpoint
                ) VALUES ($1, $2, $3);
            `;

                await dbClient.query(insertPivotQuery, [
                    groupId,
                    trackingId,
                    '4'
                ]);

                // 3.2 Insert event
                const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, ad_user_id,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, createdby, isactive,
                    updated, updatedby, checkpoin_id
                ) VALUES(
                    1000003, 1000003, $1,
                    'HANDOVER', $2, $3,
                    $4, NOW(), $1, 'Y',
                    NOW(), $1, $5
                );
            `;

                await dbClient.query(insertEventQuery, [
                    userId,
                    'DPK',
                    'Driver',
                    trackingId,
                    '3' // checkpoint sebelumnya
                ]);
            }

            // ============================================================
            // 4️⃣ Response
            // ============================================================

            result = {
                handover_group_id: groupId,
                documentno,
                updatedCount: updatedTracking.length,
                message: `Successfully handed over ${updatedTracking.length} SJ to Driver`
            };

            await dbClient.query('COMMIT');
            return result;

        } catch (error) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error("Transaction Error in processDPKToDriver:", error.message);
            throw error;
        } finally {
            if (dbClient) await dbClient.release();
        }
    }


    async listCheckInCustomer(server) {
        let connection;
        let dbClient;

        if (!server) {
            return { success: false, message: "Unable connection db" };
        }

        try {
            dbClient = await server.pg.connect();
            connection = await oracleDB.openConnection();

            // -----------------------------------------------------------
            // 1. AMBIL DATA DARI POSTGRES DULU (Source of Truth Status)
            // -----------------------------------------------------------
            // Kita cari barang yang MEMANG sedang di Checkpoint 6
            const queryPostgres = `
            SELECT m_inout_id, checkpoin_id 
            FROM adw_trackingsj 
            WHERE checkpoin_id = '5' AND (trip_mode <> 'DO' OR trip_mode IS NULL)
        `;

            const resultPg = await dbClient.query(queryPostgres);
            const pgRows = resultPg.rows || [];

            if (pgRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // Ambil daftar ID-nya untuk di-query ke Oracle
            const mInoutIds = [...new Set(pgRows.map(row => row.m_inout_id))];

            // -----------------------------------------------------------
            // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
            // -----------------------------------------------------------

            // Kita buat parameter bind (:1, :2, dst)
            const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(',');

            const queryOracle = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
            FROM
                M_INOUT mi
                INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE
                mi.M_INOUT_ID IN (${bindVars})
            ORDER BY mi.DOCUMENTNO DESC
        `;

            // Eksekusi query dengan ID dari Postgres
            const resultOracle = await connection.execute(queryOracle, mInoutIds, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });

            const oracleRows = resultOracle.rows || [];

            // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
            const finalData = oracleRows.map(row => {
                return {
                    m_inout_id: row.M_INOUT_ID,
                    documentno: row.DOCUMENTNO,
                    customer: row.CUSTOMER,
                    plantime: row.PLANTIME,
                    checkpoin_id: 5,
                };
            });

            return {
                success: true,
                count: finalData.length,
                data: finalData,
            };

        } catch (error) {
            console.error("Error in listCheckInCustomer:", error);
            return { success: false, message: 'Server error' }
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) { console.error(e); }
            }
            if (dbClient) {
                try { await dbClient.release(); } catch (e) { console.error(e); }
            }
        }
    }

    async listCheckInCustomerDo(server) {
        let connection;
        let dbClient;

        if (!server) {
            return { success: false, message: "Unable connection db" };
        }

        try {
            dbClient = await server.pg.connect();
            connection = await oracleDB.openConnection();

            // -----------------------------------------------------------
            // 1. AMBIL DATA DARI POSTGRES DULU (Source of Truth Status)
            // -----------------------------------------------------------
            // Kita cari barang yang MEMANG sedang di Checkpoint 6
            const queryPostgres = `
            SELECT m_inout_id, checkpoin_id 
            FROM adw_trackingsj 
            WHERE checkpoin_id = '5' AND trip_mode = 'DO'
        `;

            const resultPg = await dbClient.query(queryPostgres);
            const pgRows = resultPg.rows || [];

            if (pgRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // Ambil daftar ID-nya untuk di-query ke Oracle
            const mInoutIds = [...new Set(pgRows.map(row => row.m_inout_id))];

            // -----------------------------------------------------------
            // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
            // -----------------------------------------------------------

            // Kita buat parameter bind (:1, :2, dst)
            const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(',');

            const queryOracle = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
            FROM
                M_INOUT mi
                INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE
                mi.M_INOUT_ID IN (${bindVars})
            ORDER BY mi.DOCUMENTNO DESC
        `;

            // Eksekusi query dengan ID dari Postgres
            const resultOracle = await connection.execute(queryOracle, mInoutIds, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });

            const oracleRows = resultOracle.rows || [];

            // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
            const finalData = oracleRows.map(row => {
                return {
                    m_inout_id: row.M_INOUT_ID,
                    documentno: row.DOCUMENTNO,
                    customer: row.CUSTOMER,
                    plantime: row.PLANTIME,
                    checkpoin_id: 6,
                };
            });

            return {
                success: true,
                count: finalData.length,
                data: finalData,
            };

        } catch (error) {
            console.error("Error in listCheckInCustomer:", error);
            return { success: false, message: 'Server error' }
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) { console.error(e); }
            }
            if (dbClient) {
                try { await dbClient.release(); } catch (e) { console.error(e); }
            }
        }
    }

    async processDriverToCustomer(server, payload, userId) {
        const dbClient = await server.pg.connect();

        try {
            await dbClient.query('BEGIN');

            let result;

            const { data, driverId, tnkbId, tripMode } = payload;

            if (!data || !Array.isArray(data) || data.length === 0) {
                throw { statusCode: 400, message: 'Data is required for handover.' };
            }

            const mode = tripMode === "DO" ? "DO" : "RT";


            const inoutIds = data.map(item => item.m_inout_id);

            if (mode === "DO") {

                const updateTripMode = `
                UPDATE adw_trackingsj
                SET trip_mode = 'DO',
                    updated = NOW(),
                    updatedby = $1
                WHERE m_inout_id = ANY($2::int[])
                RETURNING adw_trackingsj_id, m_inout_id, trip_mode;
            `;

                const res = await dbClient.query(updateTripMode, [
                    userId,
                    inoutIds
                ]);

                await dbClient.query('COMMIT');

                return {
                    updatedCount: res.rows.length,
                    message: `Trip mode DO updated for ${res.rows.length} SJ`
                };
            }

            const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
            const seq = seqRow.rows[0].seq;

            const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
            const documentno = `HIDD${yymm}${String(seq).padStart(4, "0")}`;

            const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes
            ) VALUES ($1, $2, $3, $4)
            RETURNING adw_handover_group_id;
        `;

            const groupRes = await dbClient.query(insertGroupQuery, [
                userId,
                documentno,
                '6',
                'handover driver ke dpk'
            ]);

            const groupId = groupRes.rows[0].adw_handover_group_id;
            if (!groupId) throw new Error("Failed to insert handover group");

            // ============================================================
            // 2️⃣ UPDATE adw_trackingsj (checkpoint 3 → 4)
            // ============================================================

            const updateQuery = `
            UPDATE adw_trackingsj 
            SET
                checkpoin_id = $1,
                updated = NOW(),
                updatedby = $2,
                driverby = $4,
                tnkb_id = $5,
                trip_mode = 'RT'
            WHERE 
                m_inout_id = ANY($3::integer[])
                AND checkpoin_id = $6
            RETURNING adw_trackingsj_id, m_inout_id;
        `;

            const updateValues = [
                '6',        // pindah checkpoint ke 6
                userId,
                inoutIds,
                driverId,
                tnkbId,
                '5'         // hanya checkpoint 5
            ];

            const updateResult = await dbClient.query(updateQuery, updateValues);

            if (updateResult.rows.length === 0) {
                throw new Error('No items updated — wrong checkpoint or already processed.');
            }

            const updatedTracking = updateResult.rows;

            // ============================================================
            // 3️⃣ INSERT adw_group_sj + INSERT event per SJ
            // ============================================================

            for (const row of updatedTracking) {
                const trackingId = row.adw_trackingsj_id;

                // 3.1 Insert ke pivot adw_group_sj
                const insertPivotQuery = `
                INSERT INTO adw_group_sj (
                    adw_handover_group_id,
                    adw_trackingsj_id,
                    checkpoint
                ) VALUES ($1, $2, $3);
            `;

                await dbClient.query(insertPivotQuery, [
                    groupId,
                    trackingId,
                    '5'
                ]);

                // 3.2 Insert event
                const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, ad_user_id,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, createdby, isactive,
                    updated, updatedby, checkpoin_id
                ) VALUES(
                    1000003, 1000003, $1,
                    'HANDOVER', $2, $3,
                    $4, NOW(), $1, 'Y',
                    NOW(), $1, $5
                );
            `;

                await dbClient.query(insertEventQuery, [
                    userId,
                    'Driver',
                    'Customer Auto DPK',
                    trackingId,
                    '5' // checkpoint sebelumnya
                ]);
            }

            // ============================================================
            // 4️⃣ Response
            // ============================================================

            result = {
                handover_group_id: groupId,
                documentno,
                updatedCount: updatedTracking.length,
                message: `Successfully handed over ${updatedTracking.length} SJ to Driver`
            };

            await dbClient.query('COMMIT');
            return result;

        } catch (error) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error("Transaction Error in processDPKToDriver:", error.message);
            throw error;
        } finally {
            if (dbClient) await dbClient.release();
        }
    }

    async processDriverToCustomerDo(server, payload, userId) {
        const dbClient = await server.pg.connect();

        try {
            await dbClient.query('BEGIN');

            let result;

            const { data, driverId, tnkbId } = payload;

            if (!data || !Array.isArray(data) || data.length === 0) {
                throw { statusCode: 400, message: 'Data is required for handover.' };
            }


            const inoutIds = data.map(item => item.m_inout_id);

            const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
            const seq = seqRow.rows[0].seq;

            const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
            const documentno = `HIDD${yymm}${String(seq).padStart(4, "0")}`;

            const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes
            ) VALUES ($1, $2, $3, $4)
            RETURNING adw_handover_group_id;
        `;

            const groupRes = await dbClient.query(insertGroupQuery, [
                userId,
                documentno,
                '6',
                'handover driver ke dpk'
            ]);

            const groupId = groupRes.rows[0].adw_handover_group_id;
            if (!groupId) throw new Error("Failed to insert handover group");

            // ============================================================
            // 2️⃣ UPDATE adw_trackingsj (checkpoint 3 → 4)
            // ============================================================

            const updateQuery = `
            UPDATE adw_trackingsj 
            SET
                checkpoin_id = $1,
                updated = NOW(),
                updatedby = $2,
                driverby = $4,
                tnkb_id = $5,
                trip_mode = 'RT'
            WHERE 
                m_inout_id = ANY($3::integer[])
                AND checkpoin_id = $6
            RETURNING adw_trackingsj_id, m_inout_id;
        `;

            const updateValues = [
                '6',        // pindah checkpoint ke 6
                userId,
                inoutIds,
                driverId,
                tnkbId,
                '5'         // hanya checkpoint 5
            ];

            const updateResult = await dbClient.query(updateQuery, updateValues);

            if (updateResult.rows.length === 0) {
                throw new Error('No items updated — wrong checkpoint or already processed.');
            }

            const updatedTracking = updateResult.rows;

            // ============================================================
            // 3️⃣ INSERT adw_group_sj + INSERT event per SJ
            // ============================================================

            for (const row of updatedTracking) {
                const trackingId = row.adw_trackingsj_id;

                // 3.1 Insert ke pivot adw_group_sj
                const insertPivotQuery = `
                INSERT INTO adw_group_sj (
                    adw_handover_group_id,
                    adw_trackingsj_id,
                    checkpoint
                ) VALUES ($1, $2, $3);
            `;

                await dbClient.query(insertPivotQuery, [
                    groupId,
                    trackingId,
                    '5'
                ]);

                // 3.2 Insert event
                const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, ad_user_id,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, createdby, isactive,
                    updated, updatedby, checkpoin_id
                ) VALUES(
                    1000003, 1000003, $1,
                    'HANDOVER', $2, $3,
                    $4, NOW(), $1, 'Y',
                    NOW(), $1, $5
                );
            `;

                await dbClient.query(insertEventQuery, [
                    userId,
                    'Driver',
                    'Customer Auto DPK',
                    trackingId,
                    '5' // checkpoint sebelumnya
                ]);
            }

            // ============================================================
            // 4️⃣ Response
            // ============================================================

            result = {
                handover_group_id: groupId,
                documentno,
                updatedCount: updatedTracking.length,
                message: `Successfully handed over ${updatedTracking.length} SJ to Driver`
            };

            await dbClient.query('COMMIT');
            return result;

        } catch (error) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error("Transaction Error in processDPKToDriver:", error.message);
            throw error;
        } finally {
            if (dbClient) await dbClient.release();
        }
    }

    async listDPKToDelivery(server) {
        let connection;
        let dbClient;

        if (!server) {
            return { success: false, message: "Unable connection db" };
        }

        try {
            dbClient = await server.pg.connect();
            connection = await oracleDB.openConnection();

            // -----------------------------------------------------------
            // 1. AMBIL DATA DARI POSTGRES DULU (Source of Truth Status)
            // -----------------------------------------------------------
            // Kita cari barang yang MEMANG sedang di Checkpoint 6
            const queryPostgres = `
            SELECT m_inout_id, checkpoin_id 
            FROM adw_trackingsj 
            WHERE checkpoin_id = '7'
        `;

            const resultPg = await dbClient.query(queryPostgres);
            const pgRows = resultPg.rows || [];

            if (pgRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // Ambil daftar ID-nya untuk di-query ke Oracle
            const mInoutIds = [...new Set(pgRows.map(row => row.m_inout_id))];

            // -----------------------------------------------------------
            // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
            // -----------------------------------------------------------

            // Kita buat parameter bind (:1, :2, dst)
            const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(',');

            const queryOracle = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
            FROM
                M_INOUT mi
                INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE
                mi.M_INOUT_ID IN (${bindVars})
            ORDER BY mi.DOCUMENTNO DESC
        `;

            // Eksekusi query dengan ID dari Postgres
            const resultOracle = await connection.execute(queryOracle, mInoutIds, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });

            const oracleRows = resultOracle.rows || [];

            // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
            const finalData = oracleRows.map(row => {
                return {
                    m_inout_id: row.M_INOUT_ID,
                    documentno: row.DOCUMENTNO,
                    customer: row.CUSTOMER,
                    plantime: row.PLANTIME,
                    checkpoin_id: 7,
                };
            });

            return {
                success: true,
                count: finalData.length,
                data: finalData,
            };

        } catch (error) {
            console.error("Error in listCheckInCustomer:", error);
            return { success: false, message: 'Server error' }
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) { console.error(e); }
            }
            if (dbClient) {
                try { await dbClient.release(); } catch (e) { console.error(e); }
            }
        }
    }

    async processDPKToDelivery(server, payload, userId) {
        const dbClient = await server.pg.connect();

        try {
            await dbClient.query('BEGIN');

            let result;

            const { data } = payload;

            if (!data || !Array.isArray(data) || data.length === 0) {
                throw { statusCode: 400, message: 'Data is required for handover.' };
            }


            const inoutIds = data.map(item => item.m_inout_id);


            const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
            const seq = seqRow.rows[0].seq;

            const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
            const documentno = `HIDP${yymm}${String(seq).padStart(4, "0")}`;

            const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes
            ) VALUES ($1, $2, $3, $4)
            RETURNING adw_handover_group_id;
        `;

            const groupRes = await dbClient.query(insertGroupQuery, [
                userId,
                documentno,
                '8',
                'handover dpk ke delivery'
            ]);

            const groupId = groupRes.rows[0].adw_handover_group_id;
            if (!groupId) throw new Error("Failed to insert handover group");

            // ============================================================
            // 2️⃣ UPDATE adw_trackingsj (checkpoint 3 → 4)
            // ============================================================

            const updateQuery = `
            UPDATE adw_trackingsj 
            SET
                checkpoin_id = $1,
                updated = NOW(),
                updatedby = $2,
                trip_mode = 'RT'
            WHERE 
                m_inout_id = ANY($3::integer[])
                AND checkpoin_id = $4
            RETURNING adw_trackingsj_id, m_inout_id;
        `;

            const updateValues = [
                '8',        // pindah checkpoint ke 8
                userId,
                inoutIds,
                '7'         // hanya checkpoint 7
            ];

            const updateResult = await dbClient.query(updateQuery, updateValues);

            if (updateResult.rows.length === 0) {
                throw new Error('No items updated — wrong checkpoint or already processed.');
            }

            const updatedTracking = updateResult.rows;

            // ============================================================
            // 3️⃣ INSERT adw_group_sj + INSERT event per SJ
            // ============================================================

            for (const row of updatedTracking) {
                const trackingId = row.adw_trackingsj_id;

                // 3.1 Insert ke pivot adw_group_sj
                const insertPivotQuery = `
                INSERT INTO adw_group_sj (
                    adw_handover_group_id,
                    adw_trackingsj_id,
                    checkpoint
                ) VALUES ($1, $2, $3);
            `;

                await dbClient.query(insertPivotQuery, [
                    groupId,
                    trackingId,
                    '7'
                ]);

                // 3.2 Insert event
                const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, ad_user_id,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, createdby, isactive,
                    updated, updatedby, checkpoin_id
                ) VALUES(
                    1000003, 1000003, $1,
                    'HANDOVER', $2, $3,
                    $4, NOW(), $1, 'Y',
                    NOW(), $1, $5
                );
            `;

                await dbClient.query(insertEventQuery, [
                    userId,
                    'DPK',
                    'Delivery',
                    trackingId,
                    '7' // checkpoint sebelumnya
                ]);
            }

            // ============================================================
            // 4️⃣ Response
            // ============================================================

            result = {
                handover_group_id: groupId,
                documentno,
                updatedCount: updatedTracking.length,
                message: `Successfully handed over ${updatedTracking.length} SJ to Driver`
            };

            await dbClient.query('COMMIT');
            return result;

        } catch (error) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error("Transaction Error in processDPKToDriver:", error.message);
            throw error;
        } finally {
            if (dbClient) await dbClient.release();
        }
    }

    async listDeliveryToMKT(server) {
        let connection;
        let dbClient;

        if (!server) {
            return { success: false, message: "Unable connection db" };
        }

        try {
            dbClient = await server.pg.connect();
            connection = await oracleDB.openConnection();

            // -----------------------------------------------------------
            // 1. AMBIL DATA DARI POSTGRES DULU (Source of Truth Status)
            // -----------------------------------------------------------
            // Kita cari barang yang MEMANG sedang di Checkpoint 6
            const queryPostgres = `
            SELECT m_inout_id, checkpoin_id 
            FROM adw_trackingsj 
            WHERE checkpoin_id = '9'
        `;

            const resultPg = await dbClient.query(queryPostgres);
            const pgRows = resultPg.rows || [];

            if (pgRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // Ambil daftar ID-nya untuk di-query ke Oracle
            const mInoutIds = [...new Set(pgRows.map(row => row.m_inout_id))];

            // -----------------------------------------------------------
            // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
            // -----------------------------------------------------------

            // Kita buat parameter bind (:1, :2, dst)
            const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(',');

            const queryOracle = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
            FROM
                M_INOUT mi
                INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE
                mi.M_INOUT_ID IN (${bindVars})
            ORDER BY mi.DOCUMENTNO DESC
        `;

            // Eksekusi query dengan ID dari Postgres
            const resultOracle = await connection.execute(queryOracle, mInoutIds, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });

            const oracleRows = resultOracle.rows || [];

            // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
            const finalData = oracleRows.map(row => {
                return {
                    m_inout_id: row.M_INOUT_ID,
                    documentno: row.DOCUMENTNO,
                    customer: row.CUSTOMER,
                    plantime: row.PLANTIME,
                    checkpoin_id: 9,
                };
            });

            return {
                success: true,
                count: finalData.length,
                data: finalData,
            };

        } catch (error) {
            console.error("Error in listCheckInCustomer:", error);
            return { success: false, message: 'Server error' }
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) { console.error(e); }
            }
            if (dbClient) {
                try { await dbClient.release(); } catch (e) { console.error(e); }
            }
        }
    }

    async processDeliveryToMKT(server, payload, userId) {
        const dbClient = await server.pg.connect();

        try {
            await dbClient.query('BEGIN');

            let result;

            const { data } = payload;

            if (!data || !Array.isArray(data) || data.length === 0) {
                throw { statusCode: 400, message: 'Data is required for handover.' };
            }


            const inoutIds = data.map(item => item.m_inout_id);


            const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
            const seq = seqRow.rows[0].seq;

            const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
            const documentno = `HIPM${yymm}${String(seq).padStart(4, "0")}`;

            const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes
            ) VALUES ($1, $2, $3, $4)
            RETURNING adw_handover_group_id;
        `;

            const groupRes = await dbClient.query(insertGroupQuery, [
                userId,
                documentno,
                '10',
                'handover delivery ke mkt'
            ]);

            const groupId = groupRes.rows[0].adw_handover_group_id;
            if (!groupId) throw new Error("Failed to insert handover group");

            // ============================================================
            // 2️⃣ UPDATE adw_trackingsj (checkpoint 3 → 4)
            // ============================================================

            const updateQuery = `
            UPDATE adw_trackingsj 
            SET
                checkpoin_id = $1,
                updated = NOW(),
                updatedby = $2,
                trip_mode = 'RT'
            WHERE 
                m_inout_id = ANY($3::integer[])
                AND checkpoin_id = $4
            RETURNING adw_trackingsj_id, m_inout_id;
        `;

            const updateValues = [
                '10',        // pindah checkpoint ke 10
                userId,
                inoutIds,
                '9'         // hanya checkpoint 9
            ];

            const updateResult = await dbClient.query(updateQuery, updateValues);

            if (updateResult.rows.length === 0) {
                throw new Error('No items updated — wrong checkpoint or already processed.');
            }

            const updatedTracking = updateResult.rows;

            // ============================================================
            // 3️⃣ INSERT adw_group_sj + INSERT event per SJ
            // ============================================================

            for (const row of updatedTracking) {
                const trackingId = row.adw_trackingsj_id;

                // 3.1 Insert ke pivot adw_group_sj
                const insertPivotQuery = `
                INSERT INTO adw_group_sj (
                    adw_handover_group_id,
                    adw_trackingsj_id,
                    checkpoint
                ) VALUES ($1, $2, $3);
            `;

                await dbClient.query(insertPivotQuery, [
                    groupId,
                    trackingId,
                    '9'
                ]);

                // 3.2 Insert event
                const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, ad_user_id,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, createdby, isactive,
                    updated, updatedby, checkpoin_id
                ) VALUES(
                    1000003, 1000003, $1,
                    'HANDOVER', $2, $3,
                    $4, NOW(), $1, 'Y',
                    NOW(), $1, $5
                );
            `;

                await dbClient.query(insertEventQuery, [
                    userId,
                    'Delivery',
                    'MKT',
                    trackingId,
                    '9' // checkpoint sebelumnya
                ]);
            }

            // ============================================================
            // 4️⃣ Response
            // ============================================================

            result = {
                handover_group_id: groupId,
                documentno,
                updatedCount: updatedTracking.length,
                message: `Successfully handed over ${updatedTracking.length} SJ to MKT`
            };

            await dbClient.query('COMMIT');
            return result;

        } catch (error) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error("Transaction Error in processDPKToDriver:", error.message);
            throw error;
        } finally {
            if (dbClient) await dbClient.release();
        }
    }

    async listMKTToFAT(server) {
        let connection;
        let dbClient;

        if (!server) {
            return { success: false, message: "Unable connection db" };
        }

        try {
            dbClient = await server.pg.connect();
            connection = await oracleDB.openConnection();

            // -----------------------------------------------------------
            // 1. AMBIL DATA DARI POSTGRES DULU (Source of Truth Status)
            // -----------------------------------------------------------
            // Kita cari barang yang MEMANG sedang di Checkpoint 6
            const queryPostgres = `
            SELECT m_inout_id, checkpoin_id 
            FROM adw_trackingsj 
            WHERE checkpoin_id = '11'
        `;

            const resultPg = await dbClient.query(queryPostgres);
            const pgRows = resultPg.rows || [];

            if (pgRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // Ambil daftar ID-nya untuk di-query ke Oracle
            const mInoutIds = [...new Set(pgRows.map(row => row.m_inout_id))];

            // -----------------------------------------------------------
            // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
            // -----------------------------------------------------------

            // Kita buat parameter bind (:1, :2, dst)
            const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(',');

            const queryOracle = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
            FROM
                M_INOUT mi
                INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE
                mi.M_INOUT_ID IN (${bindVars})
            ORDER BY mi.DOCUMENTNO DESC
        `;

            // Eksekusi query dengan ID dari Postgres
            const resultOracle = await connection.execute(queryOracle, mInoutIds, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });

            const oracleRows = resultOracle.rows || [];

            // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
            const finalData = oracleRows.map(row => {
                return {
                    m_inout_id: row.M_INOUT_ID,
                    documentno: row.DOCUMENTNO,
                    customer: row.CUSTOMER,
                    plantime: row.PLANTIME,
                    checkpoin_id: 9,
                };
            });

            return {
                success: true,
                count: finalData.length,
                data: finalData,
            };

        } catch (error) {
            console.error("Error in listCheckInCustomer:", error);
            return { success: false, message: 'Server error' }
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) { console.error(e); }
            }
            if (dbClient) {
                try { await dbClient.release(); } catch (e) { console.error(e); }
            }
        }
    }

    async processMKTToFAT(server, payload, userId) {
        const dbClient = await server.pg.connect();

        try {
            await dbClient.query('BEGIN');

            let result;

            const { data } = payload;

            if (!data || !Array.isArray(data) || data.length === 0) {
                throw { statusCode: 400, message: 'Data is required for handover.' };
            }


            const inoutIds = data.map(item => item.m_inout_id);


            const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
            const seq = seqRow.rows[0].seq;

            const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
            const documentno = `HIMF${yymm}${String(seq).padStart(4, "0")}`;

            const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes
            ) VALUES ($1, $2, $3, $4)
            RETURNING adw_handover_group_id;
        `;

            const groupRes = await dbClient.query(insertGroupQuery, [
                userId,
                documentno,
                '12',
                'handover mkt ke fat'
            ]);

            const groupId = groupRes.rows[0].adw_handover_group_id;
            if (!groupId) throw new Error("Failed to insert handover group");

            // ============================================================
            // 2️⃣ UPDATE adw_trackingsj (checkpoint 3 → 4)
            // ============================================================

            const updateQuery = `
            UPDATE adw_trackingsj 
            SET
                checkpoin_id = $1,
                updated = NOW(),
                updatedby = $2,
                trip_mode = 'RT'
            WHERE 
                m_inout_id = ANY($3::integer[])
                AND checkpoin_id = $4
            RETURNING adw_trackingsj_id, m_inout_id;
        `;

            const updateValues = [
                '12',        // pindah checkpoint ke 12
                userId,
                inoutIds,
                '11'         // hanya checkpoint 11
            ];

            const updateResult = await dbClient.query(updateQuery, updateValues);

            if (updateResult.rows.length === 0) {
                throw new Error('No items updated — wrong checkpoint or already processed.');
            }

            const updatedTracking = updateResult.rows;

            // ============================================================
            // 3️⃣ INSERT adw_group_sj + INSERT event per SJ
            // ============================================================

            for (const row of updatedTracking) {
                const trackingId = row.adw_trackingsj_id;

                // 3.1 Insert ke pivot adw_group_sj
                const insertPivotQuery = `
                INSERT INTO adw_group_sj (
                    adw_handover_group_id,
                    adw_trackingsj_id,
                    checkpoint
                ) VALUES ($1, $2, $3);
            `;

                await dbClient.query(insertPivotQuery, [
                    groupId,
                    trackingId,
                    '11'
                ]);

                // 3.2 Insert event
                const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, ad_user_id,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, createdby, isactive,
                    updated, updatedby, checkpoin_id
                ) VALUES(
                    1000003, 1000003, $1,
                    'HANDOVER', $2, $3,
                    $4, NOW(), $1, 'Y',
                    NOW(), $1, $5
                );
            `;

                await dbClient.query(insertEventQuery, [
                    userId,
                    'MKT',
                    'FAT',
                    trackingId,
                    '11' // checkpoint sebelumnya
                ]);
            }

            // ============================================================
            // 4️⃣ Response
            // ============================================================

            result = {
                handover_group_id: groupId,
                documentno,
                updatedCount: updatedTracking.length,
                message: `Successfully handed over ${updatedTracking.length} SJ to MKT`
            };

            await dbClient.query('COMMIT');
            return result;

        } catch (error) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error("Transaction Error in processDPKToDriver:", error.message);
            throw error;
        } finally {
            if (dbClient) await dbClient.release();
        }
    }
}


async function handover(fastify, opts) {
    fastify.decorate('handover', new Handover());
    fastify.register(autoload, {
        dir: join(import.meta.url, 'routes'),
        options: {
            prefix: opts.prefix
        }
    })
}

export default fp(handover)