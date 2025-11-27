import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import PdfPrinter from "pdfmake";
// import vfs from "../pdf/fonts/vfs_fonts.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// format ke WIB
const formatDate = (iso) => {
    if (!iso) return "-";
    return dayjs(iso).tz("Asia/Jakarta").format("YYYY-MM-DD");
};

const formatTime = (iso) => {
    if (!iso) return "-";
    return dayjs(iso).tz("Asia/Jakarta").format("HH:mm");
};

export default async (server, opts) => {
    server.get('/listbundle/detail', async (request, reply) => {
        try {
            const { documentno } = request.query;
            const { bundle, listShipment, dataUser, bundleNo, bundleCheckpoint, dateHandover } = await server.tms.listBundleDetail(server, documentno);
            reply.send({ message: 'fetch successfully', data: { bundleAttachment: bundle, listShipment, dataUser, bundleNo, bundleCheckpoint, dateHandover } });
        } catch (error) {
            request.log.error(error);
            reply.status(500).send({ message: `Failed: ${error.message || error}` });
        }
    });
}