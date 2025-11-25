export default async (server, opts) => {
    server.get('/outstanding', async (request, reply) => {
        try {
            const { role } = request.query;
            const outstandings = await server.tms.listOutstanding(server, role);
            reply.send({ message: 'fetch successfully', data: outstandings });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}