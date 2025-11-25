export default async (server, opts) => {
    server.post('/process/dpk/from/delivery', async (request, reply) => {
        try {
            const { data: bundles } = request.body;
            const userId = request.user.ad_user_id;
            const result = await server.receipt.processDPKFromDelivery(server, bundles, userId);
            reply.send({ success: true, message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/driver/from/dpk', async (request, reply) => {
        try {
            const { data: bundles } = request.body;
            const userId = request.user.ad_user_id;
            const result = await server.receipt.processDriverFromDPK(server, bundles, userId);
            reply.send({ success: true, message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/dpk/from/driver', async (request, reply) => {
        try {
            const { data: bundles } = request.body;
            const userId = request.user.ad_user_id;
            const result = await server.receipt.processDPKFromDriver(server, bundles, userId);
            reply.send({ success: true, message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/delivery/from/dpk', async (request, reply) => {
        try {
            const { data: bundles } = request.body;
            const userId = request.user.ad_user_id;
            const result = await server.receipt.processDeliveryFromDPK(server, bundles, userId);
            reply.send({ success: true, message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/mkt/from/delivery', async (request, reply) => {
        try {
            const { data: bundles } = request.body;
            const userId = request.user.ad_user_id;
            const result = await server.receipt.processMKTFromDelivery(server, bundles, userId);
            reply.send({ success: true, message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.post('/process/fat/from/mkt', async (request, reply) => {
        try {
            const { data: bundles } = request.body;
            const userId = request.user.ad_user_id;
            const result = await server.receipt.processFATFromMKT(server, bundles, userId);
            reply.send({ success: true, message: 'fetch successfully', data: result });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}