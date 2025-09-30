export default async (server, opts) => {
    server.get('/tnkbs', async (request, reply) => {
        try {
            const tnkbs = await server.tms.getTnkbs();
            reply.send({ success: true, count: tnkbs.length, message: 'fetch successfully', data: tnkbs });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}