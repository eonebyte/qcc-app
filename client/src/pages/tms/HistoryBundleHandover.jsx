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
  Input,
  DatePicker,
  Space,
  Tooltip,
  Flex,
  Select,
} from "antd";
import {
  CheckCircleOutlined,
  FileExcelOutlined,
  HourglassOutlined,
  PrinterOutlined,
  SearchOutlined,
  SyncOutlined,
  EditOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useSelector } from "react-redux";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const { RangePicker } = DatePicker;
const { Option } = Select;

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";
const backEndUrlAttachment = import.meta.env.VITE_BACKEND_URL_ATTACHMENT || "http://localhost:3200";

dayjs.extend(utc);
dayjs.extend(timezone);

const formatDate = (iso) => {
  if (!iso || iso === "-") return "-";
  return dayjs(iso).tz("Asia/Jakarta").format("YYYY-MM-DD");
};

const HistoryBundleHandover = () => {
  const user = useSelector((state) => state.auth.user);
  const role = user.title;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sjData, setSjData] = useState({});

  // States untuk Edit Bundle
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [driverOptions, setDriverOptions] = useState([]);
  const [tnkbOptions, setTnkbOptions] = useState([]);

  // Filter States
  const [bundleSearch, setBundleSearch] = useState("");
  const [sjSearch, setSjSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [dateRange, setDateRange] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  // Role Checkpoint
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

      const res = await fetch(`${backEndUrl}/tms/listbundle?${params.toString()}`, { credentials: "include" });
      const json = await res.json();

      setData(json.data.map(item => ({ key: item.adw_handover_group_id, ...item })));
    } catch (err) {
      console.error(err);
      message.error("Gagal memuat data utama");
    } finally {
      setLoading(false);
    }
  }, [cPoint, cPointSecond]);

  const fetchOptions = async () => {
    try {
      const [resDrivers, resTnkbs] = await Promise.all([
        fetch(`${backEndUrl}/tms/drivers`, { credentials: "include" }),
        fetch(`${backEndUrl}/tms/tnkbs`, { credentials: "include" })
      ]);
      const jsonDrivers = await resDrivers.json();
      const jsonTnkbs = await resTnkbs.json();

      setDriverOptions(jsonDrivers.data || []);
      setTnkbOptions(jsonTnkbs.data || []);
    } catch (err) {
      console.error("Gagal load opsi:", err);
    }
  };

  useEffect(() => {
    loadData();
    fetchOptions();
  }, [loadData]);

  const loadSJ = async (bundleId) => {
    const res = await fetch(`${backEndUrl}/tms/listbundle/${bundleId}/sj`, { credentials: "include" });
    const json = await res.json();
    setSjData(prev => ({ ...prev, [bundleId]: json.data }));
  };

  const handleSaveEdit = async () => {
    if (!editingBundle?.ad_user_id && !editingBundle?.ADW_TMS_TNKB_ID) {
      return message.warning("Minimal pilih salah satu: Driver atau TNKB");
    }

    setEditLoading(true);
    try {
      const payload = {
        adw_handover_group_id: editingBundle.key,
        driver_id: editingBundle.ad_user_id,
        driver_name: editingBundle.driver_name,
        tnkb_id: editingBundle.ADW_TMS_TNKB_ID,
        tnkb_name: editingBundle.tnkb_name,
      };

      const response = await fetch(`${backEndUrl}/tms/update/dkp/to/driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (response.ok) {
        message.success("Informasi Bundle berhasil diperbarui");
        setIsEditModalOpen(false);
        loadData();
        setSjData({});
      } else {
        throw new Error();
      }
    } catch (err) {
      console.error(err);
      message.error("Gagal memperbarui data bundle");
    } finally {
      setEditLoading(false);
    }
  };

  const handlePrint = async (record) => {
    if (!record.received || record.received === "-") {
      return notification.warning({ message: "Belum Bisa Dicetak", description: "Dokumen belum diterima." });
    }
    try {
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
      notification.error({ message: "Gagal Memproses PDF" });
    } finally {
      setProcessingId(null);
    }
  };

  const highlightText = (text, query) => {
    if (!query || !text) return text;
    const parts = text.toString().split(new RegExp(`(${query})`, "gi"));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? <mark key={i} style={{ backgroundColor: "#ffc069", padding: 0 }}>{part}</mark> : part
        )}
      </span>
    );
  };

  const columns = [
    { title: "No", key: "no", width: 50, align: "center", render: (_, __, i) => i + 1 },
    { title: "Bundle No", dataIndex: "documentno", render: (val) => <b>{highlightText(val, bundleSearch)}</b> },
    { title: "To", dataIndex: "toactor", align: "center" },
    { title: "Total SJ", dataIndex: "total_shipments", align: "center", width: 80 },
    // KOLOM BARU: DRIVER
    {
      title: "Driver",
      dataIndex: "drivername",
      render: (t) => highlightText(t || "-", driverSearch)
    },
    // KOLOM BARU: TNKB
    {
      title: "TNKB",
      dataIndex: "tnkb",
      render: (t, record) => {
        // Jika backend mengirimkan string nama TNKB, gunakan itu
        if (t && t !== "-") return t;
        // Jika hanya ada id, cari namanya di tnkbOptions
        const found = tnkbOptions.find(opt => opt.ADW_TMS_TNKB_ID === record.tnkb_id);
        return found ? found.NAME : "-";
      }
    },
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
      title: "Action",
      align: "center",
      width: 120,
      render: (_, r) => {
        const waiting = !r.received || r.received === "-";
        const cp = Number(r.checkpoint) === 4;

        return (
          <Space>
            {waiting && cp && (
              <Tooltip title="Edit Transportasi Bundle">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined style={{ color: "#faad14" }} />}
                  onClick={() => {
                    setEditingBundle({
                      ...r,
                      ad_user_id: r.driverby || null, // Pastikan ini sesuai dengan key dari query listBundle (driver_id)
                      ADW_TMS_TNKB_ID: r.tnkb_id || null // Pastikan ini sesuai dengan key dari query listBundle (tnkb_id)
                    });
                    setIsEditModalOpen(true);
                  }}
                />
              </Tooltip>
            )}
            <Tooltip title="Print PDF">
              <Button
                type="text"
                size="small"
                icon={<PrinterOutlined style={{ color: '#1890ff' }} />}
                onClick={() => handlePrint(r)}
                loading={processingId === r.key}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const expandedRow = (record) => {
    const rows = sjData[record.key];
    if (!rows) return <div style={{ padding: 10 }}><Spin size="small" /> Memuat data...</div>;
    return (
      <Table
        rowKey="adw_trackingsj_id"
        columns={[
          { title: "SJ No", dataIndex: "documentno", render: (t) => highlightText(t, sjSearch) },
          { title: "Driver", dataIndex: "drivername" },
          { title: "Customer", dataIndex: "customer" },
          { title: "TNKB", dataIndex: "tnkb" },
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
      <Card size="small" style={{ marginBottom: 16 }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap="small">
          <Space wrap>
            <Input placeholder="Bundle No" value={bundleSearch} onChange={e => setBundleSearch(e.target.value)} style={{ width: 140 }} allowClear />
            <Input placeholder="SJ No" value={sjSearch} onChange={e => setSjSearch(e.target.value)} style={{ width: 140 }} allowClear />
            <Input placeholder="Driver" value={driverSearch} onChange={e => setDriverSearch(e.target.value)} style={{ width: 140 }} allowClear />
            <RangePicker value={dateRange} onChange={setDateRange} style={{ width: 230 }} />
            <Button type="primary" icon={<SearchOutlined />} onClick={() => loadData({ bundle: bundleSearch, sj: sjSearch, driver: driverSearch, startDate: dateRange?.[0]?.format("YYYY-MM-DD"), endDate: dateRange?.[1]?.format("YYYY-MM-DD") })} />
            <Button icon={<SyncOutlined />} onClick={() => { setBundleSearch(""); setSjSearch(""); setDriverSearch(""); setDateRange(null); loadData(); }} />
          </Space>
          <Button icon={<FileExcelOutlined />} onClick={() => message.info("Feature Exporting...")} />
        </Flex>
      </Card>

      <Table
        loading={loading}
        columns={columns}
        dataSource={data}
        size="middle"
        expandable={{
          expandedRowRender: expandedRow,
          onExpand: (expanded, record) => expanded && loadSJ(record.key),
        }}
      />

      <Modal
        title="Edit Transportasi Bundle (Semua SJ)"
        open={isEditModalOpen}
        onOk={handleSaveEdit}
        confirmLoading={editLoading}
        onCancel={() => setIsEditModalOpen(false)}
        destroyOnClose
        width={450}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 15 }}>
          <div>
            <div style={{ marginBottom: 5, fontWeight: 'bold' }}>Bundle No:</div>
            <Input value={editingBundle?.documentno} disabled style={{ backgroundColor: '#f5f5f5', color: '#000' }} />
          </div>

          <div>
            <div style={{ marginBottom: 5, fontWeight: 'bold' }}>Pilih Driver Baru:</div>
            <Select
              showSearch
              style={{ width: '100%' }}
              placeholder="Cari Nama Driver"
              optionFilterProp="children"
              value={editingBundle?.ad_user_id}
              onChange={(val, opt) => setEditingBundle({
                ...editingBundle,
                ad_user_id: val,
                driver_name: opt.children
              })}
            >
              {driverOptions.map(d => (
                <Option key={d.ad_user_id} value={d.ad_user_id}>{d.name}</Option>
              ))}
            </Select>
          </div>

          <div>
            <div style={{ marginBottom: 5, fontWeight: 'bold' }}>Pilih TNKB Baru:</div>
            <Select
              showSearch
              style={{ width: '100%' }}
              placeholder="Cari Plat Nomor"
              optionFilterProp="children"
              value={editingBundle?.ADW_TMS_TNKB_ID}
              onChange={(val, opt) => setEditingBundle({
                ...editingBundle,
                ADW_TMS_TNKB_ID: val,
                tnkb_name: opt.children
              })}
            >
              {tnkbOptions.map(t => (
                <Option key={t.ADW_TMS_TNKB_ID} value={t.ADW_TMS_TNKB_ID}>{t.NAME}</Option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>

      <Modal title="Pratinjau Dokumen" open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null} width={1000} centered>
        <iframe src={pdfBlobUrl} width="100%" height="700px" style={{ border: "none" }} />
      </Modal>
    </div>
  );
};

export default HistoryBundleHandover;