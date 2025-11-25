// routes/dashboard.js
export default async (server, opts) => {
    // ✅ Endpoint data ringan (summary)
    server.get('/dashboard/summary', async (request, reply) => {
        try {

            const { month } = request.query;

            if (!month) {
                return reply.status(400).send({
                    success: false,
                    message: 'Month query parameter is required, format: YYYY-MM'
                });
            }

            const [marketing, dpk] = await Promise.all([
                server.tms.getHandedoverMarketing(server, month),
                server.tms.getHandedoverDPK(server, month),
            ]);

            reply.send({
                success: true,
                message: 'Successfully get dashboard summary',
                data: {
                    handedoverToMarketing: marketing.rows || {},
                    handedoverToDPK: dpk.rows || {},
                }
            });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({
                success: false,
                message: `Failed ${error.message}`
            });
        }
    });


    // ✅ Endpoint data berat (docComplete)
    server.get('/dashboard/doccomplete', async (request, reply) => {
        try {

            const { month } = request.query;
            const doccomplete = await server.tms.getDocStatusCompele(server, month);

            reply.send({
                success: true,
                message: 'Successfully get doc complete',
                data: doccomplete.rows || {}
            });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({
                success: false,
                message: `Failed ${error.message}`
            });
        }
    });

    server.get('/dashboard/notyettomkt', async (request, reply) => {
        try {
            const { month } = request.query;
            const notyettomkt = await server.tms.notYetToMkt(server, month);

            reply.send({
                success: true,
                message: 'Successfully get doc complete',
                data: notyettomkt.rows || {}
            });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({
                success: false,
                message: `Failed ${error.message}`
            });
        }
    });
};
