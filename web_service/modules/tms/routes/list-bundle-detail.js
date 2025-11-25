export default async (server, opts) => {
    server.get('/listbundle/detail', async (request, reply) => {
        try {
            const { documentno } = request.query;
            const { bundle, listShipment, dataUser, bundleNo, bundleCheckpoint } = await server.tms.listBundleDetail(server, documentno);
            reply.send({ message: 'fetch successfully', data: { bundleAttachment: bundle, listShipment, dataUser, bundleNo, bundleCheckpoint } });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}