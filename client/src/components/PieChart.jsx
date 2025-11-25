import React from "react";
import ReactECharts from "echarts-for-react";

const PieChart = ({ data }) => {
  const option = {
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const d = params.data;
        // return `
        //   <b>${d.name}</b><br/>
        //   Jumlah Doc: ${d.totalDocShipment || 0}<br/>
        //   Amount: Rp ${d.Amount?.toLocaleString() || 0}<br/>
        //   Persentase: ${d.percentage || params.percent}%
        // `;
        return `
          <b>${d.name}</b><br/>
          Jumlah Doc: ${d.totalDocShipment || 0}<br/>
          Persentase: ${d.percentage || params.percent}%
        `;
      },
    },
    legend: {
      orient: "horizontal",
      bottom: 0,
    },
    series: [
      {
        name: "Distribusi",
        type: "pie",
        radius: "60%",
        center: ["50%", "45%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: "#fff",
          borderWidth: 2,
        },
        // label: {
        //   show: true,
        //   formatter: (params) => {
        //     const d = params.data;
        //     return `${d.name}\n${d.percentage || params.percent}%`;
        //   },
        // },
        label: {
          position: 'inner',
          fontSize: 14,
          formatter: (params) => {
            const d = params.data;
            return `${d.percentage}%`;
          },
        },
        labelLine: {
          show: false
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
        selectedMode: "single", // klik slice untuk "explode"
        data: data.map((item) => ({
          value: item.value || item.percentage || 0,
          name: item.type,
          totalDocShipment: item.totalDocShipment,
          Amount: item.Amount,
          percentage: item.percentage,
        })),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />;
};

export default PieChart;
