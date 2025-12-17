import React, { useEffect, useState, useMemo } from "react";
import {
  Card,
  Button,
  Collapse,
  Checkbox,
  Dialog,
  Toast,
  Tag,
  SearchBar,
  TextArea,
  Popup,
  AutoCenter,
  PullToRefresh,
  SpinLoading
} from "antd-mobile";
import {
  CalendarOutline,
  UserOutline,
  FileOutline,
  CloseOutline,
  SendOutline,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import LayoutGlobalMobile from "../../../components/layouts/LayoutGlobalMobile";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const MKTToFATMobile = () => {
  // --- STATE ---
  const [dataList, setDataList] = useState([]); // Flat data
  const [loading, setLoading] = useState(false);

  // Grouping State
  const [activeKey, setActiveKey] = useState([]); // Untuk Collapse
  const [selectedGroupKeys, setSelectedGroupKeys] = useState([]); // Array of group key (SPP No)

  // Search
  const [searchText, setSearchText] = useState("");

  // Cancel Request State
  const [isCancelPopupOpen, setIsCancelPopupOpen] = useState(false);
  const [itemToCancel, setItemToCancel] = useState(null);
  const [noteCancel, setNoteCancel] = useState("");

  // --- FETCH DATA ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${backEndUrl}/handover/list/mkt/to/fat`, {
        credentials: "include",
      });
      const json = await resp.json();

      const mapped = json.data.data.map((row) => ({
        key: row.m_inout_id,
        m_inout_id: row.m_inout_id,
        adw_trackingsj_id: row.adw_trackingsj_id,
        documentno: row.documentno,
        customer: row.customer,
        plantime: row.plantime,
        checkpoin_id: row.checkpoin_id,
        driverby: row.driverby,
        tnkb_id: row.tnkb_id,
        drivername: row.drivername,
        sppno: row.sppno || "NO_SPP", // Default group key jika null
        cancelrequestmkt: row.cancelrequestmkt,
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
  }, []);

  // --- GROUPING LOGIC ---
  const groupedData = useMemo(() => {
    const groups = {};

    // Filter search dulu sebelum grouping
    const filteredList = dataList.filter((item) => {
      const searchLower = searchText.toLowerCase();
      return (
        (item.sppno && item.sppno.toLowerCase().includes(searchLower)) ||
        (item.customer && item.customer.toLowerCase().includes(searchLower)) ||
        (item.documentno && item.documentno.toLowerCase().includes(searchLower))
      );
    });

    filteredList.forEach((item) => {
      const groupKey = item.sppno; // "NO_SPP" handled at fetch
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          sppno: item.sppno,
          customer: item.customer, // Asumsi customer sama per SPP, atau ambil salah satu
          items: [],
        };
      }
      groups[groupKey].items.push(item);
    });

    return Object.values(groups);
  }, [dataList, searchText]);

  // --- SELECTION HANDLERS ---
  const toggleGroupSelection = (groupKey) => {
    setSelectedGroupKeys((prev) => {
      if (prev.includes(groupKey)) return prev.filter((k) => k !== groupKey);
      return [...prev, groupKey];
    });
  };

  // --- SUBMIT HANDOVER ---
  const handleSubmit = () => {
    if (selectedGroupKeys.length === 0) return;

    // Kumpulkan semua item dari grup yang dipilih
    const selectedGroups = groupedData.filter((g) =>
      selectedGroupKeys.includes(g.key),
    );
    const allItems = selectedGroups.flatMap((g) => g.items);

    // Validasi
    if (allItems.some((i) => i.sppno === "NO_SPP")) {
      Toast.show({
        content: "Item tanpa SPP tidak bisa di-handover!",
        icon: "fail",
      });
      return;
    }

    const firstDriver = allItems[0].driverby;
    const firstTnkb = allItems[0].tnkb_id;

    const validDriver = allItems.every((row) => row.driverby === firstDriver);
    const validTnkb = allItems.every((row) => row.tnkb_id === firstTnkb);

    if (!validDriver || !validTnkb) {
      Toast.show({
        content: "Driver & TNKB harus sama dalam satu pengiriman!",
        icon: "fail",
      });
      return;
    }

    Dialog.confirm({
      title: "Konfirmasi Handover",
      confirmText: "Submit",
      cancelText: "Batal",
      content: (
        <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
          <p>
            Kirim {allItems.length} dokumen dari {selectedGroups.length} SPP?
          </p>
          <div
            style={{
              background: "#f5f5f5",
              padding: 8,
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {selectedGroups.map((g) => (
              <div key={g.key} style={{ marginBottom: 4 }}>
                <strong>SPP: {g.sppno}</strong> ({g.items.length} Docs)
              </div>
            ))}
          </div>
        </div>
      ),
      onConfirm: async () => {
        try {
          const payload = {
            sppNo: allItems[0].sppno, // Ambil salah satu SPP (sesuai backend logic)
            driverId: Number(firstDriver),
            tnkbId: Number(firstTnkb),
            data: allItems,
          };

          const resp = await fetch(
            `${backEndUrl}/handover/process/mkt/to/fat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              credentials: "include",
            },
          );
          const json = await resp.json();

          if (json.data && json.data.updatedCount > 0) {
            Toast.show({ content: "Handover Berhasil!", icon: "success" });
            setSelectedGroupKeys([]);
            fetchData();
          } else {
            Toast.show({ content: "Gagal submit.", icon: "fail" });
          }
        } catch (err) {
          Toast.show({ content: "Error saat submit.", icon: "fail" });
        }
      },
    });
  };

  // --- CANCEL REQUEST HANDLERS ---
  const openCancelModal = (item) => {
    setItemToCancel(item);
    setNoteCancel("");
    setIsCancelPopupOpen(true);
  };

  const handleCancelSubmit = async () => {
    if (!noteCancel.trim()) {
      Toast.show({ content: "Alasan cancel wajib diisi!", icon: "fail" });
      return;
    }

    try {
      const payload = {
        itemToCancel,
        noteCancel,
      };
      const res = await axios.post(
        `${backEndUrl}/tms/req/cancel/mkt`,
        payload,
        { withCredentials: true },
      );

      if (res.data.success) {
        Toast.show({ content: "Request Cancel Terkirim", icon: "success" });
        setIsCancelPopupOpen(false);
        fetchData();
      } else {
        Toast.show({ content: res.data.message || "Gagal", icon: "fail" });
      }
    } catch (error) {
      Toast.show({ content: "Error saat request cancel", icon: "fail" });
    }
  };

  // --- RENDER GROUP ---
  const renderGroup = (group) => {
    return (
      <Collapse.Panel
        key={group.key}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedGroupKeys.includes(group.key)}
                onChange={() => toggleGroupSelection(group.key)}
                disabled={group.sppno === "NO_SPP"}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "bold" }}>
                {group.sppno === "NO_SPP" ? (
                  <span style={{ color: "red" }}>Belum Ada SPP</span>
                ) : (
                  group.sppno
                )}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                {group.customer} • {group.items.length} Dokumen
              </div>
            </div>
          </div>
        }
      >
        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 8 }}>
          {group.items.map((item) => (
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
                    {item.drivername || "-"}
                  </div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                    <CalendarOutline style={{ marginRight: 4 }} />
                    {item.plantime
                      ? dayjs(item.plantime).format("DD-MM-YYYY HH:mm")
                      : "-"}
                  </div>
                </div>

                <div style={{ minWidth: 80, textAlign: "right" }}>
                  {item.cancelrequestmkt === "N" ? (
                    <Button
                      size="mini"
                      color="danger"
                      fill="outline"
                      onClick={() => openCancelModal(item)}
                    >
                      <CloseOutline /> Cancel
                    </Button>
                  ) : (
                    <Tag color="warning">Waiting Cancel</Tag>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Collapse.Panel>
    );
  };

  // Hitung total dokumen terpilih untuk tombol floating
  const totalDocsSelected = groupedData
    .filter((g) => selectedGroupKeys.includes(g.key))
    .reduce((acc, g) => acc + g.items.length, 0);

  return (
    <LayoutGlobalMobile title="Handover to FAT">
      {/* SEARCH */}
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
          placeholder="Cari SPP / Doc No / Customer"
          value={searchText}
          onChange={setSearchText}
        />
      </div>

      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 80 }}>
          {loading && <AutoCenter>
            <SpinLoading color="primary" />
          </AutoCenter>}

          {!loading && groupedData.length === 0 && (
            <AutoCenter style={{ marginTop: 20 }}>Tidak ada data.</AutoCenter>
          )}

          <Collapse
            activeKey={activeKey}
            onChange={setActiveKey}
            accordion={false}
          >
            {groupedData.map((group) => renderGroup(group))}
          </Collapse>
        </div>
      </PullToRefresh>

      {/* FLOATING BUTTON */}
      {selectedGroupKeys.length > 0 && (
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
            <SendOutline style={{ marginRight: 6 }} />
            Handover ({totalDocsSelected} Docs)
          </Button>
        </div>
      )}

      {/* POPUP CANCEL REQUEST */}
      <Popup
        visible={isCancelPopupOpen}
        onMaskClick={() => setIsCancelPopupOpen(false)}
        bodyStyle={{
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          minHeight: "40vh",
        }}
      >
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>
            Request Cancel
          </div>
          <div style={{ marginBottom: 16 }}>
            Dokumen: <strong>{itemToCancel?.documentno}</strong>
          </div>

          <div style={{ marginBottom: 8 }}>Alasan Cancel:</div>
          <TextArea
            placeholder="Masukkan alasan..."
            value={noteCancel}
            onChange={setNoteCancel}
            rows={4}
            showCount
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              padding: 8,
              width: "100%",
            }}
          />

          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <Button block onClick={() => setIsCancelPopupOpen(false)}>
              Batal
            </Button>
            <Button
              block
              color="danger"
              disabled={!noteCancel.trim()}
              onClick={handleCancelSubmit}
            >
              Submit
            </Button>
          </div>
        </div>
      </Popup>
    </LayoutGlobalMobile>
  );
};

export default MKTToFATMobile;
