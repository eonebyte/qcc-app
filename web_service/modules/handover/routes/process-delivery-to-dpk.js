export default async (server, opts) => {
    server.post('/process/delivery/to/dpk', async (request, reply) => {
        try {
            const body = request.body;
            const userId = request.user.ad_user_id;
            const to_dpk = await server.handover.processDeliveryToDPK(server, body, userId);
            reply.send({ message: 'fetch successfully', data: to_dpk });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/dpk/to/driver', async (request, reply) => {
        try {
            const body = request.body;
            const userId = request.user.ad_user_id;
            const to_dpk = await server.handover.processDPKToDriver(server, body, userId);
            reply.send({ message: 'fetch successfully', data: to_dpk });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/driver/to/customer', async (request, reply) => {
        try {
            const body = request.body;
            const userId = request.user.ad_user_id;
            const to_dpk = await server.handover.processDriverToCustomer(server, body, userId);
            reply.send({ message: 'fetch successfully', data: to_dpk });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/driver/to/customer/do', async (request, reply) => {
        try {
            const body = request.body;
            const userId = request.user.ad_user_id;
            const to_dpk = await server.handover.processDriverToCustomerDo(server, body, userId);
            reply.send({ message: 'fetch successfully', data: to_dpk });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/dpk/to/delivery', async (request, reply) => {
        try {
            const body = request.body;
            const userId = request.user.ad_user_id;
            const result = await server.handover.processDPKToDelivery(server, body, userId);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/delivery/to/mkt', async (request, reply) => {
        try {
            const body = request.body;
            const userId = request.user.ad_user_id;
            const result = await server.handover.processDeliveryToMKT(server, body, userId);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/mkt/to/fat', async (request, reply) => {
        try {
            const body = request.body;
            const userId = request.user.ad_user_id;
            const result = await server.handover.processMKTToFAT(server, body, userId);
            reply.send({ message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}