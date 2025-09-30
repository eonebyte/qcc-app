import { useEffect, useRef, useState } from 'react';
import { SearchOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { Button, Checkbox, DatePicker, Input, Space, Table, Table as AntTable, message } from 'antd';
import Highlighter from 'react-highlight-words';
import axios from 'axios';
import dayjs from 'dayjs';

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

const SJIn = () => {
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
    const searchInput = useRef(null);
    const [selectAllMap, setSelectAllMap] = useState({});

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${backEndUrl}/tms/time/in`);
            if (res.data.success) {
                const rawData = res.data.data;

                // Group by TNKB + DRIVER_NAME
                const grouped = {};

                rawData.forEach(item => {
                    const key = `${item.TNKB}-${item.DRIVER_NAME}`;
                    if (!grouped[key]) {
                        grouped[key] = {
                            key,
                            TNKB: item.TNKB,
                            DRIVER_NAME: item.DRIVER_NAME,
                            TIME_IN: item.TIME_IN,
                            details: []
                        };
                    }
                    grouped[key].details.push({
                        DOCUMENTNO: item.DOCUMENTNO,
                        M_INOUT_ID: item.M_INOUT_ID
                    });
                });

                setData(Object.values(grouped));
            } else {
                message.warning(res.data.message || 'No data found');
            }
        } catch (err) {
            message.error('Failed to fetch data');
            console.error(err);
        } finally {
            setLoading(false);
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
                    <Button
                        type="primary"
                        onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
                        icon={<SearchOutlined />}
                        size="small"
                        style={{ width: 90 }}
                    >
                        Search
                    </Button>
                    <Button onClick={() => clearFilters && handleReset(clearFilters)} size="small" style={{ width: 90 }}>
                        Reset
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        onClick={() => {
                            confirm({ closeDropdown: false });
                            setSearchText(selectedKeys[0]);
                            setSearchedColumn(dataIndex);
                        }}
                    >
                        Filter
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        onClick={() => {
                            close();
                        }}
                    >
                        Close
                    </Button>
                </Space>
            </div>
        ),
        filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
        onFilter: (value, record) =>
            record[dataIndex]?.toString().toLowerCase().includes(value.toLowerCase()),
        render: (text) =>
            searchedColumn === dataIndex ? (
                <Highlighter
                    highlightStyle={{ backgroundColor: '#ffc069', padding: 0 }}
                    searchWords={[searchText]}
                    autoEscape
                    textToHighlight={text ? text.toString() : ''}
                />
            ) : (
                text
            ),
    });

    const columns = [
        {
            title: 'No',
            key: 'no',
            render: (text, record, index) => {
                const { current, pageSize } = pagination;
                return (current - 1) * pageSize + index + 1;
            },
        },
        {
            title: 'TNKB',
            dataIndex: 'TNKB',
            key: 'TNKB',
            ...getColumnSearchProps('TNKB'),
        },
        {
            title: 'Driver',
            dataIndex: 'DRIVER_NAME',
            key: 'DRIVER_NAME',
            ...getColumnSearchProps('DRIVER_NAME'),
        },
        {
            title: 'Waktu Kembali',
            dataIndex: 'TIME_IN',
            key: 'TIME_IN',
            render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-',
            filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
                <div style={{ padding: 8 }}>
                    <DatePicker
                        value={selectedKeys[0] ? dayjs(selectedKeys[0]) : null}
                        onChange={(date) => {
                            const value = date ? date.format('YYYY-MM-DD') : null;
                            setSelectedKeys(value ? [value] : []);
                            confirm();
                        }}
                        style={{ marginBottom: 8, display: 'block' }}
                        placeholder="Filter by date"
                    />
                    <Space>
                        <Button
                            onClick={() => {
                                clearFilters();
                                confirm();
                            }}
                            size="small"
                            style={{ width: 90 }}
                        >
                            Reset
                        </Button>
                    </Space>
                </div>
            ),
            filterIcon: (filtered) => (
                <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />
            ),
            onFilter: (value, record) => {
                // Nilai TIME_IN bisa null, jadi cek dulu
                const date = record.TIME_IN ? dayjs(record.TIME_IN).format('YYYY-MM-DD') : '';
                return date === value;
            },
        }
    ];

    const handleCheckArrival = (groupKey, mInoutId, checked) => {
        setData(prevData =>
            prevData.map(group => {
                if (group.key === groupKey) {
                    const newDetails = group.details.map(detail => {
                        if (detail.M_INOUT_ID === mInoutId) {
                            return { ...detail, arrived: checked };
                        }
                        return detail;
                    });
                    return { ...group, details: newDetails };
                }
                return group;
            })
        );
    };

    return (
        <Table
            columns={columns}
            dataSource={data}
            loading={loading}
            pagination={pagination}
            onChange={handleTableChange}
            expandable={{
                expandedRowRender: (record) => {
                    const handleSubmit = () => {
                        const checkedDetails = record.details.filter(detail => detail.arrived);
                        console.log('Submit:', checkedDetails);
                        // axios.post('/api/submit-arrived', { data: checkedDetails })
                    };

                    const handleSelectAll = (checked) => {
                        // Update semua checkbox untuk record ini
                        record.details.forEach((detail) =>
                            handleCheckArrival(record.key, detail.M_INOUT_ID, checked)
                        );

                        // Update state selectAllMap
                        setSelectAllMap(prev => ({
                            ...prev,
                            [record.key]: checked
                        }));
                    };

                    const isAllChecked = selectAllMap[record.key] || false;

                    return (
                        <div style={{ padding: '12px 24px', background: '#fafafa', borderRadius: 6 }}>
                            <div style={{
                                display: 'flex',
                                fontWeight: 600,
                                marginBottom: 8,
                                borderBottom: '1px solid #ddd',
                                paddingBottom: 4,
                                alignItems: 'center'
                            }}>
                                <div style={{ flex: 2 }}>No. SJ</div>
                                <div style={{ flex: 3 }}>
                                    <Checkbox checked={isAllChecked} onChange={(e) => handleSelectAll(e.target.checked)}>
                                        Receipt All
                                    </Checkbox>
                                </div>
                            </div>

                            {record.details.map((detail) => (
                                <div
                                    key={detail.M_INOUT_ID}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '6px 0',
                                        borderBottom: '1px dashed #eee',
                                    }}
                                >
                                    <div style={{ flex: 2 }}>{detail.DOCUMENTNO}</div>
                                    <div style={{ flex: 3 }}>
                                        <Checkbox
                                            checked={detail.arrived || false}
                                            onChange={(e) =>
                                                handleCheckArrival(record.key, detail.M_INOUT_ID, e.target.checked)
                                            }
                                        >
                                            {detail.arrived
                                                ? <CheckCircleFilled style={{ color: '#00a854' }} />
                                                : <CloseCircleFilled style={{ color: '#f04134' }} />}
                                        </Checkbox>
                                    </div>
                                </div>
                            ))}

                            <div style={{ marginTop: 16, textAlign: 'left' }}>
                                <Button type="primary" onClick={handleSubmit}>
                                    Receipt
                                </Button>
                            </div>
                        </div>
                    );
                }
            }}
        />

    );
};

export default SJIn;
