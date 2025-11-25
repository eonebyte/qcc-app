import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Table, Button, Card, message, Upload, Modal, Image } from "antd";
import { ArrowLeftOutlined, DeleteOutlined, EyeOutlined, PaperClipOutlined, PlusOutlined, PrinterOutlined, UploadOutlined } from "@ant-design/icons";

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import LayoutGlobal from "../../components/layouts/LayoutGlobal";
import { useSelector } from "react-redux";
pdfMake.vfs = pdfFonts.vfs;


const HistoryBundleDetail = () => {
    const user = useSelector((state) => state.auth.user);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const documentno = searchParams.get("documentno");

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [attachment, setAttachment] = useState(null);

    const [isModalAttachOpen, setIsModalAttachOpen] = useState(false);

    const showModal = () => {
        setIsModalAttachOpen(true);
    };
    const handleOk = () => {
        setIsModalAttachOpen(false);
    };
    const handleCancel = () => {
        setIsModalAttachOpen(false);
    };


    // ======================================================
    // Fetch data
    // ======================================================
    const fetchDetail = async () => {
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
            }));

            setData(formatted);


            // set attachment jadi tiap bundle hanya memiliki 1 attachment
            if (result.data.bundleAttachment) {
                setAttachment(result.data.bundleAttachment); // ✨ perbaikan
            } else {
                setAttachment(null);
            }

            return formatted; // kembalikan data terbaru
        } catch (err) {
            console.error("Fetch error:", err);
            return [];
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDetail();
    }, [documentno]);

    // ======================================================
    // Upload handler
    // ======================================================
    const uploadProps = {
        name: 'file',
        action: `http://localhost:3200/api/v1/attachment/bundle/${documentno}`,
        showUploadList: false,
        onChange(info) {
            if (info.file.status === 'done') {
                message.success(`${info.file.name} uploaded successfully`);
                fetchDetail()
                // setAttachment(info.file.response.filename); // set attachment baru
            } else if (info.file.status === 'error') {
                message.error(`${info.file.name} upload failed.`);
            }
        },
    };

    // ======================================================
    // Format tanggal
    // ======================================================
    const formatDateHuman = (value) => {
        if (!value) return "-";
        try {
            const date = new Date(value);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0'); // bulan 0-index
            const year = date.getFullYear();

            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');

            return `${day}-${month}-${year} ${hours}:${minutes}`;
        } catch {
            return value;
        }
    };


    // ======================================================
    // Print preview PDF dengan fetch terbaru
    // ======================================================
    const previewPdf = async () => {
        const latestData = await fetchDetail(); // fetch terbaru sebelum cetak

        if (!latestData || latestData.length === 0) {
            alert("Data kosong, tidak bisa dicetak.");
            return;
        }

        const tableBody = [
            ["No", "Customer", "Shipment No", "Movement Date", "Receipted"],
            ...latestData.map((item, idx) => [
                idx + 1,
                item.customer,
                item.sjno,
                formatDateHuman(item.plantime),
                {
                    canvas: [
                        { type: 'rect', x: 0, y: 0, w: 15, h: 15, lineWidth: 1 } // kotak 15x15
                    ],
                    alignment: 'center'
                }]),
        ];

        const today = new Date().toLocaleString("id-ID");
        const docDefinition = {
            pageSize: "A4",
            pageMargins: [40, 40, 40, 40],
            content: [
                { text: "LIST HANDOVER", style: "header" },
                { text: "DELIVERY to DPK", style: "subheader", margin: [0, 0, 0, 20] },
                { table: { headerRows: 1, widths: ["auto", "*", "*", "*", 60], body: tableBody }, layout: "lightHorizontalLines" },
                { text: "\n\n\n" },
                { columns: [{ text: "Dept. Delivery", alignment: "center" }, { text: "DPK", alignment: "center" }] },
                { text: "\n\n\n" },
                {
                    columns: [
                        {
                            stack: [
                                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 }] }, // garis
                                { text: `${user.name}`, alignment: "center", margin: [0, 5, 0, 0] } // nama user
                            ],
                            alignment: "center"
                        },
                        {
                            stack: [
                                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1 }] }, // garis
                                // { text: "Name User", alignment: "center", margin: [0, 5, 0, 0] } // label
                            ],
                            alignment: "center"
                        }
                    ]
                },
                { text: "\n\n\n" },
                { text: `Tanggal print: ${today}`, alignment: "left", fontSize: 10 },
            ],
            styles: {
                header: { fontSize: 16, bold: true, alignment: "center" },
                subheader: { fontSize: 14, alignment: "center" },
            },
        };

        pdfMake.createPdf(docDefinition).open();
    };

    // ======================================================
    // Tabel
    // ======================================================
    const columns = [
        { title: "No", width: 60, render: (_, __, index) => index + 1 },
        { title: "Customer", dataIndex: "customer" },
        { title: "Shipment No", dataIndex: "sjno" },
        { title: "Plan Time", dataIndex: "plantime", render: formatDateHuman },
    ];

    // ======================================================
    // UI
    // ======================================================

    const handleDeleteAttachment = async (bundleNo) => {
        try {
            // Modal.confirm tidak mengembalikan promise yang resolve/reject, jadi kita langsung handle di onOk
            Modal.confirm({
                title: "Are you sure you want to delete this attachment?",
                okText: "Yes",
                cancelText: "No",
                onOk: async () => {
                    const res = await fetch(`http://localhost:3200/api/v1/attachment/bundle/${bundleNo}`, {
                        method: 'DELETE',
                    });

                    if (!res.ok) {
                        throw new Error("Failed to delete attachment");
                    }

                    message.success("Attachment deleted successfully");
                    setAttachment(null); // update state setelah berhasil delete
                    fetchDetail(); // refresh data
                }
            });

        } catch (err) {
            console.error(err);
            message.error("Failed to delete attachment");
        }
    };



    return (
        <LayoutGlobal>
            <Card>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <Button icon={<ArrowLeftOutlined />} type="default" onClick={() => navigate("/history")}>
                        Back
                    </Button>

                    <Button icon={<PaperClipOutlined />} type="default" onClick={showModal}>
                    </Button>



                    <Button icon={<PrinterOutlined />} type="primary" onClick={previewPdf} disabled={loading}>
                        {loading ? "Loading..." : ""}
                    </Button>
                </div>

                <h3 style={{ marginBottom: 5 }}>
                    Bundle No: <b>{documentno}</b>
                </h3>

                <Table dataSource={data} columns={columns} rowKey="id" bordered loading={loading} />


                <Modal
                    title="Attachments"
                    closable={{ 'aria-label': 'Custom Close Button' }}
                    open={isModalAttachOpen}
                    onOk={handleOk}
                    onCancel={handleCancel}
                    footer={null}
                >
                    {attachment && attachment.name ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {attachment.name?.toLowerCase().endsWith('.pdf') ? (
                                <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                                    {attachment.name}
                                </a>
                            ) : (
                                <Image
                                    width={100}
                                    src={attachment.url}
                                    preview={{ mask: <EyeOutlined /> }}
                                />
                            )}
                            <Button
                                type="primary"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => handleDeleteAttachment(documentno)}
                            >
                            </Button>
                        </div>
                    ) : (
                        <Upload {...uploadProps}>
                            <Button icon={<UploadOutlined />}></Button>
                        </Upload>
                    )}
                </Modal>
            </Card>
        </LayoutGlobal>
    );
};

export default HistoryBundleDetail;
