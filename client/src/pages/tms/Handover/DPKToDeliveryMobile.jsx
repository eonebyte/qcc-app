import React, { useEffect, useState } from "react";
import {
    Card,
    Button,
    SearchBar,
    Checkbox,
    Dialog,
    Toast,
    Tag,
    Popup,
    AutoCenter,
    PullToRefresh,
    SpinLoading
} from "antd-mobile";
import {
    SendOutline,
    CalendarOutline,
    UserOutline,
    TruckOutline
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function DPKToDeliveryMobile() {
    // --- STATE ---
    const [dataList, setDataList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState([]);

    // Filter Search
    const [searchText, setSearchText] = useState("");

    // --- FETCH DATA ---
    const fetchData = async () => {
        setLoading(true);
        try {
            const resp = await fetch(
                `${backEndUrl}/handover/list/dpk/to/delivery`,
                { credentials: "include" }
            );
            const json = await resp.json();

            const mapped = json.data.data.map((row, index) => ({
                key: row.m_inout_id,
                m_inout_id: row.m_inout_id,
                no: index + 1,
                documentno: row.documentno,
                customer: row.customer,
                plantime: row.plantime,
                checkpoin_id: row.checkpoin_id,
                driverby: row.driverby,
                tnkb_id: row.tnkb_id,
                drivername: row.drivername,
            }));

            setDataList(mapped);
        } catch (err) {
            console.error("Fetch error:", err);
            Toast.show({ content: "Gagal mengambil data", icon: "fail" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- FILTER SEARCH ---
    const filteredData = dataList.filter(item => {
        const searchLower = searchText.toLowerCase();
        return (
            (item.documentno && item.documentno.toLowerCase().includes(searchLower)) ||
            (item.customer && item.customer.toLowerCase().includes(searchLower))
        );
    });

    // --- HANDLERS SELECTION ---
    const toggleSelection = (key) => {
        setSelectedKeys(prev => {
            if (prev.includes(key)) {
                return prev.filter(k => k !== key);
            } else {
                return [...prev, key];
            }
        });
    };

    const handleSelectAll = () => {
        if (selectedKeys.length === filteredData.length) {
            setSelectedKeys([]);
        } else {
            setSelectedKeys(filteredData.map(item => item.key));
        }
    };

    // --- HANDLER SUBMIT HANDOVER ---
    const handleSubmitHandover = () => {
        if (selectedKeys.length === 0) return;

        const selectedItems = dataList.filter(item => selectedKeys.includes(item.key));

        // Ambil driver & TNKB dari item pertama (asumsi backend ambil dari salah satu item)
        // Atau backend tidak butuh karena logic handover internal
        // Sesuai kode desktop, payload menyertakan driverId dan tnkbId dari item pertama
        const firstDriver = selectedItems[0].driverby;
        const firstTnkb = selectedItems[0].tnkb_id;

        Dialog.confirm({
            title: 'Konfirmasi Handover',
            content: `Kirim handover untuk ${selectedItems.length} dokumen terpilih?`,
            confirmText: "Submit",
            cancelText: "Batal",
            onConfirm: async () => {
                try {
                    const payload = {
                        driverId: Number(firstDriver),
                        tnkbId: Number(firstTnkb),
                        data: selectedItems,
                    };

                    const resp = await fetch(`${backEndUrl}/handover/process/dpk/to/delivery`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                        credentials: "include"
                    });
                    const json = await resp.json();
                    
                    console.log('json :', json);

                    if (json.data && json.data.updatedCount > 0) {
                        Toast.show({ content: "Handover Berhasil!", icon: "success" });
                        setSelectedKeys([]);
                        fetchData();
                    } else {
                        Toast.show({ content: "Submit Gagal.", icon: "fail" });
                    }
                } catch (err) {
                    console.error(err);
                    Toast.show({ content: "Terjadi error saat submit.", icon: "fail" });
                }
            }
        });
    };

    return (
        <LayoutGlobalMobile title="Handover to Delivery">
            
            {/* --- HEADER: Search --- */}
            <div style={{ background: '#fff', padding: '10px 12px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <SearchBar 
                    placeholder="Cari Doc No / Customer" 
                    value={searchText}
                    onChange={setSearchText}
                />
                
                {/* Select All Bar */}
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Checkbox 
                        checked={filteredData.length > 0 && selectedKeys.length === filteredData.length}
                        indeterminate={selectedKeys.length > 0 && selectedKeys.length < filteredData.length}
                        onChange={handleSelectAll}
                    >
                        Pilih Semua ({selectedKeys.length}/{filteredData.length})
                    </Checkbox>
                </div>
            </div>

            {/* --- LIST DATA --- */}
            <PullToRefresh onRefresh={fetchData}>
                <div style={{ padding: 12, paddingBottom: 80 }}>
                    {loading && <AutoCenter>
                      <SpinLoading color="primary" />
                    </AutoCenter>}
                    
                    {!loading && filteredData.length === 0 && (
                        <AutoCenter style={{ marginTop: 20 }}>Tidak ada data.</AutoCenter>
                    )}

                    {filteredData.map(item => (
                        <Card key={item.key} style={{ marginBottom: 12, borderRadius: 8 }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                {/* Checkbox */}
                                <div style={{ paddingTop: 4 }}>
                                    <Checkbox 
                                        checked={selectedKeys.includes(item.key)}
                                        onChange={() => toggleSelection(item.key)}
                                    />
                                </div>

                                {/* Content */}
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: 16 }}>{item.documentno}</div>
                                    <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                                        {item.customer}
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: '#888' }}>
                                        <div>
                                            <CalendarOutline style={{ marginRight: 4 }} />
                                            {item.plantime ? dayjs(item.plantime).format('DD-MM-YYYY HH:mm') : '-'}
                                        </div>
                                    </div>
                                    {item.drivername && (
                                        <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
                                            <TruckOutline style={{ marginRight: 4 }} />
                                            Driver: {item.drivername}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </PullToRefresh>

            {/* --- FLOATING SUBMIT BUTTON --- */}
            {selectedKeys.length > 0 && (
                <div style={{ 
                    position: 'fixed', 
                    bottom: 70, 
                    left: 12, 
                    right: 12, 
                    zIndex: 100 
                }}>
                    <Button 
                        block 
                        color="primary" 
                        size="large" 
                        onClick={handleSubmitHandover}
                        style={{ boxShadow: '0 4px 12px rgba(22, 119, 255, 0.4)' }}
                    >
                        <SendOutline style={{ marginRight: 6 }} />
                        Handover ({selectedKeys.length})
                    </Button>
                </div>
            )}

        </LayoutGlobalMobile>
    );
}