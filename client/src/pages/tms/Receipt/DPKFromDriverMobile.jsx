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
  SearchBar, // Import SearchBar
  Tag,
} from "antd-mobile";
import { CalendarOutline, RightOutline, FileOutline } from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const DPKFromDriverMobile = () => {
  // --- STATE ---
  const [dataList, setDataList] = useState([]); // Master Data
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState([]);
  const [searchText, setSearchText] = useState(""); // State pencarian

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

  // --- LOGIC SEARCH & FILTERING (UX CORE) ---
  // Menggunakan useMemo agar performa tetap ringan saat mengetik
  const filteredData = useMemo(() => {
    if (!searchText) return dataList;

    const lowerSearch = searchText.toLowerCase();

    return dataList
      .map((bundle) => {
        // 1. Cek apakah Bundle No cocok
        const isBundleMatch = bundle.bundleNo.toLowerCase().includes(lowerSearch);

        // 2. Cek apakah ada shipment di dalam bundle yang cocok
        const matchingShipments = bundle.shipments.filter((s) =>
          s.documentno.toLowerCase().includes(lowerSearch)
        );

        // Logic: Jika Bundle No cocok, tampilkan semua isinya.
        // Jika tidak, tampilkan hanya shipment yang cocok (jika ada).
        if (isBundleMatch) {
          return bundle;
        } else if (matchingShipments.length > 0) {
          return {
            ...bundle,
            shipments: matchingShipments, // Filter isinya agar user fokus ke yang dicari
          };
        }
        return null; // Tidak ada yang cocok di bundle ini
      })
      .filter((item) => item !== null);
  }, [dataList, searchText]);

  // --- AUTO EXPAND SAAT SEARCHING ---
  useEffect(() => {
    if (searchText) {
      // Jika sedang mencari, buka semua bundle hasil pencarian
      const allKeys = filteredData.map((b) => b.key);
      setActiveKey(allKeys);
    } else {
      // Jika clear search, tutup semua (atau biarkan state terakhir, opsional)
      setActiveKey([]);
    }
  }, [searchText, filteredData]);


  // --- HANDLER UPDATE STATE (Checkbox) ---
  // Kita harus update Master Data (dataList), bukan filteredData
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

  const handleSubmit = () => {
    const selectedBundles = dataList.filter((b) => b.bundleSelected);
    if (selectedBundles.length === 0) return;

    Dialog.confirm({
      title: "Konfirmasi Penerimaan",
      confirmText: "Terima",
      cancelText: "Batal",
      content: (
        <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
          <p>Terima <b>{selectedBundles.length} Bundle</b> terpilih?</p>
        </div>
      ),
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
            setSearchText(""); // Reset search setelah submit
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
      <div key={bundle.key} style={{ marginBottom: 16 }}>
        <Collapse
          activeKey={activeKey}
          onChange={setActiveKey}
          accordion={false} // Biarkan banyak terbuka sekaligus
        >
          <Collapse.Panel
            key={bundle.key}
            title={
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: '4px 0' }}>
                {/* 1. CHECKBOX (Sisi Kiri) */}
                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4 }}>
                  <Checkbox
                    checked={bundle.bundleSelected}
                    onChange={() => toggleBundleSelection(bundle.bundleNo)}
                    style={{ '--size': '20px' }}
                  />
                </div>

                {/* 2. KONTEN HEADER */}
                <div style={{ flex: 1 }}>
                  {/* Baris Atas: Nomor Bundle & Tag Jumlah */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: "700", fontSize: 16, color: '#1a1a1a' }}>
                      {bundle.bundleNo}
                    </span>
                    <Tag color='primary' fill='outline' style={{ fontSize: 10, borderRadius: 4, padding: '2px 6px' }}>
                      {bundle.shipments.length} Docs
                    </Tag>
                  </div>

                  {/* Baris Bawah: Info Dua Driver (Flow UI) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#f9f9f9',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid #eee',
                    gap: 8
                  }}>
                    {/* Driver Pengirim */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: '#999', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2 }}>
                        Pengirim
                      </div>
                      <div style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: '#444',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {bundle.drivername || "Internal/Vendor"}
                      </div>
                    </div>

                    {/* Icon Panah Alur */}
                    <RightOutline style={{ color: '#ccc', fontSize: 14 }} />

                    {/* Driver Penerima */}
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: '#999', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2 }}>
                        Penerima
                      </div>
                      <div style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: '#1677ff', // Warna biru menonjolkan siapa pembawa sekarang
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {bundle.drivername_receipt || "Tanpa Nama"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          >
            {/* 3. DAFTAR SHIPMENT (Bagian Dalam Collapse) */}
            <div style={{ background: "#f0f2f5", borderRadius: 8, padding: 10 }}>
              {bundle.shipments.map((item) => (
                <Card
                  key={item.key}
                  style={{
                    marginBottom: 8,
                    borderRadius: 8,
                    borderLeft: '4px solid #1677ff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 17,
                        fontWeight: "800",
                        color: "#1677ff",
                        marginBottom: 4,
                        fontFamily: 'monospace'
                      }}>
                        {item.documentno}
                      </div>

                      <div style={{ fontSize: 14, fontWeight: '600', color: "#222", marginBottom: 6 }}>
                        {item.customer}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: "#666" }}>
                        <CalendarOutline fontSize={14} />
                        {item.plantime ? dayjs(item.plantime).format("DD MMM YYYY") : "-"}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <Button
                        size="mini"
                        color="danger"
                        fill="none"
                        onClick={() => handleRejectItem(item)}
                        style={{ '--padding-right': '0px', fontWeight: 'bold' }}
                      >
                        REJECT
                      </Button>
                    </div>
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

      {/* 1. STICKY SEARCH BAR */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 99,
        background: '#fff',
        padding: '12px 12px 8px 12px',
        borderBottom: '1px solid #eee'
      }}>
        <SearchBar
          placeholder="Cari No Dokumen / Bundle..."
          value={searchText}
          onChange={setSearchText}
          onClear={() => setSearchText("")}
          style={{ '--border-radius': '8px', '--background': '#f0f0f0' }}
        />
      </div>

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 80, minHeight: '80vh' }}>
          {loading && (
            <AutoCenter style={{ padding: 20 }}>
              <SpinLoading color="primary" />
            </AutoCenter>
          )}

          {!loading && filteredData.length === 0 && (
            <AutoCenter style={{ marginTop: 40, flexDirection: 'column', gap: 10 }}>
              <FileOutline fontSize={48} color="#ccc" />
              <div style={{ color: "#999" }}>
                {searchText ? `Dokumen "${searchText}" tidak ditemukan` : "Tidak ada data bundle."}
              </div>
            </AutoCenter>
          )}


          {filteredData.map((bundle) => renderBundle(bundle))}
        </div>
      </PullToRefresh>

      {/* --- FLOATING ACCEPT BUTTON --- */}
      {selectedCount > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 55, // Sedikit dinaikkan agar tidak tertutup navigation bar HP
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
            style={{
              boxShadow: "0 4px 20px rgba(22, 119, 255, 0.5)",
              fontWeight: 'bold',
              borderRadius: 12
            }}
          >
            Accept ({selectedCount} Bundle)
          </Button>
        </div>
      )}
    </LayoutGlobalMobile>
  );
};

export default DPKFromDriverMobile;