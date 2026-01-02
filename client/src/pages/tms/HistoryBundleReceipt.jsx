import { useEffect, useState, useCallback } from "react";
import {
  Table,
  Button,
  Card,
  notification,
  Tag,
  Modal,
  Spin,
  message,
  Popover,
  Input,
  DatePicker,
  Space,
  Tooltip,
  Flex,
} from "antd";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  HourglassOutlined,
  PrinterOutlined,
  SearchOutlined,
  SyncOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useSelector } from "react-redux";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const { RangePicker } = DatePicker;

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";
const backEndUrlPdf = import.meta.env.VITE_BACKEND_URL_ATTACHMENT || "http://localhost:3200";

dayjs.extend(utc);
dayjs.extend(timezone);

const formatDate = (iso) => {
  if (!iso) return "-";
  return dayjs(iso).tz("Asia/Jakarta").format("YYYY-MM-DD");
};

const HistoryBundleReceipt = () => {
  const user = useSelector((state) => state.auth.user);
  const role = user.title;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sjData, setSjData] = useState({});

  // States untuk Filter
  const [bundleSearch, setBundleSearch] = useState("");
  const [sjSearch, setSjSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [dateRange, setDateRange] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [processingId, setProcessingId] = useState(null); // ID baris yang sedang print

  // Logic Checkpoint Receipt (Berbeda dengan Handover)
  let cPoint, cPointSecond;
  switch (role) {
    case "delivery": cPoint = 8; break;
    case "dpk": cPoint = 2; cPointSecond = 6; break;
    case "driver": cPoint = 4; cPointSecond = 2; break;
    case "marketing": cPoint = 10; cPointSecond = 11; break;
    case "fat": cPoint = 12; cPointSecond = 13; break;
    default: break;
  }

  const loadData = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("checkpoint", cPoint || "");
      if (cPointSecond) params.append("checkpoint_second", cPointSecond);

      if (filters.bundle) params.append("bundle_no", filters.bundle);
      if (filters.sj) params.append("sj_no", filters.sj);
      if (filters.driver) params.append("driver", filters.driver);
      if (filters.startDate) params.append("start_date", filters.startDate);
      if (filters.endDate) params.append("end_date", filters.endDate);

      const res = await fetch(`${backEndUrl}/tms/listbundle?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();

      setData(json.data.map((item) => ({
        key: item.adw_handover_group_id,
        ...item
      })));
    } catch (err) {
      console.error("Error fetching:", err);
      message.error("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [cPoint, cPointSecond]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = () => {
    loadData({
      bundle: bundleSearch,
      sj: sjSearch,
      driver: driverSearch,
      startDate: dateRange ? dateRange[0].format("YYYY-MM-DD") : "",
      endDate: dateRange ? dateRange[1].format("YYYY-MM-DD") : "",
    });
  };

  const handleResetFilter = () => {
    setBundleSearch("");
    setSjSearch("");
    setDriverSearch("");
    setDateRange(null);
    loadData();
  };

  const loadSJ = async (bundleId) => {
    if (sjData[bundleId]) return;
    const res = await fetch(`${backEndUrl}/tms/listbundle/${bundleId}/sj`, {
      credentials: "include",
    });
    const json = await res.json();
    setSjData((prev) => ({ ...prev, [bundleId]: json.data }));
  };

  const highlightText = (text, query) => {
    if (!query || !text) return text;
    const parts = text.toString().split(new RegExp(`(${query})`, "gi"));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase()
            ? <mark key={i} style={{ backgroundColor: "#ffc069", padding: 0 }}>{part}</mark>
            : part
        )}
      </span>
    );
  };

  const handlePrint = async (record) => {
    if (!record.received || record.received === "-") {
      return notification.warning({ message: "Belum Bisa Dicetak", description: "Dokumen belum diterima." });
    }
    try {
      setProcessingId(record.key);
      const staticUrl = `${backEndUrlPdf}/files/handover/${record.attachment}`;
      const response = await fetch(staticUrl);
      const existingPdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const firstPage = pdfDoc.getPages()[0];
      const printDate = dayjs().tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm") + " WIB";

      firstPage.drawText(`Print Date: ${printDate}`, {
        x: 40, y: firstPage.getSize().height - 15, size: 8, font: helveticaFont, color: rgb(0, 0, 0),
      });

      const pdfBytes = await pdfDoc.save();
      setPdfBlobUrl(URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" })));
      setIsModalOpen(true);
    } catch (error) {
      console.log(error);

      notification.error({ message: "Gagal memproses PDF" });
    } finally {
      setProcessingId(null);
    }
  };

  const exportExcel = async () => {
    if (!data || data.length === 0) return message.warning("Tidak ada data");
    const hide = message.loading("Menyiapkan report...", 0);

    try {
      let reportData = [];
      for (const bundle of data) {
        let sjs = sjData[bundle.key];
        if (!sjs) {
          const res = await fetch(`${backEndUrl}/tms/listbundle/${bundle.key}/sj`, { credentials: "include" });
          const json = await res.json();
          sjs = json.data;
          setSjData(prev => ({ ...prev, [bundle.key]: json.data }));
        }

        sjs.forEach(sj => {
          reportData.push({
            "Bundle No": bundle.documentno,
            "From": bundle.fromactor,
            "SJ Number": sj.documentno,
            "Driver": sj.drivername,
            "Total SJ in Bundle": bundle.total_shipments,
            "Date Handover": formatDate(bundle.created),
            "Date Received": formatDate(bundle.received),
            "Status": "Completed"
          });
        });
      }

      const ws = XLSX.utils.json_to_sheet(reportData);
      ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Receipt Report");
      XLSX.writeFile(wb, `Report_Receipt_${dayjs().format("YYYYMMDD")}.xlsx`);
    } catch (error) {
      console.log(error);

      message.error("Gagal export excel");
    } finally {
      hide();
    }
  };

  const columns = [
    { title: "No", key: "no", width: 60, align: "center", render: (_, __, i) => i + 1 },
    {
      title: "Bundle No",
      dataIndex: "documentno",
      render: (val) => <b>{highlightText(val, bundleSearch)}</b>,
    },
    { title: "From", dataIndex: "fromactor", align: "center" },
    { title: "Total SJ", dataIndex: "total_shipments", align: "center", width: 100 },
    { title: "Date Handover", dataIndex: "created", align: "center", render: formatDate },
    { title: "Date Receipt", dataIndex: "received", align: "center", render: formatDate },
    {
      title: "Status",
      align: "center",
      render: (_, r) => {
        const waiting = !r.received || r.received === "-" || r.received === "";
        return (
          <Tag color={waiting ? "gold" : "green"}>
            {waiting ? <HourglassOutlined /> : <CheckCircleOutlined />} {waiting ? "Waiting" : "Done"}
          </Tag>
        );
      },
    },
    {
      title: "Actions",
      align: "center",
      width: 80,
      render: (_, r) => (
        <Tooltip title="Cetak PDF">
          <Button
            type="text"
            icon={<PrinterOutlined style={{ color: '#1890ff' }} />}
            onClick={() => handlePrint(r)}
            loading={processingId === r.key}
            disabled={processingId !== null && processingId !== r.key}
          />
        </Tooltip>
      ),
    },
  ];

  const expandedRow = (record) => {
    const rows = sjData[record.key];
    if (!rows) return <div style={{ padding: 10 }}><Spin size="small" /> Loading Detail SJ...</div>;
    return (
      <div style={{ padding: "5px 25px" }}>
        <Table
          columns={[
            { title: "SJ No", dataIndex: "documentno", render: (t) => highlightText(t, sjSearch) },
            { title: "Driver", dataIndex: "drivername", render: (t) => highlightText(t, driverSearch) },
            { title: "TNKB", dataIndex: "tnkb" },
          ]}
          dataSource={rows}
          pagination={false}
          size="small"
          bordered
        />
      </div>
    );
  };

  return (
    <div style={{ padding: "16px" }}>
      <Card size="small" style={{ marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap="small">
          <Space wrap size="middle">
            <Input
              placeholder="Bundle No"
              value={bundleSearch}
              onChange={(e) => setBundleSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 150 }}
              allowClear
            />
            <Input
              placeholder="SJ No"
              value={sjSearch}
              onChange={(e) => setSjSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 150 }}
              allowClear
            />
            <Input
              placeholder="Driver"
              value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 150 }}
              allowClear
            />
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              style={{ width: 250 }}
            />
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}></Button>
              <Tooltip title="Reset Filter">
                <Button icon={<SyncOutlined />} onClick={handleResetFilter} />
              </Tooltip>
            </Space>
          </Space>

          <Button icon={<FileExcelOutlined />} onClick={exportExcel}></Button>
        </Flex>
      </Card>

      <Table
        loading={loading}
        columns={columns}
        dataSource={data}
        size="middle"
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: expandedRow,
          onExpand: (expanded, record) => expanded && loadSJ(record.key),
        }}
        style={{ backgroundColor: "white", borderRadius: 8 }}
      />

      <Modal
        title="Preview Document"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={[<Button key="close" onClick={() => setIsModalOpen(false)}>Close</Button>]}
        width={1000}
        centered
        destroyOnClose
      >
        {pdfBlobUrl ? (
          <iframe src={pdfBlobUrl} width="100%" height="600px" style={{ border: "none" }} title="PDF" />
        ) : (
          <div style={{ textAlign: "center", padding: 50 }}><Spin tip="Loading PDF..." /></div>
        )}
      </Modal>
    </div>
  );
};

export default HistoryBundleReceipt;