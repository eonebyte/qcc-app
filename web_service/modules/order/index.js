import oracleDB from '../../configs/dbOracle.js';
import fp from 'fastify-plugin'
import autoload from '@fastify/autoload'
import { join } from 'desm'

class Order {

    async loadBomGraph(connection) {
        const sql = `
      SELECT 
        mpb.M_PRODUCT_ID       AS PARENT_ID,
        mpb.M_PRODUCTBOM_ID    AS CHILD_ID,
        mpb.BOMQTY             AS BOMQTY,
        CASE WHEN mp2.M_PRODUCT_CATEGORY_ID = 1000002 THEN 1 ELSE 0 END AS IS_RM
      FROM M_PRODUCT_BOM mpb
      JOIN M_PRODUCT mp2 ON mp2.M_PRODUCT_ID = mpb.M_PRODUCTBOM_ID
    `;
        const res = await connection.execute(sql);
        const graph = new Map();
        for (const row of res.rows) {
            const [parentId, childId, bomQty, isRmNum] = row;
            let arr = graph.get(parentId);
            if (!arr) {
                arr = [];
                graph.set(parentId, arr);
            }
            arr.push({ childId, bomQty, isRM: isRmNum === 1 });
        }
        return graph;
    }

    buildRmRequirements(productId, graph, memo, parentQty = 1) {
        // if (memo.has(productId)) return memo.get(productId).map(r => ({ ...r, cumulativeQty: r.cumulativeQty * parentQty }));

        const children = graph.get(productId);
        if (!children || children.length === 0) {
            memo.set(productId, []);
            return [];
        }

        const required = [];
        for (const { childId, bomQty, isRM } of children) {
            if (isRM) {
                required.push({ rmId: childId, cumulativeQty: bomQty * parentQty });
            } else {
                const subReqs = this.buildRmRequirements(childId, graph, memo, bomQty * parentQty);
                for (const sub of subReqs) {
                    required.push(sub);
                }
            }
        }
        // memo.set(productId, required.map(r => ({ ...r, cumulativeQty: r.cumulativeQty / parentQty }))); // cache normalized
        return required;
    }

    async loadDemandData(connection, startDate, endDate) {
        const sql = `
        WITH CombinedData AS (
            SELECT 'F' AS SRC, TO_DATE(NULL) AS MOVEMENTDATE, ol.M_Product_ID, SUM(ol.QtyOrdered) AS QTY, 0 AS QTYNG
            FROM C_Order c
            JOIN C_OrderLine ol ON ol.C_Order_ID = c.C_Order_ID
            JOIN M_Product p ON ol.M_Product_ID = p.M_Product_ID
            WHERE c.DocStatus = 'CO'
                AND c.IsSoTrx = 'Y'
                AND c.C_DOCTYPETARGET_ID IN (1000026, 1000115) -- FO, FPO
                AND c.DateOrdered >= TO_DATE(:startDate, 'YYYY-MM-DD')
                AND c.DateOrdered <  TO_DATE(:endDate, 'YYYY-MM-DD')
                AND p.M_Product_Category_ID IN (1000016, 1000034)
                AND p.IsActive = 'Y'
            GROUP BY ol.M_Product_ID
            HAVING SUM(ol.QtyOrdered) > 0
            UNION ALL
            SELECT 'S', TO_DATE(NULL) AS MOVEMENTDATE, ol.M_Product_ID, SUM(ol.QtyOrdered) AS QTY, 0 AS QTYNG
            FROM C_Order c
            JOIN C_OrderLine ol ON ol.C_Order_ID = c.C_Order_ID
            JOIN M_Product p ON ol.M_Product_ID = p.M_Product_ID
            WHERE c.DocStatus = 'CO'
                AND c.IsSoTrx = 'Y'
                AND c.C_DOCTYPETARGET_ID IN (1000030, 1000053, 1000054) -- Sales
                AND c.DateOrdered >= TO_DATE(:startDate, 'YYYY-MM-DD')
                AND c.DateOrdered <  TO_DATE(:endDate, 'YYYY-MM-DD')
                AND p.M_Product_Category_ID IN (1000016, 1000034)
                AND p.IsActive = 'Y'
            GROUP BY ol.M_Product_ID
            HAVING SUM(ol.QtyOrdered) > 0
            UNION ALL
            SELECT 'P', TO_DATE(NULL) AS MOVEMENTDATE, pp.M_Product_ID, SUM(pp.QTY_OK) AS QTY, SUM(pp.QTY_NG) AS QTYNG
            FROM M_Production m
            JOIN M_ProductionPlan pp ON pp.M_Production_ID = m.M_Production_ID
            JOIN M_Product p ON pp.M_Product_ID = p.M_Product_ID
            WHERE pp.Processed = 'Y'
                AND m.MovementDate >= TO_DATE(:startDate, 'YYYY-MM-DD')
                AND m.MovementDate <  TO_DATE(:endDate, 'YYYY-MM-DD')
                AND p.M_Product_Category_ID IN (1000016, 1000034)
                AND p.IsActive = 'Y'
            GROUP BY pp.M_Product_ID
            HAVING SUM(pp.QTY_OK) > 0
            UNION ALL
            SELECT 'D', TO_DATE(NULL) AS MOVEMENTDATE, iol.M_Product_ID, SUM(iol.MOVEMENTQTY) AS QTY, 0 AS QTYNG
            FROM M_InOut io
            JOIN M_InOutLine iol ON iol.M_INOUT_ID = io.M_INOUT_ID
            JOIN M_Product p ON iol.M_Product_ID = p.M_Product_ID
            WHERE io.ISSOTRX = 'Y'
                AND io.ADW_TMS_ID IS NOT NULL
                AND io.MovementDate >= TO_DATE(:startDate, 'YYYY-MM-DD')
                AND io.MovementDate <  TO_DATE(:endDate, 'YYYY-MM-DD')
                AND p.M_Product_Category_ID IN (1000016, 1000034)
                AND io.M_WAREHOUSE_ID = 1000011 -- Wh Delivery Preparation
                AND p.IsActive = 'Y'
            GROUP BY iol.M_Product_ID
            HAVING SUM(iol.MOVEMENTQTY) > 0
            UNION ALL
            SELECT 'SP', mv.MOVEMENTDATE, mvl.M_Product_ID, SUM(mvl.MOVEMENTQTY) AS QTY, 0 AS QTYNG
            FROM M_Movement mv
            JOIN M_MovementLine mvl ON mvl.M_MOVEMENT_ID = mv.M_MOVEMENT_ID
            JOIN M_Product p ON mvl.M_Product_ID = p.M_Product_ID
            WHERE mv.PROCESSED = 'Y'
                AND mv.MovementDate >= TO_DATE(:startDate, 'YYYY-MM-DD')
                AND mv.MovementDate < TO_DATE(:endDate, 'YYYY-MM-DD')
                AND p.M_Product_Category_ID = 1000002
                AND mv.M_WAREHOUSE_ID = 1000002 -- Wh RM
                AND mv.M_WAREHOUSETO_ID = 1000007 -- Wh Produksi
                AND p.IsActive = 'Y'
            GROUP BY mv.MOVEMENTDATE, mvl.M_Product_ID
            HAVING SUM(mvl.MOVEMENTQTY) > 0
            UNION ALL
            SELECT 'RP', mv.MOVEMENTDATE, mvl.M_Product_ID, SUM(mvl.MOVEMENTQTY) AS QTY, 0 AS QTYNG
            FROM M_Movement mv
            JOIN M_MovementLine mvl ON mvl.M_MOVEMENT_ID = mv.M_MOVEMENT_ID
            JOIN M_Product p ON mvl.M_Product_ID = p.M_Product_ID
            WHERE mv.PROCESSED = 'Y'
                AND mv.MovementDate >= TO_DATE(:startDate, 'YYYY-MM-DD')
                AND mv.MovementDate < TO_DATE(:endDate, 'YYYY-MM-DD')
                AND p.M_Product_Category_ID = 1000002
                AND mv.M_WAREHOUSE_ID = 1000007 -- Wh Produksi
                AND mv.M_WAREHOUSETO_ID = 1000002 -- Wh Rm
                AND p.IsActive = 'Y'
            GROUP BY mv.MOVEMENTDATE, mvl.M_Product_ID
            HAVING SUM(mvl.MOVEMENTQTY) > 0
        )
        SELECT cd.SRC, cd.MOVEMENTDATE, cd.M_Product_ID, mp.VALUE, mp.NAME, cd.QTY, cd.QTYNG
        FROM CombinedData cd
        JOIN M_PRODUCT mp ON cd.M_Product_ID = mp.M_PRODUCT_ID
    `;


        return connection.execute(sql, { startDate, endDate });
    }

    async loadProductDetails(connection, productIds) {
        if (productIds.length === 0) return new Map();

        const bindNames = productIds.map((_, i) => `:id${i}`);
        const sql = `
        SELECT M_PRODUCT_ID, VALUE, NAME
        FROM M_PRODUCT
        WHERE M_PRODUCT_ID IN (${bindNames.join(',')})
        `;
        const binds = {};
        productIds.forEach((id, i) => { binds[`id${i}`] = id; });

        const res = await connection.execute(sql, binds);
        const m = new Map();
        for (const row of res.rows) {
            const [id, val, name] = row;
            m.set(id, { rmKey: val, rmName: name });
        }
        return m;
    }



    // async calculateRmRequirements(startDateStr, endDateStr) {
    //     // Siapkan Date JS untuk bind
    //     const startDate = startDateStr;
    //     const endDate = endDateStr;

    //     const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

    //     let connection;
    //     try {
    //         connection = await oracleDB.openConnection();  // pastikan ini ambil dari pool

    //         // Jalankan demand & BOM secara paralel
    //         const [demandRes, bomGraph] = await Promise.all([
    //             this.loadDemandData(connection, startDate, endDate),
    //             this.loadBomGraph(connection)
    //         ]);

    //         const demandRows = demandRes.rows;
    //         if (demandRows.length === 0) return [];

    //         const memo = new Map();  // explosion cache
    //         const rmAggregator = new Map(); // Map<rmId, {ListFG:Map<fgId,Obj>, supplyProductionQtyKg?:number}>

    //         for (const row of demandRows) {
    //             const [src, movementDate, productId, productKey, productName, productQty, productQtyNg] = row;

    //             if (src === 'SP') {
    //                 if (!rmAggregator.has(productId)) {
    //                     rmAggregator.set(productId, { ListFG: new Map(), supplyProductionQtyKg: 0, returnMovementDate: null, supplyMovementDate: movementDate });
    //                 }
    //                 const agg = rmAggregator.get(productId);
    //                 if (!agg.supplyMovementDate) {
    //                     agg.supplyMovementDate = movementDate;
    //                 }
    //                 agg.supplyProductionQtyKg += productQty;
    //                 continue;
    //             } else if (src === 'RP') {
    //                 if (!rmAggregator.has(productId)) {
    //                     rmAggregator.set(productId, { ListFG: new Map(), returnProductionQtyKg: 0, returnMovementDate: movementDate, supplyMovementDate: null });
    //                 }
    //                 const agg = rmAggregator.get(productId);
    //                 if (!agg.returnMovementDate) {
    //                     agg.returnMovementDate = movementDate;
    //                 }
    //                 agg.returnProductionQtyKg += productQty;
    //                 continue;
    //             }

    //             // explode BOM in memory
    //             const rmReqs = this.buildRmRequirements(productId, bomGraph, memo, productQty);

    //             for (const req of rmReqs) {
    //                 if (!rmAggregator.has(req.rmId)) {
    //                     rmAggregator.set(req.rmId, { ListFG: new Map(), supplyProductionQtyKg: 0, returnProductionQtyKg: 0 });
    //                 }
    //                 const agg = rmAggregator.get(req.rmId);
    //                 if (!agg.ListFG.has(productId)) {
    //                     agg.ListFG.set(productId, {
    //                         fgKey: productKey,
    //                         fgName: productName,
    //                         forecastOrderQtyPcs: 0,
    //                         forecastOrderQtyKg: 0,
    //                         salesOrderQtyPcs: 0,
    //                         salesOrderQtyKg: 0,
    //                         supplyProductionQtyKg: 0,
    //                         productionQtyOkPcs: 0,
    //                         productionQtyOkKg: 0,
    //                         productionQtyNgKg: 0,
    //                         deliveryQtyPcs: 0,
    //                         deliveryQtyKg: 0,
    //                     });
    //                 }
    //                 const fgUsage = agg.ListFG.get(productId);
    //                 switch (src) {
    //                     case 'F':
    //                         fgUsage.forecastOrderQtyPcs += productQty;
    //                         fgUsage.forecastOrderQtyKg += req.cumulativeQty;
    //                         break;
    //                     case 'S':
    //                         fgUsage.salesOrderQtyPcs += productQty;
    //                         fgUsage.salesOrderQtyKg += req.cumulativeQty;
    //                         break;
    //                     case 'P':
    //                         fgUsage.productionQtyOkPcs += productQty;
    //                         fgUsage.productionQtyOkKg += req.cumulativeQty;
    //                         if (productQty > 0) {
    //                             fgUsage.productionQtyNgKg += productQtyNg * (req.cumulativeQty / productQty);
    //                         }
    //                         break;
    //                     case 'D':
    //                         fgUsage.deliveryQtyPcs += productQty;
    //                         fgUsage.deliveryQtyKg += req.cumulativeQty;
    //                         break;
    //                 }
    //             }
    //         }

    //         // Distribusi supplyProduction ke tiap FG yang memakai RM tsb
    //         for (const data of rmAggregator.values()) {
    //             for (const fg of data.ListFG.values()) {
    //                 fg.supplyProductionQtyKg += data.supplyProductionQtyKg || 0;
    //                 fg.returnProductionQtyKg += data.returnProductionQtyKg || 0;
    //             }
    //         }

    //         for (const row of demandRows) {
    //             const [src, movementDate, productId, productKey, productName, productQty, productQtyNg] = row;
    //             if (src === 'SP' && productKey === '1036285') {
    //                 console.log('SP row debug:', { movementDate, productId, productKey, productQty });
    //             }
    //         }


    //         // Ambil detail rmKey/rmName
    //         const allRmIds = Array.from(rmAggregator.keys());
    //         const rmDetailsMap = await this.loadProductDetails(connection, allRmIds);

    //         // Bentuk final
    //         const finalReport = [];
    //         for (const [rmId, data] of rmAggregator.entries()) {
    //             const rmDetails = rmDetailsMap.get(rmId);
    //             if (!rmDetails) continue;
    //             finalReport.push({
    //                 ...rmDetails,
    //                 supplyMovementDate: data.supplyMovementDate,
    //                 returnMovementDate: data.returnMovementDate,
    //                 supplyProductionQtyKg: round2(data.supplyProductionQtyKg),
    //                 returnProductionQtyKg: round2(data.returnProductionQtyKg),
    //                 ListFG: Array.from(data.ListFG.values())
    //                     .map(fg => ({
    //                         ...fg,
    //                         forecastOrderQtyKg: round2(fg.forecastOrderQtyKg),
    //                         salesOrderQtyKg: round2(fg.salesOrderQtyKg),
    //                         productionQtyOkKg: round2(fg.productionQtyOkKg),
    //                         productionQtyNgKg: round2(fg.productionQtyNgKg),
    //                         deliveryQtyKg: round2(fg.deliveryQtyKg)
    //                     }))
    //                     .sort((a, b) => a.fgKey.localeCompare(b.fgKey))
    //             });
    //         }

    //         return finalReport.sort((a, b) => a.rmKey.localeCompare(b.rmKey));
    //     } finally {
    //         if (connection) await connection.close().catch(err => console.error('close conn fail', err));
    //     }
    // }

    async calculateRmRequirements(startDateStr, endDateStr) {
        const startDate = startDateStr;
        const endDate = endDateStr;
        const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

        let connection;
        try {
            connection = await oracleDB.openConnection();

            const [demandRes, bomGraph] = await Promise.all([
                this.loadDemandData(connection, startDate, endDate),
                this.loadBomGraph(connection)
            ]);

            const demandRows = demandRes.rows;
            if (demandRows.length === 0) return [];

            const memo = new Map();
            // --- PERUBAHAN 1: Struktur data utama diubah untuk menampung array ---
            const rmAggregator = new Map(); // Map<rmId, { ListFG: Map, supplies: Array, returns: Array }>

            // Fungsi helper untuk memastikan setiap entri di aggregator memiliki struktur yang benar
            const ensureAggregatorEntry = (rmId) => {
                if (!rmAggregator.has(rmId)) {
                    // Inisialisasi dengan struktur baru yang memiliki array
                    rmAggregator.set(rmId, { ListFG: new Map(), supplies: [], returns: [] });
                }
                return rmAggregator.get(rmId);
            };

            for (const row of demandRows) {
                const [src, movementDate, productId, productKey, productName, productQty, productQtyNg] = row;

                // --- PERUBAHAN 2: Logika untuk SP dan RP diubah menjadi PUSH ke array ---
                if (src === 'SP' || src === 'RP') {
                    const agg = ensureAggregatorEntry(productId);
                    if (src === 'SP') {
                        agg.supplies.push({ movementDate, qty: productQty });
                    } else { // src === 'RP'
                        agg.returns.push({ movementDate, qty: productQty });
                    }
                    continue; // Lanjut ke baris data berikutnya
                }

                // Proses data demand ('F', 'S', 'P', 'D') tetap sama
                const rmReqs = this.buildRmRequirements(productId, bomGraph, memo, productQty);

                for (const req of rmReqs) {
                    // Pastikan raw material juga memiliki entri dengan struktur yang benar
                    const agg = ensureAggregatorEntry(req.rmId);

                    if (!agg.ListFG.has(productId)) {
                        agg.ListFG.set(productId, {
                            fgKey: productKey,
                            fgName: productName,
                            forecastOrderQtyPcs: 0, forecastOrderQtyKg: 0,
                            salesOrderQtyPcs: 0, salesOrderQtyKg: 0,
                            productionQtyOkPcs: 0, productionQtyOkKg: 0,
                            productionQtyNgKg: 0,
                            deliveryQtyPcs: 0, deliveryQtyKg: 0,
                        });
                    }
                    const fgUsage = agg.ListFG.get(productId);
                    switch (src) {
                        case 'F':
                            fgUsage.forecastOrderQtyPcs += productQty;
                            fgUsage.forecastOrderQtyKg += req.cumulativeQty;
                            break;
                        case 'S':
                            fgUsage.salesOrderQtyPcs += productQty;
                            fgUsage.salesOrderQtyKg += req.cumulativeQty;
                            break;
                        case 'P':
                            fgUsage.productionQtyOkPcs += productQty;
                            fgUsage.productionQtyOkKg += req.cumulativeQty;
                            if (productQty > 0) {
                                fgUsage.productionQtyNgKg += productQtyNg * (req.cumulativeQty / productQty);
                            }
                            break;
                        case 'D':
                            fgUsage.deliveryQtyPcs += productQty;
                            fgUsage.deliveryQtyKg += req.cumulativeQty;
                            break;
                    }
                }
            }

            const allRmIds = Array.from(rmAggregator.keys());
            const rmDetailsMap = await this.loadProductDetails(connection, allRmIds);

            // --- PERUBAHAN 3: Bentuk laporan akhir diubah untuk menyertakan array ---
            const finalReport = [];
            for (const [rmId, data] of rmAggregator.entries()) {
                const rmDetails = rmDetailsMap.get(rmId);
                if (!rmDetails) continue;

                const listFgData = Array.from(data.ListFG.values())
                    .map(fg => ({
                        ...fg,
                        forecastOrderQtyKg: round2(fg.forecastOrderQtyKg),
                        salesOrderQtyKg: round2(fg.salesOrderQtyKg),
                        productionQtyOkKg: round2(fg.productionQtyOkKg),
                        productionQtyNgKg: round2(fg.productionQtyNgKg),
                        deliveryQtyKg: round2(fg.deliveryQtyKg)
                    }))
                    .sort((a, b) => a.fgKey.localeCompare(b.fgKey));

                // Bangun objek tunggal untuk setiap RM
                finalReport.push({
                    ...rmDetails, // rmKey, rmName
                    supplies: data.supplies.map(s => ({
                        movementDate: s.movementDate,
                        qty: round2(s.qty)
                    })),
                    returns: data.returns.map(r => ({
                        movementDate: r.movementDate,
                        qty: round2(r.qty)
                    })),
                    ListFG: listFgData
                });
            }

            return finalReport.sort((a, b) => a.rmKey.localeCompare(b.rmKey));
        } finally {
            if (connection) await connection.close().catch(err => console.error('close conn fail', err));
        }
    }
}

async function order(fastify, opts) {
    fastify.decorate('order', new Order())
    fastify.register(autoload, {
        dir: join(import.meta.url, 'routes'),
        options: {
            prefix: opts.prefix
        }
    })
}

export default fp(order)