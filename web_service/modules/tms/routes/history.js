export default async (server, opts) => {
    server.get('/history', async (request, reply) => {
        try {
            const page = parseInt(request.query.page) || 1;
            const pageSize = parseInt(request.query.limit) || 10;

            const { startDate, endDate, docNo } = request.query;

            const to_dpk = await server.tms.getHistory3(server, page, pageSize, startDate, endDate, docNo);
            reply.send({ message: 'fetch successfully', data: to_dpk });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

}