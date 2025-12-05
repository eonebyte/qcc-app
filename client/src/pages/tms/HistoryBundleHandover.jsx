import { useEffect, useState } from "react";
import { Table, Button, Tabs, Card, notification, Badge, Tag, Modal, Spin, message } from "antd";
import { AndroidOutlined, AppleOutlined, DownloadOutlined, FileSyncOutlined, PrinterOutlined, SearchOutlined, SyncOutlined } from "@ant-design/icons";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import * as XLSX from "xlsx";
pdfMake.vfs = pdfFonts.vfs;
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useSelector } from "react-redux";
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';


const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';
const backEndUrlAttachment = import.meta.env.VITE_BACKEND_URL_ATTACHMENT || 'http://localhost:3200';


dayjs.extend(utc);
dayjs.extend(timezone);

// fungsi format
const formatDate = (iso) => {
    if (!iso) return "-";
    // convert ke WIB dan format YYYY-MM-DD
    return dayjs(iso).tz("Asia/Jakarta").format("YYYY-MM-DD");
};
const HistoryBundleHandover = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user.title;
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [pdfBlobUrl, setPdfBlobUrl] = useState(null); // URL untuk iframe
    const [processingPdf, setProcessingPdf] = useState(false); // Loading saat edit PDF

    const [bundleSearch, setBundleSearch] = useState("");


    const handleSearchBundle = () => {
        if (!bundleSearch.trim()) {
            message.warning("Masukkan Bundle No untuk filter");
            return;
        }

        loadData(bundleSearch); // ⬅ langsung ke server
    };


    const handleResetFilter = () => {
        setBundleSearch("");
        loadData(""); // tanpa parameter → fetch semua data
    };


    useEffect(() => {
        loadData();
    }, []);

    let cPoint;
    let cPointSecond;

    switch (role) {
        case "delivery": // delivery handover chekcpoint menjadi 2
            cPoint = 2;
            cPointSecond = 10;
            break;
        case "dpk": // delivery handover chekcpoint menjadi 4
            cPoint = 4;
            cPointSecond = 8;
            break;
        case "driver":
            cPoint = 6;
            break;
        case "marketing":
            cPoint = 12;
            break;
        default:
            break;
    }


    const loadData = async () => {
        try {
            setLoading(true)
            const res = await fetch(`${backEndUrl}/tms/listbundle?checkpoint=${cPoint}&checkpoint_second=${cPointSecond}`,
                { credentials: "include", }
            );
            const json = await res.json();


            const mapped = json.data.map(item => ({
                key: item.adw_handover_group_id,
                documentno: item.documentno,
                created: item.created,
                createdby: item.createdby,
                received: item.received,
                receivedby: item.receivedby,
                total_shipments: item.total_shipments,
                attachment: item.attachment
            }));

            setData(mapped);
        } catch (err) {
            console.error("Error fetching:", err);
        } finally {
            setLoading(false)
        }
    };

    const handlePrint = async (record) => {
        // 1. Validasi
        const isWaiting = !record.received || record.received === "-";
        if (isWaiting) {
            notification.warning({
                message: "Belum Bisa Dicetak",
                description: "Dokumen belum diterima. Silakan lakukan proses penerimaan dahulu.",
            });
            return;
        }

        if (!record.attachment) {
            notification.error({ message: "File PDF tidak ditemukan pada data ini." });
            return;
        }

        try {
            setProcessingPdf(true);

            // 2. Fetch File Statis dari Backend
            // Pastikan URL path statisnya benar sesuai config fastify static Anda
            const staticUrl = `${backEndUrlAttachment}/files/handover/${record.attachment}`;

            const response = await fetch(staticUrl);
            if (!response.ok) throw new Error("Gagal mengunduh file PDF asli");

            // Ambil data binary (ArrayBuffer)
            const existingPdfBytes = await response.arrayBuffer();

            // 3. Load ke PDF-Lib (Frontend Processing)
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

            // 4. Tambahkan Text Print Date di Halaman Pertama
            const pages = pdfDoc.getPages();
            const firstPage = pages[0];
            // const { height } = firstPage.getSize(); // jika butuh koordinat dinamis

            const printDate = dayjs().tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm") + " WIB";

            const { height } = firstPage.getSize();

            firstPage.drawText(`Print Date: ${printDate}`, {
                x: 40,
                y: height - 15, // Posisi dari bawah kertas
                size: 8,
                font: helveticaFont,
                color: rgb(0, 0, 0),
            });

            // 5. Simpan Hasil Edit menjadi Blob
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });

            // 6. Buat URL Object sementara
            const objectUrl = URL.createObjectURL(blob);
            setPdfBlobUrl(objectUrl);

            // 7. Buka Modal
            setIsModalOpen(true);

        } catch (error) {
            console.error(error);
            notification.error({
                message: "Gagal Memproses PDF",
                description: error.message
            });
        } finally {
            setProcessingPdf(false);
        }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        // Bersihkan memory URL agar tidak memory leak
        if (pdfBlobUrl) {
            URL.revokeObjectURL(pdfBlobUrl);
            setPdfBlobUrl(null);
        }
    };

    const exportExcel = () => {
        if (!data || data.length === 0) {
            message.warning("Tidak ada data untuk diexport");
            return;
        }

        // 1. Siapkan data untuk Excel
        const excelData = data.map((item, index) => ({
            No: index + 1,
            "Bundle No": item.documentno,
            "Total Shipments": item.total_shipments,
            "Date Handover": formatDate(item.created),
            "Date Receipt": formatDate(item.received),
            Status:
                !item.received || item.received === "-" || item.received === ""
                    ? "Waiting Receipt"
                    : "Completed",
        }));

        // 2. Convert JSON → Sheet
        const worksheet = XLSX.utils.json_to_sheet(excelData);

        // 3. Buat workbook
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "History Delivery");

        // 4. Nama file
        const filename = `History_Delivery_${dayjs().format(
            "YYYYMMDD_HHmmss"
        )}.xlsx`;

        // 5. Export file
        XLSX.writeFile(workbook, filename);
    };


    const columns = [
        {
            title: "No",
            key: "no",
            width: 70,
            align: "center",
            render: (text, record, index) => index + 1,
        },
        {
            title: "Bundle No",
            dataIndex: "documentno",
            render: (value) => (
                <b>{value}</b>
                // <a href={`/history/detail?documentno=${value}`}>
                //     <b>{value}</b>
                // </a>
            ),
        },
        {
            title: "Total Shipments",
            dataIndex: "total_shipments",
            align: "center",
        },
        {
            title: "Date Handover",
            dataIndex: "created",
            align: "center",
            render: (value) => formatDate(value),
        },
        {
            title: "Date Receipt",
            dataIndex: "received",
            align: "center",
            render: (value) => formatDate(value),
        },
        {
            title: "Status",
            align: "center",
            render: (_, record) => {
                const waiting =
                    record.received == null ||
                    record.received === "-" ||
                    record.received === "";

                if (waiting) {
                    return (
                        <Tag color="gold">Waiting Receipt</Tag>
                    );
                }

                return (
                    <Tag color="green">Completed</Tag>
                );
            }
        },
        {
            title: "Actions",
            dataIndex: "actions",
            align: "center",
            render: (text, record) => (
                <Button
                    icon={<PrinterOutlined />}
                    type="primary"
                    onClick={() => handlePrint(record)}
                    loading={processingPdf} // Loading saat fetch & edit pdf
                    disabled={loading}
                >
                    Print
                </Button>
            )
        }
    ];

    return (
        <>
            <div style={{ marginBottom: 10, marginLeft: 10, display: "flex", gap: 10 }}>
                {/* Input Filter Bundle */}
                <input
                    type="text"
                    placeholder="Cari Bundle No..."
                    value={bundleSearch}
                    onChange={(e) => setBundleSearch(e.target.value)}
                    style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #ccc",
                        width: 200
                    }}
                />

                {/* Tombol Search */}
                <Button icon={<SearchOutlined />} type="primary" onClick={handleSearchBundle}>
                </Button>


                <Button icon={<SyncOutlined />} type="default" onClick={handleResetFilter}>
                </Button>

                <Button icon={<DownloadOutlined />} type="default" onClick={exportExcel}>
                </Button>


            </div>
            <Table
                loading={loading}
                columns={columns}
                dataSource={data}
                pagination={{ pageSize: 10 }}
            />
            <Modal
                styles={{ content: { padding: 10 } }}
                title="Preview Document"
                open={isModalOpen}
                onCancel={handleCloseModal}
                footer={[
                    <Button key="close" onClick={handleCloseModal}>
                        Close
                    </Button>
                ]}
                width={1000} // Lebar modal
                style={{ top: 20 }}
            >
                {pdfBlobUrl ? (
                    <iframe
                        src={pdfBlobUrl}
                        width="100%"
                        height="600px"
                        style={{ border: "none" }}
                        title="PDF Preview"
                    />
                ) : (
                    <div style={{ textAlign: 'center', padding: 50 }}>
                        <Spin tip="Generating PDF Preview..." />
                    </div>
                )}
            </Modal>
        </>
    );
};

export default HistoryBundleHandover;
