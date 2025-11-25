import { useEffect, useMemo, useRef, useState } from 'react';
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

    fat: {
        buttonText: 'Handover',
        modalTitle: 'Confirm Handover',
        buildPayload: (items) => ({ data: items }), // Payload lebih sederhana
    },

    // Tambahkan konfigurasi untuk role lain (mkt, fat) jika diperlukan
};


const Outstanding = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user.title;

    const configHandover = HANDOVER_CONFIGS[role];


    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
    const searchInput = useRef(null);


    useEffect(() => {
        fetchData();
    }, [role]);


    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/tms/outstanding?role=${role}`);

            if (res.data.data && res.data.data.success) {
                const rawData = res.data.data.data;


                let flattenedData = rawData.map(item => ({
                    ...item,
                    key: item.m_inout_id,
                    arrived: false,
                }))
                // .filter(item => {
                //     if (Number(item.checkpoin_id) === 11) {
                //         return !!item.sppno; // wajib ada sppno kalau checkpoint 11
                //     }
                //     return true;
                // });

                // // 🔹 Pisahkan data checkpoint 11 & lainnya
                // const dataCheckpoint11 = flattenedData.filter(item => Number(item.checkpoin_id) === 11);
                // const dataLain = flattenedData.filter(item => Number(item.checkpoin_id) !== 11);

                // // 🔹 Distinct hanya untuk checkpoint 11 (berdasarkan sppno)
                // const distinctCheckpoint11 = Array.from(
                //     new Map(dataCheckpoint11.map(item => [item.sppno, item])).values()
                // );

                // // 🔹 Gabungkan lagi
                // const finalData = [...distinctCheckpoint11, ...dataLain];

                // console.log('final data : ', finalData);

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

    const displayedData = useMemo(() => { // <--- Perubahan di sini
        if (!searchText || !searchedColumn) { // Periksa juga searchedColumn
            return data;
        }
        // Pastikan logic onFilter sama dengan yang di getColumnSearchProps
        return data.filter(record =>
            record[searchedColumn]?.toString().toLowerCase().includes(searchText.toLowerCase())
        );
    }, [data, searchText, searchedColumn]);


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

    const getDocumentNoColumn = () => {
        if (role === 'fat' || role === 'marketing') {
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

    // const getPlanTimeColumn = () => {
    //     if (role === 'fat') {
    //         return {
    //         };
    //     }
    //     return {
    //         title: 'Plan Time',
    //         dataIndex: 'planTime',
    //         key: 'planTime',
    //         render: (text) => dayjs(text).format('DD/MM/YYYY HH:mm'),
    //     };
    // };




    const columns = [
        {
            title: 'No',
            key: 'no',
            width: 70,
            align: 'center',
            render: (text, record, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1
        },
        ...getDocumentNoColumn(),
        {
            title: 'Customer',
            dataIndex: 'customer',
            key: 'customer',
            ...getColumnSearchProps('customer')
        },
        // getPlanTimeColumn(),
        {
            title: 'Plan Time',
            dataIndex: 'plantime',
            key: 'plantime',
            render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-',
        },
        {
            title: 'Driver',
            dataIndex: 'drivername',
            key: 'drivername',
            render: (text) => text ? text : '-',
        }
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
                    dataSource={displayedData}
                    loading={loading}
                    pagination={pagination}
                    onChange={handleTableChange}
                    rowKey="key"
                />

                {/* <div style={{ marginTop: 16, padding: '10px', background: '#f0f2f5', borderTop: '1px solid #d9d9d9' }}>
                </div> */}
            </LayoutGlobal>
        </>
    );
};

export default Outstanding;