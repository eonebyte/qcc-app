import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Layout, theme, ConfigProvider, Menu, Button, Flex, message, Dropdown, Space, Avatar, Typography } from "antd";
import PropTypes from "prop-types";
import FooterAdmin from "./FooterAdmin";
import { useDispatch, useSelector } from "react-redux";
import HeaderGlobal from "./HeaderGlobal";
import { toggleDarkMode } from "../../states/reducers/themeSlice";
import { AppstoreOutlined, DeliveredProcedureOutlined, DownOutlined, FieldTimeOutlined, FileExclamationOutlined, FolderAddOutlined, HistoryOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, MoonOutlined, SunOutlined, TruckFilled } from '@ant-design/icons';
import { logout } from '../../states/reducers/authSlice';
const { Text } = Typography;
const { Header, Footer, Sider, Content } = Layout;
const { defaultAlgorithm, darkAlgorithm } = theme;

const items = [
    {
        key: '/',
        label: 'Home',
        icon: <AppstoreOutlined />
    },
    {
        key: "/outstanding",
        label: "Outstanding",
        icon: <FileExclamationOutlined />,
        roles: ['admin', 'delivery', 'dpk', 'fat', 'marketing']
    },
    {
        key: "/receipt",
        label: "Receipt",
        icon: <FolderAddOutlined />,
        children: [
            {
                key: '/receipt/delivery/from/dpk',
                label: 'from DPK',
                roles: ['delivery']
            },
            {
                key: '/receipt/dpk/from/delivery',
                label: 'from Delivery',
                roles: ['dpk']
            },
            {
                key: '/receipt/dpk/from/driver',
                label: 'from Driver',
                roles: ['dpk']
            },
            {
                key: '/receipt/driver/from/dpk',
                label: 'from DPK',
                roles: ['driver']
            },
            {
                key: '/receipt/mkt/from/delivery',
                label: 'from Delivery',
                roles: ['marketing']
            },
            {
                key: '/receipt/fat/from/mkt',
                label: 'from Marketing',
                roles: ['fat']
            },
        ],
        roles: ['admin', 'delivery', 'dpk', 'driver', 'fat', 'marketing']
    },
    {
        key: "/list/handover",
        label: "Handover",
        icon: <DeliveredProcedureOutlined />,
        children: [
            {
                key: '/handover/delivery/to/dpk',
                label: 'to DPK',
                roles: ['delivery']
            },
            {
                key: '/handover/delivery/to/mkt',
                label: 'to MKT',
                roles: ['delivery']
            },
            {
                key: '/handover/dpk/to/driver',
                label: 'to Driver',
                roles: ['dpk']
            },
            {
                key: '/handover/dpk/to/delivery',
                label: 'to Delivery',
                roles: ['dpk']
            },
            {
                key: '/handover/checkin/customer',
                label: 'Check In Customer',
                roles: ['driver']
            },
            {
                key: '/handover/mkt/to/fat',
                label: 'to Fat',
                roles: ['marketing']
            },
        ],
        roles: ['admin', 'delivery', 'dpk', 'driver', 'marketing']
    },
    {
        key: "/history",
        label: "History",
        icon: <HistoryOutlined />,
        roles: ['delivery', 'dpk', 'driver', 'marketing', 'fat']
    },
    {
        key: "/progress-shipment",
        label: "Progress Shipment",
        icon: <FieldTimeOutlined />,
        roles: ['admin', 'delivery', 'dpk', 'fat', 'marketing']
    },
    {
        key: "5",
        label: "Tracking",
        icon: <TruckFilled />,
        children: [

        ],
    },
];


const boxStyle = {
    width: '100%',
};

// const findParentKey = (path, currentItems) => {
//     for (const item of currentItems) {
//         if (item.children) {
//             const hasChild = item.children.some(child => child.key === path);
//             if (hasChild) {
//                 return item.key;
//             }
//         }
//     }
//     return null;
// };


function LayoutGlobal({ children }) {
    const user = useSelector((state) => state.auth.user);

    const dispatch = useDispatch();
    const isDarkMode = useSelector((state) => state.theme.isDarkMode);
    const navigate = useNavigate();

    const handleLogout = () => {
        dispatch(logout()).then(async (result) => {
            if (result.payload && result.payload.success) {
                console.log('logout successful:', result.payload);
                navigate('/');
            } else {
                message.error(result.payload ? result.payload.message : 'Logout failed');
            }
        });
    };

    const itemsDropdown = [
        {
            key: '1',
            label: 'Logout',
            icon: <LogoutOutlined />,
            onClick: handleLogout
        },
    ];


    const role = user.title;

    // Gunakan useMemo agar proses filter tidak berjalan di setiap render, hanya saat 'role' berubah
    const visibleItems = useMemo(() => {
        // Fungsi untuk memfilter menu item dan anak-anaknya
        const filterMenu = (menuItems) => {
            return menuItems.map(item => {
                // Cek apakah item ini punya anak
                if (item.children) {
                    // Filter anak-anaknya terlebih dahulu secara rekursif
                    const visibleChildren = filterMenu(item.children);

                    // Jika setelah difilter, item ini masih punya anak yang terlihat,
                    // maka tampilkan item ini beserta anak-anaknya.
                    if (visibleChildren.length > 0) {
                        return { ...item, children: visibleChildren };
                    }
                    // Jika tidak, sembunyikan item induk ini
                    return null;
                }

                // Jika item tidak punya anak, cek perannya
                // Tampilkan jika: 1. Tidak ada properti 'roles', ATAU 2. 'roles' mengandung peran pengguna saat ini
                if (!item.roles || item.roles.includes(role)) {
                    return item;
                }

                return null;
            }).filter(Boolean); // Hapus semua item yang bernilai null dari array
        };

        return filterMenu(items);
    }, [role]);

    const [collapsed, setCollapsed] = useState(false);

    const {
        token: { colorBgContainer, borderRadiusLG, boxShadow },
    } = theme.useToken();
    const navigateTo = useNavigate();
    const locationPath = useLocation();

    const mapPathToKey = (pathname) => {
        if (pathname.startsWith("/history")) return "/history";
        if (pathname.startsWith("/list/handover")) return "/list/handover";
        if (pathname.startsWith("/receipt")) return "/receipt";
        if (pathname.startsWith("/outstanding")) return "/outstanding";
        if (pathname === "/") return "/";
        return pathname; // fallback
    };

    const [selectedKeys, setSelectedKeys] = useState([mapPathToKey(locationPath.pathname)]);

    useEffect(() => {
        setSelectedKeys([mapPathToKey(locationPath.pathname)]);
    }, [locationPath.pathname]);



    const handleClick = () => {
        dispatch(toggleDarkMode());
    };

    const handleMenuClick = ({ key }) => {
        setSelectedKeys([key]);
        navigateTo(key);
    };

    const allOpenKeys = visibleItems
        .filter(item => item.children && item.children.length > 0)
        .map(item => item.key);

    const [openKeys, setOpenKeys] = useState(allOpenKeys);

    const handleOpenChange = (keys) => {
        setOpenKeys(keys);
    };


    return (
        <ConfigProvider
            theme={{
                algorithm: isDarkMode ? darkAlgorithm : defaultAlgorithm,
                components: {
                    Layout: {
                        headerHeight: 45, // default 64, kita kecilin jadi 48
                    },
                },
            }}
        >
            <Layout style={{ minHeight: "100vh", margin: "0" }}>
                <Sider
                    trigger={null}
                    collapsible
                    collapsed={collapsed}
                    style={{ position: 'relative' }}
                >
                    {/* Kontainer untuk konten yang bisa di-scroll */}
                    <div>
                        <div className="demo-logo-vertical" />
                        <Menu
                            inlineIndent={8}
                            theme="dark"
                            mode="inline"
                            selectedKeys={selectedKeys}
                            openKeys={openKeys}
                            onOpenChange={handleOpenChange}
                            items={visibleItems}
                            onClick={handleMenuClick}
                        />
                    </div>
                </Sider>

                <Layout>
                    <Header
                        style={{
                            padding: 0,
                            background: colorBgContainer,
                            display: "flex",
                            alignItems: "center",
                            borderBottom: isDarkMode ? "1px solid black" : "1px solid #e3e6f0",
                        }}
                    >
                        <Flex style={boxStyle} justify="space-between" align="center">
                            <Button
                                type="text"
                                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                                onClick={() => setCollapsed(!collapsed)}
                                style={{
                                    fontSize: "16px",
                                    width: 64,
                                    height: 64,
                                }}
                            />
                            <img style={{ marginLeft: "15px", marginRight: "15px", }} width={110} src="/src/assets/images/logo-api.png" alt="" />
                            {/* <MoreOutlined onClick={toggleBox} style={{ marginRight: '15px', fontSize: '18px' }} /> */}
                            <Space>
                                <Dropdown
                                    menu={{
                                        items: itemsDropdown,
                                    }}
                                >
                                    <Space>
                                        <Text>{user.name}</Text>
                                        <DownOutlined />
                                    </Space>
                                </Dropdown>
                                <Button style={{ marginRight: '15px' }} size="small" onClick={handleClick}>
                                    {isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                                </Button>
                            </Space>
                        </Flex>
                    </Header>
                    <Content
                        style={{
                            margin: "5px",
                            backgroundColor: isDarkMode ? "#001529" : colorBgContainer,
                            minHeight: 360,
                            borderRadius: borderRadiusLG,
                            border: isDarkMode ? "1px solid black" : "1px solid #e3e6f0",
                            boxShadow: boxShadow,
                        }}
                    >
                        {children || null}
                    </Content>
                    <FooterAdmin />
                </Layout>
            </Layout>
        </ConfigProvider>
    );
}

LayoutGlobal.propTypes = {
    children: PropTypes.node,
    onMenuClick: PropTypes.func,
};
export default LayoutGlobal;
