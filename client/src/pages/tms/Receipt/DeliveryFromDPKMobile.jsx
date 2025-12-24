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
  SearchBar,
  DatePicker,
  Space,
} from "antd-mobile";
import {
  CheckOutline,
  CalendarOutline,
  UserOutline,
  SearchOutline,
  CloseCircleFill,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import { useSelector } from "react-redux";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const DeliveryFromDPKMobile = () => {
  // --- STATE ---
  const user = useSelector((state) => state.auth.user);
  const userId = user.ad_user_id;

  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState([]);

  // --- STATE FILTER ---
  const [searchText, setSearchText] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  // --- FETCH DATA ---
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
      console.error(err);
      Toast.show({ content: "Gagal mengambil data", icon: "fail" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- LOGIC FILTERING (useMemo) ---
  const filteredData = useMemo(() => {
    const lowerSearch = searchText.toLowerCase();

    return dataList
      .map((bundle) => {
        // Filter shipments di dalam bundle
        const matchingShipments = bundle.shipments.filter((s) => {
          const matchesText = !searchText || (
            s.documentno.toLowerCase().includes(lowerSearch) ||
            s.customer.toLowerCase().includes(lowerSearch) ||
            (s.drivername && s.drivername.toLowerCase().includes(lowerSearch))
          );

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
          const updatedShipments = bundle.shipments.map((s) => {
            if (s.key === shipmentKey) return { ...s, checked: true, clickCount: 0 };
            return s;
          });
          return { ...bundle, shipments: updatedShipments };
        }
        return bundle;
      }),
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
                Toast.show({ content: "Status di-reset", icon: "success" });
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

  const toggleBundleSelection = (bundleNo) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
          return { ...bundle, bundleSelected: !bundle.bundleSelected };
        }
        return bundle;
      }),
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
    const selectedBundles = filteredData.filter((b) => b.bundleSelected);
    if (selectedBundles.length === 0) return;

    Dialog.confirm({
      title: "Konfirmasi",
      content: `Terima ${selectedBundles.length} Bundle terpilih?`,
      onConfirm: async () => {
        try {
          const payloadData = selectedBundles.map((b) => ({
            ...b,
            shipments: b.shipments.filter((s) => s.checked),
          }));

          const res = await axios.post(
            `${backEndUrl}/receipt/process/delivery/from/dpk`,
            { data: payloadData },
            { withCredentials: true },
          );

          if (res.data.success) {
            Toast.show({ content: "Berhasil Diterima!", icon: "success" });
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
            <div>
              <div style={{ fontWeight: "bold" }}>{bundle.bundleNo}</div>
              <div style={{ fontSize: 12, color: "#888" }}>
                {bundle.shipments.length} Dokumen • {dayjs(bundle.created).add(7, "hour").format("DD-MM-YYYY HH:mm")}
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
                  <div style={{ fontWeight: "bold", color: "#1677ff" }}>{item.documentno}</div>
                  <div style={{ fontSize: 13, color: "#444" }}>{item.customer}</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                    <CalendarOutline style={{ marginRight: 4 }} />
                    {item.plantime ? dayjs(item.plantime).format("DD-MM-YYYY HH:mm") : "-"}
                  </div>
                  {item.drivername && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      <UserOutline style={{ marginRight: 4 }} />
                      Driver: {item.drivername}
                    </div>
                  )}
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

  const selectedCount = filteredData.filter((b) => b.bundleSelected).length;

  return (
    <LayoutGlobalMobile title="Receipt from DPK">
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
          placeholder='Cari SJ, Bundle, Customer, Driver...'
          value={searchText}
          onChange={setSearchText}
          onClear={() => setSearchText("")}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <CalendarOutline color="#666" />
            <span style={{ fontSize: 14 }}>Tgl Plan:</span>
          </Space>
          <Space>
            {selectedDate && (
              <Button size="mini" fill="none" onClick={() => setSelectedDate(null)} style={{ color: '#ff4d4f', padding: 0 }}>
                <CloseCircleFill fontSize={18} />
              </Button>
            )}
            <Button size="mini" fill="outline" color="primary" onClick={() => setPickerVisible(true)} style={{ borderRadius: 4 }}>
              {selectedDate ? dayjs(selectedDate).format("DD MMM YYYY") : "Semua"}
            </Button>
          </Space>
        </div>
      </div>

      <DatePicker
        title='Pilih Tanggal Plan'
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onConfirm={setSelectedDate}
      />

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 100, minHeight: '70vh' }}>
          {loading && <AutoCenter>Loading...</AutoCenter>}
          {!loading && filteredData.length === 0 && (
            <AutoCenter style={{ marginTop: 20, flexDirection: 'column', gap: 10 }}>
              <div style={{ color: "#999" }}>Data tidak ditemukan.</div>
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
      {selectedCount > 0 && (
        <div style={{ position: "fixed", bottom: 70, left: 12, right: 12, zIndex: 100 }}>
          <Button
            block
            color="primary"
            size="large"
            onClick={handleSubmit}
            style={{ boxShadow: "0 4px 12px rgba(22, 119, 255, 0.4)", borderRadius: 12, fontWeight: 'bold' }}
          >
            Accept ({selectedCount} Bundle)
          </Button>
        </div>
      )}
    </LayoutGlobalMobile>
  );
};

export default DeliveryFromDPKMobile;