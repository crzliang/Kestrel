# Kestrel Analytics

> 基于腾讯云 EdgeOne 的轻量级、实时、隐私友好型网站分析。

边缘采集、秒级看板、自托管部署——追踪脚本体积小于 **5KB**（gzip），默认不收集 PII。

**技术栈：** EdgeOne Pages · Edge Functions · KV · Blob · React

---

## 目录

- [特性](#特性)
- [仓库结构](#仓库结构)
- [本地开发](#本地开发)
- [嵌入埋点](#嵌入埋点)
- [EdgeOne 部署](#edgeone-部署)
- [文档](#文档)

---

## 特性

- **实时** — 边缘上报，控制台秒级刷新在线与今日 PV
- **轻量** — 埋点脚本小、对业务站性能影响极低
- **隐私优先** — 默认不采集个人可识别信息
- **云原生** — 全程跑在 EdgeOne，无需自备应用服务器

---

## 仓库结构

```text
Kestrel/
├── packages/shared/     # 共享类型与 Zod schema
├── edge-functions/      # API：/v1/track · /v1/stats/* · /v1/auth/*
├── tracking-script/     # 埋点 SDK → dist/kestrel.js
├── frontend/            # 控制台（React）
├── scripts/             # 本地 mock / seed / smoke
└── docs/                # 技术文档
```

---

## 本地开发

**要求：** Node.js ≥ 18

### 一键启动

```bash
npm install
npm run build -w @kestrel/shared
npm run build:tracker
npm run dev:all
```

| 服务 | 地址 |
| --- | --- |
| 控制台 | http://127.0.0.1:5173 |
| Mock API | http://127.0.0.1:8088 |

### 分步启动

```bash
npm run seed:mock && npm run mock:api   # 造数 + API
npm run dev                             # 控制台
```

### 其他命令

```bash
npm test            # 冒烟：track → realtime/trend + 脚本体积
npm run typecheck   # 全仓类型检查
```

> **提示：** 本地数据在 `.kestrel/mock/`（已 gitignore）。可复制 `.env.example` → `.env`；未配置时默认账号为 `admin` / `admin123`。

---

## 嵌入埋点

```html
<script
  defer
  src="https://your-domain.example/kestrel.js?v=0.1.0"
  data-site="YOUR_SITE_ID"
  data-endpoint="https://your-domain.example/v1/track"
></script>
```

| 属性 | 含义 |
| --- | --- |
| `src` | 埋点脚本地址（建议带版本查询参数） |
| `data-site` | 站点 UUID |
| `data-endpoint` | 上报地址 `/v1/track` |

控制台 **站点管理 → 编辑** 会按当前域名自动生成可复制代码。

---

## EdgeOne 部署

### 存储

| 存储 | 怎么配 |
| --- | --- |
| **KV** | Pages 项目绑定命名空间；**变量名必须填 `kestrel_kv`** |
| **Blob** | 无需手动绑定；`getStore("kestrel-blob")` 首次调用自动创建 |

未绑定时函数会回落内存实现，仅便于联调，**数据不会持久化**。

### 首次管理员（环境变量）

仅在系统中 **还没有任何账号** 时生效：

| 变量 | 建议 | 默认 |
| --- | --- | --- |
| `KESTREL_ADMIN_PASSWORD` | 生产必填 | `admin123`（仅本地回落） |
| `KESTREL_ADMIN_USERNAME` | 可选 | `admin` |

单用户场景下，显示名固定为「管理员」。

### 发布

```bash
npm run build                 # 产物含 frontend/dist
npm i -g edgeone              # 如未安装 CLI
edgeone pages deploy          # 在仓库根目录执行
```

控制台构建目录请指向 `frontend/dist`。

---

## 文档

| 文档 | 内容 |
| --- | --- |
| [技术蓝图](./docs/TECHNICAL.md) | 架构与产品方向 |
| [追踪与存储](./docs/TRACKING-AND-STORAGE.md) | 脚本防缓存、KV / Blob 读写细节 |
