import { useEffect, useMemo } from 'react';
import { Layout, Button, Dropdown, Tooltip, Typography } from 'antd';
import {
  MoonOutlined,
  SunOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import TrendsPage from './pages/TrendsPage';
import MapPage from './pages/MapPage';
import SourcesPage from './pages/SourcesPage';
import DevicesPage from './pages/DevicesPage';
import PagesPage from './pages/PagesPage';
import BehaviorPage from './pages/BehaviorPage';
import SitesPage from './pages/SitesPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import SiteSidebar from './components/SiteSidebar';
import { useAuthStore } from './store/auth';
import { useSiteStore } from './store/site';
import { useSettingsStore } from './store/settings';
import { useThemeStore } from './store/theme';

const { Header, Sider, Content } = Layout;

const TABS = [
  { key: '/', label: '总览', to: '/' },
  { key: '/behavior', label: '行为', to: '/behavior' },
  { key: '/devices', label: '设备', to: '/devices' },
  { key: '/map', label: '地图', to: '/map' },
  { key: '/trends', label: '趋势', to: '/trends' },
];

const ADMIN_PATHS = new Set(['/sites', '/settings']);

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    siteId,
    setSiteId,
    sites,
    sparklines,
    refreshSites,
    loading,
  } = useSiteStore();
  const { mode, toggle } = useThemeStore();
  const token = useAuthStore((s) => s.token);
  const account = useAuthStore((s) => s.account);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const logout = useAuthStore((s) => s.logout);
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const brandTitle = useSettingsStore((s) => s.settings.title);

  useEffect(() => {
    void bootstrap();
    void refreshSettings();
  }, [bootstrap, refreshSettings]);

  useEffect(() => {
    document.title = brandTitle ? `${brandTitle} Analytics` : 'Kestrel Analytics';
  }, [brandTitle]);

  useEffect(() => {
    if (!token) return;
    void refreshSites().catch(() => {
      /* API 未就绪时保留本地 siteId */
    });
  }, [token, refreshSites]);

  const currentSite = useMemo(
    () => sites.find((s) => s.id === siteId),
    [sites, siteId],
  );

  const onSelectSite = (id: string) => {
    setSiteId(id);
    navigate('/');
  };

  if (!bootstrapped) {
    return <div className="app-boot">加载中…</div>;
  }

  if (!token || !account) {
    return <LoginPage />;
  }

  const crumbLabel =
    location.pathname === '/sites'
      ? '站点管理'
      : location.pathname === '/settings'
        ? '系统设置'
        : null;

  return (
    <Layout className="app-shell">
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        className="app-sider"
        width={260}
      >
        <SiteSidebar
          sites={sites}
          siteId={siteId}
          sparklines={sparklines}
          loading={loading}
          onSelect={onSelectSite}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-crumb">
            <Link to="/" className="crumb-muted crumb-link">
              Workspace
            </Link>
            <span className="crumb-sep">/</span>
            {crumbLabel ? (
              <span className="crumb-current">{crumbLabel}</span>
            ) : (
              <Link to="/" className="crumb-current crumb-link">
                {currentSite?.name ?? siteId}
              </Link>
            )}
          </div>
          <div className="header-actions">
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'profile',
                    disabled: true,
                    label: (
                      <span>
                        {account.displayName}
                        <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                          @{account.username}
                        </Typography.Text>
                      </span>
                    ),
                  },
                  { type: 'divider' },
                  {
                    key: 'settings',
                    icon: <UserOutlined />,
                    label: '系统设置',
                    onClick: () => navigate('/settings'),
                  },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: '退出登录',
                    onClick: () => void logout(),
                  },
                ],
              }}
            >
              <Button className="theme-toggle" icon={<UserOutlined />}>
                {account.displayName}
              </Button>
            </Dropdown>
            <Tooltip title={mode === 'light' ? '切换深色' : '切换浅色'}>
              <Button
                className="theme-toggle"
                icon={mode === 'light' ? <MoonOutlined /> : <SunOutlined />}
                onClick={toggle}
                aria-label="Toggle theme"
              />
            </Tooltip>
          </div>
        </Header>

        {!ADMIN_PATHS.has(location.pathname) && (
          <nav className="top-tabs" aria-label="分析模块">
            {TABS.map((tab) => (
              <Link
                key={tab.key}
                to={tab.to}
                className={`top-tab${location.pathname === tab.key ? ' is-active' : ''}`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}

        <Content className="app-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/behavior" element={<BehaviorPage />} />
            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/pages" element={<PagesPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
