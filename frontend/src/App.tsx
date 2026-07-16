import { useEffect, useMemo } from 'react';
import { Layout, Button, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
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
import SiteSidebar from './components/SiteSidebar';
import { useSiteStore } from './store/site';
import { useThemeStore } from './store/theme';

const { Header, Sider, Content } = Layout;

const TABS = [
  { key: '/', label: '总览', to: '/' },
  { key: '/behavior', label: '行为', to: '/behavior' },
  { key: '/devices', label: '设备', to: '/devices' },
  { key: '/map', label: '地图', to: '/map' },
  { key: '/trends', label: '趋势', to: '/trends' },
];

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

  useEffect(() => {
    void refreshSites().catch(() => {
      /* API 未就绪时保留本地 siteId */
    });
  }, [refreshSites]);

  const currentSite = useMemo(
    () => sites.find((s) => s.id === siteId),
    [sites, siteId],
  );

  const onSelectSite = (id: string) => {
    setSiteId(id);
    // 点侧栏具体站点 → 回到数据预览（总览）
    navigate('/');
  };

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
            {location.pathname === '/sites' ? (
              <span className="crumb-current">站点管理</span>
            ) : (
              <Link to="/" className="crumb-current crumb-link">
                {currentSite?.name ?? siteId}
              </Link>
            )}
          </div>
          <div className="header-actions">
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

        {location.pathname !== '/sites' && (
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
