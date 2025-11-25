import React, { useState } from "react";
import { Tabs } from "antd";
import CheckInRoundTrip from "./CheckInRoundTrip";
import LayoutGlobal from "../../../components/layouts/LayoutGlobal";
import CheckInDropOnly from "./CheckInDropOnly";

export default function CheckIn() {

    const [activeKey, setActiveKey] = useState("1");

    const onChange = (key) => {
        setActiveKey(key);

        // Lakukan fetch di sini
        if (key === "1") {
            window.dispatchEvent(new Event("fetch-roundtrip"));
        } else if (key === "2") {
            window.dispatchEvent(new Event("fetch-droponly"));
        }
    };
    const items = [
        {
            key: "1",
            label: "Round Trip",
            children: (
                <CheckInRoundTrip />
            ),
        },
        {
            key: "2",
            label: "Drop Only",
            children: (
                <CheckInDropOnly />
            ),
        },
    ];

    return (
        <LayoutGlobal>
            <div style={{ padding: 20 }}>
                <Tabs
                    type="card"
                    activeKey={activeKey}
                    onChange={onChange}
                    items={items}
                />
            </div>
        </LayoutGlobal>

    );
}
