import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Space, Table, Modal, message, Switch, notification, Tag } from "antd";
import { CheckCircleOutlined, CloseOutlined, SearchOutlined, SendOutlined } from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import dayjs from "dayjs";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { setCustomers } from "../../../states/reducers/customerSlice";
import LayoutGlobal from "../../../components/layouts/LayoutGlobal";
import useIsMobile from "../../../hooks/useIsMobile";
import CheckOutMobile from "./CheckOutMobile";

const { TextArea } = Input;

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function CheckoutBypass() {
  const dispatch = useDispatch();

  const isMobile = useIsMobile();

  const user = useSelector((state) => state.auth.user);
  // const userId = user.ad_user_id;
  const userName = user.name;


  const [noteCancel, setNoteCancel] = useState("");



  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);


  // const [driver, setDriver] = useState(null);
  // const [tnkb, setTnkb] = useState(null);


  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10
  });


  // selected rows
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedRowsDropOnly, setSelectedRowsDropOnly] = useState([]);
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
      title: "Driver",
      dataIndex: "drivername",
      key: "drivername",
      ...getColumnSearchProps("drivername"),
    },
    {
      title: "Plan Time",
      dataIndex: "plantime",
      key: "plantime",
      ...getColumnSearchProps("plantime"),
      render: (text) => text ? dayjs(text).format('DD-MM-YYYY HH:mm') : '-',
    },
    {
      title: "Actions",
      key: "actions",
      width: 120,
      render: (_, record) => {
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
        `${backEndUrl}/handover/list/checkin/customer/bypass`,
        { credentials: "include" },
      );
      const json = await resp.json();

      // Debug: Cek di console browser apakah data benar-benar sampai dan apa isinya
      console.log("Raw Response:", json);
      console.log("User Name Redux:", userName);

      // Ambil array dari json.data.data (sesuai struktur response Anda)
      const rawList = json?.data?.data || [];

      const mapped = rawList.map((row, index) => ({
        key: row.m_inout_id, // Gunakan ID unik
        adw_trackingsj_id: row.adw_trackingsj_id,
        m_inout_id: row.m_inout_id,
        no: index + 1,
        documentno: row.documentno,
        customer: row.customer,
        // Perbaikan parsing tanggal agar aman jika plantime null
        plantime: row.plantime ? dayjs(row.plantime).format("YYYY-MM-DD HH:mm") : "-",
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
      message.error("Gagal memuat data: " + err.message);
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

  const validateSelection = (rows) => {
    if (!rows || rows.length === 0) return "Tidak ada data dipilih.";

    // const firstDriver = rows[0].drivername;
    // const firstTnkb = rows[0].tnkb_id;

    // if (!rows.every(row => row.drivername === firstDriver))
    //     return "Driver harus sama.";

    // if (!rows.every(row => row.tnkb_id === firstTnkb))
    //     return "TNKB harus sama.";

    return null;
  };

  const submitRoundTrip = async () => {
    const error = validateSelection(selectedRows);
    if (error) {
      message.error(error);
      return;
    }

    let combinedData = [...selectedRows];

    console.log('to trip or drop : ', selectedRows);
    console.log('drop only : ', selectedRowsDropOnly);

    if (combinedData.length === 0) {
      message.error("Tidak ada data yang dipilih");
      return;
    }

    const payload = {
      driverName: selectedRows[0].drivername,
      tnkbId: Number(selectedRows[0].tnkb_id),
      data: combinedData
    };

    return fetch(`${backEndUrl}/handover/process/driver/to/customer/bypass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include"
    });
  };

  // ================== SUBMIT TO BACKEND ==================
  const handleSubmit = async () => {
    try {
      const resp1 = await submitRoundTrip();

      if (resp1?.ok) console.log("RT OK");

      message.success("Checkout berhasil!");
      setIsModalOpen(false);
      setSelectedRows([]);
      setSelectedRowKeys([]);
      setSelectedRowsDropOnly([]);

      fetchData();
    } catch (err) {
      console.error(err);
      message.error("Terjadi error saat checkout.");
    }
  };

  const handleCancelOk = async () => {
    try {

      const payload = {
        itemToCancel,
        noteCancel
      }

      const res = await axios.post(`${backEndUrl}/tms/req/cancel`, payload, { withCredentials: true });

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

  useEffect(() => {
    if (isModalOpen) {
      const updated = selectedRows.map(r => ({
        ...r,
        tripMode: r.tripMode || "RT"   // default "DO"
      }));
      setSelectedRows(updated);
    }
  }, [isModalOpen]);


  // ================== OPEN MODAL ==================
  return isMobile ? <CheckOutMobile /> :
    <>
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
            style={{ margin: 15 }}
            type="primary"
            disabled={selectedRows.length === 0}
            onClick={openHandoverModal}
            icon={<SendOutlined />}
          >
            Penyerahan
          </Button>
        </div>

        {/* MODAL CONFIRMATION */}
        <Modal
          title="Confirm Check Out"
          open={isModalOpen}
          onCancel={() => setIsModalOpen(false)}
          onOk={handleSubmit}
          okText="Submit"
          cancelText="Cancel"
          width={800}
        >
          <p>Apakah Anda yakin ingin submit berikut:</p>

          <ul>
            {selectedRows.map(r => (
              <li key={r.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                  alignItems: "center",
                  listStyle: "none"
                }}>
                <Space>
                  <CheckCircleOutlined />
                  <span><strong>{r.documentno}</strong></span>
                </Space>
              </li>
            ))}
          </ul>
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
    </>
    ;
}
