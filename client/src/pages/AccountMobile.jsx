import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  List,
  Button,
  Avatar,
  Card,
  Modal,
  Space,
  Tag,
  AutoCenter,
} from "antd-mobile";
import {
  UserOutline,
  RightOutline,
  GlobalOutline,
  CheckShieldOutline,
  UnorderedListOutline,
} from "antd-mobile-icons";
import { LogoutOutlined } from "@ant-design/icons";
import LayoutGlobalMobile from "../components/layouts/LayoutGlobalMobile"; // Sesuaikan path layout Anda
import { logout } from "../states/reducers/authSlice";
const AccountMobile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  // 1. Ambil data user dari Redux State
  const { user, isLoading } = useSelector((state) => state.auth);
  
  // console.log('user :', user);

  // 2. Logic Logout
  const handleLogout = () => {
    Modal.confirm({
      title: "Konfirmasi",
      content: "Apakah Anda yakin ingin keluar dari aplikasi?",
      confirmText: "Keluar",
      cancelText: "Batal",
      onConfirm: async () => {
        await dispatch(logout());
        navigate("/"); // Redirect ke login setelah logout
      },
      confirmButtonColor: "danger",
    });
  };

  // Helper untuk menampilkan inisial nama
  const getInitials = (name) => {
    if (!name) return "U";
    const parts = name.split(" ");
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  // Jika data user belum ada (misal di-refresh), tampilkan loading atau placeholder
  if (!user && !isLoading) {
    return (
      <LayoutGlobalMobile title="Akun Saya">
        <AutoCenter style={{ marginTop: 50 }}>
          Data pengguna tidak ditemukan. Silakan login ulang.
          <Space />
          <Button color="primary" onClick={() => navigate("/")}>
            Login
          </Button>
        </AutoCenter>
      </LayoutGlobalMobile>
    );
  }

  return (
    <LayoutGlobalMobile title="Akun Saya">
      {/* --- PROFILE HEADER CARD --- */}
      <div
        style={{
          background: "linear-gradient(135deg, #1677ff 0%, #69b1ff 100%)",
          padding: "30px 20px",
          borderRadius: "0 0 20px 20px",
          marginBottom: 20,
          color: "#fff",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Avatar
            src=""
            style={{
              "--size": "80px",
              "--border-radius": "50%",
              backgroundColor: "#fff",
              color: "#1677ff",
              fontSize: 32,
              fontWeight: "bold",
            }}
          >
            {getInitials(user?.name || user?.username)}
          </Avatar>
          <div style={{ fontSize: 20, fontWeight: "bold", marginTop: 12 }}>
            {user?.name || "User Tanpa Nama"}
          </div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>
            {/* {user?.username || "-"}*/}
          </div>
          <div style={{ marginTop: 10 }}>
            <Tag
              color="success"
              fill="outline"
              style={{
                background: "rgba(255,255,255,0.2)",
                color: "#fff",
                border: "none",
              }}
            >
              {user?.title || "Staff"}
            </Tag>
          </div>
        </div>
      </div>

      {/* --- LIST INFO --- */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        {/* <List header="Informasi Akun">
          <List.Item prefix={<UserOutline />} extra={user?.username}>
            Username
          </List.Item>

          <List.Item prefix={<CheckShieldOutline />} extra={user?.role || "-"}>
            Role Akses
          </List.Item>

          <List.Item prefix={<GlobalOutline />} extra={user?.email || "-"}>
            Email
          </List.Item>

          {/* Tampilkan field lain jika ada di object user */}
          {/* {user?.department && (
            <List.Item
              prefix={<UnorderedListOutline />}
              extra={user.department}
            >
              Departemen
            </List.Item>
          )}*/}
        {/* </List>*/}
      </Card>

      {/* --- LIST SETTING / ACTION --- */}
      <Card style={{ borderRadius: 12 }}>
        <List header="Pengaturan">
          {/* Contoh menu tambahan (dummy) */}
          {/* <List.Item prefix={<RightOutline />} onClick={() => {}} clickable>
            Ubah Password
          </List.Item>*/}

          <List.Item
            prefix={<LogoutOutlined style={{ color: "#ff4d4f" }} />}
            onClick={handleLogout}
            arrow={false}
            clickable
          >
            <span style={{ color: "#ff4d4f" }}>Keluar Aplikasi</span>
          </List.Item>
        </List>
      </Card>

      <div
        style={{
          textAlign: "center",
          marginTop: 30,
          color: "#999",
          fontSize: 12,
        }}
      >
        Versi Aplikasi 1.0.0
      </div>
    </LayoutGlobalMobile>
  );
};

export default AccountMobile;
