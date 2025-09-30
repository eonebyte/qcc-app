export default async (server, opts) => {
    server.get('/listhandover', async (request, reply) => {
        try {
            const { role } = request.query;
            const to_dpk = await server.tms.listHandover(server, role);
            reply.send({ message: 'fetch successfully', data: to_dpk });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}