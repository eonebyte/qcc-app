import React, { useState, useEffect } from 'react';
import { Table, Steps, Typography, Spin, Modal, Button, Timeline, Input, Space } from 'antd';
import {
    HourglassOutlined,
    FileTextOutlined,
    CarOutlined,
    AuditOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    SearchOutlined
} from '@ant-design/icons';
import './ProgressShipment.css';
import LayoutGlobal from '../../components/layouts/LayoutGlobal';
import { useRef } from 'react';
import Highlighter from 'react-highlight-words';

const { Title, Text } = Typography;

const formatDateTime = (isoString) => {
    if (!isoString) return null;
    try {
        const date = new Date(isoString);

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0'); // bulan mulai dari 0
        const year = date.getFullYear();

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}-${month}-${year} ${hours}:${minutes}`;
    } catch (error) {
        console.error("Invalid date format:", error);
        return null;
    }
};


const formatTime = (isoString) => {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        return date.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    } catch (error) {
        console.error("Invalid date format:", error);
        return '-';
    }
};

const stepDefinitions = [
    { title: 'Delivery', icon: <HourglassOutlined />, handoverKey: 'ho_delivery_to_dpk', handoverByKey: 'ho_delivery_to_dpkby_name', acceptKey: 'accept_dpk_from_delivery', acceptByKey: 'accept_dpk_from_deliveryby_name', preHandoverText: 'Handover ke DPK', postHandoverText: 'Menunggu Accept DPK' },
    { title: 'DPK', icon: <FileTextOutlined />, handoverKey: 'ho_dpk_to_driver', handoverByKey: 'ho_dpk_to_driverby_name', acceptKey: 'accept_driver_from_dpk', acceptByKey: 'accept_driver_from_dpkby_name', preHandoverText: 'Handover ke Driver', postHandoverText: 'Menunggu Accept Driver' },
    { title: 'Driver', icon: <CarOutlined />, handoverKey: 'ho_driver_to_dpk', handoverByKey: 'ho_driver_to_dpkby_name', acceptKey: 'accept_dpk_from_driver', acceptByKey: 'accept_dpk_from_driverby_name', preHandoverText: 'Handover ke DPK', postHandoverText: 'Menunggu Accept DPK' },
    { title: 'DPK', icon: <FileTextOutlined />, handoverKey: 'ho_dpk_to_delivery', handoverByKey: 'ho_dpk_to_deliveryby_name', acceptKey: 'accept_delivery_from_dpk', acceptByKey: 'accept_delivery_from_dpkby_name', preHandoverText: 'Handover ke Delivery', postHandoverText: 'Menunggu Accept Delivery' },
    { title: 'Delivery', icon: <HourglassOutlined />, handoverKey: 'ho_delivery_to_mkt', handoverByKey: 'ho_delivery_to_mktby_name', acceptKey: 'accept_mkt_from_delivery', acceptByKey: 'accept_mkt_from_deliveryby_name', preHandoverText: 'Handover ke Marketing', postHandoverText: 'Menunggu Accept Marketing' },
    { title: 'Marketing', icon: <AuditOutlined />, handoverKey: 'ho_mkt_to_fat', handoverByKey: 'ho_mkt_to_fatby_name', acceptKey: 'accept_fat_from_mkt', acceptByKey: 'accept_fat_from_mktby_name', preHandoverText: 'Handover ke FAT', postHandoverText: 'Menunggu Accept FAT' },
    { title: 'FAT', icon: <CheckCircleOutlined />, isFinal: true, acceptKey: 'accept_fat_from_mkt', acceptByKey: 'accept_fat_from_mktby_name' }
];

const headerSteps = stepDefinitions.map(step => ({ title: step.title }));

const ProgressShipment = () => {
    // State
    const [shipmentData, setShipmentData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 20,
        total: 0
    });
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [timelineData, setTimelineData] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('');
    const searchInput = useRef(null);

    const showTimelineModal = (record) => {
        setTimelineData({ docNo: record.docNo, flow: record.flow });
        setIsModalVisible(true);
    };

    const handleModalClose = () => {
        setIsModalVisible(false);
        setTimelineData(null);
    };

    // transformApiData menerima page & pageSize supaya nomor (no) selalu sesuai
    const transformApiData = (apiData = [], page = 1, pageSize = 20) => {
        if (!Array.isArray(apiData) || apiData.length === 0) return [];

        const startIndex = (page - 1) * pageSize;
        return apiData.map((item, dataIndex) => {
            // aman-in property names: terima berbagai variasi huruf besar/kecil
            const id = item.m_inout_id || item.M_INOUT_ID || item.adw_trackingsj_id || item.id || (dataIndex + startIndex + 1);
            const documentno = item.documentno || item.documentno || item.documentno || item.docNo || '';
            const customer = item.customer;

            const flow = stepDefinitions.map((step, stepIndex) => {
                const handoverTimestamp = item[step.handoverKey];
                const acceptTimestamp = item[step.acceptKey];
                const prevStep = stepIndex > 0 ? stepDefinitions[stepIndex - 1] : null;
                const isPrevStepAccepted = prevStep ? !!item[prevStep.acceptKey] : true;

                let status = 'pending', displayValue = 'Menunggu', displayTime = '-';

                if (acceptTimestamp) {
                    status = 'completed';
                    displayValue = 'Selesai';
                    displayTime = formatTime(handoverTimestamp) + " / " + formatTime(acceptTimestamp);
                } else if (isPrevStepAccepted) {
                    status = 'in_progress';
                    if (handoverTimestamp) {
                        displayValue = step.postHandoverText;
                        displayTime = formatTime(handoverTimestamp);
                    } else {
                        displayValue = step.preHandoverText;
                        displayTime = prevStep ? formatTime(item[prevStep.acceptKey]) : '-';
                    }
                }

                if (step.isFinal && acceptTimestamp) {
                    status = 'completed';
                    displayValue = 'Selesai';
                    displayTime = formatTime(acceptTimestamp);
                }

                const rawData = {
                    handoverTime: item[step.handoverKey],
                    handoverBy: item[step.handoverByKey],
                    acceptTime: item[step.acceptKey],
                    acceptBy: item[step.acceptByKey]
                };

                return {
                    title: step.title,
                    status,
                    value: displayValue,
                    time: displayTime,
                    icon: step.icon,
                    rawData
                };
            });

            return {
                key: String(id),
                m_inout_id: id,
                no: startIndex + dataIndex + 1,
                docNo: documentno,
                customer: customer,
                flow
            };
        });
    };

    const fetchData = async (params = {}) => {
        setLoading(true);
        try {
            const { current, pageSize } = params.pagination || pagination;

            const response = await fetch(`http://localhost:3200/api/v1/tms/history?page=${current}&limit=${pageSize}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();

            console.log('Raw API response:', result);


            // Robust parsing: terima banyak bentuk response
            let payload = [];
            let meta = {};

            // candidate arrays in preference order
            const candidates = [
                result?.data?.data,
                result?.data,
                result?.items,
                result?.result,
                result
            ];

            for (const c of candidates) {
                if (Array.isArray(c)) {
                    payload = c;
                    break;
                }
            }

            // attempt to find meta/total
            meta = result?.data?.meta || result?.meta || result?.pagination || {};

            // fallback if payload still empty (safeguard)
            if (!Array.isArray(payload)) payload = [];

            const transformed = transformApiData(payload, current, pageSize);

            console.log('transformed data:', transformed);

            setShipmentData(transformed);

            // determine total count from various possible keys
            const totalFromMeta = meta?.total || meta?.count || result?.total || 0;

            setPagination(prev => ({
                ...prev,
                current: meta?.current_page || current,
                pageSize: meta?.per_page || pageSize,
                total: Number(totalFromMeta)
            }));
        } catch (error) {
            console.error("Gagal mengambil data dari API:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleTableChange = (pag, filters, sorter) => {
        fetchData({ pagination: pag, filters, sorter });
    };

    useEffect(() => {
        // initial load
        fetchData({ pagination });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        setSearchText(selectedKeys[0]);
        setSearchedColumn(dataIndex);
    };

    const handleReset = (clearFilters) => {
        clearFilters();
        setSearchText('');
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
        { title: 'No', dataIndex: 'no', key: 'no' },
        { title: 'Customer', dataIndex: 'customer', key: 'customer', ...getColumnSearchProps('customer') },
        { title: 'No. Dokumen', dataIndex: 'docNo', key: 'docNo', ...getColumnSearchProps('docNo') },
        {
            title: (<Steps initial={1} size='small' progressDot items={headerSteps} className="timeline-header-steps" />),
            dataIndex: 'flow',
            key: 'flow',
            render: (flow, record) => {
                const currentStepIndex = flow.findIndex(step => step.status === 'in_progress');
                const stepItems = flow.map(step => {
                    let antdStatus, valueColor, finalIcon;
                    if (step.status === 'completed') {
                        antdStatus = 'finish';
                        valueColor = '#389e0d';
                        finalIcon = <CheckCircleOutlined style={{ color: valueColor }} />;
                    } else if (step.status === 'in_progress') {
                        antdStatus = 'process';
                        valueColor = '#1890ff';
                        // jangan render Spin untuk semua baris besar jika performance jadi issue
                        finalIcon = <Spin indicator={React.cloneElement(step.icon, { style: { fontSize: '18px', color: valueColor }, spin: true })} />;
                    } else {
                        antdStatus = 'wait';
                        valueColor = 'rgba(0, 0, 0, 0.45)';
                        finalIcon = React.cloneElement(step.icon, { style: { color: 'rgba(0, 0, 0, 0.25)' } });
                    }
                    return {
                        status: antdStatus,
                        icon: finalIcon,
                        title: (<>{step.title}</>),
                        description: (
                            <Button
                                type="link"
                                size="small"
                                style={{ padding: 0, height: 'auto', lineHeight: 'inherit', textAlign: 'left' }}
                                onClick={() => showTimelineModal(record)}
                            >
                                <Text strong className="step-value" style={{ color: valueColor }}>
                                    {step.value || 'Menunggu'}
                                </Text>
                            </Button>
                        ),
                    };
                });
                return <Steps size="small" current={currentStepIndex} items={stepItems} labelPlacement="vertical" className="compact-timeline-steps" />;
            },
        },
    ];

    return (
        <LayoutGlobal>
            <div style={{ padding: 10 }}>
                <Title level={4}>Progress Pengiriman Dokumen</Title>
                <Table
                    className="surat-jalan-table"
                    columns={columns}
                    dataSource={shipmentData}
                    pagination={{
                        ...pagination,
                        showSizeChanger: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total}`
                    }}
                    loading={loading}
                    onChange={handleTableChange}
                    bordered
                    scroll={{ x: 'max-content' }}
                    rowKey={(record) => record.m_inout_id || record.key}
                />

                {timelineData && (
                    <Modal
                        title={`Timeline Dokumen: ${timelineData.docNo}`}
                        open={isModalVisible}
                        onCancel={handleModalClose}
                        footer={[<Button key="close" onClick={handleModalClose}>Tutup</Button>]}
                        width={600}
                    >
                        <Timeline mode="left" style={{ paddingLeft: 0 }}>
                            {[...timelineData.flow].reverse().map((step, index) => {
                                const handoverTime = formatDateTime(step.rawData.handoverTime);
                                const acceptTime = formatDateTime(step.rawData.acceptTime);

                                if (!handoverTime && !acceptTime) return null;

                                return (
                                    <Timeline.Item
                                        key={index}
                                        dot={<ClockCircleOutlined />}
                                    >
                                        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{step.title}</div>

                                        {(handoverTime || acceptTime) && (
                                            <div style={{ display: 'flex', gap: '16px' }}>
                                                {handoverTime && (
                                                    <span>
                                                        <strong>Ho:</strong> {handoverTime}
                                                        {step.rawData.handoverBy && ` by ${step.rawData.handoverBy}`}
                                                    </span>
                                                )}
                                                {handoverTime && acceptTime && <span> - </span>}
                                                {acceptTime && (
                                                    <span>
                                                        <strong>Receipt:</strong> {acceptTime}
                                                        {step.rawData.acceptBy && ` by ${step.rawData.acceptBy}`}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </Timeline.Item>

                                );
                            })}
                        </Timeline>

                    </Modal>
                )}
            </div>
        </LayoutGlobal>
    );
};

export default ProgressShipment;
