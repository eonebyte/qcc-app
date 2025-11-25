export default async (server, opts) => {
    server.get('/month', async (request, reply) => {
        try {
            // const { role } = request.query;
            // const { month } = request.query;
            // if (!month) {
            //     return reply.status(400).send({
            //         success: false,
            //         message: 'Month query parameter is required, format: YYYY-MM'
            //     });
            // }

            const today = await server.tms.dataDashboard(server);


            reply.send({
                success: true,
                message: 'Successfully get today summary',
                data: today || {},

            });

        } catch (error) {
            console.log(error);
            reply.status(500).send({
                success: false,
                message: `Failed ${error.message}`
            });
        }
    });
}