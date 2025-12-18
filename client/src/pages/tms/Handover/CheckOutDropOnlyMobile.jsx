import React, { useEffect, useState } from "react";
import {
    Button,
    Card,
    Checkbox,
    List,
    Popup,
    SearchBar,
    Tag,
    Toast,
    AutoCenter,
    SpinLoading,
} from "antd-mobile";
import {
    TruckOutline,
    FileOutline
} from "antd-mobile-icons";
import dayjs from "dayjs";
// import { useSelector } from "react-redux";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile"; // IMPORT LAYOUT GLOBAL

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function CheckOutDropOnlyMobile() {
    // Data User
    // const user = useSelector((state) => state.auth.user);
    // const userName = user?.name || "";

    // --- STATES ---
    const [tableData, setTableData] = useState([]);
    const [loading, setLoading] = useState(false);

    // Selection
    const [selectedRows, setSelectedRows] = useState([]);

    // UI States
    const [searchText, setSearchText] = useState("");
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    // --- FETCH DATA ---
    const fetchData = async () => {
        setLoading(true);
        try {
            const resp = await fetch(
                `${backEndUrl}/handover/list/checkin/customer/do`,
                { credentials: "include" },
            );
            const json = await resp.json();

            // Mapping Data
            const mapped = json.data.data.map((row) => ({
                key: row.m_inout_id,
                ...row,
                plantimeFormatted: row.plantime ? dayjs(row.plantime).format("DD-MM-YYYY HH:mm") : '-',
            }));

            // Filter by driver jika diperlukan
            // const filtered = mapped.filter(r => r.drivername === user?.name);
            setTableData(mapped);

        } catch (err) {
            console.error("Fetch error:", err);
            Toast.show({ content: 'Gagal memuat data', icon: 'fail' });
        } finally {
            setLoading(false);
        }
    };

    // Event Listener Refresh
    useEffect(() => {
        const handler = () => fetchData();
        window.addEventListener("fetch-droponly", handler);
        return () => window.removeEventListener("fetch-droponly", handler);
    }, []);

    useEffect(() => {
        fetchData();
    }, []);

    // --- LOGIC FUNCTIONS ---

    // Toggle Checkbox
    const toggleSelection = (record) => {
        const isSelected = selectedRows.find(r => r.key === record.key);
        if (isSelected) {
            setSelectedRows(selectedRows.filter(r => r.key !== record.key));
        } else {
            setSelectedRows([...selectedRows, record]);
        }
    };

    // Filter Search
    const getFilteredData = () => {
        if (!searchText) return tableData;
        const lower = searchText.toLowerCase();
        return tableData.filter(item =>
            (item.documentno && item.documentno.toLowerCase().includes(lower)) ||
            (item.customer && item.customer.toLowerCase().includes(lower)) ||
            (item.drivername && item.drivername.toLowerCase().includes(lower))
        );
    };

    // Open Modal
    const openReceiptPopup = () => {
        if (selectedRows.length === 0) {
            Toast.show({ content: "Pilih minimal 1 dokumen.", position: 'bottom' });
            return;
        }
        setIsPopupOpen(true);
    };

    // Submit Action
    const handleSubmit = async () => {
        try {
            Toast.show({ icon: 'loading', content: 'Processing...', duration: 0 });

            const firstDriver = selectedRows[0].drivername;
            const firstTnkb = selectedRows[0].tnkb_id;

            const payload = {
                driverName: firstDriver,
                tnkbId: Number(firstTnkb),
                data: selectedRows,
            };

            const resp = await fetch(`${backEndUrl}/handover/process/driver/to/customer/do`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });

            const json = await resp.json();
            Toast.clear();

            if (json.data && json.data.insertedCount > 0) {
                Toast.show({ content: "Receipt SJ berhasil!", icon: 'success' });
                setIsPopupOpen(false);
                setSelectedRows([]);
                fetchData();
            } else {
                Toast.show({ content: "Submit gagal / Tidak ada data diproses.", icon: 'fail' });
            }

        } catch (err) {
            Toast.clear();
            console.error(err);
            Toast.show({ content: "Terjadi error saat Receipt SJ.", icon: 'fail' });
        }
    };

    const filteredData = getFilteredData();
    return (
        <LayoutGlobalMobile title="Drop Only List">

            {/* CONTENT SEARCH */}
            <div style={{ marginBottom: 12, background: '#fff', borderRadius: 8, padding: 8 }}>
                <SearchBar placeholder="Cari Dokumen / Customer..." value={searchText} onChange={setSearchText} />
            </div>

            {/* CONTENT LIST */}
            {loading ? <AutoCenter>
                <SpinLoading color='primary' />
            </AutoCenter> : (
                <List style={{ '--border-top': 'none', '--border-bottom': 'none', background: 'transparent' }}>
                    {filteredData.length === 0 && <AutoCenter>Tidak ada data Drop Only</AutoCenter>}

                    {filteredData.map((item) => {
                        const isSelected = selectedRows.some(r => r.key === item.key);
                        return (
                            <Card key={item.key} style={{ marginBottom: 12, borderRadius: 8 }} onClick={() => toggleSelection(item)}>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                    <Checkbox checked={isSelected} style={{ marginTop: 4 }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <span style={{ fontWeight: 'bold', fontSize: 16 }}>{item.documentno}</span>
                                            <Tag color='primary' fill='outline'>Drop Only</Tag>
                                        </div>

                                        <div style={{ color: '#666', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                            <TruckOutline /> {item.customer}
                                        </div>

                                        <div style={{ color: '#888', fontSize: 12 }}>
                                            Plan: {item.plantimeFormatted}
                                        </div>

                                        <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                                            Driver: {item.drivername}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </List>
            )}

            {/* FLOATING ACTION BUTTON */}
            <div style={{
                position: 'fixed',
                bottom: '50px', // Sesuai tinggi TabBar
                left: 0,
                right: 0,
                background: '#fff',
                padding: '12px',
                borderTop: '1px solid #eee',
                zIndex: 100
            }}>
                <Button
                    block
                    color="primary"
                    size="large"
                    disabled={selectedRows.length === 0}
                    onClick={openReceiptPopup}
                >
                    Pengambilan ({selectedRows.length})
                </Button>
            </div>

            {/* CONFIRMATION POPUP */}
            <Popup
                visible={isPopupOpen}
                onMaskClick={() => setIsPopupOpen(false)}
                bodyStyle={{ minHeight: '40vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
            >
                <div style={{ padding: 16, paddingBottom: 50 }}>
                    <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>
                        Konfirmasi Receipt
                    </div>

                    <p style={{ color: '#666', textAlign: 'center', marginBottom: 20 }}>
                        Apakah Anda yakin ingin memproses Receipt untuk dokumen berikut?
                    </p>

                    <div style={{ maxHeight: '40vh', overflowY: 'auto', background: '#fafafa', padding: 10, borderRadius: 8, marginBottom: 20 }}>
                        {selectedRows.map((r) => (
                            <div key={r.key} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee' }}>
                                <FileOutline style={{ color: '#1677ff', marginTop: 2 }} />
                                <div>
                                    <div style={{ fontWeight: 600 }}>{r.documentno}</div>
                                    <div style={{ fontSize: 12, color: '#888' }}>{r.customer}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <Button block flex={1} onClick={() => setIsPopupOpen(false)}>
                            Batal
                        </Button>
                        <Button block flex={1} color="primary" onClick={handleSubmit}>
                            Submit
                        </Button>
                    </div>
                </div>
            </Popup>
        </LayoutGlobalMobile>
    );
}