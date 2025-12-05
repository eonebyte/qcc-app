export default async (server, opts) => {
    server.get('/list/sj/bydriver', async (request, reply) => {
        try {
            const { driver_id } = request.query;

            const list_sj = await server.tms.listSJByDriver(server, driver_id);
            reply.send({ message: 'fetch successfully', data: list_sj });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}