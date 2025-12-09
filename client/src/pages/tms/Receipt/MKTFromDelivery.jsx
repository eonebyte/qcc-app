import { useEffect, useState } from 'react';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Checkbox, Modal, Popover, Table, Typography, notification } from 'antd';
import axios from 'axios';
import { DateTime } from 'luxon';
import LayoutGlobal from '../../../components/layouts/LayoutGlobal';
import { useSelector } from 'react-redux';

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

const MKTFromDelivery = () => {
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
            const res = await axios.get(`${backEndUrl}/receipt/list/mkt/from/delivery`, { withCredentials: true });
            if (res.data.data && res.data.data.success) {
                const rawBundles = res.data.data.data || [];

                const processedData = rawBundles.map(bundle => {
                    const processedShipments = bundle.shipments
                        .map(shipment => ({
                            ...shipment,
                            key: shipment.m_inout_id,
                            arrived: false,
                            checked: false,
                            clickCount: 0,
                            bundleNo: bundle.bundleNo,
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

    const handleShipmentCheckChange = (bundleNo, shipmentKey, checked) => {
        setData(prevData =>
            prevData.map(bundle => {
                if (bundle.bundleNo === bundleNo) {
                    const updatedShipments = bundle.shipments.map(shipment => {
                        if (shipment.key === shipmentKey) {
                            return { ...shipment, checked };
                        }
                        return shipment;
                    });
                    return { ...bundle, shipments: updatedShipments };
                }
                return bundle;
            })
        );
    };

    const handleShipmentClickCount = (bundleNo, shipmentKey) => {
        setData(prevData =>
            prevData.map(bundle => {
                if (bundle.bundleNo === bundleNo) {
                    const updatedShipments = bundle.shipments.map(shipment => {
                        if (shipment.key === shipmentKey) {
                            let newClickCount = shipment.clickCount + 1;
                            let newChecked = shipment.checked;
                            if (newClickCount >= 3) {
                                newChecked = false; // reset checked setelah 3 klik
                                newClickCount = 0;  // reset counter
                            }
                            return { ...shipment, checked: newChecked, clickCount: newClickCount };
                        }
                        return shipment;
                    });
                    return { ...bundle, shipments: updatedShipments };
                }
                return bundle;
            })
        );
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
            const filteredBundles = selectedBundlesForSubmit.map(bundle => ({
                ...bundle,
                shipments: bundle.shipments.filter(s => s.checked)
            }))
                // Hanya kirim bundle yang masih punya shipment setelah filter
                .filter(bundle => bundle.shipments.length > 0);

            if (filteredBundles.length === 0) {
                notification.warning({ message: 'Tidak ada data untuk dikirim', description: 'Semua shipment tidak dicentang.' });
                setIsSubmitting(false);
                return;
            }

            const payload = { data: filteredBundles };

            console.log('New Payload:', payload);

            const res = await axios.post(`${backEndUrl}/receipt/process/mkt/from/delivery`, payload, { withCredentials: true });

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

    const handleRejectOk = async () => {
        console.log("Rejecting item:", itemToReject);
        try {

            const res = await axios.post(`${backEndUrl}/tms/reject`, itemToReject, { withCredentials: true });

            if (res.data.success) {
                notification.success({ message: 'Info', description: `Dokumen ${itemToReject.documentno} akan diproses untuk direject.` });
                setData(prevData =>
                    prevData.map(bundle => ({
                        ...bundle,
                        shipments: bundle.shipments.filter(s => s.m_inout_id !== itemToReject.m_inout_id)
                    }))
                );
            } else {
                notification.error({ message: 'Gagal', description: res.data.message || 'Terjadi kesalahan.' });
            }
        } catch (error) {
            console.error("Submit error:", error);
            notification.error({ message: 'Reject Gagal', description: error.response?.data?.message || 'Silakan coba lagi.' });
        } finally {
            setIsModalRejectOpen(false);
            setItemToReject(null);
        }
    };

    const handleRejectCancel = () => {
        setIsModalRejectOpen(false);
        setItemToReject(null);
    };

    const shipmentColumns = () => {
        return [
            {
                title: (
                    <Popover content={<div><span>Klik checked 3 untuk melakukan uncheck</span></div>}>
                        <span style={{ cursor: 'pointer' }}>Check</span>
                    </Popover>
                ),
                key: 'action', width: 50, render: (_, record) => {
                    if (record.checked) {
                        return (
                            <span
                                style={{ color: '#389e0d', cursor: 'pointer' }}
                                onClick={() => handleShipmentClickCount(record.bundleNo, record.key)}
                            >
                                Checked
                            </span>

                        );
                    } else {
                        return (
                            <Button onClick={() => handleShipmentCheckChange(record.bundleNo, record.key, true)} icon={<CheckOutlined />} size='small' type="default"></Button>
                        )
                    }
                }
            },
            { title: 'Document No', dataIndex: 'documentno', key: 'documentno' },
            { title: 'Customer', dataIndex: 'customer', key: 'customer' },
            { title: 'Plan Time', dataIndex: 'plantime', key: 'plantime', render: (text) => text ? DateTime.fromISO(text).toFormat('dd-MM-yyyy HH:mm') : 'N/A' },
            { title: 'Action', key: 'action', width: 100, render: (_, record) => <Button onClick={() => showModalReject(record)} icon={<CloseOutlined />} size='small' danger>Reject</Button> }
        ];
    };

    const mainColumns = [
        {
            title: '', key: 'selection', width: 50, align: 'center',
            render: (_, record) => {
                const allChecked = record.shipments.length > 0 && record.shipments.every(s => s.checked);
                const isSelected = record.shipments.length > 0 && record.shipments.every(s => s.arrived);
                return <Checkbox checked={isSelected}
                    onChange={(e) => handleBundleSelectionChange(record.bundleNo, e.target.checked)}
                    disabled={!allChecked}
                />;
            },
        },
        { title: 'No', key: 'no', width: 70, align: 'center', render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1 },
        { title: 'Bundle No', dataIndex: 'bundleNo', key: 'bundleNo' },
        { title: 'Date Handover', dataIndex: 'created', key: 'created', render: (text) => DateTime.fromISO(text).plus({ hours: 7 }).toFormat('dd-MM-yyyy HH:mm:ss') },
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

export default MKTFromDelivery;