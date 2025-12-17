import { useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../states/reducers/authSlice";
import { Modal } from "antd-mobile";
import { useNavigate } from "react-router-dom";

// --- CONFIG ---
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 Menit
const STORAGE_KEY = 'last_active_time';

const IdleManager = ({ children }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const isAuth = useSelector((state) => state.auth.auth);
    
    const timerRef = useRef(null);

    // --- 1. FUNGSI LOGOUT (CORE) ---
    const executeIdleLogout = useCallback(() => {
        // Hapus timestamp agar tidak double trigger
        localStorage.removeItem(STORAGE_KEY);
        
        if (timerRef.current) clearTimeout(timerRef.current);

        // Panggil action logout session
        dispatch(logout()).then(() => {
            Modal.alert({
                title: 'Sesi Berakhir',
                content: 'Aplikasi tidak aktif lebih dari 5 menit. Masukkan PIN kembali.',
                onConfirm: () => {
                    navigate('/');
                },
                // Handle jika user menutup modal tanpa klik OK (klik backdrop)
                afterClose: () => {
                    navigate('/');
                }
            });
        });
    }, [dispatch, navigate]);

    // --- 2. FUNGSI CEK WAKTU (Dipanggil saat Activity / Resume) ---
    const checkTimeAndTimer = useCallback(() => {
        if (!isAuth) return;

        const lastActive = localStorage.getItem(STORAGE_KEY);
        
        if (lastActive) {
            const now = Date.now();
            const timePassed = now - parseInt(lastActive, 10);

            // LOGIC UTAMA: Jika selisih waktu sudah lewat batas -> KICK!
            if (timePassed > IDLE_TIMEOUT) {
                console.log("Idle terdeteksi (via Resume/Load check)");
                executeIdleLogout();
                return; 
            }
        }

        // Jika masih aman, update waktu & reset timer
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
        
        // Reset Timer JavaScript (untuk real-time detection jika layar tetap nyala)
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            console.log("Idle terdeteksi (via Realtime Timer)");
            executeIdleLogout();
        }, IDLE_TIMEOUT);

    }, [isAuth, executeIdleLogout]);

    // --- 3. LIFECYCLE HANDLERS ---
    useEffect(() => {
        if (!isAuth) return;

        // A. Cek saat pertama kali load
        checkTimeAndTimer();

        // B. Handler saat User melakukan aktivitas (Tap/Scroll)
        // Throttle agar tidak berat
        let isThrottled = false;
        const handleUserActivity = () => {
            if (!isThrottled) {
                checkTimeAndTimer(); // Update timestamp & reset timer
                isThrottled = true;
                setTimeout(() => { isThrottled = false; }, 1000); 
            }
        };

        // C. Handler khusus PWA: Saat Aplikasi 'Resume' dari Background
        const handleVisibilityChange = () => {
            // Jika aplikasi kembali terlihat (Visible) -> Cek Waktu Segera!
            if (document.visibilityState === 'visible') {
                console.log("App Resumed: Checking Idle Time...");
                // Kita ambil langsung dari storage tanpa update dulu untuk validasi
                const lastActive = localStorage.getItem(STORAGE_KEY);
                if (lastActive) {
                    const diff = Date.now() - parseInt(lastActive, 10);
                    if (diff > IDLE_TIMEOUT) {
                        executeIdleLogout();
                    } else {
                        // Jika aman, baru refresh timer
                        checkTimeAndTimer(); 
                    }
                }
            }
        };

        // --- REGISTER LISTENERS ---
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach(event => window.addEventListener(event, handleUserActivity));
        
        // Listener PENTING untuk PWA
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleVisibilityChange); // Backup untuk browser desktop

        // --- CLEANUP ---
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => window.removeEventListener(event, handleUserActivity));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleVisibilityChange);
        };
    }, [isAuth, checkTimeAndTimer, executeIdleLogout]);

    return children;
};

export default IdleManager;