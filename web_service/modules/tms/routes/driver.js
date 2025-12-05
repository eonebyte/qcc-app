export default async (server, opts) => {
    server.get('/drivers', async (request, reply) => {
        try {
            const drivers = await server.tms.getDriversOracle();
            reply.send({ success: true, count: drivers.length, message: 'fetch successfully', data: drivers });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/drivers/capital', async (request, reply) => {
        try {
            const { searchTerm } = request.query;
            const drivers = await server.tms.getDriversOracleCapital(searchTerm);
            reply.send({ success: true, count: drivers.length, message: 'fetch successfully', data: drivers });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}