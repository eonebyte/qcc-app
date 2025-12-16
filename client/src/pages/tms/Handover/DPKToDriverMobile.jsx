import React, { useEffect, useState } from "react";
import {
  Card,
  Button,
  SearchBar,
  Checkbox,
  Dialog,
  Toast,
  List,
  AutoCenter,
  PullToRefresh,
  Popup,
  CheckList,
  SpinLoading
} from "antd-mobile";
import {
  SendOutline,
  CalendarOutline,
  UserOutline,
  TruckOutline,
  CloseOutline,
  SearchOutline,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

export default function DPKToDriverMobile() {
  // --- STATE DATA ---
  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);

  // --- DATA MASTER ---
  const [drivers, setDrivers] = useState([]);
  const [tnkbs, setTnkbs] = useState([]);

  // --- STATE SELECTION ---
  // Kita simpan string ID langsung agar mudah (bukan array seperti picker)
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [selectedTnkbId, setSelectedTnkbId] = useState(null);

  // --- UI STATE POPUP SELECTOR ---
  const [isDriverPopupOpen, setIsDriverPopupOpen] = useState(false);
  const [isTnkbPopupOpen, setIsTnkbPopupOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // --- SEARCH STATE ---
  const [mainSearchText, setMainSearchText] = useState(""); // Search Dokumen utama
  const [driverSearchText, setDriverSearchText] = useState(""); // Search di dalam Popup Driver
  const [tnkbSearchText, setTnkbSearchText] = useState(""); // Search di dalam Popup TNKB

  // --- FETCH DATA UTAMA ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${backEndUrl}/handover/list/dpk/to/driver`, {
        credentials: "include",
      });
      const json = await resp.json();
      const mapped = json.data.data.map((row, index) => ({
        key: row.m_inout_id,
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

  // --- FETCH MASTER DATA ---
  const fetchMasterData = async () => {
    try {
      const [driversRes, tnkbsRes] = await Promise.all([
        axios.get(`${backEndUrl}/tms/drivers`, { withCredentials: true }),
        axios.get(`${backEndUrl}/tms/tnkbs`, { withCredentials: true }),
      ]);

      if (driversRes.data?.success) {
        setDrivers(
          driversRes.data.data.map((d) => ({
            label: d.name,
            value: d.ad_user_id,
          })),
        );
      }
      if (tnkbsRes.data?.success) {
        setTnkbs(
          tnkbsRes.data.data.map((t) => ({
            label: t.NAME,
            value: t.ADW_TMS_TNKB_ID,
          })),
        );
      }
    } catch (err) {
      console.error("Error fetching master data:", err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchMasterData();
  }, []);

  // --- LOGIC FILTER TABLE UTAMA ---
  const filteredData = dataList.filter((item) => {
    const searchLower = mainSearchText.toLowerCase();
    return (
      (item.documentno &&
        item.documentno.toLowerCase().includes(searchLower)) ||
      (item.customer && item.customer.toLowerCase().includes(searchLower))
    );
  });

  // --- SELECTION LOGIC ---
  const toggleSelection = (key) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleSelectAll = () => {
    if (selectedKeys.length === filteredData.length) setSelectedKeys([]);
    else setSelectedKeys(filteredData.map((item) => item.key));
  };

  // --- SUBMIT HANDLER ---
  const handleSubmit = async () => {
    if (!selectedDriverId || !selectedTnkbId) {
      Toast.show({ content: "Driver dan TNKB wajib dipilih!", icon: "fail" });
      return;
    }

    const driverObj = drivers.find((d) => d.value === selectedDriverId);
    const driverName = driverObj ? driverObj.label : "";
    const selectedItems = dataList.filter((item) =>
      selectedKeys.includes(item.key),
    );

    try {
      const payload = {
        data: selectedItems,
        driverId: selectedDriverId,
        driverName: driverName,
        tnkbId: selectedTnkbId,
      };

      const resp = await fetch(`${backEndUrl}/handover/process/dpk/to/driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const json = await resp.json();

      if (json.data && json.data.insertedCount > 0) {
        Toast.show({ content: "Handover Berhasil!", icon: "success" });
        setIsConfirmOpen(false);
        setSelectedKeys([]);
        setSelectedDriverId(null);
        setSelectedTnkbId(null);
        fetchData();
      } else {
        Toast.show({ content: "Submit Gagal.", icon: "fail" });
      }
    } catch (err) {
      console.error(err);
      Toast.show({ content: "Terjadi error saat submit.", icon: "fail" });
    }
  };

  // --- HELPER LABEL ---
  const getLabel = (options, val) => {
    if (!val) return "Pilih...";
    const found = options.find((opt) => opt.value === val);
    return found ? found.label : "Pilih...";
  };

  // --- FILTER UNTUK POPUP SEARCH ---
  const filteredDrivers = drivers.filter((d) =>
    d.label.toLowerCase().includes(driverSearchText.toLowerCase()),
  );
  const filteredTnkbs = tnkbs.filter((t) =>
    t.label.toLowerCase().includes(tnkbSearchText.toLowerCase()),
  );

  return (
    <LayoutGlobalMobile title="Handover to Driver">
      {/* SEARCH UTAMA */}
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
        <SearchBar
          placeholder="Cari Doc No / Customer"
          value={mainSearchText}
          onChange={setMainSearchText}
        />
        <div style={{ marginTop: 8 }}>
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

      {/* LIST DATA */}
      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 80 }}>
          {loading && <AutoCenter>
            <SpinLoading color="primary" />
          </AutoCenter>}

          {!loading && filteredData.length === 0 && (
            <AutoCenter style={{ marginTop: 20 }}>Tidak ada data.</AutoCenter>
          )}

          {filteredData.map((item) => (
            <Card key={item.key} style={{ marginBottom: 12, borderRadius: 8 }}>
              <div
                style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
              >
                <div style={{ paddingTop: 4 }}>
                  <Checkbox
                    checked={selectedKeys.includes(item.key)}
                    onChange={() => toggleSelection(item.key)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "bold", fontSize: 16 }}>
                    {item.documentno}
                  </div>
                  <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                    {item.customer}
                  </div>
                  <div style={{ color: "#999", fontSize: 12, marginTop: 4 }}>
                    <CalendarOutline style={{ marginRight: 4 }} />
                    {item.plantime
                      ? dayjs(item.plantime).format("DD-MM-YYYY HH:mm")
                      : "-"}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </PullToRefresh>

      {/* FLOATING BUTTON */}
      {selectedKeys.length > 0 && (
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
            onClick={() => setIsConfirmOpen(true)}
            style={{ boxShadow: "0 4px 12px rgba(22, 119, 255, 0.4)" }}
          >
            <SendOutline style={{ marginRight: 6 }} /> Lanjut (
            {selectedKeys.length})
          </Button>
        </div>
      )}

      {/* DIALOG KONFIRMASI */}
      <Dialog
        visible={isConfirmOpen}
        title="Konfirmasi Handover"
        content={
          <div>
            <p style={{ marginBottom: 16 }}>
              Kirim <strong>{selectedKeys.length}</strong> dokumen ke Driver.
            </p>

            <List>
              <List.Item
                prefix={<UserOutline />}
                onClick={() => {
                  setDriverSearchText("");
                  setIsDriverPopupOpen(true);
                }}
                extra={getLabel(drivers, selectedDriverId)}
                clickable
              >
                Pilih Driver
              </List.Item>

              <List.Item
                prefix={<TruckOutline />}
                onClick={() => {
                  setTnkbSearchText("");
                  setIsTnkbPopupOpen(true);
                }}
                extra={getLabel(tnkbs, selectedTnkbId)}
                clickable
              >
                Pilih TNKB
              </List.Item>
            </List>

            <div
              style={{
                marginTop: 16,
                maxHeight: "120px",
                overflowY: "auto",
                background: "#f9f9f9",
                padding: 8,
                fontSize: 12,
              }}
            >
              {dataList
                .filter((d) => selectedKeys.includes(d.key))
                .map((d) => (
                  <div
                    key={d.key}
                    style={{ padding: "4px 0", borderBottom: "1px solid #eee" }}
                  >
                    {d.documentno}
                  </div>
                ))}
            </div>
          </div>
        }
        actions={[
          [
            {
              key: "cancel",
              text: "Batal",
              onClick: () => setIsConfirmOpen(false),
            },
            {
              key: "submit",
              text: "Submit",
              bold: true,
              onClick: handleSubmit,
            },
          ],
        ]}
      />

      {/* POPUP SELECT DRIVER */}
      <Popup
        visible={isDriverPopupOpen}
        onMaskClick={() => setIsDriverPopupOpen(false)}
        bodyStyle={{
          height: "70vh",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <div
          style={{
            padding: 16,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span style={{ fontWeight: "bold", fontSize: 16 }}>
              Pilih Driver
            </span>
            <CloseOutline
              onClick={() => setIsDriverPopupOpen(false)}
              fontSize={20}
            />
          </div>
          <SearchBar
            placeholder="Cari Nama Driver..."
            value={driverSearchText}
            onChange={setDriverSearchText}
          />
          <div style={{ flex: 1, overflowY: "auto", marginTop: 12 }}>
            <CheckList
              value={selectedDriverId ? [selectedDriverId] : []}
              onChange={(val) => {
                if (val.length > 0) {
                  setSelectedDriverId(val[0]);
                  setIsDriverPopupOpen(false);
                }
              }}
            >
              {filteredDrivers.map((d) => (
                <CheckList.Item key={d.value} value={d.value}>
                  {d.label}
                </CheckList.Item>
              ))}
              {filteredDrivers.length === 0 && (
                <AutoCenter style={{ marginTop: 20 }}>
                  Driver tidak ditemukan
                </AutoCenter>
              )}
            </CheckList>
          </div>
        </div>
      </Popup>

      {/* POPUP SELECT TNKB */}
      <Popup
        visible={isTnkbPopupOpen}
        onMaskClick={() => setIsTnkbPopupOpen(false)}
        bodyStyle={{
          height: "70vh",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <div
          style={{
            padding: 16,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span style={{ fontWeight: "bold", fontSize: 16 }}>
              Pilih Kendaraan
            </span>
            <CloseOutline
              onClick={() => setIsTnkbPopupOpen(false)}
              fontSize={20}
            />
          </div>
          <SearchBar
            placeholder="Cari Plat Nomor..."
            value={tnkbSearchText}
            onChange={setTnkbSearchText}
          />
          <div style={{ flex: 1, overflowY: "auto", marginTop: 12 }}>
            <CheckList
              value={selectedTnkbId ? [selectedTnkbId] : []}
              onChange={(val) => {
                if (val.length > 0) {
                  setSelectedTnkbId(val[0]);
                  setIsTnkbPopupOpen(false);
                }
              }}
            >
              {filteredTnkbs.map((t) => (
                <CheckList.Item key={t.value} value={t.value}>
                  {t.label}
                </CheckList.Item>
              ))}
              {filteredTnkbs.length === 0 && (
                <AutoCenter style={{ marginTop: 20 }}>
                  Kendaraan tidak ditemukan
                </AutoCenter>
              )}
            </CheckList>
          </div>
        </div>
      </Popup>
    </LayoutGlobalMobile>
  );
}
