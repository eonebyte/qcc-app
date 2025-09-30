import { useEffect, useState } from 'react';
import { Button, DatePicker, Input, Space, Table, Tag, message } from 'antd';
import axios from 'axios';
import { useRef } from 'react';
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
    const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]); // default bulan ini
    const searchInput = useRef(null);

    console.log('dateRange:', dateRange);



    useEffect(() => {
        fetchData();
    }, []);


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


            const rawData = Array.isArray(res.data)
                ? res.data
                : res.data.data || [];

            const tableData = rawData.map((item, index) => ({
                key: index,
                rmKey: item.rmKey,
                rmName: item.rmName,
                supplyProductionQtyKg: item.supplyProductionQtyKg,
                supplyMovementDate: item.supplyMovementDate,
                returnProductionQtyKg: item.returnProductionQtyKg,
                returnMovementDate: item.returnMovementDate,
                ListFG: item.ListFG || []
            }));

            console.log('tableData:', tableData);
            setData(tableData);

        } catch (err) {
            message.error('Failed to fetch data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = async () => {
        if (!data || data.length === 0) {
            message.warning('Tidak ada data untuk diexport');
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Demand Raw Material');

        // Header sesuai format
        const headers = [
            'No', 'RM Key', 'RM Name', 'Supply RM (Kg)', 'Supply Date', 'Return RM (Kg)',
            'Return Date', 'FG Key', 'FG Name',
            'FO (Pcs)', 'FO (Kg)',
            'SO (Pcs)', 'SO (Kg)',
            'Qty Ok (Pcs)', 'Qty Ok (Kg)', 'Qty Ng (Kg)',
            'DO (Pcs)', 'DO (Kg)'
        ];

        sheet.addRow(headers);

        // Styling header
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF52C41A' } // hijau seperti Excel
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.eachCell(cell => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        const formatDate = (dateString) => {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toISOString().split('T')[0]; // hasilnya "yyyy-mm-dd"
        };

        data.forEach((rm, i) => {
            const rmRow = [
                i + 1,
                rm.rmKey,
                rm.rmName,
                rm.supplyProductionQtyKg || 0,
                formatDate(rm.supplyMovementDate),
                rm.returnProductionQtyKg || 0,
                formatDate(rm.returnMovementDate), // Return Date
                '', '', '', '', '', '', '', '', '', '', ''
            ];
            sheet.addRow(rmRow);

            // Tambahkan ListFG
            if (rm.ListFG && rm.ListFG.length > 0) {
                rm.ListFG.forEach(fg => {
                    sheet.addRow([
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        fg.fgKey,
                        fg.fgName,
                        fg.forecastOrderQtyPcs || 0,
                        fg.forecastOrderQtyKg || 0,
                        fg.salesOrderQtyPcs || 0,
                        fg.salesOrderQtyKg || 0,
                        fg.productionQtyOkPcs || 0,
                        fg.productionQtyOkKg || 0,
                        fg.productionQtyNgKg || 0,
                        fg.deliveryQtyPcs || 0,
                        fg.deliveryQtyKg || 0
                    ]);
                });
            }
        });

        // Auto width
        sheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const columnLength = cell.value ? cell.value.toString().length : 10;
                if (columnLength > maxLength) {
                    maxLength = columnLength;
                }
            });
            column.width = maxLength < 15 ? 15 : maxLength;
        });

        // Generate file
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(
            new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }),
            `supply_rm_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
        );
    };




    const handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        setSearchText(selectedKeys[0]);
        setSearchedColumn(dataIndex);
    };
    const handleReset = clearFilters => {
        clearFilters();
        setSearchText('');
    };
    const getColumnSearchProps = dataIndex => ({
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
                    <Button
                        type="link"
                        size="small"
                        onClick={() => {
                            close();
                        }}
                    >
                        close
                    </Button>
                </Space>
            </div>
        ),
        filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1677ff' : undefined }} />,
        onFilter: (value, record) =>
            record[dataIndex].toString().toLowerCase().includes(value.toLowerCase()),
        filterDropdownProps: {
            onOpenChange(open) {
                if (open) {
                    setTimeout(() => {
                        var _a;
                        return (_a = searchInput.current) === null || _a === void 0 ? void 0 : _a.select();
                    }, 100);
                }
            },
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


    const columns = [
        {
            title: 'No',
            key: 'no',
            render: (text, record, index) => {
                const { current, pageSize } = pagination;
                return (current - 1) * pageSize + index + 1;
            }
        },
        Object.assign(
            {
                title: 'RM Key',
                dataIndex: 'rmKey',
                key: 'rmKey'
            },
            getColumnSearchProps('rmKey')
        ),
        Object.assign(
            {
                title: 'RM Name',
                dataIndex: 'rmName',
                key: 'rmName'
            },
            getColumnSearchProps('rmName')
        ),
        {
            title: 'Supply RM (Kg)',
            dataIndex: 'supplyProductionQtyKg',
            key: 'supplyProductionQtyKg'
        },
        {
            title: 'Supply Date',
            dataIndex: 'supplyMovementDate',
            key: 'supplyMovementDate',
            render: (dateString) => {
                if (!dateString) {
                    return '-';
                }
                const date = new Date(dateString);
                // Format jadi yyyy-mm-dd
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }
        },
        {
            title: 'Return RM (Kg)',
            dataIndex: 'returnProductionQtyKg',
            key: 'returnProductionQtyKg'
        },
        {
            title: 'Return Date',
            dataIndex: 'returnMovementDate',
            key: 'returnMovementDate',
            render: (dateString) => {
                if (!dateString) {
                    return '-';
                }
                const date = new Date(dateString);
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }
        },

    ];

    const expandedRowRender = (record) => {
        return (
            <div style={{ padding: '12px 24px', background: '#fafafa', borderRadius: 6 }}>
                <h4 style={{ marginTop: 12 }}>List FG:</h4>
                {record.ListFG.length > 0 ? (
                    <Table
                        dataSource={record.ListFG.map((fg, idx) => ({ ...fg, key: idx }))}
                        pagination={false}
                        size="small"
                        columns={[
                            { title: 'Fg Key', dataIndex: 'fgKey', key: 'fgKey' },
                            { title: 'Fg Name', dataIndex: 'fgName', key: 'fgName' },
                            { title: 'Fo (Pcs)', dataIndex: 'forecastOrderQtyPcs', key: 'forecastOrderQtyPcs' },
                            { title: 'Fo (Kg)', dataIndex: 'forecastOrderQtyKg', key: 'forecastOrderQtyKg' },
                            { title: 'So (Pcs)', dataIndex: 'salesOrderQtyPcs', key: 'salesOrderQtyPcs' },
                            { title: 'So (Kg)', dataIndex: 'salesOrderQtyKg', key: 'salesOrderQtyKg' },
                            { title: 'Qty Ok (Pcs)', dataIndex: 'productionQtyOkPcs', key: 'productionQtyOkPcs' },
                            { title: 'Qty Ok (Kg)', dataIndex: 'productionQtyOkKg', key: 'productionQtyOkKg' },
                            { title: 'Qty Ng (Kg)', dataIndex: 'productionQtyNgKg', key: 'productionQtyNgKg' },
                            { title: 'Do (Pcs)', dataIndex: 'deliveryQtyPcs', key: 'deliveryQtyPcs' },
                            { title: 'Do (Kg)', dataIndex: 'deliveryQtyKg', key: 'deliveryQtyKg' },
                        ]}
                        rowKey="fgKey"
                        style={{ marginTop: 16 }}
                    />
                ) : (
                    <div>-</div>
                )}
            </div>
        );
    };

    return (
        <>
            <Space style={{ marginBottom: 16 }}>
                <RangePicker
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates)}
                    format="YYYY-MM-DD" />
                <Button type="primary" icon={<SearchOutlined />} onClick={fetchData}>
                </Button>
                <Button
                    type="primary"
                    style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                    icon={<FileExcelOutlined />}
                    onClick={handleExportExcel}
                >
                </Button>

            </Space>
            <Table
                columns={columns}
                dataSource={data}
                loading={loading}
                pagination={pagination}
                onChange={setPagination}
                expandable={{ expandedRowRender }} />
        </>
    );
};

export default SupplyRawMaterial;
