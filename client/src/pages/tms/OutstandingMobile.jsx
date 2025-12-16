import React, { useEffect, useState, useMemo } from "react";
import {
  Card,
  SearchBar,
  Tag,
  AutoCenter,
  PullToRefresh,
  Toast,
  SpinLoading
} from "antd-mobile";
import {
  CalendarOutline,
  UserOutline,
  FileOutline,
  TruckOutline,
} from "antd-mobile-icons";
import dayjs from "dayjs";
import axios from "axios";
import { useSelector } from "react-redux";
import LayoutGlobalMobile from "../../components/layouts/LayoutGlobalMobile";
const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

const OutstandingMobile = () => {
  // --- STATE & HOOKS ---
  const user = useSelector((state) => state.auth.user);
  const role = user?.title || user?.role || "";

  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // --- FETCH DATA ---
  const fetchData = async () => {
    if (!role) return;

    setLoading(true);
    try {
      const res = await axios.get(`${backEndUrl}/tms/outstanding?role=${role}`);

      if (res.data.data && res.data.data.success) {
        const rawData = res.data.data.data;
        const mappedData = rawData.map((item) => ({
          ...item,
          key: item.m_inout_id,
        }));
        setDataList(mappedData);
      } else {
        setDataList([]);
      }
    } catch (err) {
      console.error(err);
      Toast.show({ content: "Gagal memuat data", icon: "fail" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [role]);

  // --- FILTER SEARCH ---
  const filteredData = useMemo(() => {
    const lowerSearch = searchText.toLowerCase();
    return dataList.filter(
      (item) =>
        (item.documentno &&
          item.documentno.toLowerCase().includes(lowerSearch)) ||
        (item.customer && item.customer.toLowerCase().includes(lowerSearch)) ||
        (item.sppno && item.sppno.toLowerCase().includes(lowerSearch)),
    );
  }, [dataList, searchText]);

  // --- RENDER CONTENT PER CARD ---
  const renderCardContent = (item) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Header: Doc No & SPP No */}
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
          {(role === "fat" || role === "marketing") && item.sppno && (
            <Tag color="primary" fill="outline">
              {item.sppno}
            </Tag>
          )}
        </div>

        {/* Customer */}
        <div
          style={{
            color: "#666",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
          }}
        >
          <UserOutline style={{ marginRight: 6 }} />
          {item.customer}
        </div>

        {/* Info Tambahan: Plan Time & Driver */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
            fontSize: 12,
            color: "#888",
            borderTop: "1px solid #f5f5f5",
            paddingTop: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <CalendarOutline style={{ marginRight: 4 }} />
            {item.plantime
              ? dayjs(item.plantime).format("DD-MM-YYYY HH:mm")
              : "-"}
          </div>
          {item.drivername && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <TruckOutline style={{ marginRight: 4 }} />
              {item.drivername}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <LayoutGlobalMobile title="Outstanding">
      {/* --- HEADER: Search --- */}
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
          placeholder="Cari Doc No / Customer / SPP"
          value={searchText}
          onChange={setSearchText}
        />
      </div>

      {/* --- LIST DATA --- */}
      <PullToRefresh onRefresh={fetchData}>
        <div style={{ padding: 12, paddingBottom: 80 }}>
          {loading && (
            <div style={{ padding: 20 }}>
              <AutoCenter><SpinLoading color="primary" /></AutoCenter>
            </div>
          )}

          {!loading && filteredData.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#999" }}>
              <FileOutline
                fontSize={48}
                style={{ marginBottom: 10, color: "#ddd" }}
              />
              <div>Tidak ada data outstanding</div>
            </div>
          )}

          {filteredData.map((item) => (
            <Card
              key={item.key}
              style={{
                marginBottom: 12,
                borderRadius: 8,
                borderLeft: "4px solid #faad14",
              }}
            >
              {renderCardContent(item)}
            </Card>
          ))}
        </div>
      </PullToRefresh>
    </LayoutGlobalMobile>
  );
};

export default OutstandingMobile;
