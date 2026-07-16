# 细化设计：追踪脚本防缓存 & KV/Blob 读写

> 补充 [`TECHNICAL.md`](./TECHNICAL.md) 中尚未展开的两块实现细节。  
> API 依据：[EdgeOne KV](https://cloud.tencent.com/document/product/1552/127420)、[EdgeOne Blob](https://cloud.tencent.com/document/product/1552/131425)（2026 文档）。

---

## 1. 追踪脚本防缓存策略

### 1.1 要解决的问题

埋点脚本更新后，访客浏览器 / CDN / 中间代理仍可能长期命中旧版本，导致：

- 新字段、新事件类型无法上报
- 旧 bug 修复无法触达
- 调试时「改了代码但不生效」

目标：**正常用户尽量长缓存（减流量），发布后可强制刷新；嵌入方式对站长简单。**

### 1.2 推荐方案：不可变文件名 + 稳定入口（双层 URL）

```
CDN 上实际文件（内容寻址 / 版本号，永久缓存）
  https://cdn.kestrel.example/k/{version}/kestrel.js
  https://cdn.kestrel.example/k/{hash}/kestrel.js   # 可选：内容 hash

稳定入口（给站长嵌入，短缓存或协商缓存）
  https://cdn.kestrel.example/k.js
  → 302 / 边缘 rewrite → /k/{version}/kestrel.js
```

| 资源 | Cache-Control | 说明 |
| :--- | :--- | :--- |
| `/k/{version}/kestrel.js` | `public, max-age=31536000, immutable` | 版本变了 URL 就变，可永久缓存 |
| `/k.js`（稳定入口） | `public, max-age=300, stale-while-revalidate=86400` | 5 分钟内必刷新入口；允许短暂用旧入口 |

站长嵌入保持不变：

```html
<script defer src="https://cdn.kestrel.example/k.js" data-site="SITE_ID"></script>
```

发布流程：

1. 构建产出 `dist/kestrel.js`，计算 `version`（semver）或 `hash`（文件 sha256 前 8 位）。
2. 上传到 `/k/{version}/kestrel.js`，带 `immutable`。
3. 更新入口 `/k.js` 的跳转目标或 rewrite 规则到新 version。
4. 入口 5 分钟内全网切到新脚本；已打开页面的用户下次导航也会更新。

### 1.3 备用：查询参数版本（适合早期 MVP）

若暂时不做入口 rewrite，可用：

```html
<script defer src="https://cdn.kestrel.example/kestrel.js?v=20260716" data-site="SITE_ID"></script>
```

或由仪表盘生成带版本的 snippet：

```html
<script defer src="https://cdn.kestrel.example/kestrel.js?v=1.0.3" data-site="abc"></script>
```

注意：部分 CDN 默认**忽略 query string** 做缓存键。必须在 EdgeOne 缓存规则里把 `v` 纳入缓存键，否则 `?v=` 无效。

**MVP 建议**：先用「带版本 query + 缓存键包含 v」；稳定后升级为「不可变路径 + 稳定入口」。

### 1.4 脚本自身的运行时防「逻辑缓存」

浏览器会缓存 **JS 文件**，但不会缓存脚本内部的「配置」。配置应每次从页面属性或轻量接口拉取：

```typescript
// tracking-script/src/index.ts（示意）
const script = document.currentScript as HTMLScriptElement | null;
const siteId = script?.getAttribute('data-site') ?? '';
const endpoint =
  script?.getAttribute('data-endpoint') ?? 'https://api.kestrel.example/v1/track';

// 不要把 endpoint / 采样率硬编码进「不可变」长缓存文件而不留覆盖口
```

可选：脚本启动时读一次站点配置（KV），配置本身短缓存：

```http
GET /v1/config?siteId=xxx
Cache-Control: private, max-age=60
```

这样改采样率、开关自定义事件时，不必发版脚本。

### 1.5 上报请求本身禁止被缓存

`POST /v1/track` 与 `navigator.sendBeacon` 默认不应被中间层缓存，仍建议显式声明：

**客户端：**

```typescript
fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(event),
  keepalive: true, // 页面卸载时尽量发出
  mode: 'cors',
  credentials: 'omit', // 隐私：不带 Cookie
});
```

**服务端响应头：**

```http
Cache-Control: no-store
CDN-Cache-Control: no-store
```

### 1.6 嵌入与加载细节（与防缓存配合）

| 项 | 建议 | 原因 |
| :--- | :--- | :--- |
| `defer` | 必加 | 不阻塞解析 |
| `async` | 可选，与 defer 二选一 | 执行顺序不确定时用 defer 更稳 |
| `crossorigin="anonymous"` | 建议 | 便于以后做 CORS 错误上报 |
| 体积 | gzip 后 < 5KB | 长缓存更划算 |
| 协议 | 仅 HTTPS | 混合内容会被拦 |

### 1.7 发布检查清单

- [ ] 新版本文件 URL 已变（path 或 `v=`）
- [ ] 稳定入口 / snippet 指向新版本
- [ ] `immutable` 资源未覆盖同名旧文件
- [ ] EdgeOne 缓存键包含版本参数（若用 query）
- [ ] `/v1/track` 响应 `no-store`
- [ ] 用无痕窗口 + 已缓存窗口各测一次，确认新旧行为符合预期

---

## 2. KV / Blob 读写设计

### 2.1 能力边界（实现前必须对齐）

| 能力 | KV（Makers Runtime） | Blob（`@edgeone/pages-blob`） |
| :--- | :--- | :--- |
| 访问方式 | 绑定变量名，如 `kestrel_kv` | `getStore("kestrel-blob")` |
| Key 规则 | ≤512B，**仅数字、字母、下划线** | 支持 `/` 路径层级 |
| 一致性 | 最终一致（边缘缓存最长 ~60s） | 默认同；可读时可 `strong` |
| TTL | Runtime `put` **无过期参数** | 无 TTL；靠覆盖 / 删除 |
| Append | 无 | **无原生 append** |
| 单值上限 | 25MB | 25MB |

对技术蓝图的影响：

1. **原设计的 TTL（在线 5 分钟、防刷 2 分钟）** → 用 **软过期**（value 内带 `exp`），或定时 `delete`。
2. **Key 含冒号 `:`** → 不满足 KV 字符集，改为下划线：`pv_day_{siteId}_{YYYYMMDD}`。
3. **按天追加 NDJSON** → 不能真 append；用 **分片文件**（推荐）或 **读改写**（仅低流量）。

### 2.2 Key / Path 规范（修订）

**KV**

| 用途 | Key | Value | 软 TTL |
| :--- | :--- | :--- | :--- |
| 今日 PV | `pv_day_{siteId}_{YYYYMMDD}` | `"12345"` | 7 天（过期后可删或忽略） |
| 今日 UV 近似 | `uv_day_{siteId}_{YYYYMMDD}` | HyperLogLog 近似或去重集合摘要 | 7 天 |
| 在线心跳 | `online_{siteId}_{visitorId}` | `{"t":1710000000}` | 5 分钟 |
| 站点配置 | `config_{siteId}` | JSON | 永久 |
| 防刷 | `rate_{siteId}_{ipHash}_{YYYYMMDDHHMM}` | `"23"` | 2 分钟 |

**Blob**

```
sites/{siteId}/raw/{YYYY}/{MM}/{DD}/{HH}/{shard}.ndjson
sites/{siteId}/aggregates/daily/{YYYY-MM-DD}.json
sites/{siteId}/aggregates/hourly/{YYYY-MM-DD-HH}.json
```

`shard` 建议：`{edgePopId}_{random}` 或 `{timestampMs}_{random4}`，避免多节点并发写同一文件。

### 2.3 存储封装：`edge-functions/lib/storage.ts`

```typescript
import { getStore } from '@edgeone/pages-blob';

/** 绑定到项目的 KV 命名空间变量名，控制台绑定后全局可用 */
declare const kestrel_kv: {
  get(
    key: string,
    type?: 'text' | 'json' | 'arrayBuffer' | 'stream' | { type: string },
  ): Promise<string | object | ArrayBuffer | ReadableStream | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ complete: boolean; cursor: string | null; keys: Array<{ key: string }> }>;
};

const blob = getStore('kestrel-blob');

// ---------- KV helpers ----------

export async function kvGetText(key: string): Promise<string | null> {
  return (await kestrel_kv.get(key)) as string | null;
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  return (await kestrel_kv.get(key, { type: 'json' })) as T | null;
}

export async function kvPutText(key: string, value: string): Promise<void> {
  await kestrel_kv.put(key, value);
}

export async function kvPutJson(key: string, value: unknown): Promise<void> {
  await kestrel_kv.put(key, JSON.stringify(value));
}

/** 软过期：存 { v, exp }，读取时判断 */
export async function kvPutSoftTTL(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  await kvPutJson(key, { v: value, exp });
}

export async function kvGetSoftTTL<T>(key: string): Promise<T | null> {
  const row = await kvGetJson<{ v: T; exp: number }>(key);
  if (!row) return null;
  if (row.exp < Math.floor(Date.now() / 1000)) {
    // 惰性清理，失败可忽略
    void kestrel_kv.delete(key);
    return null;
  }
  return row.v;
}

/** 非原子自增：适合 PV 等可接受轻微误差的计数（见 2.5） */
export async function kvIncr(key: string, delta = 1): Promise<number> {
  const cur = Number((await kvGetText(key)) ?? '0');
  const next = cur + delta;
  await kvPutText(key, String(next));
  return next;
}

// ---------- Blob helpers ----------

export function rawShardPath(siteId: string, d: Date, shard: string): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `sites/${siteId}/raw/${y}/${m}/${day}/${h}/${shard}.ndjson`;
}

export function dailyAggPath(siteId: string, ymd: string): string {
  return `sites/${siteId}/aggregates/daily/${ymd}.json`;
}

/** 写入一条原始事件：每请求一个小 shard，避免并发覆盖 */
export async function appendRawEvent(
  siteId: string,
  event: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  const shard = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const key = rawShardPath(siteId, now, shard);
  const line = JSON.stringify(event) + '\n';
  await blob.set(key, line);
}

/** 读日聚合：仪表盘用，可最终一致；刚写入后立刻读用 strong */
export async function getDailyAggregate<T>(
  siteId: string,
  ymd: string,
  strong = false,
): Promise<T | null> {
  return (await blob.get(dailyAggPath(siteId, ymd), {
    type: 'json',
    consistency: strong ? 'strong' : 'eventual',
  })) as T | null;
}

export async function putDailyAggregate(
  siteId: string,
  ymd: string,
  data: unknown,
): Promise<void> {
  await blob.setJSON(dailyAggPath(siteId, ymd), data);
}

/** 列举某小时的 raw shards（聚合任务用） */
export async function listRawShards(
  siteId: string,
  y: string,
  m: string,
  d: string,
  h: string,
): Promise<string[]> {
  const prefix = `sites/${siteId}/raw/${y}/${m}/${d}/${h}/`;
  const { blobs } = await blob.list({ prefix, consistency: 'strong' });
  return blobs.map((b) => b.key);
}
```

### 2.4 `/v1/track` 写入示例

```typescript
// edge-functions/v1/track/index.ts
import { z } from 'zod';
import {
  appendRawEvent,
  kvIncr,
  kvPutSoftTTL,
  kvGetSoftTTL,
} from '../../lib/storage';

const TrackEvent = z.object({
  siteId: z.string().min(1).max(64),
  eventType: z.enum(['pageview', 'click', 'custom']),
  url: z.string().url().max(2048),
  referrer: z.string().max(2048).default(''),
  screenWidth: z.number().int().positive().max(10000),
  timestamp: z.number().int().positive(),
  visitorId: z.string().min(8).max(64),
});

function dayKey(siteId: string, ts: number): string {
  const d = new Date(ts);
  const ymd = [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('');
  return `pv_day_${siteId}_${ymd}`;
}

export async function onRequest({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const parsed = TrackEvent.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const event = parsed.data;
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  // 勿存明文 IP 到 Blob；仅用于限流 hash
  const ipHash = await sha256Short(ip);

  // 1) 简易限流：每分钟每 IP
  const minute = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const rateKey = `rate_${event.siteId}_${ipHash}_${minute}`;
  const hits = (await kvGetSoftTTL<number>(rateKey)) ?? 0;
  if (hits > 120) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }
  await kvPutSoftTTL(rateKey, hits + 1, 120);

  // 2) 实时计数（KV）
  if (event.eventType === 'pageview') {
    await kvIncr(dayKey(event.siteId, event.timestamp));
    await kvPutSoftTTL(
      `online_${event.siteId}_${event.visitorId}`,
      { t: Date.now() },
      300,
    );
  }

  // 3) 持久化明细（Blob 分片，不经 UA 明文 IP）
  const ua = request.headers.get('user-agent') ?? '';
  await appendRawEvent(event.siteId, {
    ...event,
    ua,
    receivedAt: Date.now(),
  });

  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function sha256Short(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}
```

### 2.5 实时概览读取示例

```typescript
// edge-functions/v1/stats/realtime.ts
import { kvGetText, kvGetSoftTTL } from '../../lib/storage';

declare const kestrel_kv: {
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ complete: boolean; cursor: string | null; keys: Array<{ key: string }> }>;
};

export async function onRequest({ request }: { request: Request }) {
  const siteId = new URL(request.url).searchParams.get('siteId');
  if (!siteId) {
    return Response.json({ error: 'siteId_required' }, { status: 400 });
  }

  const now = new Date();
  const ymd = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');

  const pv = Number((await kvGetText(`pv_day_${siteId}_${ymd}`)) ?? '0');

  // 在线：扫描 online_{siteId}_* ，软 TTL 未过期即计为在线
  let online = 0;
  let cursor: string | undefined;
  do {
    const page = await kestrel_kv.list({
      prefix: `online_${siteId}_`,
      limit: 256,
      cursor,
    });
    for (const { key } of page.keys) {
      const alive = await kvGetSoftTTL(key);
      if (alive) online += 1;
    }
    cursor = page.complete ? undefined : (page.cursor ?? undefined);
  } while (cursor);

  return Response.json(
    { siteId, pvToday: pv, online, ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
```

> 站点很大时，`list` 扫在线 key 会贵。MVP 后可改为：维护一个 `online_set_{siteId}` 计数，心跳续期时增减（仍非严格精确，但够用）。

### 2.6 Blob 聚合读取示例

```typescript
// edge-functions/v1/stats/trend.ts
import { getDailyAggregate } from '../../lib/storage';

type DailyAgg = {
  pv: number;
  uv: number;
  sources: Record<string, number>;
};

export async function onRequest({ request }: { request: Request }) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get('siteId');
  const days = Number(url.searchParams.get('days') ?? '7');
  if (!siteId) {
    return Response.json({ error: 'siteId_required' }, { status: 400 });
  }

  const points: Array<{ date: string; pv: number; uv: number }> = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const ymd = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const agg = await getDailyAggregate<DailyAgg>(siteId, ymd);
    points.push({
      date: ymd,
      pv: agg?.pv ?? 0,
      uv: agg?.uv ?? 0,
    });
  }

  return Response.json({ siteId, granularity: 'day', points });
}
```

小时级聚合任务（可另开定时函数）伪流程：

```typescript
// 1. listRawShards(siteId, y, m, d, h)
// 2. 逐文件 get(..., { type: 'text', consistency: 'strong' }) 解析 NDJSON
// 3. 汇总 PV/UV/来源/页面
// 4. putDailyAggregate / putHourlyAggregate
// 5. 可选：删除已聚合的 raw shards 控成本
```

### 2.7 一致性与并发：怎么取舍

| 场景 | 策略 |
| :--- | :--- |
| PV 实时计数 | KV `get`+`put` 非原子；边缘多节点有竞态 → **允许轻微少计/多计**；权威数字以 Blob 日聚合为准 |
| 在线人数 | 软 TTL 心跳；展示「近似在线」 |
| 原始日志 | **每事件一 shard**，避免 read-modify-write 丢数据 |
| 仪表盘刚写完立刻读聚合 | `blob.get(..., { consistency: 'strong' })` |
| 普通趋势图 | 最终一致即可，更快更便宜 |

**不要**在 MVP 用「读整天 NDJSON → 拼一行 → set 回去」做 append：并发 track 会互相覆盖。

### 2.8 本地开发注意

- KV：需绑定命名空间；本地 `edgeone pages dev` 行为以 CLI 文档为准，建议加一层 `storage` 接口，开发时可换成内存 Map。
- Blob：Functions 内 `getStore('kestrel-blob')`；本地脚本读写需 `projectId` + `token`。

```typescript
// 本地脚本示例（非边缘运行时）
import { getStore } from '@edgeone/pages-blob';

const store = getStore({
  name: 'kestrel-blob',
  projectId: process.env.EO_PROJECT_ID!,
  token: process.env.EO_API_TOKEN!,
});
```

---

## 3. 结论与落地顺序

1. **防缓存**：MVP 用 `kestrel.js?v=x.y.z` + 缓存键含 `v`；随后升级不可变路径 `/k/{version}/` + 稳定入口 `/k.js`。
2. **上报**：`POST /track` 与客户端一律 `no-store`。
3. **KV**：Key 只用 `[A-Za-z0-9_]`；TTL 用软过期；计数接受最终一致误差。
4. **Blob**：事件写分片 NDJSON；聚合写 JSON；需要「刚写就读」时用 `strong`。

实现时可直接把本文 `storage.ts` / `track` 示例落到 `edge-functions/`，并把追踪脚本的版本注入写进 `tracking-script` 的构建配置（Rollup `define` 或文件名 hash）。
