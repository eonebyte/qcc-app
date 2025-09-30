// src/plugins/auth-hook.js
import fp from 'fastify-plugin';

export default fp(async (fastify, opts) => {
    // Hook ini berjalan untuk SETIAP permintaan SETELAH plugin sesi
    fastify.addHook('preHandler', (request, reply, done) => {
        // Jika request.session ada (dari plugin session), maka ambil data user
        if (request.session) {
            const user = request.session.get('user');
            console.log('Auth Hook - Retrieved user from session:', user);
            
            request.user = user || null;
        } else {
            // Jika plugin session belum berjalan atau gagal, pastikan request.user ada
            request.user = null;
        }
        done();
    });
});