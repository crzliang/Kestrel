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
import AllSitesGuard from './components/AllSitesGuard';
import { useAuthStore } from './store/auth';
import { useSiteStore } from './store/site';
import { useSettingsStore } from './store/settings';
import { useThemeStore } from './store/theme';
import { ALL_SITES_ID, ALL_SITES_LABEL, isAllSites } from './constants/sites';
import {
  parseSiteLocation,
  siteHref,
  type AnalysisPage,
} from './utils/siteRoutes';

const { Header, Sider, Content } = Layout;

const TABS: Array<{ key: AnalysisPage; label: string }> = [
  { key: '', label: '总览' },
  { key: 'behavior', label: '行为' },
  { key: 'devices', label: '设备' },
  { key: 'map', label: '地图' },
  { key: 'trends', label: '趋势' },
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
    allSparkline,
    allSummary,
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

  const parsed = useMemo(
    () => parseSiteLocation(location.pathname),
    [location.pathname],
  );

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

  // URL is source of truth for analysis pages
  useEffect(() => {
    if (parsed.admin || !parsed.siteId) return;
    if (parsed.siteId !== siteId) setSiteId(parsed.siteId);
  }, [parsed.admin, parsed.siteId, setSiteId, siteId]);

  // Drop stale /s/:siteId when the site no longer exists
  useEffect(() => {
    if (parsed.admin || !parsed.siteId || isAllSites(parsed.siteId)) return;
    if (sites.length === 0) return;
    if (!sites.some((s) => s.id === parsed.siteId)) {
      setSiteId(ALL_SITES_ID);
      navigate(siteHref(ALL_SITES_ID, parsed.page), { replace: true });
    }
  }, [sites, parsed.admin, parsed.siteId, parsed.page, setSiteId, navigate]);

  const currentSite = useMemo(
    () => sites.find((s) => s.id === siteId),
    [sites, siteId],
  );

  const onSelectSite = (id: string) => {
    setSiteId(id);
    if (parsed.admin) {
      navigate(siteHref(id));
      return;
    }
    navigate(siteHref(id, parsed.page));
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

  const activeTab = parsed.admin ? null : parsed.page;

  return (
    <Layout className="app-shell">
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        className="app-sider"
        width={280}
      >
        <SiteSidebar
          sites={sites}
          siteId={siteId}
          sparklines={sparklines}
          allSparkline={allSparkline}
          allSummary={allSummary}
          loading={loading}
          onSelect={onSelectSite}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-crumb">
            <Link to={siteHref(ALL_SITES_ID)} className="crumb-muted crumb-link">
              Workspace
            </Link>
            <span className="crumb-sep">/</span>
            {crumbLabel ? (
              <span className="crumb-current">{crumbLabel}</span>
            ) : (
              <Link to={siteHref(siteId)} className="crumb-current crumb-link">
                {isAllSites(siteId)
                  ? ALL_SITES_LABEL
                  : (currentSite?.name ?? siteId)}
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
                key={tab.key || 'overview'}
                to={siteHref(siteId, tab.key)}
                className={`top-tab${activeTab === tab.key ? ' is-active' : ''}`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}

        <Content className="app-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/behavior"
              element={
                <AllSitesGuard>
                  <BehaviorPage />
                </AllSitesGuard>
              }
            />
            <Route
              path="/sources"
              element={
                <AllSitesGuard>
                  <SourcesPage />
                </AllSitesGuard>
              }
            />
            <Route
              path="/pages"
              element={
                <AllSitesGuard>
                  <PagesPage />
                </AllSitesGuard>
              }
            />
            <Route
              path="/devices"
              element={
                <AllSitesGuard>
                  <DevicesPage />
                </AllSitesGuard>
              }
            />
            <Route
              path="/map"
              element={
                <AllSitesGuard>
                  <MapPage />
                </AllSitesGuard>
              }
            />
            <Route
              path="/trends"
              element={
                <AllSitesGuard>
                  <TrendsPage />
                </AllSitesGuard>
              }
            />
            <Route path="/s/:siteId" element={<DashboardPage />} />
            <Route path="/s/:siteId/behavior" element={<BehaviorPage />} />
            <Route path="/s/:siteId/sources" element={<SourcesPage />} />
            <Route path="/s/:siteId/pages" element={<PagesPage />} />
            <Route path="/s/:siteId/devices" element={<DevicesPage />} />
            <Route path="/s/:siteId/map" element={<MapPage />} />
            <Route path="/s/:siteId/trends" element={<TrendsPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
