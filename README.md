# Kestrel Analytics

基于腾讯云 EdgeOne 的轻量级、实时、隐私友好型网站分析工具。

## 核心目标

- **实时**：边缘采集与秒级展示
- **轻量**：追踪脚本 < 5KB（gzip）
- **隐私优先**：默认不收集 PII
- **云原生**：EdgeOne Pages + Edge Functions + KV + Blob

## 仓库结构

```
packages/shared/     # 共享类型与 Zod schema
edge-functions/      # EdgeOne API（/v1/track、/v1/stats/*）
tracking-script/     # 埋点 SDK（构建产物 dist/kestrel.js）
frontend/            # React 仪表盘
docs/                # 技术文档
```

## 快速开始

```bash
npm install
npm run build -w @kestrel/shared
npm run build:tracker   # 输出 tracking-script/dist/kestrel.js
npm run dev             # 仪表盘 http://localhost:5173
npm test                # 本地冒烟：track → realtime/trend + 脚本体积
```

嵌入追踪脚本：

```html
<script
  defer
  src="https://cdn.example.com/kestrel.js?v=0.1.0"
  data-site="YOUR_SITE_ID"
  data-endpoint="https://your-pages.edgeone.app/v1/track"
></script>
```

## EdgeOne 部署

1. 控制台创建 Pages 项目，绑定 KV 变量名 `kestrel_kv`。
2. Blob 命名空间使用 `kestrel-blob`（首次 `getStore` 自动创建）。
3. 安装 CLI：`npm i -g edgeone`，在仓库根目录执行 `edgeone pages deploy`（按控制台构建目录指向 `frontend/dist`）。

本地无 KV/Blob 绑定时，边缘函数内置内存回退，便于联调类型与路由。

## 文档

- [技术蓝图](./docs/TECHNICAL.md)
- [追踪脚本防缓存 & KV/Blob 读写](./docs/TRACKING-AND-STORAGE.md)
