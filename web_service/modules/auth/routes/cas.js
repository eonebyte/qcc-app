export default async function (fastify, options) {
    fastify.get('/cas', async (request, reply) => {
        const user = request.user;

        console.log('auth user secure:', request.user);

        if (user) {
            reply.send({ success: true, user });
        } else {
            reply.code(401).send({ success: false, message: 'Not authenticated' });
        }
    });

    fastify.get('/cas/oracle', async (request, reply) => {
        const user = request.user;

        console.log('auth user secure:', request.user);

        if (user) {
            reply.send({ success: true, user });
        } else {
            reply.code(401).send({ success: false, message: 'Not authenticated' });
        }
    });
}