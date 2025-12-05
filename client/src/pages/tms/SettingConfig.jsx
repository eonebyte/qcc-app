import { useEffect, useState } from "react";
import { Card, DatePicker, Button, message, Spin, Modal } from "antd";
import dayjs from "dayjs";
import axios from "axios";
import LayoutGlobal from "../../components/layouts/LayoutGlobal";
import { useSelector } from "react-redux";

const backEndUrl = import.meta.env.VITE_BACKEND_URL;

const SettingConfig = () => {
    const user = useSelector((state) => state.auth.user);
    const userId = user.ad_user_id;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [startDate, setStartDate] = useState(null);

    // Modal Konfirmasi
    const [confirmOpen, setConfirmOpen] = useState(false);

    // ------------------------------------------------------------
    // 1. Load config
    // ------------------------------------------------------------
    const loadConfig = async () => {
        try {
            setLoading(true);

            const res = await axios.get(`${backEndUrl}/tms/config`, {
                withCredentials: true
            });

            if (res.data.success) {
                const d = res.data.data.data.start_date;
                setStartDate(d ? dayjs(d) : null);
            }
        } catch (err) {
            console.error(err);
            message.error("Gagal mengambil konfigurasi.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    // ------------------------------------------------------------
    // 2. Simpan ke backend (HANYA dipanggil jika user klik "Ya, Simpan")
    // ------------------------------------------------------------
    const saveConfig = async () => {
        try {
            setSaving(true);

            const payload = {
                userId,
                startDate: startDate.format("YYYY-MM-DD")
            };

            const res = await axios.post(`${backEndUrl}/tms/config`, payload, {
                withCredentials: true
            });

            if (res.data.success) {
                message.success("Konfigurasi berhasil disimpan!");
            } else {
                message.error(res.data.message || "Gagal menyimpan konfigurasi.");
            }
        } catch (err) {
            console.error(err);
            message.error("Terjadi error saat menyimpan konfigurasi.");
        } finally {
            setSaving(false);
            setConfirmOpen(false);
            loadConfig();
        }
    };

    // ------------------------------------------------------------
    // 3. Klik tombol -> buka modal konfirmasi
    // ------------------------------------------------------------
    const handleOpenConfirm = () => {
        if (!startDate) {
            message.warning("Pilih tanggal mulai data terlebih dahulu.");
            return;
        }
        setConfirmOpen(true);
    };

    return (
        <LayoutGlobal>
            <Card
                title="Setting Konfigurasi Data"
                style={{ maxWidth: 500, margin: "20px auto", padding: 20 }}
            >
                {loading ? (
                    <Spin />
                ) : (
                    <>
                        <div style={{ marginBottom: 15 }}>
                            <label style={{ fontWeight: 500 }}>Mulai Data Dari Tanggal:</label>
                            <DatePicker
                                style={{ width: "100%", marginTop: 5 }}
                                value={startDate}
                                onChange={(date) => setStartDate(date)}
                                format="YYYY-MM-DD"
                            />
                        </div>

                        <Button type="primary" onClick={handleOpenConfirm} block>
                            Simpan Konfigurasi
                        </Button>
                    </>
                )}

                {/* MODAL KONFIRMASI */}
                <Modal
                    title="Konfirmasi Penyimpanan"
                    open={confirmOpen}
                    onCancel={() => setConfirmOpen(false)}
                    footer={[
                        <Button key="cancel" onClick={() => setConfirmOpen(false)}>
                            Batal
                        </Button>,
                        <Button
                            key="submit"
                            type="primary"
                            loading={saving}
                            onClick={saveConfig}
                        >
                            Ya, Simpan
                        </Button>,
                    ]}
                >
                    <p>
                        Apakah Anda yakin ingin menyimpan konfigurasi ini?
                        <br />
                        <strong>Mulai data dari:</strong> {startDate ? startDate.format("YYYY-MM-DD") : "-"}
                    </p>
                </Modal>
            </Card>
        </LayoutGlobal>
    );
};

export default SettingConfig;
