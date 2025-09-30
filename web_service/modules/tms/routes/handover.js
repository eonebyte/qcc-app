// file: routes/..../handover.js

export default async (server, opts) => {
    server.post('/handover', async (request, reply) => {
        try {
            const { checkpoint } = request.query;
            const body = request.body;
            const userId = request.user.id;

            const result = await server.tms.toHandover(server, body, userId, checkpoint);

            reply.send({ message: 'Handover process successful.', data: result });

        } catch (error) {
            request.log.error(error);
            // Jika error memiliki status code (misal: dari validasi), gunakan itu.
            const statusCode = error.statusCode || 500;
            reply.status(statusCode).send({ message: `Failed: ${error.message || error}` });
        }
    });
}