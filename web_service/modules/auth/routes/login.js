import oracleDB from "../../../configs/dbOracle.js";

export default async function (fastify, options) {
    fastify.post('/login', async (request, reply) => {
        const { username, password } = request.body;
        const dbClient = await fastify.pg.connect();
        let oracleConn;

        try {

            const pgResult = await dbClient.query(
                `SELECT ad_user_id, name, title 
                 FROM AD_User 
                 WHERE name = $1 AND password = $2 AND isactive = 'Y'`,
                [username, password]
            );

            if (pgResult.rowCount > 0) {
                const user = pgResult.rows[0];

                request.session.set('user', {
                    ad_user_id: Number(user.ad_user_id),
                    name: user.name,
                    title: user.title
                });

                return reply.send({
                    success: true,
                    source: "postgres",
                    user: {
                        ad_user_id: Number(user.ad_user_id),
                        name: user.name,
                        title: user.title
                    }
                });
            }

            oracleConn = await oracleDB.openConnection();

            const oracleResult = await oracleConn.execute(
                `SELECT AD_USER_ID, NAME, TITLE
                 FROM AD_User 
                 WHERE Name = :username AND Password = :password AND IsActive = 'Y'`,
                { username, password },
                { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
            );

            if (oracleResult.rows.length > 0) {
                const user = oracleResult.rows[0];

                request.session.set('user', {
                    ad_user_id: user.AD_USER_ID,
                    name: user.NAME,
                    title: user.TITLE
                });

                return reply.send({
                    success: true,
                    source: "oracle",
                    user: {
                        ad_user_id: user.AD_USER_ID,
                        name: user.NAME,
                        title: user.TITLE
                    }
                });
            }

            return reply.code(401).send({
                success: false,
                message: "Invalid credentials"
            });

        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                success: false,
                message: "Server error"
            });

        } finally {
            dbClient.release();

            if (oracleConn) {
                try {
                    await oracleConn.close();
                } catch (err) {
                    fastify.log.error("Error closing Oracle connection:", err);
                }
            }
        }
    });

    fastify.post('/login/oracle', async (request, reply) => {
        let connection;
        const { username, password } = request.body;
        try {

            connection = await oracleDB.openConnection();

            const result = await connection.execute(
                'SELECT * FROM AD_User WHERE Name = :username AND Password = :password AND IsActive = \'Y\'',
                { username, password },
                { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT }
            );


            if (result.rows.length > 0) {
                const user = result.rows[0];

                // Set session with user information
                request.session.set('user', {
                    id: user.AD_USER_ID,
                    name: user.NAME,
                });

                reply.send({ success: true, user: { id: user.ad_user_id, name: user.name } });
            } else {
                reply.code(401).send({ success: false, message: 'Invalid credentials' });
            }
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ success: false, message: 'Server error' });
        } finally {
            // 💡 Tutup koneksi jika berhasil dibuka
            if (connection) {
                try {
                    await connection.close();
                } catch (closeErr) {
                    fastify.log.error('Error closing Oracle connection:', closeErr);
                }
            }
        }
    });
}