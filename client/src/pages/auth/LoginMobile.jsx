import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { SpinLoading, Toast, Grid } from 'antd-mobile';
import { DeleteOutline } from 'antd-mobile-icons';
import { login } from '../../states/reducers/authSlice';

import './LoginMobile.css'; // Pastikan file CSS ini diimpor

// ============================================================================
// == KOMPONEN VISUAL (Tidak berubah banyak, hanya cara pemanggilannya nanti)
// ============================================================================

const PinDots = ({ pinLength, currentLength, isError }) => (
    <div className={`pin-dots-container ${isError ? 'pin-error' : ''}`}>
        {Array.from({ length: pinLength }).map((_, index) => (
            <div
                key={index}
                className={`pin-dot ${index < currentLength ? 'pin-dot-filled' : 'pin-dot-empty'}`}
            />
        ))}
    </div>
);

// --- PERBAIKAN 1: Hapus 'position: fixed' dari keyboard ---
// Keyboard sekarang hanyalah sebuah blok biasa yang akan ditempatkan oleh parent-nya.
const NeumorphicKeyboard = ({ onInput, onDelete }) => (
    <div style={{
        width: '100%',
        padding: '16px 24px 48px 24px', // Padding bawah untuk safe area
        backgroundColor: '#eef3f8', // Samakan dengan latar belakang utama
        flexShrink: 0, // Mencegah keyboard menyusut
    }}>
        <Grid columns={3} gap={24}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'spacer', 0, 'delete'].map(k => (
                <Grid.Item key={k}>
                    {k === 'spacer' ? <div style={{ height: '70px' }} /> :
                        k === 'delete' ? <div className="keyboard-key-neumorphic" onClick={onDelete}><DeleteOutline fontSize={30} /></div> :
                            <div className="keyboard-key-neumorphic" onClick={() => onInput(String(k))}>{k}</div>
                    }
                </Grid.Item>
            ))}
        </Grid>
    </div>
);

// ============================================================================
// == KOMPONEN LOGIN UTAMA DENGAN STRUKTUR LAYOUT YANG BENAR
// ============================================================================
const PIN_LENGTH = 6;

export default function LoginMobile() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const isLoading = useSelector((state) => state.auth.isLoading);
    const [pin, setPin] = useState('');
    const [isError, setIsError] = useState(false);

    // --- Logika Inti (tidak berubah) ---
    const handleLoginAndNavigation = (payload) => { /* ... (Salin dari jawaban sebelumnya) */ };
    useEffect(() => { /* ... (Salin dari jawaban sebelumnya) */ }, [pin]);

    // Salin lagi fungsi-fungsi ini untuk kelengkapan
    const handleLoginAndNavigationImpl = (payload) => {
        dispatch(login(payload)).then(result => {
            if (result.payload && result.payload.success) {
                Toast.show({ icon: 'success', content: 'Login Berhasil' });
                if (payload.password) localStorage.setItem('username', payload.username);
                navigate('/');
            } else {
                Toast.show({ icon: 'fail', content: result.payload?.message || 'PIN Salah' });
                setPin('');
                setIsError(true);
                setTimeout(() => setIsError(false), 500);
            }
        });
    };

    useEffect(() => {
        if (pin.length === PIN_LENGTH) {
            const savedUsername = localStorage.getItem('username');
            if (!savedUsername) {
                Toast.show({ content: 'Harap login dengan password terlebih dahulu.' });
                setPin('');
                return;
            }
            handleLoginAndNavigationImpl({ username: savedUsername, pin });
        }
    }, [pin]);

    return (
        // --- PERBAIKAN 2: Container utama sekarang menjadi Flexbox Column yang membagi layar ---
        <div className="login-container-neumorphic" style={{
            display: 'flex',
            flexDirection: 'column', // Anak-anaknya akan tersusun dari atas ke bawah
            height: '100vh',
            overflow: 'hidden', // Mencegah scroll yang tidak perlu
        }}>
            {isLoading && (<div style={{/* ... */ }}> <SpinLoading color='primary' /> </div>)}

            {/* --- PERBAIKAN 3: Area Konten yang Fleksibel --- */}
            {/* 'flex: 1' berarti area ini akan mengambil semua sisa ruang yang tersedia */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center', // Pusatkan konten secara vertikal
                alignItems: 'center',
                textAlign: 'center',
                padding: '20px'
            }}>
                <img src="/src/assets/images/logo-api.png" alt="Logo" style={{ width: '100px', marginBottom: '40px', opacity: 0.7 }} />
                <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#3e4a61', margin: '0 0 40px 0' }}>
                    Masukkan PIN Anda
                </h1>
                <PinDots pinLength={PIN_LENGTH} currentLength={pin.length} isError={isError} />
            </div>

            {/* Area Keyboard sekarang menjadi bagian dari flow normal, bukan overlay */}
            <NeumorphicKeyboard
                onInput={(key) => setPin(p => p.length < PIN_LENGTH ? p + key : p)}
                onDelete={() => setPin(p => p.slice(0, -1))}
            />
        </div>
    );
}