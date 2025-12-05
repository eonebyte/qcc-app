import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Space, Table, Modal, message, Switch, notification, Tag } from "antd";
import { CloseOutlined, SearchOutlined } from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import dayjs from "dayjs";
import axios from "axios";
import { useDispatch } from "react-redux";
import { setCustomers } from "../../../states/reducers/customerSlice";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function CheckInRoundTrip() {
    const dispatch = useDispatch();

    const [tableData, setTableData] = useState([]);
    const [loading, setLoading] = useState(false);

    const [tripMode, setTripMode] = useState("RT");

    // const [driver, setDriver] = useState(null);
    // const [tnkb, setTnkb] = useState(null);


    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 10
    });


    // selected rows
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [selectedRows, setSelectedRows] = useState([]);


    // modal
    const [isModalOpen, setIsModalOpen] = useState(false);

    // SEARCH
    const [searchText, setSearchText] = useState("");
    const [searchedColumn, setSearchedColumn] = useState("");
    const searchInput = useRef(null);


    const [isModalCancelOpen, setIsModalCancelopen] = useState(false);
    const [itemToCancel, setItemToCancel] = useState(null);

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

                    <Button
                        type="link"
                        size="small"
                        onClick={() => {
                            confirm({ closeDropdown: false });
                            setSearchText(selectedKeys[0]);
                            setSearchedColumn(dataIndex);
                        }}
                    >
                        Filter
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

        filterDropdownProps: {
            onOpenChange(open) {
                if (open) {
                    setTimeout(() => searchInput.current?.select(), 100);
                }
            },
        },

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


    const showModalCancel = (shipment) => {
        setItemToCancel(shipment);
        setIsModalCancelopen(true);
    };


    // ================== TABLE COLUMNS ==================
    const columns = [
        {
            title: "No",
            dataIndex: "no",
            key: "no",
            width: 60,
            render: (_text, _record, index) => {
                const { current, pageSize } = pagination;
                return (current - 1) * pageSize + index + 1;
            }
        },
        {
            title: "Document No",
            dataIndex: "documentno",
            key: "documentno",
            ...getColumnSearchProps("documentno"),
        },
        {
            title: "Customer",
            dataIndex: "customer",
            key: "customer",
            ...getColumnSearchProps("customer"),
        },
        {
            title: "Plan Time",
            dataIndex: "plantime",
            key: "plantime",
            ...getColumnSearchProps("plantime"),
            render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-',
        },
        {
            title: "Actions",
            key: "actions",
            width: 120,
            render: (_, record) => {
                console.log('tesss : ', record);
                if (record.cancelrequest == 'N') {
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

    // ================== FETCH DATA API ==================
    const fetchData = async () => {
        setLoading(true);
        try {
            const resp = await fetch(
                `${backEndUrl}/handover/list/checkin/customer`,
                { credentials: "include" },
            );
            const json = await resp.json();



            const mapped = json.data.data.map((row, index) => ({
                key: row.m_inout_id,
                adw_trackingsj_id: row.adw_trackingsj_id,
                m_inout_id: row.m_inout_id,
                no: index + 1,
                documentno: row.documentno,
                customer: row.customer,
                plantime: dayjs(row.plantime).format("YYYY-MM-DD HH:mm"),
                checkpoin_id: row.checkpoin_id,
                driverby: row.driverby,
                drivername: row.drivername,
                tnkb_id: row.tnkb_id,
                cancelrequest: row.cancelrequest,
            }));


            const customersOnly = [...new Set(mapped.map(r => r.customer))];


            dispatch(setCustomers(customersOnly));


            setTableData(mapped);
        } catch (err) {
            console.error("Fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handler = () => {
            fetchData(); // panggil ulang API
        };

        window.addEventListener("fetch-roundtrip", handler);
        return () => window.removeEventListener("fetch-roundtrip", handler);
    }, []);


    useEffect(() => {
        fetchData();
    }, []);

    // ================== ROW SELECTION ==================
    const rowSelection = {
        selectedRowKeys,
        onChange: (selectedKeys, selectedRows) => {
            setSelectedRowKeys(selectedKeys);
            setSelectedRows(selectedRows);
        },
    };

    // ================== OPEN MODAL ==================
    const openHandoverModal = () => {
        if (selectedRows.length === 0) {
            message.warning("Pilih minimal 1 row.");
            return;
        }
        setIsModalOpen(true);
    };

    // ================== SUBMIT TO BACKEND ==================
    const handleSubmit = async () => {
        try {
            if (selectedRows.length === 0) {
                message.error("Tidak ada data yang dipilih.");
                return;
            }

            // Ambil nilai driverBy dan tnkbId dari row pertama
            const firstDriver = selectedRows[0].drivername;
            const firstTnkb = selectedRows[0].tnkb_id;



            // Cek apakah semua row punya driverBy yang sama
            const validDriver = selectedRows.every(row => row.drivername === firstDriver);

            // Cek apakah semua row punya tnkbId yang sama
            const validTnkb = selectedRows.every(row => row.tnkb_id === firstTnkb);

            if (!validDriver) {
                message.error("Semua data yang dipilih harus memiliki driverBy yang sama!");
                return;
            }

            if (!validTnkb) {
                message.error("Semua data yang dipilih harus memiliki tnkbId yang sama!");
                return;
            }

            const payload = {
                tripMode,
                driverName: firstDriver,
                tnkbId: Number(firstTnkb),
                data: selectedRows,
            };

            const resp = await fetch(`${backEndUrl}/handover/process/driver/to/customer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });

            const json = await resp.json();



            if (json.data.insertedCount <= 0) {
                message.error("Submit gagal.");
                return;
            }

            message.success("Submit handover berhasil!");

            setIsModalOpen(false);
            setSelectedRowKeys([]);
            setSelectedRows([]);

            fetchData();
        } catch (err) {
            console.error(err);
            message.error("Terjadi error saat submit.");
        }
    };

    const handleCancelOk = async () => {
        console.log("canceling item:", itemToCancel);
        try {

            const res = await axios.post(`${backEndUrl}/tms/req/cancel`, itemToCancel, { withCredentials: true });

            if (res.data.success) {
                notification.success({ message: 'Info', description: `Dokumen ${itemToCancel.documentno} akan diproses untuk dicancel.` });
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
        }
    };

    const handleCancelClose = () => {
        setIsModalCancelopen(false);
        setItemToCancel(null);
    };

    return (
        <>
            <Table
                rowSelection={rowSelection}
                columns={columns}
                dataSource={tableData}
                bordered
                loading={loading}
                pagination={{
                    ...pagination,
                    total: tableData.length,
                    onChange: (page, pageSize) => {
                        setPagination({ current: page, pageSize });
                    }
                }}
            />

            {/* BUTTON HANDOVER */}
            <div style={{ marginTop: 16 }}>
                <Button
                    type="primary"
                    disabled={selectedRows.length === 0}
                    onClick={openHandoverModal}
                >
                    Check In
                </Button>
            </div>

            {/* MODAL CONFIRMATION */}
            <Modal
                title="Confirm Handover"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={handleSubmit}
                okText="Submit"
                cancelText="Cancel"
            >
                <p>Apakah Anda yakin ingin submit berikut:</p>

                <ul>
                    {selectedRows.map((r) => (
                        <li key={r.key}>{r.documentno}</li>
                    ))}
                </ul>

                <div style={{ marginTop: 16 }}>
                    <p style={{ marginBottom: 8 }}>Jenis Trip:</p>

                    <Switch
                        checkedChildren="ROUND TRIP"
                        unCheckedChildren="DROP ONLY"
                        defaultChecked
                        onChange={(checked) =>
                            setTripMode(checked ? "RT" : "DO")
                        }
                    />
                </div>
            </Modal>

            <Modal
                title="Confirm cancel"
                open={isModalCancelOpen}
                onOk={handleCancelOk}
                onCancel={handleCancelClose}
            >
                <p>Apakah Anda yakin akan mecancel dokumen <strong>{itemToCancel?.documentno}</strong>?</p>
            </Modal>
        </>
    );
}
