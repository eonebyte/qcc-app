export default async (server, opts) => {
    server.get('/listbundle', async (request, reply) => {
        try {
            const { checkpoint, checkpoint_second, bundle_no } = request.query;

            const list_bundle = await server.tms.listBundle(server, checkpoint, checkpoint_second, bundle_no);
            reply.send({ message: 'fetch successfully', data: list_bundle });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });

    server.get("/listbundle/:id/sj", async (req, reply) => {
        const bundleId = req.params.id;

        console.log('b id : ', bundleId);
        
        const data = await server.tms.listBundleSJ(server, bundleId);
        return reply.send({ data });
    });

}