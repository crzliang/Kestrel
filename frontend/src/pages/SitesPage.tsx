import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Pagination,
  Space,
  Table,
  Typography,
  message,
  Popconfirm,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import TrackingSnippet from '../components/TrackingSnippet';
import {
  createSite,
  deleteSite,
  updateSite,
} from '../services/api';
import { useSiteStore } from '../store/site';
import { ALL_SITES_ID } from '../constants/sites';
import { siteHref } from '../utils/siteRoutes';
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form] = Form.useForm<FormValues>();
  const watchedName = Form.useWatch('name', form);
  const watchedDomain = Form.useWatch('domain', form);

  useEffect(() => {
    void refreshSites().catch((e) =>
      setError(e instanceof Error ? e.message : '加载失败'),
    );
  }, [refreshSites]);

  const pagedSites = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sites.slice(start, start + pageSize);
  }, [sites, page, pageSize]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(sites.length / pageSize) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [sites.length, pageSize, page]);

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
        navigate(siteHref(res.site.id));
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
        setSiteId(ALL_SITES_ID);
      }
      await refreshSites();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="page sites-page">
      <PageHeader
        title="站点管理"
        description="创建与编辑站点；在编辑弹窗中复制埋点代码。点击左侧站点可查看数据。"
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

      <div className="page-body sites-body">
        <Card className="chart-card page-fill-card sites-list-card" bordered>
          <div className="page-fill-scroll">
            <Table
              className="utility-table"
              loading={loading}
              rowKey="id"
              dataSource={pagedSites}
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
                          navigate(siteHref(row.id));
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
          </div>
          <div className="sites-pagination">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={sites.length}
              showSizeChanger
              pageSizeOptions={[10, 20, 50]}
              showTotal={(total) => `共 ${total} 个站点`}
              onChange={(nextPage, nextSize) => {
                setPage(nextPage);
                setPageSize(nextSize);
              }}
            />
          </div>
        </Card>
      </div>

      <Modal
        className="site-edit-modal"
        title={editing ? '编辑站点' : '新建站点'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void onSubmit()}
        confirmLoading={saving}
        destroyOnClose
        okText="保存"
        width={editing ? 640 : 480}
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

        {editing ? (
          <div className="site-edit-snippet">
            <TrackingSnippet
              compact
              siteId={editing.id}
              siteName={watchedName || editing.name}
              siteDomain={watchedDomain || editing.domain}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
