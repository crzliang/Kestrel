/** EdgeOne KV：命名空间与绑定变量名均为 `kestrel_kv`。 */
export type KvNamespace = {
  get(
    key: string,
    type?: 'text' | 'json' | 'arrayBuffer' | 'stream' | { type: string },
  ): Promise<string | object | ArrayBuffer | ReadableStream | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    complete: boolean;
    cursor: string | null;
    keys: Array<{ key: string }>;
  }>;
};

declare const kestrel_kv: KvNamespace | undefined;

const memory = new Map<string, string>();

function memoryKv(): KvNamespace {
  return {
    async get(key, type) {
      const raw = memory.get(key);
      if (raw == null) return null;
      if (type === 'json' || (typeof type === 'object' && type?.type === 'json')) {
        return JSON.parse(raw) as object;
      }
      return raw;
    },
    async put(key, value) {
      const text =
        typeof value === 'string'
          ? value
          : new TextDecoder().decode(value as ArrayBuffer);
      memory.set(key, text);
    },
    async delete(key) {
      memory.delete(key);
    },
    async list(options = {}) {
      const prefix = options.prefix ?? '';
      const limit = options.limit ?? 256;
      const keys = [...memory.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((key) => ({ key }));
      const start = options.cursor
        ? keys.findIndex((k) => k.key === options.cursor)
        : 0;
      const slice = keys.slice(Math.max(0, start), Math.max(0, start) + limit);
      const complete = start + limit >= keys.length;
      return {
        complete,
        cursor: complete ? null : (slice[slice.length - 1]?.key ?? null),
        keys: slice,
      };
    },
  };
}

export function getKv(): KvNamespace {
  if (typeof kestrel_kv !== 'undefined' && kestrel_kv) return kestrel_kv;
  return memoryKv();
}

export async function kvGetText(key: string): Promise<string | null> {
  return (await getKv().get(key)) as string | null;
}

export async function kvPutText(key: string, value: string): Promise<void> {
  await getKv().put(key, value);
}

/** Non-atomic increment. Concurrent edge writes may under-count; that is acceptable. */
export async function kvIncr(key: string, delta = 1): Promise<number> {
  const cur = Number((await kvGetText(key)) ?? '0');
  const base = Number.isFinite(cur) && cur > 0 ? Math.floor(cur) : 0;
  const next = base + delta;
  await kvPutText(key, String(next));
  return next;
}

export async function kvReadCount(key: string): Promise<number> {
  const n = Number((await kvGetText(key)) ?? '0');
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
