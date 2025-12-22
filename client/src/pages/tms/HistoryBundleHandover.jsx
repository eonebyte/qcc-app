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
  FileExcelOutlined,
  HourglassOutlined,
  PrinterOutlined,
  SearchOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useSelector } from "react-redux";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const { RangePicker } = DatePicker;

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";
const backEndUrlAttachment =
  import.meta.env.VITE_BACKEND_URL_ATTACHMENT || "http://localhost:3200";

dayjs.extend(utc);
dayjs.extend(timezone);

const formatDate = (iso) => {
  if (!iso) return "-";
  return dayjs(iso).tz("Asia/Jakarta").format("YYYY-MM-DD");
};

const HistoryBundleHandover = () => {
  const user = useSelector((state) => state.auth.user);
  const role = user.title;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sjData, setSjData] = useState({});

  // Filter States
  const [bundleSearch, setBundleSearch] = useState("");
  const [sjSearch, setSjSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [dateRange, setDateRange] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);

  // PERBAIKAN: Gunakan ID untuk melacak baris mana yang sedang loading
  const [processingId, setProcessingId] = useState(null);

  // Checkpoint Logic
  let cPoint, cPointSecond;
  switch (role) {
    case "delivery": cPoint = 2; cPointSecond = 10; break;
    case "dpk": cPoint = 4; cPointSecond = 8; break;
    case "driver": cPoint = 6; break;
    case "marketing": cPoint = 12; break;
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
      setData(json.data.map(item => ({
        key: item.adw_handover_group_id,
        ...item
      })));
    } catch (err) {
      console.log(err);

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
    const res = await fetch(`${backEndUrl}/tms/listbundle/${bundleId}/sj`, { credentials: "include" });
    const json = await res.json();
    setSjData(prev => ({ ...prev, [bundleId]: json.data }));
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
      // PERBAIKAN: Set ID baris yang sedang diproses
      setProcessingId(record.key);

      const response = await fetch(`${backEndUrlAttachment}/files/handover/${record.attachment}`);
      const existingPdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const firstPage = pdfDoc.getPages()[0];
      const printDate = dayjs().tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm") + " WIB";
      firstPage.drawText(`Print Date: ${printDate}`, { x: 40, y: firstPage.getSize().height - 15, size: 8, font: helveticaFont, color: rgb(0, 0, 0) });

      const pdfBytes = await pdfDoc.save();
      setPdfBlobUrl(URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" })));
      setIsModalOpen(true);
    } catch (error) {
      console.log(error);

      notification.error({ message: "Gagal Memproses PDF" });
    } finally {
      // PERBAIKAN: Reset kembali ke null
      setProcessingId(null);
    }
  };

  const exportExcel = async () => {
    if (!data || data.length === 0) {
      message.warning("Tidak ada data untuk diexport");
      return;
    }

    const hide = message.loading("Sedang menyiapkan data report...", 0);
    setLoading(true);

    try {
      const reportData = [];

      // 1. Loop semua bundle yang ada di tabel (hasil filter)
      for (const bundle of data) {
        let sjs = sjData[bundle.key];

        // 2. Jika data SJ belum pernah di-load (lazy load), ambil dulu dari server
        if (!sjs) {
          try {
            const res = await fetch(`${backEndUrl}/tms/listbundle/${bundle.key}/sj`, {
              credentials: "include",
            });
            const json = await res.json();
            sjs = json.data;
            // Simpan ke state agar tidak perlu fetch ulang jika user expand manual nanti
            setSjData((prev) => ({ ...prev, [bundle.key]: json.data }));
          } catch (err) {
            console.log(err);

            console.error(`Gagal mengambil SJ untuk bundle ${bundle.documentno}`);
            sjs = [];
          }
        }

        // 3. Masukkan data ke array report (Flattening)
        if (sjs && sjs.length > 0) {
          sjs.forEach((sj) => {
            reportData.push({
              "Bundle No": bundle.documentno,
              "Destination": bundle.toactor,
              "Total SJ in Bundle": bundle.total_shipments,
              "SJ Number": sj.documentno,
              "Driver Name": sj.drivername,
              "Date Handover": formatDate(bundle.created),
              "Date Received": formatDate(bundle.received),
              "Receiver": bundle.receivedby || "-",
              "Status": bundle.received && bundle.received !== "-" ? "Completed" : "Waiting Receipt",
            });
          });
        } else {
          // Fallback jika bundle tidak punya SJ (data kosong)
          reportData.push({
            "Bundle No": bundle.documentno,
            "Destination": bundle.toactor,
            "Total SJ in Bundle": bundle.total_shipments,
            "SJ Number": "-",
            "Driver Name": "-",
            "Date Handover": formatDate(bundle.created),
            "Date Received": formatDate(bundle.received),
            "Receiver": "-",
            "Status": "No Data",
          });
        }
      }

      // 4. Generate Worksheet
      const ws = XLSX.utils.json_to_sheet(reportData);

      // 5. Atur lebar kolom agar rapi (optional tapi profesional)
      const colWidths = [
        { wch: 18 }, // Bundle No
        { wch: 15 }, // Destination
        { wch: 15 }, // Total SJ
        { wch: 20 }, // SJ Number
        { wch: 20 }, // Driver Name
        { wch: 15 }, // Date Handover
        { wch: 15 }, // Date Received
        { wch: 15 }, // Receiver
        { wch: 15 }, // Status
      ];
      ws['!cols'] = colWidths;

      // 6. Buat Workbook dan download
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Handover Detail Report");

      const fileName = `Report_Handover_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
      XLSX.writeFile(wb, fileName);

      message.success("Report berhasil diexport");
    } catch (error) {
      console.error(error);
      message.error("Gagal melakukan export excel");
    } finally {
      hide(); // Tutup loading message
      setLoading(false);
    }
  };

  const columns = [
    { title: "No", key: "no", width: 50, align: "center", render: (_, __, i) => i + 1 },
    {
      title: "Bundle No",
      dataIndex: "documentno",
      render: (val) => highlightText(val, bundleSearch)
    },
    { title: "To", dataIndex: "toactor", align: "center" },
    { title: "Total SJ", dataIndex: "total_shipments", align: "center", width: 100 },
    { title: "Date Handover", dataIndex: "created", align: "center", render: formatDate },
    { title: "Date Receipt", dataIndex: "received", align: "center", render: formatDate },
    {
      title: "Status",
      align: "center",
      width: 100,
      render: (_, r) => {
        const waiting = !r.received || r.received === "-";
        return (
          <Tag color={waiting ? "gold" : "green"} style={{ borderRadius: 10, margin: 0 }}>
            {waiting ? <HourglassOutlined /> : <CheckCircleOutlined />} {waiting ? "Waiting" : "Done"}
          </Tag>
        );
      },
    },
    {
      title: "Print",
      align: "center",
      width: 80,
      render: (_, r) => (
        <Tooltip title="Cetak PDF">
          <Button
            type="text"
            icon={<PrinterOutlined style={{ color: '#1890ff' }} />}
            onClick={() => handlePrint(r)}
            // PERBAIKAN: Loading hanya aktif jika ID baris ini cocok dengan processingId
            loading={processingId === r.key}
            // Optional: Disable tombol baris lain jika ada satu yang sedang loading
            disabled={processingId !== null && processingId !== r.key}
          />
        </Tooltip>
      ),
    },
  ];

  const expandedRow = (record) => {
    const rows = sjData[record.key];
    if (!rows) return <div style={{ padding: 10 }}><Spin size="small" /> Memuat data...</div>;
    return (
      <Table
        columns={[
          { title: "SJ No", dataIndex: "documentno", render: (t) => highlightText(t, sjSearch) },
          { title: "Driver", dataIndex: "drivername", render: (t) => highlightText(t, driverSearch) },
        ]}
        dataSource={rows}
        pagination={false}
        size="small"
        bordered
        style={{ margin: "10px 20px" }}
      />
    );
  };

  return (
    <div style={{ padding: "16px" }}>
      <Card size="small" variant="bordered" style={{ marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap="small">
          <Space wrap>
            <Input
              placeholder="Bundle No"
              value={bundleSearch}
              onChange={(e) => setBundleSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 140 }}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              allowClear
            />
            <Input
              placeholder="SJ No"
              value={sjSearch}
              onChange={(e) => setSjSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 140 }}
              allowClear
            />
            <Input
              placeholder="Driver"
              value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 140 }}
              allowClear
            />
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              style={{ width: 230 }}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} />
            <Tooltip title="Reset Filter">
              <Button icon={<SyncOutlined />} onClick={handleResetFilter} />
            </Tooltip>
          </Space>

          <Button icon={<FileExcelOutlined />} onClick={exportExcel} />
        </Flex>
      </Card>

      <Table
        loading={loading}
        columns={columns}
        dataSource={data}
        size="middle"
        pagination={{ pageSize: 10, showSizeChanger: true }}
        expandable={{
          expandedRowRender: expandedRow,
          onExpand: (expanded, record) => expanded && loadSJ(record.key),
        }}
        style={{ backgroundColor: "white", borderRadius: 8 }}
      />

      <Modal
        title="Pratinjau Dokumen"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={[<Button key="close" onClick={() => setIsModalOpen(false)}>Tutup</Button>]}
        width={1000}
        centered
        destroyOnClose
      >
        <iframe src={pdfBlobUrl} width="100%" height="700px" style={{ border: "none" }} title="PDF Preview" />
      </Modal>
    </div>
  );
};

export default HistoryBundleHandover;