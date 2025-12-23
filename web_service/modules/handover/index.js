import fp from "fastify-plugin";
import autoload from "@fastify/autoload";
import { join } from "desm";
import oracleDB from "../../configs/dbOracle.js";
import dayjs from "dayjs";

class Handover {
  async listDeliveryToDPK(server, startDate, endDate) {
    let connection;
    let dbClient;

    if (!server) {
      // Ini menggantikan blok 'default' pada switch
      return { success: false, message: "Unable connection db" };
    }

    try {
      connection = await oracleDB.openConnection();
      dbClient = await server.pg.connect();

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
                    mi.MOVEMENTDATE >= TO_DATE(:startDate, 'YYYY-MM-DD')
                    AND mi.MOVEMENTDATE < TO_DATE(:endDate, 'YYYY-MM-DD') + 1
                    AND mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP')
                    AND ISSOTRX = 'Y'
                    AND cb.ISSUBCONTRACT = 'N'
                    AND co.ISMILKRUN = 'N'
                    AND (mi.POREFERENCE NOT LIKE '%SAMPLE%' OR mi.POREFERENCE IS NULL)
                    ORDER BY mi.DOCUMENTNO DESC
                `;

      // Eksekusi query tanpa parameter
      const resultOracle = await connection.execute(
        queryOracle,
        { startDate: oracleStartDate, endDate: oracleEndDate },
        {
          outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
        },
      );
      const oracleRows = resultOracle.rows || [];

      if (oracleRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      // 3. Query untuk mengambil SEMUA ID yang sudah pernah tercatat di PostgreSQL
      // Asumsi: jika ID sudah ada, berarti sudah diproses dan tidak perlu ditampilkan lagi.
      const queryPostgres = `SELECT adw_trackingsj_id, m_inout_id, checkpoin_id, cancelrequest FROM adw_trackingsj`;
      const resultPg = await dbClient.query(queryPostgres);

      // 4. Buat Set dari ID yang sudah ada, jangan lupa konversi ke STRING
      // Buat Map berisi: id → { checkpoint, cancelrequest }
      const existingTrackingData = new Map(
        resultPg.rows.map((row) => [
          String(row.m_inout_id),
          {
            checkpoint: row.checkpoin_id,
            cancelrequest: row.cancelrequest,
            adw_trackingsj_id: row.adw_trackingsj_id,
          },
        ]),
      );

      // 5. Filter hasil dari Oracle DENGAN LOGIKA DIBALIK (!)
      // Hanya simpan baris dari Oracle yang ID-nya TIDAK ADA (!) di dalam Set.
      const filteredData = oracleRows.filter((oracleRow) => {
        const oracleId = String(oracleRow.M_INOUT_ID);

        if (existingTrackingData.has(oracleId)) {
          const data = existingTrackingData.get(oracleId);
          const cp = data.checkpoint;
          const cr = data.cancelrequest;

          // checkpoint 1 → tampil
          if (cp == 1) return true;

          // checkpoint 9 → tampil
          if (cp == 9) return true;

          // checkpoint 5 → tampil hanya jika cancelrequest = 'Y'
          if (cp == 5 && cr === "Y") return true;

          // selain itu → jangan tampil
          return false;
        }

        // data baru → tampil
        return true;
      });

      const mappingData = filteredData.map((row) => {
        const oracleId = String(row.M_INOUT_ID);
        const tracking = existingTrackingData.get(oracleId);

        const checkpointId = tracking?.checkpoint ?? 1;
        const cancelReq = tracking?.cancelrequest ?? "N";
        const trackId = tracking?.adw_trackingsj_id ?? null;
        return {
          m_inout_id: row.M_INOUT_ID,
          documentno: row.DOCUMENTNO,
          customer: row.CUSTOMER,
          plantime: row.PLANTIME,
          checkpoin_id: Number(checkpointId),
          cancelrequest: cancelReq,
          adw_trackingsj_id: trackId,
        };
      });

      // 6. Kembalikan data yang sudah difilter
      return {
        success: true,
        count: mappingData.length,
        data: mappingData,
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
                    mi.MOVEMENTDATE >= TO_DATE(:startDate, 'YYYY-MM-DD')
                    AND mi.DOCSTATUS IN ('CO', 'DR', 'IN', 'IP') AND ISSOTRX = 'Y'
                    AND cb.ISSUBCONTRACT = 'N'
                    AND co.ISMILKRUN = 'N'
                    ORDER BY mi.DOCUMENTNO DESC
                `;

      // Eksekusi query tanpa parameter
      const resultOracle = await connection.execute(
        queryOracle,
        { startDate: oracleStartDate },
        {
          outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
        },
      );
      const oracleRows = resultOracle.rows || [];

      if (oracleRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      const queryPostgres = `
                SELECT adw_trackingsj_id, m_inout_id, checkpoin_id, cancelrequest
                FROM adw_trackingsj
                WHERE checkpoin_id = '3' AND cancelrequest = 'N'
            `;

      const resultPg = await dbClient.query(queryPostgres);

      const existingTrackingData = new Map(
        resultPg.rows.map((row) => [
          String(row.m_inout_id),
          {
            checkpoint: row.checkpoin_id,
            cancelrequest: row.cancelrequest,
            adw_trackingsj_id: row.adw_trackingsj_id,
          },
        ]),
      );

      const filteredData = oracleRows.filter((oracleRow) => {
        const data = existingTrackingData.get(String(oracleRow.M_INOUT_ID));
        return data !== undefined;
      });

      const mappingData = filteredData.map((row) => {
        const track = existingTrackingData.get(String(row.M_INOUT_ID));

        return {
          m_inout_id: row.M_INOUT_ID,
          documentno: row.DOCUMENTNO,
          customer: row.CUSTOMER,
          plantime: row.PLANTIME,
          checkpoin_id: track.checkpoint,
          cancelrequest: track.cancelrequest,
          adw_trackingsj_id: track.adw_trackingsj_id,
        };
      });

      return {
        success: true,
        count: mappingData.length,
        data: mappingData,
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

  async processDeliveryToDPK(server, payload, userId) {
    const dbClient = await server.pg.connect();

    try {
      await dbClient.query("BEGIN");
      let result;

      let fromActor;
      let toActor;

      const { data } = payload;
      fromActor = "Delivery";
      toActor = "DPK";

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw { statusCode: 400, message: "Data is required for handover." };
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
      const seqRow = await dbClient.query(
        `SELECT nextval('adw_handover_group_seq') AS seq`,
      );
      const seq = seqRow.rows[0].seq;

      const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
      const documentno = `HOPT${yymm}${String(seq).padStart(4, "0")}`;

      // Insert group
      const insertGroupQuery = `
                        INSERT INTO adw_handover_group (
                            createdby, documentno, checkpoint, notes,
                            fromactor, toactor
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                        RETURNING adw_handover_group_id;
                    `;

      const groupRes = await dbClient.query(insertGroupQuery, [
        userId,
        documentno,
        "2",
        "ho delivery to dpk",
        "Delivery",
        "DPK",
      ]);

      const groupId = groupRes.rows[0].adw_handover_group_id;
      if (!groupId) throw new Error("Failed to insert handover group");

      // ============================================================
      // 2️⃣ Loop setiap SJ → Insert Tracking → Insert pivot adw_group_sj
      // ============================================================

      let insertedCount = 0;

      for (const item of data) {
        let currentTrackingId; // Variabel untuk menyimpan adw_trackingsj_id yang akan digunakan

        const queryCheck = `
              SELECT adw_trackingsj_id
              FROM adw_trackingsj
              WHERE m_inout_id = $1;
          `;

        const checkRes = await dbClient.query(queryCheck, [item.m_inout_id]);

        if (checkRes.rows.length > 0) {
          // Jika m_inout_id sudah ada, gunakan adw_trackingsj_id yang ditemukan
          currentTrackingId = checkRes.rows[0].adw_trackingsj_id;
        } else {
          // Jika m_inout_id belum ada, INSERT TRACKING baru
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

          currentTrackingId = trackingRes.rows[0]?.adw_trackingsj_id; // Gunakan optional chaining
          if (!currentTrackingId)
            throw new Error(
              "Failed to insert new tracking for m_inout_id: " +
              item.m_inout_id,
            );
        }

        // Pastikan currentTrackingId sudah didapatkan, baik baru maupun yang sudah ada
        if (!currentTrackingId) {
          throw new Error(
            "Failed to determine adw_trackingsj_id for m_inout_id: " +
            item.m_inout_id,
          );
        }

        const updateCheckpoint = `
          UPDATE adw_trackingsj SET checkpoin_id = $1 WHERE adw_trackingsj_id = $2;
          `;

        await dbClient.query(updateCheckpoint, [
          "2",
          currentTrackingId,
        ]);

        // 2.2 INSERT KE TABEL PIVOT adw_group_sj (dilakukan sekali)
        const insertPivotQuery = `
              INSERT INTO adw_group_sj(
                  adw_handover_group_id,
                  adw_trackingsj_id,
                  checkpoint
              ) VALUES ($1, $2, $3);
          `;

        await dbClient.query(insertPivotQuery, [
          groupId,
          currentTrackingId,
          "2",
        ]);

        // 2.3 INSERT EVENT (dilakukan sekali)
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
          currentTrackingId,
          "2",
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

  async processDPKToDriver(server, payload, userId) {
    const dbClient = await server.pg.connect();

    try {
      await dbClient.query("BEGIN");
      let result;

      const { data, driverId, driverName, tnkbId, tnkbName } = payload;

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw { statusCode: 400, message: "Data is required for handover." };
      }

      const inoutIds = data.map((item) => item.m_inout_id);

      // ============================================================
      // 1️⃣ Buat Handover Group (1 kali saja)
      // ============================================================

      const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
      const seq = seqRow.rows[0].seq;

      const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
      const documentno = `HOTD${yymm}${String(seq).padStart(4, "0")}`;

      const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes,
                fromactor, toactor
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING adw_handover_group_id;
        `;

      const groupRes = await dbClient.query(insertGroupQuery, [
        userId,
        documentno,
        "4",
        "ho dpk to driver",
        "DPK",
        "Driver",
      ]);

      const groupId = groupRes.rows[0].adw_handover_group_id;
      if (!groupId) throw new Error("Failed to insert handover group");

      await dbClient.query(
        `
                UPDATE adw_handover_group
                SET drivername = $1, tnkb_id = $2, updated = NOW(), updatedby = $3
                WHERE adw_handover_group_id = $4
            `,
        [driverName, tnkbId, userId, groupId],
      );

      // ============================================================
      // 2️⃣ UPDATE adw_trackingsj (checkpoint 3 → 4)
      // ============================================================

      const updateQuery = `
            UPDATE adw_trackingsj
            SET
                checkpoin_id = $1,
                updated = NOW(),
                updatedby = $2,
                drivername = $4,
                tnkb_id = $5,
                driver_id = $7,
                tnkb = $8
            WHERE
                m_inout_id = ANY($3::integer[])
                AND checkpoin_id = $6
            RETURNING adw_trackingsj_id, m_inout_id;
        `;

      const updateValues = [
        "4", // pindah checkpoint ke 4
        userId,
        inoutIds,
        driverName,
        tnkbId,
        "3", // hanya checkpoint 3
        driverId,
        tnkbName
      ];

      const updateResult = await dbClient.query(updateQuery, updateValues);

      if (updateResult.rows.length === 0) {
        throw new Error(
          "No items updated — wrong checkpoint or already processed.",
        );
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

        await dbClient.query(insertPivotQuery, [groupId, trackingId, "4"]);

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
          "DPK",
          "Driver",
          trackingId,
          "4",
        ]);
      }

      // ============================================================
      // 4️⃣ Response
      // ============================================================

      result = {
        handover_group_id: groupId,
        documentno,
        updatedCount: updatedTracking.length,
        message: `Successfully handed over ${updatedTracking.length} SJ to Driver`,
      };

      await dbClient.query("COMMIT");
      return result;
    } catch (error) {
      if (dbClient) await dbClient.query("ROLLBACK");
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
            SELECT adw_trackingsj_id, m_inout_id, checkpoin_id, driverby, tnkb_id, drivername, cancelrequest
            FROM adw_trackingsj
            WHERE checkpoin_id = '5' AND (trip_mode <> 'DO' OR trip_mode IS NULL)
        `;

      const resultPg = await dbClient.query(queryPostgres);
      const pgRows = resultPg.rows || [];

      if (pgRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      const pgMap = new Map(pgRows.map((row) => [Number(row.m_inout_id), row]));

      // Ambil daftar ID-nya untuk di-query ke Oracle
      const mInoutIds = [...new Set(pgRows.map((row) => row.m_inout_id))];

      // -----------------------------------------------------------
      // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
      // -----------------------------------------------------------

      // Kita buat parameter bind (:1, :2, dst)
      const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(",");

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
                -- AND mi.ADW_TMS_ID IS NOT NULL
            ORDER BY mi.DOCUMENTNO DESC
        `;

      // Eksekusi query dengan ID dari Postgres
      const resultOracle = await connection.execute(queryOracle, mInoutIds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });

      const oracleRows = resultOracle.rows || [];

      // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
      const finalData = oracleRows.map((row) => {
        const pgInfo = pgMap.get(row.M_INOUT_ID) || {};
        return {
          m_inout_id: row.M_INOUT_ID,
          documentno: row.DOCUMENTNO,
          customer: row.CUSTOMER,
          plantime: row.PLANTIME,
          checkpoin_id: 5,
          adw_trackingsj_id: pgInfo.adw_trackingsj_id || null,
          driverby: pgInfo.driverby || null,
          tnkb_id: pgInfo.tnkb_id || null,
          drivername: pgInfo.drivername,
          cancelrequest: pgInfo.cancelrequest,
        };
      });

      return {
        success: true,
        count: finalData.length,
        data: finalData,
      };
    } catch (error) {
      console.error("Error in listCheckInCustomer:", error);
      return { success: false, message: "Server error" };
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
          await dbClient.release();
        } catch (e) {
          console.error(e);
        }
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
            SELECT m_inout_id, checkpoin_id, driverby, tnkb_id, drivername
            FROM adw_trackingsj
            WHERE checkpoin_id = '5' AND trip_mode = 'DO'
        `;

      const resultPg = await dbClient.query(queryPostgres);
      const pgRows = resultPg.rows || [];

      if (pgRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      const pgMap = new Map(pgRows.map((row) => [Number(row.m_inout_id), row]));

      // Ambil daftar ID-nya untuk di-query ke Oracle
      const mInoutIds = [...new Set(pgRows.map((row) => row.m_inout_id))];

      // -----------------------------------------------------------
      // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
      // -----------------------------------------------------------

      // Kita buat parameter bind (:1, :2, dst)
      const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(",");

      const queryOracle = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.VALUE AS CUSTOMERKEY,
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
                AND mi.ADW_TMS_ID IS NOT NULL
            ORDER BY mi.DOCUMENTNO DESC
        `;

      // Eksekusi query dengan ID dari Postgres
      const resultOracle = await connection.execute(queryOracle, mInoutIds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });

      const oracleRows = resultOracle.rows || [];

      // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
      const finalData = oracleRows.map((row) => {
        const pgInfo = pgMap.get(row.M_INOUT_ID) || {};
        return {
          m_inout_id: row.M_INOUT_ID,
          documentno: row.DOCUMENTNO,
          customer: row.CUSTOMER,
          customerkey: row.CUSTOMERKEY,
          plantime: row.PLANTIME,
          checkpoin_id: 6,
          driverby: pgInfo.driverby || null,
          drivername: pgInfo.drivername || null,
          tnkb_id: pgInfo.tnkb_id || null,
        };
      });

      return {
        success: true,
        count: finalData.length,
        data: finalData,
      };
    } catch (error) {
      console.error("Error in listCheckInCustomer:", error);
      return { success: false, message: "Server error" };
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
          await dbClient.release();
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  async processDriverToCustomer(server, payload, userName) {
    const dbClient = await server.pg.connect();

    try {
      await dbClient.query("BEGIN");

      const { data, driverName, tnkbId, tripMode } = payload;

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw { statusCode: 400, message: "Data is required for handover." };
      }

      const DO_items = data.filter((item) => item.tripMode === "DO");
      const RT_items = data.filter((item) => item.tripMode !== "DO"); //

      // DO
      if (DO_items.length > 0) {
        const doIds = DO_items.map((item) => item.m_inout_id);

        const updateTripMode = `
                UPDATE adw_trackingsj
                SET trip_mode = 'DO',
                    updated = NOW()
                WHERE m_inout_id = ANY($1::int[])
                RETURNING adw_trackingsj_id, m_inout_id;
            `;

        const res = await dbClient.query(updateTripMode, [doIds]);

        const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, username,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, isactive,
                    updated, checkpoin_id
                ) VALUES
                (
                    1000003, 1000003, $1,
                    'HANDOVER', $2, $3,
                    $4, NOW(), 'Y',
                    NOW(), $5
                ),
                (
                    1000003, 1000003, $1,
                    'ACCEPTANCE', $2, $3,
                    $4, NOW(), 'Y',
                    NOW(), $5
                )
            `;

        for (const row of res.rows) {
          await dbClient.query(insertEventQuery, [
            userName,
            "Driver",
            "Customer",
            row.adw_trackingsj_id,
            "5",
          ]);
        }
      }

      let result = {};

      if (RT_items.length > 0) {
        const inoutIds = RT_items.map((item) => item.m_inout_id);

        const seqRow = await dbClient.query(
          `SELECT nextval('adw_handover_group_seq') AS seq`,
        );
        const seq = seqRow.rows[0].seq;

        const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
        const documentno = `HIDT${yymm}${String(seq).padStart(4, "0")}`;

        const insertGroupQuery = `
                INSERT INTO adw_handover_group (
                    createdby, documentno, checkpoint, notes, drivername, drivername_receipt, tnkb_id,
                    fromactor, toactor
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING adw_handover_group_id;
            `;

        const groupRes = await dbClient.query(insertGroupQuery, [
          0,
          documentno,
          "6",
          "ho driver to dpk",
          driverName,
          userName,
          tnkbId,
          "Driver",
          "DPK",
        ]);

        const groupId = groupRes.rows[0].adw_handover_group_id;

        // Update trip_mode = RT
        const updateQuery = `
                UPDATE adw_trackingsj
                SET checkpoin_id = $1, updated = NOW(), trip_mode = 'RT', arrivedat_customer = 'Y', drivername_receipt = $4
                WHERE m_inout_id = ANY($2::integer[]) AND checkpoin_id = $3
                RETURNING adw_trackingsj_id, m_inout_id;
            `;

        const updateResult = await dbClient.query(updateQuery, [
          "6",
          inoutIds,
          "5",
          userName
        ]);

        const updatedTracking = updateResult.rows;

        const eventDriverToCustQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, username,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, isactive,
                    updated, checkpoin_id
                ) VALUES
                (
                    1000003, 1000003, $1,
                    'HANDOVER', 'Driver', 'Customer',
                    $2, NOW(), 'Y', NOW(), $3
                ),
                (
                    1000003, 1000003, $1,
                    'ACCEPTANCE', 'Driver', 'Customer',
                    $2, NOW(), 'Y', NOW(), $3
                );
            `;

        const eventDriverToDPKQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, username,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, isactive,
                    updated, checkpoin_id
                ) VALUES (
                    1000003, 1000003, $1,
                    'HANDOVER', 'Driver', 'DPK',
                    $2, NOW(), 'Y', NOW(), $3
                );
            `;

        const insertPivotQuery = `
                INSERT INTO adw_group_sj (
                    adw_handover_group_id, adw_trackingsj_id, checkpoint
                ) VALUES ($1, $2, $3);
            `;

        for (const row of updatedTracking) {
          const trackingId = row.adw_trackingsj_id;

          await dbClient.query(insertPivotQuery, [groupId, trackingId, "5"]);
          await dbClient.query(eventDriverToCustQuery, [
            userName,
            trackingId,
            "5",
          ]);
          await dbClient.query(eventDriverToDPKQuery, [
            userName,
            trackingId,
            "5",
          ]);
        }

        result = {
          handover_group_id: groupId,
          documentno,
          updatedRT: updatedTracking.length,
          updatedDO: DO_items.length,
          message: `RT: ${updatedTracking.length}, DO: ${DO_items.length}`,
        };
      }

      await dbClient.query("COMMIT");
      return result;
    } catch (error) {
      if (dbClient) await dbClient.query("ROLLBACK");
      console.error("Transaction Error in processDPKToDriver:", error.message);
      throw error;
    } finally {
      if (dbClient) await dbClient.release();
    }
  }

  async processDriverToCustomerDo(server, payload, userName) {
    const dbClient = await server.pg.connect();

    try {
      await dbClient.query("BEGIN");

      let result;

      const { data, driverName, tnkbId } = payload;

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw { statusCode: 400, message: "Data is required for handover." };
      }

      const inoutIds = data.map((item) => item.m_inout_id);

      const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
      const seq = seqRow.rows[0].seq;

      const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
      const documentno = `HIDT${yymm}${String(seq).padStart(4, "0")}`;

      const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes, drivername, drivername_receipt, tnkb_id,
                fromactor, toactor
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING adw_handover_group_id;
        `;

      const groupRes = await dbClient.query(insertGroupQuery, [
        0,
        documentno,
        "6",
        "handover driver ke dpk",
        driverName,
        userName,
        tnkbId,
        "Driver",
        "DPK",
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
                trip_mode = 'RT',
                arrivedat_customer = 'Y',
                drivername_receipt = $4
            WHERE
                m_inout_id = ANY($2::integer[])
                AND checkpoin_id = $3
            RETURNING adw_trackingsj_id, m_inout_id;
        `;

      const updateValues = [
        "6", // pindah checkpoint ke 6
        inoutIds,
        "5", // hanya checkpoint 5
        userName
      ];

      const updateResult = await dbClient.query(updateQuery, updateValues);

      if (updateResult.rows.length === 0) {
        throw new Error(
          "No items updated — wrong checkpoint or already processed.",
        );
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

        await dbClient.query(insertPivotQuery, [groupId, trackingId, "5"]);

        // 3.2 Insert event
        const insertEventQuery = `
                INSERT INTO adw_trackingsj_events(
                    ad_client_id, ad_org_id, username,
                    adw_event_type, adw_from_actor, adw_to_actor,
                    adw_trackingsj_id, created, isactive,
                    updated, checkpoin_id
                ) VALUES (
                    1000003, 1000003, $1,
                    'HANDOVER', $2, $3,
                    $4, NOW(), 'Y',
                    NOW(), $5
                )
            `;

        await dbClient.query(insertEventQuery, [
          userName,
          "Driver",
          "DPK",
          trackingId,
          "5", // checkpoint sebelumnya
        ]);
      }

      // ============================================================
      // 4️⃣ Response
      // ============================================================

      result = {
        handover_group_id: groupId,
        documentno,
        updatedCount: updatedTracking.length,
        message: `Successfully handed over ${updatedTracking.length} SJ to Driver`,
      };

      await dbClient.query("COMMIT");
      return result;
    } catch (error) {
      if (dbClient) await dbClient.query("ROLLBACK");
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
            SELECT m_inout_id, checkpoin_id, driverby, tnkb_id, drivername
            FROM adw_trackingsj
            WHERE checkpoin_id = '7'
        `;

      const resultPg = await dbClient.query(queryPostgres);
      const pgRows = resultPg.rows || [];

      if (pgRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      const pgMap = new Map(pgRows.map((row) => [Number(row.m_inout_id), row]));

      // Ambil daftar ID-nya untuk di-query ke Oracle
      const mInoutIds = [...new Set(pgRows.map((row) => row.m_inout_id))];

      const tnkbIds = [...new Set(pgRows.map((row) => row.tnkb_id).filter(Boolean))];

      // -----------------------------------------------------------
      // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
      // -----------------------------------------------------------

      // Kita buat parameter bind (:1, :2, dst)
      const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(",");

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
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });

      const oracleRows = resultOracle.rows || [];

      let tnkbMap = new Map();
      if (tnkbIds.length > 0) {
        const bindVarsTnkb = tnkbIds.map((_, i) => `:${i + 1}`).join(",");
        const queryOracleTnkb = `
            SELECT ADW_TMS_TNKB_ID, NAME AS PLAT_NOMOR
            FROM ADW_TMS_TNKB
            WHERE ADW_TMS_TNKB_ID IN (${bindVarsTnkb})
        `;

        const resultTnkb = await connection.execute(queryOracleTnkb, tnkbIds, {
          outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
        });

        resultTnkb.rows.forEach(row => {
          tnkbMap.set(String(row.ADW_TMS_TNKB_ID), row.PLAT_NOMOR);
        });
      }

      // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
      const finalData = oracleRows.map((row) => {
        const pgInfo = pgMap.get(row.M_INOUT_ID) || {};
        const platNomor = tnkbMap.get(String(pgInfo.tnkb_id));
        return {
          m_inout_id: row.M_INOUT_ID,
          documentno: row.DOCUMENTNO,
          customer: row.CUSTOMER,
          plantime: row.PLANTIME,
          checkpoin_id: 7,
          driverby: pgInfo.driverby || null,
          tnkb_id: pgInfo.tnkb_id || null,
          drivername: pgInfo.drivername || null,
          plat_nomor: platNomor || "N/A" // <-- Plat nomor berhasil ditambahkan
        };
      });

      return {
        success: true,
        count: finalData.length,
        data: finalData,
      };
    } catch (error) {
      console.error("Error in listCheckInCustomer:", error);
      return { success: false, message: "Server error" };
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
          await dbClient.release();
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  async processDPKToDelivery(server, payload, userId) {
    const dbClient = await server.pg.connect();

    try {
      await dbClient.query("BEGIN");

      let result;

      const { data, driverId, tnkbId } = payload;

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw { statusCode: 400, message: "Data is required for handover." };
      }

      const inoutIds = data.map((item) => item.m_inout_id);

      const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
      const seq = seqRow.rows[0].seq;

      const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
      const documentno = `HITP${yymm}${String(seq).padStart(4, "0")}`;

      const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes, driverby, tnkb_id,
                fromactor, toactor
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING adw_handover_group_id;
        `;

      const groupRes = await dbClient.query(insertGroupQuery, [
        userId,
        documentno,
        "8",
        "handover dpk ke delivery",
        driverId,
        tnkbId,
        "DPK",
        "Delivery",
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
        "8", // pindah checkpoint ke 8
        userId,
        inoutIds,
        "7", // hanya checkpoint 7
      ];

      const updateResult = await dbClient.query(updateQuery, updateValues);

      if (updateResult.rows.length === 0) {
        throw new Error(
          "No items updated — wrong checkpoint or already processed.",
        );
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

        await dbClient.query(insertPivotQuery, [groupId, trackingId, "7"]);

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
          "DPK",
          "Delivery",
          trackingId,
          "7", // checkpoint sebelumnya
        ]);
      }

      // ============================================================
      // 4️⃣ Response
      // ============================================================

      result = {
        handover_group_id: groupId,
        documentno,
        updatedCount: updatedTracking.length,
        message: `Successfully handed over ${updatedTracking.length} SJ to Driver`,
      };

      await dbClient.query("COMMIT");
      return result;
    } catch (error) {
      if (dbClient) await dbClient.query("ROLLBACK");
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
            SELECT adw_trackingsj_id, m_inout_id, checkpoin_id, driverby, tnkb_id, cancelrequestmkt
            FROM adw_trackingsj
            WHERE checkpoin_id = '9'
                    OR (checkpoin_id = '11' AND cancelrequestmkt = 'Y')
        `;

      const resultPg = await dbClient.query(queryPostgres);
      const pgRows = resultPg.rows || [];

      if (pgRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      const pgMap = new Map(pgRows.map((row) => [Number(row.m_inout_id), row]));

      // Ambil daftar ID-nya untuk di-query ke Oracle
      const mInoutIds = [...new Set(pgRows.map((row) => row.m_inout_id))];

      // -----------------------------------------------------------
      // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
      // -----------------------------------------------------------

      // Kita buat parameter bind (:1, :2, dst)
      const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(",");

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
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });

      const oracleRows = resultOracle.rows || [];

      // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
      const finalData = oracleRows.map((row) => {
        const pgInfo = pgMap.get(row.M_INOUT_ID) || {};
        return {
          m_inout_id: row.M_INOUT_ID,
          adw_trackingsj_id: pgInfo.adw_trackingsj_id,
          documentno: row.DOCUMENTNO,
          customer: row.CUSTOMER,
          plantime: row.PLANTIME,
          checkpoin_id: parseInt(pgInfo.checkpoin_id) || 0,
          driverby: pgInfo.driverby || null,
          tnkb_id: pgInfo.tnkb_id || null,
          cancelrequestmkt: pgInfo.cancelrequestmkt || null,
        };
      });

      return {
        success: true,
        count: finalData.length,
        data: finalData,
      };
    } catch (error) {
      console.error("Error in listCheckInCustomer:", error);
      return { success: false, message: "Server error" };
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
          await dbClient.release();
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  async processDeliveryToMKT(server, payload, userId) {
    const dbClient = await server.pg.connect();

    try {
      await dbClient.query("BEGIN");

      let result;

      const { data, driverId, tnkbId } = payload;

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw { statusCode: 400, message: "Data is required for handover." };
      }

      const inoutIds = data.map((item) => item.m_inout_id);

      const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
      const seq = seqRow.rows[0].seq;

      const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
      const documentno = `HIPM${yymm}${String(seq).padStart(4, "0")}`;

      const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes, driverby, tnkb_id,
                fromactor, toactor
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING adw_handover_group_id;
        `;

      const groupRes = await dbClient.query(insertGroupQuery, [
        userId,
        documentno,
        "10",
        "handover delivery ke mkt",
        driverId,
        tnkbId,
        "Delivery",
        "Marketing",
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
                trip_mode = 'RT',
                canceledmkt = 'N',
                notesmkt = null
            WHERE
                m_inout_id = ANY($3::integer[])
                AND checkpoin_id = $4
            RETURNING adw_trackingsj_id, m_inout_id;
        `;

      const updateValues = [
        "10", // pindah checkpoint ke 10
        userId,
        inoutIds,
        "9", // hanya checkpoint 9
      ];

      const updateResult = await dbClient.query(updateQuery, updateValues);

      if (updateResult.rows.length === 0) {
        throw new Error(
          "No items updated — wrong checkpoint or already processed.",
        );
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

        await dbClient.query(insertPivotQuery, [groupId, trackingId, "9"]);

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
          "Delivery",
          "Marketing",
          trackingId,
          "9", // checkpoint sebelumnya
        ]);
      }

      // ============================================================
      // 4️⃣ Response
      // ============================================================

      result = {
        handover_group_id: groupId,
        documentno,
        updatedCount: updatedTracking.length,
        message: `Successfully handed over ${updatedTracking.length} SJ to MKT`,
      };

      await dbClient.query("COMMIT");
      return result;
    } catch (error) {
      if (dbClient) await dbClient.query("ROLLBACK");
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
            SELECT adw_trackingsj_id, m_inout_id, checkpoin_id, driverby, tnkb_id, drivername, cancelrequestmkt
            FROM adw_trackingsj
            WHERE checkpoin_id = '11'
        `;

      const resultPg = await dbClient.query(queryPostgres);
      const pgRows = resultPg.rows || [];

      if (pgRows.length === 0) {
        return { success: true, count: 0, data: [] };
      }

      const pgMap = new Map(pgRows.map((row) => [Number(row.m_inout_id), row]));

      // Ambil daftar ID-nya untuk di-query ke Oracle
      const mInoutIds = [...new Set(pgRows.map((row) => row.m_inout_id))];

      // -----------------------------------------------------------
      // 2. AMBIL DETAIL DARI ORACLE BERDASARKAN ID TERSEBUT
      // -----------------------------------------------------------

      // Kita buat parameter bind (:1, :2, dst)
      const bindVars = mInoutIds.map((_, i) => `:${i + 1}`).join(",");

      const queryOracle = `
            SELECT
                mi.M_INOUT_ID,
                mi.DOCUMENTNO,
                cb.NAME AS CUSTOMER,
                TO_DATE(
                    TO_CHAR(mi.MOVEMENTDATE, 'YYYY-MM-DD') || ' ' ||
                    TO_CHAR(mi.PLANTIME, 'HH24:MI:SS'),
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS PLANTIME,
                mi.SPPNO
            FROM
                M_INOUT mi
                INNER JOIN C_BPARTNER cb ON mi.C_BPARTNER_ID = cb.C_BPARTNER_ID
            WHERE
                mi.M_INOUT_ID IN (${bindVars})
            ORDER BY mi.DOCUMENTNO DESC
        `;

      // Eksekusi query dengan ID dari Postgres
      const resultOracle = await connection.execute(queryOracle, mInoutIds, {
        outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT,
      });

      const oracleRows = resultOracle.rows || [];

      // Mapping hasil Oracle agar formatnya sesuai yang diinginkan
      const finalData = oracleRows.map((row) => {
        const pgInfo = pgMap.get(row.M_INOUT_ID) || {};
        return {
          m_inout_id: row.M_INOUT_ID,
          adw_trackingsj_id: pgInfo.adw_trackingsj_id || null,
          documentno: row.DOCUMENTNO,
          customer: row.CUSTOMER,
          plantime: row.PLANTIME,
          sppno: row.SPPNO,
          checkpoin_id: 9,
          driverby: pgInfo.driverby || null,
          tnkb_id: pgInfo.tnkb_id || null,
          drivername: pgInfo.drivername || null,
          cancelrequestmkt: pgInfo.cancelrequestmkt || null,
        };
      });

      return {
        success: true,
        count: finalData.length,
        data: finalData,
      };
    } catch (error) {
      console.error("Error in listCheckInCustomer:", error);
      return { success: false, message: "Server error" };
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
          await dbClient.release();
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  async processMKTToFAT(server, payload, userId) {
    const dbClient = await server.pg.connect();

    try {
      await dbClient.query("BEGIN");

      let result;

      const { sppNo, data, driverId, tnkbId } = payload;

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw { statusCode: 400, message: "Data is required for handover." };
      }

      const inoutIds = data.map((item) => item.m_inout_id);

      const seqRow = await dbClient.query(`
            SELECT nextval('adw_handover_group_seq') AS seq
        `);
      const seq = seqRow.rows[0].seq;

      const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
      const documentno = `HIMF${yymm}${String(seq).padStart(4, "0")}`;

      const insertGroupQuery = `
            INSERT INTO adw_handover_group (
                createdby, documentno, checkpoint, notes, driverby, tnkb_id, sppno,
                fromactor, toactor
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING adw_handover_group_id;
        `;

      const groupRes = await dbClient.query(insertGroupQuery, [
        userId,
        documentno,
        "12",
        "handover mkt ke fat",
        driverId,
        tnkbId,
        sppNo,
        "Marketing",
        "FAT",
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
        "12", // pindah checkpoint ke 12
        userId,
        inoutIds,
        "11", // hanya checkpoint 11
      ];

      const updateResult = await dbClient.query(updateQuery, updateValues);

      if (updateResult.rows.length === 0) {
        throw new Error(
          "No items updated — wrong checkpoint or already processed.",
        );
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

        await dbClient.query(insertPivotQuery, [groupId, trackingId, "11"]);

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
          "Marketing",
          "FAT",
          trackingId,
          "11", // checkpoint sebelumnya
        ]);
      }

      // ============================================================
      // 4️⃣ Response
      // ============================================================

      result = {
        handover_group_id: groupId,
        documentno,
        updatedCount: updatedTracking.length,
        message: `Successfully handed over ${updatedTracking.length} SJ to MKT`,
      };

      await dbClient.query("COMMIT");
      return result;
    } catch (error) {
      if (dbClient) await dbClient.query("ROLLBACK");
      console.error("Transaction Error in processDPKToDriver:", error.message);
      throw error;
    } finally {
      if (dbClient) await dbClient.release();
    }
  }
}

async function handover(fastify, opts) {
  fastify.decorate("handover", new Handover());
  fastify.register(autoload, {
    dir: join(import.meta.url, "routes"),
    options: {
      prefix: opts.prefix,
    },
  });
}

export default fp(handover);
