import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useAuthStore } from '../store/auth';
import { useSettingsStore } from '../store/settings';
import { useThemeStore } from '../store/theme';

type CredsForm = {
  username: string;
  password: string;
};

type TotpForm = {
  totpCode: string;
};

function BrandMark({ logoUrl }: { logoUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <img
        className="brand-logo"
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="brand-mark" aria-hidden />;
}

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const completeTotpLogin = useAuthStore((s) => s.completeTotpLogin);
  const mode = useThemeStore((s) => s.mode);
  const settings = useSettingsStore((s) => s.settings);
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [credsForm] = Form.useForm<CredsForm>();
  const [totpForm] = Form.useForm<TotpForm>();

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    document.title = `${settings.title} · 登录`;
  }, [settings.title]);

  const mapError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('invalid_totp')) return '验证码不正确或已过期';
    if (msg.includes('challenge_expired')) return '验证已过期，请重新登录';
    if (msg.includes('invalid_credentials') || msg.includes('401')) {
      return '用户名或密码不正确';
    }
    if (msg.includes('Failed to fetch') || msg.includes('Network')) {
      return '无法连接 API，请确认 mock-api 已启动（端口 8088）';
    }
    if (msg.includes('404') || msg.includes('not_found')) {
      return '登录接口不可用，请重启 mock-api 后再试';
    }
    return '登录失败，请稍后重试';
  };

  const onCreds = async (values: CredsForm) => {
    setLoading(true);
    setError(null);
    try {
      const result = await login(values.username.trim(), values.password);
      if (result?.requiresTotp) {
        setChallengeToken(result.challengeToken);
        totpForm.resetFields();
      }
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoading(false);
    }
  };

  const onTotp = async (values: TotpForm) => {
    if (!challengeToken) return;
    setLoading(true);
    setError(null);
    try {
      await completeTotpLogin(challengeToken, values.totpCode.trim());
    } catch (e) {
      setError(mapError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`login-page${mode === 'dark' ? ' is-dark' : ''}`}>
      <div className="login-panel">
        <div className="login-brand">
          <BrandMark logoUrl={settings.logoUrl} />
          <div className="brand-text">
            <span className="brand-name">{settings.title}</span>
            {settings.subtitle ? (
              <span className="brand-sub">{settings.subtitle}</span>
            ) : null}
          </div>
        </div>
        <Typography.Title level={3} className="login-title">
          {challengeToken ? '双因素验证' : '登录控制台'}
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="login-desc">
          {challengeToken
            ? '请输入身份验证器中的 6 位动态码。'
            : '使用管理员账号访问站点分析与管理功能。'}
        </Typography.Paragraph>
        {error ? (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {challengeToken ? (
          <Form
            form={totpForm}
            layout="vertical"
            onFinish={(v) => void onTotp(v)}
            requiredMark={false}
          >
            <Form.Item
              label="验证码"
              name="totpCode"
              rules={[
                { required: true, message: '请输入验证码' },
                { pattern: /^\d{6}$/, message: '应为 6 位数字' },
              ]}
            >
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                size="large"
                maxLength={6}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              验证并登录
            </Button>
            <Button
              type="link"
              block
              style={{ marginTop: 8 }}
              onClick={() => {
                setChallengeToken(null);
                setError(null);
              }}
            >
              返回账号密码
            </Button>
          </Form>
        ) : (
          <Form
            form={credsForm}
            layout="vertical"
            onFinish={(v) => void onCreds(v)}
            requiredMark={false}
          >
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input autoFocus autoComplete="username" placeholder="admin" size="large" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password autoComplete="current-password" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              登录
            </Button>
          </Form>
        )}
        {!challengeToken ? (
          <p className="login-hint">默认账号 admin / admin123（首次部署自动创建）</p>
        ) : null}
      </div>
    </div>
  );
}
