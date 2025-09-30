export default async (server, opts) => {
    server.get('/drivers', async (request, reply) => {
        try {
            const drivers = await server.tms.getDrivers();
            reply.send({ success: true, count: drivers.length, message: 'fetch successfully', data: drivers });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}