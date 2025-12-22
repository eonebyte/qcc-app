import React, { useEffect, useState, useCallback } from "react";
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
    SpinLoading,
    Space,
    DatePicker,
    Input,
    Form,
} from "antd-mobile";
import {
    FilterOutline,
    FileOutline,
    SearchOutline,
    CalendarOutline,
} from "antd-mobile-icons";
import { PrinterOutlined } from '@ant-design/icons';
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useSelector } from "react-redux";
import { Flex } from "antd";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";
const backEndUrlAttachment =
    import.meta.env.VITE_BACKEND_URL_ATTACHMENT || "http://localhost:3200";

dayjs.extend(utc);
dayjs.extend(timezone);

const formatDate = (iso) =>
    iso ? dayjs(iso).tz("Asia/Jakarta").format("DD/MM/YYYY") : "-";

const HistoryBundleHandoverMobile = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user?.title;

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sjData, setSjData] = useState({});

    // Filter States
    const [bundleSearch, setBundleSearch] = useState("");
    const [sjSearch, setSjSearch] = useState("");
    const [driverSearch, setDriverSearch] = useState("");
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);

    // UI States
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isPdfOpen, setIsPdfOpen] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [processingId, setProcessingId] = useState(null);

    const [pickerStartVisible, setPickerStartVisible] = useState(false);
    const [pickerEndVisible, setPickerEndVisible] = useState(false);

    // --- LOGIC ROLE ---
    let cPoint, cPointSecond;
    switch (role) {
        case "delivery": cPoint = 2; cPointSecond = 10; break;
        case "dpk": cPoint = 4; cPointSecond = 8; break;
        case "driver": cPoint = 6; break;
        case "marketing": cPoint = 12; break;
        default: break;
    }

    const loadData = useCallback(async (filters = {}) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append("checkpoint", cPoint || "");
            if (cPointSecond) params.append("checkpoint_second", cPointSecond);

            // Menggunakan bundleSearch dari state atau parameter
            params.append("bundle_no", filters.bundle || bundleSearch || "");
            if (filters.sj) params.append("sj_no", filters.sj);
            if (filters.driver) params.append("driver", filters.driver);
            if (filters.startDate) params.append("start_date", filters.startDate);
            if (filters.endDate) params.append("end_date", filters.endDate);

            const res = await fetch(`${backEndUrl}/tms/listbundle?${params.toString()}`, {
                credentials: "include",
            });
            const json = await res.json();
            setData(json.data.map((item) => ({ key: item.adw_handover_group_id, ...item })));
        } catch (err) {
            console.log(err);

            Toast.show({ content: "Gagal load data", icon: "fail" });
        } finally {
            setLoading(false);
        }
    }, [cPoint, cPointSecond, bundleSearch]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const loadSJ = async (bundleId) => {
        if (sjData[bundleId]) return;
        try {
            const res = await fetch(`${backEndUrl}/tms/listbundle/${bundleId}/sj`, { credentials: "include" });
            const json = await res.json();
            setSjData((prev) => ({ ...prev, [bundleId]: json.data }));
        } catch (error) { console.error(error); }
    };

    const handleApplyFilter = () => {
        setIsFilterOpen(false);
        loadData({
            bundle: bundleSearch,
            sj: sjSearch,
            driver: driverSearch,
            startDate: startDate ? dayjs(startDate).format("YYYY-MM-DD") : "",
            endDate: endDate ? dayjs(endDate).format("YYYY-MM-DD") : "",
        });
    };

    const handleResetFilter = () => {
        setBundleSearch("");
        setSjSearch("");
        setDriverSearch("");
        setStartDate(null);
        setEndDate(null);
        setIsFilterOpen(false);
        loadData({ bundle: "", sj: "", driver: "", startDate: "", endDate: "" });
    };

    const highlightText = (text, query) => {
        if (!query || !text) return text;
        const parts = text.toString().split(new RegExp(`(${query})`, "gi"));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === query.toLowerCase()
                        ? <mark key={i} style={{ backgroundColor: "#ffc069", padding: 0 }}>{part}</mark>
                        : part
                )}
            </span>
        );
    };

    const handlePrint = async (e, record) => {
        e.stopPropagation();
        if (!record.received || record.received === "-") {
            return Toast.show("Dokumen belum diterima");
        }
        try {
            setProcessingId(record.key);
            const response = await fetch(`${backEndUrlAttachment}/files/handover/${record.attachment}`);
            const existingPdfBytes = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const firstPage = pdfDoc.getPages()[0];
            const printDate = dayjs().tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm") + " WIB";
            firstPage.drawText(`Print Date: ${printDate}`, { x: 40, y: firstPage.getSize().height - 15, size: 8, font: helveticaFont, color: rgb(0, 0, 0) });

            const pdfBytes = await pdfDoc.save();
            setPdfUrl(URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" })));
            setIsPdfOpen(true);
        } catch (error) {
            console.log(error);

            Toast.show({ content: "Gagal proses PDF", icon: "fail" });
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div style={{ background: "#f5f5f5", minHeight: "100vh", paddingBottom: 20 }}>
            {/* Search Header */}
            <div style={{ background: "#fff", padding: "12px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
                <Flex align="center">
                    <div style={{ flex: 1, marginRight: 8 }}>
                        <SearchBar
                            placeholder="Cari Bundle..."
                            value={bundleSearch}
                            onChange={setBundleSearch}
                            onSearch={handleApplyFilter}
                        />
                    </div>
                    <Button
                        onClick={() => setIsFilterOpen(true)}
                        color="primary"
                        fill="none"
                        style={{ fontSize: 22, padding: 0 }}
                    >
                        <FilterOutline />
                    </Button>
                </Flex>
            </div>

            {loading && data.length === 0 ? (
                <AutoCenter style={{ marginTop: 50 }}><SpinLoading color="primary" /></AutoCenter>
            ) : (
                <div style={{ padding: "12px" }}>
                    {data.map((item) => {
                        const isWaiting = !item.received || item.received === "-";
                        return (
                            <Card key={item.key} style={{ marginBottom: 12, borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                    <div style={{ fontWeight: "bold", fontSize: 17, color: "#333" }}>
                                        {highlightText(item.documentno, bundleSearch)}
                                    </div>
                                    <Tag color={isWaiting ? "warning" : "success"} style={{ borderRadius: 6 }}>
                                        {isWaiting ? "Waiting" : "Completed"}
                                    </Tag>
                                </div>

                                <div style={{ fontSize: 13, color: "#777", lineHeight: "1.8" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span>Tujuan: <b>{item.toactor}</b></span>
                                        <span>Total: <b>{item.total_shipments} SJ</b></span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span>Handover: {formatDate(item.created)}</span>
                                        <span>Diterima: {formatDate(item.received)}</span>
                                    </div>
                                </div>

                                <div style={{ marginTop: 10 }}>
                                    <Collapse onChange={(key) => key.length > 0 && loadSJ(item.key)}>
                                        <Collapse.Panel key="sj" title={<span style={{ fontSize: 13, color: "#1677ff" }}>Detail Surat Jalan</span>}>
                                            <List style={{ "--font-size": "13px" }}>
                                                {sjData[item.key] ? (
                                                    sjData[item.key].map((sj) => (
                                                        <List.Item key={sj.adw_trackingsj_id} description={`Driver: ${sj.drivername ? sj.drivername : '-'}`}>
                                                            {highlightText(sj.documentno, sjSearch)}
                                                        </List.Item>
                                                    ))
                                                ) : (
                                                    <div style={{ textAlign: "center", padding: 10 }}><SpinLoading size="small" /></div>
                                                )}
                                            </List>
                                        </Collapse.Panel>
                                    </Collapse>
                                </div>

                                <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 10, paddingTop: 10, textAlign: "right" }}>
                                    <Button
                                        size="middle"
                                        color="primary"
                                        fill="outline"
                                        loading={processingId === item.key}
                                        disabled={isWaiting || (processingId !== null && processingId !== item.key)}
                                        onClick={(e) => handlePrint(e, item)}
                                        style={{ borderRadius: 8 }}
                                    >
                                        <PrinterOutlined /> Cetak
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                    {data.length === 0 && <AutoCenter style={{ color: "#999", marginTop: 40 }}>Data tidak ditemukan</AutoCenter>}
                </div>
            )}

            {/* Advanced Filter Popup */}
            <Popup
                visible={isFilterOpen}
                onMaskClick={() => setIsFilterOpen(false)}
                position="right"
                bodyStyle={{ width: "80vw" }}
            >
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ padding: 16, borderBottom: "1px solid #eee", fontWeight: "bold", fontSize: 18 }}>
                        Filter Lanjutan
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
                        <Form layout="vertical">
                            <Form.Item label="Nomor Surat Jalan (SJ)">
                                <Input placeholder="Masukkan No SJ" value={sjSearch} onChange={setSjSearch} />
                            </Form.Item>
                            <Form.Item label="Nama Driver">
                                <Input placeholder="Masukkan Nama Driver" value={driverSearch} onChange={setDriverSearch} />
                            </Form.Item>
                            <Form.Item label="Tanggal Mulai">
                                <Button onClick={() => setPickerStartVisible(true)} fill="outline" block style={{ textAlign: "left" }}>
                                    {startDate ? dayjs(startDate).format("DD/MM/YYYY") : "Pilih Tanggal"}
                                </Button>
                                <DatePicker
                                    visible={pickerStartVisible}
                                    onClose={() => setPickerStartVisible(false)}
                                    onConfirm={setStartDate}
                                />
                            </Form.Item>
                            <Form.Item label="Tanggal Akhir">
                                <Button onClick={() => setPickerEndVisible(true)} fill="outline" block style={{ textAlign: "left" }}>
                                    {endDate ? dayjs(endDate).format("DD/MM/YYYY") : "Pilih Tanggal"}
                                </Button>
                                <DatePicker
                                    visible={pickerEndVisible}
                                    onClose={() => setPickerEndVisible(false)}
                                    onConfirm={setEndDate}
                                />
                            </Form.Item>
                        </Form>
                    </div>
                    <div style={{ padding: 16, borderTop: "1px solid #eee" }}>
                        <Space block direction="vertical">
                            <Button color="primary" block onClick={handleApplyFilter}>Terapkan Filter</Button>
                            <Button block onClick={handleResetFilter} fill="none" color="weak">Reset Semua</Button>
                        </Space>
                    </div>
                </div>
            </Popup>

            {/* PDF View Popup */}
            <Popup
                visible={isPdfOpen}
                onMaskClick={() => setIsPdfOpen(false)}
                bodyStyle={{ height: "95vh", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
            >
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: 12, borderBottom: "1px solid #eee", textAlign: "right" }}>
                        <Button size="small" fill="none" onClick={() => setIsPdfOpen(false)} color="primary">Selesai</Button>
                    </div>
                    <iframe src={pdfUrl} style={{ width: "100%", flex: 1, border: "none" }} />
                </div>
            </Popup>
        </div>
    );
};

export default HistoryBundleHandoverMobile;