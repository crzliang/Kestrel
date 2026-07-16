import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Typography,
  message,
  Popconfirm,
} from 'antd';
import { PlusOutlined, CopyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import {
  createSite,
  deleteSite,
  trackingSnippet,
  updateSite,
} from '../services/api';
import { useSiteStore } from '../store/site';
import type { Site } from '@kestrel/shared';

type FormValues = {
  id?: string;
  name: string;
  domain?: string;
};

export default function SitesPage() {
  const navigate = useNavigate();
  const { sites, siteId, setSiteId, refreshSites, loading } = useSiteStore();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    void refreshSites().catch((e) =>
      setError(e instanceof Error ? e.message : '加载失败'),
    );
  }, [refreshSites]);

  const snippet = useMemo(
    () => (siteId ? trackingSnippet(siteId) : ''),
    [siteId],
  );

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (site: Site) => {
    setEditing(site);
    form.setFieldsValue({
      name: site.name,
      domain: site.domain,
    });
    setOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await updateSite(editing.id, {
          name: values.name,
          domain: values.domain ?? '',
        });
        message.success('已更新站点');
      } else {
        const res = await createSite({
          id: values.id?.trim() || undefined,
          name: values.name,
          domain: values.domain ?? '',
        });
        setSiteId(res.site.id);
        message.success('已创建站点');
      }
      setOpen(false);
      await refreshSites();
      setError(null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (site: Site) => {
    try {
      await deleteSite(site.id);
      message.success('已删除');
      if (siteId === site.id) {
        setSiteId('demo');
      }
      await refreshSites();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      message.success('埋点代码已复制');
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="站点管理"
        description="在此创建、编辑站点与复制埋点代码。回到数据预览：点击左侧具体站点。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建站点
          </Button>
        }
      />

      {error && (
        <Alert
          type="warning"
          showIcon
          message="站点列表暂不可用"
          description={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card className="chart-card" bordered style={{ marginBottom: 16 }}>
        <Table
          className="utility-table"
          loading={loading}
          rowKey="id"
          dataSource={sites}
          pagination={false}
          columns={[
            {
              title: '名称',
              dataIndex: 'name',
              render: (name: string, row: Site) => (
                <Space>
                  <strong>{name}</strong>
                  {row.id === siteId ? (
                    <Typography.Text type="secondary">当前</Typography.Text>
                  ) : null}
                </Space>
              ),
            },
            {
              title: 'Site ID',
              dataIndex: 'id',
              render: (id: string) => <code>{id}</code>,
            },
            {
              title: '域名',
              dataIndex: 'domain',
              render: (d: string) => d || '—',
            },
            {
              title: '操作',
              key: 'actions',
              width: 220,
              render: (_: unknown, row: Site) => (
                <Space size="small">
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      setSiteId(row.id);
                      navigate('/');
                    }}
                  >
                    查看数据
                  </Button>
                  <Button type="link" size="small" onClick={() => openEdit(row)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title="删除该站点？"
                    description="不会删除历史统计数据，但将无法再上报到此 ID。"
                    onConfirm={() => void onDelete(row)}
                  >
                    <Button type="link" size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card className="chart-card" bordered title="当前站点埋点代码">
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          将以下代码放入网站 <code>&lt;head&gt;</code> 或页脚。Site ID：
          <code>{siteId}</code>
        </Typography.Paragraph>
        <pre className="snippet-box">{snippet}</pre>
        <Button icon={<CopyOutlined />} onClick={() => void copySnippet()}>
          复制代码
        </Button>
      </Card>

      <Modal
        title={editing ? '编辑站点' : '新建站点'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void onSubmit()}
        confirmLoading={saving}
        destroyOnClose
        okText="保存"
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          {!editing && (
            <Form.Item
              label="Site ID"
              name="id"
              extra="可选；留空则自动生成。创建后不可修改。"
              rules={[
                {
                  pattern: /^[a-zA-Z0-9_-]*$/,
                  message: '仅字母数字下划线与连字符',
                },
              ]}
            >
              <Input placeholder="my-blog" />
            </Form.Item>
          )}
          <Form.Item
            label="站点名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="我的博客" />
          </Form.Item>
          <Form.Item label="主域名" name="domain">
            <Input placeholder="blog.example.com" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
