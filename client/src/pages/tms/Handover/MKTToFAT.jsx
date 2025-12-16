import React, { useEffect, useRef, useState, useMemo } from "react";
import { Button, Input, Space, Table, Modal, message, Badge, Tag, notification } from "antd";
import { CloseOutlined, SearchOutlined, SendOutlined } from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import dayjs from "dayjs";
import LayoutGlobal from "../../../components/layouts/LayoutGlobal";
import axios from "axios";

const { TextArea } = Input;

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function MKTToFAT() {
    // Data asli (flat list) dari API
    const [loading, setLoading] = useState(false);

    const [data, setData] = useState([]);

    const [noteCancel, setNoteCancel] = useState("");

    // Selected rows (Sekarang menyimpan Object Group / Parent)
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [selectedGroupRows, setSelectedGroupRows] = useState([]);

    // Modal Handover
    const [isModalOpen, setIsModalOpen] = useState(false);

    // SEARCH states
    const [searchText, setSearchText] = useState("");
    const [searchedColumn, setSearchedColumn] = useState("");
    const searchInput = useRef(null);


    const [isModalCancelOpen, setIsModalCancelopen] = useState(false);
    const [itemToCancel, setItemToCancel] = useState(null);

    // ================== SEARCH LOGIC ==================
    const handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        setSearchText(selectedKeys[0]);
        setSearchedColumn(dataIndex);
    };

    const handleReset = (clearFilters) => {
        clearFilters();
        setSearchText("");
    };

    const getColumnSearchProps = (dataIndex) => ({
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
            <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
                <Input
                    ref={searchInput}
                    placeholder={`Search ${dataIndex}`}
                    value={selectedKeys[0]}
                    onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                    onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
                    style={{ marginBottom: 8, display: "block" }}
                />
                <Space>
                    <Button
                        type="primary"
                        onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
                        icon={<SearchOutlined />}
                        size="small"
                        style={{ width: 90 }}
                    >
                        Search
                    </Button>
                    <Button
                        onClick={() => clearFilters && handleReset(clearFilters)}
                        size="small"
                        style={{ width: 90 }}
                    >
                        Reset
                    </Button>
                    <Button type="link" size="small" onClick={() => close()}>
                        Close
                    </Button>
                </Space>
            </div>
        ),
        filterIcon: (filtered) => (
            <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />
        ),
        onFilter: (value, record) =>
            record[dataIndex]?.toString().toLowerCase().includes(value.toLowerCase()),
        render: (text) =>
            searchedColumn === dataIndex ? (
                <Highlighter
                    highlightStyle={{ backgroundColor: "#ffc069", padding: 0 }}
                    searchWords={[searchText]}
                    autoEscape
                    textToHighlight={text ? text.toString() : ""}
                />
            ) : (
                text
            ),
    });

    // ================== FETCH DATA API ==================
    const fetchData = async () => {
        setLoading(true);
        try {
            const resp = await fetch(
                `${backEndUrl}/handover/list/mkt/to/fat`,
                { credentials: "include" }
            );
            const json = await resp.json();

            const mapped = json.data.data.map((row, index) => ({
                key: row.m_inout_id,
                m_inout_id: row.m_inout_id,
                adw_trackingsj_id: row.adw_trackingsj_id,
                no: index + 1,
                documentno: row.documentno,
                customer: row.customer,
                plantime: dayjs(row.plantime).format("YYYY-MM-DD HH:mm"),
                checkpoin_id: row.checkpoin_id,
                driverby: row.driverby,
                tnkb_id: row.tnkb_id,
                drivername: row.drivername,
                sppno: row.sppno,
                cancelrequestmkt: row.cancelrequestmkt,
            }));

            setData(mapped);
        } catch (err) {
            console.error("Fetch error:", err);
            message.error("Gagal mengambil data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ================== GROUPING DATA ==================
    const groupedData = useMemo(() => {
        const groups = {};

        data.forEach((item) => {
            const groupKey = item.sppno || "NO_SPP";

            if (!groups[groupKey]) {
                groups[groupKey] = {
                    key: `group_${groupKey}`, // Key untuk row Parent
                    sppno: item.sppno,
                    customer: item.customer,
                    childrenCount: 0,
                    items: [] // Array data child
                };
            }
            groups[groupKey].items.push(item);
            groups[groupKey].childrenCount += 1;
        });

        return Object.values(groups);
    }, [data]);

    // ================== HELPER: GET ALL SELECTED ITEMS ==================
    // Karena user memilih Group, kita butuh fungsi untuk mengambil semua item detail di dalamnya
    const getAllSelectedItems = () => {
        return selectedGroupRows.flatMap(group => group.items);
    };

    // ================== PARENT TABLE COLUMNS ==================
    const parentColumns = [
        {
            title: "SPP NO",
            dataIndex: "sppno",
            key: "sppno",
            ...getColumnSearchProps("sppno"),
            render: (text) => text ? <b>{text}</b> : <span style={{ color: 'red', fontStyle: 'italic' }}>Belum Ada SPP</span>
        },
        {
            title: "Customer",
            dataIndex: "customer",
            key: "customer",
            ...getColumnSearchProps("customer"),
        },
        {
            title: "Jumlah Dokumen",
            dataIndex: "childrenCount",
            key: "childrenCount",
            render: (count) => <Badge count={count} showZero color="#108ee9" />
        }
    ];

    const showModalCancel = (shipment) => {
        setItemToCancel(shipment);
        setIsModalCancelopen(true);
    };


    // ================== CHILD TABLE COLUMNS ==================
    const childColumns = [
        {
            title: "No",
            dataIndex: "no",
            key: "no",
            width: 60,
        },
        {
            title: "Document No",
            dataIndex: "documentno",
            key: "documentno",
        },
        {
            title: "Driver",
            dataIndex: "drivername",
            key: "drivername",
        },
        {
            title: "Plan Time",
            dataIndex: "plantime",
            key: "plantime",
            render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-',
        },
        {
            title: "Actions",
            key: "actions",
            width: 120,
            render: (_, record) => {
                if (record.cancelrequestmkt == 'N') {
                    return (<Button onClick={() => showModalCancel(record)}
                        icon={<CloseOutlined />} size='small' danger>Cancel</Button>)
                } else {
                    return (<Tag color={"warning"} variant={'solid'}>
                        Waiting
                    </Tag>)
                }


            }
        }
    ];


    // ================== ROW SELECTION (PARENT) ==================
    const rowSelection = {
        selectedRowKeys,
        onChange: (newSelectedKeys, newSelectedRows) => {
            setSelectedRowKeys(newSelectedKeys);
            setSelectedGroupRows(newSelectedRows);
        },
    };

    // ================== EXPANDED RENDER ==================
    const expandedRowRender = (record) => {
        return (
            <div style={{ padding: '8px 40px', margin: 0, backgroundColor: '#fafafa' }}>
                <Table
                    columns={childColumns}
                    dataSource={record.items}
                    pagination={false}
                    size="small"
                    bordered
                />
            </div>
        );
    };

    // ================== HANDOVER LOGIC ==================
    const openHandoverModal = () => {
        if (selectedGroupRows.length === 0) {
            message.warning("Pilih minimal 1 Grup SPP.");
            return;
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            // Ambil semua item detail dari grup yang dipilih
            const allItems = getAllSelectedItems();

            if (allItems.length === 0) {
                message.error("Tidak ada data item yang terpilih.");
                return;
            }

            const firstDriver = allItems[0].driverby;
            const firstTnkb = allItems[0].tnkb_id;

            // Validasi: semua item harus punya driver & tnkb yang sama
            const validDriver = allItems.every(row => row.driverby === firstDriver);
            const validTnkb = allItems.every(row => row.tnkb_id === firstTnkb);

            if (!validDriver) {
                message.error("Semua dokumen dalam grup yang dipilih harus memiliki driverBy yang sama!");
                return;
            }
            if (!validTnkb) {
                message.error("Semua dokumen dalam grup yang dipilih harus memiliki tnkbId yang sama!");
                return;
            }

            const firstSPPNo = allItems[0].sppno;

            const payload = {
                sppNo: firstSPPNo,
                driverId: Number(firstDriver),
                tnkbId: Number(firstTnkb),
                data: allItems, // Kirim flat array item ke backend
            };

            console.log('payload : ', payload);


            const resp = await fetch(`${backEndUrl}/handover/process/mkt/to/fat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });

            const json = await resp.json();

            if (json.data && json.data.insertedCount <= 0) {
                message.error("Submit gagal atau tidak ada data berubah.");
                return;
            }

            message.success("Submit handover berhasil!");

            setIsModalOpen(false);
            setSelectedRowKeys([]);
            setSelectedGroupRows([]);

            fetchData();
        } catch (err) {
            console.error(err);
            message.error("Terjadi error saat submit.");
        }
    };

    const handleCancelOk = async () => {
        try {

            const payload = {
                itemToCancel,
                noteCancel
            }

            const res = await axios.post(`${backEndUrl}/tms/req/cancel/mkt`, payload, { withCredentials: true });

            if (res.data.success) {
                notification.success({ message: 'Info', description: `Dokumen ${payload.itemToCancel.documentno} akan diproses untuk dicancel.` });
                fetchData();
            } else {
                notification.error({ message: 'Gagal', description: res.data.message || 'Terjadi kesalahan.' });
            }
        } catch (error) {
            console.error("Submit error:", error);
            notification.error({ message: 'cancel Gagal', description: error.response?.data?.message || 'Silakan coba lagi.' });
        } finally {
            setIsModalCancelopen(false);
            setItemToCancel(null);
            setNoteCancel("")
        }

    };

    const handleCancelClose = () => {
        setIsModalCancelopen(false);
        setItemToCancel(null);
    };


    // Helper untuk cek apakah tombol handover harus disable
    const isHandoverDisabled = () => {
        if (selectedGroupRows.length === 0) return true;
        // Cek jika ada salah satu item di dalam grup yang belum punya sppno
        const allItems = getAllSelectedItems();
        return allItems.some(i => !i.sppno);
    };
    return (
        <LayoutGlobal>
            {/* TABEL UTAMA (PARENT) dengan SELECTION */}
            <Table
                rowSelection={rowSelection}
                columns={parentColumns}
                dataSource={groupedData}
                loading={loading}
                bordered
                pagination={{ pageSize: 10 }}
                expandable={{
                    expandedRowRender: expandedRowRender,
                }}
            />

            {/* BUTTON HANDOVER */}
            <div style={{ marginTop: 16 }}>
                <Button
                    style={{ margin: 15 }}
                    type="primary"
                    disabled={isHandoverDisabled()}
                    onClick={openHandoverModal}
                    icon={<SendOutlined />}
                >
                    Handover ({getAllSelectedItems().length} Dokumen dari {selectedGroupRows.length} SPP)
                </Button>
            </div>

            {/* MODAL CONFIRMATION HANDOVER */}
            <Modal
                title="Confirm Handover"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={handleSubmit}
                okText="Submit"
                cancelText="Cancel"
                width={600}
            >
                <p>Apakah Anda yakin ingin submit dokumen dari Grup SPP berikut?</p>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {selectedGroupRows.map((group) => (
                        <div key={group.key} style={{ marginBottom: 10, borderBottom: '1px solid #eee', paddingBottom: 5 }}>
                            <strong>SPP: {group.sppno || "No SPP"}</strong>
                            <ul style={{ paddingLeft: 20, margin: 0 }}>
                                {group.items.map(item => (
                                    <li key={item.key}>{item.documentno}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </Modal>

            <Modal
                title="Confirm cancel"
                open={isModalCancelOpen}
                onOk={handleCancelOk}
                onCancel={handleCancelClose}
                okButtonProps={{ disabled: !noteCancel?.trim() }} // <- disable ketika kosong
            >
                <p>Apakah Anda yakin akan mecancel dokumen <strong>{itemToCancel?.documentno}</strong>?</p>

                Notes:
                <TextArea rows={4}
                    value={noteCancel}
                    onChange={(e) => setNoteCancel(e.target.value)} />
            </Modal>
        </LayoutGlobal>
    );
}