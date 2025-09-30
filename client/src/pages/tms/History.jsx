import { useEffect, useRef, useState } from 'react';
import { SearchOutlined, CheckCircleFilled, CloseCircleFilled, ExclamationCircleOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Modal, Space, Table, Tag, Typography, notification } from 'antd';
import Highlighter from 'react-highlight-words';
import axios from 'axios';
import { DateTime } from 'luxon';
import LayoutGlobal from '../../components/layouts/LayoutGlobal';
import { useSelector } from 'react-redux';
const { Text, Paragraph, Link } = Typography;
const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

const formatDateTime = (isoString) => {
    if (!isoString) return <Text type="secondary">-</Text>;
    return DateTime.fromISO(isoString, { zone: 'utc' })
        .setZone('Asia/Jakarta')
        .toFormat('yyyy-MM-dd HH:mm');
};

const handoverFlow = [
    { handover: 'ho_mkt_to_fat', accept: 'accept_fat_from_mkt', requester: 'Marketing', confirmer: 'FAT' },
    { handover: 'ho_delivery_to_mkt', accept: 'accept_mkt_from_delivery', requester: 'Delivery', confirmer: 'Marketing' },
    { handover: 'ho_dpk_to_delivery', accept: 'accept_delivery_from_dpk', requester: 'DPK', confirmer: 'Delivery' },
    { handover: 'ho_driver_to_dpk', accept: 'accept_dpk_from_driver', requester: 'Driver', confirmer: 'DPK' },
    { handover: 'ho_dpk_to_driver', accept: 'accept_driver_from_dpk', requester: 'DPK', confirmer: 'Driver' },
    { handover: 'ho_delivery_to_dpk', accept: 'accept_dpk_from_delivery', requester: 'Delivery', confirmer: 'DPK' },
];

// --- Logika Inti: Fungsi untuk menentukan status aksi berdasarkan skenario Anda ---
const getActionState = (record, currentUserRole) => {
    // Cari langkah mana dalam alur yang saat ini aktif (sudah handover, belum accept)
    const activeFlow = handoverFlow.find(flow => record[flow.handover] && !record[flow.accept]);

    // Jika tidak ada langkah yang aktif, tidak ada aksi yang bisa dilakukan
    if (!activeFlow) {
        return { action: 'NO_ACTION' };
    }

    // Cek flag permintaan cancel (misal: 'cancel_request_by' berisi nama peran)
    if (record.cancelrequest === 'Y') {
        // Jika user saat ini adalah pihak yang harus mengkonfirmasi
        if (currentUserRole.toLowerCase() === activeFlow.confirmer.toLowerCase()) {
            return { action: 'CONFIRM_CANCEL', handoverKey: activeFlow.handover };
        }
        // Jika user saat ini adalah pihak yang meminta cancel
        if (currentUserRole.toLowerCase() === activeFlow.requester.toLowerCase()) {
            return { action: 'WAITING_CONFIRMATION' };
        }
    } else {
        // Jika belum ada permintaan cancel, cek apakah user saat ini berhak meminta
        if (currentUserRole.toLowerCase() === activeFlow.requester.toLowerCase()) {
            return { action: 'REQUEST_CANCEL', handoverKey: activeFlow.handover };
        }
    }

    // Jika user tidak cocok dengan peran requester atau confirmer di alur aktif
    return { action: 'NO_ACTION' };
};


const History = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user.title;
    // State untuk fungsionalitas tabel & pencarian
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

    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/tms/history?role=${role}`);

            if (res.data.data && res.data.data.success) {
                const rawData = res.data.data.data;

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
            notification.error({
                message: 'Error',
                description: 'Failed to fetch data'
            });
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = (action, record, handoverKey) => {
        const docNo = record.documentno;
        const actionText = action === 'REQUEST_CANCEL' ? 'Request Cancel' : 'Confirm Cancel';
        const okText = action === 'REQUEST_CANCEL' ? 'Ya, Kirim Permintaan' : 'Ya, Konfirmasi';

        Modal.confirm({
            title: `${actionText} untuk Dokumen ${docNo}?`,
            icon: <ExclamationCircleOutlined />,
            content: `Apakah Anda yakin ingin melanjutkan aksi ini?`,
            okText,
            okType: action === 'CONFIRM_CANCEL' ? 'danger' : 'primary',
            cancelText: 'Batal',
            onOk: () => executeAction(action.toLowerCase().replace('_', '-'), record.m_inout_id, handoverKey),
        });
    };

    const executeAction = async (actionType, m_inout_id, handoverKey) => {
        setIsProcessing(true);
        try {
            const res = await axios.post(`${backEndUrl}/tms/process-cancel`, {
                action: actionType,
                m_inout_id,
                handoverKey,
                role,
            }, { withCredentials: true });

            if (res.data.success) {
                notification.success({ message: 'Sukses', description: res.data.message });
                fetchData();
            } else {
                throw new Error(res.data.message);
            }
        } catch (error) {
            notification.error({ message: 'Aksi Gagal', description: error.message || 'Silakan coba lagi.' });
        } finally {
            setIsProcessing(false);
        }
    };



    const executeSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Mengirim data yang sudah disimpan di state
            const res = await axios.post(`${backEndUrl}/tms/accepted?role=${role}`, { data: selectedItemsForSubmit }, { withCredentials: true });

            if (res.data.success) {
                notification.success({
                    message: 'Sukses',
                    description: res.data.message || 'Accept berhasil!'
                });
            } else {
                notification.danger({
                    message: 'Error',
                    description: res.data.message
                });
            }


            const submittedIds = new Set(selectedItemsForSubmit.map(d => d.m_inout_id));
            setData(currentData =>
                currentData.filter(item => !submittedIds.has(item.m_inout_id))
            );

            // Tutup modal dan reset state
            setIsConfirmModalOpen(false);
            setSelectedItemsForSubmit([]);
            fetchData();

        } catch (error) {
            console.error("Submit error:", error);
            notification.error({
                message: 'Accept Gagal',
                description: error.response?.data?.message || 'Silakan coba lagi.'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

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
                <Input
                    ref={searchInput}
                    placeholder={`Search ${dataIndex}`}
                    value={selectedKeys[0]}
                    onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                    onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
                    style={{ marginBottom: 8, display: 'block' }}
                />
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

    const columns = [
        {
            title: 'No',
            key: 'no',
            width: 70,
            align: 'center',
            render: (text, record, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1
        },
        {
            title: 'Document No',
            dataIndex: 'documentno',
            key: 'documentno',
            ...getColumnSearchProps('documentno'),
        },
        {
            title: 'Delivery',
            key: 'deliveryToDpk',
            // width: 300,
            render: (_, record) => (
                <Paragraph style={{ margin: 0, fontSize: '12px' }}>
                    Handovered to DPK : {formatDateTime(record.ho_delivery_to_dpk)}<br />
                    Accepted from DPK : {formatDateTime(record.accept_delivery_from_dpk)}<br />
                    Handovered to Marketing : {formatDateTime(record.ho_delivery_to_mkt)}
                </Paragraph>
            )
        },
        {
            title: 'DPK',
            key: 'dpkToDriver',
            // width: 200,
            render: (_, record) => (
                <Paragraph style={{ margin: 0, fontSize: '12px' }}>
                    Accepted from Delivery : {formatDateTime(record.accept_dpk_from_delivery)}<br />
                    Handovered to Driver : {formatDateTime(record.ho_dpk_to_driver)}<br />
                    Accepted from Driver : {formatDateTime(record.accept_dpk_from_driver)}<br />
                    Handovered to Delivery : {formatDateTime(record.ho_dpk_to_delivery)}<br />
                </Paragraph>
            )
        },
        {
            title: 'Driver',
            key: 'driverToDpkReturn',
            // width: 200,
            render: (_, record) => (
                <Paragraph style={{ margin: 0, fontSize: '12px' }}>
                    {/* <Text type="secondary">(Data belum tersedia)</Text> */}
                    Accepted from DPK : {formatDateTime(record.accept_driver_from_dpk)}<br />
                    Handovered to DPK : {formatDateTime(record.ho_driver_to_dpk)}<br />
                </Paragraph>
            )
        },
        {
            title: 'Marketing',
            key: 'deliveryToMkt',
            // width: 300,
            render: (_, record) => (
                <Paragraph style={{ margin: 0, fontSize: '12px' }}>
                    Accepted from Delivery : {formatDateTime(record.accept_mkt_from_delivery)}<br />
                    Handovered to FAT : {formatDateTime(record.ho_mkt_to_fat)}
                </Paragraph>
            )
        },
        {
            title: 'FAT',
            key: 'mktToFAT',
            // width: 300,
            render: (_, record) => (
                <Paragraph style={{ margin: 0, fontSize: '12px' }}>
                    Accepted from MKT : {formatDateTime(record.accept_fat_from_mkt)}
                </Paragraph>
            )
        },
        {
            title: 'Action',
            key: 'action',
            width: 180,
            align: 'center',
            render: (_, record) => {
                // Panggil fungsi helper untuk menentukan status
                const state = getActionState(record, role);

                // Render komponen berdasarkan status yang didapat
                switch (state.action) {
                    case 'REQUEST_CANCEL':
                        return (
                            <Link type="danger" onClick={() => handleAction('REQUEST_CANCEL', record, state.handoverKey)} disabled={isProcessing}>
                                Request Cancel
                            </Link>
                        );
                    case 'CONFIRM_CANCEL':
                        return (
                            <Button type="primary" danger onClick={() => handleAction('CONFIRM_CANCEL', record, state.handoverKey)} disabled={isProcessing} size="small">
                                Confirm Cancel
                            </Button>
                        );
                    case 'WAITING_CONFIRMATION':
                        return <Tag color="warning">Waiting Confirmation</Tag>;
                    case 'NO_ACTION':
                    default:
                        return <Text type="secondary">-</Text>;
                }
            },
        },
        // {
        //     title: 'Status',
        //     dataIndex: columnYesNo,
        //     key: columnYesNo,
        //     // width: 100,
        //     render: (value) => (
        //         value == 'N'
        //             ? <Tag color="#faad14">
        //                 <Text strong>Waiting</Text>
        //             </Tag>
        //             : <Tag color="#d9d9d9">
        //                 <Text strong>Accepted</Text>
        //             </Tag>
        //     )
        // }
    ];

    return (
        <>
            <LayoutGlobal>
                <Table
                    columns={columns}
                    dataSource={data}
                    loading={loading}
                    pagination={pagination}
                    onChange={handleTableChange}
                />

                <Modal
                    title={`Confirm Handover (${selectedItemsForSubmit.length} items)`}
                    open={isConfirmModalOpen}
                    onOk={executeSubmit}
                    onCancel={() => setIsConfirmModalOpen(false)}
                    confirmLoading={isSubmitting}
                    okText="Submit"
                    cancelText="Cancel"
                    width={600}
                >
                    <p>Anda akan mengirimkan daftar Surat Jalan berikut. Apakah Anda yakin?</p>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #f0f0f0', padding: '8px 16px', marginTop: '16px', borderRadius: '4px' }}>
                        <ul style={{ paddingLeft: '20px' }}>
                            {selectedItemsForSubmit.map(item => (
                                <li key={item.m_inout_id}>
                                    <strong>{item.documentno}</strong>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Modal>
            </LayoutGlobal>
        </>
    );
};

export default History;