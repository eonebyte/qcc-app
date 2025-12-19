import React, { useState, useEffect } from "react";
import {
  Card,
  Button,
  Tag,
  SearchBar,
  Popup,
  Steps,
  AutoCenter,
  Toast,
  Space,
  List,
  SpinLoading,
  PullToRefresh,
} from "antd-mobile";
import {
  ClockCircleOutline,
  FileOutline,
  UserOutline,
  CheckCircleOutline,
  RightOutline,
  CloseOutline,
  ExclamationCircleOutline,
  TruckOutline,
  TeamOutline,
  EditSOutline,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import LayoutGlobalMobile from "../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

// --- HELPER FORMAT ---
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


// --- STEP DEFINITIONS (SAMA PERSIS DENGAN WEB) ---
const stepDefinitions = [
  {
    title: "Delivery",
    icon: <ClockCircleOutline />,
    handoverKey: "ho_delivery_to_dpk",
    handoverByKey: "ho_delivery_to_dpkby_name",
    acceptKey: "accept_dpk_from_delivery",
    acceptByKey: "accept_dpk_from_deliveryby_name",
    preHandoverText: "HO ke DPK",
    postHandoverText: "Wait Acc. DPK",
  },
  {
    title: "DPK",
    icon: <FileOutline />,
    handoverKey: "ho_dpk_to_driver",
    handoverByKey: "ho_dpk_to_driverby_name",
    acceptKey: "accept_driver_from_dpk",
    acceptByKey: "accept_driver_from_dpkby_name",
    preHandoverText: "Handover ke Driver",
    postHandoverText: "Wait Acc. Driver",
  },
  {
    title: "Driver",
    icon: <TruckOutline />,
    handoverKey: "ho_driver_to_customer",
    handoverByKey: "ho_driver_to_customerby_name",
    acceptKey: "accept_customer_from_driver",
    acceptByKey: "accept_customer_from_driverby_name",
    preHandoverText: "Check Out (Customer)",
    postHandoverText: "Wait Diambil",
  },
  {
    title: "Customer",
    icon: <TeamOutline />,
    handoverKey: "ho_driver_to_dpk",
    handoverByKey: "ho_driver_to_dpkby_name",
    acceptKey: "accept_dpk_from_driver",
    acceptByKey: "accept_dpk_from_driverby_name",
    preHandoverText: "On Customer",
    postHandoverText: "Wait Acc. DPK",
  },
  {
    title: "DPK",
    icon: <FileOutline />,
    handoverKey: "ho_dpk_to_delivery",
    handoverByKey: "ho_dpk_to_deliveryby_name",
    acceptKey: "accept_delivery_from_dpk",
    acceptByKey: "accept_delivery_from_dpkby_name",
    preHandoverText: "Handover ke Delivery",
    postHandoverText: "Wait Acc. Delivery",
  },
  {
    title: "Delivery",
    icon: <ClockCircleOutline />,
    handoverKey: "ho_delivery_to_mkt",
    handoverByKey: "ho_delivery_to_mktby_name",
    acceptKey: "accept_mkt_from_delivery",
    acceptByKey: "accept_mkt_from_deliveryby_name",
    preHandoverText: "Handover ke MKT",
    postHandoverText: "Wait Acc. MKT",
  },
  {
    title: "Marketing",
    icon: <EditSOutline />,
    handoverKey: "ho_mkt_to_fat",
    handoverByKey: "ho_mkt_to_fatby_name",
    acceptKey: "accept_fat_from_mkt",
    acceptByKey: "accept_fat_from_mktby_name",
    preHandoverText: "Handover ke FAT",
    postHandoverText: "Wait Acc. FAT",
  },
  {
    title: "FAT",
    icon: <CheckCircleOutline />,
    isFinal: true,
    acceptKey: "accept_fat_from_mkt",
    acceptByKey: "accept_fat_from_mktby_name",
  },
];

const ProgressShipmentMobile = () => {
  // --- STATES ---
  const [shipmentData, setShipmentData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Popup Detail Flow
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Cancel Logs
  const [cancelLogs, setCancelLogs] = useState([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [isCancelPopupOpen, setIsCancelPopupOpen] = useState(false);

  // --- TRANSFORM DATA (SAMA DENGAN WEB) ---
  const transformApiData = (apiData = []) => {
    if (!Array.isArray(apiData)) return [];

    return apiData.map((item, index) => {
      const id = item.m_inout_id || item.adw_trackingsj_id || index;

      // Logic Flow Step-by-Step
      const flow = stepDefinitions.map((step, stepIndex) => {
        const handoverTimestamp = item[step.handoverKey];
        const acceptTimestamp = item[step.acceptKey];
        const prevStep = stepIndex > 0 ? stepDefinitions[stepIndex - 1] : null;
        const isPrevStepAccepted = prevStep ? !!item[prevStep.acceptKey] : true;

        let status = "pending";
        let displayValue = "Wait";
        let displayTime = "-";

        // Logic Status
        if (acceptTimestamp) {
          status = "completed";
          displayValue = "Selesai";
          displayTime = formatTime(acceptTimestamp);
        } else if (isPrevStepAccepted) {
          status = "in_progress";
          if (handoverTimestamp) {
            displayValue = step.postHandoverText;
            displayTime = formatTime(handoverTimestamp);
          } else {
            displayValue = step.preHandoverText;
            displayTime = prevStep ? formatTime(item[prevStep.acceptKey]) : "-";
          }
        }

        if (step.isFinal && acceptTimestamp) {
          status = "completed";
          displayValue = "Selesai";
          displayTime = formatTime(acceptTimestamp);
        }

        // Custom Logic Driver
        if (step.title === "Driver" && status === "in_progress") {
          if (!item.adw_tms_id) {
            displayValue = "Process Cek Security";
          } else {
            displayValue = "Check Out (Customer)";
          }
        }

        return {
          title: step.title,
          status,
          displayValue,
          icon: step.icon,
          rawData: {
            handoverTime: item[step.handoverKey],
            handoverBy: item[step.handoverByKey],
            acceptTime: item[step.acceptKey],
            acceptBy: item[step.acceptByKey],
          },
        };
      });

      // Tentukan status utama untuk ditampilkan di Card
      let mainStatus = "PROSES";
      let mainStatusColor = "primary";

      if (item.has_cancel_log) {
        mainStatus = "CANCEL";
        mainStatusColor = "danger";
      } else if (item.accept_fat_from_mkt) {
        mainStatus = "SELESAI";
        mainStatusColor = "success";
      } else if (item.ho_mkt_to_fat) {
        mainStatus = "MARKETING";
      } else if (item.accept_customer_from_driver) {
        mainStatus = "DITERIMA CUST";
      } else if (item.ho_driver_to_customer) {
        mainStatus = "DI CUSTOMER";
      } else if (item.ho_dpk_to_driver) {
        mainStatus = "DI DRIVER";
      }

      // Cari step aktif terakhir untuk summary
      const currentStep =
        flow.find((s) => s.status === "in_progress") ||
        flow
          .slice()
          .reverse()
          .find((s) => s.status === "completed") ||
        flow[0];

      return {
        key: String(id),
        m_inout_id: id,
        docNo: item.documentno,
        customer: item.customer,
        planTime: item.plantime,
        has_cancel_log: item.has_cancel_log,
        adw_trackingsj_id: parseInt(item.adw_trackingsj_id),
        flow,
        mainStatus,
        mainStatusColor,
        currentStepInfo: currentStep,
      };
    });
  };

  // --- FETCH DATA UTAMA ---
  const fetchData = async (searchVal = "") => {
    setLoading(true);
    try {
      // Gunakan parameter yang sama dengan Web
      const params = {
        page: 1,
        limit: 50, // Mobile load 50 item
      };

      // Jika ada search, kirim sebagai filter (bisa disesuaikan field-nya, misal docNo)
      if (searchVal) {
        params.docNo = searchVal;
        // Atau params.customer = searchVal; tergantung kebutuhan
      }

      const queryString = new URLSearchParams(params).toString();
      const res = await fetch(`${backEndUrl}/tms/history?${queryString}`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Network response was not ok");

      const result = await res.json();

      // Parsing robust (sama dengan web)
      let payload = [];
      const candidates = [
        result?.data?.data,
        result?.data,
        result?.items,
        result?.result,
      ];
      for (const c of candidates) {
        if (Array.isArray(c)) {
          payload = c;
          break;
        }
      }

      const transformed = transformApiData(payload);
      setShipmentData(transformed);
    } catch (error) {
      console.error("Error fetching:", error);
      Toast.show({ content: "Gagal memuat data", icon: "fail" });
    } finally {
      setLoading(false);
    }
  };

  // --- FETCH CANCEL LOGS ---
  const fetchCancelLogs = async (trackingId) => {
    setCancelLoading(true);
    setCancelLogs([]);
    try {
      const res = await fetch(
        `${backEndUrl}/tms/cancel-log?adw_trackingsj_id=${trackingId}`,
        { credentials: "include" },
      );
      const result = await res.json();
      const data = result?.data?.data || result?.items || result?.result || [];
      setCancelLogs(Array.isArray(data) ? data : []);
      setIsCancelPopupOpen(true);
    } catch (err) {
      console.error("Fetch cancel log error:", err);
      Toast.show("Gagal mengambil log cancel");
    } finally {
      setCancelLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- HANDLERS ---
  const handleOpenDetail = (record) => {
    setSelectedRecord(record);
    setIsPopupOpen(true);
  };

  const handleSearch = (val) => {
    setSearchText(val);
    fetchData(val);
  };

  return (
    <LayoutGlobalMobile title="Progress Shipment">
      {/* SEARCH BAR */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "#f5f5f5",
          padding: "10px 12px",
        }}
      >
        <SearchBar
          placeholder="Cari No. Dokumen..."
          value={searchText}
          onChange={setSearchText}
          onSearch={handleSearch}
          style={{ "--background": "#fff" }}
        />
      </div>

      {/* LIST DATA */}
      <PullToRefresh onRefresh={() => fetchData(searchText)}>
        <div style={{ padding: "0 12px 20px 12px" }}>
          {loading && (
            <div style={{ padding: 20 }}>
              <AutoCenter>
                <SpinLoading color="primary" />
              </AutoCenter>
            </div>
          )}

          {!loading && shipmentData.length === 0 && (
            <div style={{ padding: 40 }}>
              <AutoCenter>Tidak ada data.</AutoCenter>
            </div>
          )}

          {shipmentData.map((item) => (
            <Card
              key={item.key}
              style={{
                marginTop: 12,
                borderRadius: 8,
                borderLeft: item.has_cancel_log
                  ? "5px solid #ff4d4f"
                  : "5px solid #1677ff",
              }}
              onClick={() => handleOpenDetail(item)}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontWeight: "bold", fontSize: 16 }}>
                    {item.docNo}
                  </div>
                  <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                    <UserOutline
                      style={{ verticalAlign: "middle", marginRight: 4 }}
                    />
                    {item.customer}
                  </div>
                  <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>
                    <ClockCircleOutline
                      style={{ verticalAlign: "middle", marginRight: 4 }}
                    />
                    Plan: {formatDateTime(item.planTime)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Tag color={item.mainStatusColor}>{item.mainStatus}</Tag>
                </div>
              </div>

              {/* Status Terakhir Bar */}
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 10px",
                  background: item.has_cancel_log ? "#fff2f0" : "#f0f5ff",
                  borderRadius: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "#888" }}>
                    POSISI TERAKHIR
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: item.has_cancel_log ? "#ff4d4f" : "#1677ff",
                      fontSize: 13,
                    }}
                  >
                    {item.currentStepInfo.title}
                  </div>
                </div>
                <div
                  style={{ fontWeight: "bold", fontSize: 13, color: "#555" }}
                >
                  {item.currentStepInfo.displayValue}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </PullToRefresh>

      {/* POPUP DETAIL TIMELINE */}
      <Popup
        visible={isPopupOpen}
        onMaskClick={() => setIsPopupOpen(false)}
        bodyStyle={{
          height: "85vh",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <div
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          {/* Header */}
          <div
            style={{
              padding: 16,
              borderBottom: "1px solid #eee",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: "bold" }}>
                Timeline Dokumen
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>
                {selectedRecord?.docNo}
              </div>
            </div>
            <CloseOutline
              fontSize={24}
              color="#999"
              onClick={() => setIsPopupOpen(false)}
            />
          </div>

          {/* Jika Cancel, Tampilkan Tombol Log */}
          {selectedRecord?.has_cancel_log && (
            <div
              style={{
                padding: "10px 16px",
                background: "#fff2f0",
                borderBottom: "1px solid #ffccc7",
              }}
            >
              <div style={{ color: "#cf1322", marginBottom: 8, fontSize: 13 }}>
                <ExclamationCircleOutline
                  style={{ marginRight: 5, verticalAlign: "middle" }}
                />
                Dokumen ini memiliki status CANCEL.
              </div>
              <Button
                color="danger"
                size="small"
                fill="outline"
                block
                onClick={() =>
                  fetchCancelLogs(selectedRecord.adw_trackingsj_id)
                }
              >
                Lihat Alasan Cancel
              </Button>
            </div>
          )}

          {/* Timeline Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
            {selectedRecord && (
              <Steps direction="vertical">
                {/* Reverse flow agar yang terbaru di atas, seperti logic Web modal timeline */}
                {[...selectedRecord.flow].reverse().map((step, idx) => {
                  // Mapping status Web ke Antd Mobile Steps
                  let statusStep = "wait";
                  if (step.status === "completed") statusStep = "finish";
                  else if (step.status === "in_progress")
                    statusStep = "process";

                  // Render Deskripsi
                  const hoTime = formatDateTime(step.rawData.handoverTime);
                  const accTime = formatDateTime(step.rawData.acceptTime);
                  const showDetails =
                    step.rawData.handoverTime || step.rawData.acceptTime;

                  return (
                    <Steps.Step
                      key={idx}
                      title={
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>
                            {step.title === "Customer"
                              ? "Customer (Auto)"
                              : step.title}
                          </span>
                          {statusStep === "process" && (
                            <Tag color="primary" fill="outline">
                              Aktif
                            </Tag>
                          )}
                        </div>
                      }
                      status={statusStep}
                      icon={
                        statusStep === "finish" ? (
                          <CheckCircleOutline />
                        ) : statusStep === "process" ? (
                          <ClockCircleOutline />
                        ) : null
                      }
                      description={
                        <div
                          style={{ fontSize: 12, marginTop: 4, color: "#666" }}
                        >
                          <div
                            style={{
                              marginBottom: 4,
                              fontWeight: "bold",
                              color:
                                statusStep === "process" ? "#1677ff" : "#555",
                            }}
                          >
                            {step.displayValue}
                          </div>

                          {showDetails && (
                            <div
                              style={{
                                background: "#f9f9f9",
                                padding: 8,
                                borderRadius: 4,
                                border: "1px solid #eee",
                              }}
                            >
                              {step.rawData.handoverTime && (
                                <div style={{ marginBottom: 4 }}>
                                  <span style={{ fontWeight: "bold" }}>
                                    {step.title === "Driver" ||
                                    step.title === "Customer"
                                      ? "CO:"
                                      : "HO:"}
                                  </span>{" "}
                                  {hoTime}
                                  {step.rawData.handoverBy && (
                                    <div
                                      style={{ fontSize: 10, color: "#999" }}
                                    >
                                      by {step.rawData.handoverBy}
                                    </div>
                                  )}
                                </div>
                              )}
                              {step.rawData.acceptTime && (
                                <div>
                                  <span style={{ fontWeight: "bold" }}>
                                    Rcpt:
                                  </span>{" "}
                                  {accTime}
                                  {step.rawData.acceptBy && (
                                    <div
                                      style={{ fontSize: 10, color: "#999" }}
                                    >
                                      by {step.rawData.acceptBy}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      }
                    />
                  );
                })}
              </Steps>
            )}
          </div>

          <div style={{ padding: 16, borderTop: "1px solid #eee" }}>
            <Button block onClick={() => setIsPopupOpen(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </Popup>

      {/* POPUP CANCEL LOGS */}
      <Popup
        visible={isCancelPopupOpen}
        onMaskClick={() => setIsCancelPopupOpen(false)}
        bodyStyle={{
          height: "50vh",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <div
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          <div
            style={{
              padding: 16,
              borderBottom: "1px solid #eee",
              fontWeight: "bold",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Riwayat Cancel</span>
            <CloseOutline onClick={() => setIsCancelPopupOpen(false)} />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {cancelLoading ? (
              <AutoCenter>Loading Logs...</AutoCenter>
            ) : cancelLogs.length === 0 ? (
              <AutoCenter>Tidak ada data log.</AutoCenter>
            ) : (
              <Steps direction="vertical">
                {cancelLogs.map((log) => (
                  <Steps.Step
                    key={log.adw_trackingsj_events_id}
                    status="error"
                    title={formatDateTime(log.created)}
                    description={
                      <div>
                        <div style={{ color: "#333", fontWeight: 500 }}>
                          {log.reason}
                        </div>
                        <div style={{ fontSize: 11, color: "#999" }}>
                          Oleh: {log.createdby_name}
                        </div>
                      </div>
                    }
                    icon={<ExclamationCircleOutline />}
                  />
                ))}
              </Steps>
            )}
          </div>
        </div>
      </Popup>
    </LayoutGlobalMobile>
  );
};

export default ProgressShipmentMobile;
