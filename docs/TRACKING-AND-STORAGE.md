# 追踪脚本防缓存与 KV 计数

> 与 [`TECHNICAL.md`](./TECHNICAL.md) 对应的实现说明。  
> KV 依据：[EdgeOne KV](https://cloud.tencent.com/document/product/1552/127420)。

计数产品只使用 KV。不写 Blob，不保存原始事件。

---

## 1. 追踪脚本只读

埋点脚本更新后，浏览器或 CDN 仍可能命中旧文件。目标是：平时可以长缓存，发布后用版本把入口换掉。脚本不再负责把一次访问送进计数器。

### 1.1 当前嵌入方式

```html
<script
  defer
  src="https://cdn.kestrel.example/kestrel.js?v=0.1.0"
  data-site="SITE_ID"
  data-endpoint="https://cdn.kestrel.example/v1/track"
></script>
```

`data-site` 与 `data-endpoint` 每次从脚本标签读取，不写死在长缓存文件里。`data-endpoint` 是只读地址。

部分 CDN 默认忽略 query string。若使用 `?v=`，缓存键必须包含 `v`。更稳的做法是不可变路径 `/k/{version}/kestrel.js`（`max-age=31536000, immutable`）加一个短缓存入口。

### 1.2 读取不能被缓存，也不能变成一次访问

脚本使用 `fetch` GET，把当前页面的 pathname 加查询串放在 `path` 里，读回四个数字再填到页面上。不发送 `url` 或 `visitorId`，也不监听 `pushState` / `replaceState` / `popstate`。那些客户端路由到不了边缘，因此不再单独计数。

```typescript
const url = new URL(endpoint, location.href);
url.searchParams.set('siteId', siteId);
url.searchParams.set('path', location.pathname + location.search);
fetch(url, {
  method: 'GET',
  headers: { 'Cache-Control': 'no-store' },
  cache: 'no-store',
  mode: 'cors',
  credentials: 'omit',
});
```

服务端响应带 `Cache-Control: no-store` 与 `CDN-Cache-Control: no-store`。`GET /v1/track` 只读，不计数。

页面元素：

| id | 写入 |
| :--- | :--- |
| `kestrel_value_site_pv` | `site_pv` |
| `kestrel_value_page_pv` | `page_pv` |
| `kestrel_value_site_uv` | `site_uv` |
| `kestrel_value_page_uv` | `page_uv` |

对应的 `kestrel_container_*` 在拿到响应后设为 `inline`。`window.kestrel.track()` 只是再读一次，不会加 PV。

访客标识不在脚本里。边缘在文档响应上设置 cookie `kestrel_vid`（`Path=/`、`HttpOnly`、`SameSite=Lax`，HTTPS 时加 `Secure`，不设置 `Domain`，所以只属于当前主机名）。值去掉连字符，只保留 `[A-Za-z0-9_]{8,64}`。

---

## 2. 什么时候计数

`edge-functions/v1/*` 只匹配 `/v1` 下的函数路由。EdgeOne 的规则是：函数路由和静态资源冲突时，请求优先走静态资源。因此页面 HTML 不会进入 `v1/track.ts`。

项目根目录的 `middleware.ts`（导出 `middleware`）默认匹配全部路由，在页面加载前执行，能看到这次请求的 HTTP Host。计数写在这里：

1. `next()` 拿到原本的页面响应。
2. 不是 HTML 文档导航就原样返回。跳过静态资源、`kestrel.js`、`/v1/*`、预取、非 GET、重定向，以及 `Content-Type` 不是 `text/html` 的 200。
3. 用 Host 头（没有则用请求 URL 的主机名）对 `sites.json` 里全部站点的 `domain` 做精确比较。未命中或白名单为空：不写计数，不发 cookie。这份名单在模块加载时读入，不从 KV 读取。
4. 页面路径取这次请求的 pathname 加查询串，最长 2048 字符，再 SHA-256。
5. 从 cookie 取访客；不合法就新生成一个，并 `Set-Cookie`。
6. 站点 PV、页面 PV 各加一。去重键不存在时写入 `"1"` 并把对应 UV 加一。

Mock API 对非 `/v1` 路径做了同样的 Host 判断，方便本地用 curl 验证。本地 Vite 页面不会经过 middleware。

能对已接入本项目的固定域名发出真正 HTML 文档请求的客户端（包括 curl）会记一次，这和打开页面相同。伪造 `POST /v1/track`、伪造 JSON `url`、伪造 `Origin`、在 JSON 里换 `visitorId`，都不会增加计数。换一个新的 `kestrel_vid` 再请求同一文档，会被当成新访客；这只能发生在打到该 Host 的文档请求上，不能通过计数 API 完成。

---

## 3. KV 读写

### 3.1 能力边界

| 能力 | KV（绑定变量 `kestrel_kv`） |
| :--- | :--- |
| Key | ≤512 字节，仅数字、字母、下划线 |
| 一致性 | 同节点写完立刻可读；其他节点最长约 60 秒旧值 |
| TTL | `put` 没有过期参数 |
| 自增 | 没有原子自增，用 get + put |

因此：

1. 站点 ID 只能是 `[A-Za-z0-9_]`，写在 `sites.json` 里，加载时转为小写。
2. 页面路径含 `/`、`-`、`.`，先 SHA-256 成十六进制再放进键，例如 `ppv_{siteId}_{pathHash}`。
3. PV / UV 的读改写在并发下可能少计，产品接受大约数。

### 3.2 键

实现在 `edge-functions/lib/counter.ts`。

| 用途 | Key | Value |
| :--- | :--- | :--- |
| 站点 PV | `spv_{siteId}` | `"12345"` |
| 站点 UV | `suv_{siteId}` | `"678"` |
| 页面 PV | `ppv_{siteId}_{pathHash}` | `"12"` |
| 页面 UV | `puv_{siteId}_{pathHash}` | `"9"` |
| 站点已见访客 | `seen_{siteId}_{visitorId}` | `"1"` |
| 页面已见访客 | `seen_{siteId}_{pathHash}_{visitorId}` | `"1"` |

`pathHash` 是页面路径的 SHA-256 十六进制（64 个字符）。页面路径取 URL 的 pathname 加查询串，最长 2048 字符。

第一次见到某访客时写入 `seen_{siteId}_{visitorId}` 并把站点 UV 加一。页面 UV 用站点、路径哈希、访客三个部分去重。不要把访客列表放进一个 JSON。

站点 id 和主机名白名单不进 KV，只存在于仓库根目录的 `sites.json`。

### 3.3 只读响应

`GET /v1/track?siteId=&path=` 返回且只返回：

```json
{ "site_pv": 2, "page_pv": 2, "site_uv": 1, "page_uv": 1 }
```

不传 `path` 时 `page_pv` 与 `page_uv` 为 0。两次读取之间数字不变。

`POST /v1/track` 返回 405 与 `not_counted`，不写任何计数键。

本地没有绑定 `kestrel_kv` 时，`edge-functions/lib/storage.ts` 使用进程内 Map。
