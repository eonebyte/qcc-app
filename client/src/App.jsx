import { useDispatch, useSelector } from "react-redux";
import { useEffect } from "react";
import { checkAuthStatus } from "./states/reducers/authSlice";
import Login from "./pages/auth/Login";
import { Spin } from "antd";
import SupplyRawMaterial from "./pages/sales/SupplyRawMaterial";
import {
  Route,
  Routes,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import Receipt from "./pages/tms/Receipt";
import ProgressShipment from "./pages/tms/ProgressShipment";
import ListHandover from "./pages/tms/ListHandover";
import Home from "./pages/Home";
import Outstanding from "./pages/tms/Outstanding";
import HistoryBundle from "./pages/tms/HistoryBundle";
import HistoryBundleDetail from "./pages/tms/HistoryBundleDetail";
import DeliveryToDPK from "./pages/tms/Handover/DeliveryToDPK";
import DPKFromDelivery from "./pages/tms/Receipt/DPKFromDelivery";
import DPKToDriver from "./pages/tms/Handover/DPKToDriver";
import DriverFromDPK from "./pages/tms/Receipt/DriverFromDPK";
import CheckInCustomer from "./pages/tms/Handover/CheckInRoundTrip_archive";
import CheckOut from "./pages/tms/Handover/CheckOut";
import DPKFromDriver from "./pages/tms/Receipt/DPKFromDriver";
import DPKToDelivery from "./pages/tms/Handover/DPKToDelivery";
import DeliveryFromDPK from "./pages/tms/Receipt/DeliveryFromDPK";
import DeliveryToMKT from "./pages/tms/Handover/DeliveryToMKT";
import MKTFromDelivery from "./pages/tms/Receipt/MKTFromDelivery";
import MKTToFAT from "./pages/tms/Handover/MKTToFAT";
import FATFromMKT from "./pages/tms/Receipt/FATFromMKT";
import SettingConfig from "./pages/tms/SettingConfig";
import DropOnly from "./pages/tms/DropOnly";
import CheckOutMobile from "./pages/tms/Handover/CheckOutMobile";
import CheckOutDropOnlyMobile from "./pages/tms/Handover/CheckOutDropOnlyMobile";
import AccountMobile from "./pages/AccountMobile";
import axios from "axios";
import { Toast } from "antd-mobile";


import { useState } from "react";
import PinSetupPopup from "./components/popups/PinSetupPopUp";
import useIsMobile from "./hooks/useIsMobile";
import ReloadPrompt from "./components/ReloadPromp";
const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";

function App() {
  const isMobile = useIsMobile();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const { auth, isLoading } = useSelector((state) => state.auth);
  const [isPinSetupNeeded, setIsPinSetupNeeded] = useState(false);

  // Cek status autentikasi saat aplikasi pertama kali dimuat
  useEffect(() => {
    dispatch(checkAuthStatus());
  }, [dispatch]);

  useEffect(() => {
    const initApp = async () => {
      try {
        // Cek status Device & Session
        const res = await axios.get(`${backEndUrl}/auth/check-device`, {
          withCredentials: true,
        });

        // LOGIKA UTAMA: Cek requirePinSetup dari Backend
        if (res.data.requirePinSetup) {
          setIsPinSetupNeeded(true); // Tampilkan Popup dimanapun user berada
        }

        // Sekalian Cek Redux Auth Status
        dispatch(checkAuthStatus());
      } catch (error) {
        console.error("App Init Error:", error);
      }
    };

    if (isMobile) {
      initApp();
    }
  }, [dispatch]);

  // Jika sedang loading, tampilkan spinner
  if (isLoading) {
    return <Spin tip="Loading..." spinning={isLoading} fullscreen />;
  }

  // Jika tidak autentikasi, tampilkan halaman login
  if (!auth) {
    return <Login />;
  }

  const handlePinSetupSubmit = async (pin) => {
    try {
      Toast.show({ icon: "loading", content: "Menyimpan PIN...", duration: 0 });

      const res = await axios.post(
        `${backEndUrl}/auth/setup-pin`,
        { pin },
        { withCredentials: true },
      );

      if (res.data.success) {
        Toast.show({ icon: "success", content: "PIN Berhasil Disetup!" });
        setIsPinSetupNeeded(false); // Tutup Popup

        // Refresh Auth agar data user terupdate
        dispatch(checkAuthStatus());

        // Opsional: Redirect ke dashboard jika masih di login page
        if (location.pathname === "/") {
          navigate("/dashboard"); // Sesuaikan route dashboard Anda
        }
      }
    } catch (error) {
      console.error(error);
      Toast.show({ icon: "fail", content: "Gagal menyimpan PIN" });
    }
  };

  // return <SupplyRawMaterial />;
  return (
    <>
      <ReloadPrompt />
      <PinSetupPopup
        visible={isPinSetupNeeded}
        onFinish={handlePinSetupSubmit}
      />

      <Routes>
        <Route path="/setting/config" element={<SettingConfig />} />
        {/* <Route path="/" element={<Home />} />*/}
        <Route
          path="/"
          element={<Navigate to="/progress-shipment" replace />}
        />
        <Route path="/outstanding" element={<Outstanding />} />
        <Route path="/list/handover" element={<ListHandover />} />
        <Route path="/receipt" element={<Receipt />} />
        <Route path="/history" element={<HistoryBundle />} />
        <Route path="/history/detail" element={<HistoryBundleDetail />} />
        <Route path="/progress-shipment" element={<ProgressShipment />} />
        <Route path="/account" element={<AccountMobile />} />
        {/* ========= NEW ====== */}
        <Route path="/handover/delivery/to/dpk" element={<DeliveryToDPK />} />
        <Route
          path="/receipt/dpk/from/delivery"
          element={<DPKFromDelivery />}
        />

        <Route path="/handover/dpk/to/driver" element={<DPKToDriver />} />
        <Route path="/receipt/driver/from/dpk" element={<DriverFromDPK />} />

        <Route path="/handover/checkin/customer" element={<CheckOut />} />
        <Route path="/handover/checkout/droponly" element={<DropOnly />} />
        <Route path="/receipt/dpk/from/driver" element={<DPKFromDriver />} />

        <Route path="/handover/dpk/to/delivery" element={<DPKToDelivery />} />
        <Route
          path="/receipt/delivery/from/dpk"
          element={<DeliveryFromDPK />}
        />

        <Route path="/handover/delivery/to/MKT" element={<DeliveryToMKT />} />
        <Route
          path="/receipt/mkt/from/delivery"
          element={<MKTFromDelivery />}
        />

        <Route path="/handover/mkt/to/fat" element={<MKTToFAT />} />
        <Route path="/receipt/fat/from/mkt" element={<FATFromMKT />} />

        <Route path="/checkout/mobile" element={<CheckOutMobile />} />
        <Route
          path="/checkout/mobile/do"
          element={<CheckOutDropOnlyMobile />}
        />
      </Routes>
    </>
  );
}

export default App;
