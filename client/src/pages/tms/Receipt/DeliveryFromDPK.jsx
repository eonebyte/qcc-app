import { useEffect, useState, useMemo } from "react";
import { CheckOutlined, CloseOutlined, SearchOutlined } from "@ant-design/icons";
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
import { useSelector } from "react-redux";
import useIsMobile from "../../../hooks/useIsMobile";
import DeliveryFromDPKMobile from "./DeliveryFromDPKMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const DeliveryFromDPK = () => {
  const isMobile = useIsMobile();
  const user = useSelector((state) => state.auth.user);
  const userId = user.ad_user_id;

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
        `${backEndUrl}/receipt/list/delivery/from/dpk`,
        { withCredentials: true },
      );
      if (res.data.data && res.data.data.success) {
        const rawBundles = res.data.data.data || [];

        const processedData = rawBundles
          .map((bundle) => {
            const processedShipments = bundle.shipments
              .map((shipment) => ({
                ...shipment,
                key: shipment.m_inout_id,
                checked: false,
                clickCount: 0,
                bundleNo: bundle.bundleNo,
                arrived: false,
              }))
              .filter((shipment) => {
                if (Number(shipment.checkpoin_id) === 4) {
                  return shipment.driverby === userId;
                }
                return true;
              });

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
          dayjs(bundle.created).isSame(filterDate, 'day');

        if (!matchesDate) return null;

        // filter shipment hanya berdasarkan text
        const matchingShipments = bundle.shipments.filter((s) => {
          if (!searchText) return true;

          return (
            s.documentno?.toLowerCase().includes(lowerSearch) ||
            s.customer?.toLowerCase().includes(lowerSearch) ||
            s.drivername?.toLowerCase().includes(lowerSearch)
          );
        });

        // bundle match by text
        const isBundleMatch =
          !searchText ||
          bundle.bundleNo?.toLowerCase().includes(lowerSearch);

        if (isBundleMatch) return bundle;

        if (matchingShipments.length > 0) {
          return { ...bundle, shipments: matchingShipments };
        }

        return null;
      })
      .filter(Boolean);
  }, [data, searchText, filterDate]);


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
              return {
                ...shipment,
                checked: newChecked,
                clickCount: newClickCount,
              };
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

  // Menggunakan filteredData untuk perhitungan counter
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
    if (selectedBundlesForSubmit.length === 0) return;

    setIsSubmitting(true);
    try {
      const filteredBundles = selectedBundlesForSubmit
        .map((bundle) => ({
          ...bundle,
          shipments: bundle.shipments.filter((s) => s.checked),
        }))
        .filter((bundle) => bundle.shipments.length > 0);

      if (filteredBundles.length === 0) {
        notification.warning({
          message: "Tidak ada data untuk dikirim",
          description: "Semua shipment tidak dicentang.",
        });
        setIsSubmitting(false);
        return;
      }

      const payload = { data: filteredBundles };

      const res = await axios.post(
        `${backEndUrl}/receipt/process/delivery/from/dpk`,
        payload,
        { withCredentials: true },
      );

      if (res.data.success) {
        notification.success({
          message: "Sukses",
          description: "Data berhasil diterima.",
        });
        fetchData();
        setSearchText("");
        setFilterDate(null);
      } else {
        notification.error({
          message: "Gagal",
          description: res.data.message || "Terjadi kesalahan.",
        });
      }
    } catch (error) {
      console.error("Submit error:", error);
      notification.error({
        message: "Accept Gagal",
        description: error.response?.data?.message || "Silakan coba lagi.",
      });
    } finally {
      setIsSubmitting(false);
      setIsConfirmModalOpen(false);
      setSelectedBundlesForSubmit([]);
    }
  };

  const showModalReject = (shipment) => {
    setItemToReject(shipment);
    setIsModalRejectOpen(true);
  };

  const handleRejectOk = async () => {
    try {
      const res = await axios.post(`${backEndUrl}/tms/reject`, itemToReject, {
        withCredentials: true,
      });

      if (res.data.success) {
        notification.success({
          message: "Info",
          description: `Dokumen ${itemToReject.documentno} berhasil direject.`,
        });
        fetchData(); // Refresh data
      } else {
        notification.error({
          message: "Gagal",
          description: res.data.message || "Terjadi kesalahan.",
        });
      }
    } catch (error) {
      console.log(error);

      notification.error({
        message: "Reject Gagal",
        description: "Silakan coba lagi.",
      });
    } finally {
      setIsModalRejectOpen(false);
      setItemToReject(null);
    }
  };

  const handleRejectCancel = () => {
    setIsModalRejectOpen(false);
    setItemToReject(null);
  };

  const shipmentColumns = () => {
    return [
      {
        title: (
          <Popover content="Klik checked 3 untuk melakukan uncheck">
            <span style={{ cursor: "pointer" }}>Check</span>
          </Popover>
        ),
        key: "action",
        width: 100,
        render: (_, record) => {
          if (record.checked) {
            return (
              <span
                style={{ color: "#389e0d", cursor: "pointer", fontWeight: 'bold' }}
                onClick={() =>
                  handleShipmentClickCount(record.bundleNo, record.key)
                }
              >
                Checked
              </span>
            );
          } else {
            return (
              <Button
                onClick={() =>
                  handleShipmentCheckChange(record.bundleNo, record.key, true)
                }
                icon={<CheckOutlined />}
                size="small"
                type="default"
              ></Button>
            );
          }
        },
      },
      { title: "Document No", dataIndex: "documentno", key: "documentno", render: (text) => <b>{text}</b> },
      { title: "Customer", dataIndex: "customer", key: "customer" },
      { title: "Driver", dataIndex: "drivername", key: "drivername" },
      {
        title: "Plan Time",
        dataIndex: "plantime",
        key: "plantime",
        render: (text) =>
          text ? DateTime.fromISO(text).toFormat("dd-MM-yyyy HH:mm") : "N/A",
      },
      {
        title: "Action",
        key: "action",
        width: 100,
        render: (_, record) => (
          <Button
            onClick={() => showModalReject(record)}
            icon={<CloseOutlined />}
            size="small"
            danger
          >
            Reject
          </Button>
        ),
      },
    ];
  };

  const mainColumns = [
    {
      title: "",
      key: "selection",
      width: 50,
      align: "center",
      render: (_, record) => {
        const allChecked =
          record.shipments.length > 0 &&
          record.shipments.every((s) => s.checked);
        const isSelected =
          record.shipments.length > 0 &&
          record.shipments.every((s) => s.arrived);
        return (
          <Checkbox
            checked={isSelected}
            onChange={(e) =>
              handleBundleSelectionChange(record.bundleNo, e.target.checked)
            }
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
      render: (_, __, index) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    { title: "Bundle No", dataIndex: "bundleNo", key: "bundleNo" },
    {
      title: "Date Handover",
      dataIndex: "created",
      key: "created",
      render: (text) =>
        DateTime.fromISO(text)
          .plus({ hours: 7 })
          .toFormat("dd-MM-yyyy HH:mm:ss"),
    },
    {
      title: "Total Shipments",
      dataIndex: "shipments",
      key: "shipments_count",
      align: "center",
      render: (shipments) => <Tag color="blue">{shipments.length} Docs</Tag>,
    },
  ];

  const totalShipmentsInSelectedBundles = selectedBundlesForSubmit.reduce(
    (acc, bundle) => acc + bundle.shipments.length,
    0,
  );

  return isMobile ? (
    <DeliveryFromDPKMobile />
  ) : (
    <LayoutGlobal>
      {/* FILTER SECTION */}
      <div style={{ marginBottom: 0, background: '#fff', padding: '10px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
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
        rowClassName={() => "main-bundle-row"}
        expandable={{
          expandedRowRender: (record) => (
            <div
              style={{
                padding: "12px 24px",
                backgroundColor: "#fafafa",
              }}
            >
              <Table
                columns={shipmentColumns()}
                dataSource={record.shipments}
                pagination={false}
                size="small"
                bordered
              />
            </div>
          ),
          rowExpandable: (record) =>
            record.shipments && record.shipments.length > 0,
        }}
      />

      <div
        style={{
          marginTop: 16,
          padding: "16px",
          background: "#fff",
          borderTop: "1px solid #f0f0f0",
          textAlign: 'right'
        }}
      >
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

      <Modal
        title={`Confirm Handover (${totalShipmentsInSelectedBundles} items from ${selectedBundlesForSubmit.length} bundles)`}
        open={isConfirmModalOpen}
        onOk={executeSubmit}
        onCancel={() => setIsConfirmModalOpen(false)}
        confirmLoading={isSubmitting}
      >
        <p>Anda akan menyerahkan semua surat jalan dari bundle yang dipilih. Lanjutkan?</p>
        <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 16, border: "1px solid #f0f0f0", padding: "8px" }}>
          {selectedBundlesForSubmit.map((bundle) => (
            <div key={bundle.key} style={{ marginBottom: "12px" }}>
              <strong>Bundle: {bundle.bundleNo}</strong>
              <ul style={{ paddingLeft: "20px", margin: "4px 0 0 0" }}>
                {bundle.shipments.map((item) => (
                  <li key={item.key}>{item.documentno}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        title="Confirm Reject"
        open={isModalRejectOpen}
        onOk={handleRejectOk}
        onCancel={handleRejectCancel}
      >
        <p>Apakah Anda yakin akan mereject dokumen <b>{itemToReject?.documentno}</b>?</p>
      </Modal>
    </LayoutGlobal>
  );
};

export default DeliveryFromDPK;