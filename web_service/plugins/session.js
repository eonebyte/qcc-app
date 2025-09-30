// src/plugins/session.js
import fp from 'fastify-plugin';
import secureSession from '@fastify/secure-session';
import fs from 'node:fs';
import { join } from 'desm';

// fp() memastikan plugin ini tidak di-enkapsulasi,
// sehingga request.session tersedia untuk semua modul lain.
export default fp(async (fastify, opts) => {
    fastify.register(secureSession, {
        sessionName: 'session',
        key: fs.readFileSync(join(import.meta.url, '..', 'eonebyte')), // Path dari plugins/ kembali ke root
        cookie: {
            path: '/',
            httpOnly: true,
        }
    });
});