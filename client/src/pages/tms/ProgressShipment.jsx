import React, { useState, useEffect } from "react";
import {
  DatePicker,
  Table,
  Steps,
  Typography,
  Spin,
  Modal,
  Button,
  Timeline,
  Input,
  Space,
  message,
} from "antd";
import {
  HourglassOutlined,
  FileTextOutlined,
  CarOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  TeamOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import "./ProgressShipment.css";
import LayoutGlobal from "../../components/layouts/LayoutGlobal";
import { useRef } from "react";
import Highlighter from "react-highlight-words";
import dayjs from "dayjs";

import { utils, writeFileXLSX } from "xlsx";
import useIsMobile from "../../hooks/useIsMobile";
import ProgressShipmentMobile from "./ProgressShipmentMobile";

const { RangePicker } = DatePicker;

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const { Title, Text } = Typography;

const formatDateTime = (isoString) => {
  if (!isoString) return null;
  try {
    return dayjs(isoString).add(7, "hour").format("DD-MM-YYYY HH:mm");
  } catch (error) {
    console.error("Invalid date format:", error);
    return null;
  }
};

const formatTime = (isoString) => {
  if (!isoString) return "-";
  try {
    return dayjs(isoString).add(7, "hour").format("HH:mm");
  } catch (error) {
    console.error("Invalid date format:", error);
    return "-";
  }
};

const stepDefinitions = [
  {
    title: "Delivery",
    icon: <HourglassOutlined style={{ fontSize: 10 }} />,
    handoverKey: "ho_delivery_to_dpk",
    handoverByKey: "ho_delivery_to_dpkby_name",
    acceptKey: "accept_dpk_from_delivery",
    acceptByKey: "accept_dpk_from_deliveryby_name",
    preHandoverText: "HO ke DPK",
    postHandoverText: "Wait Acc. DPK",
  },
  {
    title: "DPK",
    icon: <FileTextOutlined />,
    handoverKey: "ho_dpk_to_driver",
    handoverByKey: "ho_dpk_to_driverby_name",
    acceptKey: "accept_driver_from_dpk",
    acceptByKey: "accept_driver_from_dpkby_name",
    preHandoverText: "Handover ke Driver",
    postHandoverText: "Wait Acc. Driver",
  },
  // { title: 'Driver', icon: <CarOutlined />, handoverKey: 'ho_driver_to_dpk', handoverByKey: 'ho_driver_to_dpkby_name', acceptKey: 'accept_dpk_from_driver', acceptByKey: 'accept_dpk_from_driverby_name', preHandoverText: 'Check In to Customer', postHandoverText: 'Wait Acc. DPK' },
  {
    title: "Driver",
    icon: <CarOutlined />,
    handoverKey: "ho_dpk_to_driver",
    handoverByKey: "ho_dpk_to_driverby_name",
    acceptKey: "accept_driver_from_dpk",
    acceptKeyByPass: "accept_driver_from_delivery", // SESUAI JSON
    acceptByKey: "accept_driver_from_dpkby_name",
    acceptByByPassKey: "accept_driver_from_deliveryby", // SESUAI JSON
    preHandoverText: "Check Out (Customer)",
    postHandoverText: "Wait Diambil",
  },
  {
    title: "Customer",
    icon: <TeamOutlined />,
    handoverKey: "ho_driver_to_dpk",
    handoverByKey: "ho_driver_to_dpkby_name",
    acceptKey: "accept_dpk_from_driver",
    acceptByKey: "accept_dpk_from_driverby_name",
    preHandoverText: "On Customer",
    postHandoverText: "Wait Acc. DPK",
  },
  {
    title: "DPK",
    icon: <FileTextOutlined />,
    handoverKey: "ho_dpk_to_delivery",
    handoverByKey: "ho_dpk_to_deliveryby_name",
    acceptKey: "accept_delivery_from_dpk",
    acceptByKey: "accept_delivery_from_dpkby_name",
    preHandoverText: "Handover ke Delivery",
    postHandoverText: "Wait Acc. Delivery",
  },
  {
    title: "Delivery",
    icon: <HourglassOutlined />,
    handoverKey: "ho_delivery_to_mkt",
    handoverByKey: "ho_delivery_to_mktby_name",
    acceptKey: "accept_mkt_from_delivery",
    acceptByKey: "accept_mkt_from_deliveryby_name",
    preHandoverText: "Handover ke MKT",
    postHandoverText: "Wait Acc. MKT",
  },
  {
    title: "Marketing",
    icon: <AuditOutlined />,
    handoverKey: "ho_mkt_to_fat",
    handoverByKey: "ho_mkt_to_fatby_name",
    acceptKey: "accept_fat_from_mkt",
    acceptByKey: "accept_fat_from_mktby_name",
    preHandoverText: "Handover ke FAT",
    postHandoverText: "Wait Acc. FAT",
  },
  {
    title: "FAT",
    icon: <CheckCircleOutlined />,
    isFinal: true,
    acceptKey: "accept_fat_from_mkt",
    acceptByKey: "accept_fat_from_mktby_name",
  },
];

const headerSteps = stepDefinitions.map((step) => ({ title: step.title }));

const ProgressShipment = () => {
  const isMobile = useIsMobile();
  // State
  const [shipmentData, setShipmentData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 5,
    total: 0,
  });
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [timelineData, setTimelineData] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const searchInput = useRef(null);

  const [dateRange, setDateRange] = useState([null, null]);

  const [filtersState, setFiltersState] = useState({});

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelLogs, setCancelLogs] = useState([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);

  const showTimelineModal = (record) => {
    setTimelineData({ docNo: record.docNo, flow: record.flow });
    setIsModalVisible(true);
  };

  const handleModalClose = () => {
    setIsModalVisible(false);
    setTimelineData(null);
  };

  // transformApiData menerima page & pageSize supaya nomor (no) selalu sesuai
  const transformApiData = (apiData = [], page = 1, pageSize = 20) => {
    if (!Array.isArray(apiData) || apiData.length === 0) return [];

    const startIndex = (page - 1) * pageSize;
    return apiData.map((item, dataIndex) => {
      const id = item.m_inout_id || item.adw_trackingsj_id || dataIndex + startIndex + 1;
      const documentno = item.documentno || "";

      // DETEKSI BYPASS: Jika ada waktu penerimaan driver langsung dari delivery
      const isBypass = !!item.accept_driver_from_delivery;

      // Filter stepDefinitions: Jika bypass, hapus step DPK pertama (index 1)
      const effectiveSteps = stepDefinitions.filter((step, idx) => {
        if (isBypass && idx === 1) return false; // Melewati step DPK
        return true;
      });

      const flow = effectiveSteps.map((step, stepIndex) => {
        // Gunakan key bypass jika tersedia dan data memang bypass
        const acceptKey = (isBypass && step.acceptKeyByPass) ? step.acceptKeyByPass : step.acceptKey;
        const acceptByKey = (isBypass && step.acceptByByPassKey) ? step.acceptByByPassKey : step.acceptByKey;

        const handoverTimestamp = item[step.handoverKey];
        const acceptTimestamp = item[acceptKey];

        const prevStep = stepIndex > 0 ? effectiveSteps[stepIndex - 1] : null;

        // Logika check acceptance sebelumnya
        let isPrevStepAccepted = true;
        if (prevStep) {
          const prevAcceptKey = (isBypass && prevStep.acceptKeyByPass) ? prevStep.acceptKeyByPass : prevStep.acceptKey;
          isPrevStepAccepted = !!item[prevAcceptKey];
        }

        let status = "pending",
          displayValue = "Wait",
          displayTime = "-";

        if (acceptTimestamp) {
          status = "completed";
          displayValue = "Selesai";
          displayTime = formatTime(handoverTimestamp || item.ho_delivery_to_dpk) + " / " + formatTime(acceptTimestamp);
        } else if (isPrevStepAccepted) {
          status = "in_progress";
          if (handoverTimestamp) {
            displayValue = step.postHandoverText;
            displayTime = formatTime(handoverTimestamp);
          } else {
            displayValue = step.preHandoverText;
            // Jika bypass dan ini step Driver, handover time-nya diambil dari ho_delivery_to_dpk
            const prevTime = prevStep ? item[(isBypass && prevStep.acceptKeyByPass) ? prevStep.acceptKeyByPass : prevStep.acceptKey] : "-";
            displayTime = formatTime(prevTime);
          }
        }

        if (step.isFinal && acceptTimestamp) {
          status = "completed";
          displayValue = "Selesai";
          displayTime = formatTime(acceptTimestamp);
        }

        const rawData = {
          handoverTime: handoverTimestamp || (isBypass && step.title === 'Driver' ? item.ho_delivery_to_dpk : null),
          handoverBy: item[step.handoverByKey] || (isBypass && step.title === 'Driver' ? item.ho_delivery_to_dpkby_name : null),
          acceptTime: acceptTimestamp,
          acceptBy: item[acceptByKey],
        };

        // Custom text untuk Driver
        if (step.title === "Driver" && status === "in_progress") {
          if (!item.adw_tms_id) {
            displayValue = "Process Cek Security";
          } else {
            displayValue = isBypass ? "Handover Driver (Bypass)" : "Check Out (Customer)";
          }
        }

        return {
          title: step.title,
          status,
          value: displayValue,
          time: displayTime,
          icon: step.icon,
          rawData,
        };
      });

      return {
        key: String(id),
        m_inout_id: id,
        no: startIndex + dataIndex + 1,
        docNo: documentno,
        customer: item.customer,
        planTime: item.plantime,
        has_cancel_log: item.has_cancel_log,
        adw_trackingsj_id: parseInt(item.adw_trackingsj_id),
        iscancel: item.iscancel,
        isBypass, // Tandai record sebagai bypass
        flow,
      };
    });
  };

  const fetchData = async (
    current = 1,
    pageSize = 10,
    dateRangeParam = dateRange,
    filters = {},
  ) => {
    setLoading(true);

    const params = {
      page: current,
      limit: pageSize,
    };

    if (dateRangeParam && dateRangeParam[0]) {
      params.startDate = dateRangeParam[0].format("YYYY-MM-DD");
    }
    if (dateRangeParam && dateRangeParam[1]) {
      params.endDate = dateRangeParam[1].format("YYYY-MM-DD");
    }

    Object.keys(filters).forEach((key) => {
      if (filters[key]) {
        params[key] = filters[key];
      }
    });

    const queryString = new URLSearchParams(params).toString();

    try {
      const res = await fetch(`${backEndUrl}/tms/history?${queryString}`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const result = await res.json();

      // Robust parsing: terima banyak bentuk response
      let payload = [];
      let meta = {};

      // candidate arrays in preference order
      const candidates = [
        result?.data?.data,
        result?.data,
        result?.items,
        result?.result,
        result,
      ];

      for (const c of candidates) {
        if (Array.isArray(c)) {
          payload = c;
          break;
        }
      }

      // attempt to find meta/total
      meta = result?.data?.meta || result?.meta || result?.pagination || {};

      // fallback if payload still empty (safeguard)
      if (!Array.isArray(payload)) payload = [];

      const transformed = transformApiData(payload, current, pageSize);

      console.log("transformed : ", transformed);

      setShipmentData(transformed);

      // determine total count from various possible keys
      const totalFromMeta = meta?.total || meta?.count || result?.total || 0;

      setPagination((prev) => ({
        ...prev,
        current: meta?.current_page || current,
        pageSize: meta?.per_page || pageSize,
        total: Number(totalFromMeta),
      }));
    } catch (error) {
      console.error("Gagal mengambil data dari API:", error);
    } finally {
      setLoading(false);
    }
  };

  const getMainStatus = (item) => {
    if (item.has_cancel_log) return "CANCEL";

    if (item.accept_fat_from_mkt) return "SELESAI (FAT)";
    if (item.ho_mkt_to_fat) return "DI MARKETING";
    if (item.accept_customer_from_driver) return "DITERIMA CUSTOMER";
    if (item.ho_driver_to_customer) return "DI CUSTOMER";
    if (item.ho_dpk_to_driver) return "DI DRIVER";

    return "PROSES";
  };

  const getCancelSummary = (item) => {
    if (!item.has_cancel_log) {
      return {
        cancel_reason: "-",
        cancel_by: "-",
        cancel_date: "-",
      };
    }

    // fallback dari notes / notesmkt
    return {
      cancel_reason: item.notes || "-",
      cancel_by: "SYSTEM",
      cancel_date: "-",
    };
  };

  // --- HANDLE EXPORT EXCEL ---
  const handleExportExcel = async () => {
    setExportLoading(true);
    try {
      // 1. Siapkan Parameter "Unlimited"
      // Backend akan mendeteksi limit 0 sebagai instruksi untuk mengambil semua data
      // dan menangani pemecahan query (chunking) secara internal.
      const params = {
        page: 0,
        limit: 0,
      };

      // 2. Tambahkan Tanggal
      if (dateRange && dateRange[0]) {
        params.startDate = dateRange[0].format("YYYY-MM-DD");
      }
      if (dateRange && dateRange[1]) {
        params.endDate = dateRange[1].format("YYYY-MM-DD");
      }

      // 3. Tambahkan Filter Pencarian
      if (filtersState && Object.keys(filtersState).length > 0) {
        Object.entries(filtersState).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            params[key] = value;
          }
        });
      }

      const queryString = new URLSearchParams(params).toString();
      console.log("Exporting All Data...", queryString);

      // 4. Fetch Data
      const res = await fetch(`${backEndUrl}/tms/history?${queryString}`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Gagal mengambil data untuk export");
      const result = await res.json();

      // 5. Extract Data
      let rawData = [];
      const candidates = [
        result?.data?.data,
        result?.data,
        result?.items,
        result?.result,
        result,
      ];
      for (const c of candidates) {
        if (Array.isArray(c)) {
          rawData = c;
          break;
        }
      }

      if (!rawData || rawData.length === 0) {
        Modal.warning({
          title: "Tidak Ada Data",
          content: "Tidak ada data untuk diexport.",
        });
        return;
      }

      // 6. Formatting Data Excel
      const excelData = rawData.map((item, index) => ({
        No: index + 1,
        Customer: item.customer,
        "No. Surat Jalan": item.documentno,
        "Tanggal Plan": formatDateTime(item.plantime),

        Status: getMainStatus(item),

        "Cancel Logs": item.cancel_logs || "-",
      }));

      // 7. Generate Excel File
      const worksheet = utils.json_to_sheet(excelData);
      const wscols = Object.keys(excelData[0]).map(() => ({ wch: 20 }));
      worksheet["!cols"] = wscols;

      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, "Shipment Report");

      const startDateName =
        dateRange && dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : "All";
      const fileName = `Report_Shipment_${startDateName}.xlsx`;

      writeFileXLSX(workbook, fileName);
      message.success(`Berhasil export ${rawData.length} data ke Excel`);
    } catch (error) {
      console.error("Export Error:", error);
      message.error("Gagal melakukan export excel: " + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  const handleTableChange = (pag, filters, sorter, extra) => {
    // PERBAIKAN: Cegah double fetch.
    // Jika action adalah 'filter', kita abaikan di sini karena handleSearch
    // atau handleReset yang akan melakukan fetch secara manual dengan data yang akurat.
    if (extra.action === "filter") return;

    fetchData(pag.current, pag.pageSize, dateRange, filtersState);
  };

  useEffect(() => {
    if (!cancelModalOpen || !selectedDoc) return;

    console.log("selected doc : ", selectedDoc);

    const fetchCancelLogs = async () => {
      setCancelLoading(true);
      setCancelLogs([]);

      try {
        const res = await fetch(
          `${backEndUrl}/tms/cancel-log?adw_trackingsj_id=${selectedDoc.adw_trackingsj_id}`,
          { credentials: "include" },
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const result = await res.json();

        console.log("cancel logs : ", result);

        // fleksibel terhadap bentuk response backend
        const data =
          result?.data?.data || result?.items || result?.result || [];

        setCancelLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Fetch cancel log error:", err);
        message.error("Gagal mengambil log cancel");
        setCancelLogs([]);
      } finally {
        setCancelLoading(false);
      }
    };

    fetchCancelLogs();
  }, [cancelModalOpen, selectedDoc]);

  useEffect(() => {
    // initial load
    fetchData(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (selectedKeys, confirm, dataIndex) => {
    // 1. Simpan ke state (untuk keperluan pagination nanti & export)
    const newFilters = { ...filtersState, [dataIndex]: selectedKeys[0] };
    setFiltersState(newFilters);
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);

    // 2. Close dropdown UI
    confirm();

    // 3. Fetch manual dengan data filter YANG BARU (jangan pakai filtersState karena async)
    // Reset ke page 1 setiap kali search
    await fetchData(1, pagination.pageSize, dateRange, newFilters);
  };

  const handleReset = (clearFilters, dataIndex, confirm) => {
    clearFilters();
    setSearchText("");

    // Hapus filter dari state
    const newFilters = { ...filtersState };
    delete newFilters[dataIndex];
    setFiltersState(newFilters);

    // Close dropdown & trigger UI update
    confirm();

    // Fetch ulang data bersih
    fetchData(1, pagination.pageSize, dateRange, newFilters);
  };

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
            onClick={() => clearFilters && handleReset(clearFilters, dataIndex)}
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
          <Button
            type="link"
            size="small"
            onClick={() => {
              close();
            }}
          >
            Close
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => (
      <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />
    ),
    // onFilter: (value, record) => record[dataIndex]?.toString().toLowerCase().includes(value.toLowerCase()),
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

  const columns = [
    { title: "No", dataIndex: "no", key: "no" },
    {
      title: "Customer",
      dataIndex: "customer",
      key: "customer",
      ...getColumnSearchProps("customer"),
    },
    {
      title: "No. Doc",
      dataIndex: "docNo",
      key: "docNo",
      ...getColumnSearchProps("docNo"),
      render: (text, record) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => showCancelLogModal(record)}
        >
          {text}
        </Button>
      ),
    },
    // {
    //   title: "Notes",
    //   dataIndex: "notes",
    //   key: "notes",
    //   ...getColumnSearchProps("notes"),
    // },
    {
      title: "Date",
      dataIndex: "planTime",
      key: "planTime",
      ...getColumnSearchProps("planTime"),
      render: (value) => (value ? dayjs(value).format("YYYY-MM-DD") : ""),
      sorter: (a, b) => dayjs(a.planTime).unix() - dayjs(b.planTime).unix(),
      sortDirections: ["ascend", "descend"],
    },
    {
      title: (
        <Steps
          initial={1}
          size="small"
          progressDot
          items={headerSteps}
          className="timeline-header-steps"
        />
      ),
      dataIndex: "flow",
      key: "flow",
      render: (flow, record) => {
        const currentStepIndex = flow.findIndex(
          (step) => step.status === "in_progress",
        );
        const stepItems = flow.map((step) => {
          let antdStatus, valueColor, finalIcon;
          if (step.status === "completed") {
            antdStatus = "finish";
            valueColor = "#389e0d";
            finalIcon = <CheckCircleOutlined style={{ color: valueColor }} />;
          } else if (step.status === "in_progress") {
            antdStatus = "process";
            valueColor = "#1890ff";
            // jangan render Spin untuk semua baris besar jika performance jadi issue
            finalIcon = (
              <Spin
                indicator={React.cloneElement(step.icon, {
                  style: { fontSize: "18px", color: valueColor },
                  spin: true,
                })}
              />
            );
          } else {
            antdStatus = "wait";
            valueColor = "rgba(0, 0, 0, 0.45)";
            finalIcon = React.cloneElement(step.icon, {
              style: { color: "rgba(0, 0, 0, 0.25)" },
            });
          }
          return {
            status: antdStatus,
            icon: finalIcon,
            title: <>{step.title}</>,
            description: (
              <Button
                type="link"
                size="small"
                style={{
                  padding: 0,
                  height: "auto",
                  lineHeight: "inherit",
                  textAlign: "left",
                }}
                onClick={() => showTimelineModal(record)}
              >
                <Text
                  strong
                  className="step-value"
                  style={{ color: valueColor, marginTop: 0 }}
                >
                  <span>{step.value || "Wait"}</span>
                </Text>
              </Button>
            ),
          };
        });
        return (
          <Steps
            size="small"
            current={currentStepIndex}
            items={stepItems}
            labelPlacement="vertical"
            className="compact-timeline-steps"
          />
        );
      },
    },
  ];

  const showCancelLogModal = (record) => {
    setSelectedDoc(record);
    setCancelModalOpen(true);
  };

  return isMobile ? (
    <ProgressShipmentMobile />
  ) : (
    <LayoutGlobal>
      <div style={{ padding: 10 }}>
        <Space style={{ marginBottom: 16 }}>
          <RangePicker
            format="YYYY-MM-DD"
            onChange={(dates) => {
              setDateRange(dates); // hanya simpan, jangan fetch
            }}
          />
          <Button
            icon={<SearchOutlined />}
            type="primary"
            onClick={() => fetchData(1, pagination.pageSize, dateRange)}
          ></Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportExcel}
            loading={exportLoading}
          ></Button>
        </Space>

        {/* <Title level={4}>Progress Pengiriman Dokumen</Title> */}
        <Table
          className="surat-jalan-table"
          columns={columns}
          dataSource={shipmentData}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} dari ${total}`,
          }}
          loading={loading}
          onChange={handleTableChange}
          bordered
          scroll={{ x: "max-content" }}
          rowKey={(record) => record.m_inout_id || record.key}
          rowClassName={(record) =>
            record.has_cancel_log ? "row-cancelled" : ""
          }
        />

        {timelineData && (
          <Modal
            title={`Timeline Dokumen: ${timelineData.docNo}`}
            open={isModalVisible}
            onCancel={handleModalClose}
            footer={[
              <Button key="close" onClick={handleModalClose}>
                Tutup
              </Button>,
            ]}
            width={600}
          >
            <Timeline mode="left" style={{ paddingLeft: 0 }}>
              {[...timelineData.flow].reverse().map((step, index) => {
                const handoverTime = formatDateTime(step.rawData.handoverTime);
                const acceptTime = formatDateTime(step.rawData.acceptTime);

                if (!handoverTime && !acceptTime) return null;

                return (
                  <Timeline.Item key={index} dot={<ClockCircleOutlined />}>
                    <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                      {step.title} {timelineData.isBypass && step.title === "Driver" ? "(Direct from Delivery)" : ""}
                    </div>

                    <div style={{ display: "flex", gap: "16px" }}>
                      {handoverTime && (
                        <span>
                          <strong>HO:</strong> {handoverTime}
                          {step.rawData.handoverBy && ` by ${step.rawData.handoverBy}`}
                        </span>
                      )}
                      {acceptTime && (
                        <span>
                          <strong>Receipt:</strong> {acceptTime}
                          {step.rawData.acceptBy && ` by ${step.rawData.acceptBy}`}
                        </span>
                      )}
                    </div>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          </Modal>
        )}

        <Modal
          title={`Log Cancel Dokumen: ${selectedDoc?.docNo}`}
          open={cancelModalOpen}
          onCancel={() => setCancelModalOpen(false)}
          footer={[
            <Button key="close" onClick={() => setCancelModalOpen(false)}>
              Tutup
            </Button>,
          ]}
          width={700}
        >
          {cancelLogs.length === 0 ? (
            <Text type="secondary">Tidak ada log cancel</Text>
          ) : (
            <Timeline>
              {cancelLogs.map((log) => (
                <Timeline.Item
                  key={log.adw_trackingsj_events_id}
                  color="red"
                  dot={<ClockCircleOutlined />}
                >
                  <div style={{ fontWeight: "bold" }}>
                    {formatDateTime(log.created)}
                  </div>
                  {/* <div>state: {log.action}</div>*/}
                  <div>{log.reason}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {log.createdby_name}
                  </div>
                </Timeline.Item>
              ))}
            </Timeline>
          )}
        </Modal>
      </div>
    </LayoutGlobal>
  );
};

export default ProgressShipment;
