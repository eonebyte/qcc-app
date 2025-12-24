import React, { useState } from "react";
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
  Form,
  Input,
  Toast,
  TextArea,
} from "antd-mobile";
import {
  UserOutline,
  RightOutline,
  KeyOutline,
  EditSOutline,
  SetOutline, // Icon untuk Reset/Pindah Device
} from "antd-mobile-icons";
import { LogoutOutlined } from '@ant-design/icons';

import axios from "axios";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

import LayoutGlobalMobile from "../components/layouts/LayoutGlobalMobile";
import { logout, logoutfull } from "../states/reducers/authSlice";

const AccountMobile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // --- STATE ---
  const [isPassModalVisible, setIsPassModalVisible] = useState(false);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false);

  const [formPass] = Form.useForm();
  const [formUser] = Form.useForm();

  const { user, isLoading } = useSelector((state) => state.auth);

  // --- LOGIC RESET APP / PINDAH DEVICE (HAPUS COOKIE & CACHE) ---
  const handleResetApp = () => {
    Modal.confirm({
      title: "Pindah Device / Reset Total",
      content: "Aplikasi akan menghapus seluruh COOKIE, cache, data login, dan memuat ulang. Gunakan ini jika ingin ganti device atau aplikasi error. Lanjutkan?",
      confirmText: "Ya, Reset Total",
      cancelText: "Batal",
      confirmButtonColor: "danger",
      onConfirm: async () => {
        try {
          // 1. Logout dari Server (Menghapus session HttpOnly di server)
          await dispatch(logout());
          await dispatch(logoutfull());

          localStorage.clear();
          sessionStorage.clear();

          // 4. Bersihkan Cache Storage PWA (File-file website yang tersimpan di HP)
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(
              cacheNames.map(name => caches.delete(name))
            );
          }

          // 5. Unregister Service Workers
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
              await registration.unregister();
            }
          }

          Toast.show({ content: 'Pembersihan selesai, memuat ulang...', duration: 1500 });

          // 6. Hard Reload (Memaksa browser mengambil file baru dari server)
          setTimeout(() => {
            window.location.href = "/";
          }, 1500);
        } catch (error) {
          console.error("Reset Error:", error);
          window.location.href = "/";
        }
      },
    });
  };

  // --- LOGIC GANTI PASSWORD ---
  const handleSubmitPassword = async (values) => {
    const { newPassword, confirmPassword } = values;
    if (newPassword !== confirmPassword) {
      Toast.show({ icon: 'fail', content: 'Konfirmasi password tidak cocok!' });
      return;
    }
    try {
      const response = await axios.post(`${backEndUrl}/auth/change-password`, {
        newPassword
      }, { withCredentials: true });

      if (response.data.success) {
        Toast.show({ icon: 'success', content: 'Password berhasil diubah!' });
        setIsPassModalVisible(false);
        formPass.resetFields();
      }
    } catch (error) {
      Toast.show({ icon: 'fail', content: error.response?.data?.message || 'Gagal' });
    }
  };

  // --- LOGIC GANTI USERNAME ---
  const handleSubmitUsername = async (values) => {
    const { newUsername } = values;
    try {
      const response = await axios.post(`${backEndUrl}/auth/change-username`, {
        newUsername
      }, { withCredentials: true });

      if (response.data.success) {
        Toast.show({ icon: 'success', content: 'Username berhasil diganti!' });
        setIsUserModalVisible(false);
        formUser.resetFields();
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      Toast.show({ icon: 'fail', content: error.response?.data?.message || 'Gagal' });
    }
  };

  const handleLogout = () => {
    Modal.confirm({
      title: "Konfirmasi",
      content: "Apakah Anda yakin ingin keluar?",
      confirmText: "Keluar",
      cancelText: "Batal",
      confirmButtonColor: "danger",
      onConfirm: async () => {
        await dispatch(logout());
        navigate("/");
      },
    });
  };

  const getInitials = (name) => {
    if (!name) return "U";
    const parts = name.split(" ");
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  if (!user && !isLoading) {
    return (
      <LayoutGlobalMobile title="Akun Saya">
        <AutoCenter style={{ marginTop: 50 }}>
          <Button color="primary" onClick={() => navigate("/")}>Login</Button>
        </AutoCenter>
      </LayoutGlobalMobile>
    );
  }

  return (
    <LayoutGlobalMobile title="Akun Saya">
      {/* HEADER CARD */}
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Avatar
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
            {user?.name || "User"}
          </div>
          <div style={{ marginTop: 10 }}>
            <Tag color="success" fill="outline" style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none" }}>
              {user?.title || "Staff"}
            </Tag>
          </div>
        </div>
      </div>

      <Card style={{ borderRadius: 12 }}>
        <List header="Pengaturan Profil">
          <List.Item
            prefix={<EditSOutline />}
            onClick={() => {
              formUser.setFieldsValue({ newUsername: user?.value || user?.username });
              setIsUserModalVisible(true);
            }}
            clickable
          >
            Ubah Username
          </List.Item>

          <List.Item
            prefix={<KeyOutline />}
            onClick={() => setIsPassModalVisible(true)}
            clickable
          >
            Ubah Password
          </List.Item>
        </List>

        <List header="Aplikasi & Perangkat" style={{ marginTop: 10 }}>
          {/* TOMBOL RESET TOTAL */}
          <List.Item
            prefix={<SetOutline style={{ color: "#ff8f1f" }} />}
            onClick={handleResetApp}
            clickable
            description="Hapus Cookie & Cache jika ingin ganti HP / Akun"
          >
            <span style={{ color: "#ff8f1f", fontWeight: "bold" }}>Pindah Device / Reset</span>
          </List.Item>

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

      {/* --- MODAL GANTI PASSWORD --- */}
      <Modal
        visible={isPassModalVisible}
        title="Ganti Password"
        content={
          <Form
            form={formPass}
            layout="vertical"
            onFinish={handleSubmitPassword}
            footer={
              <div style={{ display: 'flex', gap: '10px', marginTop: 10 }}>
                <Button block onClick={() => setIsPassModalVisible(false)}>Batal</Button>
                <Button block type="submit" color="primary">Simpan</Button>
              </div>
            }
          >
            <Form.Item label="Password Baru" name="newPassword" rules={[{ required: true }]}>
              <Input type="password" placeholder="Password baru" />
            </Form.Item>
            <Form.Item label="Konfirmasi" name="confirmPassword" rules={[{ required: true }]}>
              <Input type="password" placeholder="Ulangi password" />
            </Form.Item>
          </Form>
        }
        showCloseButton
        onClose={() => setIsPassModalVisible(false)}
      />

      {/* --- MODAL GANTI USERNAME --- */}
      <Modal
        visible={isUserModalVisible}
        title="Ubah Username"
        content={
          <Form
            form={formUser}
            layout="vertical"
            onFinish={handleSubmitUsername}
            footer={
              <div style={{ display: 'flex', gap: '10px', marginTop: 10 }}>
                <Button block onClick={() => setIsUserModalVisible(false)}>Batal</Button>
                <Button block type="submit" color="primary">Simpan</Button>
              </div>
            }
          >
            <Form.Item
              label="Username Baru"
              name="newUsername"
              rules={[{ required: true, message: 'Harap isi username' }]}
            >
              <Input placeholder="Masukkan username baru" clearable />
            </Form.Item>
          </Form>
        }
        showCloseButton
        onClose={() => setIsUserModalVisible(false)}
      />

      <div style={{ textAlign: "center", marginTop: 30, color: "#999", fontSize: 12 }}>
        Versi Aplikasi 1.0.0
      </div>
    </LayoutGlobalMobile>
  );
};

export default AccountMobile;