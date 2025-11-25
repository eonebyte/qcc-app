// // Tambahkan 'useMemo' ke dalam import React
// import React, { useState, useEffect, useMemo } from "react";
// import {
//   Layout,
//   Typography,
//   Card,
//   Row,
//   Col,
//   Statistic,
//   Progress,
//   Spin,
//   Tooltip,
//   Space,
//   message,
//   Skeleton,
//   DatePicker,
//   Select,
//   Button,
//   Popover,
// } from "antd";
// import {
//   ArrowUpOutlined,
//   ClockCircleOutlined,
//   CarOutlined,
//   InboxOutlined,
//   SolutionOutlined,
//   FileDoneOutlined,
//   DollarOutlined,
//   FilterOutlined,
// } from "@ant-design/icons";
// import dayjs from "dayjs";


// import LayoutGlobal from "../components/layouts/LayoutGlobal";
// import PieChart from "../components/PieChart";

// const { Header, Content } = Layout;
// const { Title, Text } = Typography;

// const monthOptions = [
//   { label: "Januari", value: 1 },
//   { label: "Februari", value: 2 },
//   { label: "Maret", value: 3 },
//   { label: "April", value: 4 },
//   { label: "Mei", value: 5 },
//   { label: "Juni", value: 6 },
//   { label: "Juli", value: 7 },
//   { label: "Agustus", value: 8 },
//   { label: "September", value: 9 },
//   { label: "Oktober", value: 10 },
//   { label: "November", value: 11 },
//   { label: "Desember", value: 12 },
// ];

// const yearOptions = Array.from({ length: 6 }, (_, i) => {
//   const y = new Date().getFullYear() - i;
//   return { label: `${y}`, value: y };
// });

// const backEndUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3200';


// const Home = () => {


//   const [selectedYear, setSelectedYear] = useState(null);
//   const [selectedMonths, setSelectedMonths] = useState([]);
//   const [openDelivery, setOpenDelivery] = useState(false);
//   const [openTP, setOpenTP] = useState(false);
//   const [openMKT, setOpenMKT] = useState(false);


//   const handleApply = () => {
//     console.log("Tahun:", selectedYear);
//     console.log("Bulan:", selectedMonths);
//     // 🔹 Lakukan fetch data dashboard di sini berdasarkan filter
//     // setOpen(false);
//   };

//   const handleReset = () => {
//     setSelectedYear(null);
//     setSelectedMonths([]);
//   };

//   const filterContent = (
//     <div style={{ padding: 12, width: 250 }}>
//       <Space direction="vertical" style={{ width: "100%" }}>
//         <Select
//           placeholder="Pilih Tahun"
//           options={yearOptions}
//           value={selectedYear}
//           onChange={setSelectedYear}
//           style={{ width: "100%" }}
//         />
//         <Select
//           mode="multiple"
//           placeholder="Pilih Bulan"
//           options={monthOptions}
//           value={selectedMonths}
//           onChange={setSelectedMonths}
//           style={{ width: "100%" }}
//           maxTagCount="responsive"
//         />
//         <Space
//           style={{
//             display: "flex",
//             justifyContent: "flex-end",
//             marginTop: 8,
//           }}
//         >
//           <Button type="primary" size="small" onClick={handleApply}>
//             Terapkan
//           </Button>
//           <Button size="small" onClick={handleReset}>
//             Reset
//           </Button>
//           <Button type="link" size="small" onClick={() => { }
//             //setOpen(false)
//           }>
//             Tutup
//           </Button>
//         </Space>
//       </Space>
//     </div>
//   );


//   const [selectedMonth, _] = useState(dayjs()); // Default bulan ini
//   const [dashboardData, setDashboardData] = useState({
//     chartData: [],
//     summary: { totalPV: 0, totalRate: 0 },
//     stats: [
//       { key: "dnToday", title: "DN Today", value: null, loading: true, icon: <SolutionOutlined /> },
//       { key: "doneMkt", title: "Handover to MKT", value: null, loading: true, icon: <SolutionOutlined /> },
//       // { key: "waitingFromDPK", title: "Waiting from DPK", value: null, loading: true, icon: <ClockCircleOutlined /> },
//       { key: "notYetToDPK", title: "Pending from DPK", value: null, loading: true, icon: <FileDoneOutlined /> },
//       { key: "notYetToMkt", title: "Pending to MKT", value: null, loading: true, icon: <FileDoneOutlined /> },
//     ],
//   });

//   const [dashboardDataThirdParty, setDashboardDataThirdParty] = useState({
//     chartData: [],
//     summary: { totalPV: 0, totalRate: 0 },
//   });

//   const [dashboardDataMkt, setDashboardDataMkt] = useState({
//     chartData: [],
//     summary: { totalPV: 0, totalRate: 0 },
//   });





//   const [loading, setLoading] = useState(false);

//   const fetchData = async (month) => {
//     setLoading(true);
//     const monthParam = month.format("YYYYMM"); // Format: 2025-01

//     try {

//       // ✅ fetch semua statistik (lazy load)
//       fetch(`${backEndUrl}/tms/dashboard/summary/today`, {
//         method: 'GET',
//         credentials: 'include' // This ensures cookies, HTTP auth, etc., are sent
//       })
//         .then((res) => res.json())
//         .then((resultDoc) => {
//           if (resultDoc.success) {
//             const {
//               waitingFromDPK,
//               notYetToMkt,
//               doneMkt,
//               notYetToDPK
//             } = resultDoc.data;

//             setDashboardData((prev) => {
//               const newStats = prev.stats.map((s) => {
//                 switch (s.key) {
//                   case "dnToday":
//                     return { ...s, value: waitingFromDPK, loading: false };
//                   case "notYetToMkt":
//                     return { ...s, value: notYetToMkt, loading: false };
//                   case "doneMkt":
//                     return { ...s, value: doneMkt, loading: false };
//                   case "notYetToDPK":
//                     return { ...s, value: notYetToDPK, loading: false };
//                   default:
//                     return s;
//                 }
//               });

//               return { ...prev, stats: newStats };
//             });
//           }
//         })
//         .catch((err) => {
//           console.error("Error fetch stats:", err);
//           message.error("Gagal memuat data statistik");
//         });

//       // ✅ fetch summary dulu (cepat)
//       const resSummary = await fetch(`${backEndUrl}/tms/dashboard/summary/month?month=${monthParam}`, {
//         method: 'GET',
//         credentials: 'include' // This ensures cookies, HTTP auth, etc., are sent
//       });
//       const resultSummary = await resSummary.json();

//       console.log('resSummary :', resultSummary);


//       if (resultSummary.success) {
//         const { delivery, thirdParty, marketing } = resultSummary.data;

//         const totalPending = Number(delivery.pending.totalDoc || 0);
//         const totalMilkRunAndSC = Number(delivery.milkRunAndSC.totalDoc || 0);
//         const totalDPK = Number(delivery.handoverToDPK.totalDoc || 0);
//         const totalMKT = Number(delivery.handoverToMkt.totalDoc || 0);
//         const totalAll = totalPending + totalMilkRunAndSC + totalDPK + totalMKT;

//         const totalThirdPartyPending = Number(thirdParty.pending.totalDoc || 0);
//         const totalThirdPartyHandoverToDriver = Number(thirdParty.handoverToDriver.totalDoc || 0);
//         const totalThirdPartyHandoverToDelivery = Number(thirdParty.handoverToDelivery.totalDoc || 0);
//         const totalThirdPartyAll = totalThirdPartyPending + totalThirdPartyHandoverToDriver + totalThirdPartyHandoverToDelivery

//         const totalMktToFAT = Number(marketing.handoverToFAT.totalDoc || 0);
//         const totalMktPending = Number(marketing.pending.totalDoc || 0);
//         const totalMktAll = totalMktToFAT + totalMktPending;

//         function customRoundUp(value) {
//           const decimal = value - Math.floor(value);
//           if (decimal > 0.5) {
//             return Math.ceil(value);
//           } else {
//             return Math.round(value);
//           }
//         }

//         setDashboardData((prev) => {
//           return {
//             ...prev,
//             chartData: [
//               {
//                 type: "Handover to DPK",
//                 totalDocShipment: totalDPK,
//                 Amount: delivery.handoverToDPK.totalAmount,
//                 percentage:
//                   totalAll > 0 ? customRoundUp((totalDPK / totalAll) * 100) : 0,
//               },
//               {
//                 type: "Handover to MKT",
//                 totalDocShipment: totalMKT,
//                 Amount: delivery.handoverToMkt.totalAmount,
//                 percentage:
//                   totalAll > 0 ? customRoundUp((totalMKT / totalAll) * 100) : 0,
//               },
//               {
//                 type: "Pending",
//                 totalDocShipment: totalPending,
//                 Amount: delivery.pending.totalAmount,
//                 percentage:
//                   totalAll > 0 ? customRoundUp((totalPending / totalAll) * 100) : 0,
//               },
//               {
//                 type: "Milk Run & SC",
//                 totalDocShipment: totalMilkRunAndSC,
//                 Amount: delivery.milkRunAndSC.totalAmount,
//                 percentage:
//                   totalAll > 0 ? customRoundUp((totalMilkRunAndSC / totalAll) * 100) : 0,
//               },
//             ],
//           };
//         });

//         setDashboardDataThirdParty((prev) => {
//           return {
//             ...prev,
//             chartData: [
//               {
//                 type: "Handover to Driver",
//                 totalDocShipment: totalThirdPartyHandoverToDriver,
//                 // Amount: thirdParty.handoverToDriver.totalAmount,
//                 percentage:
//                   totalThirdPartyAll > 0 ? customRoundUp((totalThirdPartyHandoverToDriver / totalThirdPartyAll) * 100) : 0,
//               },
//               {
//                 type: "Handover to Delivery",
//                 totalDocShipment: totalThirdPartyHandoverToDelivery,
//                 // Amount: thirdParty.handoverToDelivery.totalAmount,
//                 percentage:
//                   totalThirdPartyAll > 0 ? customRoundUp((totalThirdPartyHandoverToDelivery / totalThirdPartyAll) * 100) : 0,
//               },
//               {
//                 type: "Pending",
//                 totalDocShipment: totalThirdPartyPending,
//                 // Amount: thirdParty.pending.totalAmount,
//                 percentage:
//                   totalThirdPartyAll > 0 ? customRoundUp((totalThirdPartyPending / totalThirdPartyAll) * 100) : 0,
//               },
//             ],
//           };
//         });

//         setDashboardDataMkt((prev) => {
//           return {
//             ...prev,
//             chartData: [
//               {
//                 type: "Handover to FAT",
//                 totalDocShipment: totalMktToFAT,
//                 Amount: marketing.handoverToFAT.totalAmount,
//                 percentage:
//                   totalMktAll > 0 ? customRoundUp((totalMktToFAT / totalMktAll) * 100) : 0,
//               },
//               {
//                 type: "Pending",
//                 totalDocShipment: totalMktPending,
//                 Amount: marketing.pending.totalAmount,
//                 percentage:
//                   totalMktAll > 0 ? customRoundUp((totalMktPending / totalMktAll) * 100) : 0,
//               },
//             ],
//           };
//         });
//       }
//     } catch (err) {
//       console.error("Error:", err);
//       message.error("Gagal memuat data");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchData(selectedMonth);
//   }, [selectedMonth]);

//   // const handleMonthChange = (date) => {
//   //   if (date) {
//   //     setSelectedMonth(date);
//   //   }
//   // };

//   const totalChartValue = useMemo(() => {
//     return dashboardData.chartData.reduce(
//       (sum, item) => sum + (item.percentage || 0),
//       0
//     );
//   }, [dashboardData.chartData]);


//   return (
//     <LayoutGlobal>
//       {/* Header */}
//       <Header
//         style={{
//           backgroundColor: "white",
//           display: "flex",
//           justifyContent: "space-between",
//           alignItems: "center",
//           borderBottom: "1px solid #f0f0f0",
//           padding: "0 24px",
//           height: 50
//         }}
//       >
//         <Title level={5} style={{ margin: 0 }}>
//           Summary Today
//         </Title>
//       </Header>

//       {/* Content */}
//       <Content style={{ padding: "15px" }}>
//         <Spin spinning={loading} tip="Memuat data..." size="large">
//           <Row gutter={[12, 0]}>
//             {/* Statistik */}
//             {dashboardData.stats.map((stat) => (
//               <Col xs={24} sm={12} lg={6} key={stat.title}>
//                 <Card>
//                   {stat.loading ? (
//                     <Skeleton active paragraph={false} title={{ width: "60%" }} />
//                   ) : (
//                     <Tooltip title={stat.tooltip}>
//                       <Statistic
//                         title={<Text type="secondary">{stat.title}</Text>}
//                         value={stat.value}
//                         prefix={stat.icon}
//                         valueStyle={{ color: "#3f8600" }}
//                       />
//                     </Tooltip>
//                   )}
//                   {/* {stat.type === "progress" ? (
//                     <Tooltip title={stat.tooltip}>
//                       <Text type="secondary">{stat.title}</Text>
//                       <Progress percent={stat.value} />
//                     </Tooltip>
//                   ) : (
//                     <Tooltip title={stat.tooltip}>
//                       <Statistic
//                         title={<Text type="secondary">{stat.title}</Text>}
//                         value={stat.value}
//                         prefix={stat.icon}
//                         valueStyle={{ color: "#3f8600" }}
//                       />
//                     </Tooltip>
//                   )} */}
//                 </Card>
//               </Col>
//             ))}

//             {/* Grafik Pie */}
//             {/* Grafik Pie */}
//             {/* DELIVERY */}
//             <Col xs={24} lg={8}>
//               <Card
//                 title={
//                   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                     <span>Delivery</span>
//                     <Popover
//                       content={filterContent}
//                       trigger="click"
//                       placement="bottomRight"
//                       open={openDelivery}
//                       onOpenChange={setOpenDelivery}
//                     >
//                       <Button
//                         icon={<FilterOutlined />}
//                         type={selectedYear || selectedMonths.length > 0 ? "primary" : "default"}
//                       >
//                         {selectedYear
//                           ? `${selectedYear}${selectedMonths.length > 0
//                             // ? ` (${selectedMonths.length} bulan)`
//                             ? ` (Multiple)`
//                             : ""
//                           }`
//                           : "Filter"}
//                       </Button>
//                     </Popover>
//                   </div>
//                 }
//                 style={{
//                   minHeight: 400, // ✅ card jadi lebih tinggi
//                   display: "flex",
//                   flexDirection: "column",
//                   justifyContent: "center",
//                 }}
//                 bodyStyle={{ flex: 1, padding: "16px" }}
//               >
//                 {totalChartValue > 0 ? (
//                   <div style={{ width: "100%", height: "320px" }}>
//                     {/* ✅ kasih tinggi agar chart tidak numpuk */}
//                     <PieChart data={dashboardData.chartData} />
//                   </div>
//                 ) : (
//                   <div style={{ textAlign: "center", padding: "50px 0" }}>
//                     <Text type="secondary">
//                       Tidak ada data untuk ditampilkan pada grafik.
//                     </Text>
//                   </div>
//                 )}
//               </Card>
//             </Col>

//             {/* Third Party */}
//             <Col xs={24} lg={8}>
//               <Card
//                 title={
//                   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
//                     <span>Third Party</span>
//                     <Popover
//                       content={filterContent}
//                       trigger="click"
//                       placement="bottomRight"
//                       open={openTP}
//                       onOpenChange={setOpenTP}
//                     >
//                       <Button
//                         icon={<FilterOutlined />}
//                         type={selectedYear || selectedMonths.length > 0 ? "primary" : "default"}
//                       >
//                         {selectedYear
//                           ? `${selectedYear}${selectedMonths.length > 0
//                             // ? ` (${selectedMonths.length} bulan)`
//                             ? ` (Multiple)`
//                             : ""
//                           }`
//                           : "Filter"}
//                       </Button>
//                     </Popover>
//                   </div>
//                 }
//                 style={{
//                   minHeight: 400, // ✅ card jadi lebih tinggi
//                   display: "flex",
//                   flexDirection: "column",
//                   justifyContent: "center",
//                 }}
//                 bodyStyle={{ flex: 1, padding: "16px" }}
//               >
//                 {totalChartValue > 0 ? (
//                   <div style={{ width: "100%", height: "320px" }}>
//                     {/* ✅ kasih tinggi agar chart tidak numpuk */}
//                     <PieChart data={dashboardDataThirdParty.chartData} />
//                   </div>
//                 ) : (
//                   <div style={{ textAlign: "center", padding: "50px 0" }}>
//                     <Text type="secondary">
//                       Tidak ada data untuk ditampilkan pada grafik.
//                     </Text>
//                   </div>
//                 )}
//               </Card>
//             </Col>

//             {/* MKT */}
//             <Col xs={24} lg={8}>
//               <Card
//                 title={
//                   <div
//                     style={{
//                       display: "flex",
//                       justifyContent: "space-between",
//                       alignItems: "center",
//                       gap: 12,
//                     }}
//                   >
//                     <span style={{ fontWeight: 500 }}>Marketing</span>
//                     <Popover
//                       content={filterContent}
//                       trigger="click"
//                       placement="bottomRight"
//                       open={openMKT}
//                       onOpenChange={setOpenMKT}
//                     >
//                       <Button
//                         icon={<FilterOutlined />}
//                         type={selectedYear || selectedMonths.length > 0 ? "primary" : "default"}
//                       >
//                         {selectedYear
//                           ? `${selectedYear}${selectedMonths.length > 0
//                             // ? ` (${selectedMonths.length} bulan)`
//                             ? ` (Multiple)`
//                             : ""
//                           }`
//                           : "Filter"}
//                       </Button>
//                     </Popover>
//                   </div>
//                 }
//                 style={{
//                   minHeight: 400,
//                   display: "flex",
//                   flexDirection: "column",
//                   justifyContent: "center",
//                 }}
//                 bodyStyle={{ flex: 1, padding: "16px" }}
//               >
//                 {totalChartValue > 0 ? (
//                   <div style={{ width: "100%", height: "320px" }}>
//                     <PieChart data={dashboardDataMkt.chartData} />
//                   </div>
//                 ) : (
//                   <div style={{ textAlign: "center", padding: "50px 0" }}>
//                     <Text type="secondary">
//                       Tidak ada data untuk ditampilkan pada grafik.
//                     </Text>
//                   </div>
//                 )}
//               </Card>

//             </Col>


//           </Row>
//         </Spin>
//       </Content>
//     </LayoutGlobal>
//   );
// };

// export default Home;

import { Result } from 'antd'
import React from 'react'
import LayoutGlobal from '../components/layouts/LayoutGlobal'


export default function Home() {
  return (
    <LayoutGlobal>
      <div>
        <Result
          status="warning"
          title="Process Maintenance."
        // extra={
        //   <Button type="primary" key="console">
        //     Go Console
        //   </Button>
        // }
        />
      </div>
    </LayoutGlobal>

  )
}

