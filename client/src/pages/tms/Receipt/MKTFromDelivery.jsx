import { useEffect, useState, useMemo } from 'react';
import { CheckOutlined, CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Modal, Popover, Table, Typography, notification, Space, DatePicker, Tag } from 'antd';
import axios from 'axios';
import { DateTime } from 'luxon';
import dayjs from 'dayjs';
import LayoutGlobal from '../../../components/layouts/LayoutGlobal';
import { useSelector } from 'react-redux';
import useIsMobile from '../../../hooks/useIsMobile';
import MKTFromDeliveryMobile from './MKTFromDeliveryMobile';
import { useRef } from 'react';
import Highlighter from 'react-highlight-words';

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

const MKTFromDelivery = () => {
    const isMobile = useIsMobile();
    const user = useSelector((state) => state.auth.user);
    const userId = user.ad_user_id;

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

    // States untuk Filter
    const [searchText, setSearchText] = useState("");
    const [filterDate, setFilterDate] = useState(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [selectedBundlesForSubmit, setSelectedBundlesForSubmit] = useState([]);
    const [isModalRejectOpen, setIsModalRejectOpen] = useState(false);
    const [itemToReject, setItemToReject] = useState(null);
    const [rejectNote, setRejectNote] = useState('');

    // SEARCH
    const [searchedColumn, setSearchedColumn] = useState("");
    const searchInput = useRef(null);

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
            }
        } catch (err) {
            console.error(err);
            notification.error({ message: 'Error', description: 'Failed to fetch data' });
        } finally {
            setLoading(false);
        }
    };

    // --- LOGIC FILTERING (SEARCH + DATE HANDOVER) ---
    const filteredData = useMemo(() => {
        const lowerSearch = (searchText || "").toLowerCase();

        return data
            .map((bundle) => {
                // Filter Tanggal berdasarkan created (Date Handover)
                const matchesDate = !filterDate ||
                    dayjs(bundle.created).isSame(filterDate, 'day');

                // Filter Teks berdasarkan Bundle No, Document No, atau Customer
                const matchesBundleNo = bundle.bundleNo.toLowerCase().includes(lowerSearch);

                const matchingShipments = bundle.shipments.filter((s) =>
                    s.documentno.toLowerCase().includes(lowerSearch) ||
                    s.customer.toLowerCase().includes(lowerSearch)
                );

                const matchesSearch = !searchText || (matchesBundleNo || matchingShipments.length > 0);

                if (matchesDate && matchesSearch) {
                    return {
                        ...bundle,
                        // Jika pencarian spesifik ke SJ, hanya tampilkan SJ yang relevan di dalam bundle
                        shipments: (searchText && !matchesBundleNo) ? matchingShipments : bundle.shipments
                    };
                }
                return null;
            })
            .filter((b) => b !== null);
    }, [data, searchText, filterDate]);

    // ... (handleShipmentCheckChange, handleShipmentClickCount, handleBundleSelectionChange tetap sama)

    const handleShipmentCheckChange = (bundleNo, shipmentKey, checked) => {
        setData(prevData =>
            prevData.map(bundle => {
                if (bundle.bundleNo === bundleNo) {
                    const updatedShipments = bundle.shipments.map(shipment => {
                        if (shipment.key === shipmentKey) return { ...shipment, checked };
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
                                newChecked = false;
                                newClickCount = 0;
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

    const bundleCountSelected = filteredData.filter(b =>
        b.shipments.length > 0 && b.shipments.every(s => s.arrived)
    ).length;

    const handleOpenConfirmModal = () => {
        const selectedBundles = filteredData.filter(bundle =>
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
            const filteredPayload = selectedBundlesForSubmit.map(bundle => ({
                ...bundle,
                shipments: bundle.shipments.filter(s => s.checked)
            })).filter(bundle => bundle.shipments.length > 0);

            const res = await axios.post(`${backEndUrl}/receipt/process/mkt/from/delivery`, { data: filteredPayload }, { withCredentials: true });
            if (res.data.success) {
                notification.success({ message: 'Sukses', description: 'Data berhasil diterima.' });
                fetchData();
                setSearchText("");
                setFilterDate(null);
            }
        } catch (error) {
            console.log(error);

            notification.error({ message: 'Accept Gagal' });
        } finally {
            setIsSubmitting(false);
            setIsConfirmModalOpen(false);
            setSelectedBundlesForSubmit([]);
        }
    };

    const showModalReject = (shipment) => {
        setItemToReject(shipment);
        setRejectNote('');
        setIsModalRejectOpen(true);
    };

    const handleRejectOk = async () => {
        try {
            const payload = { ...itemToReject, notes: rejectNote };
            const res = await axios.post(`${backEndUrl}/tms/reject`, payload, { withCredentials: true });
            if (res.data.success) {
                notification.success({ message: 'Info', description: `Dokumen ${itemToReject.documentno} direject.` });
                fetchData();
            }
        } catch (error) {
            console.log(error);

            notification.error({ message: 'Reject Gagal' });
        } finally {
            setIsModalRejectOpen(false);
            setItemToReject(null);
        }
    };

    const handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        setSearchText(selectedKeys[0]);
        setSearchedColumn(dataIndex);
    };

    const handleReset = (clearFilters) => {
        clearFilters();
        setSearchText("");
    };

    const getColumnSearchProps = (dataIndex) => ({
        filterDropdown: ({
            setSelectedKeys,
            selectedKeys,
            confirm,
            clearFilters,
            close,
        }) => (
            <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
                <Input
                    ref={searchInput}
                    placeholder={`Search ${dataIndex}`}
                    value={selectedKeys[0]}
                    onChange={(e) =>
                        setSelectedKeys(e.target.value ? [e.target.value] : [])
                    }
                    onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
                    style={{ marginBottom: 8, display: "block" }}
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

                    <Button
                        onClick={() => clearFilters && handleReset(clearFilters)}
                        size="small"
                        style={{ width: 90 }}
                    >
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

                    <Button type="link" size="small" onClick={() => close()}>
                        Close
                    </Button>
                </Space>
            </div>
        ),
        filterIcon: (filtered) => (
            <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />
        ),
        onFilter: (value, record) =>
            record[dataIndex]?.toString().toLowerCase().includes(value.toLowerCase()),

        filterDropdownProps: {
            onOpenChange(open) {
                if (open) {
                    setTimeout(() => searchInput.current?.select(), 100);
                }
            },
        },

        render: (text) =>
            searchedColumn === dataIndex ? (
                <Highlighter
                    highlightStyle={{ backgroundColor: "#ffc069", padding: 0 }}
                    searchWords={[searchText]}
                    autoEscape
                    textToHighlight={text ? text.toString() : ""}
                />
            ) : (
                text
            ),
    });

    const shipmentColumns = () => [
        {
            title: 'Check', key: 'action', width: 100, render: (_, record) => (
                record.checked ?
                    <span style={{ color: '#389e0d', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => handleShipmentClickCount(record.bundleNo, record.key)}>Checked</span> :
                    <Button onClick={() => handleShipmentCheckChange(record.bundleNo, record.key, true)} icon={<CheckOutlined />} size='small' />
            )
        },
        { title: 'Document No', dataIndex: 'documentno', key: 'documentno', render: (text) => <b>{text}</b> },
        { title: 'Customer', dataIndex: 'customer', key: 'customer' },
        { title: 'Plan Time', dataIndex: 'plantime', key: 'plantime', render: (text) => text ? DateTime.fromISO(text).toFormat('dd-MM-yyyy HH:mm') : 'N/A' },
        { title: 'Action', key: 'action', width: 100, render: (_, record) => <Button onClick={() => showModalReject(record)} icon={<CloseOutlined />} size='small' danger>Reject</Button> }
    ];

    const mainColumns = [
        {
            title: '', key: 'selection', width: 50, align: 'center',
            render: (_, record) => {
                const allChecked = record.shipments.length > 0 && record.shipments.every(s => s.checked);
                const isSelected = record.shipments.length > 0 && record.shipments.every(s => s.arrived);
                return <Checkbox checked={isSelected} onChange={(e) => handleBundleSelectionChange(record.bundleNo, e.target.checked)} disabled={!allChecked} />;
            },
        },
        { title: 'No', key: 'no', width: 70, render: (_, __, index) => index + 1 },
        {
            title: 'Bundle No',
            dataIndex: 'bundleNo',
            key: 'bundleNo',
            ...getColumnSearchProps("bundleNo"),
        },
        {
            title: 'Date Handover',
            dataIndex: 'created',
            key: 'created',
            render: (text) => DateTime.fromISO(text).plus({ hours: 7 }).toFormat('dd-MM-yyyy HH:mm')
        },
        {
            title: 'Customer',
            dataIndex: 'customer',
            key: 'customer',
            ...getColumnSearchProps("customer"),
        },
        { title: 'Total Shipments', dataIndex: 'shipments', key: 'shipments_count', render: (s) => <Tag color="blue">{s.length} Docs</Tag> }
    ];

    return isMobile ? <MKTFromDeliveryMobile /> : (
        <LayoutGlobal>
            <div style={{ marginBottom: 10, background: '#fff', padding: '10px', borderRadius: '8px' }}>
                <Space size="middle">
                    <Input
                        placeholder="Cari SJ / Bundle / Customer..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ width: 350 }}
                        allowClear
                    />
                    <DatePicker
                        placeholder="Filter Tgl Handover"
                        format="DD-MM-YYYY"
                        onChange={(date) => setFilterDate(date)}
                        value={filterDate}
                        style={{ width: 200 }}
                    />
                    {(searchText || filterDate) && (
                        <Button type="link" onClick={() => { setSearchText(""); setFilterDate(null); }}>Reset</Button>
                    )}
                </Space>
            </div>

            <Table
                columns={mainColumns}
                dataSource={filteredData}
                loading={loading}
                pagination={pagination}
                onChange={(p) => setPagination(p)}
                expandable={{
                    expandedRowRender: (record) => (
                        <div style={{ padding: '12px 24px', backgroundColor: '#fafafa' }}>
                            <Table columns={shipmentColumns()} dataSource={record.shipments} pagination={false} size="small" bordered />
                        </div>
                    ),
                }}
            />

            <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Button type="primary" size="large" onClick={handleOpenConfirmModal} disabled={bundleCountSelected === 0 || isSubmitting} loading={isSubmitting}>
                    Accept ({bundleCountSelected} Selected)
                </Button>
            </div>

            {/* Modal Confirm Handover & Modal Reject sama dengan kode Anda sebelumnya */}
            <Modal
                title="Confirm Receipt"
                open={isConfirmModalOpen}
                onOk={executeSubmit}
                onCancel={() => setIsConfirmModalOpen(false)}
            >
                <p>Anda akan menyerahkan semua surat jalan dari bundle yang dipilih. Lanjutkan?</p>
            </Modal>

            <Modal
                title="Confirm Reject"
                open={isModalRejectOpen}
                onOk={handleRejectOk}
                onCancel={() => setIsModalRejectOpen(false)}
                okText="Reject"
                okButtonProps={{ danger: true }}
            >
                <p>Apakah Anda yakin akan mereject dokumen <strong>{itemToReject?.documentno}</strong>?</p>
                <div style={{ marginTop: '16px' }}>
                    <Typography.Text strong>Notes (Optional):</Typography.Text>
                    <Input.TextArea
                        rows={4}
                        placeholder="Masukkan alasan reject..."
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        style={{ marginTop: '8px' }}
                    />
                </div>
            </Modal>
        </LayoutGlobal>
    );
};

export default MKTFromDelivery;