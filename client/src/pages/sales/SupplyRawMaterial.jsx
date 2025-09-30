import { useEffect, useState, useRef } from 'react';
import { Button, DatePicker, Input, Space, Table, message } from 'antd';
import axios from 'axios';
import { FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import Highlighter from 'react-highlight-words';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const { RangePicker } = DatePicker;

const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';

const SupplyRawMaterial = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
    const [searchText, setSearchText] = useState('');
    const [searchedColumn, setSearchedColumn] = useState('');
    const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
    const searchInput = useRef(null);

    useEffect(() => {
        fetchData();
    }, []);

    // Fungsi fetchData sudah benar dan tidak perlu diubah lagi
    const fetchData = async () => {
        setLoading(true);
        try {
            const [startDate, endDate] = dateRange || [];
            const res = await axios.get(`${backEndUrl}/order/supply-rm`, {
                params: {
                    startDate: startDate ? startDate.format('YYYY-MM-DD') : null,
                    endDate: endDate ? endDate.format('YYYY-MM-DD') : null
                }
            });

            const rawData = Array.isArray(res.data) ? res.data : res.data.data || [];
            const dailyAggregator = new Map();

            rawData.forEach(rm => {
                const baseInfo = {
                    rmKey: rm.rmKey,
                    rmName: rm.rmName,
                    ListFG: rm.ListFG || []
                };

                rm.supplies?.forEach(supply => {
                    const dateKey = dayjs(supply.movementDate).format('YYYY-MM-DD');
                    const groupKey = `${rm.rmKey}|${dateKey}`;
                    if (!dailyAggregator.has(groupKey)) {
                        dailyAggregator.set(groupKey, { ...baseInfo, key: groupKey, movementDate: dateKey, supplyProductionQtyKg: 0, returnProductionQtyKg: 0 });
                    }
                    dailyAggregator.get(groupKey).supplyProductionQtyKg += supply.qty;
                });

                rm.returns?.forEach(ret => {
                    const dateKey = dayjs(ret.movementDate).format('YYYY-MM-DD');
                    const groupKey = `${rm.rmKey}|${dateKey}`;
                    if (!dailyAggregator.has(groupKey)) {
                        dailyAggregator.set(groupKey, { ...baseInfo, key: groupKey, movementDate: dateKey, supplyProductionQtyKg: 0, returnProductionQtyKg: 0 });
                    }
                    dailyAggregator.get(groupKey).returnProductionQtyKg += ret.qty;
                });
            });

            const aggregatedData = Array.from(dailyAggregator.values())
                .sort((a, b) => {
                    if (a.rmKey < b.rmKey) return -1;
                    if (a.rmKey > b.rmKey) return 1;
                    if (a.movementDate < b.movementDate) return -1;
                    if (a.movementDate > b.movementDate) return 1;
                    return 0;
                });

            setData(aggregatedData);
        } catch (err) {
            message.error('Gagal memuat data. Periksa konsol untuk detail.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // --- FUNGSI EXPORT DIUBAH SESUAI PERMINTAAN ---
    const handleExportExcel = async () => {
        if (!data || data.length === 0) {
            message.warning('Tidak ada data untuk diekspor');
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Laporan RM Terstruktur');

        const groupedByRm = new Map();
        data.forEach(dailyRecord => {
            const { rmKey, rmName, ListFG, movementDate, supplyProductionQtyKg, returnProductionQtyKg } = dailyRecord;
            if (!groupedByRm.has(rmKey)) {
                groupedByRm.set(rmKey, { rmName: rmName, ListFG: ListFG, dailyTransactions: [] });
            }
            groupedByRm.get(rmKey).dailyTransactions.push({ movementDate, supplyProductionQtyKg, returnProductionQtyKg });
        });

        // [PERUBAHAN 1] Mengubah header Excel
        const mainHeaders = ['No', 'RM Key', 'RM Name', 'Tanggal Supply', 'Supply (Kg)', 'Tanggal Return', 'Return (Kg)'];
        const fgHeaders = ['FG Key', 'FG Name', 'FO (Pcs)', 'FO (Kg)', 'SO (Pcs)', 'SO (Kg)', 'Qty Ok (Pcs)', 'Qty Ok (Kg)', 'Qty Ng (Kg)', 'DO (Pcs)', 'DO (Kg)'];

        const fullHeaderRow = sheet.addRow([...mainHeaders, ...fgHeaders]);
        fullHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        fullHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        fullHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };

        let rowNumber = 1;

        for (const [rmKey, rmData] of groupedByRm.entries()) {
            if (rowNumber > 1) sheet.addRow([]);

            const transactions = rmData.dailyTransactions;
            const finishedGoods = rmData.ListFG;
            const loopCount = Math.max(transactions.length, finishedGoods.length);

            for (let i = 0; i < loopCount; i++) {
                const rowData = [];

                if (i === 0) {
                    rowData.push(rowNumber++);
                    rowData.push(rmKey);
                    rowData.push(rmData.rmName);
                } else {
                    rowData.push('', '', '');
                }

                if (i < transactions.length) {
                    const tx = transactions[i];
                    // [PERUBAHAN 2] Menyesuaikan data baris dengan header baru
                    const supplyDate = tx.supplyProductionQtyKg > 0 ? tx.movementDate : '';
                    const returnDate = tx.returnProductionQtyKg > 0 ? tx.movementDate : '';
                    rowData.push(supplyDate, tx.supplyProductionQtyKg || 0, returnDate, tx.returnProductionQtyKg || 0);
                } else {
                    rowData.push('', '', '', ''); // 4 kolom kosong untuk transaksi
                }

                if (i < finishedGoods.length) {
                    const fg = finishedGoods[i];
                    rowData.push(fg.fgKey, fg.fgName, fg.forecastOrderQtyPcs || 0, fg.forecastOrderQtyKg || 0,
                        fg.salesOrderQtyPcs || 0, fg.salesOrderQtyKg || 0, fg.productionQtyOkPcs || 0,
                        fg.productionQtyOkKg || 0, fg.productionQtyNgKg || 0, fg.deliveryQtyPcs || 0,
                        fg.deliveryQtyKg || 0);
                } else {
                    rowData.push('', '', '', '', '', '', '', '', '', '', '');
                }

                const addedRow = sheet.addRow(rowData);
                if (i === 0) {
                    addedRow.getCell('A').font = { bold: true };
                    addedRow.getCell('B').font = { bold: true };
                    addedRow.getCell('C').font = { bold: true };
                }
            }
        }

        sheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const columnLength = cell.value ? cell.value.toString().length : 12;
                maxLength = Math.max(maxLength, columnLength);
            });
            column.width = maxLength + 2;
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(
            new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            `laporan_rm_final_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
        );
    };

    // Fungsi lain tidak diubah...
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
                    <Button type="link" size="small" onClick={() => { close(); }}>close</Button>
                </Space>
            </div>
        ),
        filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
        onFilter: (value, record) => record[dataIndex]?.toString().toLowerCase().includes(value.toLowerCase()),
        onFilterDropdownOpenChange: open => {
            if (open) {
                setTimeout(() => searchInput.current?.select(), 100);
            }
        },
        render: text =>
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

    // --- DEFINISI KOLOM DIUBAH SESUAI PERMINTAAN ---
    const columns = [
        { title: 'No', key: 'no', render: (text, record, index) => (pagination.current - 1) * pagination.pageSize + index + 1, fixed: 'left', width: 60 },
        { title: 'RM Key', dataIndex: 'rmKey', key: 'rmKey', ...getColumnSearchProps('rmKey'), fixed: 'left', width: 120 },
        { title: 'RM Name', dataIndex: 'rmName', key: 'rmName', ...getColumnSearchProps('rmName'), width: 250 },
        {
            title: 'Tanggal Supply',
            dataIndex: 'movementDate',
            key: 'supplyDate',
            sorter: (a, b) => dayjs(a.movementDate).unix() - dayjs(b.movementDate).unix(),
            // [PERUBAHAN 3] Hanya tampilkan tanggal jika ada supply
            render: (text, record) => (record.supplyProductionQtyKg > 0 ? text : ''),
        },
        {
            title: 'Total Supply (Kg)',
            dataIndex: 'supplyProductionQtyKg',
            key: 'supplyProductionQtyKg',
            render: (val) => val || 0
        },
        {
            title: 'Tanggal Return',
            dataIndex: 'movementDate',
            key: 'returnDate',
            sorter: (a, b) => dayjs(a.movementDate).unix() - dayjs(b.movementDate).unix(),
            // [PERUBAHAN 4] Kolom baru, hanya tampilkan tanggal jika ada return
            render: (text, record) => (record.returnProductionQtyKg > 0 ? text : ''),
        },
        {
            title: 'Total Return (Kg)',
            dataIndex: 'returnProductionQtyKg',
            key: 'returnProductionQtyKg',
            render: (val) => val || 0
        },
    ];

    const expandedRowRender = (record) => (
        <div style={{ padding: '12px 24px', background: '#fafafa', borderRadius: 6 }}>
            <h4 style={{ marginTop: 0, marginBottom: 16 }}>Finished Goods Demand related to this Raw Material:</h4>
            {record.ListFG.length > 0 ? (
                <Table
                    columns={[
                        { title: 'FG Key', dataIndex: 'fgKey', key: 'fgKey' },
                        { title: 'FG Name', dataIndex: 'fgName', key: 'fgName', width: 250 },
                        { title: 'FO (Pcs)', dataIndex: 'forecastOrderQtyPcs', key: 'forecastOrderQtyPcs' },
                        { title: 'FO (Kg)', dataIndex: 'forecastOrderQtyKg', key: 'forecastOrderQtyKg' },
                        { title: 'SO (Pcs)', dataIndex: 'salesOrderQtyPcs', key: 'salesOrderQtyPcs' },
                        { title: 'SO (Kg)', dataIndex: 'salesOrderQtyKg', key: 'salesOrderQtyKg' },
                        { title: 'Qty Ok (Pcs)', dataIndex: 'productionQtyOkPcs', key: 'productionQtyOkPcs' },
                        { title: 'Qty Ok (Kg)', dataIndex: 'productionQtyOkKg', key: 'productionQtyOkKg' },
                        { title: 'Qty Ng (Kg)', dataIndex: 'productionQtyNgKg', key: 'productionQtyNgKg' },
                        { title: 'DO (Pcs)', dataIndex: 'deliveryQtyPcs', key: 'deliveryQtyPcs' },
                        { title: 'DO (Kg)', dataIndex: 'deliveryQtyKg', key: 'deliveryQtyKg' },
                    ]}
                    dataSource={record.ListFG.map((fg, idx) => ({ ...fg, key: idx }))}
                    pagination={false}
                    size="small"
                    rowKey="fgKey"
                />
            ) : (
                <div>No related finished goods demand.</div>
            )}
        </div>
    );

    return (
        <>
            <Space style={{ marginBottom: 16 }}>
                <RangePicker value={dateRange} onChange={setDateRange} format="YYYY-MM-DD" />
                <Button type="primary" icon={<SearchOutlined />} onClick={fetchData} loading={loading}>
                    Search
                </Button>
                <Button
                    type="primary"
                    style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                    icon={<FileExcelOutlined />}
                    onClick={handleExportExcel}
                    disabled={data.length === 0 || loading}
                >
                    Export to Excel
                </Button>
            </Space>
            <Table
                columns={columns}
                dataSource={data}
                loading={loading}
                pagination={pagination}
                onChange={setPagination}
                expandable={{ expandedRowRender }}
                rowKey="key"
                scroll={{ x: 1300 }} // Sedikit dilebarkan untuk kolom baru
            />
        </>
    );
};

export default SupplyRawMaterial;