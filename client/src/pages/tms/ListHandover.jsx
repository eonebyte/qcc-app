import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchOutlined, CheckCircleFilled, CloseCircleFilled, RollbackOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Modal, Select, Space, Table, notification } from 'antd';
import Highlighter from 'react-highlight-words';
import axios from 'axios';
import dayjs from 'dayjs';
import LayoutGlobal from '../../components/layouts/LayoutGlobal';
import { useSelector } from 'react-redux';
import LocationComponent from '../../components/LocationComponent';
import { useNavigate } from 'react-router-dom';

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
    const navigate = useNavigate();
    const [api, contextHolder] = notification.useNotification();
    const openNotificationWithIcon = (type, res) => {
        console.log('res : ', res);

        api[type]({
            message: 'Handover Success',
            description: (
                <span
                    style={{ fontWeight: "bold", cursor: "pointer", color: "#1677ff" }}
                    onClick={() => navigate(`/history/detail?documentno=${res.data.data.bundleNo}`)}
                >
                    {res.data.data.bundleNo}
                </span>
            )
            // navigate('/history')
            // 'This is the content of the notification. This is the content of the notification. This is the content of the notification.',
        });
    };

    const user = useSelector((state) => state.auth.user);
    const role = user.title;

    const configHandover = HANDOVER_CONFIGS[role];

    const coordinates = useSelector((state) => state.location.coordinates);




    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('');
    const [data, setData] = useState([]);
    const [dataMktToFat, setDataMktToFat] = useState([]);
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
    const [fieldTo, setFieldTo] = useState([]);

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

                let flattenedData = rawData.map(item => ({
                    ...item,
                    key: item.m_inout_id,
                    arrived: false,
                    to: getRecipientTo(item.checkpoin_id, item.arrivedat_customer),
                }))
                // .filter(item => {
                //     if (Number(item.checkpoin_id) === 11) {
                //         return !!item.sppno; // wajib ada sppno kalau checkpoint 11
                //     }
                //     return true;
                // });

                // 🔹 Pisahkan data checkpoint 11 & lainnya
                const dataCheckpoint11 = flattenedData.filter(item => Number(item.checkpoin_id) === 11);
                const dataLain = flattenedData.filter(item => Number(item.checkpoin_id) !== 11);

                // 🔹 Distinct hanya untuk checkpoint 11 (berdasarkan sppno)
                const distinctCheckpoint11 = Array.from(
                    new Map(dataCheckpoint11.map(item => [item.sppno, item])).values()
                );


                const distincTo = Array.from(
                    new Map(flattenedData.map(item => [item.to, item])).values()
                ).map(item => ({
                    text: item.to,
                    value: item.to
                }));


                setFieldTo(distincTo);

                // 🔹 Gabungkan lagi
                const finalData = [...distinctCheckpoint11, ...dataLain];

                setDataMktToFat(dataCheckpoint11);
                setData(finalData);
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

    const determineIsArrivedCustomer = (arrivedStatus) => {
        return arrivedStatus;
    };

    let targetCheckpointId = null;
    let tArrivedState = null;
    let checkpointModal = null;
    let isArrivedCustomer = null;

    // Hanya hitung jika ada item yang dipilih
    if (selectedItemsForSubmit.length > 0) {
        const firstItem = selectedItemsForSubmit[0];
        targetCheckpointId = firstItem.checkpoin_id;
        tArrivedState = firstItem.arrivedat_customer;
        checkpointModal = determineToActor(targetCheckpointId);
        isArrivedCustomer = determineIsArrivedCustomer(tArrivedState);

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
            let payload = configHandover.buildPayload(selectedItemsForSubmit, selectedDriverId, selectedTnkbId);

            // Jika checkpoint 11 =  proses dari Mkt ke FAT, filter data berdasarkan sppno yang dipilih
            // console.log(checkpoint);

            if (checkpoint === '11' && dataMktToFat.length > 0) {
                const dataMkt = dataMktToFat.filter(item => item.sppno === payload.data[0].sppno);
                payload.data = dataMkt;
            }

            console.log('arrived state : ', isArrivedCustomer);


            const submitUrl = `${backEndUrl}/tms/handover?checkpoint=${checkpoint}&isarrived=${isArrivedCustomer}`;

            //Wajib isi location saat driver sampai di customer
            if (isArrivedCustomer === 'N' && checkpointModal === '5') {
                for (const pData of payload.data) {
                    pData.lat_customer = coordinates.latitude
                    pData.long_customer = coordinates.longitude
                }
            }


            const res = await axios.post(submitUrl, payload, { withCredentials: true });



            openNotificationWithIcon('success', res)

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
            // if (checkpointModal === 1) {
            //     navigate('/history')
            // }
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
        // setSearchedColumn('');
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

    // const handleSelectAll = (e) => {
    //     const { checked } = e.target;
    //     setData(prevData =>
    //         prevData.map(item => ({ ...item, arrived: checked }))
    //     );
    // };

    // const isAllSelected = data.length > 0 && totalSelectedCount === data.length;


    const displayedData = useMemo(() => { // <--- Perubahan di sini
        if (!searchText || !searchedColumn) { // Periksa juga searchedColumn
            return data;
        }
        // Pastikan logic onFilter sama dengan yang di getColumnSearchProps
        return data.filter(record =>
            record[searchedColumn]?.toString().toLowerCase().includes(searchText.toLowerCase())
        );
    }, [data, searchText, searchedColumn]);

    const handleSelectAll = (e) => { // <--- Perubahan di sini
        const { checked } = e.target;

        setData(prevData => {
            // Buat Set berisi ID dari item yang *saat ini terlihat* (difilter)
            const visibleItemIds = new Set(displayedData.map(item => item.m_inout_id));

            return prevData.map(item => {
                // Jika item adalah bagian dari data yang terlihat, update status 'arrived'
                if (visibleItemIds.has(item.m_inout_id)) {
                    return { ...item, arrived: checked };
                }
                // Jika tidak, biarkan statusnya seperti semula
                return item;
            });
        });
    };

    // Tentukan apakah semua item yang *terlihat* saat ini sudah dipilih
    const isAllSelected = displayedData.length > 0 && displayedData.every(item => item.arrived);

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

    const getRecipientTo = (checkpoinId, arrivedState) => {
        const key = `${String(checkpoinId)}-${String(arrivedState)}`;

        switch (key) { // Menggunakan String() agar aman jika nilainya angka atau teks
            case '3-N':
                return 'DRIVER';
            case '5-N':
                return 'CUSTOMER';
            case '5-Y':
                return 'DPK';
            case '7-Y':
                return 'DELIVERY';
            case '9-Y':
                return 'MKT';
            case '11-Y':
                return 'FAT';
            default:
                return 'DPK'; // Untuk semua nilai lain yang tidak cocok
        }
    };

    const getDocumentNoColumn = () => {
        if (role === 'marketing') {
            return [
                {
                    title: 'Document No',
                    dataIndex: 'documentno',
                    key: 'documentno',
                    ...getColumnSearchProps('documentno'),
                },
                {
                    title: 'SPP No',
                    dataIndex: 'sppno',
                    key: 'sppno',
                    ...getColumnSearchProps('sppno'),
                }
            ];
        } else {
            // Jika bukan marketing, misalnya hanya 1 kolom Document No saja
            return [
                {
                    title: 'Document No',
                    dataIndex: 'documentno',
                    key: 'documentno',
                    ...getColumnSearchProps('documentno'),
                }
            ];
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
            dataIndex: 'to',
            width: 70,
            align: 'center',
            filters: fieldTo,
            onFilter: (value, record) => record.address.startsWith(value),
            filterSearch: true,
            // ...getColumnSearchProps('to'),
        },
        {
            title: <Checkbox checked={isAllSelected} onChange={handleSelectAll} />,
            key: 'selection',
            width: 50,
            align: 'center',
            render: (_, record) => {
                // Checkpoin jika sppno kosong tidak bisa dicentang dari mkt ke fat
                return (
                    <Checkbox
                        disabled={record.checkpoin_id === '11' ? record.sppno ? false : true : false}
                        checked={record.arrived}
                        onChange={(e) => handleCheckArrival(record.m_inout_id, e.target.checked)}
                    >
                        {/* Ikon bisa ditambahkan di sini jika perlu, atau dikosongkan */}
                    </Checkbox>
                )
            },
        },
        ...getDocumentNoColumn(),
        {
            title: 'Customer',
            dataIndex: 'customer',
            key: 'customer',
            ...getColumnSearchProps('customer')
        },
        {
            title: 'Plan Time',
            dataIndex: 'plantime',
            key: 'plantime',
            render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-',
        },
        {
            title: 'Action',
            dataIndex: 'arrived',
            key: 'status',
            width: 100,
            render: (_, record) => {
                console.log('record : ', record);

                if (record.checkpoin_id == '5' && record.arrivedat_customer == 'N') {
                    return '-'
                }

                return (
                    <Button icon={<RollbackOutlined />} size='small' color='danger' variant='solid'>
                        Return
                    </Button>
                )
            }
        }
    ];


    return (
        <>
            {contextHolder}
            <LayoutGlobal>
                {/* --- PERUBAHAN 6: Properti `expandable` dihapus dari Tabel --- */}
                <Table
                    columns={columns}
                    dataSource={displayedData}
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
                        disabled: checkpointModal === '3' && (!selectedDriverId || !selectedTnkbId) || (checkpointModal === '5' && coordinates == null && isArrivedCustomer === 'N')
                    }}
                >
                    <p>Apakah Anda yakin akan menyerahkan daftar Surat Jalan berikut ?</p>
                    {checkpointModal === '5' && isArrivedCustomer == 'N' ? <LocationComponent /> : null}
                    <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #f0f0f0', padding: '8px 16px', marginTop: '16px', borderRadius: '4px' }}>
                        <ol style={{ paddingLeft: '20px' }}>
                            {checkpointModal === '11' ?
                                dataMktToFat.map(item => {
                                    if (item.sppno === selectedItemsForSubmit[0].sppno) {
                                        return (<li key={item.m_inout_id}>
                                            <strong>{item.documentno}</strong> ({item.customer})
                                        </li>)
                                    }
                                })
                                :
                                selectedItemsForSubmit.map(item => (
                                    <li key={item.m_inout_id}>

                                        <strong>{item.documentno}</strong> ({item.customer})
                                    </li>
                                ))
                            }
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

export default ListHandover;