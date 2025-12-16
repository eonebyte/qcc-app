import React, { useEffect, useState } from "react";
import {
  Card,
  Button,
  Collapse,
  Checkbox,
  Dialog,
  Toast,
  Tag,
  AutoCenter,
  PullToRefresh,
  List,
  SpinLoading,
} from "antd-mobile";
import {
  CheckOutline,
  CloseOutline,
  DownOutline,
  UpOutline,
  FileOutline,
  CalendarOutline,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import { useSelector } from "react-redux";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const DPKFromDeliveryMobile = () => {
  // --- STATE ---
  const user = useSelector((state) => state.auth.user);
  const userId = user.ad_user_id;

  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState([]); // Untuk Collapse

  // --- FETCH DATA ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${backEndUrl}/receipt/list/dpk/from/delivery`,
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
                bundleSelected: false, // Local state untuk checkbox bundle
              }))
              .filter((shipment) => {
                // Filter logic sesuai role (Checkpoint 4 & Driver ID)
                if (Number(shipment.checkpoin_id) === 4) {
                  return shipment.driverby === userId;
                }
                return true;
              });

            return {
              ...bundle,
              key: bundle.bundleNo,
              shipments: processedShipments,
              // Bundle valid jika punya shipment
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

  // --- HANDLERS SHIPMENT CHECK (CHECKER) ---
  const handleShipmentCheck = (bundleNo, shipmentKey) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const updatedShipments = bundle.shipments.map((s) => {
            if (s.key === shipmentKey) {
              return { ...s, checked: true, clickCount: 0 };
            }
            return s;
          });
          return { ...bundle, shipments: updatedShipments };
        }
        return bundle;
      }),
    );
  };

  // --- HANDLER UNCHECK (3x CLICK) ---
  const handleShipmentResetCheck = (bundleNo, shipmentKey) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const updatedShipments = bundle.shipments.map((s) => {
            if (s.key === shipmentKey) {
              const newCount = s.clickCount + 1;
              if (newCount >= 3) {
                Toast.show({
                  content: "Status di-reset (Unchecked)",
                  icon: "success",
                });
                return { ...s, checked: false, clickCount: 0 };
              }
              return { ...s, clickCount: newCount };
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
          // Toggle status seleksi semua shipment di dalam bundle ini
          // Tapi user tidak bisa memilih shipment satu per satu untuk di-submit, melainkan per bundle
          // Jadi kita simpan status "selected" di level bundle object (atau manipulasi flag 'arrived' shipment)
          const newStatus = !bundle.bundleSelected;
          return {
            ...bundle,
            bundleSelected: newStatus,
            shipments: bundle.shipments.map((s) => ({
              ...s,
              arrived: newStatus,
            })), // Sync 'arrived' prop
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
            // Hapus item dari list lokal
            setDataList((prev) =>
              prev
                .map((bundle) => ({
                  ...bundle,
                  shipments: bundle.shipments.filter(
                    (s) => s.key !== shipment.key,
                  ),
                }))
                .filter((b) => b.shipments.length > 0),
            ); // Hapus bundle kosong
          } else {
            Toast.show({ content: "Gagal reject", icon: "fail" });
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
          // Filter hanya shipment yang checked (redundant krn logic UI, tapi safety)
          const payloadData = selectedBundles.map((b) => ({
            ...b,
            shipments: b.shipments.filter((s) => s.checked),
          }));

          const res = await axios.post(
            `${backEndUrl}/receipt/process/dpk/from/delivery`,
            { data: payloadData },
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
    const allChecked = bundle.shipments.every((s) => s.checked);

    return (
      <Collapse.Panel
        key={bundle.key}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={bundle.bundleSelected}
                disabled={!allChecked} // Checkbox mati jika belum semua di-check manual
                onChange={() => toggleBundleSelection(bundle.bundleNo)}
              />
            </div>
            <div>
              <div style={{ fontWeight: "bold" }}>{bundle.bundleNo}</div>
              <div style={{ fontSize: 12, color: "#888" }}>
                {bundle.shipments.length} Dokumen •{" "}
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
                      ? dayjs(item.plantime).format("DD-MM-YYYY")
                      : "-"}
                  </div>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {/* Tombol Reject */}
                  <Button
                    size="mini"
                    color="danger"
                    fill="outline"
                    onClick={() => handleRejectItem(item)}
                  >
                    Reject
                  </Button>

                  {/* Tombol Check / Status Checked */}
                  {item.checked ? (
                    <Tag
                      color="success"
                      fill="outline"
                      onClick={() =>
                        handleShipmentResetCheck(bundle.bundleNo, item.key)
                      }
                    >
                      <CheckOutline style={{ verticalAlign: "middle" }} />{" "}
                      Checked
                    </Tag>
                  ) : (
                    <Button
                      size="mini"
                      color="primary"
                      onClick={() =>
                        handleShipmentCheck(bundle.bundleNo, item.key)
                      }
                    >
                      Check
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {!allChecked && (
            <div
              style={{
                fontSize: 12,
                color: "#faad14",
                textAlign: "center",
                marginTop: 8,
              }}
            >
              *Check semua dokumen untuk memilih bundle ini.
            </div>
          )}
        </div>
      </Collapse.Panel>
    );
  };

  const selectedCount = dataList.filter((b) => b.bundleSelected).length;

  return (
    <LayoutGlobalMobile title="Receipt from Delivery">
      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 80 }}>
          {loading && (
            <AutoCenter>
              <SpinLoading color="primary" />
            </AutoCenter>
          )}

          {!loading && dataList.length === 0 && (
            <AutoCenter style={{ marginTop: 20 }}>
              Tidak ada data bundle.
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

export default DPKFromDeliveryMobile;
