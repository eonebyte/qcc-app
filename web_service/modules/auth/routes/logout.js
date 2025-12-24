export default async function (fastify, options) {
    fastify.get('/logout', (request, reply) => {
        // Destroy the session
        request.session.delete();
        reply.send({ success: true, message: 'Logged out successfully' });
    });

    fastify.post("/logout/full", async (request, reply) => {
        if (request.session) {
            request.session.delete();
        }

        const opts = {
            path: "/",
            httpOnly: true,   // boleh ada / tidak, tapi disamakan = aman
            secure: false,    // ⬅️ INI PENTING (karena setCookie pakai false)
            sameSite: "lax",  // ⬅️ WAJIB SAMA
        };

        reply.clearCookie("device_id", opts);
        reply.clearCookie("saved_username", opts);

        return reply.send({
            success: true,
            message: "Session & device cleared",
        });
    });


    fastify.get('/logout/oracle', (request, reply) => {
        // Destroy the session
        request.session.delete();
        reply.send({ success: true, message: 'Logged out successfully' });
    });
}