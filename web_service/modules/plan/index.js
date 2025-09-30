// File: services/plan/index.js (Optimized with Luxon)

import oracleDB from '../../configs/dbOracle.js';
import fp from 'fastify-plugin';
import autoload from '@fastify/autoload';
import { join } from 'desm';
import { DateTime } from 'luxon'; // <-- PERUBAHAN: Impor Luxon

class Plan {
    async getGanttData() {
        let connection;
        try {
            connection = await oracleDB.openConnection();

            // Kueri Tasks dan Links tetap sama seperti skrip PHP
            const sqlTasks = `SELECT ID, TEXT, DESCRIPTION, START_DATE, END_DATE, PLANNED_START, PLANNED_END, DOCSTATUS, PROGRESS, PARENT, COLOR FROM v_jo_gantt_tasks4`;
            const sqlLinks = `
                WITH AllTasks AS (
                    SELECT id, parent, start_date, TO_DATE(start_date, 'DD-MM-YYYY HH24:MI:SS') as start_date_sorted
                    FROM v_jo_gantt_tasks4
                    WHERE DocStatus IS NOT NULL AND start_date IS NOT NULL
                ),
                RankedTasks AS (
                    SELECT id, parent, start_date, start_date_sorted, LEAD(id, 1, NULL) OVER (PARTITION BY parent ORDER BY start_date_sorted ASC, id ASC) as next_task_id FROM AllTasks
                )
                SELECT TO_CHAR(r.id) AS SOURCE, r.start_date AS SOURCE_START_DATE, TO_CHAR(r.next_task_id) AS TARGET, t.start_date AS TARGET_START_DATE
                FROM RankedTasks r JOIN AllTasks t ON r.next_task_id = t.id
                WHERE r.next_task_id IS NOT NULL ORDER BY r.start_date_sorted ASC
            `;

            // Eksekusi kueri secara berurutan (ini adalah bagian yang "lambat")
            const resultTasks = await connection.execute(sqlTasks, [], { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT });
            const rawTasks = resultTasks.rows;
            const resultLinks = await connection.execute(sqlLinks, [], { outFormat: oracleDB.instanceOracleDB.OUT_FORMAT_OBJECT });

            // Proses Links (tetap sama)
            let i = 1;
            const links = resultLinks.rows.map(row => {
                const sourceDate = row.SOURCE_START_DATE.substring(0, 10);
                const targetDate = row.TARGET_START_DATE.substring(0, 10);
                let linkType = "0";
                if (sourceDate === targetDate) { linkType = "1"; }
                return { id: i++, source: row.SOURCE, target: row.TARGET, type: linkType };
            });

            // Proses Tasks dengan Luxon
            const finalTasks = [];
            rawTasks.forEach(task => {
                if (task.DOCSTATUS && task.PLANNED_START) {
                    // PERUBAHAN: Menggunakan Luxon untuk parsing yang lebih andal
                    const plannedStart = DateTime.fromFormat(task.PLANNED_START, "dd-MM-yyyy HH:mm:ss");
                    const actualStart = DateTime.fromFormat(task.START_DATE, "dd-MM-yyyy HH:mm:ss");

                    if (plannedStart.isValid && actualStart.isValid && actualStart > plannedStart) {
                        // Logika Split Task (tetap sama, tapi menggunakan string asli untuk output)
                        finalTasks.push({
                            id: task.ID, text: task.TEXT, parent: task.PARENT, render: 'split', type: 'project',
                            progress: parseFloat(task.PROGRESS) || 0, docstatus: task.DOCSTATUS, description: task.DESCRIPTION, hide_bar: true
                        });
                        finalTasks.push({
                            id: `${task.ID}_gap`, text: 'Delay', start_date: task.PLANNED_START, end_date: task.START_DATE,
                            parent: task.ID, type: 'gap', readonly: true
                        });
                        finalTasks.push({
                            id: `${task.ID}_work`, text: 'Work', start_date: task.START_DATE, end_date: task.END_DATE,
                            parent: task.ID, progress: parseFloat(task.PROGRESS) || 0, color: task.COLOR, readonly: true,
                            constraint_type: 'snet', constraint_date: task.PLANNED_START
                        });
                    } else {
                        // Task Normal
                        finalTasks.push({
                            id: task.ID, text: task.TEXT, start_date: task.START_DATE, end_date: task.END_DATE,
                            progress: parseFloat(task.PROGRESS) || 0, parent: task.PARENT, color: task.COLOR, description: task.DESCRIPTION,
                            docstatus: task.DOCSTATUS, planned_start: task.PLANNED_START, planned_end: task.PLANNED_END,
                            constraint_type: 'snet', constraint_date: task.PLANNED_START
                        });
                    }
                } else {
                    // Parent Task
                    finalTasks.push({
                        id: task.ID, text: task.TEXT, start_date: task.START_DATE, end_date: task.END_DATE,
                        progress: parseFloat(task.PROGRESS) || 0, parent: task.PARENT, color: task.COLOR, description: task.DESCRIPTION,
                        docstatus: task.DOCSTATUS, planned_start: task.PLANNED_START, planned_end: task.PLANNED_END
                    });
                }
            });

            return { data: finalTasks, links };

        } catch (error) {
            console.error('Error in getGanttData:', error);
            throw new Error(`Failed to fetch Gantt data: ${error.message}`);
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) { console.error(e); }
            }
        }
    }
}

// ... (kode plugin Fastify lainnya tetap sama)
async function plan(fastify, opts) {
    fastify.decorate('plan', new Plan());
    fastify.register(autoload, {
        dir: join(import.meta.url, 'routes'),
        options: { prefix: opts.prefix }
    });
}
export default fp(plan);