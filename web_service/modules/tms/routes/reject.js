export default async (server, opts) => {
    server.post('/reject', async (request, reply) => {
        try {
            const body = request.body;
            const result = await server.tms.processReject(server, body);
            reply.send({ success: true, message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ success: false, message: `Failed: ${error.message || error}` });
        }
    });
}