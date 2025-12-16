import React from "react";
import { Form, Input, Button, Toast, Card, AutoCenter } from "antd-mobile";
import { UserOutline, LockOutline } from "antd-mobile-icons";
import { useDispatch, useSelector } from "react-redux";
import { login } from "../../states/reducers/authSlice"; // Sesuaikan path
import { useNavigate } from "react-router-dom";

export default function LoginMobile() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Ambil loading state dari Redux
  const isLoading = useSelector((state) => state.auth.isLoading);

  const onFinish = async (values) => {
    const { username, password } = values;

    // Dispatch action login
    dispatch(login({ username, password })).then(async (result) => {
      if (result.payload && result.payload.success) {
        Toast.show({
          icon: "success",
          content: "Login Berhasil",
        });

        // Logic redirect berdasarkan Role (sama seperti web)
        if (result.payload.user.title === "driver") {
          navigate("/handover/checkin/customer");
        } else {
          navigate("/history");
        }
      } else {
        Toast.show({
          icon: "fail",
          content: result.payload ? result.payload.message : "Login Gagal",
        });
      }
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
      }}
    >
      <Card
        style={{
          width: "100%",
          borderRadius: 16,
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
        }}
      >
        {/* LOGO AREA */}
        <div style={{ marginBottom: 30, marginTop: 10 }}>
          <AutoCenter>
            <img
              src="/sts.png"
              alt="Logo"
              style={{ width: "100px", maxWidth: "100%" }}
            />
          </AutoCenter>
          <div
            style={{
              textAlign: "center",
              marginTop: 10,
              color: "#666",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            STS (Shipment Tracking System)
          </div>
        </div>

        {/* FORM LOGIN */}
        <Form
          layout="horizontal"
          footer={
            <Button
              block
              type="submit"
              color="primary"
              size="large"
              loading={isLoading}
              shape="rounded"
              style={{ marginTop: 20 }}
            >
              Masuk
            </Button>
          }
          onFinish={onFinish}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: "Username wajib diisi!" }]}
          >
            <Input
              placeholder="Username"
              clearable
              prefix={<UserOutline style={{ color: "#1677ff" }} />}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: "Password wajib diisi!" }]}
          >
            <Input
              placeholder="Password"
              clearable
              type="password"
              prefix={<LockOutline style={{ color: "#1677ff" }} />}
            />
          </Form.Item>
        </Form>

        <div
          style={{
            textAlign: "center",
            marginTop: 20,
            fontSize: 12,
            color: "#999",
          }}
        >
          {/* Versi 1.0.0*/}
        </div>
      </Card>
    </div>
  );
}
