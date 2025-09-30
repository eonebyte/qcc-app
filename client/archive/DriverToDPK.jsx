import { useEffect, useRef, useState } from 'react';
import { SearchOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { Button, Checkbox, Input, Modal, Space, Table, notification } from 'antd';
import Highlighter from 'react-highlight-words';
import axios from 'axios';
import dayjs from 'dayjs';
import LayoutGlobal from '../src/components/layouts/LayoutGlobal';

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

const DriverToDPK = () => {
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

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/tms/driver/todpk`);

            if (res.data.data && res.data.data.success) {
                const rawData = res.data.data.data;

                const flattenedData = rawData.map(item => ({
                    ...item,
                    key: item.M_INOUT_ID, // Gunakan ID unik sebagai key
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

    /**
     * Mengumpulkan item yang dipilih, lalu membuka modal konfirmasi.
     */
    const handleOpenConfirmModal = () => {
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

    /**
     * Mengeksekusi pengiriman data ke API. Dipanggil dari dalam modal.
     */
    const executeSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Mengirim data yang sudah disimpan di state
            const res = await axios.post(`${backEndUrl}/tms/delivery/todpk/handover`, { data: selectedItemsForSubmit }, { withCredentials: true });

            notification.success({
                message: 'Sukses',
                description: res.data.message || 'Handover berhasil!'
            });

            const submittedIds = new Set(selectedItemsForSubmit.map(d => d.M_INOUT_ID));
            setData(currentData =>
                currentData.filter(item => !submittedIds.has(item.M_INOUT_ID))
            );

            // Tutup modal dan reset state
            setIsConfirmModalOpen(false);
            setSelectedItemsForSubmit([]);

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

    const handleCheckArrival = (mInoutId, checked) => {
        setData(prevData =>
            prevData.map(item =>
                item.M_INOUT_ID === mInoutId ? { ...item, arrived: checked } : item
            )
        );
    };

    // Menghitung total item yang dipilih untuk ditampilkan di tombol
    const totalSelectedCount = data.filter(d => d.arrived).length;

    const handleSelectAll = (e) => {
        const { checked } = e.target;
        setData(prevData =>
            prevData.map(item => ({ ...item, arrived: checked }))
        );
    };

    const isAllSelected = data.length > 0 && totalSelectedCount === data.length;

    const columns = [
        {
            title: 'No',
            key: 'no',
            width: 70,
            align: 'center',
            render: (text, record, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1
        },
        {
            title: <Checkbox checked={isAllSelected} onChange={handleSelectAll} />,
            key: 'selection',
            width: 50,
            align: 'center',
            render: (_, record) => (
                <Checkbox
                    checked={record.arrived}
                    onChange={(e) => handleCheckArrival(record.M_INOUT_ID, e.target.checked)}
                >
                    {/* Ikon bisa ditambahkan di sini jika perlu, atau dikosongkan */}
                </Checkbox>
            ),
        },
        {
            title: 'Document No',
            dataIndex: 'DOCUMENTNO',
            key: 'DOCUMENTNO',
            ...getColumnSearchProps('DOCUMENTNO'),
        },
        {
            title: 'Customer',
            dataIndex: 'CUSTOMER',
            key: 'CUSTOMER',
            ...getColumnSearchProps('CUSTOMER')
        },
        {
            title: 'Plan Time',
            dataIndex: 'PLANTIME',
            key: 'PLANTIME',
            render: (text) => dayjs(text).format('DD/MM/YYYY HH:mm'),
        },
        {
            title: 'Status',
            dataIndex: 'arrived',
            key: 'status',
            width: 100,
            render: (arrived) => (
                arrived
                    ? <CheckCircleFilled style={{ color: '#00a854', fontSize: '18px' }} />
                    : <CloseCircleFilled style={{ color: '#f04134', fontSize: '18px' }} />
            )
        }
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

                <div style={{ marginTop: 16, padding: '10px', background: '#f0f2f5', borderTop: '1px solid #d9d9d9' }}>
                    <Button
                        type="primary"
                        onClick={handleOpenConfirmModal}
                        disabled={totalSelectedCount === 0 || isSubmitting}
                    >
                        Handover ({totalSelectedCount} Selected)
                    </Button>
                </div>

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
                                <li key={item.M_INOUT_ID}>
                                    <strong>{item.DOCUMENTNO}</strong>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Modal>
            </LayoutGlobal>
        </>
    );
};

export default DriverToDPK;