export default async (server, opts) => {
    server.post('/process-cancel', async (request, reply) => {
        try {
            // Ekstrak payload yang lebih detail dari body request frontend
            const { action, m_inout_id, handoverKey, role } = request.body;
            // Asumsi Anda memiliki user ID di request, misalnya dari plugin otentikasi
            const userId = request.user.id;

            // Validasi input dasar
            if (!action || !m_inout_id || !handoverKey || !role) {
                return reply.status(400).send({ success: false, message: 'Missing required parameters.' });
            }

            // Panggil fungsi toCancel dengan parameter yang jelas
            const result = await server.tms.toCancel(server, {
                action,
                m_inout_id,
                handoverKey,
                role,
                userId
            });

            reply.send(result);

        } catch (error) {
            request.log.error(error);
            // Memberikan respons error yang lebih informatif
            const statusCode = error.statusCode || 500;
            const message = error.message || 'An unexpected server error occurred.';
            reply.status(statusCode).send({ success: false, message });
        }
    });
}