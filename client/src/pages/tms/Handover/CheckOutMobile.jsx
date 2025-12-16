import React, { useEffect, useState } from "react";
import {
    Button,
    Card,
    Checkbox,
    List,
    Modal,
    Popup,
    SearchBar,
    Switch,
    Tag,
    Toast,
    AutoCenter,
    TextArea,
    SpinLoading
} from "antd-mobile";
import { CheckCircleOutline, TruckOutline } from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { setCustomers } from "../../../states/reducers/customerSlice";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile"; // IMPORT LAYOUT

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function CheckOutMobile() {
    const dispatch = useDispatch();

    // Data User
    const user = useSelector((state) => state.auth.user);
    const userName = user?.name || "";

    // Data States
    const [tableData, setTableData] = useState([]);
    const [tableDataDropOnly, setTableDataDropOnly] = useState([]);
    const [loading, setLoading] = useState(false);

    // Selection
    const [selectedRows, setSelectedRows] = useState([]);
    const [selectedRowsDropOnly, setSelectedRowsDropOnly] = useState([]);

    // UI States
    const [searchText, setSearchText] = useState("");
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    // Cancel Logic
    const [isModalCancelOpen, setIsModalCancelOpen] = useState(false);
    const [itemToCancel, setItemToCancel] = useState(null);
    const [noteCancel, setNoteCancel] = useState("");

    // --- FETCH DATA ---
    const fetchData = async () => {
        setLoading(true);
        try {
            const resp = await fetch(`${backEndUrl}/handover/list/checkin/customer`, { credentials: "include" });
            const json = await resp.json();
            const listData = json?.data?.data || [];

            const dataFiltered = listData.filter(bundle => bundle.drivername === userName);

            const mapped = dataFiltered.map((row) => ({
                key: row.m_inout_id,
                ...row,
                plantimeFormatted: row.plantime ? dayjs(row.plantime).format("DD-MM-YYYY HH:mm") : '-',
                tripMode: 'DO'
            }));

            const customersOnly = [...new Set(mapped.map(r => r.customer))];
            dispatch(setCustomers(customersOnly));
            setTableData(mapped);
        } catch (err) {
            console.error("Error Fetching:", err);
            Toast.show({ content: 'Gagal memuat data', icon: 'fail' });
        } finally {
            setLoading(false);
        }
    };

    const fetchDataDropOnly = async () => {
        try {
            const resp = await fetch(`${backEndUrl}/handover/list/checkin/customer/do`, { credentials: "include" });
            const json = await resp.json();
            const listData = json?.data?.data || [];
            const mapped = listData.map((row) => ({
                key: row.m_inout_id,
                ...row,
                plantimeFormatted: row.plantime ? dayjs(row.plantime).format("DD-MM-YYYY HH:mm") : '-',
            }));
            setTableDataDropOnly(mapped);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchData();
        fetchDataDropOnly();
    }, []);

    // --- HELPER FUNCTIONS ---
    const toggleSelection = (record) => {
        const isSelected = selectedRows.find(r => r.key === record.key);
        if (isSelected) {
            setSelectedRows(selectedRows.filter(r => r.key !== record.key));
        } else {
            setSelectedRows([...selectedRows, record]);
        }
    };

    const toggleSelectionDropOnly = (record) => {
        const isSelected = selectedRowsDropOnly.find(r => r.key === record.key);
        if (isSelected) {
            setSelectedRowsDropOnly(selectedRowsDropOnly.filter(r => r.key !== record.key));
        } else {
            setSelectedRowsDropOnly([...selectedRowsDropOnly, record]);
        }
    };

    const getFilteredData = () => {
        if (!searchText) return tableData;
        const lower = searchText.toLowerCase();
        return tableData.filter(item =>
            (item.documentno && item.documentno.toLowerCase().includes(lower)) ||
            (item.customer && item.customer.toLowerCase().includes(lower))
        );
    };

    const openHandoverPopup = () => {
        if (selectedRows.length === 0) {
            Toast.show({ content: "Pilih minimal 1 dokumen.", position: 'bottom' });
            return;
        }
        const updated = selectedRows.map(r => ({ ...r, tripMode: r.tripMode || "DO" }));
        setSelectedRows(updated);
        setIsPopupOpen(true);
    };

    const handleSubmit = async () => {
        try {
            Toast.show({ icon: 'loading', content: 'Processing...', duration: 0 });

            let combinedData = [...selectedRows];
            if (selectedRowsDropOnly.length > 0) {
                const dropOnlyWithKey = selectedRowsDropOnly.map(row => ({ ...row, tripMode: 'RT' }));
                combinedData = [...combinedData, ...dropOnlyWithKey];
            }

            const payload = {
                driverName: selectedRows[0].drivername,
                tnkbId: Number(selectedRows[0].tnkb_id),
                data: combinedData
            };

            const resp = await fetch(`${backEndUrl}/handover/process/driver/to/customer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });

            Toast.clear();
            if (resp.ok) {
                Toast.show({ content: "Checkout berhasil!", icon: 'success' });
                setIsPopupOpen(false);
                setSelectedRows([]);
                setSelectedRowsDropOnly([]);
                fetchData();
                fetchDataDropOnly();
            } else {
                throw new Error("API Error");
            }
        } catch (err) {
            Toast.clear();
            console.error(err);
            Toast.show({ content: "Error checkout.", icon: 'fail' });
        }
    };

    const handleCancelOk = async () => {
        try {
            const payload = { itemToCancel, noteCancel };
            const res = await axios.post(`${backEndUrl}/tms/req/cancel`, payload, { withCredentials: true });
            if (res.data.success) {
                Toast.show({ content: 'Cancel request success', icon: 'success' });
                fetchData();
            } else {
                Toast.show({ content: 'Gagal cancel', icon: 'fail' });
            }
        } catch (error) {
            console.error(error);
            Toast.show({ content: 'Error API', icon: 'fail' });
        } finally {
            setIsModalCancelOpen(false);
            setNoteCancel("");
        }
    };

    const filteredData = getFilteredData();

    return (
        <LayoutGlobalMobile title="Check Out List">
            {/* CONTENT START */}
            <div style={{ marginBottom: 12, background: '#fff', borderRadius: 8, padding: 8 }}>
                <SearchBar placeholder="Cari No Dokumen..." value={searchText} onChange={setSearchText} />
            </div>

            {loading ? <AutoCenter><SpinLoading color='primary' /></AutoCenter> : (
                <List style={{ '--border-top': 'none', '--border-bottom': 'none', background: 'transparent' }}>
                    {filteredData.length === 0 && <AutoCenter>Tidak ada data</AutoCenter>}

                    {filteredData.map((item) => {
                        const isSelected = selectedRows.some(r => r.key === item.key);
                        return (
                            <Card key={item.key} style={{ marginBottom: 12, borderRadius: 8 }} onClick={() => toggleSelection(item)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <Checkbox checked={isSelected} style={{ marginTop: 2 }} />
                                        <div>
                                            <div style={{ fontWeight: 'bold', fontSize: 16 }}>{item.documentno}</div>
                                            <div style={{ color: '#666', fontSize: 13 }}><TruckOutline /> {item.customer}</div>
                                            <div style={{ color: '#888', fontSize: 12 }}>{item.plantimeFormatted}</div>
                                        </div>
                                    </div>
                                    <div onClick={(e) => e.stopPropagation()}>
                                        {item.cancelrequest === 'N' ? (
                                            <Button size="mini" color="danger" fill="outline" onClick={() => { setItemToCancel(item); setIsModalCancelOpen(true); }}>Cancel</Button>
                                        ) : <Tag color="warning">Waiting</Tag>}
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </List>
            )}

            {/* FLOATING ACTION BUTTON (Tombol Process) */}
            <div style={{
                position: 'fixed',
                bottom: '50px', // Di atas TabBar (50px)
                left: 0,
                right: 0,
                background: '#fff',
                padding: '12px',
                borderTop: '1px solid #eee',
                zIndex: 100 // Di atas konten, di bawah modal
            }}>
                <Button
                    block
                    color="primary"
                    size="large"
                    disabled={selectedRows.length === 0}
                    onClick={openHandoverPopup}
                >
                    Process Check Out ({selectedRows.length})
                </Button>
            </div>

            {/* POPUP & MODALS (Boleh ditaruh di dalam LayoutGlobal) */}
            <Popup
                visible={isPopupOpen}
                onMaskClick={() => setIsPopupOpen(false)}
                bodyStyle={{ minHeight: '60vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
            >
                <div style={{ padding: 16, paddingBottom: 50 }}>
                    <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>Confirm Submission</div>

                    {selectedRows.map((r, i) => (
                        <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckCircleOutline color="var(--adm-color-success)" />
                                <b>{r.documentno}</b>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12 }}>{r.tripMode === "RT" ? "ROUND TRIP" : "DROP ONLY"}</span>
                                <Switch checked={r.tripMode === "RT"} onChange={(c) => {
                                    const up = [...selectedRows];
                                    up[i].tripMode = c ? "RT" : "DO";
                                    setSelectedRows(up);
                                }} />
                            </div>
                        </div>
                    ))}

                    <div style={{ marginTop: 20, background: '#fafafa', padding: 10, borderRadius: 8 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 5 }}>Add Drop Only:</div>
                        {tableDataDropOnly.map(d => (
                            <div key={d.key} onClick={() => toggleSelectionDropOnly(d)} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #eee' }}>
                                <Checkbox checked={selectedRowsDropOnly.some(x => x.key === d.key)} />
                                <div>
                                    <div style={{ fontWeight: 500 }}>{d.documentno}</div>
                                    <div style={{ fontSize: 12, color: '#888' }}>{d.customer}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
                        <Button block flex={1} onClick={() => setIsPopupOpen(false)}>Cancel</Button>
                        <Button block flex={1} color="primary" onClick={handleSubmit}>Submit</Button>
                    </div>
                </div>
            </Popup>

            <Modal
                visible={isModalCancelOpen}
                title="Cancel Document"
                content={
                    <div style={{ marginTop: 10 }}>
                        <TextArea
                            placeholder="Alasan cancel..."
                            value={noteCancel}
                            onChange={setNoteCancel}
                            rows={3}
                            showCount
                            style={{ border: '1px solid #ccc', borderRadius: 4, padding: 4 }}
                        />
                    </div>
                }
                closeOnAction
                onClose={() => setIsModalCancelOpen(false)}
                actions={[
                    { key: 'confirm', text: 'Submit', primary: true, danger: true, onClick: handleCancelOk, disabled: !noteCancel },
                    { key: 'close', text: 'Batal', onClick: () => setIsModalCancelOpen(false) }
                ]}
            />
            {/* CONTENT END */}
        </LayoutGlobalMobile>
    );
}