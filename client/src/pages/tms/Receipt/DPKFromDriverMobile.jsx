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
  DatePicker, // Tambahkan DatePicker
  Space,
} from "antd-mobile";
import {
  CalendarOutline,
  RightOutline,
  FileOutline,
  CloseCircleFill // Icon untuk reset tanggal
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const DPKFromDriverMobile = () => {
  // --- STATE ---
  const [dataList, setDataList] = useState([]); // Master Data
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState([]);
  const [searchText, setSearchText] = useState(""); // State pencarian teks

  // --- STATE FILTER TANGGAL ---
  const [selectedDate, setSelectedDate] = useState(null); // Filter Tanggal Handover
  const [pickerVisible, setPickerVisible] = useState(false);

  // --- FETCH DATA ---
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

  useEffect(() => {
    fetchData();
  }, []);

  // --- LOGIC SEARCH & FILTERING (Synchronized with Web) ---
  const filteredData = useMemo(() => {
    const lowerSearch = searchText.toLowerCase();

    return dataList
      .filter((bundle) => {
        // 1. Filter Tanggal (Berdasarkan bundle.created / Date Handover)
        const matchesDate = !selectedDate ||
          dayjs(bundle.created).isSame(dayjs(selectedDate), 'day');

        // 2. Filter Teks (Bundle No, SJ No, Driver, atau Customer)
        const matchesBundleNo = bundle.bundleNo?.toLowerCase().includes(lowerSearch);
        const matchesDriver = bundle.drivername?.toLowerCase().includes(lowerSearch);
        const matchesShipmentNo = bundle.shipments.some(s =>
          s.documentno?.toLowerCase().includes(lowerSearch) ||
          s.customer?.toLowerCase().includes(lowerSearch)
        );

        const matchesSearch = !searchText || (matchesBundleNo || matchesDriver || matchesShipmentNo);

        // Harus cocok keduanya (Tanggal DAN Teks)
        return matchesDate && matchesSearch;
      })
      .map((bundle) => {
        // Jika pencarian spesifik ke nomor SJ/Customer (bukan nomor bundle), filter isinya agar user mudah melihat
        const matchesBundleInfo = !searchText ||
          bundle.bundleNo?.toLowerCase().includes(lowerSearch) ||
          bundle.drivername?.toLowerCase().includes(lowerSearch);

        if (searchText && !matchesBundleInfo) {
          const matchingShipments = bundle.shipments.filter((s) =>
            s.documentno?.toLowerCase().includes(lowerSearch) ||
            s.customer?.toLowerCase().includes(lowerSearch)
          );
          return { ...bundle, shipments: matchingShipments };
        }
        return bundle;
      });
  }, [dataList, searchText, selectedDate]);

  // --- AUTO EXPAND SAAT SEARCHING ---
  useEffect(() => {
    if (searchText || selectedDate) {
      const allKeys = filteredData.map((b) => b.key);
      setActiveKey(allKeys);
    } else {
      setActiveKey([]);
    }
  }, [searchText, selectedDate, filteredData]);

  const toggleBundleSelection = (bundleNo) => {
    setDataList((prev) =>
      prev.map((bundle) => {
        if (bundle.bundleNo === bundleNo) {
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
            Toast.show({ content: "Dokumen direject", icon: "success" });
            fetchData();
          }
        } catch (error) {
          console.log(error);

          Toast.show({ content: "Error saat reject", icon: "fail" });
        }
      },
    });
  };

  const handleSubmit = () => {
    const selectedBundles = dataList.filter((b) => b.bundleSelected);
    if (selectedBundles.length === 0) return;

    Dialog.confirm({
      title: "Konfirmasi Penerimaan",
      content: `Terima ${selectedBundles.length} Bundle terpilih?`,
      onConfirm: async () => {
        try {
          const payload = { data: selectedBundles };
          const res = await axios.post(
            `${backEndUrl}/receipt/process/dpk/from/driver`,
            payload,
            { withCredentials: true },
          );

          if (res.data.success) {
            Toast.show({ content: "Berhasil Diterima!", icon: "success" });
            fetchData();
            setSearchText("");
            setSelectedDate(null);
          }
        } catch (error) {
          console.log(error);

          Toast.show({ content: "Error", icon: "fail" });
        }
      },
    });
  };

  const renderBundle = (bundle) => {
    return (
      <div key={bundle.key} style={{ marginBottom: 16 }}>
        <Collapse activeKey={activeKey} onChange={setActiveKey} accordion={false}>
          <Collapse.Panel
            key={bundle.key}
            title={
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: '4px 0' }}>
                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4 }}>
                  <Checkbox
                    checked={bundle.bundleSelected}
                    onChange={() => toggleBundleSelection(bundle.bundleNo)}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: "700", fontSize: 16, color: '#1a1a1a' }}>
                      {bundle.bundleNo}
                    </span>
                    <Tag color='primary' fill='outline' style={{ fontSize: 10 }}>
                      {bundle.shipments.length} Docs
                    </Tag>
                  </div>

                  <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
                    Handover: {dayjs(bundle.created).format("DD MMM YYYY HH:mm")}
                  </div>

                  <div style={{
                    display: 'flex', alignItems: 'center', background: '#f9f9f9', padding: '8px', borderRadius: '8px', border: '1px solid #eee', gap: 8
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: '#999', fontWeight: 'bold' }}>PENGIRIM</div>
                      <div style={{ fontSize: 12, fontWeight: '600', color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bundle.drivername || "Internal"}
                      </div>
                    </div>
                    <RightOutline style={{ color: '#ccc', fontSize: 14 }} />
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: '#999', fontWeight: 'bold' }}>PENERIMA</div>
                      <div style={{ fontSize: 12, fontWeight: '700', color: '#1677ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bundle.drivername_receipt || "-"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          >
            <div style={{ background: "#f0f2f5", borderRadius: 8, padding: 10 }}>
              {bundle.shipments.map((item) => (
                <Card key={item.key} style={{ marginBottom: 8, borderLeft: '4px solid #1677ff' }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: "800", color: "#1677ff" }}>{item.documentno}</div>
                      <div style={{ fontSize: 14, fontWeight: '600', color: "#222" }}>{item.customer}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        Plan: {item.plantime ? dayjs(item.plantime).format("DD MMM YYYY") : "-"}
                      </div>
                    </div>
                    <Button size="mini" color="danger" fill="none" onClick={() => handleRejectItem(item)}>REJECT</Button>
                  </div>
                </Card>
              ))}
            </div>
          </Collapse.Panel>
        </Collapse>
      </div>
    );
  };

  const selectedCount = dataList.filter((b) => b.bundleSelected).length;

  return (
    <LayoutGlobalMobile title="Receipt from Driver">

      {/* --- STICKY SEARCH & DATE FILTER --- */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 99, background: '#fff', padding: '12px', borderBottom: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 10
      }}>
        <SearchBar
          placeholder="Cari SJ / Bundle / Customer..."
          value={searchText}
          onChange={setSearchText}
          style={{ '--border-radius': '8px' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space align="center">
            <CalendarOutline color="#666" />
            <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>Tgl Handover:</span>
          </Space>

          <Space align="center">
            {selectedDate && (
              <CloseCircleFill
                onClick={() => setSelectedDate(null)}
                style={{ color: '#ccc', fontSize: 18, cursor: 'pointer' }}
              />
            )}
            <Button
              size="mini"
              fill="outline"
              color="primary"
              onClick={() => setPickerVisible(true)}
              style={{ borderRadius: 6, fontSize: 13 }}
            >
              {selectedDate ? dayjs(selectedDate).format("DD MMM YYYY") : "Semua Tanggal"}
            </Button>
          </Space>
        </div>
      </div>

      <DatePicker
        title='Filter Tanggal Handover'
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onConfirm={val => setSelectedDate(val)}
        max={new Date()}
      />

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 80, minHeight: '80vh' }}>
          {loading && <AutoCenter><SpinLoading color="primary" /></AutoCenter>}

          {!loading && filteredData.length === 0 && (
            <AutoCenter style={{ marginTop: 40, flexDirection: 'column', gap: 12 }}>
              <FileOutline fontSize={48} color="#ccc" />
              <div style={{ color: "#999" }}>
                {searchText || selectedDate ? "Data tidak ditemukan dengan filter ini." : "Tidak ada data bundle."}
              </div>
              {(searchText || selectedDate) && (
                <Button size="small" onClick={() => { setSearchText(""); setSelectedDate(null); }}>Reset Filter</Button>
              )}
            </AutoCenter>
          )}

          {filteredData.map((bundle) => renderBundle(bundle))}
        </div>
      </PullToRefresh>

      {/* --- FLOATING ACCEPT BUTTON --- */}
      {selectedCount > 0 && (
        <div style={{ position: "fixed", bottom: 55, left: 12, right: 12, zIndex: 100 }}>
          <Button block color="primary" size="large" onClick={handleSubmit} style={{ boxShadow: "0 4px 20px rgba(22, 119, 255, 0.4)", borderRadius: 12, fontWeight: 'bold' }}>
            Accept ({selectedCount} Bundle)
          </Button>
        </div>
      )}
    </LayoutGlobalMobile>
  );
};

export default DPKFromDriverMobile;