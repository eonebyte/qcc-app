import React, { useEffect, useState, useMemo } from "react";
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
  SpinLoading,
  DatePicker,
  Space,
  SearchBar, // Import SearchBar
} from "antd-mobile";
import {
  CheckOutline,
  FileOutline,
  CalendarOutline,
  SearchOutline,
  CloseCircleFill,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import { useSelector } from "react-redux";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const DPKFromDeliveryMobile = () => {
  const user = useSelector((state) => state.auth.user);
  const userId = user.ad_user_id;

  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState([]);

  // --- STATE FILTER ---
  const [searchText, setSearchText] = useState(""); // State Search
  const [selectedDate, setSelectedDate] = useState(null);
  const [pickerVisible, setPickerVisible] = useState(false);

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
              bundleSelected: false,
            };
          })
          .filter((bundle) => bundle.shipments.length > 0);

        setDataList(processedData);
      } else {
        setDataList([]);
      }
    } catch (err) {
      console.log(err);
      Toast.show({ content: "Gagal mengambil data", icon: "fail" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- LOGIC FILTERING (SEARCH & DATE) ---
  const filteredData = useMemo(() => {
    const lowerSearch = searchText.toLowerCase();

    return dataList
      .map((bundle) => {
        // Filter shipments di dalam bundle
        const matchingShipments = bundle.shipments.filter((s) => {
          const matchesText = !searchText || (
            s.documentno.toLowerCase().includes(lowerSearch) ||
            s.customer.toLowerCase().includes(lowerSearch)
          );

          // Filter Tanggal berdasarkan plantime (sesuai logika web)
          const matchesDate = !selectedDate ||
            dayjs(s.plantime).isSame(dayjs(selectedDate), 'day');

          return matchesText && matchesDate;
        });

        // Cek metadata bundle (hanya jika filter tanggal kosong)
        const isBundleMatch = !selectedDate && bundle.bundleNo.toLowerCase().includes(lowerSearch);

        if (isBundleMatch || matchingShipments.length > 0) {
          return {
            ...bundle,
            shipments: isBundleMatch ? bundle.shipments : matchingShipments
          };
        }
        return null;
      })
      .filter((b) => b !== null);
  }, [dataList, searchText, selectedDate]);


  // --- HANDLERS ---
  const handleShipmentCheck = (bundleNo, shipmentKey) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const updatedShipments = bundle.shipments.map((s) =>
            s.key === shipmentKey ? { ...s, checked: true, clickCount: 0 } : s
          );
          return { ...bundle, shipments: updatedShipments };
        }
        return bundle;
      })
    );
  };

  const handleShipmentResetCheck = (bundleNo, shipmentKey) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const updatedShipments = bundle.shipments.map((s) => {
            if (s.key === shipmentKey) {
              const newCount = s.clickCount + 1;
              if (newCount >= 3) {
                Toast.show({ content: "Reset!", icon: "success" });
                return { ...s, checked: false, clickCount: 0 };
              }
              return { ...s, clickCount: newCount };
            }
            return s;
          });
          return { ...bundle, shipments: updatedShipments };
        }
        return bundle;
      })
    );
  };

  const toggleBundleSelection = (bundleNo) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          const newStatus = !bundle.bundleSelected;
          return {
            ...bundle,
            bundleSelected: newStatus,
            shipments: bundle.shipments.map((s) => ({ ...s, arrived: newStatus })),
          };
        }
        return bundle;
      })
    );
  };

  const handleRejectItem = (shipment) => {
    Dialog.confirm({
      title: "Konfirmasi Reject",
      content: `Reject dokumen ${shipment.documentno}?`,
      onConfirm: async () => {
        try {
          const res = await axios.post(`${backEndUrl}/tms/reject`, shipment, { withCredentials: true });
          if (res.data.success) {
            Toast.show({ content: "Dokumen direject", icon: "success" });
            fetchData();
          }
        } catch (error) {
          console.log(error);

          Toast.show({ content: "Error", icon: "fail" });
        }
      },
    });
  };

  const handleSubmit = () => {
    // Gunakan filteredData agar yang terkirim hanya yang tampak saat ini
    const selectedBundles = filteredData.filter((b) => b.bundleSelected);
    if (selectedBundles.length === 0) return;

    Dialog.confirm({
      title: "Konfirmasi",
      content: `Terima ${selectedBundles.length} Bundle?`,
      confirmText: 'Ok',
      cancelText: 'Batal',
      onConfirm: async () => {
        try {
          const payloadData = selectedBundles.map((b) => ({
            ...b,
            shipments: b.shipments.filter((s) => s.checked),
          })).filter(b => b.shipments.length > 0);

          const res = await axios.post(`${backEndUrl}/receipt/process/dpk/from/delivery`, { data: payloadData }, { withCredentials: true });
          if (res.data.success) {
            Toast.show({ content: "Berhasil!", icon: "success" });
            setSearchText("");
            setSelectedDate(null);
            fetchData();
          }
        } catch (error) {
          console.log(error);

          Toast.show({ content: "Error", icon: "fail" });
        }
      },
    });
  };

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
                disabled={!allChecked}
                onChange={() => toggleBundleSelection(bundle.bundleNo)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "bold", fontSize: 14 }}>{bundle.bundleNo}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                {bundle.shipments.length} Dok • {dayjs(bundle.created).format("DD MMM YYYY HH:mm")}
              </div>
            </div>
          </div>
        }
      >
        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 8 }}>
          {bundle.shipments.map((item) => (
            <Card key={item.key} style={{ marginBottom: 8, borderRadius: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: "bold", color: '#1677ff' }}>{item.documentno}</div>
                  <div style={{ fontSize: 13, color: "#444", margin: '4px 0' }}>{item.customer}</div>
                  <div style={{ fontSize: 12, color: "#999" }}>
                    <CalendarOutline style={{ marginRight: 4 }} />
                    {item.plantime ? dayjs(item.plantime).format("DD-MM-YYYY") : "-"}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: 'flex-end' }}>
                  <Button size="mini" color="danger" fill="none" onClick={() => handleRejectItem(item)}>Reject</Button>
                  {item.checked ? (
                    <Tag color="success" fill="outline" onClick={() => handleShipmentResetCheck(bundle.bundleNo, item.key)}>
                      <CheckOutline /> Checked
                    </Tag>
                  ) : (
                    <Button size="mini" color="primary" onClick={() => handleShipmentCheck(bundle.bundleNo, item.key)}>Check</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Collapse.Panel>
    );
  };

  return (
    <LayoutGlobalMobile title="Receipt from Delivery">
      {/* --- STICKY FILTER HEADER --- */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#fff',
        padding: '10px 12px',
        borderBottom: '1px solid #eee',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        <SearchBar
          placeholder='Cari SJ, Bundle, Customer...'
          value={searchText}
          onChange={val => setSearchText(val)}
          onClear={() => setSearchText("")}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <CalendarOutline color="#666" />
            <span style={{ fontSize: 14 }}>Tanggal:</span>
          </Space>

          <Space>
            {selectedDate && (
              <Button
                size="mini"
                fill="none"
                onClick={() => setSelectedDate(null)}
                style={{ color: '#ff4d4f', padding: 0 }}
              >
                <CloseCircleFill fontSize={18} />
              </Button>
            )}
            <Button
              size="mini"
              fill="outline"
              color="primary"
              onClick={() => setPickerVisible(true)}
              style={{ borderRadius: 4 }}
            >
              {selectedDate ? dayjs(selectedDate).format("DD MMM YYYY") : "Semua Tanggal"}
            </Button>
          </Space>
        </div>
      </div>

      <DatePicker
        title='Pilih Tanggal Plan'
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onConfirm={val => setSelectedDate(val)}
      />

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 100, minHeight: '70vh' }}>
          {loading && <AutoCenter><SpinLoading color="primary" /></AutoCenter>}

          {!loading && filteredData.length === 0 && (
            <AutoCenter style={{ marginTop: 40, flexDirection: 'column', gap: 12 }}>
              <FileOutline fontSize={48} color="#ccc" />
              <div style={{ color: "#999" }}>
                Tidak ada data ditemukan.
              </div>
              {(searchText || selectedDate) && (
                <Button size="small" onClick={() => { setSearchText(""); setSelectedDate(null); }}>Reset Filter</Button>
              )}
            </AutoCenter>
          )}

          <Collapse activeKey={activeKey} onChange={setActiveKey}>
            {filteredData.map((bundle) => renderBundle(bundle))}
          </Collapse>
        </div>
      </PullToRefresh>

      {/* --- FLOATING BUTTON --- */}
      {filteredData.filter(b => b.bundleSelected).length > 0 && (
        <div style={{ position: "fixed", bottom: 70, left: 12, right: 12, zIndex: 100 }}>
          <Button
            block
            color="primary"
            size="large"
            onClick={handleSubmit}
            style={{ boxShadow: "0 4px 12px rgba(22, 119, 255, 0.4)", borderRadius: 12, fontWeight: 'bold' }}
          >
            Accept ({filteredData.filter(b => b.bundleSelected).length} Bundle)
          </Button>
        </div>
      )}
    </LayoutGlobalMobile>
  );
};

export default DPKFromDeliveryMobile;