export default async (server, opts) => {
    server.get('/history', async (request, reply) => {
        try {
            const page = request.query.page ? parseInt(request.query.page) : 1;
            const pageSize = request.query.limit !== undefined ? parseInt(request.query.limit) : 10;

            const { startDate, endDate, docNo, customer } = request.query;

            const to_dpk = await server.tms.getHistory3(server, page, pageSize, startDate, endDate, docNo, customer);
            reply.send({ message: 'fetch successfully', data: to_dpk });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

}