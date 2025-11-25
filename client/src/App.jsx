import { useDispatch, useSelector } from 'react-redux';
import { useEffect } from 'react';
import { checkAuthStatus } from './states/reducers/authSlice';
import Login from './pages/auth/Login';
import { Spin } from 'antd';
import SupplyRawMaterial from './pages/sales/SupplyRawMaterial';
import { Route, Routes } from 'react-router-dom';
import Receipt from './pages/tms/Receipt';
import ProgressShipment from './pages/tms/ProgressShipment';
import ListHandover from './pages/tms/ListHandover';
import Home from './pages/Home';
import Outstanding from './pages/tms/Outstanding';
import HistoryBundle from './pages/tms/HistoryBundle';
import HistoryBundleDetail from './pages/tms/HistoryBundleDetail';
import DeliveryToDPK from './pages/tms/Handover/DeliveryToDPK';
import DPKFromDelivery from './pages/tms/Receipt/DPKFromDelivery';
import DPKToDriver from './pages/tms/Handover/DPKToDriver';
import DriverFromDPK from './pages/tms/Receipt/DriverFromDPK';
import CheckInCustomer from './pages/tms/Handover/CheckInRoundTrip';
import CheckIn from './pages/tms/Handover/CheckIn';
import DPKFromDriver from './pages/tms/Receipt/DPKFromDriver';
import DPKToDelivery from './pages/tms/Handover/DPKToDelivery';
import DeliveryFromDPK from './pages/tms/Receipt/DeliveryFromDPK';
import DeliveryToMKT from './pages/tms/Handover/DeliveryToMKT';
import MKTFromDelivery from './pages/tms/Receipt/MKTFromDelivery';
import MKTToFAT from './pages/tms/Handover/MKTTOFAT';
import FATFromMKT from './pages/tms/Receipt/FATFromMKT';

function App() {
  const dispatch = useDispatch();
  const { auth, isLoading } = useSelector((state) => state.auth);

  // Cek status autentikasi saat aplikasi pertama kali dimuat
  useEffect(() => {
    dispatch(checkAuthStatus());
  }, [dispatch]);

  // Jika sedang loading, tampilkan spinner
  if (isLoading) {
    return <Spin tip="Loading..." spinning={isLoading} fullscreen />;
  }

  // Jika tidak autentikasi, tampilkan halaman login
  if (!auth) {
    return <Login />;
  }

  // return <SupplyRawMaterial />;
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/outstanding" element={<Outstanding />} />
      <Route path="/list/handover" element={<ListHandover />} />
      <Route path="/receipt" element={<Receipt />} />
      <Route path="/history" element={<HistoryBundle />} />
      <Route path="/history/detail" element={<HistoryBundleDetail />} />
      <Route path="/progress-shipment" element={<ProgressShipment />} />

      {/* ========= NEW ====== */}
      <Route path="/handover/delivery/to/dpk" element={<DeliveryToDPK />} />
      <Route path="/receipt/dpk/from/delivery" element={<DPKFromDelivery />} />

      <Route path="/handover/dpk/to/driver" element={<DPKToDriver />} />
      <Route path="/receipt/driver/from/dpk" element={<DriverFromDPK />} />

      <Route path="/handover/checkin/customer" element={<CheckIn />} />
      <Route path="/receipt/dpk/from/driver" element={<DPKFromDriver />} />

      <Route path="/handover/dpk/to/delivery" element={<DPKToDelivery />} />
      <Route path="/receipt/delivery/from/dpk" element={<DeliveryFromDPK />} />

      <Route path="/handover/delivery/to/MKT" element={<DeliveryToMKT />} />
      <Route path="/receipt/mkt/from/delivery" element={<MKTFromDelivery />} />

      <Route path="/handover/mkt/to/fat" element={<MKTToFAT />} />
      <Route path="/receipt/fat/from/mkt" element={<FATFromMKT />} />

    </Routes>
  );
}

export default App;

