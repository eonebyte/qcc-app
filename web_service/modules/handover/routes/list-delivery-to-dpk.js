export default async (server, opts) => {
    server.get('/list/delivery/to/dpk', async (request, reply) => {
        try {
            const result = await server.handover.listDeliveryToDPK(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/dpk/to/driver', async (request, reply) => {
        try {
            const result = await server.handover.listDPKToDriver(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/checkin/customer', async (request, reply) => {
        try {
            const result = await server.handover.listCheckInCustomer(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/checkin/customer/do', async (request, reply) => {
        try {
            const result = await server.handover.listCheckInCustomerDo(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });


    server.get('/list/dpk/to/delivery', async (request, reply) => {
        try {
            const result = await server.handover.listDPKToDelivery(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/delivery/to/mkt', async (request, reply) => {
        try {
            const result = await server.handover.listDeliveryToMKT(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get('/list/mkt/to/fat', async (request, reply) => {
        try {
            const result = await server.handover.listMKTToFAT(server);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}