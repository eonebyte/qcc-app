import React, { useEffect, useState, useMemo } from "react";
import {
  NavBar,
  TabBar,
  Popover,
  Modal,
  ConfigProvider,
  ActionSheet,
} from "antd-mobile";
import {
  UnorderedListOutline,
  UserOutline,
  MoreOutline,
  HandPayCircleOutline,
} from "antd-mobile-icons";
import {
  SendOutlined,
  DownCircleOutlined,
  HistoryOutlined,
  DeliveredProcedureOutlined,
  CarOutlined,
  AuditOutlined,
  SolutionOutlined,
  FolderAddOutlined, // Icon Receipt
  SwapOutlined, // Icon Transaksi (Tengah)
  LoginOutlined, // Icon Masuk
  LogoutOutlined, // Icon Keluar
} from "@ant-design/icons";

import { useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../states/reducers/authSlice";
import idID from "antd-mobile/es/locales/id-ID";

export default function LayoutGlobalMobile({
  children,
  title = "Aplikasi Mobile",
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const user = useSelector((state) => state.auth.user);
  const userRole = (user?.title || user?.role || "").toLowerCase();

  const [activeTab, setActiveTab] = useState(location.pathname);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  useEffect(() => {
    if (location.pathname) {
      setActiveTab(location.pathname);
    }
  }, [location.pathname]);

  // --- LOGIC LOGOUT ---
  const handleLogout = () => {
    Modal.confirm({
      title: "Konfirmasi Keluar",
      content: "Yakin ingin keluar aplikasi?",
      confirmText: "Keluar",
      cancelText: "Batal",
      onConfirm: async () => {
        await dispatch(logout());
        navigate("/");
      },
    });
  };

  const rightHeaderAction = (
    <Popover.Menu
      actions={[{ key: "logout", text: "Logout" }]}
      onAction={(node) => {
        if (node.key === "logout") handleLogout();
      }}
      placement="bottom-end"
      trigger="click"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          cursor: "pointer",
        }}
      >
        <MoreOutline style={{ fontSize: 24, color: "#333" }} />
      </div>
    </Popover.Menu>
  );

  // =================================================================
  // 1. CONFIG MENU TRANSAKSI (GABUNGAN RECEIPT & HANDOVER)
  // =================================================================
  const transactionActions = useMemo(() => {
    const actions = [];

    // --- GROUP A: RECEIPT ---
    if (userRole === "delivery") {
      actions.push({
        key: "/receipt/delivery/from/dpk",
        text: "Receipt from DPK",
        icon: <LoginOutlined style={{ color: "#52c41a" }} />,
        description: "Terima Dokumen",
      });
    }
    if (userRole === "dpk") {
      actions.push(
        {
          key: "/receipt/dpk/from/delivery",
          text: "Receipt from Delivery",
          icon: <LoginOutlined style={{ color: "#52c41a" }} />,
          description: "Terima Dokumen",
        },
        {
          key: "/receipt/dpk/from/driver",
          text: "Receipt from Driver",
          icon: <LoginOutlined style={{ color: "#52c41a" }} />,
          description: "Terima Dokumen",
        },
      );
    }
    if (userRole === "driver") {
      actions.push({
        key: "/receipt/driver/from/dpk",
        text: "Receipt from DPK",
        icon: <LoginOutlined style={{ color: "#52c41a" }} />,
        description: "Terima Dokumen",
      });
    }
    if (userRole === "marketing") {
      actions.push({
        key: "/receipt/mkt/from/delivery",
        text: "Receipt from Delivery",
        icon: <LoginOutlined style={{ color: "#52c41a" }} />,
        description: "Terima Dokumen",
      });
    }
    if (userRole === "fat") {
      actions.push({
        key: "/receipt/fat/from/mkt",
        text: "Receipt from Marketing",
        icon: <LoginOutlined style={{ color: "#52c41a" }} />,
        description: "Terima Dokumen",
      });
    }

    // --- GROUP B: HANDOVER ---
    if (userRole === "delivery") {
      actions.push(
        {
          key: "/handover/delivery/to/dpk",
          text: "Handover to DPK",
          icon: <SendOutlined style={{ color: "#1677ff" }} />,
          description: "Kirim Dokumen",
        },
        {
          key: "/handover/delivery/to/mkt",
          text: "Handover to MKT",
          icon: <SendOutlined style={{ color: "#1677ff" }} />,
          description: "Kirim Dokumen",
        },
      );
    }
    if (userRole === "dpk") {
      actions.push(
        {
          key: "/handover/dpk/to/driver",
          text: "Handover to Driver",
          icon: <CarOutlined style={{ color: "#1677ff" }} />,
          description: "Kirim Dokumen",
        },
        {
          key: "/handover/dpk/to/delivery",
          text: "Handover to Delivery",
          icon: <SendOutlined style={{ color: "#1677ff" }} />,
          description: "Kirim Dokumen",
        },
      );
    }
    if (userRole === "marketing") {
      actions.push({
        key: "/handover/mkt/to/fat",
        text: "Handover to FAT",
        icon: <AuditOutlined style={{ color: "#1677ff" }} />,
        description: "Kirim Dokumen",
      });
    }
    if (userRole === "driver") {
      actions.push(
        {
          key: "/handover/checkin/customer",
          text: "Check Out (Customer)",
          icon: <SendOutlined style={{ color: "#1677ff" }} />,
          description: "Antar ke Customer",
        },
        {
          key: "/handover/checkout/droponly",
          text: "Drop Only",
          icon: <DownCircleOutlined style={{ color: "#1677ff" }} />,
          description: "Drop Barang Saja",
        },
      );
    }

    return actions;
  }, [userRole]);

  // =================================================================
  // 2. CEK APAKAH TOMBOL ACTIVITY SEDANG AKTIF
  // =================================================================
  const isActivityActive = useMemo(() => {
    // Cek apakah URL saat ini ada di dalam list transactionActions
    return transactionActions.some((action) => action.key === location.pathname);
  }, [location.pathname, transactionActions]);

  // =================================================================
  // 3. CONFIG TAB KIRI & KANAN (AUTO BALANCE)
  // =================================================================
  const finalTabs = useMemo(() => {
    const allTabs = [
      {
        key: "/history",
        title: "History",
        icon: <HistoryOutlined style={{ fontSize: "20px" }} />,
        roles: ["delivery", "dpk", "driver", "marketing", "fat"],
      },
      {
        key: "/outstanding",
        title: "Outstanding",
        icon: <HandPayCircleOutline fontSize={20} />,
        roles: ["delivery", "dpk", "fat", "marketing", "driver"],
      },
      {
        key: "/progress-shipment",
        title: "Progress",
        icon: <UnorderedListOutline fontSize={20} />,
        roles: ["delivery", "dpk", "fat", "marketing", "driver"],
      },
      {
        key: "/account",
        title: "Akun",
        icon: <UserOutline fontSize={20} />,
        roles: [],
      },
    ];

    const visibleTabs = allTabs.filter(
      (tab) =>
        !tab.roles || tab.roles.length === 0 || tab.roles.includes(userRole),
    );
    const half = Math.ceil(visibleTabs.length / 2);
    let leftSide = visibleTabs.slice(0, half);
    let rightSide = visibleTabs.slice(half);

    while (leftSide.length < rightSide.length)
      leftSide.push({ key: `spacer-l-${leftSide.length}`, isSpacer: true });
    while (rightSide.length < leftSide.length)
      rightSide.push({ key: `spacer-r-${rightSide.length}`, isSpacer: true });

    return [...leftSide, { key: "dummy-center", isSpacer: true }, ...rightSide];
  }, [userRole]);

  // =================================================================
  // 4. HANDLERS
  // =================================================================
  const handleTabChange = (key) => {
    if (key === "dummy-center" || key.startsWith("spacer")) return;
    if (key === "/account") {
      setActiveTab(key);
      navigate(key);
      return;
    }
    setActiveTab(key);
    navigate(key);
  };

  const handleCenterClick = () => {
    if (transactionActions.length === 1) {
      setActiveTab(transactionActions[0].key);
      navigate(transactionActions[0].key);
    } else {
      setActionSheetVisible(true);
    }
  };

  return (
    <ConfigProvider locale={idID}>
      <div
        style={{
          background: "#f5f5f5",
          minHeight: "100vh",
          position: "relative",
        }}
      >
        <NavBar
          back={null}
          style={{ background: "#fff", borderBottom: "1px solid #eee" }}
          right={rightHeaderAction}
        >
          <span style={{ fontWeight: 600 }}>{title}</span>
        </NavBar>

        <div style={{ padding: "12px 12px 100px 12px" }}>{children}</div>

        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#fff",
            borderTop: "1px solid #eee",
            zIndex: 1000,
            paddingBottom: "safe-area-inset-bottom",
          }}
        >
          {/* --- SUPER FLOATING BUTTON --- */}
          <div
            onClick={handleCenterClick}
            style={{
              position: "absolute",
              top: -20,
              left: "50%",
              transform: "translateX(-50%)",
              width: 35,
              height: 35,
              borderRadius: "50%",
              // Jika Aktif: Biru Solid (#1677ff), Jika Tidak: Putih dengan border Biru (atau Abu)
              // Disini saya buat tetap Biru agar menonjol sebagai FAB, tapi warna text di bawah yang berubah
              background: "#1677ff",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(22, 119, 255, 0.4)",
              zIndex: 1002,
              cursor: "pointer",
              border: "4px solid #f5f5f5",
            }}
          >
            <SwapOutlined style={{ fontSize: "24px", color: "#fff" }} />
          </div>
          
          {/* LABEL ACTIVITY: Warnanya dinamis berdasarkan isActivityActive */}
          <div
            style={{
              position: "absolute",
              bottom: 6,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: "10px",
              // LOGIKA WARNA DI SINI:
              color: isActivityActive ? "#1677ff" : "#999999", 
              fontWeight: 500,
              zIndex: 1002,
              pointerEvents: "none",
            }}
          >
            Activity
          </div>

          {/* TAB BAR */}
          <TabBar activeKey={activeTab} onChange={handleTabChange} safeArea>
            {finalTabs.map((item) => (
              <TabBar.Item
                key={item.key}
                icon={item.icon}
                title={item.title}
                style={{ visibility: item.isSpacer ? "hidden" : "visible" }}
              />
            ))}
          </TabBar>
        </div>

        {/* --- SMART TRANSACTION MENU --- */}
        <ActionSheet
          visible={actionSheetVisible}
          actions={transactionActions}
          onClose={() => setActionSheetVisible(false)}
          onAction={(action) => {
            setActionSheetVisible(false);
            navigate(action.key);
          }}
          extra={
            <div style={{ textAlign: "center" }}>
              <strong>Pilih Jenis Transaksi</strong>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                Terima (Receipt) atau Kirim (Handover)
              </div>
            </div>
          }
          cancelText="Batal"
        />
      </div>
    </ConfigProvider>
  );
}