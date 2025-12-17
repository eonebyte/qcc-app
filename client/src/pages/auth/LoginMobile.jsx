import React, { useState, useEffect } from "react";
import {
  Form,
  Input,
  Button,
  Toast,
  Card,
  AutoCenter,
  PasscodeInput,
  NumberKeyboard,
  Avatar,
  Modal,
  SpinLoading,
  Popup
} from "antd-mobile";
import { UserOutline, LockOutline, CheckShieldOutline } from "antd-mobile-icons";
import { useDispatch, useSelector } from "react-redux";
import { login, checkAuthStatus } from "../../states/reducers/authSlice"; 
import { useNavigate } from "react-router-dom";
import axios from "axios";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

export default function LoginMobile() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isLoading = useSelector((state) => state.auth.isLoading);

  // --- STATE ---
  const [checkingDevice, setCheckingDevice] = useState(true);
  const [hasDeviceId, setHasDeviceId] = useState(false);
  const [savedUsername, setSavedUsername] = useState("");
  
  // State PIN Login
  const [pin, setPin] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // State Setup PIN
  const [isSetupPinVisible, setIsSetupPinVisible] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [tempUserRole, setTempUserRole] = useState("");

  // -------------------------------------------
  // 1. CEK DEVICE (DIPERBAIKI)
  // -------------------------------------------
  useEffect(() => {
    const checkDevice = async () => {
      try {
        const res = await axios.get(`${backEndUrl}/auth/check-device`, { withCredentials: true });
        
        // KASUS 1: PIN SUDAH DISETUP -> TAMPILKAN UI LOGIN PIN
        if (res.data.isDeviceRegistered) {
          setHasDeviceId(true);
          setSavedUsername(res.data.username);
          setIsKeyboardVisible(true);
        } 
        // KASUS 2: PIN BELUM DISETUP (Tapi Cookie Ada) -> LANGSUNG BUKA POPUP SETUP
        else if (res.data.requirePinSetup) {
            setHasDeviceId(false); // Sembunyikan UI Login
            setIsSetupPinVisible(true); // Buka Popup
            // Kita belum tau role user di sini (karena session mungkin expired jika refresh),
            // Tapi nanti setelah setup pin sukses, kita panggil checkAuthStatus yang akan me-refresh session.
        }
        // KASUS 3: DEVICE BARU -> TAMPILKAN FORM PASSWORD
        else {
          setHasDeviceId(false);
        }
      } catch (error) {
        setHasDeviceId(false);
      } finally {
        setCheckingDevice(false);
      }
    };
    checkDevice();
  }, []);

  // -------------------------------------------
  // 2. HANDLER LOGIN PASSWORD (AWAL)
  // -------------------------------------------
  const onFinishPassword = async (values) => {
    dispatch(login({ username: values.username, password: values.password })).then(async (result) => {
      if (result.payload && result.payload.success) {
        
        if (result.payload.requirePinSetup) {
            setTempUserRole(result.payload.user.title);
            setIsSetupPinVisible(true); // Buka Popup
        } else {
            handleRedirect(result.payload.user.title);
        }

      } else {
        Toast.show({ icon: "fail", content: result.payload?.message || "Login Gagal" });
      }
    });
  };

  // -------------------------------------------
  // 3. HANDLER SETUP PIN COMPLETE
  // -------------------------------------------
  const handleSetupPinComplete = async (inputPin) => {
      try {
          Toast.show({ icon: 'loading', content: 'Menyimpan PIN...', duration: 0 });
          
          const res = await axios.post(`${backEndUrl}/auth/setup-pin`, { pin: inputPin }, { withCredentials: true });
          
          if (res.data.success) {
              Toast.show({ icon: 'success', content: 'PIN Berhasil Dibuat!' });
              setIsSetupPinVisible(false);
              
              // Refresh Auth Status di Redux agar user terdeteksi login
              const authRes = await dispatch(checkAuthStatus());
              
              // Redirect berdasarkan data user terbaru
              if (authRes.payload && authRes.payload.user) {
                  handleRedirect(authRes.payload.user.title);
              } else if (tempUserRole) {
                  handleRedirect(tempUserRole);
              } else {
                  // Fallback jika session hilang, reload halaman
                  window.location.reload(); 
              }
          }
      } catch (error) {
          Toast.show({ icon: 'fail', content: 'Gagal menyimpan PIN' });
          setNewPin("");
      }
  };

  // -------------------------------------------
  // 4. HANDLER LOGIN PIN
  // -------------------------------------------
  const onFinishPinLogin = (inputPin) => {
    setTimeout(() => {
        dispatch(login({ 
            username: savedUsername, 
            password: "PIN_MODE", 
            pin: inputPin,
            isPinLogin: true 
        })).then((result) => {
            if (result.payload && result.payload.success) {
                Toast.show({ icon: "success", content: `Halo, ${savedUsername}` });
                setTimeout(() => {
                    handleRedirect(result.payload.user.title);
                }, 500);
            } else {
                setPin(""); 
                Toast.show({ icon: "fail", content: "PIN Salah" });
            }
        });
    }, 300);
  };

  const handleRedirect = (role) => {
    if (role === "driver") {
      navigate("/handover/checkin/customer");
    } else {
      navigate("/history");
    }
  };

  const handleSwitchAccount = () => {
    Modal.confirm({
        title: 'Ganti Akun?',
        content: 'Anda harus login ulang menggunakan password.',
        onConfirm: async () => {
            await axios.post(`${backEndUrl}/auth/logout-device`, {}, { withCredentials: true });
            setHasDeviceId(false);
            setSavedUsername("");
            setPin("");
            setIsKeyboardVisible(false);
        }
    });
  };

  if (checkingDevice) {
      return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><SpinLoading color="primary" style={{ '--size': '48px' }}/></div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", flexDirection: 'column' }}>
      <Card style={{ width: "100%", borderRadius: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.08)", paddingTop: 30, paddingBottom: 30 }}>
        
        <div style={{ marginBottom: 30 }}>
          <AutoCenter><img src="/sts.png" alt="Logo" style={{ width: "120px", marginBottom: 15 }} /></AutoCenter>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#333" }}>Shipment Tracking</div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{hasDeviceId ? "Masukkan PIN" : "Login STS"}</div>
          </div>
        </div>

        {/* --- UI FORM (Hanya Muncul Jika Tidak Sedang Setup PIN) --- */}
        {!isSetupPinVisible && (
            <>
                {!hasDeviceId ? (
                  <Form layout="horizontal" footer={<Button block type="submit" color="primary" size="large" loading={isLoading} shape="rounded" style={{ marginTop: 20 }}>Masuk</Button>} onFinish={onFinishPassword}>
                    <Form.Item name="username" rules={[{ required: true, message: "Wajib diisi" }]}><Input placeholder="Username" prefix={<UserOutline />} /></Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: "Wajib diisi" }]}><Input placeholder="Password" type="password" prefix={<LockOutline />} /></Form.Item>
                  </Form>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    
                    <div onClick={() => setIsKeyboardVisible(true)} style={{ padding: '0 20px', marginTop: 20, marginBottom: 200 }}>
                        <PasscodeInput value={pin} length={6} seperated />
                    </div>

                    <div style={{ marginTop: 30 }}>
                        <Button fill="none" color="primary" size="small" onClick={handleSwitchAccount}>Ganti Akun?</Button>
                    </div>

                    <NumberKeyboard
                        visible={isKeyboardVisible}
                        onInput={(v) => {
                            if (pin.length < 6) {
                                const next = pin + v;
                                setPin(next);
                                if (next.length === 6) onFinishPinLogin(next);
                            }
                        }}
                        onDelete={() => setPin(pin.slice(0, -1))}
                        onClose={() => setIsKeyboardVisible(false)}
                        showCloseButton={false}
                    />
                  </div>
                )}
            </>
        )}
      </Card>
      
      <div style={{ marginTop: 20, fontSize: 11, color: "#bbb" }}>STS Mobile v1.0.0</div>

      {/* --- POPUP SETUP PIN --- */}
      <Popup
        visible={isSetupPinVisible}
        onMaskClick={() => {}}
        bodyStyle={{ height: '100vh', background: '#fff' }}
      >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <CheckShieldOutline style={{ fontSize: 64, color: '#1677ff', marginBottom: 20 }} />
              <div style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 10 }}>Buat PIN Keamanan</div>
              <div style={{ color: '#666', textAlign: 'center', marginBottom: 40, padding: '0 20px' }}>
                  Silakan buat 6 digit PIN baru untuk mengamankan akun di perangkat ini.
              </div>

              <PasscodeInput 
                value={newPin} 
                length={6} 
                seperated 
                plain 
                keyboard={<NumberKeyboard />}
                onChange={(val) => {
                    setNewPin(val);
                    if(val.length === 6) handleSetupPinComplete(val);
                }}
              />
          </div>
      </Popup>
    </div>
  );
}