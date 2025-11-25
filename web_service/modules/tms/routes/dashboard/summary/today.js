export default async (server, opts) => {
    server.get('/today', async (request, reply) => {
        console.log('req user : ', request.user);
        
        try {
            if (!request.user) {
                // Jika tidak ada user (belum login), kirim error 401 dan hentikan eksekusi
                reply.code(401).send({
                    success: false,
                    message: 'Unauthorized: Anda harus login untuk mengakses sumber daya ini.'
                });
                return; // Penting: hentikan eksekusi lebih lanjut
            }
            // const { role } = request.query;
            const today = await server.tms.summaryDay(server);

            const waitingFromDPK = today.handoverDeliveryToDPKComplete - today.receiptDeliveryFromDPKComplete;
            const notYetToMkt = today.receiptDeliveryFromDPKComplete - today.handoverDeliveryToMktComplete;
            const doneMkt = today.handoverDeliveryToMktComplete;
            const notYetToDPK = today.handoverDeliveryToDPKPrepare;


            reply.send({
                success: true,
                message: 'Successfully get today summary',
                // data: today || {},
                data: {
                    waitingFromDPK: waitingFromDPK < 0 ? 0 : waitingFromDPK,
                    notYetToMkt: notYetToMkt < 0 ? 0 : notYetToMkt,
                    doneMkt: doneMkt < 0 ? 0 : doneMkt,
                    notYetToDPK: notYetToDPK < 0 ? 0 : notYetToDPK,
                }

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