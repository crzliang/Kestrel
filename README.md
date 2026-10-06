# Kestrel

> 基于腾讯云 EdgeOne 的轻量页面计数。HTML 页面请求到达本边缘、且 Host 属于站点的固定域名时，累计站点 PV / UV 与当前页 PV / UV。

边缘累计、KV 存储、自托管部署。追踪脚本体积小于 **5KB**（gzip），只负责把四个数填回页面，不收集 IP、来源或设备信息。

**技术栈：** EdgeOne Pages · 根目录 Middleware · Edge Functions · KV

---

## 目录

- [特性](#特性)
- [仓库结构](#仓库结构)
- [站点配置](#站点配置)
- [本地开发](#本地开发)
- [嵌入埋点](#嵌入埋点)
- [EdgeOne 部署](#edgeone-部署)
- [文档](#文档)

---

## 特性

- **累计计数** — HTML 文档请求到达本边缘且 Host 命中固定域名时，累计站点 PV、页面 PV、站点 UV、页面 UV
- **固定域名** — 只统计 `sites.json` 里列出的主机名；名单为空则不计数。调用接口或伪造 URL 不会加数字
- **轻量** — 埋点脚本只读取四个数，并填进页面上的对应元素
- **隐私优先** — 访客标识是本站 HttpOnly cookie，只存去重标记，不存明文 IP 或原始事件
- **云原生** — 全程跑在 EdgeOne，无需自备应用服务器

---

## 仓库结构

```text
Kestrel/
├── middleware.ts        # 页面请求到达边缘时按 Host 计数
├── sites.json           # 站点 id 与主机名白名单（启动时读入）
├── packages/shared/     # 共享类型与 Zod schema
├── edge-functions/      # API：GET /v1/track（只读）
├── tracking-script/     # 埋点脚本与首页 → dist/kestrel.js、dist/index.html
├── scripts/             # 本地 mock / smoke
└── docs/                # 技术文档
```

---

## 站点配置

站点和域名白名单写在仓库根目录的 `sites.json`，随代码提交。边缘函数和根目录 middleware 在加载时读入这份文件，不再提供站点管理接口。

```json
{
  "sites": [
    { "id": "kestrel", "domain": ["kestrel.crzliang.cn"] },
    { "id": "www", "domain": ["www.crzliang.cn"] },
    { "id": "blog", "domain": ["blog.crzliang.cn"] }
  ]
}
```

| 字段 | 含义 |
| --- | --- |
| `id` | 站点 ID。2–64 位，仅字母、数字、下划线，比较时忽略大小写 |
| `domain` | 主机名白名单。不要写协议、路径、端口或 `*.example.com`。空数组表示该站点不计数 |

比较 Host 时忽略大小写、去掉末尾的点，端口不参与比较。只做精确匹配。`localhost` 和 `127.0.0.1` 可以写进白名单。多个站点写了同一个主机名时，文件里先出现的那个计数。

改完 `sites.json` 后重新部署。文件不合法（重复 id、通配符、带端口的主机名）时，函数在启动时直接失败。

当前文件是 `kestrel`、`www`、`blog` 三个站点，各自只列出自己的主机名。`kestrel` 写在最前，首页构建时用它作为 `data-site`。冒烟测试按这份名单检查 Host 命中；空名单和多主机名只在测试夹具里。

---

## 本地开发

**要求：** Node.js ≥ 18

```bash
npm install
npm run build -w @kestrel/shared
npm run build:tracker
npm run dev
```

Mock 计数服务在 http://127.0.0.1:8088 。它读取同一份 `sites.json`。对非 `/v1` 的 HTML 文档请求按 `Host` 计数，用来代替本地边缘，并返回首页（优先用 `tracking-script/dist/index.html`，还没构建时按同一模板现渲染）。`/kestrel.js` 从该目录提供，不计为访问。计数落在 `.kestrel/mock/counts.json`（已 gitignore）。

浏览器打开 http://127.0.0.1:8088/ 即可看到首页上的四个数。白名单里没有 `127.0.0.1`，所以这次打开本身不会给站点加一；下面这条带 `Host: kestrel.crzliang.cn` 的请求才会计入 `kestrel`。页面脚本再用 `GET /v1/track` 把数字读出来。

```bash
curl -sD - -o /dev/null -H 'Host: kestrel.crzliang.cn' -H 'Accept: text/html' http://127.0.0.1:8088/
curl -s 'http://127.0.0.1:8088/v1/track?siteId=kestrel&path=/'
```

### 其他命令

```bash
npm test            # 冒烟：计数规则、首页产物、脚本体积
npm run typecheck   # 全仓类型检查
npm run dev:tracker # 监听并重建 kestrel.js，并写出 index.html
```

---

## 嵌入埋点

把下面这段放进要展示数字的 HTML。`data-site` 填 `sites.json` 里的站点 `id`。脚本地址是部署后的 `/kestrel.js`。

```html
<script
  defer
  src="https://your-domain.example/kestrel.js?v=0.1.0"
  data-site="YOUR_SITE_ID"
  data-endpoint="https://your-domain.example/v1/track"
></script>
<span id="kestrel_container_site_pv" style="display:none">本站访问 <span id="kestrel_value_site_pv"></span></span>
<span id="kestrel_container_site_uv" style="display:none">本站访客 <span id="kestrel_value_site_uv"></span></span>
<span id="kestrel_container_page_pv" style="display:none">本页访问 <span id="kestrel_value_page_pv"></span></span>
<span id="kestrel_container_page_uv" style="display:none">本页访客 <span id="kestrel_value_page_uv"></span></span>
```

| 属性 / 元素 | 含义 |
| --- | --- |
| `src` | 埋点脚本地址（建议带版本查询参数） |
| `data-site` | 站点 ID，与 `sites.json` 的 `id` 一致 |
| `data-endpoint` | 只读地址 `GET /v1/track`。脚本用它取四个整数，这次请求不计 PV |
| `kestrel_value_*` | 脚本把四个累计数写入这些元素 |
| `kestrel_container_*` | 拿到数字后改为 `inline`，可用来避免先闪出空标签 |

计数发生在文档请求本身，不发生在脚本里。站点的固定域名必须接到**这个** EdgeOne 项目（自定义域名），浏览器打开该主机名下的 HTML 页面时，根目录 `middleware.ts` 用这次请求的 HTTP Host 对 `sites.json` 做精确匹配，命中才记一次。页面路径是这次请求的 pathname 加查询串。

访客是主机名自己的 cookie `kestrel_vid`（HttpOnly，去掉连字符，只保留字母、数字、下划线）。没有 cookie 时边缘发一个新的。脚本不提交访客 ID。

`POST /v1/track` 仍在，但一律返回 405，`error` 为 `not_counted`，不会增加 PV/UV。请求体里的 `url`、`visitorId` 和 `Origin` 都不参与计数。

单页应用里的 `pushState` / `replaceState` 不会产生新的文档请求，因此不会单独计成一次页面访问。只嵌脚本、HTML 不经过本项目时，访问量也不会增加；脚本仍然可以读出当前的四个数。

埋点代码只带站点 ID，不包含白名单。白名单只在 `sites.json`。

---

## EdgeOne 部署

### 存储

| 存储 | 怎么配 |
| --- | --- |
| **KV** | 创建命名空间 **`kestrel_kv`**，绑定到 Pages 项目时变量名也填 **`kestrel_kv`** |

计数只使用 KV。站点名单不进 KV。未绑定时函数会回落内存实现，仅便于联调，**数据不会持久化**。

### 发布

仓库构建产出首页和埋点脚本。根目录 `edgeone.json` 会覆盖控制台里的安装命令、构建命令和输出目录；用 Git 导入时以这份文件为准。Pages「构建设置」与该文件一致：

| 项 | 填写 |
| --- | --- |
| 框架预设 | Other |
| 根目录 | `./` |
| 输出目录 | `tracking-script/dist` |
| 构建命令 | `npm run build` |
| 安装命令 | `npm install` |

或用 CLI：

```bash
npm run build                 # 产物在 tracking-script/dist/：index.html 与 kestrel.js
npm i -g edgeone              # 如未安装 CLI
edgeone pages deploy          # 在仓库根目录执行
```

`middleware.ts` 和 `edge-functions/` 由 EdgeOne 按源码部署，不在静态输出目录里。输出目录里的 `index.html` 作为 `/` 返回。它是 HTML 文档：Host 命中 `sites.json` 时按现有规则计数，根 middleware 不会把它拦下。`kestrel.js` 仍然不计。首页上的站点 id 是构建时 `sites.json` 里第一个写了主机名的站点。

---

## 文档

| 文档 | 内容 |
| --- | --- |
| [技术蓝图](./docs/TECHNICAL.md) | 架构与接口 |
| [追踪与存储](./docs/TRACKING-AND-STORAGE.md) | 脚本防缓存、KV 计数键 |
