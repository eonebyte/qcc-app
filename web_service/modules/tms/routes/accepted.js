export default async (server, opts) => {
    // server.post('/accepted', async (request, reply) => {
    //     try {
    //         const { data } = request.body;
    //         const { checkpoint } = request.query;
    //         const userId = request.user.ad_user_id;

    //         const accepted = await server.tms.setAccepted(server, data, userId, checkpoint);
    //         reply.send(accepted);
    //     } catch (error) {
    //         request.log.error(error);
    //         reply.status(500).send({ message: `Failed: ${error.message || error}` });
    //     }
    // });

    server.post('/accepted', async (request, reply) => {
        try {
            // Ambil array of bundles dari body
            const { data: bundles } = request.body;
            const { checkpoint } = request.query;
            const userId = request.user.ad_user_id;

            // Validasi sederhana
            if (!bundles || !Array.isArray(bundles) || bundles.length === 0) {
                return reply.status(400).send({ success: false, message: "Payload tidak valid atau tidak berisi bundle." });
            }

            // Panggil fungsi service yang baru, teruskan data bundles apa adanya
            const result = await server.tms.processAcceptedBundles(server, bundles, userId, checkpoint);

            reply.send(result);
        } catch (error) {
            request.log.error(error);
            // Pastikan error yang ditampilkan ke klien tidak membocorkan detail teknis
            reply.status(500).send({ success: false, message: 'Terjadi kesalahan internal pada server.' });
        }
    });
}