import fp from "fastify-plugin";
import autoload from "@fastify/autoload";
import { join } from "desm";
import oracleDB from "../../configs/dbOracle.js";
import crypto from "crypto";
import dotenv from "dotenv";
import dayjs from "dayjs";
import qr from "qrcode";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const pathUrl = process.env.PATH_URL;

const ROLE_CONFIGS = {
  dpk: {
    columnCheckpointReceipt: ["2", "6"],
    columnCheckpointHandover: ["3", "7"],
    columnCheckpointOutstanding: 4, //receipt driver
    columnCheckpointOutstandingEnd: 7, //receipt dpk
  },
  driver: {
    columnCheckpointReceipt: ["4"],
    columnCheckpointHandover: ["5"],
  },
  delivery: {
    columnCheckpoint: "3",
    columnCheckpointReceipt: ["8"],
    columnCheckpointOutstanding: 1, //ho to dpk
    columnCheckpointOutstandingEnd: 9, //receipt dpk
  },
  marketing: {
    columnCheckpoint: "4",
    columnCheckpointReceipt: ["10"],
    columnCheckpointHandover: ["11"],
    columnCheckpointOutstanding: 2, //receipt dpk
    columnCheckpointOutstandingEnd: 11, //receipt dpk
  },
  fat: {
    columnCheckpoint: "5",
    columnCheckpointReceipt: ["12"],
    columnCheckpointOutstanding: 2, //receipt dpk
    columnCheckpointOutstandingEnd: 13, //receipt dpk
  },
};

const CHECKPOINT_WORKFLOWS = {
  // Kunci '2' artinya: "Ketika sebuah item berada di checkpoint 2..."
  2: {
    actor: "DPK", // ...maka AKTOR yang melakukan penerimaan adalah DPK.
    fromActor: "Delivery", // Item ini diterima DARI Delivery.
    nextCheckpoint: "3", // Setelah diterima, statusnya berubah menjadi checkpoint 3.
  },
  // Kunci '3' artinya: "Ketika sebuah item berada di checkpoint 3..."
  3: {
    actor: "Driver", // ...maka AKTOR yang melakukan penerimaan adalah Driver.
    fromActor: "DPK", // Item ini diterima DARI DPK.
    nextCheckpoint: "4", // Setelah diterima, statusnya berubah menjadi checkpoint 4.
  },
  4: {
    actor: "Driver",
    fromActor: "DPK",
    nextCheckpoint: "5",
  },
  5: {
    actor: "DPK",
    fromActor: "Driver",
    nextCheckpoint: "6",
  },
  6: {
    actor: "DPK",
    fromActor: "Driver",
    nextCheckpoint: "7",
  },
  7: {
    actor: "Delivery",
    fromActor: "DPK",
    nextCheckpoint: "8",
  },
  8: {
    actor: "Delivery",
    fromActor: "DPK",
    nextCheckpoint: "9",
  },
  9: {
    actor: "Marketing",
    fromActor: "Delivery",
    nextCheckpoint: "10",
  },
  10: {
    actor: "Marketing",
    fromActor: "Delivery",
    nextCheckpoint: "11",
  },
  11: {
    actor: "FAT",
    fromActor: "Marketing",
    nextCheckpoint: "12",
  },
  12: {
    actor: "FAT",
    fromActor: "Marketing",
    nextCheckpoint: "13",
  },
};

function keysToLower(obj) {
  const newObj = {};
  for (let key in obj) {
    newObj[key.toLowerCase()] = obj[key];
  }
  return newObj;
}

class TMS {
  formatDate(iso) {
    if (!iso) return "-";
    // convert ke WIB dan format YYYY-MM-DD
    return dayjs(iso).utc().tz("Asia/Jakarta").format("YYYY-MM-DD");
  }

  formatTime(iso) {
    if (!iso) return "-";
    return dayjs(iso).utc().tz("Asia/Jakarta").format("HH:mm") + " WIB";
  }

  add7Hours(iso) {
    if (!iso) return null;
    return dayjs(iso).add(7, "hour");
  }

  async generateHandoverPdf(payload, from_act, to_act) {
    const { listShipment, dataUser, bundleNo, dateHandover } = payload;

    const uploadDir = path.join(process.cwd(), "uploads/handover");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const uniqueId = uuidv4();
    const fileName = `handover_${uniqueId}.pdf`;
    const filePath = path.join(uploadDir, fileName);

    const doc = new PDFDocument({ size: "A4", margin: 30 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // ================= HEADER =================
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`LIST HANDOVER (${from_act} to ${to_act})`, { align: "center" });
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`No: ${bundleNo}`, { align: "center" });
    doc.moveDown(1.5);

    // ================= TABLE SETUP =================
    const startX = 30;
    const colNo = 30;
    const colCust = 70;
    const colShip = 180;
    const colMove = 300;
    const colStat = 400;
    const rowHeight = 12; // compact
    const pageHeight = doc.page.height - doc.page.margins.bottom;

    function drawTableHeader() {
      const headerY = doc.y;
      doc.font("Helvetica-Bold").fontSize(9);
      doc.text("No", colNo, headerY);
      doc.text("Customer", colCust, headerY);
      doc.text("Shipment No", colShip, headerY);
      doc.text("Movement Date", colMove, headerY);
      doc.text("Status", colStat, headerY);
      doc
        .moveTo(startX, headerY + 12)
        .lineTo(565, headerY + 12)
        .lineWidth(0.5)
        .stroke();
      doc.y = headerY + 15;
    }

    drawTableHeader();

    doc.font("Helvetica").fontSize(8);

    for (let idx = 0; idx < listShipment.length; idx++) {
      const ship = listShipment[idx];
      const moveDate = dayjs(ship.movementdate)
        .tz("Asia/Jakarta")
        .format("YYYY-MM-DD");
      const statusText =
        ship.canceled && ship.canceled === "Y" ? "CANCEL" : "SUCCESS";

      // ====== PAGE BREAK ======
      if (doc.y + rowHeight * 2 > pageHeight) {
        doc.addPage();
        drawTableHeader();
      }

      const rowY = doc.y;
      doc.text(idx + 1, colNo, rowY);
      doc.text(ship.customer, colCust, rowY);
      doc.text(ship.documentno, colShip, rowY);
      doc.text(moveDate, colMove, rowY);
      doc.text(statusText, colStat, rowY);

      doc
        .moveTo(startX, rowY + rowHeight)
        .lineTo(565, rowY + rowHeight)
        .lineWidth(0.25)
        .stroke();
      doc.y = rowY + rowHeight + 3; // spacing compact
    }

    doc.moveDown(1.5);

    // ================= SIGNATURE =================
    const sigStartY = doc.y;
    const centerX = 297.5;
    const leftX = 80;
    const rightX = 380;
    const boxWidth = 160;

    const createdHour = this.formatTime(
      this.add7Hours(dateHandover.createdBundle),
    );
    const receivedHour = this.formatTime(
      this.add7Hours(dateHandover.receivedBundle),
    );

    doc.font("Helvetica-Bold").fontSize(10);
    doc.text(from_act, leftX, sigStartY, { align: "center", width: boxWidth });
    doc.text(to_act, rightX, sigStartY, { align: "center", width: boxWidth });

    // QR Code
    const qrUrl = `${pathUrl}:3200/files/handover/${fileName}`;
    const qrData = await qr.toDataURL(qrUrl);
    doc.image(qrData, centerX - 30, sigStartY - 5, { width: 60 });

    const lineY = sigStartY + 40;
    doc
      .moveTo(leftX, lineY)
      .lineTo(leftX + boxWidth, lineY)
      .lineWidth(1)
      .stroke();
    doc
      .moveTo(rightX, lineY)
      .lineTo(rightX + boxWidth, lineY)
      .lineWidth(1)
      .stroke();

    doc.font("Helvetica").fontSize(8);
    doc.text(dataUser.createdby_name, leftX, lineY + 3, {
      width: boxWidth,
      align: "center",
    });
    doc.text(dataUser.receivedby_name, rightX, lineY + 3, {
      width: boxWidth,
      align: "center",
    });

    doc.text(createdHour, leftX, lineY + 16, {
      width: boxWidth,
      align: "center",
    });
    doc.text(receivedHour, rightX, lineY + 16, {
      width: boxWidth,
      align: "center",
    });

    doc.end();
    await new Promise((resolve) => stream.on("finish", resolve));

    return { fileName, filePath };
  }

  async generateHandoverPdfMkt(payload, from_act, to_act) {
    const { listShipment, dataUser, bundleNo, dateHandover } = payload;

    const uploadDir = path.join(process.cwd(), "uploads/handover");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const uniqueId = uuidv4();
    const fileName = `handover_${uniqueId}.pdf`;
    const filePath = path.join(uploadDir, fileName);

    const doc = new PDFDocument({ size: "A4", margin: 30 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // ================= HEADER =================
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`LIST HANDOVER (${from_act} to ${to_act})`, { align: "center" });
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`No: ${bundleNo}`, { align: "center" });
    doc.moveDown(1.5);

    // ================= TABLE SETUP =================
    const startX = 30;
    const colNo = 30;
    const colCust = 70;
    const colShip = 180;
    const colMove = 300;
    const colStat = 400;
    const rowHeight = 12; // compact
    const pageHeight = doc.page.height - doc.page.margins.bottom;

    function drawTableHeader() {
      const headerY = doc.y;
      doc.font("Helvetica-Bold").fontSize(9);
      doc.text("No", colNo, headerY);
      doc.text("Customer", colCust, headerY);
      doc.text("Shipment No", colShip, headerY);
      doc.text("Movement Date", colMove, headerY);
      doc.text("Status", colStat, headerY);
      doc
        .moveTo(startX, headerY + 12)
        .lineTo(565, headerY + 12)
        .lineWidth(0.5)
        .stroke();
      doc.y = headerY + 15;
    }

    drawTableHeader();

    doc.font("Helvetica").fontSize(8);

    for (let idx = 0; idx < listShipment.length; idx++) {
      const ship = listShipment[idx];
      const moveDate = dayjs(ship.movementdate)
        .tz("Asia/Jakarta")
        .format("YYYY-MM-DD");
      const statusText =
        ship.canceledmkt && ship.canceledmkt === "Y" ? "CANCEL" : "SUCCESS";

      // ====== PAGE BREAK ======
      if (doc.y + rowHeight * 2 > pageHeight) {
        doc.addPage();
        drawTableHeader();
      }

      const rowY = doc.y;
      doc.text(idx + 1, colNo, rowY);
      doc.text(ship.customer, colCust, rowY);
      doc.text(ship.documentno, colShip, rowY);
      doc.text(moveDate, colMove, rowY);
      doc.text(statusText, colStat, rowY);

      doc
        .moveTo(startX, rowY + rowHeight)
        .lineTo(565, rowY + rowHeight)
        .lineWidth(0.25)
        .stroke();
      doc.y = rowY + rowHeight + 3; // spacing compact
    }

    doc.moveDown(1.5);

    // ================= SIGNATURE =================
    const sigStartY = doc.y;
    const centerX = 297.5;
    const leftX = 80;
    const rightX = 380;
    const boxWidth = 160;

    const createdHour = this.formatTime(
      this.add7Hours(dateHandover.createdBundle),
    );
    const receivedHour = this.formatTime(
      this.add7Hours(dateHandover.receivedBundle),
    );

    doc.font("Helvetica-Bold").fontSize(10);
    doc.text(from_act, leftX, sigStartY, { align: "center", width: boxWidth });
    doc.text(to_act, rightX, sigStartY, { align: "center", width: boxWidth });

    // QR Code
    const qrUrl = `${pathUrl}:3200/files/handover/${fileName}`;
    const qrData = await qr.toDataURL(qrUrl);
    doc.image(qrData, centerX - 30, sigStartY - 5, { width: 60 });

    const lineY = sigStartY + 40;
    doc
      .moveTo(leftX, lineY)
      .lineTo(leftX + boxWidth, lineY)
      .lineWidth(1)
      .stroke();
    doc
      .moveTo(rightX, lineY)
      .lineTo(rightX + boxWidth, lineY)
      .lineWidth(1)
      .stroke();

    doc.font("Helvetica").fontSize(8);
    doc.text(dataUser.createdby_name, leftX, lineY + 3, {
      width: boxWidth,
      align: "center",
    });
    doc.text(dataUser.receivedby_name, rightX, lineY + 3, {
      width: boxWidth,
      align: "center",
    });

    doc.text(createdHour, leftX, lineY + 16, {
      width: boxWidth,
      align: "center",
    });
    doc.text(receivedHour, rightX, lineY + 16, {
      width: boxWidth,
      align: "center",
    });

    doc.end();
    await new Promise((resolve) => stream.on("finish", resolve));

    return { fileName, filePath };
  }

  async getDrivers(server) {
    let dbClient;
    try {
      dbClient = await server.pg.connect();

      const queryGetDrivers = `SELECT ad_user_id, name FROM ad_user au WHERE title = 'driver'`;

      const resultGetDrivers = await dbClient.query(queryGetDrivers);
      const resultRows = resultGetDrivers.rows || [];

      return resultRows;
    } catch (error) {
      console.log(error);
      return { success: false, message: "Server error" };
    } finally {
      if (dbClient) {
        try {
          await dbClient.release();
        } catch (closeErr) {
          console.log("Error closing Oracle connection:", closeErr);
        }
      }
    }
  }

  async getDriversOracle() {
    let connection;
    try {
      connection = await oracleDB.openConnection();

      const queryGetDrivers = `SELECT AD_USER_ID, NAME FROM AD_USER au WHERE au.TITLE = 'driver'`;

      const resultGetDrivers = await connection.execute(
        queryGetDrivers,
        {},
        {
          outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
        },
      );
      const resultRows = resultGetDrivers.rows || [];

      const normalized = resultRows.map((r) => keysToLower(r));

      return normalized;
    } catch (error) {
      console.log(error);
      return { success: false, message: "Server error" };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          console.log("Error closing Oracle connection:", closeErr);
        }
      }
    }
  }

  async getDriversOracleCapital(searchKey) {
    let connection;
    try {
      connection = await oracleDB.openConnection();

      const queryGetDrivers = `
                SELECT AD_USER_ID, NAME
                    FROM AD_USER au
                WHERE au.TITLE = 'driver'
                    AND UPPER(au.NAME) LIKE '%' || UPPER(REPLACE(:username, '%20', ' ')) || '%'
                `;

      const resultGetDrivers = await connection.execute(
        queryGetDrivers,
        { username: searchKey },
        {
          outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
        },
      );
      const resultRows = resultGetDrivers.rows || [];

      return resultRows;
    } catch (error) {
      console.log(error);
      return { success: false, message: "Server error" };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          console.log("Error closing Oracle connection:", closeErr);
        }
      }
    }
  }

  async getTnkbs() {
    let connection;
    try {
      connection = await oracleDB.openConnection();

      const queryGetTnkbs = `SELECT ADW_TMS_TNKB_ID, MIN(NAME) AS NAME FROM ADW_TMS_TNKB GROUP BY ADW_TMS_TNKB_ID`;

      const resultGetTnbs = await connection.execute(
        queryGetTnkbs,
        {},
        {
          outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
        },
      );
      const resultRows = resultGetTnbs.rows || [];

      return resultRows;
    } catch (error) {
      console.log(error);
      return { success: false, message: "Server error" };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          console.log("Error closing Oracle connection:", closeErr);
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
      return {
        success: false,
        message: `Invalid or unsupported role: ${role}`,
      };
    }

    try {
      connection = await oracleDB.openConnection();
      dbClient = await server.pg.connect();

      const queryPostgres = `
                SELECT
                    m_inout_id,
                    driverby,
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
      const inoutIds = postgresRows.map((row) => row.m_inout_id);

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
            ) AS PLANTIME, SPPNO
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE
                M_INOUT_ID IN(${inoutIds.map((_, i) => `:${i + 1}`).join(",")})
            ORDER BY mi.DOCUMENTNO DESC

        `;

      const resultOracle = await connection.execute(queryOracle, inoutIds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });
      const oracleRows = resultOracle.rows || [];

      // 5. Gabungkan data: Jadikan data Oracle sebagai lookup map untuk performa cepat
      const oracleDataMap = new Map(
        oracleRows.map((row) => [String(row.M_INOUT_ID), row]),
      );

      // 6. Iterasi hasil PostgreSQL dan tambahkan data dari Oracle
      const combinedData = postgresRows.map((pgRow) => {
        const oracleData = oracleDataMap.get(String(pgRow.m_inout_id));

        return {
          ...pgRow, // Ambil semua kolom dari PostgreSQL
          driverby: Number(pgRow.driverby),
          documentno: oracleData ? oracleData.DOCUMENTNO : "N/A", // Tambahkan DOCUMENTNO
          customer: oracleData ? oracleData.CUSTOMER : "N/A",
          plantime: oracleData ? oracleData.PLANTIME : null, // Tambahkan PLANTIME
          sppno: oracleData ? oracleData.SPPNO : "N/A",

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
      return { success: false, message: "Server error" };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          console.log("Error closing Oracle connection:", closeErr);
        }
      }
      if (dbClient) {
        try {
          await dbClient.release();
        } catch (closeErr) {
          console.log("Error releasing pg connection:", closeErr);
        }
      }
    }
  }

  async getReceipt2(server, role) {
    let connection;
    let dbClient;

    const configRole = ROLE_CONFIGS[role];

    if (!configRole) {
      return {
        success: false,
        message: `Invalid or unsupported role: ${role}`,
      };
    }

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
            WHERE t.checkpoin_id = ANY($1::varchar[])
            ORDER BY t.documentno DESC
            `;

      const resultPg = await dbClient.query(queryPostgres, [
        configRole.columnCheckpointReceipt,
      ]);

      const postgresRows = resultPg.rows || [];

      if (postgresRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      // ---------------------------------------------------------
      // 2️⃣ Ambil detail SJ dari Oracle berdasarkan m_inout_id
      // ---------------------------------------------------------
      const inoutIds = postgresRows.map((r) => r.m_inout_id);

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
            WHERE mi.M_INOUT_ID IN (${inoutIds.map((_, i) => `:${i + 1}`).join(",")})
            ORDER BY mi.DOCUMENTNO DESC
            `;

      const oracleRows = await connection.execute(oracleQuery, inoutIds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });

      const oracleMap = new Map(
        oracleRows.rows.map((row) => [String(row.M_INOUT_ID), row]),
      );

      // ---------------------------------------------------------
      // 3️⃣ Gabungkan PostgreSQL + Oracle
      // ---------------------------------------------------------
      const combined = postgresRows.map((pg) => {
        const o = oracleMap.get(String(pg.m_inout_id));

        return {
          ...pg,
          driverby: Number(pg.driverby),
          documentno: o ? o.DOCUMENTNO : "N/A",
          customer: o ? o.CUSTOMER : "N/A",
          plantime: o ? o.PLANTIME : null,
          sppno: o ? o.SPPNO : "N/A",
        };
      });

      // ---------------------------------------------------------
      // 4️⃣ Ambil data group berdasarkan group IDs hasil pivot
      // ---------------------------------------------------------
      const groupIds = [
        ...new Set(
          combined.map((s) => s.adw_handover_group_id).filter(Boolean),
        ),
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
        groupRows.rows.forEach((row) => {
          groupDataMap.set(row.adw_handover_group_id, {
            bundleNo: row.documentno,
            created: row.created,
          });
        });
      }

      // ---------------------------------------------------------
      // 5️⃣ Kelompokkan data sesuai bundle (group)
      // ---------------------------------------------------------
      const grouped = {};

      combined.forEach((item) => {
        const gid = item.adw_handover_group_id;
        if (!gid) return;

        if (!grouped[gid]) {
          const info = groupDataMap.get(gid);
          grouped[gid] = {
            bundleNo: info?.bundleNo || "N/A",
            created: info?.created || null,
            shipments: [],
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
        data: finalData,
      };
    } catch (err) {
      console.error(err);
      return { success: false, message: "Server error" };
    } finally {
      if (connection) await connection.close();
      if (dbClient) await dbClient.release();
    }
  }

  async setAccepted(server, data, userId, checkpoint) {
    let dbClient;

    // 1. Dapatkan aturan alur kerja berdasarkan checkpoint yang masuk
    const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

    // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
    if (!workflow) {
      return {
        success: false,
        message: `No acceptance workflow defined for checkpoint: ${checkpoint}`,
      };
    }

    try {
      dbClient = await server.pg.connect();
      await dbClient.query("BEGIN");

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
          checkpoint, // checkpoint saat ini
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
            workflow.actor, // Aktor yang menerima saat ini
            trackingSjId,
            checkpoint,
          ];

          await dbClient.query(insertEventQuery, eventValues);
        } else {
          console.warn(
            `No record found to update for M_INOUT_ID: ${m_inout_id} with checkpoint '${checkpoint}'. It might have been processed already.`,
          );
        }
      }

      await dbClient.query("COMMIT");
      return {
        success: true,
        rows: updatedRows,
        message: `${workflow.actor} accepted successfully!`,
      };
    } catch (error) {
      if (dbClient) {
        await dbClient.query("ROLLBACK");
      }
      console.error("Server error during accept:", error);
      return { success: false, message: "Server error during accept process." };
    } finally {
      if (dbClient) {
        dbClient.release();
      }
    }
  }

  // Anda bisa menamainya kembali setAccepted jika mau, tapi nama ini lebih deskriptif
  async processAcceptedBundles(server, bundles, userId, checkpoint) {
    let dbClient;

    const workflow = CHECKPOINT_WORKFLOWS[checkpoint];
    if (!workflow) {
      return {
        success: false,
        message: `No workflow for checkpoint: ${checkpoint}`,
      };
    }

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
        const oldPivotRows = await dbClient.query(getOldPivotQuery, [
          bundle.bundleNo,
        ]);

        if (oldPivotRows.rowCount === 0) {
          console.warn(
            `Bundle ${bundle.bundleNo} tidak punya shipment di pivot.`,
          );
          continue;
        }

        // 2️⃣ BUAT DOCUMENTNO BARU (RGxxxxx)
        const newDocNoQuery = `
                SELECT 'RG' || LPAD(nextval('adw_handover_group_seq')::text, 6, '0') AS newdoc
            `;
        const newDocResult = await dbClient.query(newDocNoQuery);
        const newDocNo = newDocResult.rows[0].newdoc;

        // 3️⃣ INSERT BUNDLE BARU
        const insertBundleQuery = `
                INSERT INTO adw_handover_group
                (documentno, checkpoint, created, createdby, updated, updatedby)
                VALUES ($1, $2, NOW(), $3, NOW(), $3)
                RETURNING adw_handover_group_id
            `;
        const newBundleRes = await dbClient.query(insertBundleQuery, [
          newDocNo,
          workflow.nextCheckpoint, // = 3
          userId,
        ]);

        const newBundleId = newBundleRes.rows[0].adw_handover_group_id;

        // 4️⃣ INSERT TRACKING KE PIVOT BARU
        const insertPivotQuery = `
                INSERT INTO adw_group_sj (adw_handover_group_id, adw_trackingsj_id)
                VALUES ($1, $2)
            `;

        for (const row of oldPivotRows.rows) {
          await dbClient.query(insertPivotQuery, [
            newBundleId,
            row.adw_trackingsj_id,
          ]);
        }

        // 5️⃣ UPDATE TRACKINGSJ + INSERT EVENT
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
            workflow.nextCheckpoint,
            adw_trackingsj_id,
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
            workflow.fromActor,
            workflow.actor,
            adw_trackingsj_id,
            workflow.nextCheckpoint,
          ]);
        }
      }

      await dbClient.query("COMMIT");
      return {
        success: true,
        rows: processedShipments,
        message: `ACCEPTED and new bundle created successfully`,
      };
    } catch (err) {
      await dbClient.query("ROLLBACK");
      console.error(err);
      return { success: false, message: "Error processing accepted bundles" };
    } finally {
      if (dbClient) dbClient.release();
    }
  }

  async listHandover(server, role) {
    let connection;
    let dbClient;

    const configRole = ROLE_CONFIGS[role];

    if (!configRole) {
      // Ini menggantikan blok 'default' pada switch
      return {
        success: false,
        message: `Invalid or unsupported role: ${role} `,
      };
    }

    try {
      connection = await oracleDB.openConnection();
      dbClient = await server.pg.connect();

      // --- ALUR 1: Logika Khusus dan Independen untuk 'delivery' ---
      if (role === "delivery") {
        const queryOracle = `
                        SELECT
                        mi.M_INOUT_ID,
                            mi.DOCUMENTNO,
                            cb.NAME AS CUSTOMER,
                             mi.MOVEMENTDATE + (mi.PLANTIME - TRUNC(mi.PLANTIME)) AS PLANTIME
                        FROM
                                M_INOUT mi
                            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                            INNER JOIN C_ORDER co ON co.C_ORDER_ID = mi.C_ORDER_ID
                        WHERE
                        		mi.MOVEMENTDATE >= TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') + 20
                                AND mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP') AND ISSOTRX = 'Y'
                                AND cb.ISSUBCONTRACT = 'N'
                                AND co.ISMILKRUN = 'N'
                                AND mi.ADW_TMS_ID IS NULL
                        ORDER BY mi.DOCUMENTNO DESC
                            `;

        // Eksekusi query tanpa parameter
        const resultOracle = await connection.execute(queryOracle, [], {
          outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
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
          resultPg.rows.map((row) => [
            String(row.m_inout_id),
            row.checkpoin_id,
          ]),
        );

        // 5. Filter hasil dari Oracle DENGAN LOGIKA DIBALIK (!)
        // Hanya simpan baris dari Oracle yang ID-nya TIDAK ADA (!) di dalam Set.
        const filteredData = oracleRows.filter((oracleRow) => {
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
        const mappingData = filteredData.map((row) => {
          const oracleId = String(row.M_INOUT_ID);
          const checkpointId = existingTrackingData.get(oracleId) ?? 1;
          return {
            m_inout_id: row.M_INOUT_ID,
            documentno: row.DOCUMENTNO,
            customer: row.CUSTOMER,
            plantime: row.PLANTIME,
            checkpoin_id: Number(checkpointId),
          };
        });

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

      const inoutIds = postgresRows.map((row) => row.m_inout_id);

      const queryOracle = `
            SELECT
            mi.M_INOUT_ID, mi.DOCUMENTNO, cb.NAME AS CUSTOMER, SPPNO,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
            FROM M_INOUT mi
                    INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                    WHERE mi.M_INOUT_ID IN(${inoutIds.map((_, i) => `:${i + 1}`).join(",")})
            ORDER BY mi.DOCUMENTNO DESC
                `;

      const resultOracle = await connection.execute(queryOracle, inoutIds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });
      const oracleRows = resultOracle.rows || [];

      // Gabungkan data dari kedua sumber
      const oracleDataMap = new Map(
        oracleRows.map((row) => [String(row.M_INOUT_ID), row]),
      );

      const combinedData = postgresRows.map((pgRow) => {
        const oracleData = oracleDataMap.get(String(pgRow.m_inout_id));
        return {
          ...pgRow,
          documentNo: oracleData ? oracleData.DOCUMENTNO : "N/A",
          planTime: oracleData ? oracleData.PLANTIME : null,
          customer: oracleData ? oracleData.CUSTOMER : "N/A",
          sppno: oracleData ? oracleData.SPPNO : "N/A",
        };
      });

      return {
        success: true,
        count: combinedData.length,
        data: combinedData,
      };
    } catch (error) {
      console.log(error);
      return { success: false, message: "Server error" };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          console.log("Error closing Oracle connection:", closeErr);
        }
      }
      if (dbClient) {
        try {
          dbClient.release();
        } catch (closeErr) {
          console.log("Error releasing pg connection:", closeErr);
        }
      }
    }
  }

  async listHandover2(server, role) {
    let connection;
    let dbClient;

    const configRole = ROLE_CONFIGS[role];

    if (!configRole) {
      // Ini menggantikan blok 'default' pada switch
      return {
        success: false,
        message: `Invalid or unsupported role: ${role} `,
      };
    }

    try {
      connection = await oracleDB.openConnection();
      dbClient = await server.pg.connect();

      // --- ALUR 1: Logika Khusus dan Independen untuk 'delivery' ---
      if (role === "delivery") {
        const queryOracle = `
                        SELECT
                        mi.M_INOUT_ID,
                            mi.DOCUMENTNO,
                            cb.NAME AS CUSTOMER,
                             mi.MOVEMENTDATE + (mi.PLANTIME - TRUNC(mi.PLANTIME)) AS PLANTIME
                        FROM
                                M_INOUT mi
                            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                            INNER JOIN C_ORDER co ON co.C_ORDER_ID = mi.C_ORDER_ID
                        WHERE
                        		mi.MOVEMENTDATE >= TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') + 20
                                AND mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP') AND ISSOTRX = 'Y'
                                AND cb.ISSUBCONTRACT = 'N'
                                AND co.ISMILKRUN = 'N'
                                AND mi.ADW_TMS_ID IS NULL
                        ORDER BY mi.DOCUMENTNO DESC
                            `;

        // Eksekusi query tanpa parameter
        const resultOracle = await connection.execute(queryOracle, [], {
          outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
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
          resultPg.rows.map((row) => [
            String(row.m_inout_id),
            row.checkpoin_id,
          ]),
        );

        // 5. Filter hasil dari Oracle DENGAN LOGIKA DIBALIK (!)
        // Hanya simpan baris dari Oracle yang ID-nya TIDAK ADA (!) di dalam Set.
        const filteredData = oracleRows.filter((oracleRow) => {
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
        const mappingData = filteredData.map((row) => {
          const oracleId = String(row.M_INOUT_ID);
          const checkpointId = existingTrackingData.get(oracleId) ?? 1;
          return {
            m_inout_id: row.M_INOUT_ID,
            documentno: row.DOCUMENTNO,
            customer: row.CUSTOMER,
            plantime: row.PLANTIME,
            checkpoin_id: Number(checkpointId),
          };
        });

        // 6. Kembalikan data yang sudah difilter
        return {
          success: true,
          count: mappingData.length,
          data: mappingData,
        };
      }

      // --- ALUR 2: Logika BARU Berbasis Bundle untuk SEMUA PERAN LAIN ---

      // 1. Ambil semua BUNDLE yang relevan terlebih dahulu
      const getBundlesQuery = `
            SELECT
                adw_handover_group_id,
                documentno as "bundleNo",
                created
            FROM adw_handover_group
            WHERE checkpoint = ANY($1::varchar[])
            ORDER BY created DESC;
        `;
      const bundleValues = [configRole.columnCheckpointHandover];
      const bundleResult = await dbClient.query(getBundlesQuery, bundleValues);
      const bundleRows = bundleResult.rows || [];

      if (bundleRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      // 2. Kumpulkan ID bundle untuk mencari shipment-nya
      const bundleIds = bundleRows.map(
        (bundle) => bundle.adw_handover_group_id,
      );

      // 3. Ambil semua SHIPMENT yang tergabung dalam bundle-bundle tersebut
      const getShipmentsQuery = `
            SELECT *
            FROM adw_trackingsj
            WHERE adw_handover_group_id = ANY($1::int[]);
        `;
      const shipmentResult = await dbClient.query(getShipmentsQuery, [
        bundleIds,
      ]);
      const postgresRows = shipmentResult.rows || [];

      // Jika tidak ada shipment sama sekali, kita tetap kembalikan bundle kosong
      if (postgresRows.length === 0) {
        const emptyBundles = bundleRows.map((b) => ({ ...b, shipments: [] }));
        return {
          success: true,
          count: emptyBundles.length,
          data: emptyBundles,
        };
      }

      // 4. Ambil detail dari Oracle untuk semua shipment yang ditemukan
      const inoutIds = postgresRows.map((row) => row.m_inout_id);
      const queryOracle = `
            SELECT
                mi.M_INOUT_ID, mi.DOCUMENTNO, cb.NAME AS CUSTOMER, SPPNO,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
            FROM M_INOUT mi
            INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN(${inoutIds.map((_, i) => `:${i + 1}`).join(",")})
        `;
      const resultOracle = await connection.execute(queryOracle, inoutIds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });
      const oracleRows = resultOracle.rows || [];
      const oracleDataMap = new Map(
        oracleRows.map((row) => [String(row.M_INOUT_ID), row]),
      );

      // 5. Gabungkan dan Susun Strukturnya
      const nestedData = bundleRows.map((bundle) => {
        // Filter shipment yang hanya milik bundle saat ini
        const shipmentsForThisBundle = postgresRows
          .filter(
            (shipment) =>
              shipment.adw_handover_group_id === bundle.adw_handover_group_id,
          )
          .map((pgRow) => {
            // Tambahkan detail dari Oracle ke setiap shipment
            const oracleData = oracleDataMap.get(String(pgRow.m_inout_id));
            return {
              ...pgRow, // data asli dari adw_trackingsj
              documentno: oracleData ? oracleData.DOCUMENTNO : "N/A", // ganti nama 'documentNo'
              plantime: oracleData ? oracleData.PLANTIME : null, // ganti nama 'planTime'
              customer: oracleData ? oracleData.CUSTOMER : "N/A",
              sppno: oracleData ? oracleData.SPPNO : "N/A",
            };
          });

        // Kembalikan objek bundle lengkap dengan array shipments-nya
        return {
          ...bundle,
          shipments: shipmentsForThisBundle,
        };
      });

      return {
        success: true,
        count: nestedData.length, // Jumlah sekarang adalah jumlah bundle
        data: nestedData,
      };
    } catch (error) {
      console.log(error);
      return { success: false, message: "Server error" };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          console.log("Error closing Oracle connection:", closeErr);
        }
      }
      if (dbClient) {
        try {
          dbClient.release();
        } catch (closeErr) {
          console.log("Error releasing pg connection:", closeErr);
        }
      }
    }
  }

  async listOutstanding(server, role) {
    let connection;
    let dbClient;

    const configRole = ROLE_CONFIGS[role];

    if (!configRole) {
      // Ini menggantikan blok 'default' pada switch
      return {
        success: false,
        message: `Invalid or unsupported role: ${role} `,
      };
    }

    try {
      connection = await oracleDB.openConnection();
      dbClient = await server.pg.connect();

      const queryPostgres = `
            SELECT sj.*, sj.drivername
                FROM adw_trackingsj sj
                WHERE CAST(sj.checkpoin_id AS INTEGER) >= $1 AND CAST(sj.checkpoin_id AS INTEGER) < $2
                ORDER BY sj.documentno DESC`;
      const values = [
        configRole.columnCheckpointOutstanding,
        configRole.columnCheckpointOutstandingEnd,
      ];
      const resultPg = await dbClient.query(queryPostgres, values);
      const postgresRows = resultPg.rows || [];

      if (postgresRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      const inoutIds = postgresRows.map((row) => row.m_inout_id);

      const queryOracle = `
            SELECT
            mi.M_INOUT_ID, mi.DOCUMENTNO, cb.NAME AS CUSTOMER, SPPNO,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' || TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME
            FROM M_INOUT mi
                    INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                    WHERE mi.M_INOUT_ID IN(${inoutIds.map((_, i) => `:${i + 1}`).join(",")})
            ORDER BY mi.DOCUMENTNO DESC
                `;

      const resultOracle = await connection.execute(queryOracle, inoutIds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });
      const oracleRows = resultOracle.rows || [];

      // Gabungkan data dari kedua sumber
      const oracleDataMap = new Map(
        oracleRows.map((row) => [String(row.M_INOUT_ID), row]),
      );

      const combinedData = postgresRows.map((pgRow) => {
        const oracleData = oracleDataMap.get(String(pgRow.m_inout_id));
        pgRow.plantime = oracleData ? oracleData.PLANTIME : null;
        return {
          ...pgRow,
          documentNo: oracleData ? oracleData.DOCUMENTNO : "N/A",
          // plantime: oracleData ? oracleData.PLANTIME : null,
          customer: oracleData ? oracleData.CUSTOMER : "N/A",
          sppno: oracleData ? oracleData.SPPNO : "N/A",
        };
      });

      return {
        success: true,
        count: combinedData.length,
        data: combinedData,
      };
    } catch (error) {
      console.log(error);
      return { success: false, message: "Server error" };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          console.log("Error closing Oracle connection:", closeErr);
        }
      }
      if (dbClient) {
        try {
          dbClient.release();
        } catch (closeErr) {
          console.log("Error releasing pg connection:", closeErr);
        }
      }
    }
  }

  async toHandover(server, payload, userId, checkpoint, isarrived) {
    const dbClient = await server.pg.connect();

    try {
      await dbClient.query("BEGIN");
      let result;

      let fromActor;
      let toActor;

      switch (Number(checkpoint)) {
        case 1: {
          const { data } = payload;
          fromActor = "Delivery";
          toActor = "DPK";

          if (!data || !Array.isArray(data) || data.length === 0) {
            throw {
              statusCode: 400,
              message: "Data is required for handover.",
            };
          }

          const validDestinations = ["DPK", "MKT"];
          if (!validDestinations.includes(toActor)) {
            throw {
              statusCode: 400,
              message: `Invalid destination actor: ${toActor}.`,
            };
          }

          // ============================================================
          // 1️⃣ Buat Handover Group SATU KALI SAJA
          // ============================================================

          // Ambil nomor sequence
          const seqQuery = `SELECT nextval('adw_handover_group_seq') AS seq;`;
          const seqRows = await dbClient.query(seqQuery);
          const documentno = "HG" + seqRows.rows[0].seq;

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
            "2",
            "ho delivery to dpk",
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
              item.documentno,
            ]);

            const newTrackingId = trackingRes.rows[0].adw_trackingsj_id;
            if (!newTrackingId) throw new Error("Failed to insert tracking");

            // 2.2 INSERT KE TABEL PIVOT adw_group_sj
            const insertPivotQuery = `
                            INSERT INTO adw_group_sj(
                                adw_handover_group_id,
                                adw_trackingsj_id
                            ) VALUES ($1, $2);
                        `;

            await dbClient.query(insertPivotQuery, [groupId, newTrackingId]);

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
              checkpoint,
            ]);

            insertedCount++;
          }

          // ============================================================
          // 3️⃣ OUTPUT
          // ============================================================
          result = {
            handover_group_id: groupId,
            insertedCount,
            message: "Handover created successfully",
          };

          break;
        }

        case 3: {
          const { data, driverId, tnkbId } = payload;
          if (!data || !Array.isArray(data) || data.length === 0) {
            throw {
              statusCode: 400,
              message: "Data is required for handover.",
            };
          }

          const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

          // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
          if (!workflow) {
            return {
              success: false,
              message: `No acceptance workflow defined for checkpoint: ${checkpoint}`,
            };
          }
          // Ekstrak semua m_inout_id untuk query batch
          const inoutIds = data.map((item) => item.m_inout_id);

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
          const updateValues = [
            workflow.nextCheckpoint,
            userId,
            inoutIds,
            driverId,
            tnkbId,
            checkpoint,
          ];
          const updateResult = await dbClient.query(updateQuery, updateValues);

          // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
          if (updateResult.rows.length === 0) {
            throw new Error(
              "No items could be updated. They might be at the wrong checkpoint or already processed.",
            );
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
            const eventValues = [
              userId,
              workflow.fromActor,
              workflow.actor,
              trackingId,
              checkpoint,
            ];
            await dbClient.query(insertEventQuery, eventValues);
          }

          // 4. Set hasil akhir SETELAH semua operasi selesai.
          result = {
            acceptedCount: updatedTrackingIds.length,
            message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.`,
          };

          break;
        }

        case 4: {
          const { data } = payload;
          if (!data || !Array.isArray(data) || data.length === 0) {
            throw {
              statusCode: 400,
              message: "Data is required for handover.",
            };
          }

          const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

          // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
          if (!workflow) {
            return {
              success: false,
              message: `No acceptance workflow defined for checkpoint: ${checkpoint}`,
            };
          }
          // Ekstrak semua m_inout_id untuk query batch
          const inoutIds = data.map((item) => item.m_inout_id);

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
          const updateValues = [
            workflow.nextCheckpoint,
            userId,
            inoutIds,
            checkpoint,
          ];
          const updateResult = await dbClient.query(updateQuery, updateValues);

          // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
          if (updateResult.rows.length === 0) {
            throw new Error(
              "No items could be updated. They might be at the wrong checkpoint or already processed.",
            );
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
            const eventValues = [
              userId,
              workflow.fromActor,
              workflow.actor,
              trackingId,
              checkpoint,
            ];
            await dbClient.query(insertEventQuery, eventValues);
          }

          // 4. Set hasil akhir SETELAH semua operasi selesai.
          result = {
            acceptedCount: updatedTrackingIds.length,
            message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.`,
          };

          break;
        }

        case 5: {
          const { data } = payload;
          if (!data || !Array.isArray(data) || data.length === 0) {
            throw {
              statusCode: 400,
              message: "Data is required for handover.",
            };
          }

          const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

          // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
          if (!workflow) {
            return {
              success: false,
              message: `No acceptance workflow defined for checkpoint: ${checkpoint}`,
            };
          }
          // Ekstrak semua m_inout_id untuk query batch
          const inoutIds = data.map((item) => item.m_inout_id);
          const latCustomer = data[0].lat_customer;
          const longCustomer = data[0].long_customer;

          let updatedTrackingIds;

          if (isarrived == "Y") {
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
            const updateValues = [
              workflow.nextCheckpoint,
              userId,
              inoutIds,
              checkpoint,
            ];
            const updateResult = await dbClient.query(
              updateQuery,
              updateValues,
            );

            // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
            if (updateResult.rows.length === 0) {
              throw new Error(
                "No items could be updated. They might be at the wrong checkpoint or already processed.",
              );
            }

            updatedTrackingIds = updateResult.rows; // Berisi array objek, mis: [{ adw_trackingsj_id: 101 }, { adw_trackingsj_id: 102 }]

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
              const eventValues = [
                userId,
                workflow.fromActor,
                workflow.actor,
                trackingId,
                checkpoint,
              ];
              await dbClient.query(insertEventQuery, eventValues);
            }
          } else {
            // 2. Lakukan SATU KALI UPDATE untuk semua item dan dapatkan kembali ID yang relevan.
            // Ini jauh lebih efisien daripada melakukan update di dalam loop.
            const updateQuery = `
                            UPDATE adw_trackingsj
                            SET
                                arrivedat_customer = 'Y',
                                lat_customer = $4,
                                long_customer = $5,
                                updated = NOW(),
                                updatedby = $1
                            WHERE
                                m_inout_id = ANY($2::integer[]) -- Gunakan ANY untuk mencocokkan dengan array
                                AND checkpoin_id = $3
                            RETURNING adw_trackingsj_id; -- KUNCI UTAMA: Kembalikan ID dari setiap baris yang diupdate
                        `;
            const updateValues = [
              userId,
              inoutIds,
              checkpoint,
              latCustomer,
              longCustomer,
            ];
            const updateResult = await dbClient.query(
              updateQuery,
              updateValues,
            );

            // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
            if (updateResult.rows.length === 0) {
              throw new Error(
                "No items could be updated. They might be at the wrong checkpoint or already processed.",
              );
            }
            updatedTrackingIds = updateResult.rows;
          }

          // 4. Set hasil akhir SETELAH semua operasi selesai.
          result = {
            acceptedCount: updatedTrackingIds.length,
            message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.`,
          };

          break;
        }

        case 7: {
          const { data } = payload;
          if (!data || !Array.isArray(data) || data.length === 0) {
            throw {
              statusCode: 400,
              message: "Data is required for handover.",
            };
          }

          const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

          // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
          if (!workflow) {
            return {
              success: false,
              message: `No acceptance workflow defined for checkpoint: ${checkpoint}`,
            };
          }
          // Ekstrak semua m_inout_id untuk query batch
          const inoutIds = data.map((item) => item.m_inout_id);

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
          const updateValues = [
            workflow.nextCheckpoint,
            userId,
            inoutIds,
            checkpoint,
          ];
          const updateResult = await dbClient.query(updateQuery, updateValues);

          // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
          if (updateResult.rows.length === 0) {
            throw new Error(
              "No items could be updated. They might be at the wrong checkpoint or already processed.",
            );
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
            const eventValues = [
              userId,
              workflow.fromActor,
              workflow.actor,
              trackingId,
              checkpoint,
            ];
            await dbClient.query(insertEventQuery, eventValues);
          }

          // 4. Set hasil akhir SETELAH semua operasi selesai.
          result = {
            acceptedCount: updatedTrackingIds.length,
            message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.`,
          };

          break;
        }

        case 9: {
          const { data } = payload;
          if (!data || !Array.isArray(data) || data.length === 0) {
            throw {
              statusCode: 400,
              message: "Data is required for handover.",
            };
          }

          const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

          // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
          if (!workflow) {
            return {
              success: false,
              message: `No acceptance workflow defined for checkpoint: ${checkpoint}`,
            };
          }
          // Ekstrak semua m_inout_id untuk query batch
          const inoutIds = data.map((item) => item.m_inout_id);

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
          const updateValues = [
            workflow.nextCheckpoint,
            userId,
            inoutIds,
            checkpoint,
          ];
          const updateResult = await dbClient.query(updateQuery, updateValues);

          // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
          if (updateResult.rows.length === 0) {
            throw new Error(
              "No items could be updated. They might be at the wrong checkpoint or already processed.",
            );
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
            const eventValues = [
              userId,
              workflow.fromActor,
              workflow.actor,
              trackingId,
              checkpoint,
            ];
            await dbClient.query(insertEventQuery, eventValues);
          }

          // 4. Set hasil akhir SETELAH semua operasi selesai.
          result = {
            acceptedCount: updatedTrackingIds.length,
            message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.`,
          };

          break;
        }

        case 11: {
          const { data } = payload;
          if (!data || !Array.isArray(data) || data.length === 0) {
            throw {
              statusCode: 400,
              message: "Data is required for handover.",
            };
          }

          const workflow = CHECKPOINT_WORKFLOWS[checkpoint];

          // Jika tidak ada aturan untuk checkpoint ini, hentikan proses
          if (!workflow) {
            return {
              success: false,
              message: `No acceptance workflow defined for checkpoint: ${checkpoint}`,
            };
          }
          // Ekstrak semua m_inout_id untuk query batch
          const inoutIds = data.map((item) => item.m_inout_id);

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
          const updateValues = [
            workflow.nextCheckpoint,
            userId,
            inoutIds,
            checkpoint,
          ];
          const updateResult = await dbClient.query(updateQuery, updateValues);

          // Validasi: Jika tidak ada baris yang cocok, mungkin sudah diproses.
          if (updateResult.rows.length === 0) {
            throw new Error(
              "No items could be updated. They might be at the wrong checkpoint or already processed.",
            );
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
            const eventValues = [
              userId,
              workflow.fromActor,
              workflow.actor,
              trackingId,
              checkpoint,
            ];
            await dbClient.query(insertEventQuery, eventValues);
          }

          // 4. Set hasil akhir SETELAH semua operasi selesai.
          result = {
            acceptedCount: updatedTrackingIds.length,
            message: `Successfully handed over ${updatedTrackingIds.length} items to ${toActor}.`,
          };

          break;
        }

        default:
          throw {
            statusCode: 400,
            message: `Invalid or unsupported chechpoint: ${checkpoint}`,
          };
      }

      await dbClient.query("COMMIT");
      return result;
    } catch (error) {
      if (dbClient) await dbClient.query("ROLLBACK");
      console.error("Transaction Error in toHandover:", error.message);
      throw error;
    } finally {
      if (dbClient) await dbClient.release();
    }
  }

  async getHistory(server, page, pageSize) {
    let connection;
    let dbClient;

    try {
      // 1. Buka koneksi ke kedua database secara paralel untuk menghemat waktu
      [connection, dbClient] = await Promise.all([
        oracleDB.openConnection(),
        server.pg.connect(),
      ]);

      const offset = (page - 1) * pageSize;

      const startRow = offset; // misalnya (page - 1) * pageSize
      const endRow = startRow + pageSize; // misalnya page * pageSize

      // Konfig Date
      const configQuery = `
                        SELECT start_date
                        FROM adw_trackingsj_config
                        WHERE adw_trackingsj_config_id = 1
                        LIMIT 1;
                    `;

      const configRes = await dbClient.query(configQuery);
      const startDate =
        configRes.rows.length > 0 ? configRes.rows[0].start_date : null;

      if (!startDate) {
        return { success: false, message: "Config start_date not found" };
      }

      // Convert ke format YYYY-MM-DD untuk Oracle
      const oracleStartDate = dayjs(startDate).format("YYYY-MM-DD");

      // 2. Ambil data master dari Oracle terlebih dahulu
      // Ini adalah sumber data utama kita untuk periode yang diinginkan.
      const queryOracle = `
            SELECT * FROM (SELECT a.*, ROWNUM rnum  FROM (SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.VALUE AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                mi.ADW_TMS_ID
            FROM
                M_INOUT mi
            JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            JOIN C_ORDER co ON co.C_ORDER_ID = mi.C_ORDER_ID
            WHERE
                mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                AND mi.ISSOTRX = 'Y'
                -- Filter rentang waktu yang jelas di Oracle
                AND mi.MOVEMENTDATE >= TO_DATE(:startDate, 'YYYY-MM-DD')
                AND (mi.POREFERENCE NOT LIKE '%SAMPLE%' OR mi.POREFERENCE IS NULL)
                AND cb.ISSUBCONTRACT = 'N'
                AND co.ISMILKRUN = 'N'
            ORDER BY DOCUMENTNO DESC
            ) a
            WHERE ROWNUM <= :endRow
        )
        WHERE rnum > :startRow
        `;

      const binds = { startRow, endRow, startDate: oracleStartDate };

      const resultOracle = await connection.execute(queryOracle, binds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });
      const oracleRows = resultOracle.rows || [];

      // total count buat pagination AntD
      const totalResult = await connection.execute(`
                SELECT COUNT(*) AS TOTAL
                FROM M_InOut
                WHERE DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                AND ISSOTRX = 'Y'
                -- AND MOVEMENTDATE >= ADD_MONTHS(SYSDATE, -1)
            `);

      const totalRows = totalResult.rows[0].TOTAL || totalResult.rows[0][0];

      // Jika tidak ada data sama sekali dari Oracle, langsung selesaikan.
      if (oracleRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      // 3. Ekstrak M_INOUT_ID dari data Oracle untuk digunakan memfilter kueri Postgres
      const inoutIds = oracleRows.map((row) => row.M_INOUT_ID);

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
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN created END) AS ho_driver_to_customer,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN ad_user_id END) AS ho_driver_to_customerby,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN created END) AS accept_customer_from_driver,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN ad_user_id END) AS accept_customer_from_driverby,
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
                '' AS customer,
                '' AS adw_tms_id,
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
                user12.name AS accept_fat_from_mktby_name,
                user13.name AS ho_driver_to_customerby_name,
                user14.name AS accept_customer_from_driverby_name
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
            LEFT JOIN ad_user user13 ON pe.ho_driver_to_customerby = user13.ad_user_id
            LEFT JOIN ad_user user14 ON pe.accept_customer_from_driverby = user14.ad_user_id

        `;

      const resultPg = await dbClient.query(queryPostgres);
      const postgresRows = resultPg.rows || [];

      const combinedData = [];

      for (const postgresData of postgresRows) {
        combinedData.push({ ...postgresData });
      }

      for (const oracleRow of oracleRows) {
        const alreadyExists = combinedData.some(
          (item) => String(item.m_inout_id) === String(oracleRow.M_INOUT_ID),
        );

        if (!alreadyExists) {
          combinedData.push({
            m_inout_id: oracleRow.M_INOUT_ID,
            documentno: oracleRow.DOCUMENTNO,
            customer: oracleRow.CUSTOMER,
            plantime: oracleRow.PLANTIME,
            adw_tms_id: oracleRow.ADW_TMS_ID,
            cancelrequest: null,
            adw_trackingsj_id: null,
            checkpoin_id: null,
            ho_delivery_to_dpk: null,
            ho_delivery_to_dpkby: null,
            accept_dpk_from_delivery: null,
            accept_dpk_from_deliveryby: null,
            ho_dpk_to_driver: null,
            ho_dpk_to_driverby: null,
            accept_driver_from_dpk: null,
            accept_driver_from_dpkby: null,
            ho_driver_to_dpk: null,
            ho_driver_to_dpkby: null,
            accept_dpk_from_driver: null,
            accept_dpk_from_driverby: null,
            ho_dpk_to_delivery: null,
            ho_dpk_to_deliveryby: null,
            accept_delivery_from_dpk: null,
            accept_delivery_from_dpkby: null,
            ho_delivery_to_mkt: null,
            ho_delivery_to_mktby: null,
            accept_mkt_from_delivery: null,
            accept_mkt_from_deliveryby: null,
            ho_mkt_to_fat: null,
            ho_mkt_to_fatby: null,
            accept_fat_from_mkt: null,
            accept_fat_from_mktby: null,
          });
        }
      }

      for (const comData of combinedData) {
        if (
          comData.customer == "" ||
          comData.customer == null ||
          comData.customer == undefined
        ) {
          let query = `SELECT
                                    mi.DOCUMENTNO,
                                    mi.ADW_TMS_ID,
                                    CB.VALUE CUSTOMER
                                 FROM M_INOUT mi
                                 JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                                 WHERE
                                    m_inout_id = :m_inout_id`;

          const result = await connection.execute(
            query,
            { m_inout_id: comData.m_inout_id },
            {
              outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
            },
          );

          const rowData = result.rows[0];

          if (comData.documentno === rowData.DOCUMENTNO) {
            comData.customer = rowData.CUSTOMER;
            comData.adw_tms_id = rowData.ADW_TMS_ID;
          }
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
          total_pages: Math.ceil(totalRows / pageSize),
        },
        data: combinedData,
      };
    } catch (error) {
      console.error("Error in getHistory:", error); // Gunakan console.error untuk error
      return { success: false, message: "Server error" };
    } finally {
      // Pastikan kedua koneksi ditutup dengan benar
      if (connection) {
        try {
          await connection.close();
        } catch (e) {
          console.error("Error closing Oracle connection:", e);
        }
      }
      if (dbClient) {
        try {
          dbClient.release();
        } catch (e) {
          console.error("Error releasing pg client:", e);
        }
      }
    }
  }

  async getHistory2(server, page, pageSize, startDate, endDate, docNo) {
    let connection;
    let dbClient;

    try {
      // 1. Buka koneksi ke kedua database secara paralel untuk menghemat waktu
      [connection, dbClient] = await Promise.all([
        oracleDB.openConnection(),
        server.pg.connect(),
      ]);

      const offset = (page - 1) * pageSize;

      const startRow = offset; // misalnya (page - 1) * pageSize
      const endRow = startRow + pageSize; // misalnya page * pageSize

      let finalStartDate;
      let finalEndDate;

      // Konfig Date
      if (startDate && endDate) {
        // Jika ada input user, gunakan input tersebut
        finalStartDate = startDate;
        finalEndDate = endDate;
      } else {
        // Jika null/kosong, ambil dari Config Database PG
        const configQuery = `
                    SELECT start_date
                    FROM adw_trackingsj_config
                    WHERE adw_trackingsj_config_id = 1
                    LIMIT 1;
                `;

        const configRes = await dbClient.query(configQuery);
        const configDate =
          configRes.rows.length > 0 ? configRes.rows[0].start_date : null;

        if (!configDate) {
          return { success: false, message: "Config start_date not found" };
        }

        // Default: Dari config sampai Hari Ini (Current Date)
        finalStartDate = dayjs(configDate).format("YYYY-MM-DD");
        finalEndDate = dayjs().format("YYYY-MM-DD");
      }

      // Convert ke format YYYY-MM-DD untuk Oracle
      const oracleStartDate = dayjs(finalStartDate).format("YYYY-MM-DD");
      const oracleEndDate = dayjs(finalEndDate).format("YYYY-MM-DD");

      let docFilter = "";
      if (docNo && docNo.trim() !== "") {
        docFilter = ` AND mi.DOCUMENTNO LIKE '%' || :docNo || '%' `;
      }

      const binds = {
        startRow,
        endRow,
        startDate: oracleStartDate,
        endDate: oracleEndDate,
        ...(docNo?.trim() ? { docNo: docNo.trim() } : {}),
      };

      // 2. Ambil data master dari Oracle terlebih dahulu
      // Ini adalah sumber data utama kita untuk periode yang diinginkan.
      const queryOracle = `
            SELECT * FROM (SELECT a.*, ROWNUM rnum  FROM (SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.VALUE AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                mi.ADW_TMS_ID
            FROM
                M_INOUT mi
            JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            JOIN C_ORDER co ON co.C_ORDER_ID = mi.C_ORDER_ID
            WHERE
                mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                AND mi.ISSOTRX = 'Y'
                -- Filter rentang waktu yang jelas di Oracle
                AND mi.MOVEMENTDATE >= TO_DATE(:startDate, 'YYYY-MM-DD')
                AND mi.MOVEMENTDATE < TO_DATE(:endDate, 'YYYY-MM-DD') + 1
                AND (mi.POREFERENCE NOT LIKE '%SAMPLE%' OR mi.POREFERENCE IS NULL)
                AND cb.ISSUBCONTRACT = 'N'
                AND co.ISMILKRUN = 'N'
                ${docFilter}
            ORDER BY DOCUMENTNO DESC
            ) a
            WHERE ROWNUM <= :endRow
        )
        WHERE rnum > :startRow
        `;

      const resultOracle = await connection.execute(queryOracle, binds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });
      const oracleRows = resultOracle.rows || [];

      const countBinds = {
        startDate: oracleStartDate,
        endDate: oracleEndDate,
        ...(docNo?.trim() ? { docNo: docNo.trim() } : {}), // Tambahkan ini
      };

      // total count buat pagination AntD
      const totalResult = await connection.execute(
        `
                SELECT COUNT(*) AS TOTAL
                FROM M_InOut mi
                JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                JOIN C_ORDER co ON co.C_ORDER_ID = mi.C_ORDER_ID
                WHERE mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                AND mi.ISSOTRX = 'Y'
                AND mi.MOVEMENTDATE >= TO_DATE(:startDate, 'YYYY-MM-DD')
                AND mi.MOVEMENTDATE < TO_DATE(:endDate, 'YYYY-MM-DD') + 1
                AND (mi.POREFERENCE NOT LIKE '%SAMPLE%' OR mi.POREFERENCE IS NULL)
                AND cb.ISSUBCONTRACT = 'N'
                AND co.ISMILKRUN = 'N'
                ${docFilter}
            `,
        countBinds,
      );

      const totalRows = totalResult.rows[0].TOTAL || totalResult.rows[0][0];

      // Jika tidak ada data sama sekali dari Oracle, langsung selesaikan.
      if (oracleRows.length === 0) {
        return {
          success: true,
          count: 0,
          meta: {
            total: totalRows,
            count: 0,
            per_page: pageSize,
            current_page: page,
            total_pages: Math.ceil(totalRows / pageSize),
          },
          data: [],
        };
      }

      // 3. Ekstrak M_INOUT_ID dari data Oracle untuk digunakan memfilter kueri Postgres
      const inoutIds = oracleRows.map((row) => row.M_INOUT_ID);

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
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN created END) AS ho_driver_to_customer,
                    MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN ad_user_id END) AS ho_driver_to_customerby,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN created END) AS accept_customer_from_driver,
                    MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN ad_user_id END) AS accept_customer_from_driverby,
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
                '' AS customer,
                '' AS adw_tms_id,
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
                user12.name AS accept_fat_from_mktby_name,
                user13.name AS ho_driver_to_customerby_name,
                user14.name AS accept_customer_from_driverby_name
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
            LEFT JOIN ad_user user13 ON pe.ho_driver_to_customerby = user13.ad_user_id
            LEFT JOIN ad_user user14 ON pe.accept_customer_from_driverby = user14.ad_user_id
            WHERE ats.m_inout_id = ANY($1::int[]) -- Filter di sini juga

        `;

      const resultPg = await dbClient.query(queryPostgres, [inoutIds]);
      const postgresRows = resultPg.rows || [];

      const combinedData = [];

      for (const oracleRow of oracleRows) {
        // Cari data tracking di PG yang cocok dengan M_INOUT_ID dari Oracle
        const pgData = postgresRows.find(
          (pg) => String(pg.m_inout_id) === String(oracleRow.M_INOUT_ID),
        );

        if (pgData) {
          // Jika ada tracking di PG, pakai data gabungan
          combinedData.push({
            ...pgData,
            // Pastikan field master dari Oracle tetap terisi jika di PG null (safety)
            customer: oracleRow.CUSTOMER,
            adw_tms_id: oracleRow.ADW_TMS_ID,
            plantime: oracleRow.PLANTIME,
            documentno: oracleRow.DOCUMENTNO,
          });
        } else {
          // Jika belum ada tracking (belum di-insert ke PG), tampilkan data mentah Oracle
          // dengan field tracking null
          combinedData.push({
            m_inout_id: oracleRow.M_INOUT_ID,
            documentno: oracleRow.DOCUMENTNO,
            customer: oracleRow.CUSTOMER,
            plantime: oracleRow.PLANTIME,
            adw_tms_id: oracleRow.ADW_TMS_ID,
            cancelrequest: null,
            adw_trackingsj_id: null,
            checkpoin_id: null,
            ho_delivery_to_dpk: null,
            ho_delivery_to_dpkby: null,
            accept_dpk_from_delivery: null,
            accept_dpk_from_deliveryby: null,
            ho_dpk_to_driver: null,
            ho_dpk_to_driverby: null,
            accept_driver_from_dpk: null,
            accept_driver_from_dpkby: null,
            ho_driver_to_dpk: null,
            ho_driver_to_dpkby: null,
            accept_dpk_from_driver: null,
            accept_dpk_from_driverby: null,
            ho_dpk_to_delivery: null,
            ho_dpk_to_deliveryby: null,
            accept_delivery_from_dpk: null,
            accept_delivery_from_dpkby: null,
            ho_delivery_to_mkt: null,
            ho_delivery_to_mktby: null,
            accept_mkt_from_delivery: null,
            accept_mkt_from_deliveryby: null,
            ho_mkt_to_fat: null,
            ho_mkt_to_fatby: null,
            accept_fat_from_mkt: null,
            accept_fat_from_mktby: null,
          });
        }
      }

      for (const comData of combinedData) {
        if (!comData.customer) {
          let query = `SELECT
                                    mi.DOCUMENTNO,
                                    mi.ADW_TMS_ID,
                                    cb.VALUE AS CUSTOMER
                                 FROM M_INOUT mi
                                 JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                                 WHERE m_inout_id = :m_inout_id`;

          const result = await connection.execute(
            query,
            { m_inout_id: comData.m_inout_id },
            {
              outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
            },
          );

          if (result.rows.length > 0) {
            const rowData = result.rows[0];
            if (comData.documentno === rowData.DOCUMENTNO) {
              comData.customer = rowData.CUSTOMER;
              comData.adw_tms_id = rowData.ADW_TMS_ID;
            }
          }
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
          total_pages: Math.ceil(totalRows / pageSize),
        },
        data: combinedData,
      };
    } catch (error) {
      console.error("Error in getHistory:", error); // Gunakan console.error untuk error
      return { success: false, message: "Server error" };
    } finally {
      // Pastikan kedua koneksi ditutup dengan benar
      if (connection) {
        try {
          await connection.close();
        } catch (e) {
          console.error("Error closing Oracle connection:", e);
        }
      }
      if (dbClient) {
        try {
          dbClient.release();
        } catch (e) {
          console.error("Error releasing pg client:", e);
        }
      }
    }
  }

  async getHistory3(
    server,
    page,
    pageSize,
    startDate,
    endDate,
    docNo,
    customer,
  ) {
    let connection;
    let dbClient;

    try {
      // Buka koneksi
      connection = await oracleDB.openConnection();
      dbClient = await server.pg.connect();

      // ==========================
      // SETUP TANGGAL
      // ==========================
      let finalStartDate, finalEndDate;

      if (startDate && endDate) {
        finalStartDate = startDate;
        finalEndDate = endDate;
      } else {
        const configQuery = `SELECT start_date FROM adw_trackingsj_config WHERE adw_trackingsj_config_id = 1 LIMIT 1;`;
        const configRes = await dbClient.query(configQuery);
        const configDate =
          configRes.rows.length > 0 ? configRes.rows[0].start_date : null;
        if (!configDate)
          return { success: false, message: "Config start_date not found" };

        finalStartDate = dayjs(configDate).format("YYYY-MM-DD");
        finalEndDate = dayjs().format("YYYY-MM-DD");
      }

      const oracleStartDate = dayjs(finalStartDate).format("YYYY-MM-DD");
      const oracleEndDate = dayjs(finalEndDate).format("YYYY-MM-DD");

      // ==========================
      // LANGKAH 1: FETCH MASTER ID DARI ORACLE
      // ==========================
      let oraDocFilter = "";
      const oraBinds = {
        startDate: oracleStartDate,
        endDate: oracleEndDate,
      };

      if (docNo && docNo.trim() !== "") {
        oraDocFilter = ` AND mi.DOCUMENTNO LIKE '%' || :docNo || '%' `;
        oraBinds.docNo = docNo.trim();
      }

      if (customer && customer.trim() !== "") {
        oraDocFilter = ` AND cb.VALUE LIKE '%' || :customer || '%' `;
        oraBinds.customer = customer.trim();
      }

      const queryOracleIds = `
                SELECT
                    mi.M_INOUT_ID,
                    mi.DOCUMENTNO,
                    mi.MOVEMENTDATE
                FROM M_INOUT mi
                JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                JOIN C_ORDER co ON co.C_ORDER_ID = mi.C_ORDER_ID
                WHERE
                    mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                    AND mi.ISSOTRX = 'Y'
                    AND mi.MOVEMENTDATE >= TO_DATE(:startDate, 'YYYY-MM-DD')
                    AND mi.MOVEMENTDATE < TO_DATE(:endDate, 'YYYY-MM-DD') + 1
                    AND (mi.POREFERENCE NOT LIKE '%SAMPLE%' OR mi.POREFERENCE IS NULL)
                    AND cb.ISSUBCONTRACT = 'N'
                    AND co.ISMILKRUN = 'N'
                    ${oraDocFilter}
            `;

      const resultOracleIds = await connection.execute(
        queryOracleIds,
        oraBinds,
        {
          outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
        },
      );

      const oracleRowsRaw = resultOracleIds.rows || [];

      if (oracleRowsRaw.length === 0) {
        return {
          success: true,
          count: 0,
          meta: {
            total: 0,
            count: 0,
            per_page: pageSize,
            current_page: page,
            total_pages: 0,
          },
          data: [],
        };
      }

      const allOracleIds = oracleRowsRaw.map((row) => row.M_INOUT_ID);

      // ==========================
      // LANGKAH 2: FETCH SKOR DARI POSTGRES (DENGAN BOBOT/WEIGHT)
      // ==========================
      // PERBAIKAN UTAMA DISINI: Menggunakan MAX(CASE WHEN...) untuk menentukan prioritas tertinggi

      const queryPgScores = `
                SELECT
                    ats.m_inout_id,
                    MAX(
                        CASE
                            -- Level 8: FAT Final (Selesai Total)
                            WHEN ate.adw_to_actor = 'FAT' AND ate.adw_event_type = 'ACCEPTANCE' THEN 1000
                            -- Level 7: Menunggu di FAT
                            WHEN ate.adw_to_actor = 'FAT' THEN 900
                            -- Level 6: Proses di Marketing
                            WHEN ate.adw_to_actor = 'Marketing' THEN 800
                            -- Level 5: Balik ke Delivery
                            WHEN ate.adw_to_actor = 'Delivery' AND ate.adw_from_actor = 'DPK' THEN 700
                            -- Level 4: Balik ke DPK (Setelah Customer)
                            WHEN ate.adw_to_actor = 'DPK' AND ate.adw_from_actor = 'Driver' THEN 600
                            -- Level 3: Di Customer / Driver
                            WHEN ate.adw_to_actor IN ('Customer', 'Driver') THEN 500
                            -- Level 2: Masih di DPK Awal
                            WHEN ate.adw_to_actor = 'DPK' THEN 400
                            -- Level 1: Masih di Delivery Awal
                            ELSE 100
                        END
                    ) as weight_score,
                    -- Tambahkan count sebagai tie-breaker (pemecah seri jika weight sama)
                    COUNT(ate.adw_trackingsj_events_id) as event_count
                FROM adw_trackingsj ats
                LEFT JOIN adw_trackingsj_events ate ON ats.adw_trackingsj_id = ate.adw_trackingsj_id
                WHERE ats.m_inout_id = ANY($1::int[])
                GROUP BY ats.m_inout_id
            `;

      const resultPgScores = await dbClient.query(queryPgScores, [
        allOracleIds,
      ]);

      const pgScoreMap = new Map();
      resultPgScores.rows.forEach((row) => {
        // Score Akhir = Bobot + (Jumlah Event / 1000).
        // Contoh: FAT Selesai (1000) + 12 events = 1000.012
        // Contoh: FAT Wait (900) + 20 events = 900.020
        // Hasil: 1000.012 > 900.020. FAT Selesai tetap menang.
        const weight = parseInt(row.weight_score || 0);
        const count = parseInt(row.event_count || 0);
        const finalScore = weight + count * 0.001;

        pgScoreMap.set(String(row.m_inout_id), finalScore);
      });

      // ==========================
      // LANGKAH 3: MERGE & SORTING
      // ==========================

      const mergedList = oracleRowsRaw.map((row) => {
        const idStr = String(row.M_INOUT_ID);
        const score = pgScoreMap.get(idStr) || 0; // Default 0 jika tidak ada di PG

        return {
          m_inout_id: row.M_INOUT_ID,
          documentno: row.DOCUMENTNO,
          score: score,
          date: row.MOVEMENTDATE,
        };
      });

      // SORTING: Score Tertinggi (FAT Selesai) -> Terendah
      mergedList.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score; //DESC
          // return a.score - b.score ; //ASC
        }
        // Jika score sama, urutkan tanggal terbaru
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) return dateB - dateA;

        return 0;
      });

      // ==========================
      // LANGKAH 4: PAGINATION
      // ==========================

      const totalRows = mergedList.length;
      let targetIds = [];
      const isExportMode = parseInt(pageSize) === 0;

      if (isExportMode) {
        targetIds = mergedList.map((item) => item.m_inout_id);
      } else {
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const pagedItems = mergedList.slice(startIndex, endIndex);
        targetIds = pagedItems.map((item) => item.m_inout_id);
      }

      if (targetIds.length === 0) {
        return {
          success: true,
          count: 0,
          meta: {
            total: totalRows,
            count: 0,
            per_page: pageSize,
            current_page: page,
            total_pages: 0,
          },
          data: [],
        };
      }

      // ==========================
      // LANGKAH 5: FETCH DETAIL (CHUNKING)
      // ==========================

      const chunkArray = (arr, size) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };

      const idChunks = chunkArray(targetIds, 950);
      const oracleDetails = [];
      const postgresDetails = [];

      for (const chunk of idChunks) {
        const idsString = chunk.join(",");

        // 5a. Oracle
        const queryOracleDetail = `
                    SELECT
                        mi.M_INOUT_ID,
                        mi.DOCUMENTNO,
                        cb.VALUE AS CUSTOMER,
                        TO_DATE(
                            TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                            TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                            'YYYY-MM-DD HH24:MI:SS'
                        ) AS PLANTIME,
                        mi.ADW_TMS_ID
                    FROM M_INOUT mi
                    JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
                    WHERE mi.M_INOUT_ID IN (${idsString})
                `;
        const resOra = await connection.execute(
          queryOracleDetail,
          {},
          { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT },
        );
        if (resOra.rows) oracleDetails.push(...resOra.rows);

        // 5b. Postgres
        const queryPostgresDetail = `
                WITH RankedEvents AS (
                    SELECT
                        e.adw_trackingsj_id, e.username, e.ad_user_id, e.created, e.adw_event_type, e.adw_from_actor, e.adw_to_actor,
                        ROW_NUMBER() OVER(PARTITION BY e.adw_trackingsj_id, e.adw_event_type, e.adw_from_actor, e.adw_to_actor ORDER BY e.created DESC) as rn
                    FROM adw_trackingsj_events e
                    JOIN adw_trackingsj ats_filter ON e.adw_trackingsj_id = ats_filter.adw_trackingsj_id
                    WHERE ats_filter.m_inout_id = ANY($1::int[])
                ),
                PivotedEvents AS (
                   SELECT
                        adw_trackingsj_id,
                        MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'DPK' THEN created END) AS ho_delivery_to_dpk,
                        MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'DPK' THEN ad_user_id END) AS ho_delivery_to_dpkby,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'DPK' THEN created END) AS accept_dpk_from_delivery,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'DPK' THEN ad_user_id END) AS accept_dpk_from_deliveryby,
                        MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Driver' THEN created END) AS ho_dpk_to_driver,
                        MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Driver' THEN ad_user_id END) AS ho_dpk_to_driverby,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Driver' THEN created END) AS accept_driver_from_dpk,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'DPK' AND adw_to_actor = 'Driver' THEN username END) AS accept_driver_from_dpkby,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'Driver' THEN created END) AS accept_driver_from_delivery,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Delivery' AND adw_to_actor = 'Driver' THEN username END) AS accept_driver_from_deliveryby,
                        MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN created END) AS ho_driver_to_customer,
                        MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN ad_user_id END) AS ho_driver_to_customerby,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN created END) AS accept_customer_from_driver,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'Customer' THEN username END) AS accept_customer_from_driverby,
                        MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'DPK' THEN created END) AS ho_driver_to_dpk,
                        MAX(CASE WHEN adw_event_type = 'HANDOVER' AND adw_from_actor = 'Driver' AND adw_to_actor = 'DPK' THEN ad_user_id END) AS ho_driver_to_dpkby,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'DPK' THEN created END) AS accept_dpk_from_driver,
                        MAX(CASE WHEN adw_event_type = 'ACCEPTANCE' AND adw_from_actor = 'Driver' AND adw_to_actor = 'DPK' THEN username END) AS accept_dpk_from_driverby,
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
                ),
                CancelLogs AS (
                   SELECT
                     e.adw_trackingsj_id,
                     STRING_AGG(
                       to_char(e.created, 'YYYY-MM-DD HH24:MI')
                       || ' | ' || e.notes
                       || ' | ' ||
                        CASE
                          WHEN u.name = 'System (deprecated)' OR u.name IS NULL --because if user is driver column createdby is 0
                            THEN e.username
                          ELSE u.name
                        END,
                       E'\n'
                       ORDER BY e.created DESC
                     ) AS cancel_logs
                   FROM adw_trackingsj_events e
                   LEFT JOIN ad_user u ON e.createdby = u.ad_user_id
                   WHERE e.adw_event_type = 'CANCEL'
                   GROUP BY e.adw_trackingsj_id
                )
                SELECT
                    ats.m_inout_id, '' AS customer, '' AS adw_tms_id, ats.documentno, ats.plantime,
                    cl.cancel_logs,
                    EXISTS (
                      SELECT 1
                      FROM adw_trackingsj_events ce
                      WHERE ce.adw_trackingsj_id = ats.adw_trackingsj_id
                        AND ce.adw_event_type = 'CANCEL'
                    ) AS has_cancel_log,
                    ats.cancelrequest, ats.adw_trackingsj_id, ats.checkpoin_id,
                    pe.*,
                    user1.name AS ho_delivery_to_dpkby_name,
                    user2.name AS accept_dpk_from_deliveryby_name,
                    user3.name AS ho_dpk_to_driverby_name,
                    pe.accept_driver_from_dpkby AS accept_driver_from_dpkby_name,
                    user5.name AS ho_driver_to_dpkby_name,
                    pe.accept_dpk_from_driverby AS accept_dpk_from_driverby_name,
                    user7.name AS ho_dpk_to_deliveryby_name,
                    user8.name AS accept_delivery_from_dpkby_name,
                    user9.name AS ho_delivery_to_mktby_name,
                    user10.name AS accept_mkt_from_deliveryby_name,
                    user11.name AS ho_mkt_to_fatby_name,
                    user12.name AS accept_fat_from_mktby_name,
                    user13.name AS ho_driver_to_customerby_name,
                    pe.accept_customer_from_driverby AS accept_customer_from_driverby_name
                FROM adw_trackingsj ats
                LEFT JOIN PivotedEvents pe ON ats.adw_trackingsj_id = pe.adw_trackingsj_id
                LEFT JOIN CancelLogs cl ON ats.adw_trackingsj_id = cl.adw_trackingsj_id
                LEFT JOIN ad_user user1 ON pe.ho_delivery_to_dpkby = user1.ad_user_id
                LEFT JOIN ad_user user2 ON pe.accept_dpk_from_deliveryby = user2.ad_user_id
                LEFT JOIN ad_user user3 ON pe.ho_dpk_to_driverby = user3.ad_user_id
                LEFT JOIN ad_user user5 ON pe.ho_driver_to_dpkby = user5.ad_user_id
                LEFT JOIN ad_user user7 ON pe.ho_dpk_to_deliveryby = user7.ad_user_id
                LEFT JOIN ad_user user8 ON pe.accept_delivery_from_dpkby = user8.ad_user_id
                LEFT JOIN ad_user user9 ON pe.ho_delivery_to_mktby = user9.ad_user_id
                LEFT JOIN ad_user user10 ON pe.accept_mkt_from_deliveryby = user10.ad_user_id
                LEFT JOIN ad_user user11 ON pe.ho_mkt_to_fatby = user11.ad_user_id
                LEFT JOIN ad_user user12 ON pe.accept_fat_from_mktby = user12.ad_user_id
                LEFT JOIN ad_user user13 ON pe.ho_driver_to_customerby = user13.ad_user_id
                WHERE ats.m_inout_id = ANY($1::int[])
                `;
        const resPg = await dbClient.query(queryPostgresDetail, [chunk]);
        if (resPg.rows) postgresDetails.push(...resPg.rows);
      }

      // ==========================
      // LANGKAH 6: MAPPING FINAL
      // ==========================

      const finalData = targetIds.map((id) => {
        const oraDetail = oracleDetails.find(
          (od) => String(od.M_INOUT_ID) === String(id),
        );
        const pgDetail = postgresDetails.find(
          (pd) => String(pd.m_inout_id) === String(id),
        );
        const masterItem = mergedList.find(
          (m) => String(m.m_inout_id) === String(id),
        );

        if (pgDetail) {
          return {
            ...pgDetail,
            customer: oraDetail?.CUSTOMER || pgDetail.customer,
            adw_tms_id: oraDetail?.ADW_TMS_ID || pgDetail.adw_tms_id,
            plantime: oraDetail?.PLANTIME || pgDetail.plantime,
            documentno: oraDetail?.DOCUMENTNO || pgDetail.documentno,
          };
        } else {
          return {
            m_inout_id: id,
            documentno: oraDetail?.DOCUMENTNO || masterItem?.documentno,
            customer: oraDetail?.CUSTOMER || null,
            plantime: oraDetail?.PLANTIME || null,
            adw_tms_id: oraDetail?.ADW_TMS_ID || null,
            cancelrequest: null,
            adw_trackingsj_id: null,
            checkpoin_id: null,
            ho_delivery_to_dpk: null,
          };
        }
      });

      return {
        success: true,
        count: finalData.length,
        meta: {
          total: totalRows,
          count: finalData.length,
          per_page: isExportMode ? totalRows : pageSize,
          current_page: page,
          total_pages: isExportMode ? 1 : Math.ceil(totalRows / pageSize),
        },
        data: finalData,
      };
    } catch (error) {
      console.error("Error in getHistory3:", error);
      return { success: false, message: "Server error: " + error.message };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (e) {
          console.error(e);
        }
      }
      if (dbClient) {
        try {
          dbClient.release();
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  async toCancel(server, payload) {
    const { action, m_inout_id, handoverKey, role, userId } = payload;
    let dbClient;

    try {
      dbClient = await server.pg.connect();
      await dbClient.query("BEGIN");

      // --- Logika untuk REQUEST CANCEL (Tidak berubah, sudah benar) ---
      if (action === "request-cancel") {
        const updateQuery = `
                    UPDATE adw_trackingsj
                    SET
                        cancelrequest = $1,
                        updated = NOW(),
                        updatedby = $2
                    WHERE
                        m_inout_id = $3;
                `;
        const result = await dbClient.query(updateQuery, [
          "Y",
          userId,
          m_inout_id,
        ]);

        if (result.rowCount === 0) {
          throw {
            statusCode: 404,
            message:
              "Dokumen tidak ditemukan atau tidak dalam status yang bisa dibatalkan.",
          };
        }

        await dbClient.query("COMMIT");
        return {
          success: true,
          message: "Permintaan pembatalan berhasil dikirim.",
        };
      }

      // --- Logika untuk CONFIRM CANCEL (Dengan perbaikan if/else) ---
      if (action === "confirm-cancel") {
        // 1. Dapatkan checkpoint saat ini dan adw_trackingsj_id
        const selectQuery = `
                    SELECT adw_trackingsj_id, checkpoin_id
                    FROM adw_trackingsj
                    WHERE m_inout_id = $1 AND cancelrequest = 'Y';
                `;
        const selectResult = await dbClient.query(selectQuery, [m_inout_id]);

        if (selectResult.rows.length === 0) {
          throw {
            statusCode: 404,
            message: "Tidak ada permintaan pembatalan aktif untuk dokumen ini.",
          };
        }
        const { adw_trackingsj_id, checkpoin_id: currentCheckpointId } =
          selectResult.rows[0];

        // --- KASUS SPESIAL: Jika di checkpoint pertama (2), hapus total ---
        if (String(currentCheckpointId) === "2") {
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
          const deleteTrackingResult = await dbClient.query(
            deleteTrackingQuery,
            [adw_trackingsj_id],
          );

          if (deleteTrackingResult.rowCount === 0) {
            throw new Error(
              "Gagal menghapus record tracking utama setelah menghapus event.",
            );
          }

          // Commit dan SELESAI. Kode tidak akan lanjut ke bawah.
          await dbClient.query("COMMIT");
          return {
            success: true,
            message:
              "Handover awal berhasil dibatalkan dan data tracking dihapus.",
          };
        } else {
          // --- KASUS NORMAL: Jika BUKAN di checkpoint 2, kembalikan ke state sebelumnya ---

          // 2. Cari checkpoint SEBELUMNYA
          const prevCheckpointEntry = Object.entries(CHECKPOINT_WORKFLOWS).find(
            ([key, value]) =>
              value.nextCheckpoint === String(currentCheckpointId),
          );

          if (!prevCheckpointEntry) {
            throw {
              statusCode: 400,
              message: `Tidak dapat menemukan alur kerja sebelumnya dari checkpoint saat ini: ${currentCheckpointId}.`,
            };
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
          await dbClient.query(updateQuery, [
            previousCheckpointId,
            userId,
            m_inout_id,
          ]);

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
          await dbClient.query("COMMIT");
          return { success: true, message: "Handover berhasil dibatalkan." };
        }
      }

      // Jika 'action' tidak sesuai
      throw { statusCode: 400, message: "Aksi yang diminta tidak valid." };
    } catch (error) {
      if (dbClient) await dbClient.query("ROLLBACK");
      console.error("Error in toCancel function:", error);
      throw error;
    } finally {
      if (dbClient) dbClient.release();
    }
  }

  async getHandedoverData(server, checkpointMin, checkpointMax = null, month) {
    let dbClient;
    let oracleConnection;

    // console.log(month); //example: '202404'

    try {
      [dbClient, oracleConnection] = await Promise.all([
        server.pg.connect(),
        oracleDB.openConnection(),
      ]);

      // Build checkpoint condition
      const checkpointCondition = checkpointMax
        ? `CAST(t.checkpoin_id AS INTEGER) >= ${checkpointMin} AND CAST(t.checkpoin_id AS INTEGER) < ${checkpointMax}`
        : `CAST(t.checkpoin_id AS INTEGER) >= ${checkpointMin}`;

      const pgCombinedQuery = `
            SELECT
                COUNT(*) AS totaldoc,
                ARRAY_AGG(t.m_inout_id) AS inout_ids,
                TO_CHAR(t.created, 'YYYYMM') AS month
            FROM adw_trackingsj t
            WHERE ${checkpointCondition}
                AND t.created >= DATE_TRUNC('month', TO_DATE($1, 'YYYYMM'))
                AND t.created < DATE_TRUNC('month', TO_DATE($1, 'YYYYMM')) + INTERVAL '1 month'
            GROUP BY TO_CHAR(t.created, 'YYYYMM')
        `;

      const resultPg = await dbClient.query(pgCombinedQuery, [month]);

      const totalDoc = Number(resultPg.rows[0]?.totaldoc ?? 0);
      const inoutIds =
        resultPg.rows[0]?.inout_ids?.filter((id) => id !== null) || [];

      let totalAmount = 0;
      let totalPctDoc = 0;

      // console.log(inoutIds);

      if (inoutIds.length > 0 && totalDoc > 0) {
        // 1. Buat placeholder dinamis untuk IN clause
        //    Contoh: Jika inoutIds = [101, 102], ini akan jadi ':id1,:id2'
        const inoutIdPlaceholders = inoutIds
          .map((_, idx) => `:id${idx + 1}`)
          .join(",");

        // 2. Buat objek bind untuk semua parameter, termasuk inout_ids dan month
        const oracleBindParams = inoutIds.reduce((acc, id, idx) => {
          // Konversi ID ke integer dan tambahkan ke objek bind dengan nama unik
          acc[`id${idx + 1}`] = parseInt(id);
          return acc;
        }, {});

        // Tambahkan parameter 'month' ke objek bind
        oracleBindParams.month = month;

        // console.log('Generated IN placeholders:', inoutIdPlaceholders);
        // console.log('Generated Oracle Bind Params:', oracleBindParams);

        const combinedOracleQuery = `
                SELECT
                    (
                        SELECT COALESCE(SUM(mil.MOVEMENTQTY * col.PRICEACTUAL), 0)
                        FROM M_INOUT mi
                        JOIN M_INOUTLINE mil ON mi.M_INOUT_ID = mil.M_INOUT_ID
                        JOIN C_ORDERLINE col ON mil.C_ORDERLINE_ID = col.C_ORDERLINE_ID
                        WHERE mi.M_INOUT_ID IN (${inoutIdPlaceholders})
                            AND mi.MOVEMENTDATE >= TO_DATE(:month, 'YYYYMM')
                            AND mi.MOVEMENTDATE <= LAST_DAY(TO_DATE(:month, 'YYYYMM'))
                    ) AS TOTALAMOUNT,
                    (
                        SELECT COUNT(*)
                        FROM M_INOUT mi2
                        INNER JOIN C_BPARTNER cb ON mi2.C_BPARTNER_ID = cb.C_BPARTNER_ID
                        WHERE
                            -- Baris ini di-comment, jadi pastikan Anda ingin menghapusnya
                            -- mi2.MOVEMENTDATE >= TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') + 20
                            mi2.MOVEMENTDATE >= TO_DATE(:month, 'YYYYMM') -- Gunakan parameter :month
                            AND mi2.MOVEMENTDATE <= LAST_DAY(TO_DATE(:month, 'YYYYMM')) -- Gunakan parameter :month
                            AND mi2.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                            AND mi2.ISSOTRX = 'Y'
                    ) AS TOTAL_COUNT
                FROM DUAL
            `;

        const resultOracle = await oracleConnection.execute(
          combinedOracleQuery,
          oracleBindParams, // Teruskan objek bindParams yang sudah lengkap
          {
            outFormat: oracleDB.OUT_FORMAT_OBJECT, // Output sebagai objek agar mudah diakses
          },
        );

        // Akses hasil berdasarkan nama alias karena outFormat: OBJECT
        totalAmount = resultOracle.rows?.[0][0] ?? 0;
        const totalDocStatusComplete = resultOracle.rows?.[0][1] ?? 0;

        totalPctDoc =
          totalDocStatusComplete > 0
            ? Number(((totalDoc / totalDocStatusComplete) * 100).toFixed(2))
            : 0;
      }

      const data = {
        totalDoc: totalDoc,
        totalAmount: Number(totalAmount),
        percentage: totalPctDoc,
      };

      return { success: true, rows: data };
    } catch (error) {
      console.error("Error in getHandedoverData:", error);
      console.error("Error stack:", error.stack);
      return { success: false, message: "Server Error", error: error.message };
    } finally {
      try {
        if (dbClient) await dbClient.release();
      } catch (err) {
        console.error("Error releasing PostgreSQL client:", err);
      }

      try {
        if (oracleConnection) await oracleConnection.close();
      } catch (err) {
        console.error("Error closing Oracle connection:", err);
      }
    }
  }

  async getDocStatusCompele(server, month) {
    let oracleConnection;

    try {
      [oracleConnection] = await Promise.all([oracleDB.openConnection()]);

      const combinedOracleQuery = `
                SELECT
                    (
                        SELECT COALESCE(SUM(mil.MOVEMENTQTY * col.PRICEACTUAL), 0)
                        FROM M_INOUT mi
                        JOIN M_INOUTLINE mil ON mi.M_INOUT_ID = mil.M_INOUT_ID
                        JOIN C_ORDERLINE col ON mil.C_ORDERLINE_ID = col.C_ORDERLINE_ID
                        WHERE mi.MOVEMENTDATE >= TO_DATE(:month, 'YYYYMM')
                            AND mi.MOVEMENTDATE <= LAST_DAY(TO_DATE(:month, 'YYYYMM'))
                    ) AS TOTALAMOUNT,
                    (
                        SELECT COUNT(*)
                        FROM M_INOUT mi2
                        INNER JOIN C_BPARTNER cb ON mi2.C_BPARTNER_ID = cb.C_BPARTNER_ID
                        WHERE
                            -- mi2.MOVEMENTDATE >= TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') + 20
                            mi2.MOVEMENTDATE >= TO_DATE(:month, 'YYYYMM')
                            AND mi2.MOVEMENTDATE <= LAST_DAY(TO_DATE(:month, 'YYYYMM'))
                            AND mi2.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                            AND mi2.ISSOTRX = 'Y'
                    ) AS TOTAL_COUNT
                FROM DUAL
            `;

      const resultOracle = await oracleConnection.execute(
        combinedOracleQuery,
        { month },
        {
          outFormat: oracleDB.OUT_FORMAT_OBJECT,
        },
      );

      let dataHandedoverDPK = await this.getHandedoverData(server, 2, 8, month);

      const docHandedoverDPK = dataHandedoverDPK.rows;

      const totalDocComplete = resultOracle.rows[0][1];
      const totalAmount = resultOracle.rows[0][0];

      const totalDocHandoveredToDPK = docHandedoverDPK.totalDoc;
      const remainingDocs = totalDocComplete - totalDocHandoveredToDPK;

      const percentage =
        totalDocComplete > 0
          ? Number(((remainingDocs / totalDocComplete) * 100).toFixed(2))
          : 0;

      const data = {
        totalDoc: totalDocComplete,
        totalAmount: totalAmount,
        percentage: percentage,
      };

      return { success: true, rows: data };
    } catch (error) {
      console.error("Error in getHandedoverData:", error);
      console.error("Error stack:", error.stack);
      return { success: false, message: "Server Error", error: error.message };
    } finally {
      try {
        if (oracleConnection) await oracleConnection.close();
      } catch (err) {
        console.error("Error closing Oracle connection:", err);
      }
    }
  }

  async notYetToMkt(server, month) {
    let dbClient;
    let oracleConnection;

    try {
      [dbClient, oracleConnection] = await Promise.all([
        server.pg.connect(),
        oracleDB.openConnection(),
      ]);

      const hasHandoveredFromDPK = `
            SELECT
                COUNT(*) AS totaldoc,
                ARRAY_AGG(t.m_inout_id) AS inout_ids
            FROM adw_trackingsj t
            WHERE
                CAST(t.checkpoin_id AS INTEGER) = 8
                AND t.created >= DATE_TRUNC('month', TO_DATE($1, 'YYYYMM'))
                AND t.created < DATE_TRUNC('month', TO_DATE($1, 'YYYYMM')) + INTERVAL '1 month'
        `;

      const resultHandoveredDPK = await dbClient.query(hasHandoveredFromDPK, [
        month,
      ]);
      const totalDocHandoveredDPK = Number(
        resultHandoveredDPK.rows[0]?.totaldoc ?? 0,
      );

      const notHandoverToMkt = `
            SELECT
                COUNT(*) AS totaldoc,
                ARRAY_AGG(t.m_inout_id) AS inout_ids
            FROM adw_trackingsj t
            WHERE
                CAST(t.checkpoin_id AS INTEGER) = 9
                AND t.created >= DATE_TRUNC('month', TO_DATE($1, 'YYYYMM'))
                AND t.created < DATE_TRUNC('month', TO_DATE($1, 'YYYYMM')) + INTERVAL '1 month'
        `;

      const resultPg = await dbClient.query(notHandoverToMkt, [month]);

      const totalDoc = Number(resultPg.rows[0]?.totaldoc ?? 0);
      const inoutIds =
        resultPg.rows[0]?.inout_ids?.filter((id) => id !== null) || [];

      let totalAmount = 0;
      let totalPctDoc = 0;

      if (inoutIds.length > 0 && totalDoc > 0) {
        const inoutIdPlaceholders = inoutIds
          .map((_, idx) => `:id${idx + 1}`)
          .join(",");

        const oracleBindParams = inoutIds.reduce((acc, id, idx) => {
          acc[`id${idx + 1}`] = parseInt(id);
          return acc;
        }, {});

        oracleBindParams.month = month;

        const combinedOracleQuery = `
                SELECT
                    (
                        SELECT COALESCE(SUM(mil.MOVEMENTQTY * col.PRICEACTUAL), 0)
                        FROM M_INOUT mi
                        JOIN M_INOUTLINE mil ON mi.M_INOUT_ID = mil.M_INOUT_ID
                        JOIN C_ORDERLINE col ON mil.C_ORDERLINE_ID = col.C_ORDERLINE_ID
                        WHERE
                            mi.M_INOUT_ID IN (${inoutIdPlaceholders})
                            AND mi.MOVEMENTDATE >= TO_DATE(:month, 'YYYYMM')
                            AND mi.MOVEMENTDATE <= LAST_DAY(TO_DATE(:month, 'YYYYMM'))
                    ) AS TOTALAMOUNT,
                    (
                        SELECT COUNT(*)
                        FROM M_INOUT mi2
                        INNER JOIN C_BPARTNER cb ON mi2.C_BPARTNER_ID = cb.C_BPARTNER_ID
                        WHERE
                            -- mi2.MOVEMENTDATE >= TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') + 20
                            mi2.MOVEMENTDATE >= TO_DATE(:month, 'YYYYMM') -- Gunakan parameter :month
                            AND mi2.MOVEMENTDATE <= LAST_DAY(TO_DATE(:month, 'YYYYMM')) -- Gunakan parameter :month
                            AND mi2.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                            AND mi2.ISSOTRX = 'Y'
                    ) AS TOTAL_COUNT
                FROM DUAL
            `;

        const resultOracle = await oracleConnection.execute(
          combinedOracleQuery,
          oracleBindParams,
          {
            outFormat: oracleDB.OUT_FORMAT_OBJECT,
          },
        );

        totalAmount =
          resultOracle.rows?.[0]?.TOTALAMOUNT ??
          resultOracle.rows?.[0]?.[0] ??
          0;

        totalPctDoc =
          totalDocHandoveredDPK > 0
            ? Number(((totalDocHandoveredDPK / totalDoc) * 100).toFixed(2))
            : 0;
      }

      const data = {
        totalDoc: totalDoc,
        totalAmount: Number(totalAmount),
        percentage: totalPctDoc,
      };

      return { success: true, rows: data };
    } catch (error) {
      console.error("Error in getHandedoverData:", error);
      console.error("Error stack:", error.stack);
      return { success: false, message: "Server Error", error: error.message };
    } finally {
      try {
        if (dbClient) await dbClient.release();
      } catch (err) {
        console.error("Error releasing PostgreSQL client:", err);
      }

      try {
        if (oracleConnection) await oracleConnection.close();
      } catch (err) {
        console.error("Error closing Oracle connection:", err);
      }
    }
  }

  async getNotYetSubmittedToMarketing(server) {
    return await this.getHandedoverData(server, 9, 10); // >= 9 and < 10
  }

  async getHandedoverMarketing(server, month) {
    return await this.getHandedoverData(server, 10, null, month); // >= 10
  }

  async getHandedoverDPK(server, month) {
    return await this.getHandedoverData(server, 2, 8, month); // >= 2 AND < 8
  }

  async getDataDashboard(server, checkpoint, month) {
    let dbClient;
    let oracleConnection;

    if (month) {
      try {
        if (checkpoint == 1) {
          try {
            oracleConnection = await oracleDB.openConnection();

            dbClient = await server.pg.connect();

            const queryCountTrackingSj = `
                            SELECT COUNT(*) totalDoc
                            FROM adw_trackingsj
                            WHERE TO_CHAR(created, 'YYYYMM') = $1
                    `;

            const totalDocTracking = await dbClient.query(
              queryCountTrackingSj,
              [month],
            );

            const combinedOracleQuery = `
                            SELECT
                                (
                                    SELECT COUNT(*)
                                    FROM M_INOUT mi2
                                    INNER JOIN C_BPARTNER cb ON mi2.C_BPARTNER_ID = cb.C_BPARTNER_ID
                                    WHERE
                                        -- mi2.MOVEMENTDATE >= TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') + 20
                                        TO_CHAR(mi2.MOVEMENTDATE, 'YYYYMM') = :month
                                        AND mi2.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                                        AND mi2.ISSOTRX = 'Y'
                                ) AS TOTAL_COUNT
                            FROM DUAL
                        `;

            const resultOracle = await oracleConnection.execute(
              combinedOracleQuery,
              { month },
              {
                outFormat: oracleDB.OUT_FORMAT_OBJECT,
              },
            );

            const totalDocComplete = resultOracle.rows[0][0];

            const totalDocCalculated =
              Number(totalDocComplete) -
              Number(totalDocTracking.rows[0]?.totaldoc ?? 0);

            return totalDocCalculated;
          } catch (error) {
            console.log("Error getDataDashboard:", error);
            return 0;
          } finally {
            if (oracleConnection) await oracleConnection.close();
          }
        }

        dbClient = await server.pg.connect();

        const queryTrackingShipments = `
                    SELECT COUNT(*) totalDoc
                    FROM adw_trackingsj_events
                    WHERE
                        CAST(checkpoin_id AS INTEGER) = $1
                        AND created::date = current_date
            `;

        const resultTrackingShipmentsRows = await dbClient.query(
          queryTrackingShipments,
          [checkpoint],
        );
        const totalDoc = Number(
          resultTrackingShipmentsRows.rows[0]?.totaldoc ?? 0,
        );

        return totalDoc;
      } catch (error) {
        console.log("Error getDataDashboard:", error);
        return 0;
      } finally {
        if (dbClient) dbClient.release();
      }
    }

    try {
      if (checkpoint == 1) {
        try {
          oracleConnection = await oracleDB.openConnection();

          const combinedOracleQuery = `
                            SELECT
                                (
                                    SELECT COUNT(*)
                                    FROM M_INOUT mi2
                                    INNER JOIN C_BPARTNER cb ON mi2.C_BPARTNER_ID = cb.C_BPARTNER_ID
                                    WHERE
                                        -- mi2.MOVEMENTDATE >= TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') + 20
                                        TRUNC(mi2.MOVEMENTDATE) = TRUNC(SYSDATE)
                                        AND mi2.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                                        AND mi2.ISSOTRX = 'Y'
                                ) AS TOTAL_COUNT
                            FROM DUAL
                        `;

          const resultOracle = await oracleConnection.execute(
            combinedOracleQuery,
            {},
            {
              outFormat: oracleDB.OUT_FORMAT_OBJECT,
            },
          );

          const totalDocComplete = resultOracle.rows[0][0];

          const queryCountTrackingSj = `
                    SELECT COUNT(*) totalDoc
                    FROM adw_trackingsj
                    WHERE created::date = current_date
                    `;

          const totalDocTracking = await server.pg.query(queryCountTrackingSj);

          const totalDocCalculated =
            Number(totalDocComplete) -
            Number(totalDocTracking.rows[0]?.totaldoc ?? 0);

          return totalDocCalculated;
        } catch (error) {
          console.log("Error getDataDashboard:", error);
          return 0;
        } finally {
          if (oracleConnection) await oracleConnection.close();
        }
      }

      dbClient = await server.pg.connect();

      const queryTrackingShipments = `
            SELECT COUNT(*) totalDoc
            FROM adw_trackingsj_events
            WHERE
                CAST(checkpoin_id AS INTEGER) = $1
                AND created::date = current_date
            `;

      const resultTrackingShipmentsRows = await dbClient.query(
        queryTrackingShipments,
        [checkpoint],
      );
      const totalDoc = Number(
        resultTrackingShipmentsRows.rows[0]?.totaldoc ?? 0,
      );

      return totalDoc;
    } catch (error) {
      console.log("Error getDataDashboard:", error);
      return 0;
    } finally {
      if (dbClient) dbClient.release();
    }
  }

  async summaryDay(server) {
    const handoverDeliveryToDPKPrepare = await this.getDataDashboard(server, 1);

    const handoverDeliveryToDPKComplete = await this.getDataDashboard(
      server,
      2,
    );
    const receiptDPKFromDeliveryComplete = await this.getDataDashboard(
      server,
      3,
    );

    const handoverDPKToDriverComplete = await this.getDataDashboard(server, 4);
    const receiptDriverFromDPKComplete = await this.getDataDashboard(server, 5);

    const handoverDriverToDPKComplete = await this.getDataDashboard(server, 6);
    const receiptDPKFromDriverComplete = await this.getDataDashboard(server, 7);

    const handoverDPKToDeliveryComplete = await this.getDataDashboard(
      server,
      8,
    );
    const receiptDeliveryFromDPKComplete = await this.getDataDashboard(
      server,
      9,
    );

    const handoverDeliveryToMktComplete = await this.getDataDashboard(
      server,
      10,
    );
    const receiptMktFromDeliveryComplete = await this.getDataDashboard(
      server,
      11,
    );

    return {
      handoverDeliveryToDPKPrepare,
      handoverDeliveryToDPKComplete,
      receiptDPKFromDeliveryComplete,
      handoverDPKToDriverComplete,
      receiptDriverFromDPKComplete,
      handoverDriverToDPKComplete,
      receiptDPKFromDriverComplete,
      handoverDPKToDeliveryComplete,
      receiptDeliveryFromDPKComplete,
      handoverDeliveryToMktComplete,
      receiptMktFromDeliveryComplete,
    };
  }

  async getDataDashboardMonth(server, month) {
    let dbClient;
    try {
      dbClient = await server.pg.connect();
      const trackingEventQuery = `
            SELECT t.m_inout_id, COUNT(te.*)
                FROM adw_trackingsj_events te
                JOIN adw_trackingsj t ON te.adw_trackingsj_id = t.adw_trackingsj_id
                WHERE
                    te.adw_event_type = 'HANDOVER' AND te.adw_from_actor = 'Delivery' AND te.adw_to_actor = 'DPK'
                    AND TO_CHAR(te.created, 'YYYYMM') = $1
                GROUP BY t.m_inout_id
            `;

      const resultTrackingEvent = await dbClient.query(trackingEventQuery, [
        month,
      ]);

      return resultTrackingEvent.rows;
    } catch (error) {
      console.log("Error getDataDashboardMonth:", error);
      return error.message;
    } finally {
      if (dbClient) dbClient.release();
    }
  }

  async summaryMonth(server, month) {
    // const handoverDeliveryToDPKPrepare = await this.getDataDashboard(server, 1, month);

    // const handoverDeliveryToDPKComplete = await this.getDataDashboard(server, 2, month);
    // const receiptDPKFromDeliveryComplete = await this.getDataDashboard(server, 3, month);

    // const handoverDPKToDriverComplete = await this.getDataDashboard(server, 4, month);
    // const receiptDriverFromDPKComplete = await this.getDataDashboard(server, 5, month);

    // const handoverDriverToDPKComplete = await this.getDataDashboard(server, 6, month);
    // const receiptDPKFromDriverComplete = await this.getDataDashboard(server, 7, month);

    // const handoverDPKToDeliveryComplete = await this.getDataDashboard(server, 8, month);
    // const receiptDeliveryFromDPKComplete = await this.getDataDashboard(server, 9, month);

    // const handoverDeliveryToMktComplete = await this.getDataDashboard(server, 10, month);
    // const receiptMktFromDeliveryComplete = await this.getDataDashboard(server, 11, month);

    //menghasilkan array of objects
    const resultDataMonth = await this.getDataDashboardMonth(server, month);

    const combined = {};
    const fields = Object.keys(resultDataMonth[0] || {}).filter(
      (key) => key !== "m_inout_id",
    );

    for (const field of fields) {
      const validValues = resultDataMonth
        .map((row) => row[field])
        .filter((value) => value !== null && value !== undefined);

      combined[field] =
        validValues.length > 0
          ? validValues.reduce((sum, val) => sum + Number(val), 0)
          : null;
    }

    return {
      delivery: combined,
      // handoverDeliveryToDPKPrepare,
      // handoverDeliveryToDPKComplete,
      // receiptDPKFromDeliveryComplete,
      // handoverDPKToDriverComplete,
      // receiptDriverFromDPKComplete,
      // handoverDriverToDPKComplete,
      // receiptDPKFromDriverComplete,
      // handoverDPKToDeliveryComplete,
      // receiptDeliveryFromDPKComplete,
      // handoverDeliveryToMktComplete,
      // receiptMktFromDeliveryComplete
    };
  }

  // async dataDashboard(server) {
  //     let dbClient;
  //     let oracleConnection;
  //     try {
  //         const [dbClient, oracleConnection] = await Promise.all([
  //             server.pg.connect(),
  //             oracleDB.openConnection()
  //         ]);

  //         const queryTrackingSjEvents = `
  //         SELECT
  //         t.m_inout_id,
  //         CASE
  //             WHEN te.adw_event_type = 'HANDOVER' AND te.adw_from_actor = 'Delivery' AND te.adw_to_actor = 'DPK' THEN 'handover_delivery_to_dpk'
  //             WHEN te.adw_event_type = 'ACCEPTANCE' AND te.adw_from_actor = 'Delivery' AND te.adw_to_actor = 'DPK' THEN 'acceptance_dpk_from_delivery'
  //             WHEN te.adw_event_type = 'HANDOVER' AND te.adw_from_actor = 'DPK' AND te.adw_to_actor = 'Driver' THEN 'handover_dpk_to_driver'
  //             WHEN te.adw_event_type = 'ACCEPTANCE' AND te.adw_from_actor = 'DPK' AND te.adw_to_actor = 'Driver' THEN 'acceptance_driver_from_dpk'
  //             WHEN te.adw_event_type = 'HANDOVER' AND te.adw_from_actor = 'Driver' AND te.adw_to_actor = 'DPK' THEN 'handover_driver_to_dpk'
  //             WHEN te.adw_event_type = 'ACCEPTANCE' AND te.adw_from_actor = 'Driver' AND te.adw_to_actor = 'DPK' THEN 'acceptance_dpk_from_driver'
  //             WHEN te.adw_event_type = 'HANDOVER' AND te.adw_from_actor = 'DPK' AND te.adw_to_actor = 'Delivery' THEN 'handover_dpk_to_delivery'
  //             WHEN te.adw_event_type = 'ACCEPTANCE' AND te.adw_from_actor = 'DPK' AND te.adw_to_actor = 'Delivery' THEN 'acceptance_delivery_from_dpk'
  //             WHEN te.adw_event_type = 'HANDOVER' AND te.adw_from_actor = 'Delivery' AND te.adw_to_actor = 'Marketing' THEN 'handover_delivery_to_mkt'
  //             WHEN te.adw_event_type = 'ACCEPTANCE' AND te.adw_from_actor = 'Delivery' AND te.adw_to_actor = 'Marketing' THEN 'acceptance_mkt_from_delivery'
  //             WHEN te.adw_event_type = 'HANDOVER' AND te.adw_from_actor = 'Marketing' AND te.adw_to_actor = 'FAT' THEN 'handover_mkt_to_fat'
  //             WHEN te.adw_event_type = 'ACCEPTANCE' AND te.adw_from_actor = 'Marketing' AND te.adw_to_actor = 'FAT' THEN 'acceptance_fat_from_mkt'
  //         END AS type
  //         FROM
  //             adw_trackingsj_events te
  //         JOIN
  //             adw_trackingsj t
  //             ON te.adw_trackingsj_id = t.adw_trackingsj_id
  //         WHERE
  //             TO_CHAR(te.created, 'YYYYMM') = '202510'
  //         `;

  //         const resultTrackingEvent = await dbClient.query(queryTrackingSjEvents);

  //         const groupedIds = resultTrackingEvent.rows.reduce((acc, row) => {
  //             if (!row.type) return acc;
  //             if (!acc[row.type]) acc[row.type] = [];
  //             acc[row.type].push(Number(row.m_inout_id));
  //             return acc;
  //         }, {});

  //         const allResult = [];
  //         const allUsedIds = new Set();

  //         for (const [type, ids] of Object.entries(groupedIds)) {
  //             if (ids.length === 0) continue;

  //             ids.forEach(id => allUsedIds.add(id));

  //             const placeholders = ids.map((_, i) => `:${i + 1}`).join(',');

  //             const queryOracleShipment = `
  //             SELECT
  //                 mi.DOCUMENTNO,
  //                 mil.MOVEMENTQTY,
  //                 col.PRICEACTUAL,
  //                 '${type}' AS TYPE
  //             FROM
  //                 M_INOUT mi
  //             JOIN M_INOUTLINE mil ON mi.M_INOUT_ID = mil.M_INOUT_ID
  //             JOIN C_ORDERLINE col ON mil.C_ORDERLINE_ID = col.C_ORDERLINE_ID
  //             WHERE
  //                 mi.MOVEMENTDATE >= TO_DATE('202510', 'YYYYMM')
  //                 AND mi.MOVEMENTDATE <= LAST_DAY(TO_DATE('202510', 'YYYYMM'))
  //                 AND mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
  //                 AND mi.ISSOTRX = 'Y'
  //                 AND mi.M_INOUT_ID IN (${placeholders})
  //             `;

  //             const result = await oracleConnection.execute(queryOracleShipment, ids, {
  //                 outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
  //             });

  //             allResult.push(result.rows);
  //         }

  //         if (allUsedIds.size > 0) {
  //             const placeholders = Array.from(allUsedIds).map((_, i) => `:${i + 1}`).join(',');
  //             const queryPending = `
  //             SELECT
  //                 mi.DOCUMENTNO,
  //                 mil.MOVEMENTQTY,
  //                 col.PRICEACTUAL,
  //                 'pending' AS TYPE
  //             FROM
  //                 M_INOUT mi
  //             JOIN M_INOUTLINE mil ON mi.M_INOUT_ID = mil.M_INOUT_ID
  //             JOIN C_ORDERLINE col ON mil.C_ORDERLINE_ID = col.C_ORDERLINE_ID
  //             WHERE
  //                 mi.MOVEMENTDATE >= TO_DATE('202510', 'YYYYMM')
  //                 AND mi.MOVEMENTDATE <= LAST_DAY(TO_DATE('202510', 'YYYYMM'))
  //                 AND mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
  //                 AND mi.ISSOTRX = 'Y'
  //                 AND mi.M_INOUT_ID NOT IN (${placeholders})
  //         `;

  //             const resultPending = await oracleConnection.execute(queryPending, Array.from(allUsedIds), {
  //                 outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT
  //             });

  //             allResult.push(resultPending.rows);
  //         }

  //         const groupedResult = allResult.flat().reduce((acc, row) => {
  //             const { TYPE, MOVEMENTQTY, PRICEACTUAL } = row;
  //             if (!acc[TYPE]) {
  //                 acc[TYPE] = { totalDoc: 0, totalAmount: 0 };
  //             }

  //             acc[TYPE].totalDoc += 1;
  //             acc[TYPE].totalAmount += (MOVEMENTQTY * PRICEACTUAL);

  //             return acc;
  //         }, {})

  //         console.log('groupedResult:', groupedResult);

  //         const dataDashboard = {
  //             delivery: {
  //                 handoverToDPK: groupedResult['handover_delivery_to_dpk'] || { totalDoc: 0, totalAmount: 0 },
  //                 handoverToMkt: groupedResult['handover_delivery_to_mkt'] || { totalDoc: 0, totalAmount: 0 },
  //             }
  //         }

  //         return dataDashboard;

  //     } catch (error) {
  //         console.log('Error outStanding:', error);
  //         return error.message
  //     } finally {
  //         if (dbClient) dbClient.release();
  //         if (oracleConnection) await oracleConnection.close();
  //     }
  // }

  async dataDashboard(server) {
    let pgClient;
    let oracleConn;
    try {
      // 1️⃣ Buka koneksi paralel
      [pgClient, oracleConn] = await Promise.all([
        server.pg.connect(),
        oracleDB.openConnection(),
      ]);

      // 2️⃣ Ambil data mapping event dari PostgreSQL
      const queryTrackingSjEvents = `
            SELECT
                t.m_inout_id,
                CASE
                    WHEN CAST(t.checkpoin_id AS INTEGER) >= 2 AND CAST(t.checkpoin_id AS INTEGER) < 10  THEN 'handover_delivery_to_dpk'
                    WHEN CAST(t.checkpoin_id AS INTEGER) = 3  THEN 'acceptance_dpk_from_delivery'
                    WHEN CAST(t.checkpoin_id AS INTEGER) >= 4 AND CAST(t.checkpoin_id AS INTEGER) < 8 THEN 'handover_dpk_to_driver'
                    WHEN CAST(t.checkpoin_id AS INTEGER) = 5  THEN 'acceptance_driver_from_dpk'
                    WHEN CAST(t.checkpoin_id AS INTEGER) = 6  THEN 'handover_driver_to_dpk'
                    WHEN CAST(t.checkpoin_id AS INTEGER) = 7  THEN 'acceptance_dpk_from_driver'
                    WHEN CAST(t.checkpoin_id AS INTEGER) >= 8 AND CAST(t.checkpoin_id AS INTEGER) < 9  THEN 'handover_dpk_to_delivery'
                    WHEN CAST(t.checkpoin_id AS INTEGER) = 9  THEN 'acceptance_delivery_from_dpk'
                    WHEN CAST(t.checkpoin_id AS INTEGER) >= 10 AND CAST(t.checkpoin_id AS INTEGER) < 11 THEN 'handover_delivery_to_mkt'
                    WHEN CAST(t.checkpoin_id AS INTEGER) >= 11 AND CAST(t.checkpoin_id AS INTEGER) < 12 THEN 'acceptance_mkt_from_delivery'
                    WHEN CAST(t.checkpoin_id AS INTEGER) >= 12 THEN 'handover_mkt_to_fat'
                    WHEN CAST(t.checkpoin_id AS INTEGER) = 13 THEN 'acceptance_fat_from_mkt'
                END AS type
            FROM
                adw_trackingsj t
            WHERE
                TO_CHAR(t.created, 'YYYYMM') = '202510';
        `;

      const resultTrackingEvent = await pgClient.query(queryTrackingSjEvents);

      const initialGroupedIds = {
        handover_delivery_to_dpk: [],
        acceptance_dpk_from_delivery: [],
        handover_dpk_to_driver: [],
        acceptance_driver_from_dpk: [],
        handover_driver_to_dpk: [],
        acceptance_dpk_from_driver: [],
        handover_dpk_to_delivery: [],
        acceptance_delivery_from_dpk: [],
        handover_delivery_to_mkt: [],
        acceptance_mkt_from_delivery: [],
        handover_mkt_to_fat: [],
        acceptance_fat_from_mkt: [],
      };

      // 3️⃣ Groupkan ID per type
      const groupedIds = resultTrackingEvent.rows.reduce((acc, row) => {
        if (!row.type) return acc;
        if (!acc[row.type]) acc[row.type] = [];
        acc[row.type].push(Number(row.m_inout_id));
        return acc;
      }, structuredClone(initialGroupedIds));

      // 4️⃣ Bangun query Oracle dengan UNION ALL
      const subQueries = Object.entries(groupedIds)
        .filter(([_, ids]) => ids.length > 0)
        .map(
          ([type, ids]) => `
                SELECT
                    '${type}' AS TYPE,
                    COUNT(DISTINCT mi.M_INOUT_ID) AS totalDoc,
                    NVL(SUM(mil.MOVEMENTQTY * col.PRICEACTUAL), 0) AS totalAmount
                FROM M_INOUT mi
                JOIN M_INOUTLINE mil ON mi.M_INOUT_ID = mil.M_INOUT_ID
                JOIN C_ORDERLINE col ON mil.C_ORDERLINE_ID = col.C_ORDERLINE_ID
                WHERE
                    mi.M_INOUT_ID IN (${ids.join(",")})
                    AND mi.MOVEMENTDATE BETWEEN TO_DATE('202510', 'YYYYMM') AND LAST_DAY(TO_DATE('202510', 'YYYYMM'))
                    AND mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                    AND mi.ISSOTRX = 'Y'
            `,
        );

      // Gabungkan jadi 1 query besar
      const allIds = Object.values(groupedIds).flat();
      const queryPending = `
            SELECT
                'pending' AS TYPE,
                COUNT(DISTINCT mi.M_INOUT_ID) AS totalDoc,
                NVL(SUM(mil.MOVEMENTQTY * col.PRICEACTUAL), 0) AS totalAmount
            FROM M_INOUT mi
            JOIN M_INOUTLINE mil ON mi.M_INOUT_ID = mil.M_INOUT_ID
            JOIN C_ORDERLINE col ON mil.C_ORDERLINE_ID = col.C_ORDERLINE_ID
            JOIN C_ORDER co ON col.C_ORDER_ID = co.C_ORDER_ID
            JOIN C_BPARTNER cb ON co.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE
                mi.M_INOUT_ID NOT IN (${allIds.length ? allIds.join(",") : "0"})
                AND mi.MOVEMENTDATE BETWEEN TO_DATE('202510', 'YYYYMM') AND LAST_DAY(TO_DATE('202510', 'YYYYMM'))
                AND mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                AND mi.ISSOTRX = 'Y'
                AND co.ISMILKRUN = 'N'
                AND cb.ISSUBCONTRACT = 'N'
                AND ROWNUM <= 20
        `;

      const queryMilkRunSubCont = `
            SELECT
                'milkrunandsc' AS TYPE,
                COUNT(DISTINCT mi.M_INOUT_ID) AS totalDoc,
                NVL(SUM(mil.MOVEMENTQTY * col.PRICEACTUAL), 0) AS totalAmount
            FROM M_INOUT mi
            JOIN M_INOUTLINE mil ON mi.M_INOUT_ID = mil.M_INOUT_ID
            JOIN C_ORDERLINE col ON mil.C_ORDERLINE_ID = col.C_ORDERLINE_ID
            JOIN C_ORDER co ON col.C_ORDER_ID = co.C_ORDER_ID
            JOIN C_BPARTNER cb ON co.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE
                mi.M_INOUT_ID NOT IN (${allIds.length ? allIds.join(",") : "0"})
                AND mi.MOVEMENTDATE BETWEEN TO_DATE('202510', 'YYYYMM') AND LAST_DAY(TO_DATE('202510', 'YYYYMM'))
                AND mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                AND mi.ISSOTRX = 'Y'
                AND co.ISMILKRUN = 'Y'
                AND cb.ISSUBCONTRACT = 'Y'
                AND ROWNUM <= 20
        `;

      const queryOracleShipment = `
            ${subQueries.join("\nUNION ALL\n")}
            UNION ALL
            ${queryPending}
            UNION ALL
            ${queryMilkRunSubCont}
        `;

      // 5️⃣ Jalankan query Oracle
      const resultOracle = await oracleConn.execute(queryOracleShipment, [], {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });

      // 6️⃣ Mapping hasil akhir
      const groupedResult = resultOracle.rows.reduce((acc, row) => {
        acc[row.TYPE] = {
          totalDoc: row.TOTALDOC || 0,
          totalAmount: row.TOTALAMOUNT || 0,
        };
        return acc;
      }, {});

      // 7️⃣ Kembalikan hasil final
      return {
        delivery: {
          handoverToDPK: groupedResult["handover_delivery_to_dpk"] || {
            totalDoc: 0,
            totalAmount: 0,
          },
          handoverToMkt: groupedResult["handover_delivery_to_mkt"] || {
            totalDoc: 0,
            totalAmount: 0,
          },
          pending: groupedResult["pending"] || { totalDoc: 0, totalAmount: 0 },
          milkRunAndSC: groupedResult["milkrunandsc"] || {
            totalDoc: 0,
            totalAmount: 0,
          },
        },
        thirdParty: {
          handoverToDriver: groupedResult["handover_dpk_to_driver"] || {
            totalDoc: 0,
            totalAmount: 0,
          },
          handoverToDelivery: groupedResult["handover_dpk_to_delivery"] || {
            totalDoc: 0,
            totalAmount: 0,
          },
          pending: groupedResult["acceptance_dpk_from_delivery"] || {
            totalDoc: 0,
            totalAmount: 0,
          },
        },
        marketing: {
          handoverToFAT: groupedResult["handover_mkt_to_fat"] || {
            totalDoc: 0,
            totalAmount: 0,
          },
          pending: groupedResult["acceptance_mkt_from_delivery"] || {
            totalDoc: 0,
            totalAmount: 0,
          },
        },
      };
    } catch (error) {
      console.log("Error dataDashboard:", error);
      return { error: error.message };
    } finally {
      if (pgClient) pgClient.release();
      if (oracleConn) await oracleConn.close();
    }
  }

  async listSJByDriver(server, driver_id) {
    let connection;
    let dbClient;

    try {
      connection = await oracleDB.openConnection();
      dbClient = await server.pg.connect();

      const driverName = `
                SELECT NAME FROM AD_USER 
                    	WHERE AD_USER_ID = :driver_id AND TITLE = 'driver'
            `;

      const driverRow = await connection.execute(
        driverName,
        { driver_id: driver_id },
        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT },
      );

      // ---------------------------------------------------------
      // 1️⃣   Ambil data postage yg sedang ada di checkpoint tertentu
      //      Tapi JOIN pivot agar dapat group ID
      // ---------------------------------------------------------
      const queryPostgres = `
                SELECT
                    t.m_inout_id,
                    t.tnkb_id
                FROM adw_trackingsj t
                WHERE UPPER(TRIM(t.drivername)) = UPPER(TRIM($1))
                AND t.checkpoin_id = '5'
                AND t.trip_mode IS NULL
                AND arrivedat_customer = 'N'
                ORDER BY created ASC
                `;

      const resultPg = await dbClient.query(queryPostgres, [driverRow.rows[0].NAME]);

      const postgresRows = resultPg.rows || [];

      if (postgresRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      // ---------------------------------------------------------
      // 2️⃣ Ambil detail SJ dari Oracle berdasarkan m_inout_id
      // ---------------------------------------------------------
      const inoutIds = postgresRows.map((r) => r.m_inout_id);

      const tnkbId = postgresRows[0].tnkb_id;

      const oracleQuery = `
                SELECT
                    mi.M_INOUT_ID,
                    COALESCE (mi.MovementDateRev, mi.MovementDate) || ' / ' || mi.DOCUMENTNO || ' / ' || bp.NAME AS SURATJALAN
                FROM M_INOUT mi
                INNER JOIN C_BPARTNER bp ON mi.C_BPARTNER_ID = bp.C_BPARTNER_ID
                WHERE
                    mi.M_INOUT_ID IN (${inoutIds.map((_, i) => `:${i + 1}`).join(",")})
                    AND mi.ADW_TMS_ID IS NULL
                `;

      const oracleRows = await connection.execute(oracleQuery, inoutIds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });

      let tnkbNo = null;

      if (tnkbId) {
        const tnkbQuery = `
                SELECT NAME
                FROM ADW_TMS_TNKB
                WHERE ADW_TMS_TNKB_ID = :tnkb_id
            `;

        const tnkbRow = await connection.execute(
          tnkbQuery,
          { tnkb_id: tnkbId },
          { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT },
        );

        if (tnkbRow.rows.length > 0) {
          tnkbNo = tnkbRow.rows[0].NAME;
        }
      }

      return {
        success: true,
        tnkb_no: tnkbNo,
        data: oracleRows.rows,
      };
    } catch (err) {
      console.error(err);
      return { success: false, message: "Server error" };
    } finally {
      if (connection) await connection.close();
      if (dbClient) await dbClient.release();
    }
  }

  async listBundle(server, checkpoint, checkpoint_second = 99, bundle_no = "", sj_no = "", driver = "", start_date = "", end_date = "") {
    let dbClient;

    try {
      dbClient = await server.pg.connect();

      // Menggunakan CTE (Common Table Expression) agar logic filter SJ tidak mengganggu perhitungan total count
      let queryBundle = `
            SELECT
                hg.*,
                (SELECT COUNT(*) FROM adw_group_sj gs_count WHERE gs_count.adw_handover_group_id = hg.adw_handover_group_id) AS total_shipments
            FROM
                adw_handover_group hg
            WHERE hg.checkpoint IN ($1, $2)
        `;

      const params = [checkpoint, checkpoint_second];
      let paramIndex = 3;

      // 1. Filter Bundle No
      if (bundle_no && bundle_no.trim() !== "") {
        queryBundle += ` AND hg.documentno ILIKE $${paramIndex}`;
        params.push(`%${bundle_no}%`);
        paramIndex++;
      }

      // 2. Filter SJ No (Mencari Bundle yang berisi SJ tersebut)
      if (sj_no && sj_no.trim() !== "") {
        queryBundle += ` AND EXISTS (
                SELECT 1 FROM adw_group_sj gs 
                JOIN adw_trackingsj tsj ON tsj.adw_trackingsj_id = gs.adw_trackingsj_id
                WHERE gs.adw_handover_group_id = hg.adw_handover_group_id 
                AND tsj.documentno ILIKE $${paramIndex}
            )`;
        params.push(`%${sj_no}%`);
        paramIndex++;
      }

      // 3. Filter Driver (Mencari Bundle yang dibawa Driver tersebut)
      if (driver && driver.trim() !== "") {
        queryBundle += ` AND EXISTS (
                SELECT 1 FROM adw_group_sj gs 
                JOIN adw_trackingsj tsj ON tsj.adw_trackingsj_id = gs.adw_trackingsj_id
                WHERE gs.adw_handover_group_id = hg.adw_handover_group_id 
                AND tsj.drivername ILIKE $${paramIndex}
            )`;
        params.push(`%${driver}%`);
        paramIndex++;
      }

      // 4. Filter Tanggal (Date Range)
      if (start_date && start_date !== "") {
        queryBundle += ` AND hg.created::date >= $${paramIndex}`;
        params.push(start_date);
        paramIndex++;
      }
      if (end_date && end_date !== "") {
        queryBundle += ` AND hg.created::date <= $${paramIndex}`;
        params.push(end_date);
        paramIndex++;
      }

      // Final sorting
      queryBundle += ` ORDER BY hg.created DESC`;

      const resBundleRows = await dbClient.query(queryBundle, params);
      return resBundleRows.rows;

    } catch (error) {
      console.error("Error querying list bundle:", error);
      throw error;
    } finally {
      if (dbClient) await dbClient.release();
    }
  }

  async listBundleSJ(server, bundleId) {
    let dbClient;
    let oracleConnection;

    try {
      // 1. Ambil data dari PostgreSQL
      dbClient = await server.pg.connect();

      const query = `
            SELECT
                tsj.adw_trackingsj_id,
                tsj.documentno,
                tsj.drivername,
                tsj.tnkb,
                tsj.m_inout_id  -- Kita butuh ID ini untuk join ke Oracle
            FROM adw_group_sj gs
            LEFT JOIN adw_trackingsj tsj
                ON tsj.adw_trackingsj_id = gs.adw_trackingsj_id
            WHERE gs.adw_handover_group_id = $1
            ORDER BY tsj.created DESC
        `;

      const result = await dbClient.query(query, [bundleId]);
      const pgRows = result.rows;

      // Jika tidak ada data di PG, langsung return
      if (pgRows.length === 0) return [];

      // 2. Kumpulkan m_inout_id untuk query ke Oracle
      const inoutIds = pgRows
        .map((row) => row.m_inout_id)
        .filter((id) => id !== null)
        .map((id) => Number(id)); // Konversi paksa ke Number

      if (inoutIds.length === 0) {
        // Jika ada baris tapi m_inout_id semua null
        return pgRows.map(row => ({ ...row, customer: "No Customer" }));
      }

      // 3. Ambil data Customer dari Oracle
      oracleConnection = await oracleDB.openConnection();

      // Build placeholders (:id1, :id2, ...)
      const placeholders = inoutIds.map((_, i) => `:id${i + 1}`).join(",");
      const bindParams = {};
      inoutIds.forEach((val, index) => {
        bindParams[`id${index + 1}`] = val;
      });

      const queryOracle = `
            SELECT
                mi.M_INOUT_ID,
                cb.VALUE AS CUSTOMER
            FROM M_INOUT mi
            JOIN C_BPARTNER cb ON cb.C_BPARTNER_ID = mi.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${placeholders})
        `;

      const resultOracle = await oracleConnection.execute(
        queryOracle,
        bindParams,
        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
      );

      // 4. Mapping hasil Oracle ke dalam Map agar mudah di-lookup
      // resultOracle.rows biasanya array of objects jika menggunakan OUT_FORMAT_OBJECT
      const customerMap = {};
      resultOracle.rows.forEach((oraRow) => {
        // Oracle mengembalikan key uppercase secara default (M_INOUT_ID, CUSTOMER)
        customerMap[oraRow.M_INOUT_ID] = oraRow.CUSTOMER;
      });

      // 5. Gabungkan data PG dengan Nama Customer dari Oracle
      const finalResult = pgRows.map((row) => ({
        adw_trackingsj_id: row.adw_trackingsj_id,
        documentno: row.documentno,
        drivername: row.drivername,
        m_inout_id: row.m_inout_id,
        tnkb: row.tnkb,
        customer: customerMap[row.m_inout_id] || "Customer Tidak Ditemukan"
      }));

      return finalResult;

    } catch (err) {
      console.error("Error list bundle SJ:", err);
      return [];
    } finally {
      if (dbClient) await dbClient.release();
      if (oracleConnection) await oracleConnection.close();
    }
  }

  async listBundleDetail(server, docNo) {
    let dbClient;
    let oracleConnection;

    try {
      // Ambil data dari PostgreSQL
      dbClient = await server.pg.connect();

      const queryBundleDetail = `
            SELECT
                hg.attachment,
                hg.created,
                hg.received,
                hg.createdby,
                hg.receivedby,
                hg.checkpoint,
                u1.name AS createdby_name,
                u2.name AS receivedby_name,
                ARRAY_AGG(t.m_inout_id) AS inout_ids
            FROM adw_handover_group hg
            LEFT JOIN ad_user u1 ON u1.ad_user_id = hg.createdby
            LEFT JOIN ad_user u2 ON u2.ad_user_id = hg.receivedby
            JOIN adw_group_sj gs ON gs.adw_handover_group_id = hg.adw_handover_group_id
            JOIN adw_trackingsj t ON t.adw_trackingsj_id = gs.adw_trackingsj_id
            WHERE hg.documentno = $1
            GROUP BY
                hg.attachment,
                hg.created,
                hg.received,
                hg.createdby,
                hg.receivedby,
                hg.checkpoint,
                u1.name,
                u2.name
        `;

      const resBundleDetailRows = await dbClient.query(queryBundleDetail, [
        docNo,
      ]);

      const pgRow = resBundleDetailRows.rows[0];
      if (!pgRow) return [];

      const attachmentBundle = resBundleDetailRows.rows[0]?.attachment || null;
      const createdBundle = pgRow.created;
      const receivedBundle = pgRow.received;
      const createdbyName = pgRow.createdby_name;
      const receivedbyName = pgRow.receivedby_name;
      const bundleCheckpoint = pgRow.checkpoint;

      // Ambil array m_inout_id
      const inoutIds =
        resBundleDetailRows.rows[0]?.inout_ids?.filter((id) => id !== null) ||
        [];

      if (inoutIds.length === 0) {
        return []; // tidak ada data
      }

      // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
      // 1️⃣ Generate Signature (hash)
      // format: MD5(documentno|createdby|receivedby|created_at)
      const rawString = `${pgRow.documentno}|${pgRow.createdby}|${pgRow.receivedby}|${pgRow.created_at}`;

      const signatureHash = crypto
        .createHash("md5")
        .update(rawString)
        .digest("hex");
      // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

      // Open Oracle connection
      oracleConnection = await oracleDB.openConnection();

      // Build placeholder :id1, :id2, ...
      const placeholders = inoutIds.map((_, i) => `:id${i + 1}`).join(",");

      // Bind value per placeholder
      const bindParams = {};
      inoutIds.forEach((val, index) => {
        bindParams[`id${index + 1}`] = val;
      });

      const queryGetShipment = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                mi.MOVEMENTDATE,
                mi.C_BPARTNER_ID,
                mi.DESCRIPTION,
                cb.VALUE AS CUSTOMER
            FROM M_INOUT mi
            JOIN C_BPARTNER cb ON cb.C_BPARTNER_ID = mi.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${placeholders})
            ORDER BY mi.M_INOUT_ID DESC
        `;

      const resultShipmentRows = await oracleConnection.execute(
        queryGetShipment,
        bindParams,
        { outFormat: oracleDB.OUT_FORMAT_OBJECT },
      );

      const columns = resultShipmentRows.metaData.map((col) =>
        col.name.toLowerCase(),
      );
      const formattedRows = resultShipmentRows.rows.map((row) => {
        const obj = {};
        row.forEach((val, idx) => {
          obj[columns[idx]] = val;
        });
        return obj;
      });

      const dataAttachment = {
        uid: docNo,
        name: attachmentBundle,
        status: "done",
        url: `${pathUrl}:3200/files/handover/${attachmentBundle}`,
      };

      const dateHandover = {
        createdBundle: createdBundle,
        receivedBundle: receivedBundle,
      };

      const dataUser = {
        createdby_name: createdbyName,
        receivedby_name: receivedbyName,
        signature: signatureHash,
      };

      return {
        bundle: dataAttachment,
        listShipment: formattedRows,
        dataUser,
        bundleNo: docNo,
        bundleCheckpoint: bundleCheckpoint,
        dateHandover: dateHandover,
      };
    } catch (error) {
      console.error("Error querying list bundle detail:", error);
      return [];
    } finally {
      if (dbClient) await dbClient.release();
      if (oracleConnection) await oracleConnection.close();
    }
  }

  async listBundleDetailPDF(dbClient, docNo) {
    let oracleConnection;

    try {
      // Ambil data dari PostgreSQL
      const queryBundleDetail = `
            SELECT
                hg.attachment,
                hg.created,
                hg.received,
                hg.createdby,
                hg.receivedby,
                hg.checkpoint,
                CASE
                    WHEN u1.name IS NULL THEN hg.drivername
                    WHEN u1.name ILIKE '%System%' THEN hg.drivername
                    ELSE u1.name
                END AS createdby_name,
                CASE
                    WHEN u2.name IS NULL THEN hg.receivedbyname
                    WHEN u2.name ILIKE '%System%' THEN hg.receivedbyname
                    ELSE u2.name
                END AS receivedby_name,
                ARRAY_AGG(t.m_inout_id) AS inout_ids
            FROM adw_handover_group hg
            LEFT JOIN ad_user u1 ON u1.ad_user_id = hg.createdby
            LEFT JOIN ad_user u2 ON u2.ad_user_id = hg.receivedby
            JOIN adw_group_sj gs ON gs.adw_handover_group_id = hg.adw_handover_group_id
            JOIN adw_trackingsj t ON t.adw_trackingsj_id = gs.adw_trackingsj_id
            WHERE hg.documentno = $1
            GROUP BY
                hg.attachment,
                hg.created,
                hg.received,
                hg.createdby,
                hg.receivedby,
                hg.drivername,
                hg.receivedbyname,
                hg.checkpoint,
                u1.name,
                u2.name
        `;

      const resBundleDetailRows = await dbClient.query(queryBundleDetail, [
        docNo,
      ]);

      const pgRow = resBundleDetailRows.rows[0];
      if (!pgRow) return [];

      const attachmentBundle = resBundleDetailRows.rows[0]?.attachment || null;
      const createdBundle = pgRow.created;
      const receivedBundle = pgRow.received;
      const createdbyName = pgRow.createdby_name;
      const receivedbyName = pgRow.receivedby_name;
      const bundleCheckpoint = pgRow.checkpoint;

      // Ambil array m_inout_id
      const inoutIds =
        resBundleDetailRows.rows[0]?.inout_ids?.filter((id) => id !== null) ||
        [];

      if (inoutIds.length === 0) {
        return []; // tidak ada data
      }

      // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
      // 1️⃣ Generate Signature (hash)
      // format: MD5(documentno|createdby|receivedby|created_at)
      const rawString = `${pgRow.documentno}|${pgRow.createdby}|${pgRow.receivedby}|${pgRow.created_at}`;

      const signatureHash = crypto
        .createHash("md5")
        .update(rawString)
        .digest("hex");
      // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

      // Open Oracle connection
      oracleConnection = await oracleDB.openConnection();

      // Build placeholder :id1, :id2, ...
      const placeholders = inoutIds.map((_, i) => `:id${i + 1}`).join(",");

      // Bind value per placeholder
      const bindParams = {};
      inoutIds.forEach((val, index) => {
        bindParams[`id${index + 1}`] = val;
      });

      const queryGetShipment = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                mi.MOVEMENTDATE,
                mi.C_BPARTNER_ID,
                mi.DESCRIPTION,
                cb.VALUE AS CUSTOMER
            FROM M_INOUT mi
            JOIN C_BPARTNER cb ON cb.C_BPARTNER_ID = mi.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${placeholders})
            ORDER BY mi.M_INOUT_ID DESC
        `;

      const resultShipmentRows = await oracleConnection.execute(
        queryGetShipment,
        bindParams,
        { outFormat: oracleDB.OUT_FORMAT_OBJECT },
      );

      const queryTrackingSJ = `
                SELECT m_inout_id, canceled
                FROM adw_trackingsj
                WHERE m_inout_id = ANY($1)
            `;

      const resultTrackingSJ = await dbClient.query(queryTrackingSJ, [
        inoutIds,
      ]);
      const pgRows = resultTrackingSJ.rows || [];

      const pgMap = new Map(pgRows.map((row) => [Number(row.m_inout_id), row]));

      const columns = resultShipmentRows.metaData.map((col) =>
        col.name.toLowerCase(),
      );
      const formattedRows = resultShipmentRows.rows.map((row) => {
        const obj = {};
        // mapping Oracle columns → JS object
        row.forEach((val, idx) => {
          obj[columns[idx]] = val;
        });

        // ambil record tracking berdasarkan m_inout_id
        const pgInfo = pgMap.get(Number(obj.m_inout_id));

        // tambahkan cancel status ke object
        obj.canceled = pgInfo?.canceled ?? null;

        return obj;
      });

      const dataAttachment = {
        uid: docNo,
        name: attachmentBundle,
        status: "done",
        url: `${pathUrl}:3200/files/handover/${attachmentBundle}`,
      };

      const dateHandover = {
        createdBundle: createdBundle,
        receivedBundle: receivedBundle,
      };

      const dataUser = {
        createdby_name: createdbyName,
        receivedby_name: receivedbyName,
        signature: signatureHash,
      };

      return {
        bundle: dataAttachment,
        listShipment: formattedRows,
        dataUser,
        bundleNo: docNo,
        bundleCheckpoint: bundleCheckpoint,
        dateHandover: dateHandover,
      };
    } catch (error) {
      console.error("Error querying list bundle detail:", error);
      return [];
    } finally {
      if (oracleConnection) await oracleConnection.close();
    }
  }

  async listBundleDetailPDFMkt(dbClient, docNo) {
    let oracleConnection;

    try {
      // Ambil data dari PostgreSQL
      const queryBundleDetail = `
            SELECT
                hg.attachment,
                hg.created,
                hg.received,
                hg.createdby,
                hg.receivedby,
                hg.checkpoint,
                CASE
                    WHEN u1.name IS NULL THEN hg.drivername
                    WHEN u1.name ILIKE '%System%' THEN hg.drivername
                    ELSE u1.name
                END AS createdby_name,
                CASE
                    WHEN u2.name IS NULL THEN hg.receivedbyname
                    WHEN u2.name ILIKE '%System%' THEN hg.receivedbyname
                    ELSE u2.name
                END AS receivedby_name,
                ARRAY_AGG(t.m_inout_id) AS inout_ids
            FROM adw_handover_group hg
            LEFT JOIN ad_user u1 ON u1.ad_user_id = hg.createdby
            LEFT JOIN ad_user u2 ON u2.ad_user_id = hg.receivedby
            JOIN adw_group_sj gs ON gs.adw_handover_group_id = hg.adw_handover_group_id
            JOIN adw_trackingsj t ON t.adw_trackingsj_id = gs.adw_trackingsj_id
            WHERE hg.documentno = $1
            GROUP BY
                hg.attachment,
                hg.created,
                hg.received,
                hg.createdby,
                hg.receivedby,
                hg.drivername,
                hg.receivedbyname,
                hg.checkpoint,
                u1.name,
                u2.name
        `;

      const resBundleDetailRows = await dbClient.query(queryBundleDetail, [
        docNo,
      ]);

      const pgRow = resBundleDetailRows.rows[0];
      if (!pgRow) return [];

      const attachmentBundle = resBundleDetailRows.rows[0]?.attachment || null;
      const createdBundle = pgRow.created;
      const receivedBundle = pgRow.received;
      const createdbyName = pgRow.createdby_name;
      const receivedbyName = pgRow.receivedby_name;
      const bundleCheckpoint = pgRow.checkpoint;

      // Ambil array m_inout_id
      const inoutIds =
        resBundleDetailRows.rows[0]?.inout_ids?.filter((id) => id !== null) ||
        [];

      if (inoutIds.length === 0) {
        return []; // tidak ada data
      }

      // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
      // 1️⃣ Generate Signature (hash)
      // format: MD5(documentno|createdby|receivedby|created_at)
      const rawString = `${pgRow.documentno}|${pgRow.createdby}|${pgRow.receivedby}|${pgRow.created_at}`;

      const signatureHash = crypto
        .createHash("md5")
        .update(rawString)
        .digest("hex");
      // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

      // Open Oracle connection
      oracleConnection = await oracleDB.openConnection();

      // Build placeholder :id1, :id2, ...
      const placeholders = inoutIds.map((_, i) => `:id${i + 1}`).join(",");

      // Bind value per placeholder
      const bindParams = {};
      inoutIds.forEach((val, index) => {
        bindParams[`id${index + 1}`] = val;
      });

      const queryGetShipment = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                mi.MOVEMENTDATE,
                mi.C_BPARTNER_ID,
                mi.DESCRIPTION,
                cb.VALUE AS CUSTOMER
            FROM M_INOUT mi
            JOIN C_BPARTNER cb ON cb.C_BPARTNER_ID = mi.C_BPARTNER_ID
            WHERE mi.M_INOUT_ID IN (${placeholders})
            ORDER BY mi.M_INOUT_ID DESC
        `;

      const resultShipmentRows = await oracleConnection.execute(
        queryGetShipment,
        bindParams,
        { outFormat: oracleDB.OUT_FORMAT_OBJECT },
      );

      const queryTrackingSJ = `
                SELECT m_inout_id, canceledmkt
                FROM adw_trackingsj
                WHERE m_inout_id = ANY($1)
            `;

      const resultTrackingSJ = await dbClient.query(queryTrackingSJ, [
        inoutIds,
      ]);
      const pgRows = resultTrackingSJ.rows || [];

      const pgMap = new Map(pgRows.map((row) => [Number(row.m_inout_id), row]));

      const columns = resultShipmentRows.metaData.map((col) =>
        col.name.toLowerCase(),
      );
      const formattedRows = resultShipmentRows.rows.map((row) => {
        const obj = {};
        // mapping Oracle columns → JS object
        row.forEach((val, idx) => {
          obj[columns[idx]] = val;
        });

        // ambil record tracking berdasarkan m_inout_id
        const pgInfo = pgMap.get(Number(obj.m_inout_id));

        // tambahkan cancel status ke object
        obj.canceledmkt = pgInfo?.canceledmkt ?? null;

        return obj;
      });

      const dataAttachment = {
        uid: docNo,
        name: attachmentBundle,
        status: "done",
        url: `${pathUrl}:3200/files/handover/${attachmentBundle}`,
      };

      const dateHandover = {
        createdBundle: createdBundle,
        receivedBundle: receivedBundle,
      };

      const dataUser = {
        createdby_name: createdbyName,
        receivedby_name: receivedbyName,
        signature: signatureHash,
      };

      return {
        bundle: dataAttachment,
        listShipment: formattedRows,
        dataUser,
        bundleNo: docNo,
        bundleCheckpoint: bundleCheckpoint,
        dateHandover: dateHandover,
      };
    } catch (error) {
      console.error("Error querying list bundle detail:", error);
      return [];
    } finally {
      if (oracleConnection) await oracleConnection.close();
    }
  }

  async processReject(server, payload, userId) {
    let dbClient;
    let oracleConnection;

    const { adw_trackingsj_id, notes } = payload;

    try {
      dbClient = await server.pg.connect();
      await dbClient.query("BEGIN"); // Start transaction

      const checkQuery = `
            SELECT checkpoin_id
            FROM adw_trackingsj
            WHERE adw_trackingsj_id = $1
        `;
      const checkRes = await dbClient.query(checkQuery, [adw_trackingsj_id]);

      if (checkRes.rowCount === 0) {
        throw new Error("Data tidak ditemukan");
      }

      const currentCheckpoint = Number(checkRes.rows[0].checkpoin_id);

      // ==========================================================
      //  CASE 1: Jika checkpoint = 2 → HAPUS SEMUA DATA TRACKING
      // ==========================================================
      if (currentCheckpoint === 2) {
        // Hapus events
        await dbClient.query(
          `DELETE FROM adw_trackingsj_events WHERE adw_trackingsj_id = $1`,
          [adw_trackingsj_id],
        );

        // Hapus group
        await dbClient.query(
          `DELETE FROM adw_group_sj WHERE adw_trackingsj_id = $1`,
          [adw_trackingsj_id],
        );

        // Hapus data utama
        await dbClient.query(
          `DELETE FROM adw_trackingsj WHERE adw_trackingsj_id = $1`,
          [adw_trackingsj_id],
        );

        await dbClient.query("COMMIT");

        return {
          success: true,
          message: "Checkpoint 2 → Data dihapus seluruhnya",
          data: null,
        };
      }

      // QUERY 1: Delete events HANDOVER where event checkpoint = t.checkpoin_id - 1
      const deleteEventsQuery = `
            DELETE FROM adw_trackingsj_events ate
            USING adw_trackingsj t
            WHERE ate.adw_trackingsj_id = t.adw_trackingsj_id
              AND t.adw_trackingsj_id = $1
              AND ate.adw_event_type = 'HANDOVER'
              AND CAST(ate.checkpoin_id AS INTEGER) = CAST(t.checkpoin_id AS INTEGER);
        `;
      await dbClient.query(deleteEventsQuery, [adw_trackingsj_id]);

      const getGroupIdQuery = `
                SELECT adw_handover_group_id
                FROM adw_group_sj
                WHERE adw_trackingsj_id = $1
                AND CAST(checkpoint AS INTEGER) = (CAST((SELECT checkpoin_id FROM adw_trackingsj WHERE adw_trackingsj_id = $1) AS INTEGER)-1)
            `;
      const groupIdRes = await dbClient.query(getGroupIdQuery, [
        adw_trackingsj_id,
      ]);

      const groupId = groupIdRes.rows[0]?.adw_handover_group_id || null;

      // QUERY 2: Delete group_sj with matching checkpoint
      const deleteGroupQuery = `
            DELETE FROM adw_group_sj ags
            USING adw_trackingsj t
            WHERE ags.adw_trackingsj_id = t.adw_trackingsj_id
              AND ags.adw_trackingsj_id = $1
              AND (
                      -- kondisi normal
                      CAST(ags.checkpoint AS INTEGER) = CAST(t.checkpoin_id AS INTEGER) - 1
                      -- kondisi khusus
                      OR (
                          CAST(t.checkpoin_id AS INTEGER) = 4
                          AND CAST(ags.checkpoint AS INTEGER) = 4
                      )
                    );
        `;
      await dbClient.query(deleteGroupQuery, [adw_trackingsj_id]);

      // DELETE HANDOVER_GROUP hanya jika tidak ada referensi lain
      if (groupId) {
        const checkRelationQuery = `
                    SELECT COUNT(*) AS total
                    FROM adw_group_sj
                    WHERE adw_handover_group_id = $1
                `;
        const checkRel = await dbClient.query(checkRelationQuery, [groupId]);

        if (Number(checkRel.rows[0].total) === 0) {
          await dbClient.query(
            `DELETE FROM adw_handover_group WHERE adw_handover_group_id = $1`,
            [groupId],
          );
        }
      }

      // QUERY 3: Update t.checkpoin_id - 1
      const updateQuery = `
            UPDATE adw_trackingsj
            SET checkpoin_id = (CAST(checkpoin_id AS INTEGER) - 1)::varchar
            WHERE adw_trackingsj_id = $1
            RETURNING *;
        `;
      const updatedRes = await dbClient.query(updateQuery, [adw_trackingsj_id]);
      const updatedData = updatedRes.rows[0];

      if (updatedData) {

        const usernameQuery = `
            SELECT name FROM ad_user WHERE ad_user_id = $1
        `;
        const userRes = await dbClient.query(usernameQuery, [userId]);
        const usernameData = userRes.rows[0]?.name || 'System';


        const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, username,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, createdby, isactive,
                    updated, updatedby, checkpoin_id,
                    notes
                ) VALUES(
                    1000003, 1000003, $1,
                    'REJECT', $2, $3,
                    $4, NOW(), $5, 'Y',
                    NOW(), $5, $6, $7
                );
            `;

        await dbClient.query(insertEventQuery, [
          usernameData,
          "Delivery",
          "MKT",
          updatedData.adw_trackingsj_id,
          userId,
          updatedData.checkpoin_id,
          notes,
        ]);
      }

      await dbClient.query("COMMIT");

      return {
        success: true,
        message: "Data berhasil di-reject",
        data: updatedRes.rows[0],
      };
    } catch (error) {
      if (dbClient) await dbClient.query("ROLLBACK");
      console.error("Error reject:", error);
      throw error;
    } finally {
      if (dbClient) await dbClient.release();
      if (oracleConnection) await oracleConnection.close();
    }
  }

  async processReqCancel(server, payload) {
    let dbClient;
    let oracleConnection;

    const { itemToCancel, noteCancel } = payload;
    const { adw_trackingsj_id } = itemToCancel;

    try {
      dbClient = await server.pg.connect();

      const updateQuery = `
            UPDATE adw_trackingsj
            SET cancelrequest = 'Y', notes = $2
            WHERE adw_trackingsj_id = $1
            RETURNING *;
        `;
      const updated = await dbClient.query(updateQuery, [
        adw_trackingsj_id,
        noteCancel,
      ]);

      return {
        success: true,
        message: "Request cancel berhasil",
        data: updated.rows[0],
      };
    } catch (error) {
      console.error("Error reject:", error);
      return [];
    } finally {
      if (dbClient) await dbClient.release();
      if (oracleConnection) await oracleConnection.close();
    }
  }

  async processReqCancelMkt(server, payload, userId) {
    let dbClient;
    let oracleConnection;

    const { itemToCancel, noteCancel } = payload;
    const { adw_trackingsj_id } = itemToCancel;

    try {
      dbClient = await server.pg.connect();

      const updateQuery = `
            UPDATE adw_trackingsj
            SET cancelrequestmkt = 'Y', notesmkt = $2, updatedby = $3
            WHERE adw_trackingsj_id = $1
            RETURNING *;
        `;
      const updated = await dbClient.query(updateQuery, [
        adw_trackingsj_id,
        noteCancel,
        userId,
      ]);

      return {
        success: true,
        message: "Request cancel berhasil",
        data: updated.rows[0],
      };
    } catch (error) {
      console.error("Error reject:", error);
      return [];
    } finally {
      if (dbClient) await dbClient.release();
      if (oracleConnection) await oracleConnection.close();
    }
  }

  async processRejectReqCancel(server, payload) {
    let dbClient;
    let oracleConnection;

    const { adw_trackingsj_id } = payload;

    console.log("id : ", adw_trackingsj_id);

    try {
      dbClient = await server.pg.connect();

      const updateQuery = `
            UPDATE adw_trackingsj
            SET cancelrequest = 'N'
            WHERE adw_trackingsj_id = $1
            RETURNING *;
        `;
      const updated = await dbClient.query(updateQuery, [adw_trackingsj_id]);

      return {
        success: true,
        message: "Request cancel berhasil",
        data: updated.rows[0],
      };
    } catch (error) {
      console.error("Error reject:", error);
      return [];
    } finally {
      if (dbClient) await dbClient.release();
      if (oracleConnection) await oracleConnection.close();
    }
  }

  async processRejectReqCancelMkt(server, payload) {
    let dbClient;
    let oracleConnection;

    const { adw_trackingsj_id } = payload;

    console.log("id : ", adw_trackingsj_id);

    try {
      dbClient = await server.pg.connect();

      const updateQuery = `
            UPDATE adw_trackingsj
            SET cancelrequestmkt = 'N'
            WHERE adw_trackingsj_id = $1
            RETURNING *;
        `;
      const updated = await dbClient.query(updateQuery, [adw_trackingsj_id]);

      return {
        success: true,
        message: "Request cancel berhasil",
        data: updated.rows[0],
      };
    } catch (error) {
      console.error("Error reject:", error);
      return [];
    } finally {
      if (dbClient) await dbClient.release();
      if (oracleConnection) await oracleConnection.close();
    }
  }

  async processCancel(server, payload) {
    let dbClient;
    const { adw_trackingsj_id } = payload;

    try {
      console.log("tracking id : ", adw_trackingsj_id);

      dbClient = await server.pg.connect();
      await dbClient.query("BEGIN"); // Start transaction

      // 1. Cek Data
      const checkQuery = `SELECT checkpoin_id FROM adw_trackingsj WHERE adw_trackingsj_id = $1`;
      const checkRes = await dbClient.query(checkQuery, [adw_trackingsj_id]);

      if (checkRes.rowCount === 0) {
        throw new Error("Data tidak ditemukan");
      }

      const currentCheckpoint = Number(checkRes.rows[0].checkpoin_id);

      // ==========================================================
      //  CASE 1: HAPUS SEMUA (Checkpoint 2)
      // ==========================================================
      if (currentCheckpoint === 2) {
        await dbClient.query(
          `DELETE FROM adw_trackingsj_events WHERE adw_trackingsj_id = $1`,
          [adw_trackingsj_id],
        );
        await dbClient.query(
          `DELETE FROM adw_group_sj WHERE adw_trackingsj_id = $1`,
          [adw_trackingsj_id],
        );
        await dbClient.query(
          `DELETE FROM adw_trackingsj WHERE adw_trackingsj_id = $1`,
          [adw_trackingsj_id],
        );
        await dbClient.query("COMMIT");

        return {
          success: true,
          message: "Checkpoint 2 → Data dihapus seluruhnya",
          data: null,
        };
      }

      // ==========================================================
      //  CASE 2: REVERT STATUS (Checkpoint Lain)
      // ==========================================================

      // Hapus events
      const deleteAllEvent = `
            DELETE FROM adw_trackingsj_events ate
            USING adw_trackingsj t
            WHERE ate.adw_trackingsj_id = t.adw_trackingsj_id
              AND t.adw_trackingsj_id = $1
        `;
      await dbClient.query(deleteAllEvent, [adw_trackingsj_id]);

      // Update Status Utama
      const updateQuery = `
            UPDATE adw_trackingsj
            SET checkpoin_id = '1', cancelrequest = 'N', canceled = 'Y'
            WHERE adw_trackingsj_id = $1
            RETURNING *;
        `;
      const updatedRes = await dbClient.query(updateQuery, [adw_trackingsj_id]);
      const updatedData = updatedRes.rows[0];

      // ==========================================================
      //  LOGIKA PROSES BUNDLE PDF (Sequential & Reusable)
      // ==========================================================
      if (updatedData) {
        // insert events

        const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, username,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, createdby, isactive,
                    updated, updatedby, checkpoin_id,
                    notes
                ) VALUES(
                    1000003, 1000003, $1,
                    'CANCEL', $2, $3,
                    $4, NOW(), 0, 'Y',
                    NOW(), 0, $5, $6
                );
            `;

        await dbClient.query(insertEventQuery, [
          updatedData.drivername,
          "Driver",
          "Delivery",
          updatedData.adw_trackingsj_id,
          updatedData.checkpoin_id,
          updatedData.notes,
        ]);

        // --- Helper Function Internal (Agar kodingan tidak duplikat) ---
        const processBundleAttachment = async (
          targetId,
          sqlQuerySelector,
          pdfLabel1,
          pdfLabel2,
        ) => {
          // 1. Cari Bundle
          const bundleQuery = `
                    SELECT ahg.documentno bundleno, ahg.attachment
                    FROM adw_handover_group ahg
                    WHERE ahg.adw_handover_group_id = (
                        SELECT ${sqlQuerySelector}(ags.adw_handover_group_id)
                        FROM adw_group_sj ags
                        WHERE ags.adw_trackingsj_id = $1
                    )
                `;
          const bundleRes = await dbClient.query(bundleQuery, [targetId]);

          if (bundleRes.rowCount === 0) return; // Skip jika tidak ada data

          const bundle = bundleRes.rows[0];

          // 2. Generate PDF Baru
          const {
            listShipment,
            dataUser,
            bundleNo,
            bundleCheckpoint,
            dateHandover,
          } = await this.listBundleDetailPDF(dbClient, bundle.bundleno);

          const pdfPayload = {
            listShipment,
            dataUser,
            bundleNo,
            bundleCheckpoint,
            dateHandover,
          };
          const { fileName } = await this.generateHandoverPdf(
            pdfPayload,
            pdfLabel1,
            pdfLabel2,
          );

          if (fileName) {
            // 3. Update Database dengan Filename Baru
            const updateAttachmentQuery = `
                        UPDATE adw_handover_group
                        SET updated = NOW(), attachment = $1
                        WHERE documentno = $2
                    `;
            await dbClient.query(updateAttachmentQuery, [
              fileName,
              bundle.bundleno,
            ]);

            // 4. Hapus File Lama (Cleanup)
            if (bundle.attachment && bundle.attachment !== fileName) {
              const oldFilePath = path.join(
                process.cwd(),
                "uploads",
                "handover",
                bundle.attachment,
              );
              if (fs.existsSync(oldFilePath)) {
                try {
                  fs.unlinkSync(oldFilePath);
                  console.log(`Attachment deleted: ${bundle.attachment}`);
                } catch (err) {
                  console.error("Error deleting attachment:", err);
                }
              }
            }
          }
        };

        // --- EKSEKUSI BERURUTAN (SEQUENTIAL) ---

        // JALANKAN QUERY 1 DULU (MAX)
        // Param: ID, SQL Aggregator, Label1, Label2
        await processBundleAttachment(
          adw_trackingsj_id,
          "MAX",
          "DPK",
          "Driver",
        );

        // SETELAH DI ATAS SELESAI, BARU JALANKAN QUERY 2 (MIN)
        await processBundleAttachment(
          adw_trackingsj_id,
          "MIN",
          "Delivery",
          "DPK",
        );
      }

      await dbClient.query("COMMIT");

      return {
        success: true,
        message: "Data berhasil di-reject",
        data: updatedData,
      };
    } catch (error) {
      // PENTING: Rollback jika ada error agar data tidak corrupt
      if (dbClient) await dbClient.query("ROLLBACK");

      console.error("Error reject:", error);
      throw error; // Atau return sesuai format error handling Anda
    } finally {
      if (dbClient) await dbClient.release();
    }
  }

  async processCancelMkt(server, payload) {
    let dbClient;
    const { adw_trackingsj_id } = payload;

    try {
      console.log("tracking id : ", adw_trackingsj_id);

      dbClient = await server.pg.connect();
      await dbClient.query("BEGIN"); // Start transaction

      // 1. Cek Data
      const checkQuery = `SELECT checkpoin_id FROM adw_trackingsj WHERE adw_trackingsj_id = $1`;
      const checkRes = await dbClient.query(checkQuery, [adw_trackingsj_id]);

      if (checkRes.rowCount === 0) {
        throw new Error("Data tidak ditemukan");
      }

      const currentCheckpoint = Number(checkRes.rows[0].checkpoin_id);

      // ==========================================================
      //  CASE 1: HAPUS SEMUA (Checkpoint 2)
      // ==========================================================
      // ==========================================================
      //  CASE 2: REVERT STATUS (Checkpoint Lain)
      // ==========================================================

      // Hapus events
      const deleteAllEvent = `
            WITH last_events AS (
                SELECT adw_trackingsj_events_id
                FROM (
                    SELECT
                        adw_trackingsj_events_id,
                        adw_event_type,
                        ROW_NUMBER() OVER (
                            PARTITION BY adw_event_type
                            ORDER BY created DESC
                        ) AS rn
                    FROM adw_trackingsj_events
                    WHERE adw_trackingsj_id = $1
                    AND adw_event_type IN ('ACCEPTANCE', 'HANDOVER')
                ) AS sub
                WHERE rn = 1
            )
            DELETE FROM adw_trackingsj_events
            WHERE adw_trackingsj_events_id IN (SELECT adw_trackingsj_events_id FROM last_events)
        `;
      await dbClient.query(deleteAllEvent, [adw_trackingsj_id]);

      // Update Status Utama
      const updateQuery = `
            UPDATE adw_trackingsj
            SET checkpoin_id = ($2::int - 2)::varchar,
            cancelrequestmkt = 'N',
            canceledmkt = 'Y'
            WHERE adw_trackingsj_id = $1
            RETURNING *;
        `;
      const updatedRes = await dbClient.query(updateQuery, [
        adw_trackingsj_id,
        currentCheckpoint,
      ]);
      const updatedData = updatedRes.rows[0];

      // ==========================================================
      //  LOGIKA PROSES BUNDLE PDF (Sequential & Reusable)
      // ==========================================================
      if (updatedData) {
        // Insert Event Cancel
        const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, username,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, createdby, isactive,
                    updated, updatedby, checkpoin_id,
                    notes
                ) VALUES(
                    1000003, 1000003, $1,
                    'CANCEL', $2, $3,
                    $4, NOW(), $7, 'Y',
                    NOW(), 0, $5, $6
                );
            `;

        await dbClient.query(insertEventQuery, [
          updatedData.drivername,
          "Marketing",
          "Delivery",
          updatedData.adw_trackingsj_id,
          updatedData.checkpoin_id,
          updatedData.notesmkt,
          updatedData.updatedby,
        ]);

        // --- Helper Function Internal (Agar kodingan tidak duplikat) ---
        const processBundleAttachment = async (
          targetId,
          sqlQuerySelector,
          pdfLabel1,
          pdfLabel2,
        ) => {
          // 1. Cari Bundle
          const bundleQuery = `
                    SELECT ahg.documentno bundleno, ahg.attachment
                    FROM adw_handover_group ahg
                    WHERE ahg.adw_handover_group_id = (
                        SELECT ${sqlQuerySelector}(ags.adw_handover_group_id)
                        FROM adw_group_sj ags
                        WHERE ags.adw_trackingsj_id = $1
                    )
                `;
          const bundleRes = await dbClient.query(bundleQuery, [targetId]);

          if (bundleRes.rowCount === 0) return; // Skip jika tidak ada data

          const bundle = bundleRes.rows[0];

          // 2. Generate PDF Baru
          const {
            listShipment,
            dataUser,
            bundleNo,
            bundleCheckpoint,
            dateHandover,
          } = await this.listBundleDetailPDFMkt(dbClient, bundle.bundleno);

          const pdfPayload = {
            listShipment,
            dataUser,
            bundleNo,
            bundleCheckpoint,
            dateHandover,
          };
          const { fileName } = await this.generateHandoverPdfMkt(
            pdfPayload,
            pdfLabel1,
            pdfLabel2,
          );

          if (fileName) {
            // 3. Update Database dengan Filename Baru
            const updateAttachmentQuery = `
                        UPDATE adw_handover_group
                        SET updated = NOW(), attachment = $1
                        WHERE documentno = $2
                    `;
            await dbClient.query(updateAttachmentQuery, [
              fileName,
              bundle.bundleno,
            ]);

            // 4. Hapus File Lama (Cleanup)
            if (bundle.attachment && bundle.attachment !== fileName) {
              const oldFilePath = path.join(
                process.cwd(),
                "uploads",
                "handover",
                bundle.attachment,
              );
              if (fs.existsSync(oldFilePath)) {
                try {
                  fs.unlinkSync(oldFilePath);
                  console.log(`Attachment deleted: ${bundle.attachment}`);
                } catch (err) {
                  console.error("Error deleting attachment:", err);
                }
              }
            }
          }
        };

        // --- EKSEKUSI BERURUTAN (SEQUENTIAL) ---

        // JALANKAN QUERY 1 DULU (MAX)
        // Param: ID, SQL Aggregator, Label1, Label2
        await processBundleAttachment(
          adw_trackingsj_id,
          "MAX",
          "Delivery",
          "MKT",
        );

        // SETELAH DI ATAS SELESAI, BARU JALANKAN QUERY 2 (MIN)
        await processBundleAttachment(
          adw_trackingsj_id,
          "MIN",
          "Delivery MKT",
          "DPK",
        );
      }

      await dbClient.query("COMMIT");

      return {
        success: true,
        message: "Data berhasil di-reject",
        data: updatedData,
      };
    } catch (error) {
      // PENTING: Rollback jika ada error agar data tidak corrupt
      if (dbClient) await dbClient.query("ROLLBACK");

      console.error("Error reject:", error);
      throw error; // Atau return sesuai format error handling Anda
    } finally {
      if (dbClient) await dbClient.release();
    }
  }

  async processConfig(server, payload) {
    let dbClient;

    const { startDate, userId } = payload;

    try {
      dbClient = await server.pg.connect();

      const query = `
            INSERT INTO adw_trackingsj_config (
                adw_trackingsj_config_id, start_date, updatedby, updated
            )
            VALUES (
                1, $1, $2, NOW()
            )
            ON CONFLICT (adw_trackingsj_config_id)
            DO UPDATE SET
                start_date = EXCLUDED.start_date,
                updatedby = EXCLUDED.updatedby,
                updated = NOW()
            RETURNING *;
        `;

      const values = [startDate, userId];

      const res = await dbClient.query(query, values);

      return {
        success: true,
        message: "Config updated",
        data: res.rows[0],
      };
    } catch (error) {
      console.error("Error config:", error);
      return {
        success: false,
        message: "Failed to update config",
        data: null,
      };
    } finally {
      if (dbClient) await dbClient.release();
    }
  }

  async getConfig(server) {
    let dbClient;

    try {
      dbClient = await server.pg.connect();

      const query = `
            SELECT
                adw_trackingsj_config_id,
                start_date,
                updatedby,
                updated
            FROM adw_trackingsj_config
            WHERE adw_trackingsj_config_id = 1
            LIMIT 1;
        `;

      const res = await dbClient.query(query);

      return {
        success: true,
        message: "Config loaded",
        data: res.rows.length ? res.rows[0] : null,
      };
    } catch (error) {
      console.error("Error getConfig:", error);

      return {
        success: false,
        message: "Failed to load config",
        data: null,
      };
    } finally {
      if (dbClient) await dbClient.release();
    }
  }

  async getCancelLogs(server, adw_trackingsj_id) {
    let dbClient;

    try {
      dbClient = await server.pg.connect();

      const query = `
        SELECT
       	ate.adw_trackingsj_events_id,
       	ate.adw_event_type action,
       	ate.notes reason,
       	ate.created,
       	CASE
        		WHEN ate.adw_from_actor = 'Marketing' THEN au.name
        		ELSE ate.username
       	END createdby_name
                FROM adw_trackingsj_events ate
                JOIN ad_user au ON ate.createdby = au.ad_user_id
                WHERE ate.adw_trackingsj_id = $1
       	AND ate.adw_event_type = 'CANCEL'
        ORDER BY ate.created DESC
        `;

      const values = [adw_trackingsj_id];

      const res = await dbClient.query(query, values);

      return {
        success: true,
        message: "Cancel log loaded",
        data: res.rows.length ? res.rows : null,
      };
    } catch (error) {
      console.error("Error getCancelLogs:", error);

      return {
        success: false,
        message: "Failed to load cancel log",
        data: null,
      };
    } finally {
      if (dbClient) await dbClient.release();
    }
  }


  async updateSJDPKToDriver(server, bundleId, payload) {
    let client;
    try {
      client = await server.pg.connect();

      // Fungsi pembantu untuk memvalidasi string (tidak null, undefined, atau kosong)
      const isValidString = (val) => val !== null && val !== undefined && val.toString().trim() !== "";

      // 1. Memulai Transaksi
      await client.query('BEGIN');

      console.log('log driver name : ', payload.driver_name);


      // Tentukan apakah Driver dan TNKB layak update berdasarkan ID DAN Nama
      const isDriverValid = payload.driver_id && isValidString(payload.driver_name);
      const isTnkbValid = payload.tnkb_id && isValidString(payload.tnkb_name);

      // ============================================================
      // A. UPDATE DETAIL (Tabel: adw_trackingsj)
      // ============================================================
      const updatesSJ = [];
      const valuesSJ = [];
      let idxSJ = 1;

      if (isDriverValid) {
        updatesSJ.push(`driver_id = $${idxSJ++}`, `drivername = $${idxSJ++}`);
        valuesSJ.push(payload.driver_id, payload.driver_name);
      }

      if (isTnkbValid) {
        updatesSJ.push(`tnkb_id = $${idxSJ++}`, `tnkb = $${idxSJ++}`);
        valuesSJ.push(payload.tnkb_id, payload.tnkb_name);
      }

      if (updatesSJ.length > 0) {
        valuesSJ.push(bundleId);
        const querySJ = `
        UPDATE adw_trackingsj 
        SET 
            ${updatesSJ.join(", ")},
            updated = NOW()
        WHERE adw_trackingsj_id IN (
            SELECT adw_trackingsj_id 
            FROM adw_group_sj 
            WHERE adw_handover_group_id = $${idxSJ}
        );
      `;
        await client.query(querySJ, valuesSJ);
      }

      // ============================================================
      // B. UPDATE HEADER (Tabel: adw_handover_group)
      // ============================================================
      const updatesHG = [];
      const valuesHG = [];
      let idxHG = 1;

      if (isDriverValid) {
        updatesHG.push(`driverby = $${idxHG++}`, `drivername = $${idxHG++}`);
        valuesHG.push(payload.driver_id, payload.driver_name);
      }

      if (isTnkbValid) {
        updatesHG.push(`tnkb_id = $${idxHG++}`);
        valuesHG.push(payload.tnkb_id);
      }

      if (updatesHG.length > 0) {
        valuesHG.push(bundleId);
        const queryHG = `
        UPDATE adw_handover_group 
        SET 
            ${updatesHG.join(", ")},
            updated = NOW()
        WHERE adw_handover_group_id = $${idxHG}
      `;
        await client.query(queryHG, valuesHG);
      }

      // Jika tidak ada satu pun yang valid untuk diupdate
      if (updatesSJ.length === 0 && updatesHG.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          message: "No valid data (Driver Name or TNKB Name) to update"
        };
      }

      // 2. Commit Transaksi jika semua sukses
      await client.query('COMMIT');

      return {
        success: true,
        message: "Header (Bundle) and Detail (SJ) updated successfully",
        bundleId: bundleId
      };

    } catch (error) {
      // 3. Rollback jika terjadi kegagalan
      if (client) await client.query('ROLLBACK');
      console.error("Error pada updateSJDPKToDriver:", error);
      throw error;
    } finally {
      if (client) client.release();
    }
  }
}

async function tms(fastify, opts) {
  fastify.decorate("tms", new TMS());
  fastify.register(autoload, {
    dir: join(import.meta.url, "routes"),
    options: {
      prefix: opts.prefix,
    },
  });
}

export default fp(tms);
