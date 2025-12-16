import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Input,
  Space,
  Table,
  Modal,
  message,
  Switch,
  notification,
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  SearchOutlined,
  SendOutlined,
} from "@ant-design/icons";
import Highlighter from "react-highlight-words";
import dayjs from "dayjs";
import LayoutGlobal from "../../../components/layouts/LayoutGlobal";
import axios from "axios";
import useIsMobile from "../../../hooks/useIsMobile";
import DeliveryToMKTMobile from "./DeliveryToMKTMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function DeliveryToMKT() {
  const isMobile = useIsMobile();

  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);

  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
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

  const [isModalConfirmOpen, setIsModalConfirmopen] = useState(false);
  const [itemToConfirm, setItemToConfirm] = useState(null);

  const [isModalRejectCancelOpen, setIsModalRejectCancelopen] = useState(false);
  const [itemToRejectCancel, setItemToRejectCancel] = useState(null);

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
      close,
    }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
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

  const showModalConfirm = (shipment) => {
    setItemToConfirm(shipment);
    setIsModalConfirmopen(true);
  };

  const showModalRejectCancel = (shipment) => {
    setItemToRejectCancel(shipment);
    setIsModalRejectCancelopen(true);
  };

  const handleConfirmOk = async () => {
    try {
      const res = await axios.post(
        `${backEndUrl}/tms/cancel/mkt`,
        itemToConfirm,
        { withCredentials: true },
      );

      if (res.data.success) {
        notification.success({
          message: "Info",
          description: `Dokumen ${itemToConfirm.documentno} akan diproses untuk dicancel.`,
        });
        fetchData();
      } else {
        notification.error({
          message: "Gagal",
          description: res.data.message || "Terjadi kesalahan.",
        });
      }
    } catch (error) {
      console.error("Submit error:", error);
      notification.error({
        message: "cancel Gagal",
        description: error.response?.data?.message || "Silakan coba lagi.",
      });
    } finally {
      setIsModalConfirmopen(false);
      setItemToConfirm(null);
    }
  };

  const handleConfirmClose = () => {
    setIsModalConfirmopen(false);
    setItemToConfirm(null);
  };

  const handleRejectCancelOk = async () => {
    console.log("reject canceling item:", itemToRejectCancel);
    try {
      const res = await axios.post(
        `${backEndUrl}/tms/reject/req/cancel/mkt`,
        itemToRejectCancel,
        { withCredentials: true },
      );

      if (res.data.success) {
        notification.success({
          message: "Info",
          description: `Dokumen ${itemToRejectCancel.documentno} akan diproses untuk dicancel.`,
        });
        fetchData();
      } else {
        notification.error({
          message: "Gagal",
          description: res.data.message || "Terjadi kesalahan.",
        });
      }
    } catch (error) {
      console.error("Submit error:", error);
      notification.error({
        message: "cancel Gagal",
        description: error.response?.data?.message || "Silakan coba lagi.",
      });
    } finally {
      setIsModalRejectCancelopen(false);
      setItemToRejectCancel(null);
    }
  };

  const handleRejectCancelClose = () => {
    setIsModalConfirmopen(false);
    setItemToConfirm(null);
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
      },
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
      render: (text) => (text ? dayjs(text).format("DD-MM-YYYY HH:mm") : "-"),
    },
    {
      title: "Actions",
      key: "actions",
      width: 120,
      render: (_, record) => {
        console.log("tesss : ", record);
        if (record.checkpoin_id == "11") {
          if (record.cancelrequestmkt == "Y") {
            return (
              <Space>
                <Button
                  onClick={() => showModalConfirm(record)}
                  icon={<CheckOutlined />}
                  size="small"
                  color="cyan"
                  variant="outlined"
                >
                  Confirm Cancel
                </Button>
                <Button
                  onClick={() => showModalRejectCancel(record)}
                  icon={<CloseOutlined />}
                  size="small"
                  danger
                >
                  Reject
                </Button>
              </Space>
            );
          } else {
            return (
              <Tag color={"warning"} variant={"solid"}>
                Waiting
              </Tag>
            );
          }
        } else {
          return "-";
        }
      },
    },
  ];

  // ================== FETCH DATA API ==================
  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${backEndUrl}/handover/list/delivery/to/mkt`, {
        credentials: "include",
      });
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
        cancelrequestmkt: row.cancelrequestmkt,
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
      if (selectedRows.length === 0) {
        message.error("Tidak ada data yang dipilih.");
        return;
      }

      // Ambil nilai driverBy dan tnkbId dari row pertama
      const firstDriver = selectedRows[0].driverby;
      const firstTnkb = selectedRows[0].tnkb_id;

      // Cek apakah semua row punya driverBy yang sama
      const validDriver = selectedRows.every(
        (row) => row.driverby === firstDriver,
      );

      // Cek apakah semua row punya tnkbId yang sama
      const validTnkb = selectedRows.every((row) => row.tnkb_id === firstTnkb);

      if (!validDriver) {
        message.error(
          "Semua data yang dipilih harus memiliki driverBy yang sama!",
        );
        return;
      }

      if (!validTnkb) {
        message.error(
          "Semua data yang dipilih harus memiliki tnkbId yang sama!",
        );
        return;
      }

      const payload = {
        driverId: Number(firstDriver),
        tnkbId: Number(firstTnkb),
        data: selectedRows,
      };

      console.log(JSON.stringify(payload));

      const resp = await fetch(
        `${backEndUrl}/handover/process/delivery/to/mkt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        },
      );

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

  return isMobile ? (
    <DeliveryToMKTMobile />
  ) : (
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
            },
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
            Handover {selectedRows.length > 0 ? `(${selectedRows.length})` : ""}
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

        <Modal
          title="Confirm"
          open={isModalConfirmOpen}
          onOk={handleConfirmOk}
          onCancel={handleConfirmClose}
        >
          <p>
            Apakah Anda yakin akan confirm dokumen{" "}
            <strong>{itemToConfirm?.documentno}</strong>?
          </p>
        </Modal>

        <Modal
          title="Confirm cancel"
          open={isModalRejectCancelOpen}
          onOk={handleRejectCancelOk}
          onCancel={handleRejectCancelClose}
        >
          <p>
            Apakah Anda yakin akan reject cancel dokumen{" "}
            <strong>{itemToRejectCancel?.documentno}</strong>?
          </p>
        </Modal>
      </LayoutGlobal>
    </>
  );
}
