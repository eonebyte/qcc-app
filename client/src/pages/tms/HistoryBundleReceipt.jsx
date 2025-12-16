import { useEffect, useState } from "react";
import {
  Table,
  Button,
  Tabs,
  Card,
  notification,
  Tag,
  Modal,
  Spin,
  message,
  Popover,
} from "antd";
import {
  AndroidOutlined,
  AppleOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  HourglassOutlined,
  PrinterOutlined,
  SearchOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import * as XLSX from "xlsx";
pdfMake.vfs = pdfFonts.vfs;
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useSelector } from "react-redux";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const backEndUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3200";
const backEndUrlPdf =
  import.meta.env.VITE_BACKEND_URL_ATTACHMENT || "http://localhost:3200";

dayjs.extend(utc);
dayjs.extend(timezone);

// fungsi format
const formatDate = (iso) => {
  if (!iso) return "-";
  // convert ke WIB dan format YYYY-MM-DD
  return dayjs(iso).tz("Asia/Jakarta").format("YYYY-MM-DD");
};
const HistoryBundleReceipt = () => {
  const user = useSelector((state) => state.auth.user);
  const role = user.title;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const [sjData, setSjData] = useState({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null); // URL untuk iframe
  const [processingPdf, setProcessingPdf] = useState(false); // Loading saat edit PDF

  const [bundleSearch, setBundleSearch] = useState("");

  const handleSearchBundle = () => {
    if (!bundleSearch.trim()) {
      message.warning("Masukkan Bundle No untuk filter");
      return;
    }

    loadData(bundleSearch); // ⬅ langsung ke server
  };

  const handleResetFilter = () => {
    setBundleSearch("");
    loadData(""); // tanpa parameter → fetch semua data
  };

  useEffect(() => {
    loadData();
  }, []);

  let cPoint;
  let cPointSecond;

  switch (role) {
    case "delivery":
      cPoint = 8;
      break;
    case "dpk":
      cPoint = 2;
      cPointSecond = 6;
      break;
    case "driver":
      cPoint = 4;
      break;
    case "marketing":
      cPoint = 10;
      cPointSecond = 11;
      break;
    case "fat":
      cPoint = 12;
      cPointSecond = 13;
      break;
    default:
      break;
  }

  const loadSJ = async (bundleId) => {
    if (sjData[bundleId]) return sjData[bundleId]; // sudah ada, return dari state

    const res = await fetch(`${backEndUrl}/tms/listbundle/${bundleId}/sj`, {
      credentials: "include",
    });

    const json = await res.json();

    setSjData((prev) => ({
      ...prev,
      [bundleId]: json.data,
    }));

    return json.data; // <-- kunci supaya Promise.all punya hasil
  };

  const loadData = async (bundle = "") => {
    try {
      setLoading(true);

      const url = new URL(`${backEndUrl}/tms/listbundle`);
      url.searchParams.set("checkpoint", cPoint);
      if (cPointSecond) url.searchParams.set("checkpoint_second", cPointSecond);
      if (bundle) url.searchParams.set("bundle_no", bundle);

      const res = await fetch(url, { credentials: "include" });
      const json = await res.json();

      const mapped = json.data.map((item) => ({
        key: item.adw_handover_group_id,
        documentno: item.documentno,
        created: item.created,
        received: item.received,
        total_shipments: item.total_shipments,
        attachment: item.attachment,
        fromactor: item.fromactor,
      }));

      console.log("mapped : ", mapped);

      setData(mapped);
    } catch (err) {
      console.error("Error fetching:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (record) => {
    // 1. Validasi
    const isWaiting = !record.received || record.received === "-";
    if (isWaiting) {
      notification.warning({
        message: "Belum Bisa Dicetak",
        description:
          "Dokumen belum diterima. Silakan lakukan proses penerimaan dahulu.",
      });
      return;
    }

    if (!record.attachment) {
      notification.error({
        message: "File PDF tidak ditemukan pada data ini.",
      });
      return;
    }

    try {
      setProcessingPdf(true);

      // 2. Fetch File Statis dari Backend
      // Pastikan URL path statisnya benar sesuai config fastify static Anda
      const staticUrl = `${backEndUrlPdf}/files/handover/${record.attachment}`;

      const response = await fetch(staticUrl);
      if (!response.ok) throw new Error("Gagal mengunduh file PDF asli");

      // Ambil data binary (ArrayBuffer)
      const existingPdfBytes = await response.arrayBuffer();

      // 3. Load ke PDF-Lib (Frontend Processing)
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // 4. Tambahkan Text Print Date di Halaman Pertama
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      // const { height } = firstPage.getSize(); // jika butuh koordinat dinamis

      const printDate =
        dayjs().tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm") + " WIB";

      const { height } = firstPage.getSize(); // misal 842

      firstPage.drawText(`Print Date: ${printDate}`, {
        x: 40,
        y: height - 15,
        size: 8,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });

      // 5. Simpan Hasil Edit menjadi Blob
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });

      // 6. Buat URL Object sementara
      const objectUrl = URL.createObjectURL(blob);
      setPdfBlobUrl(objectUrl);

      // 7. Buka Modal
      setIsModalOpen(true);
    } catch (error) {
      console.error(error);
      notification.error({
        message: "Gagal Memproses PDF",
        description: error.message,
      });
    } finally {
      setProcessingPdf(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Bersihkan memory URL agar tidak memory leak
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
  };

  const loadAllSJBeforeExport = async () => {
    const promises = data.map((bundle) => loadSJ(bundle.key));
    const datas = await Promise.all(promises); // pastikan semua selesai

    console.log("data ss : ", datas);
  };

  const exportExcel = async () => {
    const loadingMsg = message.loading("Mengambil data untuk export...", 0);
    console.log("data : ", data);

    try {
      // 1. Pastikan semua SJ ter-load dulu dari server
      await loadAllSJBeforeExport();

      if (!data || data.length === 0) {
        loadingMsg();
        message.warning("Tidak ada data untuk diexport");
        return;
      }

      let excelData = [];

      // 2. Loop setiap Bundle
      data.forEach((bundle) => {
        const sjs = sjData[bundle.key] || [];

        if (sjs.length > 0) {
          sjs.forEach((sj, index) => {
            excelData.push({
              "NO BUNDLE": index === 0 ? bundle.documentno : "",
              "NO SJ": sj.documentno,
            });
          });
        } else {
          excelData.push({
            "NO BUNDLE": bundle.documentno,
            "NO SJ": "",
          });
        }
      });

      loadingMsg(); // Hapus loading

      // 3. Buat Worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Opsional: Atur lebar kolom biar rapi saat dibuka
      worksheet["!cols"] = [
        { wch: 25 }, // Lebar kolom NO BUNDLE
        { wch: 20 }, // Lebar kolom NO SJ
      ];

      // 4. Download File
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data Bundle SJ");

      const filename = `Bundle_SJ_Export_${dayjs().format("YYYYMMDD_HHmmss")}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      loadingMsg();
      console.error("Export Error:", error);
      message.error("Gagal melakukan export excel");
    }
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
      title: "From",
      dataIndex: "fromactor",
      align: "center",
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
            <Popover content={"Waiting"}>
              <Tag color="gold">
                <HourglassOutlined />
              </Tag>
            </Popover>
          );
        }

        return (
          <Popover content={"Completed"}>
            <Tag color="green">
              <CheckCircleOutlined />
            </Tag>
          </Popover>
        );
      },
    },
    {
      title: "Actions",
      dataIndex: "actions",
      align: "center",
      render: (text, record) => (
        <Button
          icon={<PrinterOutlined />}
          type="default"
          onClick={() => handlePrint(record)}
          loading={processingPdf} // Loading saat fetch & edit pdf
          disabled={loading}
        ></Button>
      ),
    },
  ];

  const expandedRow = (record) => {
    const rows = sjData[record.key];

    if (!rows) {
      return <div style={{ padding: 20 }}>Loading SJ...</div>;
    }

    return (
      <div style={{ padding: "5px 25px" }}>
        <Table
          columns={[
            { title: "SJ No", dataIndex: "documentno" },
            { title: "Driver", dataIndex: "drivername" },
          ]}
          dataSource={rows.map((r) => ({ ...r, key: r.adw_trackingsj_id }))}
          pagination={false}
          size="small"
          bordered // <-- Kelihatan lebih rapi
          style={{ margin: 0 }}
          scroll={{ x: "max-content" }}
        />
      </div>
    );
  };

  return (
    <>
      <div
        style={{ marginBottom: 10, marginLeft: 10, display: "flex", gap: 10 }}
      >
        {/* Input Filter Bundle */}
        <input
          type="text"
          placeholder="Cari Bundle No..."
          value={bundleSearch}
          onChange={(e) => setBundleSearch(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #ccc",
            width: 200,
          }}
        />

        {/* Tombol Search */}
        <Button
          icon={<SearchOutlined />}
          type="primary"
          onClick={handleSearchBundle}
        ></Button>

        <Button
          icon={<SyncOutlined />}
          type="default"
          onClick={handleResetFilter}
        ></Button>

        <Button
          icon={<DownloadOutlined />}
          type="default"
          onClick={exportExcel}
        ></Button>
      </div>

      <Table
        loading={loading}
        columns={columns}
        dataSource={data}
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (record) => expandedRow(record),
          onExpand: (expanded, record) => {
            if (expanded) loadSJ(record.key);
          },
        }}
      />
      <Modal
        styles={{ content: { padding: 10 } }}
        title="Preview Document"
        open={isModalOpen}
        onCancel={handleCloseModal}
        footer={[
          <Button key="close" onClick={handleCloseModal}>
            Close
          </Button>,
        ]}
        width={1000} // Lebar modal
        style={{ top: 20 }}
      >
        {pdfBlobUrl ? (
          <iframe
            src={pdfBlobUrl}
            width="100%"
            height="600px"
            style={{ border: "none" }}
            title="PDF Preview"
          />
        ) : (
          <div style={{ textAlign: "center", padding: 50 }}>
            <Spin tip="Generating PDF Preview..." />
          </div>
        )}
      </Modal>
    </>
  );
};

export default HistoryBundleReceipt;
