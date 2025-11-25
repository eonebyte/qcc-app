export default async (server, opts) => {
    server.get('/receipt', async (request, reply) => {
        try {
            const { role } = request.query;
            const to_dpk = await server.tms.getReceipt2(server, role);
            reply.send({ message: 'fetch successfully', data: to_dpk });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}