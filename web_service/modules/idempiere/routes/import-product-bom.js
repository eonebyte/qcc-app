async function importProductBOM(server, opts) {
    server.get('/import-product-bom', async (request, reply) => {
        try {
            const products = await server.idempiere.insertProductWithBOM(server);
            reply.send(products);
        } catch (error) {
            request.log.error(error);
            reply.status(500).send(error.message);
        }
    });
}

export default importProductBOM