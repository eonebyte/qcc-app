import fs from 'fs';
import path from 'path';
import { finished } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

export default async (server, opts) => {
    server.post('/bundle/:documentno', async (request, reply) => {
        let dbClient;
        try {
            dbClient = await server.pg.connect();
            const { documentno } = request.params;
            const data = await request.file();

            if (!data) {
                return reply.status(400).send({ success: false, message: 'No file uploaded' });
            }

            // Path folder upload relatif ke root project: web_service/uploads/handover
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const uploadDir = path.join(__dirname, '../../../uploads/handover'); // naik 3 level dari routes
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            // Generate nama file unik
            const ext = path.extname(data.filename);
            const newFileName = uuidv4() + ext;
            const filePath = path.join(uploadDir, newFileName);

            // Simpan file
            const fileStream = fs.createWriteStream(filePath);
            data.file.pipe(fileStream);
            await finished(fileStream);

            // Simpan nama file di DB
            await dbClient.query(
                `UPDATE adw_handover_group 
                 SET attachment = $1
                 WHERE documentno = $2`,
                [newFileName, documentno]
            );

            reply.send({ success: true, filename: newFileName, original: data.filename });
        } catch (err) {
            console.error('Upload failed:', err);
            reply.status(500).send({ success: false, message: 'Upload failed', error: err.message });
        } finally {
            if (dbClient) dbClient.release();
        }
    });


    server.delete('/bundle/:documentno', async (request, reply) => {
        let dbClient;
        try {
            dbClient = await server.pg.connect();
            const { documentno } = request.params;

            // Ambil nama file attachment dari DB
            const { rows } = await dbClient.query(
                `SELECT attachment FROM adw_handover_group WHERE documentno = $1`,
                [documentno]
            );

            if (!rows.length || !rows[0].attachment) {
                return reply.status(404).send({ success: false, message: 'Attachment not found' });
            }

            const fileName = rows[0].attachment;

            // Path file di server
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const filePath = path.join(__dirname, '../../../uploads/handover', fileName);

            // Hapus file dari disk
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Update DB: set attachment null
            await dbClient.query(
                `UPDATE adw_handover_group SET attachment = NULL WHERE documentno = $1`,
                [documentno]
            );

            reply.send({ success: true, message: 'Attachment deleted successfully' });

        } catch (err) {
            console.error('Delete failed:', err);
            reply.status(500).send({ success: false, message: 'Delete failed', error: err.message });
        } finally {
            if (dbClient) dbClient.release();
        }
    });
};
