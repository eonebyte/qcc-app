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
} from "antd-mobile";
import {
  UserOutline,
  RightOutline,
  KeyOutline,
  EditSOutline, // Icon baru untuk edit username
} from "antd-mobile-icons";
import { LogoutOutlined } from '@ant-design/icons';

import axios from "axios";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

import LayoutGlobalMobile from "../components/layouts/LayoutGlobalMobile";
import { logout } from "../states/reducers/authSlice";

const AccountMobile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // --- STATE ---
  const [isPassModalVisible, setIsPassModalVisible] = useState(false);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false); // State Modal Username

  const [formPass] = Form.useForm();
  const [formUser] = Form.useForm(); // Form Instance Username

  const { user, isLoading } = useSelector((state) => state.auth);

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

        // Refresh halaman agar Redux state / Tampilan Header terupdate
        // Atau jika Anda punya action updateProfile, dispatch di sini.
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error(error);
      Toast.show({
        icon: 'fail',
        content: error.response?.data?.message || 'Gagal mengganti username',
      });
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
        <List header="Pengaturan">

          {/* MENU UBAH USERNAME */}
          <List.Item
            prefix={<EditSOutline />}
            onClick={() => {
              // Set initial value form dengan username saat ini
              formUser.setFieldsValue({ newUsername: user?.value || user?.username });
              setIsUserModalVisible(true);
            }}
            clickable
          >
            Ubah Username
          </List.Item>

          {/* MENU UBAH PASSWORD */}
          <List.Item
            prefix={<KeyOutline />}
            onClick={() => setIsPassModalVisible(true)}
            clickable
          >
            Ubah Password
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
            <div style={{ marginBottom: 15, fontSize: 12, color: '#666', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
              Username digunakan untuk Login. Pastikan unik dan tidak mengandung spasi.
            </div>
            <Form.Item
              label="Username Baru"
              name="newUsername"
              rules={[
                { required: true, message: 'Harap isi username' },
                { min: 3, message: 'Minimal 3 karakter' },
                { pattern: /^\S*$/, message: 'Tidak boleh ada spasi' }
              ]}
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