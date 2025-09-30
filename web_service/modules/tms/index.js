import fp from 'fastify-plugin'
import autoload from '@fastify/autoload'
import { join } from 'desm'
import oracleDB from "../../configs/dbOracle.js";

const ROLE_CONFIGS = {
    dpk: {
        columnDateHandovered: 'created',
        columnDateAccepted: 'accepteddpk',
        columnYesNo: 'acceptedbydpk',
        columnCheckpointReceipt: ['2', '6'],
        columnCheckpointHandover: ['3', '7'],
    },
    driver: {
        columnDateHandovered: 'accepteddriver',
        columnDateAccepted: 'accepteddriver',
        columnYesNo: 'acceptedbydriver',
        columnCheckpointReceipt: ['4'],
        columnCheckpointHandover: ['5'],
    },
    delivery: {
        columnDateHandovered: 'accepteddelivery',
        columnDateAccepted: 'accepteddelivery',
        columnYesNo: 'acceptedbydelivery',
        columnCheckpoint: '3',
        columnCheckpointReceipt: ['8']
    },
    marketing: {
        columnDateHandovered: 'acceptedmkt',
        columnDateAccepted: 'acceptedmkt',
        columnYesNo: 'acceptedbymkt',
        columnCheckpoint: '4',
        columnCheckpointReceipt: ['10'],
        columnCheckpointHandover: ['11'],
    },
    fat: {
        columnDateHandovered: 'acceptedfat',
        columnDateAccepted: 'acceptedfat',
        columnYesNo: 'acceptedbyfat',
        columnCheckpoint: '5',
        columnCheckpointReceipt: ['12']
    }
};

const CHECKPOINT_WORKFLOWS = {
    // Kunci '2' artinya: "Ketika sebuah item berada di checkpoint 2..."
    '2': {
        actor: 'DPK',             // ...maka AKTOR yang melakukan penerimaan adalah DPK.
        fromActor: 'Delivery',    // Item ini diterima DARI Delivery.
        nextCheckpoint: '3'       // Setelah diterima, statusnya berubah menjadi checkpoint 3.
    },
    // Kunci '3' artinya: "Ketika sebuah item berada di checkpoint 3..."
    '3': {
        actor: 'Driver',          // ...maka AKTOR yang melakukan penerimaan adalah Driver.
        fromActor: 'DPK',         // Item ini diterima DARI DPK.
        nextCheckpoint: '4'       // Setelah diterima, statusnya berubah menjadi checkpoint 4.
    },
    '4': {
        actor: 'Driver',
        fromActor: 'DPK',
        nextCheckpoint: '5'
    },
    '5': {
        actor: 'DPK',
        fromActor: 'Driver',
        nextCheckpoint: '6'
    },
    '6': {
        actor: 'DPK',
        fromActor: 'Driver',
        nextCheckpoint: '7'
    },
    '7': {
        actor: 'Delivery',
        fromActor: 'DPK',
        nextCheckpoint: '8'
    },
    '8': {
        actor: 'Delivery',
        fromActor: 'DPK',
        nextCheckpoint: '9'
    },
    '9': {
        actor: 'Marketing',
        fromActor: 'Delivery',
        nextCheckpoint: '10'
    },
    '10': {
        actor: 'Marketing',
        fromActor: 'Delivery',
        nextCheckpoint: '11'
    },
    '11': {
        actor: 'FAT',
        fromActor: 'Marketing',
        nextCheckpoint: '12'
    },
    '12': {
        actor: 'FAT',
        fromActor: 'Marketing',
        nextCheckpoint: '13'
    }
};

class TMS {

    async getDrivers() {
        let connection;
        try {
            connection = await oracleDB.openConnection();


            const queryGetDrivers = `SELECT AD_USER_ID, NAME FROM AD_USER au WHERE TITLE = 'driver'`;

            const resultGetDrivers = await connection.execute(queryGetDrivers, {}, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });
            const resultRows = resultGetDrivers.rows || [];


            return resultRows;

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
        }
    }

    async getTnkbs() {
        let connection;
        try {
            connection = await oracleDB.openConnection();


            const queryGetTnkbs = `SELECT ADW_TMS_TNKB_ID, MIN(NAME) AS NAME FROM ADW_TMS_TNKB GROUP BY ADW_TMS_TNKB_ID`;

            const resultGetTnbs = await connection.execute(queryGetTnkbs, {}, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });
            const resultRows = resultGetTnbs.rows || [];


            return resultRows;

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
        }
    }

    async getReceipt(server, role) {
        let connection;
        let dbClient;

        const configRole = ROLE_CONFIGS[role];

        if (!configRole) {
            // Ini menggantikan blok 'default' pada switch
            return { success: false, message: `Invalid or unsupported role: ${role}` };
        }

        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            const queryPostgres = `
                SELECT 
                    m_inout_id,
                    adw_trackingsj_id, 
                    checkpoin_id
            FROM adw_trackingsj WHERE checkpoin_id = ANY($1:: varchar[])
            ORDER BY documentno DESC`;
            // FROM adw_trackingsj WHERE checkpoin_id = $1`;

            const values = [configRole.columnCheckpointReceipt];

            const resultPg = await dbClient.query(queryPostgres, values);
            const postgresRows = resultPg.rows || [];

            // Langsung selesaikan jika tidak ada data dari PostgreSQL
            if (postgresRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // 3. Kumpulkan semua m_inout_id dari hasil PostgreSQL untuk query ke Oracle
            const inoutIds = postgresRows.map(row => row.m_inout_id);

            // 4. Query ke Oracle untuk mengambil data pelengkap (DOCUMENTNO dan PLANTIME)
            // Menggunakan klausa WHERE IN (...) agar lebih efisien
            const queryOracle = `
            SELECT
            M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                --gabungan tanggal dari MOVEMENTDATE + jam dari PLANTIME
            TO_DATE(
                TO_CHAR(MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(PLANTIME, 'HH24:MI:SS'),
                'YYYY-MM-DD HH24:MI:SS'
            ) AS PLANTIME
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE 
                M_INOUT_ID IN(${inoutIds.map((_, i) => `:${i + 1}`).join(',')})
            ORDER BY mi.DOCUMENTNO DESC
                
        `;

            const resultOracle = await connection.execute(queryOracle, inoutIds, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });
            const oracleRows = resultOracle.rows || [];

            // 5. Gabungkan data: Jadikan data Oracle sebagai lookup map untuk performa cepat
            const oracleDataMap = new Map(
                oracleRows.map(row => [String(row.M_INOUT_ID), row])
            );

            // 6. Iterasi hasil PostgreSQL dan tambahkan data dari Oracle
            const combinedData = postgresRows.map(pgRow => {
                const oracleData = oracleDataMap.get(String(pgRow.m_inout_id));

                return {
                    ...pgRow, // Ambil semua kolom dari PostgreSQL
                    documentno: oracleData ? oracleData.DOCUMENTNO : 'N/A', // Tambahkan DOCUMENTNO
                    customer: oracleData ? oracleData.CUSTOMER : 'N/A',
                    plantime: oracleData ? oracleData.PLANTIME : null,       // Tambahkan PLANTIME
                    // Anda bisa menambahkan kolom lain dari Oracle di sini jika perlu
                };
            });

            // 7. Kembalikan data yang sudah digabungkan
            return {
                success: true,
                count: combinedData.length,
                data: combinedData,
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

    async setAccepted(server, data, userId, checkpoint) {
        let dbClient;

        // 1. Dapatkan aturan alur kerja berdasarkan checkpoint yang masuk
        const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

        // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
        if (!workflow) {
            return { success: false, message: `No acceptance workflow defined for checkpoint: ${checkpoint}` };
        }

        try {
            dbClient = await server.pg.connect();
            await dbClient.query('BEGIN');

            const updatedRows = [];

            // Loop ini sekarang berada di luar switch, menghindari duplikasi
            for (const item of data) {
                const { m_inout_id } = item;

                // 2. Query UPDATE menjadi sepenuhnya dinamis berdasarkan konfigurasi
                const updateQuery = `
                UPDATE adw_trackingsj
                SET
                    updated = NOW(),
                    updatedby = $1,
                    checkpoin_id = $2   -- -> Gunakan 'nextCheckpoint' dari config
                WHERE
                    m_inout_id = $3        
                    AND checkpoin_id = $4   -- -> Gunakan 'checkpoint' dari parameter
                RETURNING adw_trackingsj_id, m_inout_id;
            `;
                const updateValues = [
                    userId,
                    workflow.nextCheckpoint, // checkpoint baru
                    m_inout_id,
                    checkpoint      // checkpoint saat ini
                ];

                const updateResult = await dbClient.query(updateQuery, updateValues);

                if (updateResult.rows.length > 0) {
                    const updatedRow = updateResult.rows[0];
                    updatedRows.push(updatedRow);

                    const trackingSjId = updatedRow.adw_trackingsj_id;

                    // 3. Query INSERT EVENT juga sepenuhnya dinamis
                    const insertEventQuery = `
                    INSERT INTO adw_trackingsj_events(
                        ad_client_id, ad_org_id, ad_user_id,
                        adw_event_type, adw_from_actor, adw_to_actor,
                        adw_trackingsj_id, created, createdby, isactive,
                        updated, updatedby, checkpoin_id
                    ) VALUES(
                        1000003, 1000003, $1, 'ACCEPTANCE',
                        $2, $3, $4,  -- from_actor, to_actor, tracking_id
                        NOW(), $1, 'Y', NOW(), $1, $5
                    );
                `;
                    const eventValues = [
                        userId,
                        workflow.fromActor, // Aktor sebelumnya
                        workflow.actor,     // Aktor yang menerima saat ini
                        trackingSjId,
                        checkpoint
                    ];

                    await dbClient.query(insertEventQuery, eventValues);

                } else {
                    console.warn(`No record found to update for M_INOUT_ID: ${m_inout_id} with checkpoint '${checkpoint}'. It might have been processed already.`);
                }
            }

            await dbClient.query('COMMIT');
            return { success: true, rows: updatedRows, message: `${workflow.actor} accepted successfully!` };

        } catch (error) {
            if (dbClient) {
                await dbClient.query('ROLLBACK');
            }
            console.error('Server error during accept:', error);
            return { success: false, message: 'Server error during accept process.' };
        } finally {
            if (dbClient) {
                dbClient.release();
            }
        }
    }

    async listHandover(server, role) {
        let connection;
        let dbClient;

        const configRole = ROLE_CONFIGS[role];

        if (!configRole) {
            // Ini menggantikan blok 'default' pada switch
            return { success: false, message: `Invalid or unsupported role: ${role} ` };
        }

        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            // --- ALUR 1: Logika Khusus dan Independen untuk 'delivery' ---
            if (role === 'delivery') {
                const queryOracle = `
                        SELECT
                        mi.M_INOUT_ID,
                            mi.DOCUMENTNO,
                            cb.NAME AS CUSTOMER,
                                TO_DATE(
                                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                                    'YYYY-MM-DD HH24:MI:SS'
                                ) AS PLANTIME
                        FROM
                                M_INOUT mi
                            INNER JOIN
                                C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                        WHERE
                        mi.MOVEMENTDATE = DATE '2025-08-19'
                                AND mi.DOCSTATUS = 'CO' AND ISSOTRX = 'Y' 
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
            }


            const queryPostgres = `
            SELECT *
                FROM adw_trackingsj 
                    WHERE checkpoin_id = ANY($1:: varchar[])
                ORDER BY documentno DESC`;
            const values = [configRole.columnCheckpointHandover];
            const resultPg = await dbClient.query(queryPostgres, values);
            const postgresRows = resultPg.rows || [];

            if (postgresRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            const inoutIds = postgresRows.map(row => row.m_inout_id);

            const queryOracle = `
            SELECT
            mi.M_INOUT_ID, mi.DOCUMENTNO, cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
                    FROM M_INOUT mi
                    INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                    WHERE mi.M_INOUT_ID IN(${inoutIds.map((_, i) => `:${i + 1}`).join(',')})
                ORDER BY mi.DOCUMENTNO DESC
                `;

            const resultOracle = await connection.execute(queryOracle, inoutIds, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });
            const oracleRows = resultOracle.rows || [];

            // Gabungkan data dari kedua sumber
            const oracleDataMap = new Map(
                oracleRows.map(row => [String(row.M_INOUT_ID), row])
            );

            const combinedData = postgresRows.map(pgRow => {
                const oracleData = oracleDataMap.get(String(pgRow.m_inout_id));
                return {
                    ...pgRow,
                    documentNo: oracleData ? oracleData.DOCUMENTNO : 'N/A',
                    planTime: oracleData ? oracleData.PLANTIME : null,
                    customer: oracleData ? oracleData.CUSTOMER : 'N/A',
                };
            });

            return {
                success: true,
                count: combinedData.length,
                data: combinedData,
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

    async toHandover(server, payload, userId, checkpoint) {
        const dbClient = await server.pg.connect();

        try {
            await dbClient.query('BEGIN');
            let result;

            let fromActor;
            let toActor;



            switch (Number(checkpoint)) {

                case 1: {
                    // 1. Ekstrak 'toActor' dari payload
                    const { data } = payload;
                    fromActor = 'Delivery';
                    toActor = 'DPK';

                    // 2. Validasi input, termasuk 'toActor'
                    if (!data || !Array.isArray(data) || data.length === 0) {
                        throw { statusCode: 400, message: 'Data is required for handover.' };
                    }
                    if (!toActor) {
                        throw { statusCode: 400, message: 'Destination actor (toActor) is required.' };
                    }

                    // Daftar tujuan yang valid untuk peran 'delivery'
                    const validDestinations = ['DPK', 'MKT'];
                    if (!validDestinations.includes(toActor)) {
                        throw { statusCode: 400, message: `Invalid destination actor: ${toActor}. Valid options are: ${validDestinations.join(', ')}.` };
                    }

                    // Transaksi tetap sama seperti sebelumnya, tidak perlu diubah karena sudah ada di level atas.
                    // Kode di bawah ini sekarang akan berjalan di dalam transaksi yang sudah dimulai.

                    let insertedCount = 0;

                    // Proses setiap item dalam array data
                    for (const item of data) {
                        // INSERT ke tabel utama (adw_trackingsj)
                        const insertTrackingQuery = `
                            INSERT INTO adw_trackingsj(
                                ad_client_id, ad_org_id, checkpoin_id, created, createdby,
                                isactive, m_inout_id, updated, updatedby, plantime, documentno
                            ) VALUES(
                                1000003, 1000003, '2', NOW(), $1, 'Y', $2, NOW(), $1, $3, $4
                            ) RETURNING adw_trackingsj_id;
                        `;
                        const trackingResult = await dbClient.query(insertTrackingQuery, [userId, item.m_inout_id, item.plantime, item.documentno]);
                        const newTrackingId = trackingResult.rows[0].adw_trackingsj_id;

                        if (!newTrackingId) {
                            throw new Error('Failed to create tracking record, ID was not returned.');
                        }

                        // 3. Gunakan variabel 'toActor' di dalam query
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
                        // Parameter query: [userId, toActor dari payload, newTrackingId]
                        await dbClient.query(insertEventQuery, [userId, fromActor, toActor, newTrackingId, String(checkpoint)]);

                        insertedCount++;
                    }

                    result = { insertedCount: insertedCount };
                    break;
                }

                case 3: {
                    const { data, driverId, tnkbId } = payload;
                    if (!data || !Array.isArray(data) || data.length === 0) {
                        throw { statusCode: 400, message: 'Data is required for handover.' };
                    }

                    const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

                    // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
                    if (!workflow) {
                        return { success: false, message: `No acceptance workflow defined for checkpoint: ${checkpoint}` };
                    }
                    // Ekstrak semua m_inout_id untuk query batch
                    const inoutIds = data.map(item => item.m_inout_id);

                    // 2. Lakukan SATU KALI UPDATE untuk semua item dan dapatkan kembali ID yang relevan.
                    // Ini jauh lebih efisien daripada melakukan update di dalam loop.
                    const updateQuery = `
                            UPDATE adw_trackingsj 
                            SET
                                checkpoin_id = $1, 
                                updated = NOW(), 
                                updatedby = $2,
                                driverby = $4,
                                tnkb_id = $5
                            WHERE 
                                m_inout_id = ANY($3::integer[]) -- Gunakan ANY untuk mencocokkan dengan array
                                AND checkpoin_id = $6
                            RETURNING adw_trackingsj_id; -- KUNCI UTAMA: Kembalikan ID dari setiap baris yang diupdate
                        `;
                    const updateValues = [workflow.nextCheckpoint, userId, inoutIds, driverId, tnkbId, checkpoint];
                    const updateResult = await dbClient.query(updateQuery, updateValues);

                    // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
                    if (updateResult.rows.length === 0) {
                        throw new Error('No items could be updated. They might be at the wrong checkpoint or already processed.');
                    }

                    const updatedTrackingIds = updateResult.rows; // Berisi array objek, mis: [{ adw_trackingsj_id: 101 }, { adw_trackingsj_id: 102 }]

                    // 3. Loop melalui HASIL UPDATE untuk membuat event bagi SETIAP item yang berhasil diubah.
                    for (const row of updatedTrackingIds) {
                        const trackingId = row.adw_trackingsj_id; // Dapatkan ID dari hasil RETURNING

                        const insertEventQuery = `
                                INSERT INTO adw_trackingsj_events(
                                    ad_client_id, ad_org_id, ad_user_id,
                                    adw_event_type, adw_from_actor, adw_to_actor,
                                    adw_trackingsj_id, created, createdby, isactive,
                                    updated, updatedby, checkpoin_id
                                ) VALUES(
                                    1000003, 1000003, $1,        -- userId
                                    'HANDOVER', $2, $3,          -- fromActor, toActor
                                    $4, NOW(), $1, 'Y',          -- trackingId, createdby
                                    NOW(), $1, $5                -- updatedby, checkpoint saat ini (sebelum diubah)
                                );
                            `;
                        const eventValues = [userId, workflow.fromActor, workflow.actor, trackingId, checkpoint];
                        await dbClient.query(insertEventQuery, eventValues);
                    }

                    // 4. Set hasil akhir SETELAH semua operasi selesai.
                    result = { acceptedCount: updatedTrackingIds.length, message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.` };

                    break;
                }

                case 4: {
                    const { data } = payload;
                    if (!data || !Array.isArray(data) || data.length === 0) {
                        throw { statusCode: 400, message: 'Data is required for handover.' };
                    }

                    const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

                    // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
                    if (!workflow) {
                        return { success: false, message: `No acceptance workflow defined for checkpoint: ${checkpoint}` };
                    }
                    // Ekstrak semua m_inout_id untuk query batch
                    const inoutIds = data.map(item => item.m_inout_id);

                    // 2. Lakukan SATU KALI UPDATE untuk semua item dan dapatkan kembali ID yang relevan.
                    // Ini jauh lebih efisien daripada melakukan update di dalam loop.
                    const updateQuery = `
                            UPDATE adw_trackingsj 
                            SET
                                checkpoin_id = $1, 
                                updated = NOW(), 
                                updatedby = $2
                            WHERE 
                                m_inout_id = ANY($3::integer[]) -- Gunakan ANY untuk mencocokkan dengan array
                                AND checkpoin_id = $4
                            RETURNING adw_trackingsj_id; -- KUNCI UTAMA: Kembalikan ID dari setiap baris yang diupdate
                        `;
                    const updateValues = [workflow.nextCheckpoint, userId, inoutIds, checkpoint];
                    const updateResult = await dbClient.query(updateQuery, updateValues);

                    // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
                    if (updateResult.rows.length === 0) {
                        throw new Error('No items could be updated. They might be at the wrong checkpoint or already processed.');
                    }

                    const updatedTrackingIds = updateResult.rows; // Berisi array objek, mis: [{ adw_trackingsj_id: 101 }, { adw_trackingsj_id: 102 }]

                    // 3. Loop melalui HASIL UPDATE untuk membuat event bagi SETIAP item yang berhasil diubah.
                    for (const row of updatedTrackingIds) {
                        const trackingId = row.adw_trackingsj_id; // Dapatkan ID dari hasil RETURNING

                        const insertEventQuery = `
                                INSERT INTO adw_trackingsj_events(
                                    ad_client_id, ad_org_id, ad_user_id,
                                    adw_event_type, adw_from_actor, adw_to_actor,
                                    adw_trackingsj_id, created, createdby, isactive,
                                    updated, updatedby, checkpoin_id
                                ) VALUES(
                                    1000003, 1000003, $1,        -- userId
                                    'HANDOVER', $2, $3,          -- fromActor, toActor
                                    $4, NOW(), $1, 'Y',          -- trackingId, createdby
                                    NOW(), $1, $5                -- updatedby, checkpoint saat ini (sebelum diubah)
                                );
                            `;
                        const eventValues = [userId, workflow.fromActor, workflow.actor, trackingId, checkpoint];
                        await dbClient.query(insertEventQuery, eventValues);
                    }

                    // 4. Set hasil akhir SETELAH semua operasi selesai.
                    result = { acceptedCount: updatedTrackingIds.length, message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.` };

                    break;
                }

                case 5: {
                    const { data } = payload;
                    if (!data || !Array.isArray(data) || data.length === 0) {
                        throw { statusCode: 400, message: 'Data is required for handover.' };
                    }

                    const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

                    // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
                    if (!workflow) {
                        return { success: false, message: `No acceptance workflow defined for checkpoint: ${checkpoint}` };
                    }
                    // Ekstrak semua m_inout_id untuk query batch
                    const inoutIds = data.map(item => item.m_inout_id);

                    // 2. Lakukan SATU KALI UPDATE untuk semua item dan dapatkan kembali ID yang relevan.
                    // Ini jauh lebih efisien daripada melakukan update di dalam loop.
                    const updateQuery = `
                            UPDATE adw_trackingsj 
                            SET
                                checkpoin_id = $1, 
                                updated = NOW(), 
                                updatedby = $2
                            WHERE 
                                m_inout_id = ANY($3::integer[]) -- Gunakan ANY untuk mencocokkan dengan array
                                AND checkpoin_id = $4
                            RETURNING adw_trackingsj_id; -- KUNCI UTAMA: Kembalikan ID dari setiap baris yang diupdate
                        `;
                    const updateValues = [workflow.nextCheckpoint, userId, inoutIds, checkpoint];
                    const updateResult = await dbClient.query(updateQuery, updateValues);

                    // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
                    if (updateResult.rows.length === 0) {
                        throw new Error('No items could be updated. They might be at the wrong checkpoint or already processed.');
                    }

                    const updatedTrackingIds = updateResult.rows; // Berisi array objek, mis: [{ adw_trackingsj_id: 101 }, { adw_trackingsj_id: 102 }]

                    // 3. Loop melalui HASIL UPDATE untuk membuat event bagi SETIAP item yang berhasil diubah.
                    for (const row of updatedTrackingIds) {
                        const trackingId = row.adw_trackingsj_id; // Dapatkan ID dari hasil RETURNING

                        const insertEventQuery = `
                                INSERT INTO adw_trackingsj_events(
                                    ad_client_id, ad_org_id, ad_user_id,
                                    adw_event_type, adw_from_actor, adw_to_actor,
                                    adw_trackingsj_id, created, createdby, isactive,
                                    updated, updatedby, checkpoin_id
                                ) VALUES(
                                    1000003, 1000003, $1,        -- userId
                                    'HANDOVER', $2, $3,          -- fromActor, toActor
                                    $4, NOW(), $1, 'Y',          -- trackingId, createdby
                                    NOW(), $1, $5                -- updatedby, checkpoint saat ini (sebelum diubah)
                                );
                            `;
                        const eventValues = [userId, workflow.fromActor, workflow.actor, trackingId, checkpoint];
                        await dbClient.query(insertEventQuery, eventValues);
                    }

                    // 4. Set hasil akhir SETELAH semua operasi selesai.
                    result = { acceptedCount: updatedTrackingIds.length, message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.` };

                    break;
                }

                case 7: {
                    const { data } = payload;
                    if (!data || !Array.isArray(data) || data.length === 0) {
                        throw { statusCode: 400, message: 'Data is required for handover.' };
                    }

                    const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

                    // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
                    if (!workflow) {
                        return { success: false, message: `No acceptance workflow defined for checkpoint: ${checkpoint}` };
                    }
                    // Ekstrak semua m_inout_id untuk query batch
                    const inoutIds = data.map(item => item.m_inout_id);

                    // 2. Lakukan SATU KALI UPDATE untuk semua item dan dapatkan kembali ID yang relevan.
                    // Ini jauh lebih efisien daripada melakukan update di dalam loop.
                    const updateQuery = `
                            UPDATE adw_trackingsj 
                            SET
                                checkpoin_id = $1, 
                                updated = NOW(), 
                                updatedby = $2
                            WHERE 
                                m_inout_id = ANY($3::integer[]) -- Gunakan ANY untuk mencocokkan dengan array
                                AND checkpoin_id = $4
                            RETURNING adw_trackingsj_id; -- KUNCI UTAMA: Kembalikan ID dari setiap baris yang diupdate
                        `;
                    const updateValues = [workflow.nextCheckpoint, userId, inoutIds, checkpoint];
                    const updateResult = await dbClient.query(updateQuery, updateValues);

                    // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
                    if (updateResult.rows.length === 0) {
                        throw new Error('No items could be updated. They might be at the wrong checkpoint or already processed.');
                    }

                    const updatedTrackingIds = updateResult.rows; // Berisi array objek, mis: [{ adw_trackingsj_id: 101 }, { adw_trackingsj_id: 102 }]

                    // 3. Loop melalui HASIL UPDATE untuk membuat event bagi SETIAP item yang berhasil diubah.
                    for (const row of updatedTrackingIds) {
                        const trackingId = row.adw_trackingsj_id; // Dapatkan ID dari hasil RETURNING

                        const insertEventQuery = `
                                INSERT INTO adw_trackingsj_events(
                                    ad_client_id, ad_org_id, ad_user_id,
                                    adw_event_type, adw_from_actor, adw_to_actor,
                                    adw_trackingsj_id, created, createdby, isactive,
                                    updated, updatedby, checkpoin_id
                                ) VALUES(
                                    1000003, 1000003, $1,        -- userId
                                    'HANDOVER', $2, $3,          -- fromActor, toActor
                                    $4, NOW(), $1, 'Y',          -- trackingId, createdby
                                    NOW(), $1, $5                -- updatedby, checkpoint saat ini (sebelum diubah)
                                );
                            `;
                        const eventValues = [userId, workflow.fromActor, workflow.actor, trackingId, checkpoint];
                        await dbClient.query(insertEventQuery, eventValues);
                    }

                    // 4. Set hasil akhir SETELAH semua operasi selesai.
                    result = { acceptedCount: updatedTrackingIds.length, message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.` };

                    break;
                }

                case 9: {
                    const { data } = payload;
                    if (!data || !Array.isArray(data) || data.length === 0) {
                        throw { statusCode: 400, message: 'Data is required for handover.' };
                    }

                    const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

                    // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
                    if (!workflow) {
                        return { success: false, message: `No acceptance workflow defined for checkpoint: ${checkpoint}` };
                    }
                    // Ekstrak semua m_inout_id untuk query batch
                    const inoutIds = data.map(item => item.m_inout_id);

                    // 2. Lakukan SATU KALI UPDATE untuk semua item dan dapatkan kembali ID yang relevan.
                    // Ini jauh lebih efisien daripada melakukan update di dalam loop.
                    const updateQuery = `
                            UPDATE adw_trackingsj 
                            SET
                                checkpoin_id = $1, 
                                updated = NOW(), 
                                updatedby = $2
                            WHERE 
                                m_inout_id = ANY($3::integer[]) -- Gunakan ANY untuk mencocokkan dengan array
                                AND checkpoin_id = $4
                            RETURNING adw_trackingsj_id; -- KUNCI UTAMA: Kembalikan ID dari setiap baris yang diupdate
                        `;
                    const updateValues = [workflow.nextCheckpoint, userId, inoutIds, checkpoint];
                    const updateResult = await dbClient.query(updateQuery, updateValues);

                    // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
                    if (updateResult.rows.length === 0) {
                        throw new Error('No items could be updated. They might be at the wrong checkpoint or already processed.');
                    }

                    const updatedTrackingIds = updateResult.rows; // Berisi array objek, mis: [{ adw_trackingsj_id: 101 }, { adw_trackingsj_id: 102 }]

                    // 3. Loop melalui HASIL UPDATE untuk membuat event bagi SETIAP item yang berhasil diubah.
                    for (const row of updatedTrackingIds) {
                        const trackingId = row.adw_trackingsj_id; // Dapatkan ID dari hasil RETURNING

                        const insertEventQuery = `
                                INSERT INTO adw_trackingsj_events(
                                    ad_client_id, ad_org_id, ad_user_id,
                                    adw_event_type, adw_from_actor, adw_to_actor,
                                    adw_trackingsj_id, created, createdby, isactive,
                                    updated, updatedby, checkpoin_id
                                ) VALUES(
                                    1000003, 1000003, $1,        -- userId
                                    'HANDOVER', $2, $3,          -- fromActor, toActor
                                    $4, NOW(), $1, 'Y',          -- trackingId, createdby
                                    NOW(), $1, $5                -- updatedby, checkpoint saat ini (sebelum diubah)
                                );
                            `;
                        const eventValues = [userId, workflow.fromActor, workflow.actor, trackingId, checkpoint];
                        await dbClient.query(insertEventQuery, eventValues);
                    }

                    // 4. Set hasil akhir SETELAH semua operasi selesai.
                    result = { acceptedCount: updatedTrackingIds.length, message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.` };

                    break;
                }

                case 11: {
                    const { data } = payload;
                    if (!data || !Array.isArray(data) || data.length === 0) {
                        throw { statusCode: 400, message: 'Data is required for handover.' };
                    }

                    const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

                    // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
                    if (!workflow) {
                        return { success: false, message: `No acceptance workflow defined for checkpoint: ${checkpoint}` };
                    }
                    // Ekstrak semua m_inout_id untuk query batch
                    const inoutIds = data.map(item => item.m_inout_id);

                    // 2. Lakukan SATU KALI UPDATE untuk semua item dan dapatkan kembali ID yang relevan.
                    // Ini jauh lebih efisien daripada melakukan update di dalam loop.
                    const updateQuery = `
                            UPDATE adw_trackingsj 
                            SET
                                checkpoin_id = $1, 
                                updated = NOW(), 
                                updatedby = $2
                            WHERE 
                                m_inout_id = ANY($3::integer[]) -- Gunakan ANY untuk mencocokkan dengan array
                                AND checkpoin_id = $4
                            RETURNING adw_trackingsj_id; -- KUNCI UTAMA: Kembalikan ID dari setiap baris yang diupdate
                        `;
                    const updateValues = [workflow.nextCheckpoint, userId, inoutIds, checkpoint];
                    const updateResult = await dbClient.query(updateQuery, updateValues);

                    // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
                    if (updateResult.rows.length === 0) {
                        throw new Error('No items could be updated. They might be at the wrong checkpoint or already processed.');
                    }

                    const updatedTrackingIds = updateResult.rows; // Berisi array objek, mis: [{ adw_trackingsj_id: 101 }, { adw_trackingsj_id: 102 }]

                    // 3. Loop melalui HASIL UPDATE untuk membuat event bagi SETIAP item yang berhasil diubah.
                    for (const row of updatedTrackingIds) {
                        const trackingId = row.adw_trackingsj_id; // Dapatkan ID dari hasil RETURNING

                        const insertEventQuery = `
                                INSERT INTO adw_trackingsj_events(
                                    ad_client_id, ad_org_id, ad_user_id,
                                    adw_event_type, adw_from_actor, adw_to_actor,
                                    adw_trackingsj_id, created, createdby, isactive,
                                    updated, updatedby, checkpoin_id
                                ) VALUES(
                                    1000003, 1000003, $1,        -- userId
                                    'HANDOVER', $2, $3,          -- fromActor, toActor
                                    $4, NOW(), $1, 'Y',          -- trackingId, createdby
                                    NOW(), $1, $5                -- updatedby, checkpoint saat ini (sebelum diubah)
                                );
                            `;
                        const eventValues = [userId, workflow.fromActor, workflow.actor, trackingId, checkpoint];
                        await dbClient.query(insertEventQuery, eventValues);
                    }

                    // 4. Set hasil akhir SETELAH semua operasi selesai.
                    result = { acceptedCount: updatedTrackingIds.length, message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.` };

                    break;
                }


                default:
                    throw { statusCode: 400, message: `Invalid or unsupported chechpoint: ${checkpoint}` };
            }

            await dbClient.query('COMMIT');
            return result;

        } catch (error) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error("Transaction Error in toHandover:", error.message);
            throw error;
        } finally {
            if (dbClient) dbClient.release();
        }
    }

    async getHistory(server, page, pageSize) {
        let connection;
        let dbClient;

        try {
            // 1. Buka koneksi ke kedua database secara paralel untuk menghemat waktu
            [connection, dbClient] = await Promise.all([
                oracleDB.openConnection(),
                server.pg.connect()
            ]);

            const offset = (page - 1) * pageSize;

            const startRow = offset;                 // misalnya (page - 1) * pageSize
            const endRow = startRow + pageSize;      // misalnya page * pageSize

            // 2. Ambil data master dari Oracle terlebih dahulu
            // Ini adalah sumber data utama kita untuk periode yang diinginkan.
            const queryOracle = `
            SELECT * FROM (SELECT a.*, ROWNUM rnum  FROM (SELECT
                M_INOUT_ID,
                DOCUMENTNO,
                TO_DATE(
                    TO_CHAR(MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                    TO_CHAR(PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
            FROM
                M_INOUT
            WHERE
                DOCSTATUS = 'CO'
                AND ISSOTRX = 'Y'
                -- Filter rentang waktu yang jelas di Oracle
                AND MOVEMENTDATE >= ADD_MONTHS(SYSDATE, -1)
            ORDER BY DOCUMENTNO DESC
            ) a
            WHERE ROWNUM <= :endRow
        )
        WHERE rnum > :startRow
        `;

            const binds = { startRow, endRow };

            const resultOracle = await connection.execute(queryOracle, binds, {
                outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
            });
            const oracleRows = resultOracle.rows || [];

            // total count buat pagination AntD
            const totalResult = await connection.execute(`
                SELECT COUNT(*) AS TOTAL
                FROM M_InOut
                WHERE DOCSTATUS = 'CO'
                AND ISSOTRX = 'Y'
                -- AND MOVEMENTDATE >= ADD_MONTHS(SYSDATE, -1)
            `);

            const totalRows = totalResult.rows[0].TOTAL || totalResult.rows[0][0];


            // Jika tidak ada data sama sekali dari Oracle, langsung selesaikan.
            if (oracleRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // 3. Ekstrak M_INOUT_ID dari data Oracle untuk digunakan memfilter kueri Postgres
            const inoutIds = oracleRows.map(row => row.M_INOUT_ID);

            // 4. Kueri PostgreSQL sekarang JAUH LEBIH RINGAN karena difilter dengan WHERE...IN
            const queryPostgres = `
            WITH RankedEvents AS (
                -- Langkah 1: Peringkat event hanya untuk tracking_id yang relevan
                SELECT
                    e.adw_trackingsj_id,
                    e.ad_user_id,
                    e.created,
                    e.adw_event_type,
                    e.adw_from_actor,
                    e.adw_to_actor,
                    ROW_NUMBER() OVER(
                        PARTITION BY e.adw_trackingsj_id, e.adw_event_type, e.adw_from_actor, e.adw_to_actor
                        ORDER BY e.created DESC
                    ) as rn
                FROM adw_trackingsj_events e
                -- Filter awal di sini sangat membantu performa
                JOIN adw_trackingsj ats_filter ON e.adw_trackingsj_id = ats_filter.adw_trackingsj_id
                  AND e.adw_event_type IN ('HANDOVER', 'ACCEPTANCE')
            ),
            PivotedEvents AS (
                -- Langkah 2: Pivot hanya event terbaru (rn=1)
                SELECT
                    adw_trackingsj_id,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'DPK' THEN created END) AS ho_delivery_to_dpk,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'DPK' THEN ad_user_id END) AS ho_delivery_to_dpkby,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'DPK' THEN created END) AS accept_dpk_from_delivery,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'DPK' THEN ad_user_id END) AS accept_dpk_from_deliveryby,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Driver' THEN created END) AS ho_dpk_to_driver,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Driver' THEN ad_user_id END) AS ho_dpk_to_driverby,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Driver' THEN created END) AS accept_driver_from_dpk,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Driver' THEN ad_user_id END) AS accept_driver_from_dpkby,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'DPK' THEN created END) AS ho_driver_to_dpk,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'DPK' THEN ad_user_id END) AS ho_driver_to_dpkby,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'DPK' THEN created END) AS accept_dpk_from_driver,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'DPK' THEN ad_user_id END) AS accept_dpk_from_driverby,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Delivery' THEN created END) AS ho_dpk_to_delivery,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Delivery' THEN ad_user_id END) AS ho_dpk_to_deliveryby,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Delivery' THEN created END) AS accept_delivery_from_dpk,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Delivery' THEN ad_user_id END) AS accept_delivery_from_dpkby,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'Marketing' THEN created END) AS ho_delivery_to_mkt,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'Marketing' THEN ad_user_id END) AS ho_delivery_to_mktby,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'Marketing' THEN created END) AS accept_mkt_from_delivery,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'Marketing' THEN ad_user_id END) AS accept_mkt_from_deliveryby,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Marketing' AND adw_to_actor = 'FAT' THEN created END) AS ho_mkt_to_fat,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Marketing' AND adw_to_actor = 'FAT' THEN ad_user_id END) AS ho_mkt_to_fatby,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Marketing' AND adw_to_actor = 'FAT' THEN created END) AS accept_fat_from_mkt,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Marketing' AND adw_to_actor = 'FAT' THEN ad_user_id END) AS accept_fat_from_mktby
                FROM RankedEvents
                WHERE rn = 1
                GROUP BY adw_trackingsj_id
            )
            -- Langkah 3: Gabungkan hasil pivot dengan data user dalam satu kueri
            SELECT
                ats.m_inout_id,
                ats.documentno,
                ats.plantime,
                ats.cancelrequest,
                ats.adw_trackingsj_id,
                ats.checkpoin_id,
                pe.*, -- Ambil semua kolom dari PivotedEvents
                user1.name AS ho_delivery_to_dpkby_name,
                user2.name AS accept_dpk_from_deliveryby_name,
                user3.name AS ho_dpk_to_driverby_name,
                user4.name AS accept_driver_from_dpkby_name,
                user5.name AS ho_driver_to_dpkby_name,
                user6.name AS accept_dpk_from_driverby_name,
                user7.name AS ho_dpk_to_deliveryby_name,
                user8.name AS accept_delivery_from_dpkby_name,
                user9.name AS ho_delivery_to_mktby_name,
                user10.name AS accept_mkt_from_deliveryby_name,
                user11.name AS ho_mkt_to_fatby_name,
                user12.name AS accept_fat_from_mktby_name
            FROM adw_trackingsj ats
            JOIN PivotedEvents pe ON ats.adw_trackingsj_id = pe.adw_trackingsj_id
            -- LEFT JOIN untuk user, karena bisa saja user_id-nya null
            LEFT JOIN ad_user user1 ON pe.ho_delivery_to_dpkby = user1.ad_user_id
            LEFT JOIN ad_user user2 ON pe.accept_dpk_from_deliveryby = user2.ad_user_id
            LEFT JOIN ad_user user3 ON pe.ho_dpk_to_driverby = user3.ad_user_id
            LEFT JOIN ad_user user4 ON pe.accept_driver_from_dpkby = user4.ad_user_id
            LEFT JOIN ad_user user5 ON pe.ho_driver_to_dpkby = user5.ad_user_id
            LEFT JOIN ad_user user6 ON pe.accept_dpk_from_driverby = user6.ad_user_id
            LEFT JOIN ad_user user7 ON pe.ho_dpk_to_deliveryby = user7.ad_user_id
            LEFT JOIN ad_user user8 ON pe.accept_delivery_from_dpkby = user8.ad_user_id
            LEFT JOIN ad_user user9 ON pe.ho_delivery_to_mktby = user9.ad_user_id
            LEFT JOIN ad_user user10 ON pe.accept_mkt_from_deliveryby = user10.ad_user_id
            LEFT JOIN ad_user user11 ON pe.ho_mkt_to_fatby = user11.ad_user_id
            LEFT JOIN ad_user user12 ON pe.accept_fat_from_mktby = user12.ad_user_id
        `;

            const resultPg = await dbClient.query(queryPostgres);
            const postgresRows = resultPg.rows || [];

            const combinedData = [];

            for (const postgresData of postgresRows) {
                combinedData.push({ ...postgresData });
            }

            for (const oracleRow of oracleRows) {
                const alreadyExists = combinedData.some(
                    item => String(item.m_inout_id) === String(oracleRow.M_INOUT_ID)
                );

                if (!alreadyExists) {
                    combinedData.push({
                        m_inout_id: oracleRow.M_INOUT_ID,
                        documentno: oracleRow.DOCUMENTNO,
                        plannime: oracleRow.PLANTIME,
                        cancelrequest: null, adw_trackingsj_id: null, checkpoin_id: null,
                        ho_delivery_to_dpk: null, ho_delivery_to_dpkby: null,
                        accept_dpk_from_delivery: null, accept_dpk_from_deliveryby: null,
                        ho_dpk_to_driver: null, ho_dpk_to_driverby: null,
                        accept_driver_from_dpk: null, accept_driver_from_dpkby: null,
                        ho_driver_to_dpk: null, ho_driver_to_dpkby: null,
                        accept_dpk_from_driver: null, accept_dpk_from_driverby: null,
                        ho_dpk_to_delivery: null, ho_dpk_to_deliveryby: null,
                        accept_delivery_from_dpk: null, accept_delivery_from_dpkby: null,
                        ho_delivery_to_mkt: null, ho_delivery_to_mktby: null,
                        accept_mkt_from_delivery: null, accept_mkt_from_deliveryby: null,
                        ho_mkt_to_fat: null, ho_mkt_to_fatby: null,
                        accept_fat_from_mkt: null, accept_fat_from_mktby: null
                    });
                }
            }

            return {
                success: true,
                count: combinedData.length,
                meta: {
                    total: totalRows,
                    count: combinedData.length,
                    per_page: pageSize,
                    current_page: page,
                    total_pages: Math.ceil(totalRows / pageSize)
                },
                data: combinedData,
            };

        } catch (error) {
            console.error('Error in getHistory:', error); // Gunakan console.error untuk error
            return { success: false, message: 'Server error' };
        } finally {
            // Pastikan kedua koneksi ditutup dengan benar
            if (connection) {
                try { await connection.close(); } catch (e) { console.error('Error closing Oracle connection:', e); }
            }
            if (dbClient) {
                try { dbClient.release(); } catch (e) { console.error('Error releasing pg client:', e); }
            }
        }
    }

    async toCancel(server, payload) {
        const { action, m_inout_id, handoverKey, role, userId } = payload;
        let dbClient;

        try {
            dbClient = await server.pg.connect();
            await dbClient.query('BEGIN');

            // --- Logika untuk REQUEST CANCEL (Tidak berubah, sudah benar) ---
            if (action === 'request-cancel') {
                const updateQuery = `
                    UPDATE adw_trackingsj
                    SET 
                        cancelrequest = $1,
                        updated = NOW(),
                        updatedby = $2
                    WHERE 
                        m_inout_id = $3;
                `;
                const result = await dbClient.query(updateQuery, ['Y', userId, m_inout_id]);

                if (result.rowCount === 0) {
                    throw { statusCode: 404, message: 'Dokumen tidak ditemukan atau tidak dalam status yang bisa dibatalkan.' };
                }

                await dbClient.query('COMMIT');
                return { success: true, message: 'Permintaan pembatalan berhasil dikirim.' };
            }

            // --- Logika untuk CONFIRM CANCEL (Dengan perbaikan if/else) ---
            if (action === 'confirm-cancel') {
                // 1. Dapatkan checkpoint saat ini dan adw_trackingsj_id
                const selectQuery = `
                    SELECT adw_trackingsj_id, checkpoin_id 
                    FROM adw_trackingsj 
                    WHERE m_inout_id = $1 AND cancelrequest = 'Y';
                `;
                const selectResult = await dbClient.query(selectQuery, [m_inout_id]);

                if (selectResult.rows.length === 0) {
                    throw { statusCode: 404, message: 'Tidak ada permintaan pembatalan aktif untuk dokumen ini.' };
                }
                const { adw_trackingsj_id, checkpoin_id: currentCheckpointId } = selectResult.rows[0];

                // --- KASUS SPESIAL: Jika di checkpoint pertama (2), hapus total ---
                if (String(currentCheckpointId) === '2') {

                    // Hapus semua event yang terkait terlebih dahulu
                    const deleteEventsQuery = `
                        DELETE FROM adw_trackingsj_events
                        WHERE adw_trackingsj_id = $1;
                    `;
                    await dbClient.query(deleteEventsQuery, [adw_trackingsj_id]);

                    // Hapus record tracking utamanya
                    const deleteTrackingQuery = `
                        DELETE FROM adw_trackingsj
                        WHERE adw_trackingsj_id = $1;
                    `;
                    const deleteTrackingResult = await dbClient.query(deleteTrackingQuery, [adw_trackingsj_id]);

                    if (deleteTrackingResult.rowCount === 0) {
                        throw new Error('Gagal menghapus record tracking utama setelah menghapus event.');
                    }

                    // Commit dan SELESAI. Kode tidak akan lanjut ke bawah.
                    await dbClient.query('COMMIT');
                    return { success: true, message: 'Handover awal berhasil dibatalkan dan data tracking dihapus.' };

                } else {
                    // --- KASUS NORMAL: Jika BUKAN di checkpoint 2, kembalikan ke state sebelumnya ---

                    // 2. Cari checkpoint SEBELUMNYA
                    const prevCheckpointEntry = Object.entries(CHECKPOINT_WORKFLOWS).find(
                        ([key, value]) => value.nextCheckpoint === String(currentCheckpointId)
                    );

                    if (!prevCheckpointEntry) {
                        throw { statusCode: 400, message: `Tidak dapat menemukan alur kerja sebelumnya dari checkpoint saat ini: ${currentCheckpointId}.` };
                    }
                    const previousCheckpointId = prevCheckpointEntry[0];

                    // 3. Update adw_trackingsj: kembalikan ke checkpoint sebelumnya dan reset permintaan cancel
                    const updateQuery = `
                        UPDATE adw_trackingsj
                        SET 
                            checkpoin_id = $1,
                            cancelrequest = 'N',
                            updated = NOW(),
                            updatedby = $2
                        WHERE 
                            m_inout_id = $3;
                    `;
                    await dbClient.query(updateQuery, [previousCheckpointId, userId, m_inout_id]);

                    // 4. Hapus event HANDOVER yang salah
                    const deleteEventQuery = `
                        DELETE FROM adw_trackingsj_events
                        WHERE adw_trackingsj_events_id = (
                            SELECT adw_trackingsj_events_id
                            FROM adw_trackingsj_events
                            WHERE adw_trackingsj_id = $1 AND adw_event_type = 'HANDOVER'
                            ORDER BY created DESC
                            LIMIT 1
                        );
                    `;
                    await dbClient.query(deleteEventQuery, [adw_trackingsj_id]);

                    // Commit dan SELESAI.
                    await dbClient.query('COMMIT');
                    return { success: true, message: 'Handover berhasil dibatalkan.' };
                }
            }

            // Jika 'action' tidak sesuai
            throw { statusCode: 400, message: 'Aksi yang diminta tidak valid.' };

        } catch (error) {
            if (dbClient) await dbClient.query('ROLLBACK');
            console.error('Error in toCancel function:', error);
            throw error;
        } finally {
            if (dbClient) dbClient.release();
        }
    }


}

async function tms(fastify, opts) {
    fastify.decorate('tms', new TMS());
    fastify.register(autoload, {
        dir: join(import.meta.url, 'routes'),
        options: {
            prefix: opts.prefix
        }
    })
}

export default fp(tms)