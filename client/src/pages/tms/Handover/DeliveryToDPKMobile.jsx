import React, { useEffect, useState } from "react";
import {
  Card,
  Button,
  SearchBar,
  Checkbox,
  Dialog,
  Toast,
  Tag,
  Popup,
  Form,
  AutoCenter,
  PullToRefresh,
  List,
  SpinLoading,
} from "antd-mobile";
import {
  CheckOutline,
  CloseOutline,
  FilterOutline,
  SendOutline,
  CalendarOutline,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function DeliveryToDPKMobile() {
  // --- STATE ---
  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]); // Menyimpan ID item yang dipilih

  // Filter State
  const [searchText, setSearchText] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // --- FETCH DATA ---
  const fetchData = async () => {
    setLoading(true);
    try {
      // Gunakan format YYYY-MM-DD
      const startStr = startDate ? dayjs(startDate).format("YYYY-MM-DD") : "";
      const endStr = endDate ? dayjs(endDate).format("YYYY-MM-DD") : "";

      // Param search (opsional jika backend support search query param,
      // jika tidak, kita filter di client side seperti contoh table desktop)
      // Disini saya asumsikan filter tanggal via API, search via client side filtering dulu
      // atau sesuaikan dengan backend Anda.

      const resp = await fetch(
        `${backEndUrl}/handover/list/delivery/to/dpk?startDate=${startStr}&endDate=${endStr}`,
        { credentials: "include" },
      );
      const json = await resp.json();

      const mapped = json.data.data.map((row, index) => ({
        key: row.m_inout_id, // Gunakan ID unik
        m_inout_id: row.m_inout_id,
        adw_trackingsj_id: row.adw_trackingsj_id,
        no: index + 1,
        documentno: row.documentno,
        customer: row.customer,
        plantime: row.plantime,
        checkpoin_id: row.checkpoin_id,
        cancelrequest: row.cancelrequest,
      }));

      setDataList(mapped);
    } catch (err) {
      console.error("Fetch error:", err);
      Toast.show({ content: "Gagal mengambil data", icon: "fail" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // Init load

  // --- FILTERS LOGIC (Client Side Search untuk Document No & Customer) ---
  const filteredData = dataList.filter((item) => {
    const searchLower = searchText.toLowerCase();
    return (
      (item.documentno &&
        item.documentno.toLowerCase().includes(searchLower)) ||
      (item.customer && item.customer.toLowerCase().includes(searchLower))
    );
  });

  // --- HANDLERS SELECTION ---
  const toggleSelection = (key) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedKeys.length === filteredData.length) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(filteredData.map((item) => item.key));
    }
  };

  // --- HANDLERS CANCEL REQUEST ---
  const handleConfirmCancel = (item) => {
    Dialog.confirm({
      title: "Konfirmasi Cancel",
      content: `Apakah Anda yakin akan confirm cancel dokumen ${item.documentno}?`,
      confirmText: "Submit",
      cancelText: "Batal",
      onConfirm: async () => {
        try {
          const res = await axios.post(`${backEndUrl}/tms/cancel`, item, {
            withCredentials: true,
          });
          if (res.data.success) {
            Toast.show({ content: "Berhasil confirm cancel", icon: "success" });
            fetchData();
          } else {
            Toast.show({ content: res.data.message || "Gagal", icon: "fail" });
          }
        } catch (error) {
          console.log(error);
          Toast.show({ content: "Terjadi kesalahan", icon: "fail" });
        }
      },
    });
  };

  const handleRejectCancel = (item) => {
    Dialog.confirm({
      title: "Reject Cancel",
      content: `Apakah Anda yakin akan menolak request cancel dokumen ${item.documentno}?`,
      confirmText: "Reject",
      cancelText: "Batal",
      onConfirm: async () => {
        try {
          const res = await axios.post(
            `${backEndUrl}/tms/reject/req/cancel`,
            item,
            { withCredentials: true },
          );
          if (res.data.success) {
            Toast.show({ content: "Berhasil reject cancel", icon: "success" });
            fetchData();
          } else {
            Toast.show({ content: res.data.message || "Gagal", icon: "fail" });
          }
        } catch (error) {
          console.log(error);
          Toast.show({ content: "Terjadi kesalahan", icon: "fail" });
        }
      },
    });
  };

  // --- HANDLER SUBMIT HANDOVER ---
  const handleSubmitHandover = () => {
    if (selectedKeys.length === 0) return;

    // Cari full object dari keys
    const selectedItems = dataList.filter((item) =>
      selectedKeys.includes(item.key),
    );

    Dialog.confirm({
      title: "Submit Handover",
      content: `Kirim handover untuk ${selectedItems.length} dokumen terpilih?`,
      confirmText: "Submit",
      cancelText: "Batal",
      onConfirm: async () => {
        try {
          const payload = { data: selectedItems };
          const resp = await fetch(
            `${backEndUrl}/handover/process/delivery/to/dpk`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              credentials: "include",
            },
          );
          const json = await resp.json();

          if (json.data && json.data.insertedCount > 0) {
            Toast.show({ content: "Handover Berhasil!", icon: "success" });
            setSelectedKeys([]);
            fetchData();
          } else {
            Toast.show({ content: "Submit Gagal.", icon: "fail" });
          }
        } catch (err) {
          console.log(err);
          Toast.show({ content: "Terjadi error saat submit.", icon: "fail" });
        }
      },
    });
  };

  return (
    <LayoutGlobalMobile title="Handover to DPK">
      {/* --- HEADER: Search & Filter --- */}
      <div
        style={{
          background: "#fff",
          padding: "10px 12px",
          position: "sticky",
          top: 0,
          zIndex: 10,
          boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <SearchBar
              placeholder="Cari Doc No / Customer"
              value={searchText}
              onChange={setSearchText}
            />
          </div>
          <Button
            onClick={() => setIsFilterOpen(true)}
            color={startDate || endDate ? "primary" : "default"}
            fill={startDate || endDate ? "solid" : "outline"}
          >
            <FilterOutline />
          </Button>
        </div>

        {/* Select All Bar */}
        <div
          style={{
            marginTop: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Checkbox
            checked={
              filteredData.length > 0 &&
              selectedKeys.length === filteredData.length
            }
            indeterminate={
              selectedKeys.length > 0 &&
              selectedKeys.length < filteredData.length
            }
            onChange={handleSelectAll}
          >
            Pilih Semua ({selectedKeys.length}/{filteredData.length})
          </Checkbox>
        </div>
      </div>

      {/* --- LIST DATA --- */}
      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 80 }}>
          {loading && (
            <AutoCenter>
              <SpinLoading color="primary" />
            </AutoCenter>
          )}

          {!loading && filteredData.length === 0 && (
            <AutoCenter style={{ marginTop: 20 }}>Tidak ada data.</AutoCenter>
          )}

          {filteredData.map((item) => (
            <Card key={item.key} style={{ marginBottom: 12, borderRadius: 8 }}>
              <div
                style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
              >
                {/* Checkbox Selection */}
                <div style={{ paddingTop: 4 }}>
                  <Checkbox
                    checked={selectedKeys.includes(item.key)}
                    onChange={() => toggleSelection(item.key)}
                  />
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ fontWeight: "bold", fontSize: 16 }}>
                      {item.documentno}
                    </div>
                    {/* Status Checkpoint 5 Cancel */}
                    {item.checkpoin_id == "5" && item.cancelrequest !== "Y" && (
                      <Tag color="warning">Waiting</Tag>
                    )}
                  </div>

                  <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                    {item.customer}
                  </div>
                  <div style={{ color: "#999", fontSize: 12, marginTop: 2 }}>
                    <CalendarOutline
                      style={{ marginRight: 4, verticalAlign: "middle" }}
                    />
                    {item.plantime
                      ? dayjs(item.plantime).format("DD-MM-YYYY HH:mm")
                      : "-"}
                  </div>

                  {/* Action Buttons (Confirm/Reject Cancel) */}
                  {item.checkpoin_id == "5" && item.cancelrequest == "Y" && (
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <Button
                        size="mini"
                        color="success"
                        fill="outline"
                        onClick={() => handleConfirmCancel(item)}
                      >
                        <CheckOutline /> Confirm
                      </Button>
                      <Button
                        size="mini"
                        color="danger"
                        fill="outline"
                        onClick={() => handleRejectCancel(item)}
                      >
                        <CloseOutline /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </PullToRefresh>

      {/* --- FLOATING SUBMIT BUTTON --- */}
      {selectedKeys.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 70, // Di atas Bottom Tab Bar
            left: 12,
            right: 12,
            zIndex: 100,
          }}
        >
          <Button
            block
            color="primary"
            size="large"
            onClick={handleSubmitHandover}
            style={{ boxShadow: "0 4px 12px rgba(22, 119, 255, 0.4)" }}
          >
            <SendOutline style={{ marginRight: 6 }} />
            Handover ({selectedKeys.length})
          </Button>
        </div>
      )}

      {/* --- FILTER POPUP --- */}
      <Popup
        visible={isFilterOpen}
        onMaskClick={() => setIsFilterOpen(false)}
        bodyStyle={{
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          minHeight: "40vh",
        }}
      >
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 16 }}>
            Filter Tanggal
          </div>
          <Form layout="horizontal">
            <Form.Item label="Mulai">
              <input
                type="date"
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #eee",
                  borderRadius: 4,
                }}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Form.Item>
            <Form.Item label="Sampai">
              <input
                type="date"
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #eee",
                  borderRadius: 4,
                }}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Form.Item>
          </Form>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <Button
              block
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              Reset
            </Button>
            <Button
              block
              color="primary"
              onClick={() => {
                setIsFilterOpen(false);
                fetchData();
              }}
            >
              Terapkan
            </Button>
          </div>
        </div>
      </Popup>
    </LayoutGlobalMobile>
  );
}
