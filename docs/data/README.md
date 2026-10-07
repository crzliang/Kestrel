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

| File | Site |
| --- | --- |
| `busuanzi-www.csv` | `https://www.crzliang.cn/` |
| `busuanzi-blog.csv` | `https://blog.crzliang.cn/` |

## Columns

| Column | Meaning |
| --- | --- |
| `type` | `site` for the site-level row, `page` for a page row |
| `site_id` | Kestrel site id (`www` or `blog`) |
| `url` | Full page URL |
| `path` | URL path plus query string |
| `site_pv` | Site PV after removing migration reads |
| `site_uv` | Site UV after removing migration reads |
| `page_pv` | Page PV after removing migration reads |
| `page_uv` | Always empty: original busuanzi has no page UV |
| `captured_at` | Snapshot timestamp |
| `note` | Adjustment / limitation note |

## Adjustment

Reading the original busuanzi endpoint increments its counters. The CSV values
subtract the reads made during migration. The progress file
`busuanzi-blog.progress.json` keeps the raw per-page values for auditing.
