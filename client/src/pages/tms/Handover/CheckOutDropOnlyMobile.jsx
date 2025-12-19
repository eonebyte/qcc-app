import React, { useEffect, useState, useMemo } from "react";
import {
  Button,
  Card,
  Checkbox,
  List,
  Popup,
  SearchBar,
  Tag,
  Toast,
  AutoCenter,
  SpinLoading,
  DatePicker,
  Space,
} from "antd-mobile";
import {
  TruckOutline,
  FileOutline,
  CalendarOutline,
  CloseCircleFill,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function CheckOutDropOnlyMobile() {
  // --- STATES ---
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [searchText, setSearchText] = useState("");

  // Date Filter States
  const [filterDate, setFilterDate] = useState(null); // null = Semua Tanggal
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  const [isPopupOpen, setIsPopupOpen] = useState(false);

  // --- FETCH DATA ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await fetch(
        `${backEndUrl}/handover/list/checkin/customer/do`,
        { credentials: "include" },
      );
      const json = await resp.json();

      const mapped = json.data.data.map((row) => ({
        key: row.m_inout_id,
        ...row,
        plantimeFormatted: row.plantime
          ? dayjs(row.plantime).format("DD-MM-YYYY HH:mm")
          : "-",
      }));

      setTableData(mapped);
    } catch (err) {
      console.error("Fetch error:", err);
      Toast.show({ content: "Gagal memuat data", icon: "fail" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- LOGIC FILTERING (Search + Date) ---
  const filteredData = useMemo(() => {
    return tableData.filter((item) => {
      // 1. Filter Tanggal (berdasarkan plantime)
      const matchesDate = filterDate
        ? dayjs(item.plantime).isSame(dayjs(filterDate), "day")
        : true;

      // 2. Filter Teks
      const lower = searchText.toLowerCase();
      const matchesSearch =
        !searchText ||
        (item.documentno && item.documentno.toLowerCase().includes(lower)) ||
        (item.customer && item.customer.toLowerCase().includes(lower)) ||
        (item.drivername && item.drivername.toLowerCase().includes(lower));

      return matchesDate && matchesSearch;
    });
  }, [tableData, searchText, filterDate]);

  // --- ACTIONS ---
  const toggleSelection = (record) => {
    const isSelected = selectedRows.find((r) => r.key === record.key);
    if (isSelected) {
      setSelectedRows(selectedRows.filter((r) => r.key !== record.key));
    } else {
      setSelectedRows([...selectedRows, record]);
    }
  };

  const openReceiptPopup = () => {
    if (selectedRows.length === 0) return;
    setIsPopupOpen(true);
  };

  const handleSubmit = async () => {
    try {
      Toast.show({ icon: "loading", content: "Processing...", duration: 0 });
      const payload = {
        driverName: selectedRows[0].drivername,
        tnkbId: Number(selectedRows[0].tnkb_id),
        data: selectedRows,
      };

      const resp = await fetch(
        `${backEndUrl}/handover/process/driver/to/customer/do`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        },
      );

      const json = await resp.json();
      Toast.clear();

      if (json.data && json.data.insertedCount > 0) {
        Toast.show({ content: "Receipt SJ berhasil!", icon: "success" });
        setIsPopupOpen(false);
        setSelectedRows([]);
        fetchData();
      } else {
        Toast.show({ content: "Submit gagal.", icon: "fail" });
      }
    } catch (err) {
      Toast.clear();
      Toast.show({ content: "Terjadi error.", icon: "fail" });
    }
  };

  return (
    <LayoutGlobalMobile title="SJ di Customer">
      {/* STICKY HEADER FILTER */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#f5f5f5",
          padding: "12px 12px 4px 12px",
        }}
      >
        <Space direction="vertical" block>
          {/* Search & Date Button */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <SearchBar
                placeholder="Cari Dokumen..."
                value={searchText}
                onChange={setSearchText}
                style={{ "--background": "#fff", borderRadius: 8 }}
              />
            </div>
            <Button
              onClick={() => setIsDatePickerVisible(true)}
              style={{
                borderRadius: 8,
                background: filterDate ? "#e6f7ff" : "#fff",
              }}
            >
              <CalendarOutline
                fontSize={20}
                color={filterDate ? "#1677ff" : "#666"}
              />
            </Button>
          </div>

          {/* Filter Active Chips */}
          {filterDate && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Tag
                color="primary"
                fill="outline"
                style={{
                  padding: "4px 8px",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
                onClick={() => setFilterDate(null)}
              >
                Tanggal: {dayjs(filterDate).format("DD MMM YYYY")}
                <CloseCircleFill fontSize={14} />
              </Tag>
            </div>
          )}
        </Space>
      </div>

      {/* CONTENT LIST */}
      <div style={{ padding: 12, paddingBottom: 100 }}>
        {loading ? (
          <AutoCenter style={{ padding: 40 }}>
            <SpinLoading color="primary" />
          </AutoCenter>
        ) : (
          <>
            {filteredData.length === 0 ? (
              <AutoCenter style={{ marginTop: 40, color: "#999" }}>
                <FileOutline fontSize={48} />
                <div>Tidak ada data yang cocok</div>
              </AutoCenter>
            ) : (
              filteredData.map((item) => {
                const isSelected = selectedRows.some((r) => r.key === item.key);
                return (
                  <Card
                    key={item.key}
                    style={{
                      marginBottom: 12,
                      borderRadius: 12,
                      border: isSelected ? "1px solid #1677ff" : "none",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    }}
                    onClick={() => toggleSelection(item)}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                    >
                      <Checkbox checked={isSelected} style={{ marginTop: 6 }} />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          {/* DOC NO MENONJOL */}
                          <span
                            style={{
                              fontWeight: "800",
                              fontSize: 17,
                              color: "#1677ff",
                              fontFamily: "monospace",
                            }}
                          >
                            {item.documentno}
                          </span>
                          <Tag
                            color="success"
                            fill="outline"
                            style={{ borderRadius: 4 }}
                          >
                            Drop Only
                          </Tag>
                        </div>

                        <div
                          style={{
                            marginTop: 6,
                            fontWeight: "600",
                            color: "#333",
                            fontSize: 14,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <TruckOutline /> ({item.customerkey}) {item.customer}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 8,
                          }}
                        >
                          <div style={{ color: "#888", fontSize: 12 }}>
                            <CalendarOutline style={{ marginRight: 4 }} />
                            {item.plantimeFormatted}
                          </div>
                          <div style={{ color: "#999", fontSize: 12 }}>
                            {item.drivername}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </>
        )}
      </div>

      {/* DATE PICKER COMPONENT */}
      <DatePicker
        title="Pilih Tanggal Plan"
        visible={isDatePickerVisible}
        onClose={() => setIsDatePickerVisible(false)}
        onConfirm={(val) => {
          setFilterDate(val);
        }}
        defaultValue={new Date()}
      />

      {/* FLOATING ACTION BUTTON */}
      <div
        style={{
          position: "fixed",
          bottom: 60, // Diatas tabbar mobile
          left: 12,
          right: 12,
          zIndex: 100,
        }}
      >
        <Button
          block
          color="primary"
          size="large"
          disabled={selectedRows.length === 0}
          onClick={openReceiptPopup}
          style={{
            borderRadius: 12,
            boxShadow: "0 4px 12px rgba(22, 119, 255, 0.4)",
            fontWeight: "bold",
          }}
        >
          Ambil {selectedRows.length > 0 && `(${selectedRows.length} Dokumen)`}
        </Button>
      </div>

      {/* CONFIRMATION POPUP */}
      <Popup
        visible={isPopupOpen}
        onMaskClick={() => setIsPopupOpen(false)}
        bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <div style={{ padding: 20 }}>
          <div
            style={{
              textAlign: "center",
              fontWeight: "bold",
              fontSize: 18,
              marginBottom: 12,
            }}
          >
            Konfirmasi Ambil SJ
          </div>
          <div
            style={{
              maxHeight: "30vh",
              overflowY: "auto",
              background: "#f9f9f9",
              padding: 12,
              borderRadius: 12,
              marginBottom: 20,
            }}
          >
            {selectedRows.map((r) => (
              <div
                key={r.key}
                style={{
                  padding: "6px 0",
                  borderBottom: "1px solid #eee",
                  fontSize: 14,
                }}
              >
                <b>{r.documentno}</b> - ({r.customerkey}) {r.customer}
              </div>
            ))}
          </div>
          <Space block direction="horizontal" style={{ "--gap": "12px" }}>
            <Button
              block
              onClick={() => setIsPopupOpen(false)}
              style={{ flex: 1, borderRadius: 8 }}
            >
              Batal
            </Button>
            <Button
              block
              color="primary"
              onClick={handleSubmit}
              style={{ flex: 1, borderRadius: 8 }}
            >
              Konfirmasi
            </Button>
          </Space>
        </div>
      </Popup>
    </LayoutGlobalMobile>
  );
}
