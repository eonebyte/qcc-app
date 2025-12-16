import { useState } from "react";
import { Menu } from "antd";
import LayoutGlobal from "../../components/layouts/LayoutGlobal";
import HistoryBundleHandover from "./HistoryBundleHandover";
import HistoryBundleReceipt from "./HistoryBundleReceipt";
import { useSelector } from "react-redux";
import useIsMobile from "../../hooks/useIsMobile";
import HistoryBundleMobile from "./HistoryBundleMobile";
const HistoryBundle = () => {
    const isMobile = useIsMobile();
    const user = useSelector((state) => state.auth.user);
    const role = user.title;

    // state tab hanya untuk role selain fat
    const [activeMenu, setActiveMenu] = useState("handover");

    const menuItemStyle = { padding: "6px 12px" };
    const menuStyle = { marginBottom: 5, display: "flex", width: "100%" };

    let labelTab = role === "driver" ? "Check Out" : "Handover";

    // === CASE 1: ROLE FAT → hanya show receipt ===
    if (role === "fat") {
        return (
            <LayoutGlobal>
                <Menu
                    mode="horizontal"
                    selectedKeys={["receipt"]}
                    items={[
                        { label: "Receipt", key: "receipt", style: menuItemStyle }
                    ]}
                    style={menuStyle}
                />
                <HistoryBundleReceipt />
            </LayoutGlobal>
        );
    }

    // === CASE 2: ROLE selain FAT → normal menu ===
    return isMobile ? <HistoryBundleMobile /> : (
        <LayoutGlobal>
            <Menu
                mode="horizontal"
                selectedKeys={[activeMenu]}
                onClick={(e) => setActiveMenu(e.key)}
                items={[
                    { label: labelTab, key: "handover", style: menuItemStyle },
                    { label: "Receipt", key: "receipt", style: menuItemStyle },
                ]}
                style={menuStyle}
            />

            {activeMenu === "handover" && <HistoryBundleHandover />}
            {activeMenu === "receipt" && <HistoryBundleReceipt />}
        </LayoutGlobal>
    );
};

export default HistoryBundle;
