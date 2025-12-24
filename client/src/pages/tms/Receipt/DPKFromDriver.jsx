import { useEffect, useState, useMemo } from "react";
import { CheckOutlined, CloseOutlined, SearchOutlined, CalendarOutlined } from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Modal,
  Popover,
  Table,
  Typography,
  notification,
  Input,
  Space,
  DatePicker,
  Tag,
} from "antd";
import axios from "axios";
import { DateTime } from "luxon";
import dayjs from "dayjs";
import LayoutGlobal from "../../../components/layouts/LayoutGlobal";
import useIsMobile from "../../../hooks/useIsMobile";
import DPKFromDriverMobile from "./DPKFromDriverMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const DPKFromDriver = () => {
  const isMobile = useIsMobile();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  // States untuk Filter
  const [searchText, setSearchText] = useState("");
  const [filterDate, setFilterDate] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [selectedBundlesForSubmit, setSelectedBundlesForSubmit] = useState([]);
  const [isModalRejectOpen, setIsModalRejectOpen] = useState(false);
  const [itemToReject, setItemToReject] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${backEndUrl}/receipt/list/dpk/from/driver`,
        { withCredentials: true },
      );
      if (res.data.data && res.data.data.success) {
        const rawBundles = res.data.data.data || [];

        const processedData = rawBundles
          .map((bundle) => {
            const processedShipments = bundle.shipments.map((shipment) => ({
              ...shipment,
              key: shipment.m_inout_id,
              checked: false,
              clickCount: 0,
              bundleNo: bundle.bundleNo,
              arrived: false,
            }));

            return {
              ...bundle,
              key: bundle.bundleNo,
              shipments: processedShipments,
            };
          })
          .filter((bundle) => bundle.shipments.length > 0);

        setData(processedData);
      } else {
        setData([]);
        notification.warning({
          message: "Info",
          description: res.data.data.message || "No data found",
        });
      }
    } catch (err) {
      console.error(err);
      notification.error({
        message: "Error",
        description: "Failed to fetch data",
      });
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIC FILTERING (SEARCH + DATE) ---
  const filteredData = useMemo(() => {
    const lowerSearch = searchText.toLowerCase();

    return data
      .map((bundle) => {
        // ✅ filter tanggal dari bundle.created
        const matchesDate =
          !filterDate ||
          dayjs(bundle.created).isSame(filterDate, "day");

        if (!matchesDate) return null;

        // filter shipment hanya by text
        const matchingShipments = bundle.shipments.filter((s) => {
          if (!searchText) return true;

          return (
            s.documentno?.toLowerCase().includes(lowerSearch) ||
            s.customer?.toLowerCase().includes(lowerSearch)
          );
        });

        // bundle match by text
        const isBundleMatch =
          !searchText ||
          bundle.bundleNo?.toLowerCase().includes(lowerSearch) ||
          bundle.drivername?.toLowerCase().includes(lowerSearch);

        if (isBundleMatch) return bundle;

        if (matchingShipments.length > 0) {
          return { ...bundle, shipments: matchingShipments };
        }

        return null;
      })
      .filter(Boolean);
  }, [data, searchText, filterDate]);


  // --- HANDLERS ---
  const handleShipmentCheckChange = (bundleNo, shipmentKey, checked) => {
    setData((prevData) =>
      prevData.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const updatedShipments = bundle.shipments.map((shipment) => {
            if (shipment.key === shipmentKey) {
              return { ...shipment, checked };
            }
            return shipment;
          });
          return { ...bundle, shipments: updatedShipments };
        }
        return bundle;
      }),
    );
  };

  const handleShipmentClickCount = (bundleNo, shipmentKey) => {
    setData((prevData) =>
      prevData.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const updatedShipments = bundle.shipments.map((shipment) => {
            if (shipment.key === shipmentKey) {
              let newClickCount = shipment.clickCount + 1;
              let newChecked = shipment.checked;
              if (newClickCount >= 3) {
                newChecked = false;
                newClickCount = 0;
              }
              return { ...shipment, checked: newChecked, clickCount: newClickCount };
            }
            return shipment;
          });
          return { ...bundle, shipments: updatedShipments };
        }
        return bundle;
      }),
    );
  };

  const handleBundleSelectionChange = (bundleNo, checked) => {
    setData((prevData) =>
      prevData.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const updatedShipments = bundle.shipments.map((shipment) => ({
            ...shipment,
            arrived: checked,
          }));
          return { ...bundle, shipments: updatedShipments };
        }
        return bundle;
      }),
    );
  };

  const bundleCountSelected = filteredData.filter(
    (b) => b.shipments.length > 0 && b.shipments.every((s) => s.arrived),
  ).length;

  const handleOpenConfirmModal = () => {
    const selectedBundles = filteredData.filter(
      (bundle) =>
        bundle.shipments.length > 0 &&
        bundle.shipments.every((shipment) => shipment.arrived),
    );

    if (selectedBundles.length === 0) {
      notification.warning({
        message: "Tidak Ada Item Dipilih",
        description: "Silakan pilih setidaknya satu bundle.",
      });
      return;
    }
    setSelectedBundlesForSubmit(selectedBundles);
    setIsConfirmModalOpen(true);
  };

  const executeSubmit = async () => {
    setIsSubmitting(true);
    try {
      const payloadData = selectedBundlesForSubmit.map((bundle) => ({
        ...bundle,
        shipments: bundle.shipments.filter((s) => s.checked),
      })).filter(bundle => bundle.shipments.length > 0);

      const res = await axios.post(
        `${backEndUrl}/receipt/process/dpk/from/driver`,
        { data: payloadData },
        { withCredentials: true },
      );

      if (res.data.success) {
        notification.success({ message: "Sukses", description: "Data berhasil diterima." });
        fetchData();
        setSearchText("");
        setFilterDate(null);
      }
    } catch (error) {
      console.log(error);

      notification.error({ message: "Gagal", description: "Terjadi kesalahan." });
    } finally {
      setIsSubmitting(false);
      setIsConfirmModalOpen(false);
    }
  };

  const showModalReject = (shipment) => {
    setItemToReject(shipment);
    setIsModalRejectOpen(true);
  };

  const handleRejectOk = async () => {
    try {
      const res = await axios.post(`${backEndUrl}/tms/reject`, itemToReject, { withCredentials: true });
      if (res.data.success) {
        notification.success({ message: "Info", description: `Dokumen direject.` });
        fetchData();
      }
    } catch (err) {
      console.log(err);

      notification.error({ message: "Reject Gagal" });
    } finally {
      setIsModalRejectOpen(false);
      setItemToReject(null);
    }
  };

  // --- COLUMNS ---
  const shipmentColumns = () => [
    {
      title: (
        <Popover content="Klik 'Checked' 3x untuk uncheck">
          <span style={{ cursor: "pointer" }}>Check</span>
        </Popover>
      ),
      key: "check_action",
      width: 100,
      render: (_, record) => (
        record.checked ? (
          <span
            style={{ color: "#389e0d", cursor: "pointer", fontWeight: 'bold' }}
            onClick={() => handleShipmentClickCount(record.bundleNo, record.key)}
          >
            Checked
          </span>
        ) : (
          <Button
            onClick={() => handleShipmentCheckChange(record.bundleNo, record.key, true)}
            icon={<CheckOutlined />}
            size="small"
          />
        )
      ),
    },
    { title: "Document No", dataIndex: "documentno", key: "documentno", render: (text) => <b>{text}</b> },
    { title: "Customer", dataIndex: "customer", key: "customer" },
    {
      title: "Plan Time",
      dataIndex: "plantime",
      key: "plantime",
      render: (text) => text ? DateTime.fromISO(text).toFormat("dd-MM-yyyy HH:mm") : "N/A",
    },
    {
      title: "Action",
      key: "action",
      width: 100,
      render: (_, record) => (
        <Button onClick={() => showModalReject(record)} icon={<CloseOutlined />} size="small" danger>Reject</Button>
      ),
    },
  ];

  const mainColumns = [
    {
      title: "",
      key: "selection",
      width: 50,
      align: "center",
      render: (_, record) => {
        const allChecked = record.shipments.length > 0 && record.shipments.every((s) => s.checked);
        const isSelected = record.shipments.length > 0 && record.shipments.every((s) => s.arrived);
        return (
          <Checkbox
            checked={isSelected}
            onChange={(e) => handleBundleSelectionChange(record.bundleNo, e.target.checked)}
            disabled={!allChecked}
          />
        );
      },
    },
    {
      title: "No",
      key: "no",
      width: 70,
      align: "center",
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    { title: "Bundle No", dataIndex: "bundleNo", key: "bundleNo" },
    { title: "Driver Pengirim", dataIndex: "drivername", key: "drivername" },
    { title: "Driver Penerima", dataIndex: "drivername_receipt", key: "drivername_receipt" },
    { title: "TNKB", dataIndex: "plat_nomor", key: "plat_nomor" },
    {
      title: "Date Handover",
      dataIndex: "created",
      key: "created",
      render: (text) => text ? DateTime.fromISO(text).plus({ hours: 7 }).toFormat("dd-MM-yyyy HH:mm") : "N/A",
    },
    {
      title: "Total Shipments",
      dataIndex: "shipments",
      key: "shipments_count",
      align: "center",
      render: (shipments) => <Tag color="blue">{shipments.length} Docs</Tag>,
    },
  ];

  return isMobile ? (
    <DPKFromDriverMobile />
  ) : (
    <LayoutGlobal>
      {/* FILTER SECTION */}
      <div style={{ marginBottom: 16, background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <Space size="middle">
          <Input
            placeholder="Cari SJ / Bundle / Customer / Driver..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 350 }}
            allowClear
          />
          <DatePicker
            placeholder="Filter Tanggal Plan"
            format="DD-MM-YYYY"
            onChange={(date) => setFilterDate(date)}
            value={filterDate}
            style={{ width: 200 }}
          />
          {(searchText || filterDate) && (
            <Button type="link" onClick={() => { setSearchText(""); setFilterDate(null); }}>
              Reset Filter
            </Button>
          )}
        </Space>
      </div>

      <Table
        columns={mainColumns}
        dataSource={filteredData}
        loading={loading}
        pagination={pagination}
        onChange={(p) => setPagination(p)}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: "12px 24px", background: "#fafafa" }}>
              <Table
                columns={shipmentColumns()}
                dataSource={record.shipments}
                pagination={false}
                size="small"
                bordered
              />
            </div>
          ),
        }}
      />

      <div style={{ marginTop: 16, padding: "16px", background: "#fff", borderTop: "1px solid #f0f0f0", textAlign: 'right' }}>
        <Button
          type="primary"
          size="large"
          onClick={handleOpenConfirmModal}
          disabled={bundleCountSelected === 0 || isSubmitting}
          loading={isSubmitting}
          style={{ borderRadius: '6px', fontWeight: 'bold' }}
        >
          Accept ({bundleCountSelected} Selected)
        </Button>
      </div>

      {/* MODALS preserved from previous code... */}
      <Modal
        title="Confirm Receipt"
        open={isConfirmModalOpen}
        onOk={executeSubmit}
        onCancel={() => setIsConfirmModalOpen(false)}
        confirmLoading={isSubmitting}
      >
        <p>Terima semua surat jalan dari bundle yang dipilih? Lanjutkan?</p>
      </Modal>

      <Modal
        title="Confirm Reject"
        open={isModalRejectOpen}
        onOk={handleRejectOk}
        onCancel={() => setIsModalRejectOpen(false)}
      >
        <p>Reject dokumen <b>{itemToReject?.documentno}</b>?</p>
      </Modal>
    </LayoutGlobal>
  );
};

export default DPKFromDriver;