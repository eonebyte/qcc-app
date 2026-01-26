import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Space, Table, Modal, message, Switch, notification, Tag, DatePicker, Card } from "antd";
import { CheckCircleOutlined, CloseOutlined, SearchOutlined, SendOutlined, ReloadOutlined } from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { setCustomers } from "../../../states/reducers/customerSlice";
import LayoutGlobal from "../../../components/layouts/LayoutGlobal";
import useIsMobile from "../../../hooks/useIsMobile";
import CheckOutMobile from "./CheckOutMobile";

dayjs.extend(isBetween);
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function CheckoutBypass() {
  const dispatch = useDispatch();
  const isMobile = useIsMobile();

  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  // Filter States
  const [searchNoSJ, setSearchNoSJ] = useState("");
  const [searchDateRange, setSearchDateRange] = useState(null);

  // Table Selection & Modal States
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const searchInput = useRef(null);
  const [isModalCancelOpen, setIsModalCancelopen] = useState(false);
  const [itemToCancel, setItemToCancel] = useState(null);
  const [noteCancel, setNoteCancel] = useState("");

  // ================== SEARCH COLUMN PROPS ==================
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
          <Button type="primary" onClick={() => handleSearch(selectedKeys, confirm, dataIndex)} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>Search</Button>
          <Button onClick={() => clearFilters && handleReset(clearFilters)} size="small" style={{ width: 90 }}>Reset</Button>
          <Button type="link" size="small" onClick={() => close()}>Close</Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    onFilter: (value, record) => record[dataIndex]?.toString().toLowerCase().includes(value.toLowerCase()),
    render: (text) => searchedColumn === dataIndex ? (
      <Highlighter highlightStyle={{ backgroundColor: "#ffc069", padding: 0 }} searchWords={[searchText]} autoEscape textToHighlight={text ? text.toString() : ""} />
    ) : (text),
  });

  // ================== FETCH DATA ==================
  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${backEndUrl}/handover/list/checkin/customer/bypass`, { credentials: "include" });
      const json = await resp.json();

      const rawList = json?.data?.data || [];

      const mapped = rawList.map((row, index) => ({
        key: row.m_inout_id,
        adw_trackingsj_id: row.adw_trackingsj_id,
        m_inout_id: row.m_inout_id,
        no: index + 1,
        documentno: row.documentno,
        customer: row.customer,
        plantime: row.plantime, // Simpan format asli untuk filter date
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
      message.error("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ================== LOGIC FILTERING (CLIENT SIDE) ==================
  const filteredData = tableData.filter((item) => {
    // Filter No SJ (Document No)
    const matchNoSJ = item.documentno?.toLowerCase().includes(searchNoSJ.toLowerCase());

    // Filter Tanggal (Plan Time)
    let matchDate = true;
    if (searchDateRange && searchDateRange[0] && searchDateRange[1]) {
      const start = searchDateRange[0].startOf("day");
      const end = searchDateRange[1].endOf("day");
      const itemDate = dayjs(item.plantime);
      matchDate = itemDate.isBetween(start, end, null, "[]");
    }

    return matchNoSJ && matchDate;
  });

  // ================== COLUMNS DEFINITION ==================
  const columns = [
    {
      title: "No",
      width: 60,
      render: (_text, _record, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: "No SJ / Doc No",
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
      title: "Driver",
      dataIndex: "drivername",
      key: "drivername",
      ...getColumnSearchProps("drivername"),
    },
    {
      title: "Plan Time",
      dataIndex: "plantime",
      key: "plantime",
      render: (text) => (text ? dayjs(text).format("DD-MM-YYYY HH:mm") : "-"),
      sorter: (a, b) => dayjs(a.plantime).unix() - dayjs(b.plantime).unix(),
    },
    {
      title: "Actions",
      width: 120,
      render: (_, record) => (
        record.cancelrequest === "N" ? (
          <Button onClick={() => { setItemToCancel(record); setIsModalCancelopen(true); }} icon={<CloseOutlined />} size="small" danger>Cancel</Button>
        ) : (
          <Tag color="warning">Waiting</Tag>
        )
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys, rows) => {
      setSelectedRowKeys(keys);
      setSelectedRows(rows);
    },
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        driverName: selectedRows[0].drivername,
        tnkbId: Number(selectedRows[0].tnkb_id),
        data: selectedRows.map(r => ({ ...r, tripMode: "RT" }))
      };

      const resp = await fetch(`${backEndUrl}/handover/process/driver/to/customer/bypass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });

      if (resp.ok) {
        message.success("Checkout berhasil!");
        setIsModalOpen(false);
        setSelectedRows([]);
        setSelectedRowKeys([]);
        fetchData();
      }
    } catch (err) {
      message.error("Terjadi error saat checkout.");
    }
  };

  return isMobile ? <CheckOutMobile /> : (
    <LayoutGlobal>
      {/* FILTER CARD */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <div>
            <div style={{ fontSize: "12px", marginBottom: "4px" }}>No SJ:</div>
            <Input
              placeholder="Cari No SJ..."
              value={searchNoSJ}
              onChange={(e) => setSearchNoSJ(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
          </div>
          <div>
            <div style={{ fontSize: "12px", marginBottom: "4px" }}>Tanggal Plan:</div>
            <RangePicker
              onChange={(dates) => setSearchDateRange(dates)}
              format="DD-MM-YYYY"
            />
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
          </div>
        </Space>
      </Card>

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={filteredData}
        bordered
        loading={loading}
        pagination={{
          ...pagination,
          total: filteredData.length,
          onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
        }}
      />

      <div style={{ marginTop: 16 }}>
        <Button
          type="primary"
          disabled={selectedRows.length === 0}
          onClick={() => setIsModalOpen(true)}
          icon={<SendOutlined />}
        >
          Penyerahan ({selectedRows.length})
        </Button>
      </div>

      {/* MODAL CONFIRM */}
      <Modal
        title="Confirm Check Out"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleSubmit}
        okText="Submit"
      >
        <p>Anda akan memproses <strong>{selectedRows.length}</strong> dokumen.</p>
        <ul style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {selectedRows.map(r => <li key={r.key}>{r.documentno} - {r.customer}</li>)}
        </ul>
      </Modal>

      {/* MODAL CANCEL */}
      <Modal
        title="Confirm Cancel"
        open={isModalCancelOpen}
        onOk={async () => {
          const res = await axios.post(`${backEndUrl}/tms/req/cancel`, { itemToCancel, noteCancel }, { withCredentials: true });
          if (res.data.success) {
            notification.success({ message: 'Berhasil', description: 'Request cancel dikirim' });
            fetchData();
          }
          setIsModalCancelopen(false);
          setNoteCancel("");
        }}
        onCancel={() => setIsModalCancelopen(false)}
        okButtonProps={{ disabled: !noteCancel.trim() }}
      >
        <p>Alasan cancel untuk <strong>{itemToCancel?.documentno}</strong>:</p>
        <TextArea rows={4} value={noteCancel} onChange={(e) => setNoteCancel(e.target.value)} />
      </Modal>
    </LayoutGlobal>
  );
}