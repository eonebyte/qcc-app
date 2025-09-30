export default async (server, opts) => {
    server.post('/accepted', async (request, reply) => {
        try {
            const { data } = request.body;
            const { checkpoint } = request.query;
            const userId = request.user.id;

            const accepted = await server.tms.setAccepted(server, data, userId, checkpoint);
            reply.send(accepted);
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}