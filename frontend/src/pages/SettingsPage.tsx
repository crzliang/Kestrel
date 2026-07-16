import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import { UploadOutlined, LogoutOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import QRCode from 'qrcode';
import PageHeader from '../components/PageHeader';
import {
  beginTotpSetup,
  changePassword,
  confirmTotpSetup,
  disableTotp,
  ApiError,
} from '../services/api';
import { useAuthStore } from '../store/auth';
import { useSettingsStore } from '../store/settings';

type BrandForm = {
  title: string;
  subtitle: string;
  logoUrl: string;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type TotpEnableForm = { code: string };
type TotpDisableForm = { password: string; code: string };

const LOGO_MAX_BYTES = 200_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const refresh = useSettingsStore((s) => s.refresh);
  const account = useAuthStore((s) => s.account);
  const setAccount = useAuthStore((s) => s.setAccount);
  const logout = useAuthStore((s) => s.logout);

  const [brandForm] = Form.useForm<BrandForm>();
  const [passwordForm] = Form.useForm<PasswordForm>();
  const [totpEnableForm] = Form.useForm<TotpEnableForm>();
  const [totpDisableForm] = Form.useForm<TotpDisableForm>();

  const [savingBrand, setSavingBrand] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [logoPreview, setLogoPreview] = useState(settings.logoUrl);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);

  const totpEnabled = Boolean(account?.totpEnabled);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    brandForm.setFieldsValue({
      title: settings.title,
      subtitle: settings.subtitle,
      logoUrl: settings.logoUrl,
    });
    setLogoPreview(settings.logoUrl);
  }, [settings, brandForm]);

  const onSaveBrand = async () => {
    const values = await brandForm.validateFields();
    setSavingBrand(true);
    try {
      await save({
        title: values.title.trim(),
        subtitle: values.subtitle?.trim() ?? '',
        logoUrl: values.logoUrl?.trim() ?? '',
      });
      message.success('品牌设置已保存');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingBrand(false);
    }
  };

  const onChangePassword = async () => {
    const values = await passwordForm.validateFields();
    setSavingPassword(true);
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.resetFields();
      message.success('密码已更新');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        message.error('当前密码不正确');
      } else {
        message.error(e instanceof Error ? e.message : '修改失败');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const onBeginTotp = async () => {
    setTotpBusy(true);
    try {
      const res = await beginTotpSetup();
      setTotpSecret(res.secret);
      const qr = await QRCode.toDataURL(res.otpauthUrl, {
        width: 180,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setTotpQr(qr);
      totpEnableForm.resetFields();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '无法开始设置');
    } finally {
      setTotpBusy(false);
    }
  };

  const onConfirmTotp = async () => {
    const values = await totpEnableForm.validateFields();
    setTotpBusy(true);
    try {
      const res = await confirmTotpSetup({ code: values.code });
      setAccount(res.account);
      setTotpSecret(null);
      setTotpQr(null);
      message.success('已开启双因素认证');
    } catch (e) {
      if (e instanceof ApiError && e.body.includes('invalid_totp')) {
        message.error('验证码不正确');
      } else {
        message.error(e instanceof Error ? e.message : '开启失败');
      }
    } finally {
      setTotpBusy(false);
    }
  };

  const onDisableTotp = async () => {
    const values = await totpDisableForm.validateFields();
    setTotpBusy(true);
    try {
      const res = await disableTotp({
        password: values.password,
        code: values.code,
      });
      setAccount(res.account);
      totpDisableForm.resetFields();
      message.success('已关闭双因素认证');
    } catch (e) {
      if (e instanceof ApiError && e.body.includes('invalid_totp')) {
        message.error('验证码不正确');
      } else if (e instanceof ApiError && e.status === 401) {
        message.error('密码不正确');
      } else {
        message.error(e instanceof Error ? e.message : '关闭失败');
      }
    } finally {
      setTotpBusy(false);
    }
  };

  const uploadProps: UploadProps = {
    accept: 'image/png,image/jpeg,image/webp,image/svg+xml',
    showUploadList: false,
    beforeUpload: async (file) => {
      if (file.size > LOGO_MAX_BYTES) {
        message.error('Logo 请小于 200KB');
        return Upload.LIST_IGNORE;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        brandForm.setFieldValue('logoUrl', dataUrl);
        setLogoPreview(dataUrl);
        message.success('已选择 Logo，请点击保存');
      } catch {
        message.error('读取图片失败');
      }
      return Upload.LIST_IGNORE;
    },
  };

  return (
    <div className="page settings-page">
      <PageHeader
        title="系统设置"
        description={
          account
            ? `配置控制台品牌、登录密码与双因素认证。当前账号 ${account.displayName}（@${account.username}）`
            : '配置控制台品牌、登录密码与双因素认证。'
        }
        extra={
          <Button
            icon={<LogoutOutlined />}
            onClick={() => void logout()}
          >
            退出登录
          </Button>
        }
      />

      <div className="settings-stack">
        <Card className="chart-card" bordered title="品牌">
          <Form form={brandForm} layout="vertical" requiredMark="optional">
            <div className="settings-brand-fields">
              <Form.Item
                label="站点标题"
                name="title"
                rules={[{ required: true, message: '请输入标题' }]}
              >
                <Input placeholder="Kestrel" maxLength={80} />
              </Form.Item>
              <Form.Item label="副标题" name="subtitle">
                <Input placeholder="Analytics" maxLength={80} />
              </Form.Item>
            </div>
            <Form.Item name="logoUrl" hidden noStyle>
              <Input />
            </Form.Item>
            <Form.Item label="Logo">
              <Space align="start" size={16} wrap>
                <div className="settings-logo-preview">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo 预览" />
                  ) : (
                    <span className="brand-mark" aria-hidden />
                  )}
                </div>
                <Space direction="vertical" size={8}>
                  <Upload {...uploadProps}>
                    <Button icon={<UploadOutlined />}>上传图片</Button>
                  </Upload>
                  <Button
                    type="link"
                    size="small"
                    disabled={!logoPreview}
                    onClick={() => {
                      brandForm.setFieldValue('logoUrl', '');
                      setLogoPreview('');
                    }}
                  >
                    清除 Logo
                  </Button>
                  <div className="settings-logo-hint">
                    支持 PNG / JPG / WebP / SVG，建议正方形，小于 200KB
                  </div>
                </Space>
              </Space>
            </Form.Item>
            <div className="settings-actions">
              <Button type="primary" loading={savingBrand} onClick={() => void onSaveBrand()}>
                保存品牌
              </Button>
            </div>
          </Form>
        </Card>

        <Card className="chart-card" bordered title="登录密码">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="单一管理员账号（默认 admin），在此修改登录密码。"
          />
          <Form form={passwordForm} layout="vertical" requiredMark="optional">
            <Form.Item
              label="当前密码"
              name="currentPassword"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              label="新密码"
              name="newPassword"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '至少 6 位' },
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              label="确认新密码"
              name="confirmPassword"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入不一致'));
                  },
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <div className="settings-actions">
              <Button
                type="primary"
                loading={savingPassword}
                onClick={() => void onChangePassword()}
              >
                更新密码
              </Button>
            </div>
          </Form>
        </Card>

        <Card
          className="chart-card settings-card-totp"
          bordered
          title={
            <Space size={8}>
              <span>双因素认证（TOTP）</span>
              <Tag color={totpEnabled ? 'green' : 'default'}>
                {totpEnabled ? '已开启' : '未开启'}
              </Tag>
            </Space>
          }
        >
          <Typography.Paragraph type="secondary">
            使用 Google Authenticator、1Password、微软身份验证器等 App 生成 6
            位动态码，登录时额外验证。
          </Typography.Paragraph>

          {totpEnabled ? (
            <Form form={totpDisableForm} layout="vertical" requiredMark="optional">
              <Form.Item
                label="登录密码"
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password autoComplete="current-password" />
              </Form.Item>
              <Form.Item
                label="当前验证码"
                name="code"
                rules={[
                  { required: true, message: '请输入验证码' },
                  { pattern: /^\d{6}$/, message: '应为 6 位数字' },
                ]}
              >
                <Input inputMode="numeric" maxLength={6} placeholder="000000" />
              </Form.Item>
              <Button danger loading={totpBusy} onClick={() => void onDisableTotp()}>
                关闭双因素认证
              </Button>
            </Form>
          ) : totpQr && totpSecret ? (
            <div className="totp-setup">
              <div className="totp-setup-qr">
                <img src={totpQr} alt="TOTP QR code" />
              </div>
              <div className="totp-setup-meta">
                <Typography.Text type="secondary">
                  用验证器扫描二维码，或手动输入密钥：
                </Typography.Text>
                <code className="totp-secret">{totpSecret}</code>
                <Form form={totpEnableForm} layout="vertical" requiredMark="optional">
                  <Form.Item
                    label="输入 App 中的 6 位码以确认"
                    name="code"
                    rules={[
                      { required: true, message: '请输入验证码' },
                      { pattern: /^\d{6}$/, message: '应为 6 位数字' },
                    ]}
                  >
                    <Input
                      autoFocus
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                    />
                  </Form.Item>
                  <Space>
                    <Button
                      type="primary"
                      loading={totpBusy}
                      onClick={() => void onConfirmTotp()}
                    >
                      确认开启
                    </Button>
                    <Button
                      onClick={() => {
                        setTotpQr(null);
                        setTotpSecret(null);
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </Form>
              </div>
            </div>
          ) : (
            <Button type="primary" loading={totpBusy} onClick={() => void onBeginTotp()}>
              开始设置
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
