import oracleDB from "../../../configs/dbOracle.js";

export default async function (fastify, options) {
  fastify.get("/check-device", async (request, reply) => {
    const deviceId = request.cookies.device_id;
    const savedUsername = request.cookies.saved_username;

    if (!deviceId) {
      return reply.send({ isDeviceRegistered: false });
    }

    const dbClient = await fastify.pg.connect();
    try {
      // CEK STATUS PIN DI DATABASE
      const res = await dbClient.query(
        `SELECT pin FROM adw_employee_pin WHERE device_id = $1`,
        [deviceId],
      );

      if (res.rowCount === 0) {
        // Cookie ada, tapi di DB tidak ada (mungkin terhapus manual)
        return reply.send({ isDeviceRegistered: false });
      }

      const row = res.rows[0];

      // JIKA PIN MASIH NULL -> Beritahu frontend untuk buka Setup PIN
      if (row.pin === null) {
        return reply.send({
          isDeviceRegistered: false,
          requirePinSetup: true, // Flag khusus
          username: savedUsername,
        });
      }

      // JIKA PIN ADA -> Device Terdaftar Sah
      return reply.send({
        isDeviceRegistered: true,
        username: savedUsername,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.send({ isDeviceRegistered: false });
    } finally {
      dbClient.release();
    }
  });

  // ---------------------------------------------------------
  // 2. LOGIN (Password & PIN)
  // ---------------------------------------------------------
  fastify.post("/login", async (request, reply) => {
    const { username, password, isPinLogin, pin, deviceId, isMobile } =
      request.body;
    const dbClient = await fastify.pg.connect();
    let oracleConn;

    try {
      // --- SKENARIO A: LOGIN PIN (User Lama) ---
      if (isPinLogin) {
        const cookieDeviceId = request.cookies.device_id;
        if (!cookieDeviceId)
          return reply
            .code(401)
            .send({ success: false, message: "Device tidak dikenali." });

        const pinCheck = await dbClient.query(
          `SELECT username, ad_user_id, pin FROM adw_employee_pin WHERE device_id = $1`,
          [cookieDeviceId],
        );

        if (pinCheck.rowCount === 0)
          return reply
            .code(401)
            .send({ success: false, message: "Device tidak terdaftar." });

        const savedData = pinCheck.rows[0];

        // Cegah login jika PIN masih NULL
        if (!savedData.pin)
          return reply
            .code(403)
            .send({ success: false, message: "PIN belum disetup." });

        // Validasi PIN
        if (savedData.pin !== String(pin))
          return reply
            .code(401)
            .send({ success: false, message: "PIN Salah." });

        // Ambil Detail User (Query ulang ke master user)
        const targetUsername = savedData.username;
        let userDetail = null;

        // Cek Postgres
        const pgUser = await dbClient.query(
          `SELECT ad_user_id, name, title FROM AD_User WHERE name = $1 AND isactive = 'Y'`,
          [targetUsername],
        );
        if (pgUser.rowCount > 0) {
          userDetail = pgUser.rows[0];
          userDetail.ad_user_id = Number(userDetail.ad_user_id);
        } else {
          // Cek Oracle
          try {
            oracleConn = await oracleDB.openConnection();
            const oracleResult = await oracleConn.execute(
              `SELECT AD_USER_ID, NAME, TITLE FROM AD_User WHERE Name = :username AND IsActive = 'Y'`,
              { username: targetUsername },
              { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT },
            );
            if (oracleResult.rows.length > 0) {
              const u = oracleResult.rows[0];
              userDetail = {
                ad_user_id: u.AD_USER_ID,
                name: u.NAME,
                title: u.TITLE,
              };
            }
          } catch (e) { }
        }

        if (userDetail) {
          await dbClient.query(
            `UPDATE adw_employee_pin SET last_login = NOW() WHERE device_id = $1`,
            [cookieDeviceId],
          );
          request.session.set("user", userDetail);
          return reply.send({ success: true, user: userDetail });
        } else {
          return reply
            .code(401)
            .send({ success: false, message: "User tidak aktif." });
        }
      }

      // --- SKENARIO B: LOGIN PASSWORD (Generate Device ID & PIN NULL) ---
      let userFound = null;
      let source = "";

      const pgResult = await dbClient.query(
        `SELECT ad_user_id, name, title FROM AD_User WHERE name = $1 AND password = $2 AND isactive = 'Y'`,
        [username, password],
      );
      if (pgResult.rowCount > 0) {
        userFound = pgResult.rows[0];
        userFound.ad_user_id = Number(userFound.ad_user_id);
        source = "postgres";
      } else {
        try {
          oracleConn = await oracleDB.openConnection();
          const oracleRes = await oracleConn.execute(
            `SELECT AD_USER_ID, NAME, VALUE, TITLE FROM AD_User 
            WHERE Value = :u AND Password = :p AND IsActive = 'Y'
            AND TITLE = 'driver'`,
            { u: username, p: password },
            { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT },
          );
          if (oracleRes.rows.length > 0) {
            const u = oracleRes.rows[0];
            userFound = {
              ad_user_id: u.AD_USER_ID,
              name: u.NAME,
              value: u.VALUE,
              title: u.TITLE,
            };
            source = "oracle";
          }
        } catch (e) { }
      }

      if (userFound) {
        request.session.set("user", userFound);

        if (!isMobile) {
          return reply.send({
            success: true,
            source: source,
            requirePinSetup: false, // Desktop tidak butuh PIN
            user: userFound,
          });
        }

        // 1. Generate Device ID
        const newDeviceId = crypto.randomUUID();
        const pinTableUserId = source === "postgres" ? userFound.ad_user_id : 0;

        // 2. Hapus data lama jika ada (opsional, agar bersih)
        // await dbClient.query(`DELETE FROM adw_employee_pin WHERE username = $1`, [userFound.name]);

        // 3. INSERT DENGAN PIN NULL
        await dbClient.query(
          `INSERT INTO adw_employee_pin (ad_user_id, username, device_id, pin) VALUES ($1, $2, $3, NULL)`,
          [pinTableUserId, userFound.name, newDeviceId],
        );

        // 4. Set Cookie
        const opts = {
          path: "/",
          httpOnly: false,
          secure: false,
        };

        request.session.set("user", userFound);

        reply.setCookie("device_id", newDeviceId, opts);
        reply.setCookie("saved_username", userFound.name, opts);

        return reply.send({
          success: true,
          requirePinSetup: true, // Frontend baca ini
          user: userFound,
        });
      }

      return reply
        .code(401)
        .send({ success: false, message: "Invalid credentials" });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, message: "Server error" });
    } finally {
      dbClient.release();
      if (oracleConn)
        try {
          await oracleConn.close();
        } catch (e) { }
    }
  });

  // 3. SETUP PIN
  fastify.post("/setup-pin", async (request, reply) => {
    const { pin } = request.body;
    const deviceId = request.cookies.device_id;

    if (!deviceId)
      return reply
        .code(401)
        .send({ success: false, message: "Session expired." });
    if (!pin || pin.length !== 6)
      return reply
        .code(400)
        .send({ success: false, message: "PIN harus 6 digit." });

    const dbClient = await fastify.pg.connect();
    try {
      // Update PIN yang tadinya NULL menjadi nilai inputan user
      const res = await dbClient.query(
        `UPDATE adw_employee_pin SET pin = $1 WHERE device_id = $2`,
        [pin, deviceId],
      );

      if (res.rowCount > 0) {
        return reply.send({ success: true, message: "PIN Created" });
      } else {
        return reply
          .code(404)
          .send({ success: false, message: "Device ID tidak ditemukan." });
      }
    } finally {
      dbClient.release();
    }
  });

  // 1. CHANGE PASSWORD
  fastify.post("/change-password", async (request, reply) => {
    const userSession = request.session.get("user");
    if (!userSession || !userSession.ad_user_id) {
      return reply.code(401).send({ success: false, message: "Unauthorized" });
    }

    const { newPassword } = request.body;
    const userId = Number(userSession.ad_user_id);
    const userTitle = String(userSession.title).toLowerCase(); // Ambil title (driver/staff)

    if (!newPassword || newPassword.length < 3) {
      return reply.code(400).send({ success: false, message: "Password minimal 3 karakter." });
    }

    let updated = false;
    let sourceDB = "";

    // --- LOGIKA ROUTING BERDASARKAN TITLE ---
    if (userTitle === "driver") {
      // KHUSUS DRIVER -> KE ORACLE
      let oracleConn;
      try {
        oracleConn = await oracleDB.openConnection();
        const result = await oracleConn.execute(
          `UPDATE AD_User SET Password = :p, Updated = SYSDATE WHERE AD_USER_ID = :id`,
          { p: newPassword, id: userId },
          { autoCommit: true }
        );
        if (result.rowsAffected > 0) {
          updated = true;
          sourceDB = "Oracle";
        }
      } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ success: false, message: "Gagal update Oracle." });
      } finally {
        if (oracleConn) await oracleConn.close();
      }
    } else {
      // SELAIN DRIVER -> KE POSTGRES
      const dbClient = await fastify.pg.connect();
      try {
        const pgRes = await dbClient.query(
          `UPDATE AD_User SET password = $1, updated = NOW() WHERE ad_user_id::numeric = $2`,
          [newPassword, userId]
        );
        if (pgRes.rowCount > 0) {
          updated = true;
          sourceDB = "Postgres";
        }
      } finally {
        dbClient.release();
      }
    }

    if (updated) {
      return reply.send({ success: true, message: `Password berhasil diubah di ${sourceDB}` });
    } else {
      return reply.code(404).send({ success: false, message: "User tidak ditemukan." });
    }
  });

  // 2. CHANGE USERNAME
  fastify.post("/change-username", async (request, reply) => {
    const userSession = request.session.get("user");
    if (!userSession || !userSession.ad_user_id) {
      return reply.code(401).send({ success: false, message: "Unauthorized" });
    }

    const { newUsername } = request.body;
    const userId = Number(userSession.ad_user_id);
    const userTitle = String(userSession.title).toLowerCase();
    const oldUsername = userSession.name;

    if (!newUsername || newUsername.length < 3 || /\s/.test(newUsername)) {
      return reply.code(400).send({ success: false, message: "Username tidak valid." });
    }

    let updated = false;
    let sourceDB = "";
    const dbClient = await fastify.pg.connect(); // Tetap butuh PG untuk update tabel PIN

    try {
      // --- LANGKAH 0: CEK DUPLIKAT GLOBAL (Opsional tapi disarankan) ---
      // Cek di Postgres agar tidak bentrok dengan staff
      const pgDup = await dbClient.query(`SELECT ad_user_id FROM AD_User WHERE name = $1 AND ad_user_id::numeric != $2`, [newUsername, userId]);
      if (pgDup.rowCount > 0) return reply.code(400).send({ success: false, message: "Username sudah dipakai staff lain." });

      // --- LANGKAH 1: UPDATE BERDASARKAN TITLE ---
      if (userTitle === "driver") {
        let oracleConn;
        try {
          oracleConn = await oracleDB.openConnection();
          const result = await oracleConn.execute(
            `UPDATE AD_User SET Value = :name, Updated = SYSDATE WHERE AD_USER_ID = :id`,
            { name: newUsername, id: userId },
            { autoCommit: true }
          );
          if (result.rowsAffected > 0) {
            updated = true;
            sourceDB = "Oracle";
          }
        } finally {
          if (oracleConn) await oracleConn.close();
        }
      } else {
        const pgRes = await dbClient.query(
          `UPDATE AD_User SET name = $1, updated = NOW() WHERE ad_user_id::numeric = $2`,
          [newUsername, userId]
        );
        if (pgRes.rowCount > 0) {
          updated = true;
          sourceDB = "Postgres";
        }
      }

      // --- LANGKAH 2: FINALIZE (Sync Session & Tabel PIN) ---
      if (updated) {
        // Sinkronisasi tabel PIN (PENTING: Semua user baik driver/staff datanya ada di sini untuk Mobile Login)
        await dbClient.query(
          `UPDATE adw_employee_pin SET username = $1 WHERE ad_user_id::numeric = $2 OR username = $3`,
          [newUsername, userId, oldUsername]
        );

        // Update Session
        userSession.name = newUsername;
        request.session.set("user", userSession);

        return reply.send({ success: true, message: `Username diubah (${sourceDB})`, newUsername });
      }

      return reply.code(404).send({ success: false, message: "User tidak ditemukan." });

    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, message: "Internal Server Error" });
    } finally {
      dbClient.release();
    }
  });

  // 4. LOGOUT
  // fastify.post("/logout-full", async (request, reply) => {
  //   if (request.session) {
  //     request.session.delete();
  //   }
  //   reply.clearCookie("device_id", { path: "/" });
  //   reply.clearCookie("saved_username", { path: "/" });
  //   return reply.send({ success: true, message: "Device removed" });
  // });

  // fastify.post('/login', async (request, reply) => {
  //     const { username, password } = request.body;
  //     const dbClient = await fastify.pg.connect();
  //     let oracleConn;

  //     try {

  //         const pgResult = await dbClient.query(
  //             `SELECT ad_user_id, name, title
  //              FROM AD_User
  //              WHERE name = $1 AND password = $2 AND isactive = 'Y'`,
  //             [username, password]
  //         );

  //         if (pgResult.rowCount > 0) {
  //             const user = pgResult.rows[0];

  //             request.session.set('user', {
  //                 ad_user_id: Number(user.ad_user_id),
  //                 name: user.name,
  //                 title: user.title
  //             });

  //             return reply.send({
  //                 success: true,
  //                 source: "postgres",
  //                 user: {
  //                     ad_user_id: Number(user.ad_user_id),
  //                     name: user.name,
  //                     title: user.title
  //                 }
  //             });
  //         }

  //         oracleConn = await oracleDB.openConnection();

  //         const oracleResult = await oracleConn.execute(
  //             `SELECT AD_USER_ID, NAME, TITLE
  //              FROM AD_User
  //              WHERE Name = :username AND Password = :password AND IsActive = 'Y'`,
  //             { username, password },
  //             { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
  //         );

  //         if (oracleResult.rows.length > 0) {
  //             const user = oracleResult.rows[0];

  //             request.session.set('user', {
  //                 ad_user_id: user.AD_USER_ID,
  //                 name: user.NAME,
  //                 title: user.TITLE
  //             });

  //             return reply.send({
  //                 success: true,
  //                 source: "oracle",
  //                 user: {
  //                     ad_user_id: user.AD_USER_ID,
  //                     name: user.NAME,
  //                     title: user.TITLE
  //                 }
  //             });
  //         }

  //         return reply.code(401).send({
  //             success: false,
  //             message: "Invalid credentials"
  //         });

  //     } catch (error) {
  //         fastify.log.error(error);
  //         return reply.code(500).send({
  //             success: false,
  //             message: "Server error"
  //         });

  //     } finally {
  //         dbClient.release();

  //         if (oracleConn) {
  //             try {
  //                 await oracleConn.close();
  //             } catch (err) {
  //                 fastify.log.error("Error closing Oracle connection:", err);
  //             }
  //         }
  //     }
  // });

  fastify.post("/login/oracle", async (request, reply) => {
    let connection;
    const { username, password } = request.body;
    try {
      connection = await oracleDB.openConnection();

      const result = await connection.execute(
        "SELECT * FROM AD_User WHERE Name = :username AND Password = :password AND IsActive = 'Y'",
        { username, password },
        { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT },
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];

        // Set session with user information
        request.session.set("user", {
          id: user.AD_USER_ID,
          name: user.NAME,
        });

        reply.send({
          success: true,
          user: { id: user.ad_user_id, name: user.name },
        });
      } else {
        reply
          .code(401)
          .send({ success: false, message: "Invalid credentials" });
      }
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ success: false, message: "Server error" });
    } finally {
      // 💡 Tutup koneksi jika berhasil dibuka
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          fastify.log.error("Error closing Oracle connection:", closeErr);
        }
      }
    }
  });
}
