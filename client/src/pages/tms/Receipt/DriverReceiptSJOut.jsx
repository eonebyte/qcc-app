import React, { useEffect, useState, useMemo } from "react";
import {
    Card,
    Button,
    SearchBar,
    Checkbox,
    Dialog,
    Toast,
    List,
    AutoCenter,
    PullToRefresh,
    Popup,
    CheckList,
    SpinLoading,
    Tabs,
    Space,
    DatePicker,
    Collapse,
} from "antd-mobile";
import {
    SendOutline,
    CalendarOutline,
    UserOutline,
    TruckOutline,
    CheckOutline,
} from "antd-mobile-icons";
import { InboxOutlined } from '@ant-design/icons';
import dayjs from "dayjs";
import axios from "axios";
import { useSelector } from "react-redux";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

// --- UNIFIED STYLES ---
const styles = {
    tabContainer: {
        backgroundColor: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    },
    filterSection: {
        padding: "12px",
        background: "#f9f9f9",
        borderBottom: "1px solid #eee",
    },
    cardShipment: (checked) => ({
        marginBottom: "12px",
        borderRadius: "12px",
        border: "1px solid #f0f0f0",
        borderLeft: checked ? "6px solid #52c41a" : "6px solid #1677ff",
        boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
        backgroundColor: checked ? "#f6ffed" : "#fff",
        transition: "all 0.3s ease",
    }),
    documentNo: (checked) => ({
        fontSize: "20px",
        fontWeight: "900",
        color: checked ? "#52c41a" : "#1677ff",
        marginBottom: "4px",
        fontFamily: "'Roboto Mono', monospace",
        letterSpacing: "0.5px",
    }),
    customerName: {
        fontSize: "14px",
        fontWeight: "700",
        color: "#333",
    },
    floatingFooter: {
        position: "fixed",
        bottom: "65px",
        left: "16px",
        right: "16px",
        zIndex: 1000,
    },
    actionButton: {
        borderRadius: "25px",
        height: "50px",
        fontSize: "16px",
        fontWeight: "bold",
        boxShadow: "0 8px 20px rgba(22, 119, 255, 0.3)",
    },
};

// ==========================================
// TAB 1: DELIVERY (Handover DPK to Driver)
// ==========================================
const DeliveryTab = () => {
    const user = useSelector((state) => state.auth.user);
    const [dataList, setDataList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState([]);
    const [tnkbs, setTnkbs] = useState([]);
    const [selectedDriverId, setSelectedDriverId] = useState(user?.ad_user_id);
    const [selectedTnkbId, setSelectedTnkbId] = useState(null);
    const [isTnkbPopupOpen, setIsTnkbPopupOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    // FILTER STATES
    const [mainSearchText, setMainSearchText] = useState("");
    const [selectedDate, setSelectedDate] = useState(null);
    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

    const [tnkbSearchText, setTnkbSearchText] = useState("");

    useEffect(() => {
        if (user?.ad_user_id) setSelectedDriverId(user.ad_user_id);
    }, [user]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const resp = await axios.get(`${backEndUrl}/handover/list/dpk/to/driver/bypass`, { withCredentials: true });
            setDataList(resp.data.data.data || []);
        } catch (err) {
            console.log(err);
            Toast.show({ content: "Gagal mengambil data", icon: "fail" });
        } finally {
            setLoading(false);
        }
    };

    const fetchMasterData = async () => {
        try {
            const [tnkbsRes] = await Promise.all([
                axios.get(`${backEndUrl}/tms/tnkbs`, { withCredentials: true }),
            ]);
            if (tnkbsRes.data?.success) setTnkbs(tnkbsRes.data.data.map(t => ({ label: t.NAME, value: t.ADW_TMS_TNKB_ID })));
        } catch (err) { console.error(err); }
    };

    useEffect(() => { fetchData(); fetchMasterData(); }, []);

    // LOGIC FILTERING (TEXT & DATE)
    const filteredData = useMemo(() => {
        const searchLower = mainSearchText.toLowerCase();
        return dataList.filter(item => {
            const matchesText = !mainSearchText || (
                item.documentno?.toLowerCase().includes(searchLower) ||
                item.customer?.toLowerCase().includes(searchLower)
            );
            const matchesDate = !selectedDate ||
                dayjs(item.plantime).isSame(dayjs(selectedDate), 'day');

            return matchesText && matchesDate;
        });
    }, [dataList, mainSearchText, selectedDate]);

    const toggleSelection = (key) => {
        setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const handleSubmit = async () => {
        if (!selectedTnkbId) {
            Toast.show({ content: "TNKB wajib dipilih!", icon: "fail" });
            return;
        }
        try {
            const payload = {
                data: dataList.filter(item => selectedKeys.includes(item.m_inout_id)),
                driverId: user.ad_user_id || selectedDriverId,
                driverName: user.name,
                tnkbId: selectedTnkbId,
            };
            
            const res = await axios.post(`${backEndUrl}/handover/process/dpk/to/driver/bypass`, payload, { withCredentials: true });
            if (res.data.data?.updatedCount > 0) {
                Toast.show({ content: "Handover Berhasil!", icon: "success" });
                setIsConfirmOpen(false);
                setSelectedKeys([]);
                setSelectedTnkbId(null);
                fetchData();
            }
        } catch (err) {
            console.log(err);
            Toast.show("Submit Gagal");
        }
    };

    return (
        <div>
            {/* FILTER SECTION SYNCED WITH DPK TAB */}
            <div style={styles.filterSection}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <SearchBar
                        placeholder="Cari SJ / Customer"
                        value={mainSearchText}
                        onChange={setMainSearchText}
                        style={{ flex: 1 }}
                    />
                    <Button
                        onClick={() => setIsDatePickerVisible(true)}
                        style={{
                            borderRadius: 8,
                            background: selectedDate ? '#e6f7ff' : '#f0f0f0',
                            border: 'none'
                        }}
                    >
                        <CalendarOutline fontSize={20} color={selectedDate ? '#1677ff' : '#666'} />
                    </Button>
                </div>

                <Checkbox
                    checked={filteredData.length > 0 && selectedKeys.length === filteredData.length}
                    indeterminate={selectedKeys.length > 0 && selectedKeys.length < filteredData.length}
                    onChange={() => {
                        if (selectedKeys.length === filteredData.length) setSelectedKeys([]);
                        else setSelectedKeys(filteredData.map(i => i.m_inout_id));
                    }}
                >
                    Pilih Semua ({selectedKeys.length}/{filteredData.length})
                </Checkbox>
            </div>

            <PullToRefresh onRefresh={fetchData}>
                <div style={{ padding: 12, paddingBottom: 110 }}>
                    {loading && <AutoCenter><SpinLoading /></AutoCenter>}
                    {!loading && filteredData.length === 0 && (
                        <AutoCenter style={{ marginTop: 20 }}>
                            <InboxOutlined style={{ fontSize: 48, color: '#ccc' }} />
                            <div style={{ color: '#999', marginTop: 8 }}>Data tidak ditemukan</div>
                        </AutoCenter>
                    )}
                    {filteredData.map((item) => (
                        <Card key={item.m_inout_id} style={styles.cardShipment(selectedKeys.includes(item.m_inout_id))}>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                <Checkbox checked={selectedKeys.includes(item.m_inout_id)} onChange={() => toggleSelection(item.m_inout_id)} />
                                <div style={{ flex: 1 }}>
                                    <div style={styles.documentNo(selectedKeys.includes(item.m_inout_id))}>{item.documentno}</div>
                                    <div style={styles.customerName}>{item.customer}</div>
                                    <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                                        <CalendarOutline /> {item.plantime ? dayjs(item.plantime).format("DD-MM-YYYY HH:mm") : "-"}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </PullToRefresh>

            <DatePicker
                visible={isDatePickerVisible}
                onClose={() => setIsDatePickerVisible(false)}
                onConfirm={setSelectedDate}
            />

            {selectedKeys.length > 0 && (
                <div style={styles.floatingFooter}>
                    <Button block color="primary" style={styles.actionButton} onClick={() => setIsConfirmOpen(true)}>
                        <SendOutline /> LANJUT ({selectedKeys.length})
                    </Button>
                </div>
            )}

            {/* POPUP SELECTORS (Driver & TNKB) */}
            <Dialog
                visible={isConfirmOpen}
                title="Konfirmasi Handover"
                content={
                    <div style={{ marginTop: 10 }}>
                        <List>
                            <List.Item
                                prefix={<UserOutline />}
                                extra={user?.name || "User tidak ditemukan"}
                            >
                                Driver (Terpilih)
                            </List.Item>
                            <List.Item prefix={<TruckOutline />} onClick={() => setIsTnkbPopupOpen(true)} extra={tnkbs.find(t => t.value === selectedTnkbId)?.label || "Pilih..."} clickable>TNKB</List.Item>
                        </List>
                    </div>
                }
                actions={[[
                    { key: "cancel", text: "Batal", onClick: () => setIsConfirmOpen(false) },
                    { key: "submit", text: "Submit", bold: true, onClick: handleSubmit },
                ]]}
            />

            <Popup visible={isTnkbPopupOpen} onMaskClick={() => setIsTnkbPopupOpen(false)} bodyStyle={{ height: "60vh", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <SearchBar placeholder="Cari TNKB..." value={tnkbSearchText} onChange={setTnkbSearchText} />
                    <div style={{ flex: 1, overflowY: 'auto', marginTop: 10 }}>
                        <CheckList value={selectedTnkbId ? [selectedTnkbId] : []} onChange={val => { setSelectedTnkbId(val[0]); setIsTnkbPopupOpen(false); }}>
                            {tnkbs.filter(t => t.label.toLowerCase().includes(tnkbSearchText.toLowerCase())).map(t => (
                                <CheckList.Item key={t.value} value={t.value}>{t.label}</CheckList.Item>
                            ))}
                        </CheckList>
                    </div>
                </div>
            </Popup>
        </div>
    );
};

// ==========================================
// TAB 2: DPK (Driver Receipt from DPK)
// ==========================================
const DPKTab = ({ userName }) => {
    const [dataList, setDataList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [filterDate, setFilterDate] = useState(null);
    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/receipt/list/driver/from/dpk`, { withCredentials: true });
            const processed = (res.data.data?.data || [])
                .filter(b => b.drivername === userName)
                .map(b => ({
                    ...b,
                    key: b.bundleNo,
                    shipments: b.shipments.map(s => ({ ...s, key: s.m_inout_id, checked: false, clickCount: 0 })),
                    bundleSelected: false
                })).filter(b => b.shipments.length > 0);
            setDataList(processed);
        } catch (e) {
            console.log(e);
            Toast.show("Gagal ambil data");
        }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const filteredData = useMemo(() => {
        const lowerSearch = searchText.toLowerCase();
        return dataList.map(bundle => {
            const matchSj = bundle.shipments.filter(s => {
                const t = !searchText || s.documentno.toLowerCase().includes(lowerSearch) || s.customer?.toLowerCase().includes(lowerSearch);
                const d = !filterDate || dayjs(s.plantime).isSame(dayjs(filterDate), 'day');
                return t && d;
            });
            if (!filterDate && bundle.bundleNo.toLowerCase().includes(lowerSearch)) return bundle;
            return matchSj.length > 0 ? { ...bundle, shipments: matchSj } : null;
        }).filter(b => b !== null);
    }, [dataList, searchText, filterDate]);

    const handleCheck = (bundleNo, sjKey) => {
        setDataList(prev => prev.map(b => {
            if (b.bundleNo !== bundleNo) return b;
            return {
                ...b,
                shipments: b.shipments.map(s => {
                    if (s.key !== sjKey) return s;
                    if (!s.checked) return { ...s, checked: true, clickCount: 0 };
                    const count = s.clickCount + 1;
                    return count >= 3 ? { ...s, checked: false, clickCount: 0 } : { ...s, clickCount: count };
                })
            };
        }));
    };

    const handleSubmit = () => {
        const selected = dataList.filter(b => b.bundleSelected);
        Dialog.confirm({
            title: 'Konfirmasi DPK',
            content: `Terima ${selected.length} Bundle?`,
            confirmText: 'Ok',
            cancelText: 'Batal',
            onConfirm: async () => {
                const payload = { data: selected.map(b => ({ ...b, shipments: b.shipments.filter(s => s.checked) })) };
                await axios.post(`${backEndUrl}/receipt/process/driver/from/dpk`, payload, { withCredentials: true });
                Toast.show("Berhasil!");
                fetchData();
            }
        });
    };

    return (
        <div>
            <div style={styles.filterSection}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <SearchBar placeholder="Cari SJ / Customer..." value={searchText} onChange={setSearchText} style={{ flex: 1 }} />
                    <Button onClick={() => setIsDatePickerVisible(true)} style={{ borderRadius: 8, background: filterDate ? '#e6f7ff' : '#f0f0f0', border: 'none' }}>
                        <CalendarOutline fontSize={20} color={filterDate ? '#1677ff' : '#666'} />
                    </Button>
                </div>
            </div>

            <PullToRefresh onRefresh={fetchData}>
                <div style={{ padding: 12, paddingBottom: 110 }}>
                    {loading && <AutoCenter><SpinLoading /></AutoCenter>}
                    <Collapse>
                        {filteredData.map(bundle => (
                            <Collapse.Panel key={bundle.key} title={
                                <Space align='center'>
                                    <Checkbox checked={bundle.bundleSelected} disabled={!bundle.shipments.every(s => s.checked)} onChange={() => {
                                        setDataList(prev => prev.map(b => b.bundleNo === bundle.bundleNo ? { ...b, bundleSelected: !b.bundleSelected } : b));
                                    }} onClick={e => e.stopPropagation()} />
                                    <div style={{ fontWeight: 'bold' }}>{bundle.bundleNo}</div>
                                </Space>
                            }>
                                {bundle.shipments.map(item => (
                                    <Card key={item.key} style={styles.cardShipment(item.checked)}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: 'center' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={styles.documentNo(item.checked)}>{item.documentno}</div>
                                                <div style={styles.customerName}>{item.customer}</div>
                                            </div>
                                            <Button size="small" color={item.checked ? "success" : "primary"} fill={item.checked ? 'solid' : 'outline'} style={{ borderRadius: 8 }} onClick={() => handleCheck(bundle.bundleNo, item.key)}>
                                                {item.checked ? `OK ${item.clickCount > 0 ? `(${item.clickCount})` : ''}` : <CheckOutline />}
                                            </Button>
                                        </div>
                                    </Card>
                                ))}
                            </Collapse.Panel>
                        ))}
                    </Collapse>
                </div>
            </PullToRefresh>

            <DatePicker visible={isDatePickerVisible} onClose={() => setIsDatePickerVisible(false)} onConfirm={setFilterDate} />

            {dataList.some(b => b.bundleSelected) && (
                <div style={styles.floatingFooter}>
                    <Button color='primary' block style={styles.acceptButton} onClick={handleSubmit}>
                        TERIMA {dataList.filter(b => b.bundleSelected).length} BUNDLE (DPK)
                    </Button>
                </div>
            )}
        </div>
    );
};

// ==========================================
// MAIN COMPONENT
// ==========================================
const DriverReceiptSJOut = () => {
    const user = useSelector((state) => state.auth.user);

    return (
        <LayoutGlobalMobile title="SJ Out Receipt">
            <div style={styles.tabContainer}>
                <Tabs activeLineMode='fixed' style={{ '--active-line-color': '#1677ff', '--active-title-color': '#1677ff', '--title-font-size': '15px' }}>
                    <Tabs.Tab title={<Space><TruckOutline /><span>Delivery</span></Space>} key="delivery">
                        <DeliveryTab />
                    </Tabs.Tab>
                    <Tabs.Tab title={<Space><InboxOutlined /><span>DPK</span></Space>} key="dpk">
                        <DPKTab userName={user?.name} />
                    </Tabs.Tab>
                </Tabs>
            </div>
        </LayoutGlobalMobile>
    );
};

export default DriverReceiptSJOut;