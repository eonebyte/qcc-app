import React, { useEffect, useState, useMemo } from "react";
import {
  NavBar,
  TabBar,
  Popover,
  Modal,
  ConfigProvider,
  Popup, // Ganti ActionSheet dengan Popup
  Grid,
} from "antd-mobile";
import {
  UnorderedListOutline,
  UserOutline,
  MoreOutline,
  HandPayCircleOutline,
  CloseOutline
} from "antd-mobile-icons";
import {
  SendOutlined,
  DownCircleOutlined,
  HistoryOutlined,
  CarOutlined,
  AuditOutlined,
  LoginOutlined, 
  SwapOutlined,
  RightOutlined
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
  
  // Ganti nama state agar lebih relevan (karena pakai Popup sekarang)
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

    // --- GROUP A: RECEIPT (HIJAU) ---
    if (userRole === "delivery") {
      actions.push({
        type: 'receipt',
        key: "/receipt/delivery/from/dpk",
        text: "From DPK",
        icon: <LoginOutlined />,
        description: "Terima dari DPK",
      });
    }
    if (userRole === "dpk") {
      actions.push(
        {
          type: 'receipt',
          key: "/receipt/dpk/from/delivery",
          text: "From Delivery",
          icon: <LoginOutlined />,
          description: "Terima dari Delivery",
        },
        {
          type: 'receipt',
          key: "/receipt/dpk/from/driver",
          text: "From Driver",
          icon: <LoginOutlined />,
          description: "Terima dari Driver",
        },
      );
    }
    if (userRole === "driver") {
      actions.push({
        type: 'receipt',
        key: "/receipt/driver/from/dpk",
        text: "Terima dari DPK",
        icon: <LoginOutlined />,
        // description: "Terima dari DPK",
      });
    }
    if (userRole === "marketing") {
      actions.push({
        type: 'receipt',
        key: "/receipt/mkt/from/delivery",
        text: "From Delivery",
        icon: <LoginOutlined />,
        description: "Terima dari Delivery",
      });
    }
    if (userRole === "fat") {
      actions.push({
        type: 'receipt',
        key: "/receipt/fat/from/mkt",
        text: "From Marketing",
        icon: <LoginOutlined />,
        description: "Terima dari Marketing",
      });
    }

    // --- GROUP B: HANDOVER (BIRU) ---
    if (userRole === "delivery") {
      actions.push(
        {
          type: 'handover',
          key: "/handover/delivery/to/dpk",
          text: "To DPK",
          icon: <SendOutlined />,
          description: "Penyerahan ke DPK",
        },
        {
          type: 'handover',
          key: "/handover/delivery/to/mkt",
          text: "To MKT",
          icon: <SendOutlined />,
          description: "Penyerahan ke MKT",
        },
      );
    }
    if (userRole === "dpk") {
      actions.push(
        {
          type: 'handover',
          key: "/handover/dpk/to/driver",
          text: "To Driver",
          icon: <CarOutlined />,
          description: "Penyerahan ke Driver",
        },
        {
          type: 'handover',
          key: "/handover/dpk/to/delivery",
          text: "To Delivery",
          icon: <SendOutlined />,
          description: "Penyerahan ke Delivery",
        },
      );
    }
    if (userRole === "marketing") {
      actions.push({
        type: 'handover',
        key: "/handover/mkt/to/fat",
        text: "To FAT",
        icon: <AuditOutlined />,
        description: "Penyerahan ke FAT",
      });
    }
    if (userRole === "driver") {
      actions.push(
        {
          type: 'handover',
          key: "/handover/checkin/customer",
          text: "Penyerahan ke Customer",
          icon: <SendOutlined />,
          // description: "Penyerahan ke Customer",
        },
        {
          type: 'handover',
          key: "/handover/checkout/droponly",
          text: "Pengambilan SJ dari Customer",
          icon: <DownCircleOutlined />,
          // description: "Pengambilan SJ Drop Only",
        },
      );
    }

    return actions;
  }, [userRole]);

  // Pisahkan menu berdasarkan tipe untuk UI Grouping
  const receiptMenus = transactionActions.filter(a => a.type === 'receipt');
  const handoverMenus = transactionActions.filter(a => a.type === 'handover');

  // =================================================================
  // 2. CEK APAKAH TOMBOL ACTIVITY SEDANG AKTIF
  // =================================================================
  const isActivityActive = useMemo(() => {
    return transactionActions.some((action) => action.key === location.pathname);
  }, [location.pathname, transactionActions]);

  // =================================================================
  // 3. CONFIG TAB KIRI & KANAN
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
      setIsMenuOpen(true);
    }
  };

  const handleMenuClick = (path) => {
      setIsMenuOpen(false);
      setTimeout(() => navigate(path), 150); // Delay sedikit untuk animasi
  }

  // --- COMPONENT: MENU ITEM ---
  const MenuItem = ({ item, colorBg, colorIcon }) => (
    <div 
        onClick={() => handleMenuClick(item.key)}
        style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px',
            background: '#fff',
            borderRadius: '12px',
            marginBottom: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            cursor: 'pointer',
            transition: 'background 0.2s',
        }}
        onTouchStart={(e) => e.currentTarget.style.background = '#f9f9f9'}
        onTouchEnd={(e) => e.currentTarget.style.background = '#fff'}
    >
        {/* Icon Box */}
        <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: colorBg,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: 22,
            color: colorIcon,
            marginRight: 16,
            flexShrink: 0
        }}>
            {item.icon}
        </div>

        {/* Text */}
        <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#333', marginBottom: 2 }}>
                {item.text}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
                {item.description}
            </div>
        </div>

        {/* Arrow */}
        <RightOutlined style={{ fontSize: 12, color: '#ccc' }} />
    </div>
  );

  return (
    <ConfigProvider locale={idID}>
      <div style={{ background: "#f5f5f5", minHeight: "100vh", position: "relative" }}>
        <NavBar back={null} style={{ background: "#fff", borderBottom: "1px solid #eee" }} right={rightHeaderAction}>
          <span style={{ fontWeight: 600 }}>{title}</span>
        </NavBar>

        <div style={{ padding: "12px 12px 100px 12px" }}>{children}</div>

        {/* --- BOTTOM BAR FIXED --- */}
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #eee", zIndex: 1000, paddingBottom: "safe-area-inset-bottom" }}>
          
          {/* FLOATING BUTTON */}
          <div
            onClick={handleCenterClick}
            style={{
              position: "absolute",
              top: -20, left: "50%", transform: "translateX(-50%)",
              width: 35, height: 35, borderRadius: "50%",
              background: "#1677ff",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(22, 119, 255, 0.4)",
              zIndex: 1002, cursor: "pointer", border: "4px solid #f5f5f5",
            }}
          >
            <SwapOutlined style={{ fontSize: "24px", color: "#fff" }} />
          </div>
          <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", fontSize: "10px", color: isActivityActive ? "#1677ff" : "#999", fontWeight: 500, zIndex: 1002, pointerEvents: "none" }}>
            Activity
          </div>

          <TabBar activeKey={activeTab} onChange={handleTabChange} safeArea>
            {finalTabs.map((item) => (
              <TabBar.Item key={item.key} icon={item.icon} title={item.title} style={{ visibility: item.isSpacer ? "hidden" : "visible" }} />
            ))}
          </TabBar>
        </div>

        {/* --- CUSTOM POPUP MENU (PROFESSIONAL LOOK) --- */}
        <Popup
          visible={isMenuOpen}
          onMaskClick={() => setIsMenuOpen(false)}
          bodyStyle={{ 
              borderTopLeftRadius: '20px', 
              borderTopRightRadius: '20px', 
              background: '#f5f5f5',
              maxHeight: '85vh',
              minHeight: '40vh'
          }}
        >
            {/* Header Popup */}
            <div style={{ padding: '20px 20px 10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 'bold' }}>Pilih Aktivitas</div>
                <div onClick={() => setIsMenuOpen(false)} style={{ padding: 5, cursor: 'pointer' }}>
                    <CloseOutline fontSize={24} color="#666" />
                </div>
            </div>

            {/* Content List */}
            <div style={{ padding: '10px 16px 30px 16px', overflowY: 'auto' }}>
                
                {/* SECTION 1: PENERIMAAN (Hijau) */}
                {receiptMenus.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ 
                            fontSize: 12, fontWeight: 600, color: '#52c41a', 
                            textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1,
                            paddingLeft: 4
                        }}>
                            Penerimaan
                        </div>
                        {receiptMenus.map(item => (
                            <MenuItem 
                                key={item.key} 
                                item={item} 
                                colorBg="#f6ffed" // Light Green
                                colorIcon="#52c41a" // Green Base
                            />
                        ))}
                    </div>
                )}

                {/* SECTION 2: PENGIRIMAN (Biru) */}
                {handoverMenus.length > 0 && (
                    <div>
                        <div style={{ 
                            fontSize: 12, fontWeight: 600, color: '#1677ff', 
                            textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1,
                            paddingLeft: 4
                        }}>
                            Penyerahan
                        </div>
                        {handoverMenus.map(item => (
                            <MenuItem 
                                key={item.key} 
                                item={item} 
                                colorBg="#e6f7ff" // Light Blue
                                colorIcon="#1677ff" // Blue Base
                            />
                        ))}
                    </div>
                )}

            </div>
        </Popup>
      </div>
    </ConfigProvider>
  );
}