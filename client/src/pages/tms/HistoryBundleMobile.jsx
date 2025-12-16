import React, { useState } from "react";
import { Tabs } from "antd-mobile";
import LayoutGlobalMobile from "../../components/layouts/LayoutGlobalMobile"; // Sesuaikan path
import HistoryBundleHandoverMobile from "./HistoryBundleHandoverMobile";
import HistoryBundleReceiptMobile from "./HistoryBundleReceiptMobile";
import { useSelector } from "react-redux";

const HistoryBundleMobile = () => {
    const user = useSelector((state) => state.auth.user);
    const role = user?.title;

    // Default tab
    const [activeTab, setActiveTab] = useState("handover");

    // === CASE 1: ROLE FAT → hanya show receipt ===
    if (role === "fat") {
        return (
            <LayoutGlobalMobile title="History Receipt">
                <HistoryBundleReceiptMobile />
            </LayoutGlobalMobile>
        );
    }

    // === CASE 2: ROLE LAIN → Tabs Handover & Receipt ===
    return (
        <LayoutGlobalMobile title="History Bundle">
            <div style={{ background: '#fff', position: 'sticky', top: 45, zIndex: 99 }}>
                <Tabs activeKey={activeTab} onChange={setActiveTab}>
                    <Tabs.Tab title={role === "driver" ? "Check Out" : "Handover"} key="handover" />
                    <Tabs.Tab title="Receipt" key="receipt" />
                </Tabs>
            </div>

            <div style={{ marginTop: 10 }}>
                {activeTab === "handover" && <HistoryBundleHandoverMobile />}
                {activeTab === "receipt" && <HistoryBundleReceiptMobile />}
            </div>
        </LayoutGlobalMobile>
    );
};

export default HistoryBundleMobile;