# Busuanzi snapshot

Data captured from the original busuanzi endpoint:

```text
GET https://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback
Referer: <page url>
```

The original service returns only:

- `site_pv`
- `site_uv`
- `page_pv`

It does **not** expose `page_uv`, so that column is intentionally empty.

## Local files

The CSV files and progress file are **local only** and are ignored by git:

```text
docs/data/busuanzi-www.csv
docs/data/busuanzi-blog.csv
docs/data/busuanzi-blog.progress.json
```

Generate them locally with:

```bash
node scripts/fetch-busuanzi.mjs
```

## Import into Kestrel

`edge-functions/v1/import.ts` exposes an import endpoint guarded by
`KESTREL_IMPORT_TOKEN`. Set that variable in the EdgeOne project, then run:

```bash
KESTREL_IMPORT_TOKEN=... node scripts/import-busuanzi.mjs
```

The importer writes:

```text
spv_<site>
suv_<site>
ppv_<site>_<sha256(path)>
```

`page_uv` and `seen_*` dedupe markers are not imported because the original
busuanzi service does not expose them.
