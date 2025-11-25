import { useEffect, useRef, useState } from 'react';
import { SearchOutlined, CheckCircleFilled, CloseCircleFilled, RollbackOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Modal, Space, Table, Tag, Typography, notification } from 'antd';
import Highlighter from 'react-highlight-words';
import axios from 'axios';
import { DateTime } from 'luxon';
import LayoutGlobal from '../../components/layouts/LayoutGlobal';
import { useSelector } from 'react-redux';
const { Text } = Typography;
const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';
const ReceiptDesktop = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user.title;
    const userId = user.ad_user_id;

    console.log('user id : ', userId);


    // State untuk fungsionalitas tabel & pencarian
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('');
    const [data, setData] = useState([]);
    const [dataFatFinish, setDataFatFinish] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
    const searchInput = useRef(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [selectedItemsForSubmit, setSelectedItemsForSubmit] = useState([]);
    const [isModalRejectOpen, setIsModalRejectOpen] = useState(false);


    useEffect(() => {
        fetchData();
    }, []);

    const getRecipientTo = (checkpoinId) => {
        switch (String(checkpoinId)) { // Menggunakan String() agar aman jika nilainya angka atau teks
            case '6':
                return 'DRIVER';
            case '8':
                return 'DPK';
            case '2':
                return 'DELIVERY';
            case '10':
                return 'DELIVERY';
            case '14':
                return 'FAT';
            default:
                return 'DPK'; // Untuk semua nilai lain yang tidak cocok
        }
    };


    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/tms/receipt?role=${role}`);

            if (res.data.data && res.data.data.success) {
                const rawData = res.data.data.data;


                let flattenedData = rawData.map(item => ({
                    ...item,
                    key: item.m_inout_id,
                    arrived: false,
                    to: getRecipientTo(item.checkpoin_id),
                })).filter(item => {
                    if (Number(item.checkpoin_id) === 12) {
                        return !!item.sppno; // wajib ada sppno kalau checkpoint 11
                    }
                    if (Number(item.checkpoin_id) === 4) {
                        return item.driverby === userId;
                    }
                    return true;
                });

                // //saat dpk menyerahkan ke driver di receipt driver hanya muncul apa yg dia terima
                // const flattenedData = rawData.map(item => ({
                //     ...item,
                //     key: item.m_inout_id,
                //     arrived: false
                // }))
                //     // checkpoin_id "4" yaitu saat dpk pertama kali menyerahkan ke driver
                //     // - Jika checkpoin_id == "4", ambil hanya yang driverBy sama dengan userId
                //     // - Jika checkpoin_id bukan "4", ambil semua
                //     .filter(item => {
                //         if (item.checkpoin_id == "4") {
                //             return item.driverby === userId;
                //         }

                //         return true;
                //     });
                // setData(flattenedData);


                // 🔹 Pisahkan data checkpoint 11 & lainnya
                const dataCheckpoint12 = flattenedData.filter(item => Number(item.checkpoin_id) === 12);
                const dataLain = flattenedData.filter(item => Number(item.checkpoin_id) !== 12);

                // 🔹 Distinct hanya untuk checkpoint 11 (berdasarkan sppno)
                const distinctCheckpoint12 = Array.from(
                    new Map(dataCheckpoint12.map(item => [item.sppno, item])).values()
                );

                // 🔹 Gabungkan lagi
                const finalData = [...distinctCheckpoint12, ...dataLain];


                setDataFatFinish(dataCheckpoint12);
                setData(finalData);



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

    console.log('this data : ', data);

    const getDocumentNoColumn = () => {
        if (role === 'fat') {
            return {
                title: 'SPP No',
                dataIndex: 'sppno', // Ganti ke sppno jika role marketing
                key: 'sppno',
                ...getColumnSearchProps('sppno'), // Pastikan ini juga sesuai dengan sppno
            };
        }
        return {
            title: 'Document No',
            dataIndex: 'documentno',
            key: 'documentno',
            ...getColumnSearchProps('documentno'),
        };
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

    const determineToActor = (checkpointId) => {
        return checkpointId;
    };

    const executeSubmit = async () => {
        if (selectedItemsForSubmit.length === 0) {
            notification.warning({ message: 'Tidak ada item dipilih.' });
            return;
        }

        // 2. Ambil checkpoint dari item pertama dan tentukan toActor
        const firstItem = selectedItemsForSubmit[0];
        const targetCheckpointId = firstItem.checkpoin_id; // Pastikan nama kolom ini benar!
        const checkpoint = determineToActor(targetCheckpointId);

        // 3. Validasi apakah (checkpoint dikenali)
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
            let payload = { data: selectedItemsForSubmit }


            if (checkpoint === '12' && dataFatFinish.length > 0) {
                const dataFat = dataFatFinish.filter(item => item.sppno === payload.data[0].sppno);
                payload.data = dataFat;
            }



            // Mengirim data yang sudah disimpan di state
            const res = await axios.post(`${backEndUrl}/tms/accepted?&checkpoint=${checkpoint}`, payload, { withCredentials: true });

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

    const handleCheckArrival = (mInoutId, checked) => {
        setData(prevData =>
            prevData.map(item =>
                item.m_inout_id === mInoutId ? { ...item, arrived: checked } : item
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
            title: 'From',
            key: 'to',
            dataIndex: 'to',
            width: 70,
            align: 'center',
            ...getColumnSearchProps('to'),
        },
        {
            title: <Checkbox
                checked={isAllSelected}
                onChange={handleSelectAll}
            />,
            key: 'selection',
            width: 50,
            align: 'center',
            render: (_, record) => (
                <Checkbox
                    checked={record.arrived}
                    onChange={(e) => handleCheckArrival(record.m_inout_id, e.target.checked)}
                />
            ),
        },
        getDocumentNoColumn(),
        // {
        //     title: 'Document No',
        //     dataIndex: 'documentno',
        //     key: 'documentno',
        //     ...getColumnSearchProps('documentno'),
        // },
        {
            title: 'Customer',
            dataIndex: 'customer',
            key: 'customer',
            ...getColumnSearchProps('customer'),
        },
        // {
        //     title: 'Status',
        //     dataIndex: '',
        //     key: '',
        //     width: 100,
        //     render: () => (
        //         < Tag color="#faad14" >
        //             <Text strong>Waiting</Text>
        //         </Tag >
        //     )
        // },
        {
            title: 'Action',
            dataIndex: 'arrived',
            key: 'status',
            width: 100,
            render: (_, record) => {
                console.log('record : ', record);

                return (
                    <Button onClick={showModalReject} icon={<CloseOutlined />} size='small' color='danger' variant='outlined'>
                        Reject
                    </Button>
                )
            }
        }
    ];

    const showModalReject = () => {
        setIsModalRejectOpen(true);
    };

    const handleRejectOk = () => {
        setIsModalRejectOpen(false);
    };
    const handleRejectCancel = () => {
        setIsModalRejectOpen(false);
    };

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
                        color="cyan"
                        variant="solid"
                        onClick={handleOpenConfirmModal}
                        disabled={totalSelectedCount === 0 || isSubmitting}
                    >
                        Accept ({totalSelectedCount} Selected)
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
                                <li key={item.m_inout_id}>
                                    <strong>{item.documentno}</strong>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Modal>

                <Modal
                    title="Confirm Reject"
                    closable={{ 'aria-label': 'Custom Close Button' }}
                    open={isModalRejectOpen}
                    onOk={handleRejectOk}
                    onCancel={handleRejectCancel}
                >
                    <p>are you sure to reject this document ?</p>
                </Modal>
            </LayoutGlobal>
        </>
    );
};
export default ReceiptDesktop;