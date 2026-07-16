import React, { useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme as antTheme } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { useThemeStore } from './store/theme';
import './styles.css';

function Root() {
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  const theme = useMemo(
    () => ({
      algorithm:
        mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      token: {
        colorPrimary: mode === 'dark' ? '#34d399' : '#059669',
        colorInfo: mode === 'dark' ? '#60a5fa' : '#2563eb',
        colorBgBase: mode === 'dark' ? '#0b0f14' : '#f7f8fa',
        colorBgContainer: mode === 'dark' ? '#111827' : '#ffffff',
        colorBorder: mode === 'dark' ? '#1f2937' : '#e2e8f0',
        colorText: mode === 'dark' ? '#e5eef7' : '#0f172a',
        colorTextSecondary: mode === 'dark' ? '#94a3b8' : '#64748b',
        fontFamily:
          '"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
        fontFamilyCode: '"IBM Plex Mono", ui-monospace, monospace',
        borderRadius: 10,
        borderRadiusLG: 12,
        borderRadiusSM: 8,
        controlHeight: 36,
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
      },
      components: {
        Layout: {
          bodyBg: 'transparent',
          headerBg: 'transparent',
          siderBg: 'transparent',
        },
        Menu: {
          itemBg: 'transparent',
          subMenuItemBg: 'transparent',
        },
        Card: {
          paddingLG: 20,
        },
        Table: {
          headerBg: 'transparent',
        },
      },
    }),
    [mode],
  );

  return (
    <ConfigProvider theme={theme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
