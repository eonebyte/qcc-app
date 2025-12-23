import React, { useEffect, useState, useCallback, useMemo } from "react";
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
    NavBar,
} from "antd-mobile";
import {
    FilterOutline,
    RightOutline,
    CalendarOutline,
} from "antd-mobile-icons";
import { PrinterOutlined, EditOutlined } from '@ant-design/icons';
import { PDFDocument, StandardFonts } from "pdf-lib";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useSelector } from "react-redux";
import { Flex } from "antd";

// Extend dayjs
dayjs.extend(utc);
dayjs.extend(timezone);

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";
const backEndUrlAttachment = import.meta.env.VITE_BACKEND_URL_ATTACHMENT || "http://localhost:3200";

// --- HELPER FUNCTIONS ---
const formatDate = (iso) => iso && iso !== "-" ? dayjs(iso).tz("Asia/Jakarta").format("DD/MM/YYYY") : "-";

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

const HistoryBundleHandoverMobile = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user?.title;

    // --- DATA STATES ---
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sjData, setSjData] = useState({});

    // --- OPTIONS STATES (Oracle) ---
    const [driverOptions, setDriverOptions] = useState([]);
    const [tnkbOptions, setTnkbOptions] = useState([]);

    // --- EDIT & SELECTOR STATES ---
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingBundle, setEditingBundle] = useState(null);
    const [editLoading, setEditLoading] = useState(false);
    const [selectorType, setSelectorType] = useState(null);
    const [searchKeyword, setSearchKeyword] = useState("");

    // --- FILTER STATES (Seperti Receipt Mobile) ---
    const [bundleSearch, setBundleSearch] = useState("");
    const [sjSearch, setSjSearch] = useState("");
    const [driverSearch, setDriverSearch] = useState("");
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);

    // --- UI STATES ---
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isPdfOpen, setIsPdfOpen] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [processingId, setProcessingId] = useState(null);

    const [pickerStartVisible, setPickerStartVisible] = useState(false);
    const [pickerEndVisible, setPickerEndVisible] = useState(false);

    // --- LOGIC ROLE CHECKPOINT ---
    let cPoint, cPointSecond;
    switch (role) {
        case "delivery": cPoint = 2; cPointSecond = 10; break;
        case "dpk": cPoint = 4; cPointSecond = 8; break;
        case "driver": cPoint = 6; break;
        case "marketing": cPoint = 12; break;
        default: break;
    }

    // Fungsi untuk mendapatkan nama TNKB (Plat Nomor)
    const getTnkbName = (record) => {
        // 1. Jika sudah ada string nama TNKB dari backend, gunakan itu
        if (record.tnkb && record.tnkb !== "-") return record.tnkb;

        // 2. Jika tidak ada, cari di daftar opsi berdasarkan tnkb_id
        const found = tnkbOptions.find(opt => opt.ADW_TMS_TNKB_ID === record.tnkb_id);
        return found ? found.NAME : "-";
    };

    const loadData = useCallback(async (filters = {}) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append("checkpoint", cPoint || "");
            if (cPointSecond) params.append("checkpoint_second", cPointSecond);

            // Filter Params
            params.append("bundle_no", filters.bundle || bundleSearch || "");
            if (filters.sj) params.append("sj_no", filters.sj);
            if (filters.driver) params.append("driver", filters.driver);
            if (filters.startDate) params.append("start_date", filters.startDate);
            if (filters.endDate) params.append("end_date", filters.endDate);

            const res = await fetch(`${backEndUrl}/tms/listbundle?${params.toString()}`, { credentials: "include" });
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
        const fetchOptions = async () => {
            try {
                const [resD, resT] = await Promise.all([
                    fetch(`${backEndUrl}/tms/drivers`, { credentials: "include" }),
                    fetch(`${backEndUrl}/tms/tnkbs`, { credentials: "include" })
                ]);
                const jsonD = await resD.json();
                const jsonT = await resT.json();
                setDriverOptions(jsonD.data || []);
                setTnkbOptions(jsonT.data || []);
            } catch (err) {
                console.error("Error load options");
                console.log(err);

            }
        };
        fetchOptions();
    }, [loadData]);

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

    const loadSJ = async (bundleId) => {
        if (sjData[bundleId]) return;
        try {
            const res = await fetch(`${backEndUrl}/tms/listbundle/${bundleId}/sj`, { credentials: "include" });
            const json = await res.json();
            setSjData((prev) => ({ ...prev, [bundleId]: json.data }));
        } catch (error) { console.error(error); }
    };

    const filteredList = useMemo(() => {
        const keyword = searchKeyword.toLowerCase();
        if (selectorType === 'driver') return driverOptions.filter(d => d.name?.toLowerCase().includes(keyword));
        if (selectorType === 'tnkb') return tnkbOptions.filter(t => t.NAME?.toLowerCase().includes(keyword));
        return [];
    }, [searchKeyword, selectorType, driverOptions, tnkbOptions]);

    const handleSaveEdit = async () => {
        setEditLoading(true);
        try {
            const payload = {
                adw_handover_group_id: editingBundle.key,
                driver_id: editingBundle.ad_user_id,
                driver_name: editingBundle.driver_name,
                tnkb_id: editingBundle.ADW_TMS_TNKB_ID,
                tnkb_name: editingBundle.tnkb_name,
            };
            const res = await fetch(`${backEndUrl}/tms/update/dkp/to/driver`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include",
            });
            if (res.ok) {
                Toast.show({ content: "Data bundle diperbarui", icon: "success" });
                setIsEditOpen(false);
                loadData();
                setSjData({});
            }
        } catch (err) {
            Toast.show("Gagal update"); console.log(err);
        }
        finally { setEditLoading(false); }
    };

    const handlePrint = async (e, record) => {
        e.stopPropagation();
        setProcessingId(record.key);
        try {
            const response = await fetch(`${backEndUrlAttachment}/files/handover/${record.attachment}`);
            const existingPdfBytes = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const pdfBytes = await pdfDoc.save();
            setPdfUrl(URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" })));
            setIsPdfOpen(true);
        } catch (error) {
            Toast.show("Gagal proses PDF"); console.log(error);
        }
        finally { setProcessingId(null); }
    };

    return (
        <div style={{ background: "#f5f5f5", minHeight: "100vh", paddingBottom: 20 }}>
            {/* Header Search & Filter Icon */}
            <div style={{ background: "#fff", padding: "12px", position: "sticky", top: 0, zIndex: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                    <SearchBar
                        placeholder="Cari No. Bundle"
                        value={bundleSearch}
                        onChange={setBundleSearch}
                        onSearch={handleApplyFilter}
                        onClear={handleResetFilter}
                    />
                </div>
                <Button onClick={() => setIsFilterOpen(true)} fill="none" style={{ fontSize: 22, padding: 0 }}>
                    <FilterOutline color="var(--adm-color-primary)" />
                </Button>
            </div>

            <div style={{ padding: "12px" }}>
                {loading && data.length === 0 ? <AutoCenter><SpinLoading color="primary" /></AutoCenter> :
                    data.map((item) => {
                        const isWaiting = !item.received || item.received === "-";
                        const canEdit = Number(item.checkpoint) === 4;
                        return (
                            <Card key={item.key} style={{ marginBottom: 12, borderRadius: 12 }}>
                                <Flex justify="space-between" align="center">
                                    <div style={{ fontWeight: "bold", fontSize: 16 }}>{highlightText(item.documentno, bundleSearch)}</div>
                                    <Tag color={isWaiting ? "warning" : "success"}>{isWaiting ? "Waiting" : "Done"}</Tag>
                                </Flex>

                                <div style={{ fontSize: 13, color: '#666', lineHeight: '1.6', marginTop: 8 }}>
                                    <div>Dari: <b>{item.fromactor}</b> | Tujuan: <b>{item.toactor}</b></div>
                                    <div>Driver: <b>{highlightText(item.drivername || "-", driverSearch)}</b></div>
                                    <div>TNKB: <b>{getTnkbName(item)}</b></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#999' }}>
                                        <span>Total: {item.total_shipments} SJ</span>
                                        <span>Handover: {formatDate(item.created)}</span>
                                    </div>
                                </div>

                                <div style={{ marginTop: 10 }}>
                                    <Collapse onChange={(key) => key.length > 0 && loadSJ(item.key)}>
                                        <Collapse.Panel key="sj" title={<span style={{ fontSize: 12, color: "#1677ff" }}>Lihat Detail Surat Jalan</span>}>
                                            <List style={{ "--font-size": "12px" }}>
                                                {sjData[item.key] ? sjData[item.key].map((sj) => (
                                                    <List.Item key={sj.adw_trackingsj_id}>
                                                        <b>{highlightText(sj.documentno, sjSearch)}</b> <br />
                                                        Cust: {sj.customer || '-'}
                                                    </List.Item>
                                                )) : <AutoCenter><SpinLoading size="small" /></AutoCenter>}
                                            </List>
                                        </Collapse.Panel>
                                    </Collapse>
                                </div>

                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                                    {isWaiting && canEdit && (
                                        <Button size="small" color="warning" fill="outline" onClick={() => {
                                            setEditingBundle({
                                                ...item,
                                                ad_user_id: item.driver_id,
                                                driver_name: item.drivername,
                                                ADW_TMS_TNKB_ID: item.tnkb_id,
                                                tnkb_name: item.tnkb
                                            });
                                            setIsEditOpen(true);
                                        }}><EditOutlined /> Edit</Button>
                                    )}
                                    <Button size="small" color="primary" fill="outline" loading={processingId === item.key}
                                        disabled={isWaiting || (processingId !== null && processingId !== item.key)} onClick={(e) => handlePrint(e, item)}>
                                        <PrinterOutlined /> Cetak
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
            </div>

            {/* --- POPUP FILTER LANJUTAN --- */}
            <Popup visible={isFilterOpen} onMaskClick={() => setIsFilterOpen(false)} position="right" bodyStyle={{ width: '80vw' }}>
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ padding: 16, borderBottom: '1px solid #eee', fontWeight: 'bold', fontSize: 18 }}>Filter Lanjutan</div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
                        <Form layout="vertical">
                            <Form.Item label="No Surat Jalan (SJ)">
                                <Input placeholder="Masukkan No SJ" value={sjSearch} onChange={setSjSearch} />
                            </Form.Item>
                            <Form.Item label="Nama Driver">
                                <Input placeholder="Masukkan Driver" value={driverSearch} onChange={setDriverSearch} />
                            </Form.Item>
                            <Form.Item label="Tanggal Mulai">
                                <Button onClick={() => setPickerStartVisible(true)} fill="outline" block style={{ textAlign: 'left' }}>
                                    {startDate ? dayjs(startDate).format("DD/MM/YYYY") : "Pilih Tanggal"}
                                </Button>
                                <DatePicker visible={pickerStartVisible} onClose={() => setPickerStartVisible(false)} onConfirm={setStartDate} />
                            </Form.Item>
                            <Form.Item label="Tanggal Akhir">
                                <Button onClick={() => setPickerEndVisible(true)} fill="outline" block style={{ textAlign: 'left' }}>
                                    {endDate ? dayjs(endDate).format("DD/MM/YYYY") : "Pilih Tanggal"}
                                </Button>
                                <DatePicker visible={pickerEndVisible} onClose={() => setPickerEndVisible(false)} onConfirm={setEndDate} />
                            </Form.Item>
                        </Form>
                    </div>
                    <div style={{ padding: 16, borderTop: '1px solid #eee' }}>
                        <Button color="primary" block onClick={handleApplyFilter} style={{ marginBottom: 10 }}>Terapkan</Button>
                        <Button block onClick={handleResetFilter} fill="none" color="weak">Reset Semua</Button>
                    </div>
                </div>
            </Popup>

            {/* --- POPUP EDIT BUNDLE --- */}
            <Popup visible={isEditOpen} onMaskClick={() => setIsEditOpen(false)} position="right" bodyStyle={{ width: "100vw" }}>
                <NavBar onBack={() => setIsEditOpen(false)}>Edit Transportasi</NavBar>
                <div style={{ padding: 16 }}>
                    <Form layout="vertical">
                        <Form.Item label="Nomor Bundle"><Input value={editingBundle?.documentno} disabled /></Form.Item>
                        <Form.Item label="Driver Pengirim">
                            <div style={{ padding: '12px', border: '1px solid #ddd', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}
                                onClick={() => { setSelectorType('driver'); setSearchKeyword(""); }}>
                                <span>{editingBundle?.driver_name || "Pilih Driver"}</span>
                                <RightOutline color="#ccc" />
                            </div>
                        </Form.Item>
                        <Form.Item label="Unit Kendaraan (TNKB)">
                            <div style={{ padding: '12px', border: '1px solid #ddd', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}
                                onClick={() => { setSelectorType('tnkb'); setSearchKeyword(""); }}>
                                <span>{editingBundle?.tnkb_name || "Pilih TNKB"}</span>
                                <RightOutline color="#ccc" />
                            </div>
                        </Form.Item>
                        <div style={{ marginTop: 32 }}>
                            <Button block color="primary" size="large" loading={editLoading} onClick={handleSaveEdit}>Simpan Perubahan</Button>
                        </div>
                    </Form>
                </div>
            </Popup>

            {/* --- SEARCHABLE SELECTOR POPUP --- */}
            <Popup visible={!!selectorType} onMaskClick={() => setSelectorType(null)} position="bottom" bodyStyle={{ height: "85vh", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <div style={{ padding: 16, background: '#fff' }}>
                        <SearchBar placeholder={`Cari ${selectorType === 'driver' ? 'Nama Driver' : 'Plat Nomor'}...`} onChange={setSearchKeyword} autoFocus />
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        <List>
                            {filteredList.map(opt => (
                                <List.Item key={selectorType === 'driver' ? opt.ad_user_id : opt.ADW_TMS_TNKB_ID}
                                    onClick={() => {
                                        if (selectorType === 'driver') {
                                            setEditingBundle({ ...editingBundle, ad_user_id: opt.ad_user_id, driver_name: opt.name });
                                        } else {
                                            setEditingBundle({ ...editingBundle, ADW_TMS_TNKB_ID: opt.ADW_TMS_TNKB_ID, tnkb_name: opt.NAME });
                                        }
                                        setSelectorType(null);
                                    }}>
                                    {selectorType === 'driver' ? opt.name : opt.NAME}
                                </List.Item>
                            ))}
                        </List>
                    </div>
                    <div style={{ padding: 16, background: '#f5f5f5' }}>
                        <Button block onClick={() => setSelectorType(null)}>Batal</Button>
                    </div>
                </div>
            </Popup>

            {/* --- PDF VIEW POPUP --- */}
            <Popup visible={isPdfOpen} onMaskClick={() => setIsPdfOpen(false)} bodyStyle={{ height: "95vh" }}>
                <NavBar onBack={() => setIsPdfOpen(false)}>Pratinjau PDF</NavBar>
                <iframe src={pdfUrl} style={{ width: "100%", height: "100%", border: "none" }} />
            </Popup>
        </div>
    );
};

export default HistoryBundleHandoverMobile;