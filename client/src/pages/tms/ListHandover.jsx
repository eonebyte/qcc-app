import { useEffect, useRef, useState } from 'react';
import { SearchOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { Button, Checkbox, Input, Modal, Select, Space, Table, notification } from 'antd';
import Highlighter from 'react-highlight-words';
import axios from 'axios';
import dayjs from 'dayjs';
import LayoutGlobal from '../../components/layouts/LayoutGlobal';
import { useSelector } from 'react-redux';

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

const HANDOVER_CONFIGS = {
    delivery: {
        buttonText: 'Handover',
        modalTitle: 'Confirm Handover',
        buildPayload: (items) => ({ data: items }),
    },
    dpk: {
        buttonText: 'Handover',
        modalTitle: 'Confirm Handover',
        // Fungsi untuk membangun payload sesuai kebutuhan backend
        buildPayload: (items, driverId, tnkbId) => ({
            data: items,
            driverId,
            tnkbId,
        }),
    },
    driver: {
        buttonText: 'Handover',
        modalTitle: 'Confirm Handover',
        buildPayload: (items) => ({ data: items }), // Payload lebih sederhana
    },
    marketing: {
        buttonText: 'Handover',
        modalTitle: 'Confirm Handover',
        buildPayload: (items) => ({ data: items }), // Payload lebih sederhana
    },

    // Tambahkan konfigurasi untuk role lain (mkt, fat) jika diperlukan
};


const ListHandover = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user.title;

    const configHandover = HANDOVER_CONFIGS[role];


    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
    const searchInput = useRef(null);

    // State untuk proses submit & modal konfirmasi
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [selectedItemsForSubmit, setSelectedItemsForSubmit] = useState([]);

    // State untuk menyimpan data Driver, TNKB, dan pilihan user
    const [drivers, setDrivers] = useState([]);
    const [tnkbs, setTnkbs] = useState([]);
    const [selectedDriverId, setSelectedDriverId] = useState(null);
    const [selectedTnkbId, setSelectedTnkbId] = useState(null);

    useEffect(() => {
        fetchData();
        fetchDropdownData();
        if (configHandover && checkpointModal === '3') {
            fetchDropdownData();
        }
    }, [role]);

    const fetchDropdownData = async () => {
        try {
            const [driversRes, tnkbsRes] = await Promise.all([
                axios.get(`${backEndUrl}/tms/drivers`),
                axios.get(`${backEndUrl}/tms/tnkbs`)
            ]);
            if (driversRes.data?.success) setDrivers(driversRes.data.data);
            if (tnkbsRes.data?.success) setTnkbs(tnkbsRes.data.data);
        } catch (err) {
            notification.error({
                message: 'Gagal Memuat Data Dropdown',
                description: 'Tidak dapat mengambil data driver atau TNKB.'
            });
            console.error("Error fetching dropdown data:", err);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/tms/listhandover?role=${role}`);

            if (res.data.data && res.data.data.success) {
                const rawData = res.data.data.data;

                console.log(rawData);


                const flattenedData = rawData.map(item => ({
                    ...item,
                    key: item.m_inout_id,
                    arrived: false
                }));
                setData(flattenedData);
            } else {
                notification.warning({
                    message: 'Info',
                    description: res.data.data.message || 'No data found'
                });
                setData([]);
            }
        } catch (err) {
            notification.error({ message: 'Error', description: 'Failed to fetch data' });
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Mengumpulkan item yang dipilih, lalu membuka modal konfirmasi.
     */
    const handleOpenConfirmModal = () => {
        // --- PERUBAHAN 2: Logika filter disederhanakan untuk data flat ---
        const allSelectedItems = data.filter(item => item.arrived);

        if (allSelectedItems.length === 0) {
            notification.warning({
                message: 'Tidak Ada Item Dipilih',
                description: 'Silakan pilih setidaknya satu item untuk di-handover.'
            });
            return;
        }

        setSelectedItemsForSubmit(allSelectedItems);
        setIsConfirmModalOpen(true);
    };


    // Helper function untuk menentukan tujuan berdasarkan checkpoint
    const determineToActor = (checkpointId) => {
        return checkpointId;
    };

    let targetCheckpointId = null;
    let checkpointModal = null;

    // Hanya hitung jika ada item yang dipilih
    if (selectedItemsForSubmit.length > 0) {
        const firstItem = selectedItemsForSubmit[0];
        targetCheckpointId = firstItem.checkpoin_id;
        checkpointModal = determineToActor(targetCheckpointId);
    }

    const executeSubmit = async () => {
        if (checkpointModal === '3' && (!selectedDriverId || !selectedTnkbId)) {
            notification.error({ message: 'Validasi Gagal', description: 'Silakan pilih Driver dan TNKB.' });
            return;
        }

        if (selectedItemsForSubmit.length === 0) {
            notification.warning({ message: 'Tidak ada item dipilih.' });
            return;
        }

        // 2. Ambil checkpoint dari item pertama dan tentukan toActor
        const firstItem = selectedItemsForSubmit[0];
        const targetCheckpointId = firstItem.checkpoin_id; // Pastikan nama kolom ini benar!
        const checkpoint = determineToActor(targetCheckpointId);

        // 3. Validasi apakah toActor valid (checkpoint dikenali)
        if (!checkpoint) {
            notification.error({
                message: 'Aksi Tidak Valid',
                description: `Handover dari checkpoint ID "${targetCheckpointId}" tidak dikonfigurasi.`
            });
            return;
        }

        // 4. Validasi konsistensi: Pastikan semua item yang dipilih memiliki checkpoint_id yang sama
        const allItemsHaveSameCheckpoint = selectedItemsForSubmit.every(
            item => item.checkpoin_id === targetCheckpointId
        );

        if (!allItemsHaveSameCheckpoint) {
            notification.error({
                message: 'Item Tidak Konsisten',
                description: 'Anda hanya dapat menyerahkan item dari checkpoint yang sama dalam satu waktu.'
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = configHandover.buildPayload(selectedItemsForSubmit, selectedDriverId, selectedTnkbId);
            const submitUrl = `${backEndUrl}/tms/handover?checkpoint=${checkpoint}`;
            const res = await axios.post(submitUrl, payload, { withCredentials: true });


            notification.success({
                message: 'Sukses',
                description: res.data.message || 'Handover berhasil!'
            });

            const submittedIds = new Set(selectedItemsForSubmit.map(d => d.m_inout_id));
            setData(currentData =>
                currentData.filter(item => !submittedIds.has(item.m_inout_id))
            );

            handleModalCancel();

        } catch (error) {
            console.error("Submit error:", error);
            notification.error({
                message: 'Handover Gagal',
                description: error.response?.data?.message || 'Silakan coba lagi.'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Fungsi untuk mereset state modal saat ditutup
    const handleModalCancel = () => {
        setIsConfirmModalOpen(false);
        setSelectedItemsForSubmit([]);
        setSelectedDriverId(null);
        setSelectedTnkbId(null);
    };

    // Fungsi pencarian (tidak berubah)
    const handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        setSearchText(selectedKeys[0]);
        setSearchedColumn(dataIndex);
    };
    const handleReset = (clearFilters) => {
        clearFilters();
        setSearchText('');
    };
    const handleTableChange = (newPagination) => {
        setPagination(newPagination);
    };
    const getColumnSearchProps = (dataIndex) => ({
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
            <div style={{ padding: 8 }} onKeyDown={e => e.stopPropagation()}>
                <Input ref={searchInput} placeholder={`Search ${dataIndex}`} value={selectedKeys[0]} onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])} onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)} style={{ marginBottom: 8, display: 'block' }} />
                <Space>
                    <Button type="primary" onClick={() => handleSearch(selectedKeys, confirm, dataIndex)} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>Search</Button>
                    <Button onClick={() => clearFilters && handleReset(clearFilters)} size="small" style={{ width: 90 }}>Reset</Button>
                    <Button type="link" size="small" onClick={() => { confirm({ closeDropdown: false }); setSearchText(selectedKeys[0]); setSearchedColumn(dataIndex); }}>Filter</Button>
                    <Button type="link" size="small" onClick={() => { close(); }}>Close</Button>
                </Space>
            </div>
        ),
        filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
        onFilter: (value, record) => record[dataIndex]?.toString().toLowerCase().includes(value.toLowerCase()),
        render: (text) => searchedColumn === dataIndex ? (<Highlighter highlightStyle={{ backgroundColor: '#ffc069', padding: 0 }} searchWords={[searchText]} autoEscape textToHighlight={text ? text.toString() : ''} />) : (text),
    });

    // --- PERUBAHAN 4: Logika Checkbox disederhanakan ---
    const handleCheckArrival = (mInoutId, checked) => {
        setData(prevData =>
            prevData.map(item =>
                item.m_inout_id === mInoutId ? { ...item, arrived: checked } : item
            )
        );
    };

    // Menghitung total item yang dipilih
    const totalSelectedCount = data.filter(d => d.arrived).length;

    const handleSelectAll = (e) => {
        const { checked } = e.target;
        setData(prevData =>
            prevData.map(item => ({ ...item, arrived: checked }))
        );
    };

    const isAllSelected = data.length > 0 && totalSelectedCount === data.length;


    if (!configHandover) {
        return (
            <LayoutGlobal>
                <div style={{ padding: 24, textAlign: 'center' }}>
                    <h2>Konfigurasi Tidak Ditemukan</h2>
                    <p>Tidak ada konfigurasi handover yang valid untuk role Anda: <strong>{role}</strong></p>
                </div>
            </LayoutGlobal>
        );
    }

    const getRecipientTo = (checkpoinId) => {
        switch (String(checkpoinId)) { // Menggunakan String() agar aman jika nilainya angka atau teks
            case '3':
                return 'DRIVER';
            case '5':
                return 'DPK';
            case '7':
                return 'DELIVERY';
            case '9':
                return 'MKT';
            case '11':
                return 'FAT';
            default:
                return 'DPK'; // Untuk semua nilai lain yang tidak cocok
        }
    };

    const columns = [
        {
            title: 'No',
            key: 'no',
            width: 70,
            align: 'center',
            render: (text, record, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1
        },
        {
            title: 'To',
            key: 'to',
            width: 70,
            align: 'center',
            render: (text, record) => getRecipientTo(record.checkpoin_id)
        },
        {
            title: <Checkbox checked={isAllSelected} onChange={handleSelectAll} />,
            key: 'selection',
            width: 50,
            align: 'center',
            render: (_, record) => (
                <Checkbox
                    checked={record.arrived}
                    onChange={(e) => handleCheckArrival(record.m_inout_id, e.target.checked)}
                >
                    {/* Ikon bisa ditambahkan di sini jika perlu, atau dikosongkan */}
                </Checkbox>
            ),
        },
        {
            title: 'Document No',
            dataIndex: 'documentno',
            key: 'documentno',
            ...getColumnSearchProps('documentno'),
        },
        {
            title: 'Customer',
            dataIndex: 'customer',
            key: 'customer',
            ...getColumnSearchProps('customer')
        },
        {
            title: 'Plan Time',
            dataIndex: 'planTime',
            key: 'planTime',
            render: (text) => dayjs(text).format('DD/MM/YYYY HH:mm'),
        },
        // {
        //     title: 'Status',
        //     dataIndex: 'arrived',
        //     key: 'status',
        //     width: 100,
        //     render: (arrived) => (
        //         arrived
        //             ? <CheckCircleFilled style={{ color: '#00a854', fontSize: '18px' }} />
        //             : <CloseCircleFilled style={{ color: '#f04134', fontSize: '18px' }} />
        //     )
        // }
    ];





    return (
        <>
            <LayoutGlobal>
                {/* --- PERUBAHAN 6: Properti `expandable` dihapus dari Tabel --- */}
                <Table
                    columns={columns}
                    dataSource={data}
                    loading={loading}
                    pagination={pagination}
                    onChange={handleTableChange}
                    rowKey="key"
                />

                <div style={{ marginTop: 16, padding: '10px', background: '#f0f2f5', borderTop: '1px solid #d9d9d9' }}>
                    <Button
                        type="primary"
                        onClick={handleOpenConfirmModal}
                        disabled={totalSelectedCount === 0 || isSubmitting}
                    >
                        {configHandover.buttonText} ({totalSelectedCount} Selected)
                    </Button>
                </div>

                <Modal
                    title={`${configHandover.modalTitle} (${selectedItemsForSubmit.length} items)`}
                    open={isConfirmModalOpen}
                    onOk={executeSubmit}
                    onCancel={handleModalCancel}
                    confirmLoading={isSubmitting}
                    okText="Submit"
                    cancelText="Cancel"
                    width={600}
                    okButtonProps={{
                        disabled: checkpointModal === '3' && (!selectedDriverId || !selectedTnkbId)
                    }}
                >
                    <p>Anda akan menyerahkan daftar Surat Jalan berikut kepada driver. Silakan pilih Driver dan TNKB.</p>
                    <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #f0f0f0', padding: '8px 16px', marginTop: '16px', borderRadius: '4px' }}>
                        <ol style={{ paddingLeft: '20px' }}>
                            {selectedItemsForSubmit.map(item => (
                                <li key={item.m_inout_id}>

                                    <strong>{item.documentno}</strong> ({item.customer})
                                </li>
                            ))}
                        </ol>
                    </div>

                    {checkpointModal === '3' && (
                        <div style={{ marginTop: 24 }}>
                            <div style={{ marginBottom: 16 }}>
                                <span style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Driver:</span>
                                <Select
                                    style={{ width: '100%' }}
                                    placeholder="Pilih Driver"
                                    value={selectedDriverId}
                                    onChange={setSelectedDriverId}
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {drivers.map(driver => (
                                        <Select.Option key={driver.AD_USER_ID} value={driver.AD_USER_ID}>
                                            {driver.NAME}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </div>
                            <div>
                                <span style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>TNKB:</span>
                                <Select
                                    style={{ width: '100%' }}
                                    placeholder="Pilih TNKB"
                                    value={selectedTnkbId}
                                    onChange={setSelectedTnkbId}
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {tnkbs.map(tnkb => (
                                        <Select.Option key={tnkb.ADW_TMS_TNKB_ID} value={tnkb.ADW_TMS_TNKB_ID}>
                                            {tnkb.NAME}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </div>
                        </div>
                    )}
                </Modal>
            </LayoutGlobal>
        </>
    );
};

export default ListHandover;