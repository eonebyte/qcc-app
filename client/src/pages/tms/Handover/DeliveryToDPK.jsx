import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Space, Table, Modal, message } from "antd";
import LayoutGlobal from "../../../components/layouts/LayoutGlobal";
import { SearchOutlined } from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import dayjs from "dayjs";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function DeliveryToDPK() {
    const [tableData, setTableData] = useState([]);
    const [loading, setLoading] = useState(false);

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
    ];

    // ================== FETCH DATA API ==================
    const fetchData = async () => {
        setLoading(true);
        try {
            const resp = await fetch(
                `${backEndUrl}/handover/list/delivery/to/dpk`
            );
            const json = await resp.json();

            const mapped = json.data.data.map((row, index) => ({
                key: row.m_inout_id,
                m_inout_id: row.m_inout_id,
                no: index + 1,
                documentno: row.documentno,
                customer: row.customer,
                plantime: dayjs(row.plantime).format("YYYY-MM-DD HH:mm"),
                checkpoin_id: row.checkpoin_id,
            }));

            setTableData(mapped);
        } catch (err) {
            console.error("Fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

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
            const payload = {
                data: selectedRows,
            };

            console.log(JSON.stringify(payload));


            const resp = await fetch(`${backEndUrl}/handover/process/delivery/to/dpk`, {
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

    return (
        <LayoutGlobal>
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
                    Handover
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
            </Modal>
        </LayoutGlobal>
    );
}
