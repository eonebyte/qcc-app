import React, { useState, useEffect } from "react";
import { Popup, PasscodeInput, NumberKeyboard } from "antd-mobile";
import { CheckShieldOutline } from "antd-mobile-icons";

const PinSetupPopup = ({ visible, onFinish }) => {
  const [pinValue, setPinValue] = useState("");

  useEffect(() => {
    if (visible) setPinValue(""); // Reset saat muncul
  }, [visible]);

  return (
    <Popup
      visible={visible}
      destroyOnClose
      showCloseButton={false}
      onMaskClick={() => {}} // Paksa user isi, tidak bisa klik luar
      bodyStyle={{ height: "100vh", background: "#fff", zIndex: 9999 }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <CheckShieldOutline
          style={{ fontSize: 64, color: "#1677ff", marginBottom: 20 }}
        />
        <div style={{ fontSize: 22, fontWeight: "bold", marginBottom: 10 }}>
          Setup PIN Keamanan
        </div>
        <div
          style={{
            color: "#666",
            textAlign: "center",
            marginBottom: 40,
            padding: "0 20px",
          }}
        >
          Demi keamanan akun Anda, silakan buat 6 digit PIN baru untuk perangkat ini.
        </div>

        <PasscodeInput
          value={pinValue}
          length={6}
          seperated
          plain
          keyboard={<NumberKeyboard />}
          onChange={(val) => {
            setPinValue(val);
            if (val.length === 6) {
              onFinish(val); // Kirim PIN ke Parent
            }
          }}
          style={{ marginBottom: 150 }}
        />
      </div>
    </Popup>
  );
};

export default PinSetupPopup;