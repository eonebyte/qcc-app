import React, { useEffect, useState } from "react";
import {
    Card,
    Button,
    Tag,
    SearchBar,
    Collapse,
    List,
    Popup,
    Toast,
    AutoCenter,
    SpinLoading
} from "antd-mobile";

import { PrinterOutlined } from '@ant-design/icons';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useSelector } from "react-redux";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';
const backEndUrlAttachment = import.meta.env.VITE_BACKEND_URL_ATTACHMENT || 'http://localhost:3200';

dayjs.extend(utc);
dayjs.extend(timezone);

const formatDate = (iso) => iso ? dayjs(iso).tz("Asia/Jakarta").format("DD/MM/YYYY") : "-";

const HistoryBundleReceiptMobile = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user?.title;

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sjData, setSjData] = useState({});

    const [bundleSearch, setBundleSearch] = useState("");

    // PDF States
    const [isPdfOpen, setIsPdfOpen] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [processingPdf, setProcessingPdf] = useState(false);

    // --- LOGIC ROLE CHECKPOINT (RECEIPT) ---
    let cPoint, cPointSecond;
    switch (role) {
        case "delivery": cPoint = 8; break;
        case "dpk": cPoint = 2; cPointSecond = 6; break;
        case "driver": cPoint = 4; break;
        case "marketing": cPoint = 10; cPointSecond = 11; break;
        case "fat": cPoint = 12; cPointSecond = 13; break;
        default: break;
    }

    // --- FETCH DATA BUNDLE ---
    const loadData = async (searchVal = "") => {
        setLoading(true);
        try {
            const url = new URL(`${backEndUrl}/tms/listbundle`);
            if (cPoint) url.searchParams.set("checkpoint", cPoint);
            if (cPointSecond) url.searchParams.set("checkpoint_second", cPointSecond);
            if (searchVal) url.searchParams.set("bundle_no", searchVal);

            const res = await fetch(url, { credentials: "include" });
            const json = await res.json();

            const mapped = json.data.map(item => ({
                key: item.adw_handover_group_id,
                ...item
            }));

            setData(mapped);
        } catch (err) {
            console.error("Error fetching:", err);
            Toast.show({ content: 'Gagal load data', icon: 'fail' });
        } finally {
            setLoading(false);
        }
    };

    // --- FETCH DETAIL SJ (On Expand) ---
    const loadSJ = async (bundleId) => {
        if (sjData[bundleId]) return;
        try {
            const res = await fetch(`${backEndUrl}/tms/listbundle/${bundleId}/sj`, { credentials: "include" });
            const json = await res.json();
            setSjData(prev => ({
                ...prev,
                [bundleId]: json.data
            }));
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // --- PDF PRINT LOGIC (Sama dengan Handover) ---
    const handlePrint = async (e, record) => {
        e.stopPropagation();

        const isWaiting = !record.received || record.received === "-";
        if (isWaiting) {
            Toast.show('Dokumen belum diterima');
            return;
        }
        if (!record.attachment) {
            Toast.show('File PDF tidak ditemukan');
            return;
        }

        try {
            setProcessingPdf(true);
            Toast.show({ icon: 'loading', content: 'Processing PDF...', duration: 0 });

            const staticUrl = `${backEndUrlAttachment}/files/handover/${record.attachment}`;
            const response = await fetch(staticUrl);
            if (!response.ok) throw new Error("Gagal download PDF");

            const existingPdfBytes = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

            const pages = pdfDoc.getPages();
            const firstPage = pages[0];
            const { height } = firstPage.getSize();
            const printDate = dayjs().tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm") + " WIB";

            firstPage.drawText(`Print Date: ${printDate}`, {
                x: 40, y: height - 15, size: 8, font: helveticaFont, color: rgb(0, 0, 0),
            });

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const objectUrl = URL.createObjectURL(blob);

            setPdfUrl(objectUrl);
            setIsPdfOpen(true);
            Toast.clear();

        } catch (error) {
            console.error(error);
            Toast.show({ content: 'Gagal proses PDF', icon: 'fail' });
        } finally {
            setProcessingPdf(false);
        }
    };

    return (
        <div>
            <div style={{ padding: '0 12px 12px' }}>
                <SearchBar
                    placeholder="Cari Bundle No..."
                    value={bundleSearch}
                    onChange={val => {
                        setBundleSearch(val);
                        if (!val) loadData("");
                    }}
                    onSearch={() => loadData(bundleSearch)}
                />
            </div>

            {loading ? <AutoCenter>
                <SpinLoading color='primary' />
            </AutoCenter> : (
                <div style={{ padding: '0 12px' }}>
                    {data.map((item) => {
                        const isWaiting = !item.received || item.received === "-";

                        return (
                            <Card key={item.key} style={{ marginBottom: 12, borderRadius: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: 16 }}>{item.documentno}</div>
                                    <Tag color={isWaiting ? 'warning' : 'success'}>
                                        {isWaiting ? 'Waiting' : 'Completed'}
                                    </Tag>
                                </div>

                                <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>From: {item.fromactor}</span>
                                        <span>Total: {item.total_shipments} SJ</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                        <span>Handover: {formatDate(item.created)}</span>
                                        <span>Receipt: {formatDate(item.received)}</span>
                                    </div>
                                </div>

                                <Collapse onChange={(key) => { if (key.length > 0) loadSJ(item.key) }}>
                                    <Collapse.Panel key='sj' title={`Lihat Detail SJ (${item.total_shipments})`}>
                                        <List>
                                            {sjData[item.key] ? (
                                                sjData[item.key].map(sj => (
                                                    <List.Item key={sj.adw_trackingsj_id} style={{ fontSize: 12 }}>
                                                        <div style={{ fontWeight: 600 }}>{sj.documentno}</div>
                                                        <div style={{ color: '#888' }}>Driver: {sj.drivername}</div>
                                                    </List.Item>
                                                ))
                                            ) : (
                                                <AutoCenter>Loading SJ...</AutoCenter>
                                            )}
                                        </List>
                                    </Collapse.Panel>
                                </Collapse>

                                <div style={{ borderTop: '1px solid #eee', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button
                                        size="small"
                                        color="primary"
                                        fill="outline"
                                        disabled={isWaiting || processingPdf}
                                        onClick={(e) => handlePrint(e, item)}
                                    >
                                        <PrinterOutlined />
                                    </Button>
                                </div>
                            </Card>
                        )
                    })}
                    {data.length === 0 && <AutoCenter>Tidak ada data.</AutoCenter>}
                </div>
            )}

            <Popup
                visible={isPdfOpen}
                onMaskClick={() => setIsPdfOpen(false)}
                bodyStyle={{ height: '90vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
            >
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: 12, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 'bold' }}>Preview PDF</span>
                        <Button size="mini" onClick={() => setIsPdfOpen(false)}>Close</Button>
                    </div>
                    {pdfUrl && (
                        <iframe src={pdfUrl} style={{ width: '100%', flex: 1, border: 'none' }} title="PDF" />
                    )}
                </div>
            </Popup>
        </div>
    );
};

export default HistoryBundleReceiptMobile;