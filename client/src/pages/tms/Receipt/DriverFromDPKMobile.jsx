import React, { useEffect, useState, useMemo } from "react";
import {
  Card,
  Button,
  Collapse,
  Checkbox,
  Dialog,
  Toast,
  AutoCenter,
  PullToRefresh,
  SpinLoading,
  SearchBar,
  Tag,
} from "antd-mobile";
import {
  CalendarOutline,
  FileOutline,
  CheckOutline,
  CloseOutline,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import { useSelector } from "react-redux";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const DriverFromDPKMobile = () => {
  const user = useSelector((state) => state.auth.user);
  const userName = user?.name;

  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${backEndUrl}/receipt/list/driver/from/dpk`,
        { withCredentials: true },
      );

      if (res.data.data && res.data.data.success) {
        const rawBundles = (res.data.data.data || []).filter(
          (bundle) => bundle.drivername === userName,
        );

        const processedData = rawBundles
          .map((bundle) => {
            const processedShipments = bundle.shipments.map((shipment) => ({
              ...shipment,
              key: shipment.m_inout_id,
              checked: false,
              clickCount: 0,
              arrived: false,
            }));

            return {
              ...bundle,
              key: bundle.bundleNo,
              shipments: processedShipments,
              bundleSelected: false,
            };
          })
          .filter((bundle) => bundle.shipments.length > 0);

        setDataList(processedData);
      } else {
        setDataList([]);
      }
    } catch (err) {
      console.error(err);
      Toast.show({ content: "Gagal mengambil data", icon: "fail" });
    } finally {
      setLoading(false);
    }
  };

  // --- LOGIC SEARCH & FILTERING ---
  const filteredData = useMemo(() => {
    if (!searchText) return dataList;
    const lowerSearch = searchText.toLowerCase();

    return dataList
      .map((bundle) => {
        const isBundleMatch = bundle.bundleNo
          .toLowerCase()
          .includes(lowerSearch);
        const matchingShipments = bundle.shipments.filter(
          (s) =>
            s.documentno.toLowerCase().includes(lowerSearch) ||
             s.customerkey.toLowerCase().includes(lowerSearch) ||
            s.customer.toLowerCase().includes(lowerSearch),
        );

        if (isBundleMatch) return bundle;
        if (matchingShipments.length > 0) {
          return { ...bundle, shipments: matchingShipments };
        }
        return null;
      })
      .filter((item) => item !== null);
  }, [dataList, searchText]);

  // Auto expand saat mencari
  useEffect(() => {
    if (searchText) {
      setActiveKey(filteredData.map((b) => b.key));
    }
  }, [searchText, filteredData]);

  // --- HANDLER CHECK SATUAN (Logic 3 Klik) ---
  const handleShipmentClick = (bundleNo, shipmentKey) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const updatedShipments = bundle.shipments.map((s) => {
            if (s.key === shipmentKey) {
              if (!s.checked) {
                return { ...s, checked: true, clickCount: 0 };
              } else {
                const newCount = s.clickCount + 1;
                if (newCount >= 3) {
                  return {
                    ...s,
                    checked: false,
                    clickCount: 0,
                    arrived: false,
                  };
                }
                return { ...s, clickCount: newCount };
              }
            }
            return s;
          });
          return { ...bundle, shipments: updatedShipments };
        }
        return bundle;
      }),
    );
  };

  // --- HANDLER BUNDLE SELECTION ---
  const toggleBundleSelection = (bundleNo) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          // Hanya bisa pilih bundle jika SEMUA shipment sudah di-check
          const allChecked = bundle.shipments.every((s) => s.checked);
          if (!allChecked && !bundle.bundleSelected) {
            Toast.show({
              content: "Check semua surat jalan terlebih dahulu",
              position: "bottom",
            });
            return bundle;
          }
          const newStatus = !bundle.bundleSelected;
          return {
            ...bundle,
            bundleSelected: newStatus,
            shipments: bundle.shipments.map((s) => ({
              ...s,
              arrived: newStatus,
            })),
          };
        }
        return bundle;
      }),
    );
  };

  const handleRejectItem = (shipment) => {
    Dialog.confirm({
      title: "Konfirmasi Reject",
      content: `Reject dokumen ${shipment.documentno}?`,
      confirmText: "Reject",
      cancelText: "Batal",
      confirmButtonColor: "danger",
      onConfirm: async () => {
        try {
          const res = await axios.post(`${backEndUrl}/tms/reject`, shipment, {
            withCredentials: true,
          });
          if (res.data.success) {
            Toast.show({ content: "Berhasil direject", icon: "success" });
            fetchData();
          }
        } catch (error) {
          Toast.show({ content: "Gagal reject", icon: "fail" });
        }
      },
    });
  };

  const handleSubmit = async () => {
    const selectedBundles = dataList.filter((b) => b.bundleSelected);
    if (selectedBundles.length === 0) return;

    Dialog.confirm({
      title: "Konfirmasi Penerimaan",
      content: `Terima ${selectedBundles.length} Bundle terpilih?`,
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          // Filter data yang dikirim hanya yang checked
          const payload = {
            data: selectedBundles.map((b) => ({
              ...b,
              shipments: b.shipments.filter((s) => s.checked),
            })),
          };

          const res = await axios.post(
            `${backEndUrl}/receipt/process/driver/from/dpk`,
            payload,
            { withCredentials: true },
          );

          if (res.data.success) {
            Toast.show({ content: "Sukses!", icon: "success" });
            fetchData();
            setSearchText("");
          }
        } catch (error) {
          Toast.show({ content: "Gagal memproses", icon: "fail" });
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const renderBundle = (bundle) => {
    const allShipmentsChecked = bundle.shipments.every((s) => s.checked);

    return (
      <Collapse.Panel
        key={bundle.key}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={bundle.bundleSelected}
                disabled={!allShipmentsChecked}
                onChange={() => toggleBundleSelection(bundle.bundleNo)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "600", fontSize: 15 }}>
                {bundle.bundleNo}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                {bundle.shipments.length} Docs •{" "}
                {bundle.created
                  ? dayjs(bundle.created).format("DD/MM/YY HH:mm")
                  : "-"}
              </div>
            </div>
          </div>
        }
      >
        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 8 }}>
          {bundle.shipments.map((item) => (
            <Card
              key={item.key}
              style={{
                marginBottom: 10,
                borderRadius: 12,
                borderLeft: item.checked
                  ? "6px solid #52c41a"
                  : "6px solid #1677ff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1 }}>
                  {/* DOCUMENT NO MENONJOL */}
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: item.checked ? "#52c41a" : "#1677ff",
                      marginBottom: 4,
                      fontFamily: "monospace",
                    }}
                  >
                    {item.documentno}
                  </div>

                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#333",
                      marginBottom: 6,
                    }}
                  >
                    {item.customerkey}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "#888",
                    }}
                  >
                    <CalendarOutline />
                    {item.plantime
                      ? dayjs(item.plantime).format("DD MMM YYYY HH:mm")
                      : "-"}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    alignItems: "flex-end",
                  }}
                >
                  {/* TOMBOL CHECK */}
                  <Button
                    size="small"
                    color={item.checked ? "success" : "default"}
                    fill={item.checked ? "solid" : "outline"}
                    onClick={() =>
                      handleShipmentClick(bundle.bundleNo, item.key)
                    }
                    style={{ borderRadius: 8, minWidth: 80 }}
                  >
                    {item.checked ? (
                      <span style={{ fontSize: 11 }}>
                        Checked {item.clickCount > 0 && `(${item.clickCount})`}
                      </span>
                    ) : (
                      <CheckOutline fontSize={18} />
                    )}
                  </Button>

                  <Button
                    size="mini"
                    color="danger"
                    fill="none"
                    onClick={() => handleRejectItem(item)}
                  >
                    <CloseOutline /> Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Collapse.Panel>
    );
  };

  const selectedCount = dataList.filter((b) => b.bundleSelected).length;

  return (
    <LayoutGlobalMobile title="Driver from DPK">
      {/* STICKY SEARCH BAR */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 99,
          background: "#fff",
          padding: "12px",
          borderBottom: "1px solid #eee",
        }}
      >
        <SearchBar
          placeholder="Cari No SJ / Bundle / Customer..."
          value={searchText}
          onChange={setSearchText}
          style={{ "--border-radius": "8px", "--background": "#f0f0f0" }}
        />
      </div>

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 100, minHeight: "80vh" }}>
          {loading && (
            <AutoCenter style={{ padding: 20 }}>
              <SpinLoading color="primary" />
            </AutoCenter>
          )}

          {!loading && filteredData.length === 0 && (
            <AutoCenter
              style={{ marginTop: 40, flexDirection: "column", gap: 10 }}
            >
              <FileOutline fontSize={48} color="#ccc" />
              <div style={{ color: "#999" }}>Data tidak ditemukan</div>
            </AutoCenter>
          )}

          <Collapse activeKey={activeKey} onChange={setActiveKey}>
            {filteredData.map((bundle) => renderBundle(bundle))}
          </Collapse>
        </div>
      </PullToRefresh>

      {/* FLOATING ACCEPT BUTTON */}
      {selectedCount > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 60,
            left: 12,
            right: 12,
            zIndex: 100,
          }}
        >
          <Button
            block
            color="primary"
            size="large"
            loading={isSubmitting}
            onClick={handleSubmit}
            style={{
              boxShadow: "0 4px 20px rgba(22, 119, 255, 0.4)",
              fontWeight: "bold",
              borderRadius: 12,
            }}
          >
            Accept ({selectedCount} Bundle)
          </Button>
        </div>
      )}
    </LayoutGlobalMobile>
  );
};

export default DriverFromDPKMobile;
