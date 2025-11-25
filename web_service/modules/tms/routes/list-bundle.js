export default async (server, opts) => {
    server.get('/listbundle', async (request, reply) => {
        try {
            const { checkpoint, checkpoint_second } = request.query;

            const list_bundle = await server.tms.listBundle(server, checkpoint, checkpoint_second);
            reply.send({ message: 'fetch successfully', data: list_bundle });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}