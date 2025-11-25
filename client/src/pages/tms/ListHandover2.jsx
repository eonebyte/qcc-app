import { useEffect, useRef, useState } from 'react';
import { SearchOutlined, RollbackOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Modal, Select, Space, Table, notification } from 'antd';
import Highlighter from 'react-highlight-words';
import axios from 'axios';
import dayjs from 'dayjs';
import LayoutGlobal from '../../components/layouts/LayoutGlobal';
import { useSelector } from 'react-redux';
import LocationComponent from '../../components/LocationComponent';
import { useNavigate } from 'react-router-dom';

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

// MODIFIKASI: buildPayload sekarang akan menerima array of bundles untuk peran non-delivery
const HANDOVER_CONFIGS = {
    delivery: {
        buttonText: 'Handover',
        modalTitle: 'Confirm Handover',
        buildPayload: (items) => ({ data: items }), // Tetap, karena datanya flat
    },
    dpk: {
        buttonText: 'Handover',
        modalTitle: 'Confirm Handover',
        buildPayload: (bundles, driverId, tnkbId) => ({
            data: bundles, // Mengirim array of bundles
            driverId,
            tnkbId,
        }),
    },
    // Konfigurasi untuk peran lain juga sekarang mengirim bundles
    driver: { buttonText: 'Handover', modalTitle: 'Confirm Handover', buildPayload: (bundles) => ({ data: bundles }) },
    marketing: { buttonText: 'Handover', modalTitle: 'Confirm Handover', buildPayload: (bundles) => ({ data: bundles }) },
    fat: { buttonText: 'Handover', modalTitle: 'Confirm Handover', buildPayload: (bundles) => ({ data: bundles }) },
};

const ListHandover2 = () => {
    const navigate = useNavigate();
    const [api, contextHolder] = notification.useNotification();
    const user = useSelector((state) => state.auth.user);
    const role = user.title;
    const configHandover = HANDOVER_CONFIGS[role];
    const coordinates = useSelector((state) => state.location.coordinates);

    // Flag utama yang mengontrol seluruh logika komponen
    const isBundleView = role !== 'delivery';

    // State
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [selectedForSubmit, setSelectedForSubmit] = useState([]); // State tunggal untuk flat atau bundle
    const [drivers, setDrivers] = useState([]);
    const [tnkbs, setTnkbs] = useState([]);
    const [selectedDriverId, setSelectedDriverId] = useState(null);
    const [selectedTnkbId, setSelectedTnkbId] = useState(null);
    const searchInput = useRef(null);

    useEffect(() => {
        fetchData();
        // Hanya fetch data dropdown jika diperlukan oleh peran
        if (role === 'dpk') {
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
            notification.error({ message: 'Gagal Memuat Data Dropdown', description: 'Tidak dapat mengambil data driver atau TNKB.' });
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/tms/listhandover?role=${role}`);
            if (res.data.data && res.data.data.success) {
                const rawData = res.data.data.data;

                if (isBundleView) {
                    // ALUR BARU: Proses data bundle
                    const processedBundles = rawData.map(bundle => ({
                        ...bundle,
                        key: bundle.bundleNo,
                        shipments: bundle.shipments.map(shipment => ({
                            ...shipment,
                            key: shipment.m_inout_id,
                            arrived: false, // Digunakan untuk tracking pemilihan
                            to: getRecipientTo(shipment.checkpoin_id, shipment.arrivedat_customer),
                        }))
                    }));
                    setData(processedBundles);
                } else {
                    // ALUR LAMA: Proses data flat untuk delivery
                    const processedFlatData = rawData.map(item => ({
                        ...item,
                        key: item.m_inout_id,
                        arrived: false,
                        to: getRecipientTo(item.checkpoin_id, item.arrivedat_customer),
                    }));
                    setData(processedFlatData);
                }
            } else {
                notification.warning({ message: 'Info', description: res.data.data.message || 'No data found' });
                setData([]);
            }
        } catch (err) {
            notification.error({ message: 'Error', description: 'Failed to fetch data' });
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // --- LOGIKA PEMILIHAN ---
    const handleBundleSelectionChange = (bundleNo, checked) => {
        setData(prevData =>
            prevData.map(bundle => {
                if (bundle.bundleNo === bundleNo) {
                    const updatedShipments = bundle.shipments.map(shipment => ({ ...shipment, arrived: checked }));
                    return { ...bundle, shipments: updatedShipments };
                }
                return bundle;
            })
        );
    };

    const handleCheckArrival = (mInoutId, checked) => {
        setData(prevData =>
            prevData.map(item => item.m_inout_id === mInoutId ? { ...item, arrived: checked } : item)
        );
    };
    
    const handleSelectAll = (e) => {
        const { checked } = e.target;
        setData(currentData => currentData.map(item => ({...item, arrived: checked})));
    };

    // --- LOGIKA SUBMIT ---
    const handleOpenConfirmModal = () => {
        let selectedData = [];
        if (isBundleView) {
            selectedData = data.filter(bundle => bundle.shipments.length > 0 && bundle.shipments.every(s => s.arrived));
        } else {
            selectedData = data.filter(item => item.arrived);
        }

        if (selectedData.length === 0) {
            notification.warning({ message: 'Tidak Ada Dipilih', description: `Pilih setidaknya satu ${isBundleView ? 'bundle' : 'item'}.` });
            return;
        }
        setSelectedForSubmit(selectedData);
        setIsConfirmModalOpen(true);
    };

    const executeSubmit = async () => {
        if (selectedForSubmit.length === 0) return;

        const firstItem = isBundleView ? selectedForSubmit[0].shipments[0] : selectedForSubmit[0];
        const checkpoint = firstItem.checkpoin_id;
        const isArrived = firstItem.arrivedat_customer;

        if (checkpoint === '3' && (!selectedDriverId || !selectedTnkbId)) {
            notification.error({ message: 'Validasi Gagal', description: 'Silakan pilih Driver dan TNKB.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = configHandover.buildPayload(selectedForSubmit, selectedDriverId, selectedTnkbId);
            
            if (isArrived === 'N' && checkpoint === '5' && coordinates) {
                const itemsToUpdate = isBundleView ? payload.data.flatMap(b => b.shipments) : payload.data;
                itemsToUpdate.forEach(item => {
                    item.lat_customer = coordinates.latitude;
                    item.long_customer = coordinates.longitude;
                });
            }

            console.log('payload : ', payload);
            

            const submitUrl = `${backEndUrl}/tms/handoverzzz?checkpoint=${checkpoint}&isarrived=${isArrived}`;
            const res = await axios.post(submitUrl, payload, { withCredentials: true });

            notification.success({ message: 'Sukses', description: res.data.message || "Handover berhasil." });
            fetchData();
            handleModalCancel();
        } catch (error) {
            console.error("Submit error:", error);
            notification.error({ message: 'Handover Gagal', description: error.response?.data?.message || 'Silakan coba lagi.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleModalCancel = () => {
        setIsConfirmModalOpen(false);
        setSelectedForSubmit([]);
        setSelectedDriverId(null);
        setSelectedTnkbId(null);
    };

    // --- DEFINISI KOLOM ---
    const getRecipientTo = (checkpoinId, arrivedState) => {
        const key = `${String(checkpoinId)}-${String(arrivedState)}`;
        switch (key) {
            case '3-N': return 'DRIVER';
            case '5-N': return 'CUSTOMER';
            case '5-Y': return 'DPK';
            case '7-Y': return 'DELIVERY';
            case '9-Y': return 'MKT';
            case '11-Y': return 'FAT';
            default: return 'DPK';
        }
    };

    // KOLOM UNTUK BUNDLE VIEW (DETAIL SHIPMENT)
    const shipmentColumns = [
        { title: 'Document No', dataIndex: 'documentno', key: 'documentno' },
        { title: 'Customer', dataIndex: 'customer', key: 'customer' },
        { title: 'Plan Time', dataIndex: 'plantime', key: 'plantime', render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-' },
        { title: 'To', dataIndex: 'to', key: 'to', width: 90, align: 'center' },
        { title: 'Action', key: 'action', width: 100, render: (_, record) => {
             if (record.checkpoin_id == '5' && record.arrivedat_customer == 'N') return '-';
             return <Button icon={<RollbackOutlined />} size='small' danger>Return</Button>
            }
        },
    ];

    // KOLOM UNTUK BUNDLE VIEW (BARIS UTAMA)
    const mainColumns = [
        {
            title: '', key: 'selection', width: 50, align: 'center',
            render: (_, record) => {
                const isSelected = record.shipments.length > 0 && record.shipments.every(s => s.arrived);
                return <Checkbox checked={isSelected} onChange={(e) => handleBundleSelectionChange(record.bundleNo, e.target.checked)} />;
            },
        },
        { title: 'No', key: 'no', width: 70, align: 'center', render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1 },
        { title: 'Bundle No', dataIndex: 'bundleNo', key: 'bundleNo' },
        { title: 'Created Date', dataIndex: 'created', key: 'created', render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm:ss') : '-' },
        { title: 'Total Shipments', dataIndex: 'shipments', key: 'shipments_count', align: 'center', render: (shipments) => shipments.length }
    ];

    // KOLOM UNTUK FLAT VIEW (DELIVERY)
    const isAllSelected = data.length > 0 && data.every(item => item.arrived);
    const columnsForDelivery = [
        { title: 'No', key: 'no', width: 70, align: 'center', render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1 },
        { 
            title: <Checkbox checked={isAllSelected} onChange={handleSelectAll} />,
            key: 'selection', width: 50, align: 'center',
            render: (_, record) => <Checkbox checked={record.arrived} onChange={(e) => handleCheckArrival(record.m_inout_id, e.target.checked)} />
        },
        { title: 'Document No', dataIndex: 'documentno', key: 'documentno' },
        { title: 'Customer', dataIndex: 'customer', key: 'customer' },
        { title: 'Plan Time', dataIndex: 'plantime', key: 'plantime', render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-' },
        { title: 'To', dataIndex: 'to', key: 'to', width: 90, align: 'center' },
    ];

    if (!configHandover) {
        return <LayoutGlobal><div style={{ padding: 24, textAlign: 'center' }}><h2>Konfigurasi tidak valid untuk role: {role}</h2></div></LayoutGlobal>;
    }

    // --- DATA UNTUK MODAL ---
    const firstSelectedItem = selectedForSubmit.length > 0 ? (isBundleView ? selectedForSubmit[0].shipments[0] : selectedForSubmit[0]) : null;
    const checkpointModal = firstSelectedItem?.checkpoin_id;
    const isArrivedCustomer = firstSelectedItem?.arrivedat_customer;

    const totalSelectedShipmentCount = isBundleView
        ? selectedForSubmit.reduce((sum, bundle) => sum + bundle.shipments.length, 0)
        : selectedForSubmit.length;

    return (
        <>
            {contextHolder}
            <LayoutGlobal>
                <Table
                    columns={isBundleView ? mainColumns : columnsForDelivery}
                    dataSource={data}
                    loading={loading}
                    pagination={pagination}
                    onChange={setPagination}
                    rowKey="key"
                    expandable={isBundleView ? {
                        expandedRowRender: (record) => (
                            <div style={{ backgroundColor: '#fafafa', margin: '-16px -8px' }}>
                                <Table
                                    columns={shipmentColumns}
                                    dataSource={record.shipments}
                                    pagination={false}
                                    size="small"
                                />
                            </div>
                        ),
                        rowExpandable: (record) => record.shipments && record.shipments.length > 0,
                    } : undefined}
                />

                <div style={{ marginTop: 16, padding: '10px', background: '#f0f2f5', borderTop: '1px solid #d9d9d9' }}>
                    <Button type="primary" onClick={handleOpenConfirmModal} disabled={totalSelectedShipmentCount === 0 || isSubmitting} loading={isSubmitting}>
                        {configHandover.buttonText} ({isBundleView ? selectedForSubmit.length : totalSelectedShipmentCount} Selected)
                    </Button>
                </div>

                <Modal
                    title={`${configHandover.modalTitle} (${totalSelectedShipmentCount} items)`}
                    open={isConfirmModalOpen}
                    onOk={executeSubmit}
                    onCancel={handleModalCancel}
                    confirmLoading={isSubmitting}
                    okText="Submit"
                    cancelText="Cancel"
                    width={600}
                    okButtonProps={{
                        disabled: (checkpointModal === '3' && (!selectedDriverId || !selectedTnkbId)) || (checkpointModal === '5' && !coordinates && isArrivedCustomer === 'N')
                    }}
                >
                    <p>Apakah Anda yakin akan menyerahkan daftar berikut?</p>
                    {checkpointModal === '5' && isArrivedCustomer === 'N' && <LocationComponent />}
                    <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #f0f0f0', padding: '8px 16px', marginTop: '16px', borderRadius: '4px' }}>
                        {isBundleView ? (
                            selectedForSubmit.map(bundle => (
                                <div key={bundle.key} style={{ marginBottom: 10 }}>
                                    <strong>Bundle: {bundle.bundleNo}</strong>
                                    <ul style={{ paddingLeft: 20, margin: '5px 0 0 0' }}>
                                        {bundle.shipments.map(item => <li key={item.key}>{item.documentno} ({item.customer})</li>)}
                                    </ul>
                                </div>
                            ))
                        ) : (
                            <ol style={{ paddingLeft: 20 }}>
                                {selectedForSubmit.map(item => <li key={item.key}><strong>{item.documentno}</strong> ({item.customer})</li>)}
                            </ol>
                        )}
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
                                        <Select.Option key={driver.ad_user_id} value={driver.ad_user_id}>
                                            {driver.name}
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

export default ListHandover2;