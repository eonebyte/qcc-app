import { useEffect, useState } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { Button, Checkbox, Modal, Table, Typography, notification } from 'antd';
import axios from 'axios';
import { DateTime } from 'luxon';
import LayoutGlobal from '../../../components/layouts/LayoutGlobal';
import { useSelector } from 'react-redux';

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

const DPKFromDriver = () => {
    const user = useSelector((state) => state.auth.user);
    const userId = user.ad_user_id;

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [selectedBundlesForSubmit, setSelectedBundlesForSubmit] = useState([]);
    const [isModalRejectOpen, setIsModalRejectOpen] = useState(false);
    const [itemToReject, setItemToReject] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);


    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/receipt/list/dpk/from/driver`);
            if (res.data.data && res.data.data.success) {
                const rawBundles = res.data.data.data || [];

                const processedData = rawBundles.map(bundle => {
                    const processedShipments = bundle.shipments
                        .map(shipment => ({
                            ...shipment,
                            key: shipment.m_inout_id,
                            arrived: false,
                        }))
                        .filter(shipment => {
                            if (Number(shipment.checkpoin_id) === 4) {
                                return shipment.driverby === userId;
                            }
                            return true;
                        });

                    return {
                        ...bundle,
                        key: bundle.bundleNo,
                        shipments: processedShipments,
                    };
                }).filter(bundle => bundle.shipments.length > 0);

                setData(processedData);
            } else {
                setData([]);
                notification.warning({ message: 'Info', description: res.data.data.message || 'No data found' });
            }
        } catch (err) {
            console.error(err);
            notification.error({ message: 'Error', description: 'Failed to fetch data' });
        } finally {
            setLoading(false);
        }
    };

    const handleBundleSelectionChange = (bundleNo, checked) => {
        setData(prevData =>
            prevData.map(bundle => {
                if (bundle.bundleNo === bundleNo) {
                    const updatedShipments = bundle.shipments.map(shipment => ({
                        ...shipment,
                        arrived: checked
                    }));
                    return { ...bundle, shipments: updatedShipments };
                }
                return bundle;
            })
        );
    };


    const bundleCountSelected = data.filter(b =>
        b.shipments.length > 0 && b.shipments.every(s => s.arrived)
    ).length;


    const handleOpenConfirmModal = () => {
        // Filter untuk mendapatkan bundle yang SEMUA shipment-nya ditandai 'arrived'
        const selectedBundles = data.filter(bundle =>
            bundle.shipments.length > 0 && bundle.shipments.every(shipment => shipment.arrived)
        );

        if (selectedBundles.length === 0) {
            notification.warning({ message: 'Tidak Ada Item Dipilih', description: 'Silakan pilih setidaknya satu bundle.' });
            return;
        }
        setSelectedBundlesForSubmit(selectedBundles);
        setIsConfirmModalOpen(true);
    };

    const executeSubmit = async () => {
        if (selectedBundlesForSubmit.length === 0) return;

        setIsSubmitting(true);
        try {
            const payload = { data: selectedBundlesForSubmit };

            console.log('New Payload:', payload);

            const res = await axios.post(`${backEndUrl}/receipt/process/dpk/from/driver`, payload, { withCredentials: true });

            if (res.data.success) {
                notification.success({ message: 'Sukses', description: 'Data berhasil diterima.' });
                fetchData();
            } else {
                notification.error({ message: 'Gagal', description: res.data.message || 'Terjadi kesalahan.' });
            }
        } catch (error) {
            console.error("Submit error:", error);
            notification.error({ message: 'Accept Gagal', description: error.response?.data?.message || 'Silakan coba lagi.' });
        } finally {
            setIsSubmitting(false);
            setIsConfirmModalOpen(false);
            setSelectedBundlesForSubmit([]);
        }
    };

    const showModalReject = (shipment) => {
        setItemToReject(shipment);
        setIsModalRejectOpen(true);
    };

    const handleRejectOk = () => {
        console.log("Rejecting item:", itemToReject);
        notification.info({ message: 'Info', description: `Dokumen ${itemToReject.documentno} akan diproses untuk direject.` });
        setIsModalRejectOpen(false);
        setItemToReject(null);
    };

    const handleRejectCancel = () => {
        setIsModalRejectOpen(false);
        setItemToReject(null);
    };

    const shipmentColumns = () => {
        return [
            { title: 'Document No', dataIndex: 'documentno', key: 'documentno' },
            { title: 'Customer', dataIndex: 'customer', key: 'customer' },
            { title: 'From', dataIndex: 'to', key: 'to', width: 80, align: 'center' },
            { title: 'Plan Time', dataIndex: 'plantime', key: 'plantime', render: (text) => text ? DateTime.fromISO(text).toFormat('dd-MM-yyyy HH:mm') : 'N/A' },
            { title: 'Action', key: 'action', width: 100, render: (_, record) => <Button onClick={() => showModalReject(record)} icon={<CloseOutlined />} size='small' danger>Reject</Button> }
        ];
    };

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
        { title: 'Created Date', dataIndex: 'created', key: 'created', render: (text) => DateTime.fromISO(text).toFormat('dd-MM-yyyy HH:mm:ss') },
        { title: 'Total Shipments', dataIndex: 'shipments', key: 'shipments_count', align: 'center', render: (shipments) => shipments.length }
    ];

    const totalShipmentsInSelectedBundles = selectedBundlesForSubmit.reduce((acc, bundle) => acc + bundle.shipments.length, 0);


    return (
        <LayoutGlobal>
            <Table
                columns={mainColumns}
                dataSource={data}
                loading={loading}
                pagination={pagination}
                onChange={(p) => setPagination(p)}
                rowClassName={() => 'main-bundle-row'}
                expandable={{
                    expandedRowRender: (record) => (
                        <div style={{ padding: '8px 24px', margin: 0, backgroundColor: '#fafafa' }}>
                            <Table
                                columns={shipmentColumns()}
                                dataSource={record.shipments}
                                pagination={false}
                                size="small"
                            />
                        </div>
                    ),
                    rowExpandable: (record) => record.shipments && record.shipments.length > 0,
                }}
            />

            <div style={{ marginTop: 16, padding: '10px', background: '#f0f2f5', borderTop: '1px solid #d9d9d9' }}>
                <Button type="primary" onClick={handleOpenConfirmModal} disabled={bundleCountSelected === 0 || isSubmitting} loading={isSubmitting}>
                    Accept ({bundleCountSelected} Selected)
                </Button>
            </div>

            <Modal
                title={`Confirm Handover (${totalShipmentsInSelectedBundles} items from ${selectedBundlesForSubmit.length} bundles)`}
                open={isConfirmModalOpen}
                onOk={executeSubmit}
                onCancel={() => setIsConfirmModalOpen(false)}
                confirmLoading={isSubmitting}
            >
                <p>Anda akan menyerahkan semua surat jalan dari bundle yang dipilih. Lanjutkan?</p>
                <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 16, border: '1px solid #f0f0f0', padding: '8px' }}>
                    {selectedBundlesForSubmit.map(bundle => (
                        <div key={bundle.key} style={{ marginBottom: '12px' }}>
                            <strong>Bundle: {bundle.bundleNo}</strong>
                            <ul style={{ paddingLeft: '20px', margin: '4px 0 0 0' }}>
                                {bundle.shipments.map(item => (
                                    <li key={item.key}>{item.documentno}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </Modal>


            <Modal
                title="Confirm Reject"
                open={isModalRejectOpen}
                onOk={handleRejectOk}
                onCancel={handleRejectCancel}
            >
                <p>Apakah Anda yakin akan mereject dokumen <strong>{itemToReject?.documentno}</strong>?</p>
            </Modal>
        </LayoutGlobal>
    );
};

export default DPKFromDriver;