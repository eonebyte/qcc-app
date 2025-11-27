import fp from 'fastify-plugin'
import autoload from '@fastify/autoload'
import { join } from 'desm'
import oracleDB from "../../configs/dbOracle.js";
import dayjs from "dayjs";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import qr from "qrcode";
import { v4 as uuidv4 } from "uuid";
import dotenv from 'dotenv'



dotenv.config()

const pathUrl = process.env.PATH_URL;


class Receipt {

    formatDate(iso) {
        if (!iso) return "-";
        // convert ke WIB dan format YYYY-MM-DD
        return dayjs(iso).tz("Asia/Jakarta").format("YYYY-MM-DD");
    };

    async generateHandoverPdf(payload, from_act, to_act) {
        const {
            listShipment,
            dataUser,
            bundleNo,
            dateHandover
        } = payload;

        const uploadDir = path.join(process.cwd(), "uploads/handover");
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const uniqueId = uuidv4();
        const fileName = `handover_${uniqueId}.pdf`;
        const filePath = path.join(uploadDir, fileName);

        const doc = new PDFDocument({
            size: "A4",
            margin: 40
        });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // ========================================
        // HEADER
        // ========================================
        doc.font('Helvetica-Bold').fontSize(16).text(`LIST HANDOVER (${from_act} to ${to_act})`, { align: "center" });
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(12).text(`No: ${bundleNo}`, { align: "center" });
        doc.moveDown(2); // Jarak ke tabel

        // ========================================
        // TABLE HEADER – Fixed Y Position (Supaya Rapih)
        // ========================================
        const startX = 40;
        const colNo = 40;
        const colCust = 90;  // Geser sedikit supaya kolom No lega
        const colShip = 260;
        const colMove = 400;

        // Simpan posisi Y header agar sejajar
        const headerY = doc.y;

        doc.font('Helvetica-Bold').fontSize(11);
        doc.text("No", colNo, headerY);
        doc.text("Customer", colCust, headerY);
        doc.text("Shipment No", colShip, headerY);
        doc.text("Movement Date", colMove, headerY);

        // Garis Header
        // (Y + 15 agar garis ada sedikit di bawah teks)
        doc.moveTo(startX, headerY + 15).lineTo(550, headerY + 15).lineWidth(1).stroke();

        // Set cursor ke bawah header untuk baris pertama data
        doc.y = headerY + 25;

        // ========================================
        // TABLE DATA
        // ========================================
        doc.font('Helvetica').fontSize(11); // Reset font normal

        listShipment.forEach((ship, idx) => {
            const moveDate = dayjs(ship.movementdate).tz("Asia/Jakarta").format("YYYY-MM-DD");

            // Simpan posisi Y baris ini
            const rowY = doc.y;

            // Cetak semua kolom dengan Y yang sama
            doc.text(idx + 1, colNo, rowY);
            doc.text(ship.customer, colCust, rowY);
            doc.text(ship.documentno, colShip, rowY);
            doc.text(moveDate, colMove, rowY);

            // Garis pemisah antar row
            const lineY = rowY + 15;
            doc.moveTo(startX, lineY).lineTo(550, lineY).lineWidth(0.5).stroke();

            // Pindah ke baris berikutnya
            doc.y = lineY + 8;
        });

        // Jarak dari tabel ke section tanda tangan
        doc.moveDown(2);

        // ========================================
        // SIGNATURE SECTION
        // ========================================
        const sigStartY = doc.y; // Titik patokan atas section tanda tangan
        const centerX = 297.5;   // Tengah halaman A4 (595 / 2)
        const leftX = 80;
        const rightX = 380;
        const boxWidth = 160;

        const createdHour = dayjs(dateHandover.createdBundle).format("HH:mm") + " WIB";
        const receivedHour = dayjs(dateHandover.receivedBundle).format("HH:mm") + " WIB";

        // 1. JUDUL (Delivery / DPK)
        doc.font('Helvetica-Bold').fontSize(12);

        // Cetak judul
        doc.text(from_act, leftX, sigStartY, { align: "center", width: boxWidth });
        doc.text(to_act, rightX, sigStartY, { align: "center", width: boxWidth });

        // 2. QR CODE (POSISI BARU: sejajar dengan judul, di tengah)
        const qrUrl = `${pathUrl}:3200/files/handover/${fileName}`;
        const qrData = await qr.toDataURL(qrUrl);
        // Geser Y sedikit (-5) biar pas tengah secara visual
        doc.image(qrData, centerX - 35, sigStartY - 5, { width: 70 });

        // 3. GARIS TANDA TANGAN
        // Jarak diperkecil (misal 50pt dari startY, sebelumnya terlalu lebar)
        const lineY = sigStartY + 50;

        doc.moveTo(leftX, lineY).lineTo(leftX + boxWidth, lineY).lineWidth(1).stroke();
        doc.moveTo(rightX, lineY).lineTo(rightX + boxWidth, lineY).lineWidth(1).stroke();

        // 4. NAMA USER
        doc.font('Helvetica').fontSize(11);
        doc.text(dataUser.createdby_name, leftX, lineY + 5, { width: boxWidth, align: "center" });
        doc.text(dataUser.receivedby_name, rightX, lineY + 5, { width: boxWidth, align: "center" });

        // 5. WAKTU (Jam) - Jika ingin warna merah seperti contoh, gunakan fillColor('red')
        // Jika ingin hitam/abu standar hapus .fillColor('red')
        // doc.fontSize(10).fillColor('red');
        doc.text(createdHour, leftX, lineY + 20, { width: boxWidth, align: "center" });
        doc.text(receivedHour, rightX, lineY + 20, { width: boxWidth, align: "center" });

        doc.end();
        await new Promise((resolve) => stream.on("finish", resolve));

        return { fileName, filePath };
    }

    async listDPKFromDelivery(server) {
        let connection;
        let dbClient;


        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            // ---------------------------------------------------------
            // 1️⃣   Ambil data postage yg sedang ada di checkpoint tertentu
            //      Tapi JOIN pivot agar dapat group ID
            // ---------------------------------------------------------
            const queryPostgres = `
            SELECT 
                t.m_inout_id,
                t.driverby,
                t.adw_trackingsj_id,
                t.checkpoin_id,
                gs.adw_handover_group_id
            FROM adw_trackingsj t
            LEFT JOIN adw_group_sj gs 
                ON gs.adw_trackingsj_id = t.adw_trackingsj_id
            WHERE t.checkpoin_id = $1
            ORDER BY t.documentno DESC
            `;

            const resultPg = await dbClient.query(queryPostgres, ['2']);

            const postgresRows = resultPg.rows || [];

            if (postgresRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // ---------------------------------------------------------
            // 2️⃣ Ambil detail SJ dari Oracle berdasarkan m_inout_id
            // ---------------------------------------------------------
            const inoutIds = postgresRows.map(r => r.m_inout_id);

            const oracleQuery = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                SPPNO
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${inoutIds.map((_, i) => `:${i + 1}`).join(',')})
            ORDER BY mi.DOCUMENTNO DESC
            `;

            const oracleRows = await connection.execute(
                oracleQuery,
                inoutIds,
                { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
            );

            const oracleMap = new Map(
                oracleRows.rows.map(row => [String(row.M_INOUT_ID), row])
            );

            // Generate PDF


            // ---------------------------------------------------------
            // 3️⃣ Gabungkan PostgreSQL + Oracle
            // ---------------------------------------------------------
            const combined = postgresRows.map(pg => {
                const o = oracleMap.get(String(pg.m_inout_id));

                return {
                    ...pg,
                    driverby: Number(pg.driverby),
                    documentno: o ? o.DOCUMENTNO : 'N/A',
                    customer: o ? o.CUSTOMER : 'N/A',
                    plantime: o ? o.PLANTIME : null,
                    sppno: o ? o.SPPNO : 'N/A'
                };
            });

            // ---------------------------------------------------------
            // 4️⃣ Ambil data group berdasarkan group IDs hasil pivot
            // ---------------------------------------------------------
            const groupIds = [
                ...new Set(combined.map(s => s.adw_handover_group_id).filter(Boolean))
            ];

            const groupDataMap = new Map();

            if (groupIds.length > 0) {
                const groupQuery = `
                SELECT 
                    adw_handover_group_id,
                    documentno,
                    created
                FROM adw_handover_group
                WHERE adw_handover_group_id = ANY($1::int[])
                `;

                const groupRows = await dbClient.query(groupQuery, [groupIds]);
                groupRows.rows.forEach(row => {
                    groupDataMap.set(row.adw_handover_group_id, {
                        bundleNo: row.documentno,
                        created: row.created
                    });
                });
            }

            // ---------------------------------------------------------
            // 5️⃣ Kelompokkan data sesuai bundle (group)
            // ---------------------------------------------------------
            const grouped = {};

            combined.forEach(item => {
                const gid = item.adw_handover_group_id;
                if (!gid) return;

                if (!grouped[gid]) {
                    const info = groupDataMap.get(gid);
                    grouped[gid] = {
                        bundleNo: info?.bundleNo || 'N/A',
                        created: info?.created || null,
                        shipments: []
                    };
                }

                const { adw_handover_group_id, ...shipmentDetail } = item;
                grouped[gid].shipments.push(shipmentDetail);
            });

            // Convert ke array
            const finalData = Object.values(grouped);

            return {
                success: true,
                count: finalData.length,
                data: finalData
            };

        } catch (err) {
            console.error(err);
            return { success: false, message: 'Server error' };
        } finally {
            if (connection) await connection.close();
            if (dbClient) await dbClient.release();
        }
    }

    async processDPKFromDelivery(server, bundles, userId) {
        let dbClient;


        try {
            dbClient = await server.pg.connect();
            await dbClient.query("BEGIN");

            const processedShipments = [];

            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            for (const bundle of bundles) {


                // 1️⃣ AMBIL LIST TRACKING DARI BUNDLE LAMA (pivot)
                const getOldPivotQuery = `
                SELECT gs.adw_trackingsj_id, t.m_inout_id
                FROM adw_group_sj gs
                JOIN adw_trackingsj t ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                WHERE hg.documentno = $1
            `;
                const oldPivotRows = await dbClient.query(getOldPivotQuery, [bundle.bundleNo]);

                if (oldPivotRows.rowCount === 0) {
                    console.warn(`Bundle ${bundle.bundleNo} tidak punya shipment di pivot.`);
                    continue;
                }

                for (const row of oldPivotRows.rows) {
                    const { adw_trackingsj_id, m_inout_id } = row;

                    // UPDATE TRACKINGSJ
                    const updateTrackingQuery = `
                    UPDATE adw_trackingsj
                    SET updated = NOW(),
                        updatedby = $1,
                        checkpoin_id = $2
                    WHERE adw_trackingsj_id = $3
                    RETURNING adw_trackingsj_id, m_inout_id
                `;
                    const updated = await dbClient.query(updateTrackingQuery, [
                        userId,
                        '3', //next checkpoint
                        adw_trackingsj_id
                    ]);

                    processedShipments.push(updated.rows[0]);

                    // INSERT EVENT
                    const insertEventQuery = `
                    INSERT INTO adw_trackingsj_events(
                        ad_client_id, ad_org_id, ad_user_id,
                        adw_event_type, adw_from_actor, adw_to_actor,
                        adw_trackingsj_id,
                        created, createdby, isactive,
                        updated, updatedby, checkpoin_id
                    ) VALUES(
                        1000003, 1000003, $1,
                        'ACCEPTANCE',
                        $2, $3,
                        $4,
                        NOW(), $1, 'Y',
                        NOW(), $1, $5
                    )
                `;
                    await dbClient.query(insertEventQuery, [
                        userId,
                        'Delivery', //from
                        'DPK', //to
                        adw_trackingsj_id,
                        '3' //next checkpoint
                    ]);
                }

                // UPDATE HANDOVER GROUP
                const updateHandoverGroupQuery = `
                    UPDATE adw_handover_group
                    SET 
                        received = NOW(),
                        receivedby = $1,
                        updated = NOW(),
                        updatedby = $1
                    WHERE documentno = $2
                `;
                const updateResult = await dbClient.query(updateHandoverGroupQuery, [
                    userId,
                    bundle.bundleNo
                ]);

                if (updateResult.rowCount === 0) {
                    throw new Error(`Update gagal: documentno ${bundle.bundleNo} tidak ditemukan.`);
                }

                console.log("Update handover group berhasil. rowCount =", updateResult.rowCount);



                // Generate PDF
                const { listShipment, dataUser, bundleNo, bundleCheckpoint, dateHandover } = await server.tms.listBundleDetailPDF(dbClient, bundle.bundleNo)
                const payload = {
                    listShipment,
                    dataUser,
                    bundleNo,
                    bundleCheckpoint,
                    dateHandover
                }

                console.log('test received name : ', dataUser.receivedby_name);


                const { fileName, filePath } = await this.generateHandoverPdf(payload, "Delivery", "DPK")


                if (fileName) {
                    const updateHandoverGroupAttachment = `
                    UPDATE adw_handover_group
                    SET 
                        updated = NOW(),
                        updatedby = $1,
                        attachment = $2
                    WHERE documentno = $3
                `;
                    await dbClient.query(updateHandoverGroupAttachment, [
                        userId,
                        fileName,
                        bundle.bundleNo
                    ]);
                }
            }

            await dbClient.query("COMMIT");
            return {
                success: true,
                rows: processedShipments,
                message: `ACCEPTED and new bundle created successfully`
            };

        } catch (err) {
            await dbClient.query("ROLLBACK");
            console.error(err);
            return { success: false, message: "Error processing accepted bundles" };
        } finally {
            if (dbClient) dbClient.release();
        }
    }

    async listDriverFromDPK(server) {
        let connection;
        let dbClient;

        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            // 1. Ambil data grouping DPK
            const groupQuery = `
        SELECT 
            g.adw_handover_group_id,
            g.documentno,
            g.created,
            gs.adw_trackingsj_id
        FROM adw_handover_group g
        INNER JOIN adw_group_sj gs 
            ON gs.adw_handover_group_id = g.adw_handover_group_id
        WHERE g.checkpoint = '4'
        ORDER BY g.created DESC
    `;

            const groupResult = await dbClient.query(groupQuery);
            const groupRows = groupResult.rows || [];

            if (groupRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // 2. Grouping bundle
            const groupMap = new Map();
            for (const row of groupRows) {
                // FIX: Pastikan ID Group juga konsisten string
                const groupId = String(row.adw_handover_group_id);

                if (!groupMap.has(groupId)) {
                    groupMap.set(groupId, {
                        bundleNo: row.documentno,
                        created: row.created,
                        trackingIds: []
                    });
                }
                // FIX: Push ID sebagai String agar aman saat lookup nanti
                if (row.adw_trackingsj_id) {
                    groupMap.get(groupId).trackingIds.push(String(row.adw_trackingsj_id));
                }
            }

            // 3. Semua tracking valid
            const allTrackingIds = [...new Set(
                groupRows
                    .map(r => r.adw_trackingsj_id)
                    .filter(id => id !== null)
                // Tidak perlu String() di sini karena array ini untuk parameter query SQL ($1)
                // Postgres driver biasanya handle konversi tipe otomatis untuk parameter
            )];

            if (allTrackingIds.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // 4. Ambil data tracking 
            const trackingQuery = `
        SELECT 
            sj.adw_trackingsj_id,
            sj.m_inout_id,
            sj.driverby,
            sj.tnkb_id,
            sj.checkpoin_id,
            au.name AS drivername
        FROM adw_trackingsj sj
        LEFT JOIN ad_user au ON sj.driverby = au.ad_user_id
        WHERE sj.adw_trackingsj_id = ANY($1)
    `;

            const trackingResult = await dbClient.query(trackingQuery, [allTrackingIds]);
            const trackingRows = trackingResult.rows || [];

            // FIX: Konversi Key menjadi String saat set Map
            const trackingMap = new Map(
                trackingRows.map(t => [String(t.adw_trackingsj_id), t])
            );

            // 5. Ambil semua M_INOUT_ID untuk query di Oracle
            const inoutIds = [...new Set(
                trackingRows
                    .map(t => t.m_inout_id)
                    .filter(id => id !== null)
            )];

            let oracleMap = new Map();

            if (inoutIds.length > 0) {
                // Query Oracle tetap sama
                const oracleQuery = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') 
                    || ' ' || TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                SPPNO
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${inoutIds.map((_, i) => `:${i + 1}`).join(',')})
            ORDER BY mi.DOCUMENTNO DESC
        `;

                const oracleRows = await connection.execute(
                    oracleQuery,
                    inoutIds,
                    { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
                );

                // FIX: Pastikan Key menjadi String saat set Map
                // Perhatikan: Oracle sering mengembalikan Key UPPERCASE (M_INOUT_ID)
                oracleMap = new Map(
                    oracleRows.rows.map(o => [String(o.M_INOUT_ID), o])
                );

                // Debugging: Cek apakah map terisi dengan key String
                // console.log("Oracle Map Keys:", [...oracleMap.keys()]);
            }

            // 6. Susun final data output
            const finalData = [];

            for (const [groupId, groupData] of groupMap.entries()) {
                const shipments = [];

                // tid di sini sudah String karena kita push String di langkah #2
                for (const tid of groupData.trackingIds) {
                    const t = trackingMap.get(tid);

                    if (!t) {
                        shipments.push({
                            adw_trackingsj_id: tid,
                            m_inout_id: null,
                            driverby: null,
                            drivername: null,
                            documentno: "N/A (Tracking Missing)", // Indikator error tracking
                            customer: "N/A",
                            plantime: null,
                            sppno: "N/A",
                        });
                        continue;
                    }

                    // FIX: Gunakan String() saat lookup ke Oracle Map
                    // Gunakan optional chaining (?.) untuk amannya
                    const oracleKey = t.m_inout_id ? String(t.m_inout_id) : null;
                    const o = oracleKey ? oracleMap.get(oracleKey) : undefined;

                    shipments.push({
                        adw_trackingsj_id: tid,
                        m_inout_id: t.m_inout_id,
                        driverby: t.driverby,
                        drivername: t.drivername,
                        // Gunakan operator ?? untuk default value jika 'o' undefined
                        documentno: o?.DOCUMENTNO ?? "N/A",
                        customer: o?.CUSTOMER ?? "N/A",
                        plantime: o?.PLANTIME ?? null,
                        sppno: o?.SPPNO ?? "N/A",
                    });
                }

                finalData.push({
                    bundleNo: groupData.bundleNo,
                    created: groupData.created,
                    shipments
                });
            }

            return {
                success: true,
                count: finalData.length,
                data: finalData
            };

        } catch (err) {
            console.error(err);
            return { success: false, message: 'Server error' };
        } finally {
            if (connection) await connection.close();
            if (dbClient) await dbClient.release();
        }
    }

    async listDriverFromDPK2(server) {
        let connection;
        let dbClient;


        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            // ---------------------------------------------------------
            // 1️⃣   Ambil data postage yg sedang ada di checkpoint tertentu
            //      Tapi JOIN pivot agar dapat group ID
            // ---------------------------------------------------------
            const queryPostgres = `
                SELECT 
                    t.m_inout_id,
                    t.driverby,
                    t.adw_trackingsj_id,
                    t.checkpoin_id,
                    gs.adw_handover_group_id
                FROM adw_trackingsj t
                LEFT JOIN adw_group_sj gs ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                LEFT JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                WHERE t.checkpoin_id = $1
                AND hg.checkpoint = $1   -- Tambahan penting
                ORDER BY t.documentno DESC
            `;

            const resultPg = await dbClient.query(queryPostgres, ['4']);

            const postgresRows = resultPg.rows || [];

            if (postgresRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // ---------------------------------------------------------
            // 2️⃣ Ambil detail SJ dari Oracle berdasarkan m_inout_id
            // ---------------------------------------------------------
            const inoutIds = postgresRows.map(r => r.m_inout_id);

            const oracleQuery = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                SPPNO
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${inoutIds.map((_, i) => `:${i + 1}`).join(',')})
            ORDER BY mi.DOCUMENTNO DESC
            `;

            const oracleRows = await connection.execute(
                oracleQuery,
                inoutIds,
                { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
            );

            const oracleMap = new Map(
                oracleRows.rows.map(row => [String(row.M_INOUT_ID), row])
            );

            // ---------------------------------------------------------
            // 3️⃣ Gabungkan PostgreSQL + Oracle
            // ---------------------------------------------------------
            const combined = postgresRows.map(pg => {
                const o = oracleMap.get(String(pg.m_inout_id));

                return {
                    ...pg,
                    driverby: Number(pg.driverby),
                    documentno: o ? o.DOCUMENTNO : 'N/A',
                    customer: o ? o.CUSTOMER : 'N/A',
                    plantime: o ? o.PLANTIME : null,
                    sppno: o ? o.SPPNO : 'N/A'
                };
            });

            // ---------------------------------------------------------
            // 4️⃣ Ambil data group berdasarkan group IDs hasil pivot
            // ---------------------------------------------------------
            const groupIds = [
                ...new Set(combined.map(s => s.adw_handover_group_id).filter(Boolean))
            ];

            const groupDataMap = new Map();

            if (groupIds.length > 0) {
                const groupQuery = `
                SELECT 
                    adw_handover_group_id,
                    documentno,
                    created
                FROM adw_handover_group
                WHERE adw_handover_group_id = ANY($1::int[])
                `;

                const groupRows = await dbClient.query(groupQuery, [groupIds]);
                groupRows.rows.forEach(row => {
                    groupDataMap.set(row.adw_handover_group_id, {
                        bundleNo: row.documentno,
                        created: row.created
                    });
                });
            }

            // ---------------------------------------------------------
            // 5️⃣ Kelompokkan data sesuai bundle (group)
            // ---------------------------------------------------------
            const grouped = {};

            combined.forEach(item => {
                const gid = item.adw_handover_group_id;
                if (!gid) return;

                if (!grouped[gid]) {
                    const info = groupDataMap.get(gid);
                    grouped[gid] = {
                        bundleNo: info?.bundleNo || 'N/A',
                        created: info?.created || null,
                        shipments: []
                    };
                }

                const { adw_handover_group_id, ...shipmentDetail } = item;
                grouped[gid].shipments.push(shipmentDetail);
            });

            // Convert ke array
            const finalData = Object.values(grouped);

            return {
                success: true,
                count: finalData.length,
                data: finalData
            };

        } catch (err) {
            console.error(err);
            return { success: false, message: 'Server error' };
        } finally {
            if (connection) await connection.close();
            if (dbClient) await dbClient.release();
        }
    }

    async processDriverFromDPK(server, bundles, userId) {
        let dbClient;


        try {
            dbClient = await server.pg.connect();
            await dbClient.query("BEGIN");

            const processedShipments = [];

            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            for (const bundle of bundles) {

                // 🔎 Ambil groupId berdasarkan bundleNo (documentno)
                const getGroupIdQuery = `
                    SELECT adw_handover_group_id
                    FROM adw_handover_group
                    WHERE documentno = $1
                `;
                const groupRes = await dbClient.query(getGroupIdQuery, [bundle.bundleNo]);

                if (groupRes.rowCount === 0) {
                    console.warn(`Group untuk bundle ${bundle.bundleNo} tidak ditemukan`);
                    continue;
                }

                const groupId = groupRes.rows[0].adw_handover_group_id;

                // 1️⃣ AMBIL LIST TRACKING DARI PIVOT
                const getOldPivotQuery = `
                    SELECT gs.adw_trackingsj_id, t.m_inout_id
                    FROM adw_group_sj gs
                    JOIN adw_trackingsj t ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                    JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                    WHERE hg.documentno = $1
                `;
                const oldPivotRows = await dbClient.query(getOldPivotQuery, [bundle.bundleNo]);


                for (const row of oldPivotRows.rows) {
                    const { adw_trackingsj_id, m_inout_id } = row;

                    // UPDATE TRACKINGSJ
                    const updateTrackingQuery = `
                        UPDATE adw_trackingsj
                        SET updated = NOW(),
                            updatedby = $1,
                            checkpoin_id = $2
                        WHERE adw_trackingsj_id = $3
                        RETURNING adw_trackingsj_id, m_inout_id
                    `;
                    const updated = await dbClient.query(updateTrackingQuery, [
                        userId,
                        '5',
                        adw_trackingsj_id
                    ]);

                    processedShipments.push(updated.rows[0]);

                    // INSERT EVENT
                    const insertEventQuery = `
                        INSERT INTO adw_trackingsj_events(
                            ad_client_id, ad_org_id, ad_user_id,
                            adw_event_type, adw_from_actor, adw_to_actor,
                            adw_trackingsj_id,
                            created, createdby, isactive,
                            updated, updatedby, checkpoin_id
                        ) VALUES(
                            1000003, 1000003, $1,
                            'ACCEPTANCE',
                            'DPK', 'Driver',
                            $2,
                            NOW(), $1, 'Y',
                            NOW(), $1, $3
                        )
                    `;
                    await dbClient.query(insertEventQuery, [userId, adw_trackingsj_id, '5']);
                }

                // UPDATE HANDOVER GROUP
                const updateHandoverGroupQuery = `
                    UPDATE adw_handover_group
                    SET 
                        received = NOW(),
                        receivedby = $1,
                        updated = NOW(),
                        updatedby = $1
                    WHERE documentno = $2
                `;

                const updateResult = await dbClient.query(updateHandoverGroupQuery, [
                    userId,
                    bundle.bundleNo
                ]);

                if (updateResult.rowCount === 0) {
                    throw new Error(`Update gagal: documentno ${bundle.bundleNo} tidak ditemukan.`);
                }

                console.log("Update handover group berhasil. rowCount =", updateResult.rowCount);



                // Generate PDF
                const { listShipment, dataUser, bundleNo, bundleCheckpoint, dateHandover } = await server.tms.listBundleDetailPDF(dbClient, bundle.bundleNo)
                const payload = {
                    listShipment,
                    dataUser,
                    bundleNo,
                    bundleCheckpoint,
                    dateHandover
                }

                console.log('test received name : ', dataUser.receivedby_name);


                const { fileName, filePath } = await this.generateHandoverPdf(payload, "DPK", "Driver")


                if (fileName) {
                    const updateHandoverGroupAttachment = `
                    UPDATE adw_handover_group
                    SET 
                        updated = NOW(),
                        updatedby = $1,
                        attachment = $2
                    WHERE documentno = $3
                `;
                    await dbClient.query(updateHandoverGroupAttachment, [
                        userId,
                        fileName,
                        bundle.bundleNo
                    ]);
                }
            }


            await dbClient.query("COMMIT");
            return {
                success: true,
                rows: processedShipments,
                message: `ACCEPTED and new bundle created successfully`
            };

        } catch (err) {
            await dbClient.query("ROLLBACK");
            console.error(err);
            return { success: false, message: "Error processing accepted bundles" };
        } finally {
            if (dbClient) dbClient.release();
        }
    }


    async listDPKFromDriver(server) {
        let connection;
        let dbClient;


        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            // ---------------------------------------------------------
            // 1️⃣   Ambil data postage yg sedang ada di checkpoint tertentu
            //      Tapi JOIN pivot agar dapat group ID
            // ---------------------------------------------------------
            const queryPostgres = `
                SELECT 
                    t.m_inout_id,
                    t.driverby,
                    t.adw_trackingsj_id,
                    t.checkpoin_id,
                    gs.adw_handover_group_id
                FROM adw_trackingsj t
                LEFT JOIN adw_group_sj gs ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                LEFT JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                WHERE t.checkpoin_id = $1
                AND hg.checkpoint = $1   -- Tambahan penting
                ORDER BY t.documentno DESC
            `;

            const resultPg = await dbClient.query(queryPostgres, ['6']);

            const postgresRows = resultPg.rows || [];

            if (postgresRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // ---------------------------------------------------------
            // 2️⃣ Ambil detail SJ dari Oracle berdasarkan m_inout_id
            // ---------------------------------------------------------
            const inoutIds = postgresRows.map(r => r.m_inout_id);

            const oracleQuery = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                SPPNO
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${inoutIds.map((_, i) => `:${i + 1}`).join(',')})
            ORDER BY mi.DOCUMENTNO DESC
            `;

            const oracleRows = await connection.execute(
                oracleQuery,
                inoutIds,
                { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
            );

            const oracleMap = new Map(
                oracleRows.rows.map(row => [String(row.M_INOUT_ID), row])
            );

            // ---------------------------------------------------------
            // 3️⃣ Gabungkan PostgreSQL + Oracle
            // ---------------------------------------------------------
            const combined = postgresRows.map(pg => {
                const o = oracleMap.get(String(pg.m_inout_id));

                return {
                    ...pg,
                    driverby: Number(pg.driverby),
                    documentno: o ? o.DOCUMENTNO : 'N/A',
                    customer: o ? o.CUSTOMER : 'N/A',
                    plantime: o ? o.PLANTIME : null,
                    sppno: o ? o.SPPNO : 'N/A'
                };
            });

            // ---------------------------------------------------------
            // 4️⃣ Ambil data group berdasarkan group IDs hasil pivot
            // ---------------------------------------------------------
            const groupIds = [
                ...new Set(combined.map(s => s.adw_handover_group_id).filter(Boolean))
            ];

            const groupDataMap = new Map();

            if (groupIds.length > 0) {
                const groupQuery = `
                SELECT 
                    adw_handover_group_id,
                    documentno,
                    created
                FROM adw_handover_group
                WHERE adw_handover_group_id = ANY($1::int[])
                `;

                const groupRows = await dbClient.query(groupQuery, [groupIds]);
                groupRows.rows.forEach(row => {
                    groupDataMap.set(row.adw_handover_group_id, {
                        bundleNo: row.documentno,
                        created: row.created
                    });
                });
            }

            // ---------------------------------------------------------
            // 5️⃣ Kelompokkan data sesuai bundle (group)
            // ---------------------------------------------------------
            const grouped = {};

            combined.forEach(item => {
                const gid = item.adw_handover_group_id;
                if (!gid) return;

                if (!grouped[gid]) {
                    const info = groupDataMap.get(gid);
                    grouped[gid] = {
                        bundleNo: info?.bundleNo || 'N/A',
                        created: info?.created || null,
                        shipments: []
                    };
                }

                const { adw_handover_group_id, ...shipmentDetail } = item;
                grouped[gid].shipments.push(shipmentDetail);
            });

            // Convert ke array
            const finalData = Object.values(grouped);

            return {
                success: true,
                count: finalData.length,
                data: finalData
            };

        } catch (err) {
            console.error(err);
            return { success: false, message: 'Server error' };
        } finally {
            if (connection) await connection.close();
            if (dbClient) await dbClient.release();
        }
    }

    async processDPKFromDriver(server, bundles, userId) {
        let dbClient;


        try {
            dbClient = await server.pg.connect();
            await dbClient.query("BEGIN");

            const processedShipments = [];

            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            for (const bundle of bundles) {

                // 🔎 Ambil groupId berdasarkan bundleNo (documentno)
                const getGroupIdQuery = `
                    SELECT adw_handover_group_id
                    FROM adw_handover_group
                    WHERE documentno = $1
                `;
                const groupRes = await dbClient.query(getGroupIdQuery, [bundle.bundleNo]);

                if (groupRes.rowCount === 0) {
                    console.warn(`Group untuk bundle ${bundle.bundleNo} tidak ditemukan`);
                    continue;
                }

                const groupId = groupRes.rows[0].adw_handover_group_id;

                // 1️⃣ AMBIL LIST TRACKING DARI PIVOT
                const getOldPivotQuery = `
                    SELECT gs.adw_trackingsj_id, t.m_inout_id
                    FROM adw_group_sj gs
                    JOIN adw_trackingsj t ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                    JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                    WHERE hg.documentno = $1
                `;
                const oldPivotRows = await dbClient.query(getOldPivotQuery, [bundle.bundleNo]);


                for (const row of oldPivotRows.rows) {
                    const { adw_trackingsj_id, m_inout_id } = row;

                    // UPDATE TRACKINGSJ
                    const updateTrackingQuery = `
                        UPDATE adw_trackingsj
                        SET updated = NOW(),
                            updatedby = $1,
                            checkpoin_id = $2
                        WHERE adw_trackingsj_id = $3
                        RETURNING adw_trackingsj_id, m_inout_id
                    `;
                    const updated = await dbClient.query(updateTrackingQuery, [
                        userId,
                        '7',
                        adw_trackingsj_id
                    ]);

                    processedShipments.push(updated.rows[0]);

                    // INSERT EVENT
                    const insertEventQuery = `
                        INSERT INTO adw_trackingsj_events(
                            ad_client_id, ad_org_id, ad_user_id,
                            adw_event_type, adw_from_actor, adw_to_actor,
                            adw_trackingsj_id,
                            created, createdby, isactive,
                            updated, updatedby, checkpoin_id
                        ) VALUES(
                            1000003, 1000003, $1,
                            'ACCEPTANCE',
                            'Driver', 'DPK',
                            $2,
                            NOW(), $1, 'Y',
                            NOW(), $1, $3
                        )
                    `;
                    await dbClient.query(insertEventQuery, [userId, adw_trackingsj_id, '7']);
                }

                // UPDATE HANDOVER GROUP
                const updateHandoverGroupQuery = `
                    UPDATE adw_handover_group
                    SET 
                        received = NOW(),
                        receivedby = $1,
                        updated = NOW(),
                        updatedby = $1
                    WHERE documentno = $2
                `;
                const updateResult = await dbClient.query(updateHandoverGroupQuery, [
                    userId,
                    bundle.bundleNo
                ]);

                if (updateResult.rowCount === 0) {
                    throw new Error(`Update gagal: documentno ${bundle.bundleNo} tidak ditemukan.`);
                }

                console.log("Update handover group berhasil. rowCount =", updateResult.rowCount);



                // Generate PDF
                const { listShipment, dataUser, bundleNo, bundleCheckpoint, dateHandover } = await server.tms.listBundleDetailPDF(dbClient, bundle.bundleNo)
                const payload = {
                    listShipment,
                    dataUser,
                    bundleNo,
                    bundleCheckpoint,
                    dateHandover
                }

                console.log('test received name : ', dataUser.receivedby_name);


                const { fileName, filePath } = await this.generateHandoverPdf(payload, "Driver", "DPK")


                if (fileName) {
                    const updateHandoverGroupAttachment = `
                    UPDATE adw_handover_group
                    SET 
                        updated = NOW(),
                        updatedby = $1,
                        attachment = $2
                    WHERE documentno = $3
                `;
                    await dbClient.query(updateHandoverGroupAttachment, [
                        userId,
                        fileName,
                        bundle.bundleNo
                    ]);
                }
            }


            await dbClient.query("COMMIT");
            return {
                success: true,
                rows: processedShipments,
                message: `ACCEPTED and new bundle created successfully`
            };

        } catch (err) {
            await dbClient.query("ROLLBACK");
            console.error(err);
            return { success: false, message: "Error processing accepted bundles" };
        } finally {
            if (dbClient) dbClient.release();
        }
    }

    async listDeliveryFromDPK(server) {
        let connection;
        let dbClient;


        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            // ---------------------------------------------------------
            // 1️⃣   Ambil data postage yg sedang ada di checkpoint tertentu
            //      Tapi JOIN pivot agar dapat group ID
            // ---------------------------------------------------------
            const queryPostgres = `
                SELECT 
                    t.m_inout_id,
                    t.driverby,
                    t.adw_trackingsj_id,
                    t.checkpoin_id,
                    gs.adw_handover_group_id
                FROM adw_trackingsj t
                LEFT JOIN adw_group_sj gs ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                LEFT JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                WHERE t.checkpoin_id = $1
                AND hg.checkpoint = $1   -- Tambahan penting
                ORDER BY t.documentno DESC
            `;

            const resultPg = await dbClient.query(queryPostgres, ['8']);

            const postgresRows = resultPg.rows || [];

            if (postgresRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // ---------------------------------------------------------
            // 2️⃣ Ambil detail SJ dari Oracle berdasarkan m_inout_id
            // ---------------------------------------------------------
            const inoutIds = postgresRows.map(r => r.m_inout_id);

            const oracleQuery = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                SPPNO
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${inoutIds.map((_, i) => `:${i + 1}`).join(',')})
            ORDER BY mi.DOCUMENTNO DESC
            `;

            const oracleRows = await connection.execute(
                oracleQuery,
                inoutIds,
                { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
            );

            const oracleMap = new Map(
                oracleRows.rows.map(row => [String(row.M_INOUT_ID), row])
            );

            // ---------------------------------------------------------
            // 3️⃣ Gabungkan PostgreSQL + Oracle
            // ---------------------------------------------------------
            const combined = postgresRows.map(pg => {
                const o = oracleMap.get(String(pg.m_inout_id));

                return {
                    ...pg,
                    driverby: Number(pg.driverby),
                    documentno: o ? o.DOCUMENTNO : 'N/A',
                    customer: o ? o.CUSTOMER : 'N/A',
                    plantime: o ? o.PLANTIME : null,
                    sppno: o ? o.SPPNO : 'N/A'
                };
            });

            // ---------------------------------------------------------
            // 4️⃣ Ambil data group berdasarkan group IDs hasil pivot
            // ---------------------------------------------------------
            const groupIds = [
                ...new Set(combined.map(s => s.adw_handover_group_id).filter(Boolean))
            ];

            const groupDataMap = new Map();

            if (groupIds.length > 0) {
                const groupQuery = `
                SELECT 
                    adw_handover_group_id,
                    documentno,
                    created
                FROM adw_handover_group
                WHERE adw_handover_group_id = ANY($1::int[])
                `;

                const groupRows = await dbClient.query(groupQuery, [groupIds]);
                groupRows.rows.forEach(row => {
                    groupDataMap.set(row.adw_handover_group_id, {
                        bundleNo: row.documentno,
                        created: row.created
                    });
                });
            }

            // ---------------------------------------------------------
            // 5️⃣ Kelompokkan data sesuai bundle (group)
            // ---------------------------------------------------------
            const grouped = {};

            combined.forEach(item => {
                const gid = item.adw_handover_group_id;
                if (!gid) return;

                if (!grouped[gid]) {
                    const info = groupDataMap.get(gid);
                    grouped[gid] = {
                        bundleNo: info?.bundleNo || 'N/A',
                        created: info?.created || null,
                        shipments: []
                    };
                }

                const { adw_handover_group_id, ...shipmentDetail } = item;
                grouped[gid].shipments.push(shipmentDetail);
            });

            // Convert ke array
            const finalData = Object.values(grouped);

            return {
                success: true,
                count: finalData.length,
                data: finalData
            };

        } catch (err) {
            console.error(err);
            return { success: false, message: 'Server error' };
        } finally {
            if (connection) await connection.close();
            if (dbClient) await dbClient.release();
        }
    }


    async processDeliveryFromDPK(server, bundles, userId) {
        let dbClient;


        try {
            dbClient = await server.pg.connect();
            await dbClient.query("BEGIN");

            const processedShipments = [];

            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            for (const bundle of bundles) {

                // 🔎 Ambil groupId berdasarkan bundleNo (documentno)
                const getGroupIdQuery = `
                    SELECT adw_handover_group_id
                    FROM adw_handover_group
                    WHERE documentno = $1
                `;
                const groupRes = await dbClient.query(getGroupIdQuery, [bundle.bundleNo]);

                if (groupRes.rowCount === 0) {
                    console.warn(`Group untuk bundle ${bundle.bundleNo} tidak ditemukan`);
                    continue;
                }

                const groupId = groupRes.rows[0].adw_handover_group_id;

                // 1️⃣ AMBIL LIST TRACKING DARI PIVOT
                const getOldPivotQuery = `
                    SELECT gs.adw_trackingsj_id, t.m_inout_id
                    FROM adw_group_sj gs
                    JOIN adw_trackingsj t ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                    JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                    WHERE hg.documentno = $1
                `;
                const oldPivotRows = await dbClient.query(getOldPivotQuery, [bundle.bundleNo]);


                for (const row of oldPivotRows.rows) {
                    const { adw_trackingsj_id, m_inout_id } = row;

                    // UPDATE TRACKINGSJ
                    const updateTrackingQuery = `
                        UPDATE adw_trackingsj
                        SET updated = NOW(),
                            updatedby = $1,
                            checkpoin_id = $2
                        WHERE adw_trackingsj_id = $3
                        RETURNING adw_trackingsj_id, m_inout_id
                    `;
                    const updated = await dbClient.query(updateTrackingQuery, [
                        userId,
                        '9',
                        adw_trackingsj_id
                    ]);

                    processedShipments.push(updated.rows[0]);

                    // INSERT EVENT
                    const insertEventQuery = `
                        INSERT INTO adw_trackingsj_events(
                            ad_client_id, ad_org_id, ad_user_id,
                            adw_event_type, adw_from_actor, adw_to_actor,
                            adw_trackingsj_id,
                            created, createdby, isactive,
                            updated, updatedby, checkpoin_id
                        ) VALUES(
                            1000003, 1000003, $1,
                            'ACCEPTANCE',
                            'DPK', 'Delivery',
                            $2,
                            NOW(), $1, 'Y',
                            NOW(), $1, $3
                        )
                    `;
                    await dbClient.query(insertEventQuery, [userId, adw_trackingsj_id, '9']);
                }

                // UPDATE HANDOVER GROUP
                const updateHandoverGroupQuery = `
                    UPDATE adw_handover_group
                    SET 
                        received = NOW(),
                        receivedby = $1,
                        updated = NOW(),
                        updatedby = $1
                    WHERE documentno = $2
                `;
                const updateResult = await dbClient.query(updateHandoverGroupQuery, [
                    userId,
                    bundle.bundleNo
                ]);

                if (updateResult.rowCount === 0) {
                    throw new Error(`Update gagal: documentno ${bundle.bundleNo} tidak ditemukan.`);
                }

                console.log("Update handover group berhasil. rowCount =", updateResult.rowCount);



                // Generate PDF
                const { listShipment, dataUser, bundleNo, bundleCheckpoint, dateHandover } = await server.tms.listBundleDetailPDF(dbClient, bundle.bundleNo)
                const payload = {
                    listShipment,
                    dataUser,
                    bundleNo,
                    bundleCheckpoint,
                    dateHandover
                }

                console.log('test received name : ', dataUser.receivedby_name);


                const { fileName, filePath } = await this.generateHandoverPdf(payload, "DPK", "Delivery")


                if (fileName) {
                    const updateHandoverGroupAttachment = `
                    UPDATE adw_handover_group
                    SET 
                        updated = NOW(),
                        updatedby = $1,
                        attachment = $2
                    WHERE documentno = $3
                `;
                    await dbClient.query(updateHandoverGroupAttachment, [
                        userId,
                        fileName,
                        bundle.bundleNo
                    ]);
                }
            }


            await dbClient.query("COMMIT");
            return {
                success: true,
                rows: processedShipments,
                message: `ACCEPTED and new bundle created successfully`
            };

        } catch (err) {
            await dbClient.query("ROLLBACK");
            console.error(err);
            return { success: false, message: "Error processing accepted bundles" };
        } finally {
            if (dbClient) dbClient.release();
        }
    }

    async listMKTFromDelivery(server) {
        let connection;
        let dbClient;


        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            // ---------------------------------------------------------
            // 1️⃣   Ambil data postage yg sedang ada di checkpoint tertentu
            //      Tapi JOIN pivot agar dapat group ID
            // ---------------------------------------------------------
            const queryPostgres = `
                SELECT 
                    t.m_inout_id,
                    t.driverby,
                    t.adw_trackingsj_id,
                    t.checkpoin_id,
                    gs.adw_handover_group_id
                FROM adw_trackingsj t
                LEFT JOIN adw_group_sj gs ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                LEFT JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                WHERE t.checkpoin_id = $1
                AND hg.checkpoint = $1   -- Tambahan penting
                ORDER BY t.documentno DESC
            `;

            const resultPg = await dbClient.query(queryPostgres, ['10']);

            const postgresRows = resultPg.rows || [];

            if (postgresRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // ---------------------------------------------------------
            // 2️⃣ Ambil detail SJ dari Oracle berdasarkan m_inout_id
            // ---------------------------------------------------------
            const inoutIds = postgresRows.map(r => r.m_inout_id);

            const oracleQuery = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                SPPNO
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${inoutIds.map((_, i) => `:${i + 1}`).join(',')})
            ORDER BY mi.DOCUMENTNO DESC
            `;

            const oracleRows = await connection.execute(
                oracleQuery,
                inoutIds,
                { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
            );

            const oracleMap = new Map(
                oracleRows.rows.map(row => [String(row.M_INOUT_ID), row])
            );

            // ---------------------------------------------------------
            // 3️⃣ Gabungkan PostgreSQL + Oracle
            // ---------------------------------------------------------
            const combined = postgresRows.map(pg => {
                const o = oracleMap.get(String(pg.m_inout_id));

                return {
                    ...pg,
                    driverby: Number(pg.driverby),
                    documentno: o ? o.DOCUMENTNO : 'N/A',
                    customer: o ? o.CUSTOMER : 'N/A',
                    plantime: o ? o.PLANTIME : null,
                    sppno: o ? o.SPPNO : 'N/A'
                };
            });

            // ---------------------------------------------------------
            // 4️⃣ Ambil data group berdasarkan group IDs hasil pivot
            // ---------------------------------------------------------
            const groupIds = [
                ...new Set(combined.map(s => s.adw_handover_group_id).filter(Boolean))
            ];

            const groupDataMap = new Map();

            if (groupIds.length > 0) {
                const groupQuery = `
                SELECT 
                    adw_handover_group_id,
                    documentno,
                    created
                FROM adw_handover_group
                WHERE adw_handover_group_id = ANY($1::int[])
                `;

                const groupRows = await dbClient.query(groupQuery, [groupIds]);
                groupRows.rows.forEach(row => {
                    groupDataMap.set(row.adw_handover_group_id, {
                        bundleNo: row.documentno,
                        created: row.created
                    });
                });
            }

            // ---------------------------------------------------------
            // 5️⃣ Kelompokkan data sesuai bundle (group)
            // ---------------------------------------------------------
            const grouped = {};

            combined.forEach(item => {
                const gid = item.adw_handover_group_id;
                if (!gid) return;

                if (!grouped[gid]) {
                    const info = groupDataMap.get(gid);
                    grouped[gid] = {
                        bundleNo: info?.bundleNo || 'N/A',
                        created: info?.created || null,
                        shipments: []
                    };
                }

                const { adw_handover_group_id, ...shipmentDetail } = item;
                grouped[gid].shipments.push(shipmentDetail);
            });

            // Convert ke array
            const finalData = Object.values(grouped);

            return {
                success: true,
                count: finalData.length,
                data: finalData
            };

        } catch (err) {
            console.error(err);
            return { success: false, message: 'Server error' };
        } finally {
            if (connection) await connection.close();
            if (dbClient) await dbClient.release();
        }
    }


    async processMKTFromDelivery(server, bundles, userId) {
        let dbClient;


        try {
            dbClient = await server.pg.connect();
            await dbClient.query("BEGIN");

            const processedShipments = [];

            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            for (const bundle of bundles) {

                // 🔎 Ambil groupId berdasarkan bundleNo (documentno)
                const getGroupIdQuery = `
                    SELECT adw_handover_group_id
                    FROM adw_handover_group
                    WHERE documentno = $1
                `;
                const groupRes = await dbClient.query(getGroupIdQuery, [bundle.bundleNo]);

                if (groupRes.rowCount === 0) {
                    console.warn(`Group untuk bundle ${bundle.bundleNo} tidak ditemukan`);
                    continue;
                }

                const groupId = groupRes.rows[0].adw_handover_group_id;

                // 1️⃣ AMBIL LIST TRACKING DARI PIVOT
                const getOldPivotQuery = `
                    SELECT gs.adw_trackingsj_id, t.m_inout_id
                    FROM adw_group_sj gs
                    JOIN adw_trackingsj t ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                    JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                    WHERE hg.documentno = $1
                `;
                const oldPivotRows = await dbClient.query(getOldPivotQuery, [bundle.bundleNo]);


                for (const row of oldPivotRows.rows) {
                    const { adw_trackingsj_id, m_inout_id } = row;

                    // UPDATE TRACKINGSJ
                    const updateTrackingQuery = `
                        UPDATE adw_trackingsj
                        SET updated = NOW(),
                            updatedby = $1,
                            checkpoin_id = $2
                        WHERE adw_trackingsj_id = $3
                        RETURNING adw_trackingsj_id, m_inout_id
                    `;
                    const updated = await dbClient.query(updateTrackingQuery, [
                        userId,
                        '11',
                        adw_trackingsj_id
                    ]);

                    processedShipments.push(updated.rows[0]);

                    // INSERT EVENT
                    const insertEventQuery = `
                        INSERT INTO adw_trackingsj_events(
                            ad_client_id, ad_org_id, ad_user_id,
                            adw_event_type, adw_from_actor, adw_to_actor,
                            adw_trackingsj_id,
                            created, createdby, isactive,
                            updated, updatedby, checkpoin_id
                        ) VALUES(
                            1000003, 1000003, $1,
                            'ACCEPTANCE',
                            'Delivery', 'MKT',
                            $2,
                            NOW(), $1, 'Y',
                            NOW(), $1, $3
                        )
                    `;
                    await dbClient.query(insertEventQuery, [userId, adw_trackingsj_id, '11']);
                }

                // UPDATE HANDOVER GROUP
                const updateHandoverGroupQuery = `
                    UPDATE adw_handover_group
                    SET 
                        received = NOW(),
                        receivedby = $1,
                        updated = NOW(),
                        updatedby = $1
                    WHERE documentno = $2
                `;
                const updateResult = await dbClient.query(updateHandoverGroupQuery, [
                    userId,
                    bundle.bundleNo
                ]);

                if (updateResult.rowCount === 0) {
                    throw new Error(`Update gagal: documentno ${bundle.bundleNo} tidak ditemukan.`);
                }

                console.log("Update handover group berhasil. rowCount =", updateResult.rowCount);



                // Generate PDF
                const { listShipment, dataUser, bundleNo, bundleCheckpoint, dateHandover } = await server.tms.listBundleDetailPDF(dbClient, bundle.bundleNo)
                const payload = {
                    listShipment,
                    dataUser,
                    bundleNo,
                    bundleCheckpoint,
                    dateHandover
                }

                console.log('test received name : ', dataUser.receivedby_name);


                const { fileName, filePath } = await this.generateHandoverPdf(payload, "Delivery", "MKT")


                if (fileName) {
                    const updateHandoverGroupAttachment = `
                    UPDATE adw_handover_group
                    SET 
                        updated = NOW(),
                        updatedby = $1,
                        attachment = $2
                    WHERE documentno = $3
                `;
                    await dbClient.query(updateHandoverGroupAttachment, [
                        userId,
                        fileName,
                        bundle.bundleNo
                    ]);
                }
            }


            await dbClient.query("COMMIT");
            return {
                success: true,
                rows: processedShipments,
                message: `ACCEPTED and new bundle created successfully`
            };

        } catch (err) {
            await dbClient.query("ROLLBACK");
            console.error(err);
            return { success: false, message: "Error processing accepted bundles" };
        } finally {
            if (dbClient) dbClient.release();
        }
    }

    async listFATFromMKT(server) {
        let connection;
        let dbClient;


        try {
            connection = await oracleDB.openConnection();
            dbClient = await server.pg.connect();

            // ---------------------------------------------------------
            // 1️⃣   Ambil data postage yg sedang ada di checkpoint tertentu
            //      Tapi JOIN pivot agar dapat group ID
            // ---------------------------------------------------------
            const queryPostgres = `
                SELECT 
                    t.m_inout_id,
                    t.driverby,
                    t.adw_trackingsj_id,
                    t.checkpoin_id,
                    gs.adw_handover_group_id
                FROM adw_trackingsj t
                LEFT JOIN adw_group_sj gs ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                LEFT JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                WHERE t.checkpoin_id = $1
                AND hg.checkpoint = $1   -- Tambahan penting
                ORDER BY t.documentno DESC
            `;

            const resultPg = await dbClient.query(queryPostgres, ['12']);

            const postgresRows = resultPg.rows || [];

            if (postgresRows.length === 0) {
                return { success: true, count: 0, data: [] };
            }

            // ---------------------------------------------------------
            // 2️⃣ Ambil detail SJ dari Oracle berdasarkan m_inout_id
            // ---------------------------------------------------------
            const inoutIds = postgresRows.map(r => r.m_inout_id);

            const oracleQuery = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                SPPNO
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${inoutIds.map((_, i) => `:${i + 1}`).join(',')})
            ORDER BY mi.DOCUMENTNO DESC
            `;

            const oracleRows = await connection.execute(
                oracleQuery,
                inoutIds,
                { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
            );

            const oracleMap = new Map(
                oracleRows.rows.map(row => [String(row.M_INOUT_ID), row])
            );

            // ---------------------------------------------------------
            // 3️⃣ Gabungkan PostgreSQL + Oracle
            // ---------------------------------------------------------
            const combined = postgresRows.map(pg => {
                const o = oracleMap.get(String(pg.m_inout_id));

                return {
                    ...pg,
                    driverby: Number(pg.driverby),
                    documentno: o ? o.DOCUMENTNO : 'N/A',
                    customer: o ? o.CUSTOMER : 'N/A',
                    plantime: o ? o.PLANTIME : null,
                    sppno: o ? o.SPPNO : 'N/A'
                };
            });

            // ---------------------------------------------------------
            // 4️⃣ Ambil data group berdasarkan group IDs hasil pivot
            // ---------------------------------------------------------
            const groupIds = [
                ...new Set(combined.map(s => s.adw_handover_group_id).filter(Boolean))
            ];

            const groupDataMap = new Map();

            if (groupIds.length > 0) {
                const groupQuery = `
                SELECT 
                    adw_handover_group_id,
                    documentno,
                    created
                FROM adw_handover_group
                WHERE adw_handover_group_id = ANY($1::int[])
                `;

                const groupRows = await dbClient.query(groupQuery, [groupIds]);
                groupRows.rows.forEach(row => {
                    groupDataMap.set(row.adw_handover_group_id, {
                        bundleNo: row.documentno,
                        created: row.created
                    });
                });
            }

            // ---------------------------------------------------------
            // 5️⃣ Kelompokkan data sesuai bundle (group)
            // ---------------------------------------------------------
            const grouped = {};

            combined.forEach(item => {
                const gid = item.adw_handover_group_id;
                if (!gid) return;

                if (!grouped[gid]) {
                    const info = groupDataMap.get(gid);
                    grouped[gid] = {
                        bundleNo: info?.bundleNo || 'N/A',
                        created: info?.created || null,
                        shipments: []
                    };
                }

                const { adw_handover_group_id, ...shipmentDetail } = item;
                grouped[gid].shipments.push(shipmentDetail);
            });

            // Convert ke array
            const finalData = Object.values(grouped);

            return {
                success: true,
                count: finalData.length,
                data: finalData
            };

        } catch (err) {
            console.error(err);
            return { success: false, message: 'Server error' };
        } finally {
            if (connection) await connection.close();
            if (dbClient) await dbClient.release();
        }
    }

    async processFATFromMKT(server, bundles, userId) {
        let dbClient;


        try {
            dbClient = await server.pg.connect();
            await dbClient.query("BEGIN");

            const processedShipments = [];

            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            // 🔁 LOOP SETIAP BUNDLE DARI FRONTEND
            for (const bundle of bundles) {

                // 🔎 Ambil groupId berdasarkan bundleNo (documentno)
                const getGroupIdQuery = `
                    SELECT adw_handover_group_id
                    FROM adw_handover_group
                    WHERE documentno = $1
                `;
                const groupRes = await dbClient.query(getGroupIdQuery, [bundle.bundleNo]);

                if (groupRes.rowCount === 0) {
                    console.warn(`Group untuk bundle ${bundle.bundleNo} tidak ditemukan`);
                    continue;
                }

                const groupId = groupRes.rows[0].adw_handover_group_id;

                // 1️⃣ AMBIL LIST TRACKING DARI PIVOT
                const getOldPivotQuery = `
                    SELECT gs.adw_trackingsj_id, t.m_inout_id
                    FROM adw_group_sj gs
                    JOIN adw_trackingsj t ON gs.adw_trackingsj_id = t.adw_trackingsj_id
                    JOIN adw_handover_group hg ON hg.adw_handover_group_id = gs.adw_handover_group_id
                    WHERE hg.documentno = $1
                `;
                const oldPivotRows = await dbClient.query(getOldPivotQuery, [bundle.bundleNo]);


                for (const row of oldPivotRows.rows) {
                    const { adw_trackingsj_id, m_inout_id } = row;

                    // UPDATE TRACKINGSJ
                    const updateTrackingQuery = `
                        UPDATE adw_trackingsj
                        SET updated = NOW(),
                            updatedby = $1,
                            checkpoin_id = $2
                        WHERE adw_trackingsj_id = $3
                        RETURNING adw_trackingsj_id, m_inout_id
                    `;
                    const updated = await dbClient.query(updateTrackingQuery, [
                        userId,
                        '13',
                        adw_trackingsj_id
                    ]);

                    processedShipments.push(updated.rows[0]);

                    // INSERT EVENT
                    const insertEventQuery = `
                        INSERT INTO adw_trackingsj_events(
                            ad_client_id, ad_org_id, ad_user_id,
                            adw_event_type, adw_from_actor, adw_to_actor,
                            adw_trackingsj_id,
                            created, createdby, isactive,
                            updated, updatedby, checkpoin_id
                        ) VALUES(
                            1000003, 1000003, $1,
                            'ACCEPTANCE',
                            'MKT', 'FAT',
                            $2,
                            NOW(), $1, 'Y',
                            NOW(), $1, $3
                        )
                    `;
                    await dbClient.query(insertEventQuery, [userId, adw_trackingsj_id, '13']);
                }

                // UPDATE HANDOVER GROUP
                const updateHandoverGroupQuery = `
                    UPDATE adw_handover_group
                    SET 
                        received = NOW(),
                        receivedby = $1,
                        updated = NOW(),
                        updatedby = $1
                    WHERE documentno = $2
                `;
                const updateResult = await dbClient.query(updateHandoverGroupQuery, [
                    userId,
                    bundle.bundleNo
                ]);

                if (updateResult.rowCount === 0) {
                    throw new Error(`Update gagal: documentno ${bundle.bundleNo} tidak ditemukan.`);
                }

                console.log("Update handover group berhasil. rowCount =", updateResult.rowCount);



                // Generate PDF
                const { listShipment, dataUser, bundleNo, bundleCheckpoint, dateHandover } = await server.tms.listBundleDetailPDF(dbClient, bundle.bundleNo)
                const payload = {
                    listShipment,
                    dataUser,
                    bundleNo,
                    bundleCheckpoint,
                    dateHandover
                }

                console.log('test received name : ', dataUser.receivedby_name);


                const { fileName, filePath } = await this.generateHandoverPdf(payload, "MKT", "FAT")


                if (fileName) {
                    const updateHandoverGroupAttachment = `
                    UPDATE adw_handover_group
                    SET 
                        updated = NOW(),
                        updatedby = $1,
                        attachment = $2
                    WHERE documentno = $3
                `;
                    await dbClient.query(updateHandoverGroupAttachment, [
                        userId,
                        fileName,
                        bundle.bundleNo
                    ]);
                }
            }


            await dbClient.query("COMMIT");
            return {
                success: true,
                rows: processedShipments,
                message: `ACCEPTED and new bundle created successfully`
            };

        } catch (err) {
            await dbClient.query("ROLLBACK");
            console.error(err);
            return { success: false, message: "Error processing accepted bundles" };
        } finally {
            if (dbClient) dbClient.release();
        }
    }



}


async function receipt(fastify, opts) {
    fastify.decorate('receipt', new Receipt());
    fastify.register(autoload, {
        dir: join(import.meta.url, 'routes'),
        options: {
            prefix: opts.prefix
        }
    })
}

export default fp(receipt)