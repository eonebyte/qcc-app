import React, { useEffect, useState } from "react";
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
} from "antd-mobile";
import { CalendarOutline, UserOutline, FileOutline } from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import { useSelector } from "react-redux";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const DriverFromDPKMobile = () => {
  // --- STATE ---
  const user = useSelector((state) => state.auth.user);
  const userName = user.name; // Filter berdasarkan Nama Driver

  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState([]); // Untuk Collapse

  // --- FETCH DATA ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${backEndUrl}/receipt/list/driver/from/dpk`,
        { withCredentials: true },
      );

      if (res.data.data && res.data.data.success) {
        // 1. Filter hanya bundle milik driver yang login
        const rawBundles = (res.data.data.data || []).filter(
          (bundle) => bundle.drivername === userName,
        );

        // 2. Map data untuk Mobile
        const processedData = rawBundles
          .map((bundle) => {
            const processedShipments = bundle.shipments.map((shipment) => ({
              ...shipment,
              key: shipment.m_inout_id,
              arrived: false,
            }));

            return {
              ...bundle,
              key: bundle.bundleNo,
              shipments: processedShipments,
              bundleSelected: false, // State untuk checkbox
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

  useEffect(() => {
    fetchData();
  }, []);

  // --- HANDLER BUNDLE SELECTION ---
  const toggleBundleSelection = (bundleNo) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const newStatus = !bundle.bundleSelected;
          return {
            ...bundle,
            bundleSelected: newStatus,
            // Sync properti arrived untuk payload backend
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

  // --- HANDLER REJECT ITEM ---
  const handleRejectItem = (shipment) => {
    Dialog.confirm({
      title: "Konfirmasi Reject",
      content: `Reject dokumen ${shipment.documentno}?`,
      confirmText: "Reject",
      cancelText: "Batal",
      onConfirm: async () => {
        try {
          const res = await axios.post(`${backEndUrl}/tms/reject`, shipment, {
            withCredentials: true,
          });
          if (res.data.success) {
            Toast.show({ content: "Dokumen direject", icon: "success" });
            fetchData(); // Refresh data
          } else {
            Toast.show({
              content: res.data.message || "Gagal reject",
              icon: "fail",
            });
          }
        } catch (error) {
          console.log(error);
          Toast.show({ content: "Error saat reject", icon: "fail" });
        }
      },
    });
  };

  // --- HANDLER SUBMIT (ACCEPT) ---
  const handleSubmit = () => {
    const selectedBundles = dataList.filter((b) => b.bundleSelected);

    if (selectedBundles.length === 0) return;

    Dialog.confirm({
      title: "Konfirmasi Penerimaan",
      confirmText: "Terima",
      cancelText: "Batal",
      content: (
        <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
          <p>Terima {selectedBundles.length} Bundle terpilih?</p>
          <ul
            style={{
              paddingLeft: 20,
              fontSize: 13,
              textAlign: "left",
              color: "#666",
            }}
          >
            {selectedBundles.map((b) => (
              <li key={b.key}>
                <strong>{b.bundleNo}</strong> ({b.shipments.length} Docs)
              </li>
            ))}
          </ul>
        </div>
      ),
      onConfirm: async () => {
        try {
          const payload = { data: selectedBundles };
          const res = await axios.post(
            `${backEndUrl}/receipt/process/driver/from/dpk`,
            payload,
            { withCredentials: true },
          );

          if (res.data.success) {
            Toast.show({ content: "Berhasil Diterima!", icon: "success" });
            fetchData();
          } else {
            Toast.show({ content: res.data.message || "Gagal", icon: "fail" });
          }
        } catch (error) {
          console.log(error);
          Toast.show({ content: "Error saat submit", icon: "fail" });
        }
      },
    });
  };

  // --- RENDER BUNDLE ITEM ---
  const renderBundle = (bundle) => {
    return (
      <Collapse.Panel
        key={bundle.key}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={bundle.bundleSelected}
                onChange={() => toggleBundleSelection(bundle.bundleNo)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "bold" }}>{bundle.bundleNo}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                {bundle.shipments.length} Dokumen
              </div>
              <div style={{ fontSize: 11, color: "#999" }}>
                {/* Menyesuaikan format tanggal dari versi web (+7 jam jika perlu, atau parsing ISO) */}
                {dayjs(bundle.created)
                  .add(7, "hour")
                  .format("DD-MM-YYYY HH:mm")}
              </div>
            </div>
          </div>
        }
      >
        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 8 }}>
          {bundle.shipments.map((item) => (
            <Card key={item.key} style={{ marginBottom: 8, borderRadius: 6 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontWeight: "bold" }}>{item.documentno}</div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    {item.customer}
                  </div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                    <CalendarOutline style={{ marginRight: 4 }} />
                    {item.plantime
                      ? dayjs(item.plantime).format("DD-MM-YYYY HH:mm")
                      : "-"}
                  </div>
                </div>
                <div>
                  <Button
                    size="mini"
                    color="danger"
                    fill="outline"
                    onClick={() => handleRejectItem(item)}
                  >
                    Reject
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
    <LayoutGlobalMobile title="Receipt from DPK">
      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 80 }}>
          {loading && (
            <AutoCenter>
              <SpinLoading color="primary" />
            </AutoCenter>
          )}

          {!loading && dataList.length === 0 && (
            <AutoCenter style={{ marginTop: 20 }}>
              Tidak ada data untuk Anda.
            </AutoCenter>
          )}

          <Collapse
            activeKey={activeKey}
            onChange={setActiveKey}
            accordion={false}
          >
            {dataList.map((bundle) => renderBundle(bundle))}
          </Collapse>
        </div>
      </PullToRefresh>

      {/* --- FLOATING ACCEPT BUTTON --- */}
      {selectedCount > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 70,
            left: 12,
            right: 12,
            zIndex: 100,
          }}
        >
          <Button
            block
            color="primary"
            size="large"
            onClick={handleSubmit}
            style={{ boxShadow: "0 4px 12px rgba(22, 119, 255, 0.4)" }}
          >
            Accept ({selectedCount} Bundle)
          </Button>
        </div>
      )}
    </LayoutGlobalMobile>
  );
};

export default DriverFromDPKMobile;
