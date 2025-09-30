import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
    Card,
    Checkbox,
    Modal,
    Toast,
    SearchBar,
    Tag,
    SpinLoading,
    Empty,
    NavBar,
    SafeArea,
    TabBar,
    Button,
} from 'antd-mobile';
// --- PERBAIKAN 1: Tambahkan ikon untuk Beranda dan Profil ---
import {
    CheckCircleOutline,
    CloseOutline,
    UnorderedListOutline,
    TruckOutline,
    ClockCircleOutline,
    AppOutline, // Ikon untuk Beranda
    UserOutline, // Ikon untuk Profil
} from 'antd-mobile-icons';


const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

const ReceiptMobile = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const user = useSelector((state) => state.auth.user);
    const role = user ? user.title : '';
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (role) {
            fetchData();
        }
    }, [role]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/tms/receipt?role=${role}`);
            if (res.data.data && res.data.data.success) {
                setData(res.data.data.data.map(item => ({ ...item, key: item.m_inout_id, arrived: false })));
            } else {
                setData([]);
            }
        } catch (err) {
            Toast.show({ icon: 'fail', content: 'Gagal memuat data' });
            console.log(err);

        } finally {
            setLoading(false);
        }
    };

    // ... (fungsi handleOpenConfirmModal, executeSubmit, handleCheckArrival, handleSelectAll tidak berubah) ...

    const handleOpenConfirmModal = () => {
        const allSelectedItems = data.filter(item => item.arrived);
        if (allSelectedItems.length === 0) return;
        Modal.confirm({
            title: `Konfirmasi Accept (${allSelectedItems.length} item)`,
            content: `Anda yakin ingin accept ${allSelectedItems.length} surat jalan yang dipilih?`,
            onConfirm: () => executeSubmit(allSelectedItems),
        });
    };

    const executeSubmit = async (itemsToSubmit) => {
        setIsSubmitting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1500));
            Toast.show({ icon: 'success', content: `${itemsToSubmit.length} item berhasil di-accept!` });
            fetchData();
        } catch (error) {
            Toast.show({ icon: 'fail', content: 'Terjadi kesalahan saat submit' });
            console.log(error);

        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCheckArrival = (mInoutId, checked) => {
        setData(prevData =>
            prevData.map(item =>
                item.m_inout_id === mInoutId ? { ...item, arrived: checked } : item
            )
        );
    };

    const handleSelectAll = (checked) => {
        setData(prevData =>
            prevData.map(item => ({ ...item, arrived: checked }))
        );
    };


    const totalSelectedCount = data.filter(d => d.arrived).length;
    const isAllSelected = data.length > 0 && totalSelectedCount === data.length;
    const filteredData = data.filter(item =>
        item.documentno.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderBottomBar = () => {
        if (totalSelectedCount > 0) {
            return (
                <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <CloseOutline fontSize={24} onClick={() => handleSelectAll(false)} style={{ cursor: 'pointer' }} />
                    <div style={{ fontWeight: '500' }}>{totalSelectedCount} item dipilih</div>
                    <Button
                        color='primary'
                        onClick={handleOpenConfirmModal}
                        loading={isSubmitting}
                        disabled={isSubmitting}
                    >
                        Accept
                    </Button>
                </div>
            );
        }

        // --- PERBAIKAN 2: Susun ulang dan lengkapi TabBar dengan semua menu ---
        return (
            <TabBar
                activeKey={location.pathname}
                onChange={path => navigate(path)}
            >
                <TabBar.Item
                    key="/"
                    icon={<AppOutline />}
                    title="Beranda"
                />
                <TabBar.Item
                    key="/receipt"
                    icon={<UnorderedListOutline />}
                    title="Receipt"
                />
                <TabBar.Item
                    key="/list/handover"
                    icon={<TruckOutline />}
                    title="Handover"
                />
                <TabBar.Item
                    key="/history"
                    icon={<ClockCircleOutline />}
                    title="History"
                />
                <TabBar.Item
                    key="/profile"
                    icon={<UserOutline />}
                    title="Profil"
                />
            </TabBar>
        );
    };


    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f5f5f5' }}>
            {/* BAGIAN HEADER (FIXED) */}
            <div style={{ flexShrink: 0, backgroundColor: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                {/* ... (Tidak ada perubahan di sini) ... */}
                <NavBar back={null}>Receipt</NavBar>
                <div style={{ padding: '8px 12px' }}>
                    <SearchBar placeholder="Cari No. Dokumen" value={searchQuery} onChange={setSearchQuery} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderTop: '1px solid #eee' }}>
                    <Checkbox
                        checked={isAllSelected}
                        indeterminate={totalSelectedCount > 0 && !isAllSelected}
                        onChange={handleSelectAll}
                    />
                    <div style={{ marginLeft: '12px', color: '#333' }}>Pilih Semua</div>
                </div>
            </div>

            {/* BAGIAN KONTEN (SCROLLABLE) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {/* ... (Tidak ada perubahan di sini) ... */}
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><SpinLoading color='primary' /></div>
                ) : filteredData.length > 0 ? (
                    filteredData.map(item => (
                        <Card key={item.m_inout_id} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', padding: '12px' }}>
                                <Checkbox
                                    checked={item.arrived}
                                    onChange={checked => handleCheckArrival(item.m_inout_id, checked)}
                                />
                                <div style={{ flex: 1, marginLeft: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong>{item.documentno}</strong>
                                    <Tag color="warning">Waiting</Tag>
                                </div>
                            </div>
                        </Card>
                    ))
                ) : (
                    <Empty description="Tidak ada data ditemukan" style={{ padding: '20px 0' }} />
                )}
            </div>

            {/* BAGIAN BOTTOM BAR (FIXED & KONDISIONAL) */}
            <div style={{ flexShrink: 0, backgroundColor: 'white', boxShadow: '0 -2px 4px rgba(0,0,0,0.05)' }}>
                {renderBottomBar()}
                <SafeArea position='bottom' />
            </div>
        </div>
    );
};

export default ReceiptMobile;