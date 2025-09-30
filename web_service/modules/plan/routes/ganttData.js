export default async function ganttData(fastify, opts) {
    fastify.get('/gantt-data', async (request, reply) => {
        try {
            const ganttData = await fastify.plan.getGanttData();
            reply.send(ganttData);
        } catch (error) {
            request.log.error(error);
            reply.status(500).send(error.message);
        }
    });
}