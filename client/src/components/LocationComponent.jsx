import React, { useState, useEffect, useCallback } from 'react';
// 1. Import 'Collapse' dari Ant Design
import { Spin, Alert, Button, Space, Typography, Collapse } from 'antd';
import { EnvironmentOutlined, StopOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { setLocation, setLocationError } from '../states/reducers/locationSlice';

const { Text } = Typography;
const { Panel } = Collapse; // Destructuring Panel untuk kode yang lebih bersih

// ===================================================================
// CUSTOM HOOK: Logika geolokasi (Tidak ada perubahan)
// ===================================================================
const useGeolocation = () => {
    const dispatch = useDispatch();
    const [state, setState] = useState({
        isLoading: true,
        location: null,
        error: null,
        status: 'prompt',
    });

    const requestLocation = useCallback(() => {
        setState(prevState => ({ ...prevState, isLoading: true, error: null }));

        if (!navigator.geolocation) {
            const errorMsg = 'Geolocation tidak didukung browser ini.';
            setState(prevState => ({ ...prevState, isLoading: false, error: 'Geolocation tidak didukung browser ini.' }));
            dispatch(setLocationError(errorMsg));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const newLocation = { latitude, longitude };
                setState(prevState => ({ ...prevState, isLoading: false, location: newLocation }));
                dispatch(setLocation(newLocation));
            },
            (err) => {
                let errorMessage = "Terjadi error yang tidak diketahui.";
                if (err.code === err.PERMISSION_DENIED) {
                    errorMessage = "Anda telah memblokir akses lokasi.";
                }
                setState(prevState => ({ ...prevState, isLoading: false, error: errorMessage }));
                dispatch(setLocationError(errorMessage));
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }, []);

    useEffect(() => {
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' }).then((permissionStatus) => {
                setState(prevState => ({ ...prevState, isLoading: false, status: permissionStatus.state }));
                if (permissionStatus.state === 'granted') requestLocation();
                permissionStatus.onchange = () => {
                    setState(prevState => ({ ...prevState, status: permissionStatus.state }));
                    if (permissionStatus.state === 'granted') requestLocation();
                };
            });
        } else {
            requestLocation();
        }
    }, [requestLocation]);

    return { ...state, requestLocation };
};


// ===================================================================
// KOMPONEN TAMPILAN
// ===================================================================

// --- Instruksi visual (sedikit dimodifikasi untuk menghilangkan judul duplikat) ---
const VisualInstructions = () => (
    <ol style={{ paddingLeft: 20, marginTop: 10, listStyleType: 'decimal' }}>
        <li style={{ marginBottom: 12 }}>
            Klik ikon gembok (🔒) atau menu (⋮) di address bar, lalu pilih <strong>"Permissions"</strong> atau <strong>"Site settings"</strong>.
            <img
                src="/assets/img/loc1.png"
                alt="Langkah 1: Buka pengaturan situs"
                style={{ maxWidth: '100%', borderRadius: '4px', marginTop: '8px' }}
            />
        </li>
        <li style={{ marginBottom: 12 }}>
            Cari dan klik pada menu <strong>"Location"</strong>.
            <img
                src="/assets/img/loc2.png"
                alt="Langkah 2: Pilih menu Lokasi"
                style={{ maxWidth: '100%', borderRadius: '4px', marginTop: '8px' }}
            />
        </li>
        <li>
            Ubah pengaturan dari "Block" menjadi <strong>"Allow"</strong>, lalu muat ulang (refresh) halaman ini.
            <img
                src="/assets/img/loc3.png"
                alt="Langkah 3: Izinkan akses lokasi"
                style={{ maxWidth: '100%', borderRadius: '4px', marginTop: '8px' }}
            />
        </li>
    </ol>
);


const LocationComponent = () => {
    const { status, location, isLoading, error, requestLocation } = useGeolocation();

    const statusViews = {
        loading: <Spin tip="Memeriksa izin lokasi..." />,
        prompt: (
            <Alert
                type="info"
                message="Aktifkan Lokasi Anda"
                description="Kami memerlukan izin untuk mendeteksi lokasi Anda saat ini."
                action={
                    <Button size="small" type="primary" onClick={requestLocation}>
                        Izinkan Akses
                    </Button>
                }
            />
        ),

        // --- PERUBAHAN UTAMA DI SINI ---
        denied: (
            <Alert
                message="Akses Lokasi Diblokir"
                description={
                    <div>
                        <Text>Anda perlu mengizinkan akses lokasi di pengaturan browser. Setelah itu, muat ulang halaman.</Text>
                        <Collapse ghost style={{ marginTop: 16 }}>
                            <Panel
                                header={
                                    <Space size="small">
                                        <QuestionCircleOutlined />
                                        Tampilkan Panduan Cara Mengaktifkan
                                    </Space>
                                }
                                key="1"
                            >
                                <VisualInstructions />
                            </Panel>
                        </Collapse>
                    </div>
                }
                type="error"
                showIcon
                icon={<StopOutlined />}
            />
        ),
        granted: location ? (
            <Space direction="vertical">
                <Text strong>Lokasi Saat Ini:</Text>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                    Lat: {location.latitude.toFixed(6)}, Lon: {location.longitude.toFixed(6)}
                </Text>
            </Space>
        ) : (
            <Spin tip="Mendapatkan koordinat..." />
        ),
        error: <Alert message="Terjadi Masalah" description={error} type="warning" showIcon />,
    };

    // Logika render tetap sama
    let currentView;
    if (isLoading && !location) {
        currentView = statusViews.loading;
    } else if (error && status !== 'denied') {
        currentView = statusViews.error;
    } else {
        currentView = statusViews[status];
    }

    return (
        <div style={{ padding: '20px', border: '1px solid #f0f0f0', borderRadius: '8px' }}>
            {currentView}
        </div>
    );
};

export default LocationComponent;