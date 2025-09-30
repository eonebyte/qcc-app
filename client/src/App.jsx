import { useDispatch, useSelector } from 'react-redux';
import { useEffect } from 'react';
import { checkAuthStatus } from './states/reducers/authSlice';
import Login from './pages/auth/Login';
import { Spin } from 'antd';
import SupplyRawMaterial from './pages/sales/SupplyRawMaterial';
import { Route, Routes } from 'react-router-dom';
import History from './pages/tms/History';
import Receipt from './pages/tms/Receipt';
import ProgressShipment from './pages/tms/ProgressShipment';
import ListHandover from './pages/tms/ListHandover';
import Home from './pages/Home';

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
      <Route path="/list/handover" element={<ListHandover />} />
      <Route path="/receipt" element={<Receipt />} />
      <Route path="/history" element={<History />} />
      <Route path="/progress-shipment" element={<ProgressShipment />} />
    </Routes>
  );
}

export default App;

