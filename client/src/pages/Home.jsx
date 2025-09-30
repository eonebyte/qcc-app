// Tambahkan 'useMemo' ke dalam import React
import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Select, Typography, Card, Row, Col, Statistic, Progress, Spin, Tooltip, Space } from 'antd';
import { ArrowUpOutlined, ClockCircleOutlined, CarOutlined, InboxOutlined, FileDoneOutlined } from '@ant-design/icons';
import { Pie } from '@ant-design/charts';
import LayoutGlobal from '../components/layouts/LayoutGlobal';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// Data dummy tidak berubah...
const DUMMY_SUMMARY_DATA = {
  delivery: {
    stats: [
      { title: 'SJ Baru Hari Ini', value: 12, icon: <InboxOutlined />, tooltip: 'Surat Jalan baru dari Oracle yang perlu diproses.' },
      { title: 'Menunggu Dikembalikan', value: 3, icon: <ClockCircleOutlined />, tooltip: 'SJ yang sudah selesai dan menunggu diserahkan ke Marketing.' },
      { title: 'Total Diproses Minggu Ini', value: 78, icon: <FileDoneOutlined />, tooltip: 'Total SJ yang sudah masuk ke alur kerja minggu ini.' },
      { title: 'Tingkat Penyelesaian', value: 85, type: 'progress', tooltip: 'Persentase SJ yang sudah mencapai tahap akhir.' },
    ],
    chartData: [
      { type: 'Dalam Proses DPK', value: 27 },
      { type: 'Di Driver', value: 22 },
      { type: 'Proses Kembali', value: 15 },
      { type: 'Selesai', value: 14 },
    ],
  },
  dpk: {
    stats: [
      { title: 'Menunggu Diterima (dari Delivery)', value: 4, icon: <InboxOutlined />, tooltip: 'SJ baru dari Delivery yang perlu diterima.' },
      { title: 'Siap Diserahkan ke Driver', value: 8, icon: <CarOutlined />, tooltip: 'SJ yang sudah diproses dan siap diberikan ke Driver.' },
      { title: 'Menunggu Diterima (dari Driver)', value: 2, icon: <ClockCircleOutlined />, tooltip: 'SJ yang kembali dari pengiriman dan perlu diterima.' },
      { title: 'Kapasitas Gudang Terpakai', value: 65, type: 'progress', tooltip: 'Estimasi kapasitas gudang yang terpakai untuk SJ transit.' },
    ],
    chartData: [
      { type: 'Siap untuk Driver', value: 8 },
      { type: 'Menunggu dari Delivery', value: 4 },
      { type: 'Menunggu dari Driver', value: 2 },
    ],
  },
  driver: {
    stats: [
      { title: 'Pengiriman Aktif', value: 6, icon: <CarOutlined />, tooltip: 'Jumlah SJ yang sedang dalam proses pengiriman.' },
      { title: 'Menunggu Penerimaan', value: 5, icon: <ClockCircleOutlined />, tooltip: 'SJ dari DPK yang belum diambil.' },
      { title: 'Pengiriman Selesai Hari Ini', value: 15, icon: <FileDoneOutlined />, tooltip: 'Total pengiriman yang berhasil diselesaikan hari ini.' },
      { title: 'Tingkat Keberhasilan', value: 96, type: 'progress', tooltip: 'Persentase pengiriman berhasil vs total pengiriman.' },
    ],
    chartData: [
      { type: 'Dalam Perjalanan', value: 6 },
      { type: 'Menunggu Diambil', value: 5 },
      { type: 'Terkirim', value: 15 },
    ],
  },
  marketing: {
    stats: [
      { title: 'Dokumen Diterima Hari Ini', value: 7, icon: <FileDoneOutlined />, tooltip: 'Dokumen SJ yang sudah selesai dan diterima hari ini.' },
      { title: 'Menunggu Verifikasi', value: 2, icon: <ClockCircleOutlined />, tooltip: 'Dokumen yang diterima tapi belum diverifikasi.' },
      { title: 'Total Dokumen Bulan Ini', value: 124, icon: <ArrowUpOutlined />, tooltip: 'Akumulasi dokumen yang diterima bulan ini.' },
    ],
    chartData: [
      { type: 'Sudah Verifikasi', value: 122 },
      { type: 'Menunggu Verifikasi', value: 2 },
    ],
  },
  // Data dummy untuk 'fat' sengaja dibuat dengan nilai 0 untuk menguji solusi
  fat: {
    stats: [
      { title: 'Dokumen Siap Proses', value: 0, icon: <FileDoneOutlined />, tooltip: 'Dokumen dari Driver/DPK yang siap diproses finance.' },
      { title: 'Proses Tertunda', value: 0, icon: <ClockCircleOutlined />, tooltip: 'Dokumen yang memerlukan informasi tambahan.' },
      { title: 'Total Diproses Bulan Ini', value: 98, icon: <ArrowUpOutlined />, tooltip: 'Akumulasi dokumen yang telah selesai diproses bulan ini.' },
    ],
    chartData: [
      { type: 'Selesai Diproses', value: 0 },
      { type: 'Tertunda', value: 0 },
    ],
  },
};

const Home = () => {
  const [currentRole, setCurrentRole] = useState('delivery');
  const [dashboardData, setDashboardData] = useState({ stats: [], chartData: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetchData = () => {
      setDashboardData(DUMMY_SUMMARY_DATA[currentRole] || { stats: [], chartData: [] });
      setLoading(false);
    };
    setTimeout(fetchData, 500);
  }, [currentRole]);

  // --- SOLUSI DIMULAI DI SINI ---
  // 1. Hitung total nilai dari data chart menggunakan useMemo agar efisien.
  const totalChartValue = useMemo(() =>
    dashboardData.chartData.reduce((sum, item) => sum + item.value, 0),
    [dashboardData.chartData]
  );

  const pieChartConfig = {
    appendPadding: 10,
    data: dashboardData.chartData,
    angleField: 'value',
    colorField: 'type',
    radius: 0.9,
    label: {
      offset: '-30%',
      content: ({ percent }) => `${(percent * 100).toFixed(0)}%`,
      style: { fontSize: 14, textAlign: 'center' },
    },
    interactions: [{ type: 'element-active' }],
  };

  return (
    <LayoutGlobal>
      <Header style={{ backgroundColor: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0', padding: '0 24px' }}>
        <Title level={3} style={{ margin: 0 }}>Dashboard Ringkasan TMS</Title>
        <Space>
          <Text>Tampilkan Dashboard untuk:</Text>
          <Select value={currentRole} style={{ width: 150 }} onChange={(value) => setCurrentRole(value)}>
            <Option value="delivery">Delivery</Option>
            <Option value="dpk">DPK</Option>
            <Option value="driver">Driver</Option>
            <Option value="marketing">Marketing</Option>
            <Option value="fat">FAT</Option>
          </Select>
        </Space>
      </Header>

      <Content style={{ padding: '24px' }}>
        <Spin spinning={loading} tip="Memuat data..." size="large">
          <Row gutter={[24, 24]}>
            {/* Kolom statistik tidak berubah */}
            {dashboardData.stats.map(stat => (
              <Col xs={24} sm={12} lg={6} key={stat.title}>
                <Card>
                  {stat.type === 'progress' ? (
                    <Tooltip title={stat.tooltip}>
                      <Text type="secondary">{stat.title}</Text>
                      <Progress percent={stat.value} />
                    </Tooltip>
                  ) : (
                    <Tooltip title={stat.tooltip}>
                      <Statistic
                        title={<Text type="secondary">{stat.title}</Text>}
                        value={stat.value}
                        prefix={stat.icon}
                        valueStyle={{ color: '#3f8600' }}
                      />
                    </Tooltip>
                  )}
                </Card>
              </Col>
            ))}

            {/* Kolom untuk Grafik */}
            <Col xs={24} lg={12}>
              <Card title="Distribusi Tugas Saat Ini">
                {/* 2. Gunakan totalChartValue untuk kondisi rendering */}
                {totalChartValue > 0 ? (
                  <Pie {...pieChartConfig} height={250} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '50px 0' }}>
                    <Text type="secondary">Tidak ada data untuk ditampilkan pada grafik.</Text>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </Spin>
      </Content>
    </LayoutGlobal>
  );
};

export default Home;