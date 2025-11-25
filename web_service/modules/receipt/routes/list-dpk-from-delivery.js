export default async (server, opts) => {
    server.get('/list/dpk/from/delivery', async (request, reply) => {
        try {
            const result = await server.receipt.listDPKFromDelivery(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/driver/from/dpk', async (request, reply) => {
        try {
            const result = await server.receipt.listDriverFromDPK2(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/dpk/from/driver', async (request, reply) => {
        try {
            const result = await server.receipt.listDPKFromDriver(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/delivery/from/dpk', async (request, reply) => {
        try {
            const result = await server.receipt.listDeliveryFromDPK(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/mkt/from/delivery', async (request, reply) => {
        try {
            const result = await server.receipt.listMKTFromDelivery(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/fat/from/mkt', async (request, reply) => {
        try {
            const result = await server.receipt.listFATFromMKT(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

}