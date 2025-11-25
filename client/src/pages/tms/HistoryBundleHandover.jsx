import { useEffect, useState } from "react";
import { Table, Button, Tabs, Card, notification, Badge, Tag } from "antd";
import { AndroidOutlined, AppleOutlined, PrinterOutlined } from "@ant-design/icons";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
pdfMake.vfs = pdfFonts.vfs;
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useSelector } from "react-redux";

dayjs.extend(utc);
dayjs.extend(timezone);

// fungsi format
const formatDate = (iso) => {
    if (!iso) return "-";
    // convert ke WIB dan format YYYY-MM-DD
    return dayjs(iso).tz("Asia/Jakarta").format("YYYY-MM-DD");
};
const HistoryBundleHandover = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user.title;
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    let cPoint;
    let cPointSecond;
    let hoBy;
    let receiptBy;

    switch (role) {
        case "delivery": // delivery handover chekcpoint menjadi 2
            cPoint = 2;
            cPointSecond = 10;
            hoBy = "Delivery";
            receiptBy = "DPK";
            break;
        case "dpk": // delivery handover chekcpoint menjadi 4
            cPoint = 4;
            cPointSecond = 8;
            hoBy = "DPK";
            receiptBy = "Driver";
            break;
        case "driver":
            cPoint = 6;
            hoBy = "Driver";
            receiptBy = "DPK";
            break;
        case "marketing":
            cPoint = 12;
            hoBy = "MKT";
            receiptBy = "FAT";
            break;
        default:
            break;
    }


    const loadData = async () => {
        try {
            setLoading(true)
            const res = await fetch(`http://localhost:3200/api/v1/tms/listbundle?checkpoint=${cPoint}&checkpoint_second=${cPointSecond}`);
            const json = await res.json();


            const mapped = json.data.map(item => ({
                key: item.adw_handover_group_id,
                documentno: item.documentno,
                created: item.created,
                createdby: item.createdby,
                received: item.received,
                receivedby: item.receivedby,
                total_shipments: item.total_shipments
            }));

            setData(mapped);
        } catch (err) {
            console.error("Error fetching:", err);
        } finally {
            setLoading(false)
        }
    };

    const fetchDetail = async (documentno) => {
        if (!documentno) return [];
        try {
            setLoading(true);
            const response = await fetch(
                `http://localhost:3200/api/v1/tms/listbundle/detail?documentno=${documentno}`
            );
            const result = await response.json();

            const formatted = (result.data.listShipment || []).map((item, idx) => ({
                id: idx + 1,
                customer: item.customer,
                sjno: item.documentno,
                plantime: item.movementdate,
                createdby_name: result.data.dataUser.createdby_name,
                receivedby_name: result.data.dataUser.receivedby_name,
                signature: result.data.dataUser.signature,
                bundleNo: result.data.bundleNo,
                bundleCheckpoint: parseInt(result.data.bundleCheckpoint),
            }));


            return formatted; // kembalikan data terbaru
        } catch (err) {
            console.error("Fetch error:", err);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const previewPdf = async (documentno) => {
        const latestData = await fetchDetail(documentno); // fetch terbaru sebelum cetak

        console.log('latesData : ', latestData);


        if (!latestData || latestData.length === 0) {
            notification.error({
                message: "Gagal Cetak",
                description: "Data kosong, tidak bisa dicetak.",
            });
            return;
        }

        const createdByName = latestData[0].createdby_name || "-";
        const receivedByName = latestData[0].receivedby_name || "-";
        const signature = latestData[0].signature || "-";
        const bundleNo = latestData[0].bundleNo || "-";
        const bundleCheckpoint = latestData[0].bundleCheckpoint || 0;

        switch (bundleCheckpoint) {
            case 10:
                hoBy = 'DPK'
                receiptBy = 'MKT'
                break;
            default:
                break;
        }

        if (receivedByName === "-") {
            notification.warning({
                message: "Belum Bisa Dicetak",
                description: "Dokumen belum diterima. Silakan lakukan proses penerimaan terlebih dahulu.",
            });
            return;
        }



        const tableBody = [
            ["No", "Customer", "Shipment No", "Movement Date"],
            ...latestData.map((item, idx) => [
                idx + 1,
                item.customer,
                item.sjno,
                formatDate(item.plantime),
            ]),
        ];

        const today = new Date().toLocaleString("id-ID");
        const docDefinition = {
            pageSize: "A4",
            pageMargins: [40, 40, 40, 40],
            content: [
                { text: `LIST HANDOVER (${hoBy} to ${receiptBy})`, style: "header", margin: [0, 0, 0, 2] },
                { text: `No: ${bundleNo}`, fontSize: 12, alignment: "center", bold: false, margin: [0, 0, 0, 5] },
                {
                    table: {
                        headerRows: 1,
                        widths: ["auto", "*", "*", "*"],
                        body: tableBody
                    },
                    layout: "lightHorizontalLines"
                },

                { text: "\n" },

                {
                    columns: [
                        { text: hoBy, alignment: "center", margin: [0, 3, 0, 10] },
                        { text: '', alignment: "center" },
                        { text: receiptBy, alignment: "center", margin: [0, 3, 0, 5] }
                    ],
                    margin: [0, 10, 0, 5]  // lebih rapat
                },

                {
                    columns: [
                        {
                            width: '33%',
                            stack: [
                                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 1 }] },
                                { text: createdByName, alignment: "center", margin: [0, 3, 0, 0] },
                            ],
                            alignment: "center"
                        },
                        {
                            width: '33%',
                            stack: [
                                { qr: signature, fit: 60, alignment: "center", margin: [0, 0, 0, 0] },
                            ],
                            alignment: "center"
                        },
                        {
                            width: '33%',
                            stack: [
                                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 1 }] },
                                { text: receivedByName, alignment: "center", margin: [0, 3, 0, 0] },
                            ],
                            alignment: "center"
                        }
                    ],
                    columnGap: 0,
                    margin: [0, 10, 0, 5]
                },
                { text: `Print Date: ${today}`, alignment: "left", fontSize: 10 }
            ],

            styles: {
                header: { fontSize: 14, bold: true, alignment: "center" },
            }
        };


        pdfMake.createPdf(docDefinition).open();
    };



    const columns = [
        {
            title: "No",
            key: "no",
            width: 70,
            align: "center",
            render: (text, record, index) => index + 1,
        },
        {
            title: "Bundle No",
            dataIndex: "documentno",
            render: (value) => (
                <b>{value}</b>
                // <a href={`/history/detail?documentno=${value}`}>
                //     <b>{value}</b>
                // </a>
            ),
        },
        {
            title: "Total Shipments",
            dataIndex: "total_shipments",
            align: "center",
        },
        {
            title: "Date Handover",
            dataIndex: "created",
            align: "center",
            render: (value) => formatDate(value),
        },
        {
            title: "Date Receipt",
            dataIndex: "received",
            align: "center",
            render: (value) => formatDate(value),
        },
        {
            title: "Status",
            align: "center",
            render: (_, record) => {
                const waiting =
                    record.received == null ||
                    record.received === "-" ||
                    record.received === "";

                if (waiting) {
                    return (
                        <Tag color="gold">Waiting Receipt</Tag>
                    );
                }

                return (
                    <Tag color="green">Completed</Tag>
                );
            }
        },
        {
            title: "Actions",
            dataIndex: "actions",
            align: "center",
            render: (text, record) => (
                <Button icon={<PrinterOutlined />} type="primary" onClick={() => previewPdf(record.documentno)} disabled={loading}>
                    {loading ? "Loading..." : ""}
                </Button>
            )
        }
    ];


    return (
        <Table
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={{ pageSize: 10 }}
        />
    );
};

export default HistoryBundleHandover;
