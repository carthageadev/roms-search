# roms-search

Fast static search for `https://92.35.124.13` (lolroms.com) — MVP covers **Nintendo** + **SEGA**.

- Scraper hits the **raw IP** directly (`https://92.35.124.13`, `verify=False`) — works on unprotected/local networks.
- Crawls BFS from `/Nintendo` and `/SEGA`, parses `li.folder` + `li.filei` HTML.
- Generates `data/roms.json` (67k files, ~46 MB), sharded `data/by-console/*.json`, and `data/meta.json`.
- Frontend (`site/`) is pure static: MiniSearch (fuzzy, prefix) in the browser, instant `zelda` results.
- Sorting/filtering by **company**, **console**, **folder** (each folder is a searchable criteria as you asked).

## Quick start
```bash
pip install -r scraper/requirements.txt
python scraper/scraper.py
# open site/index.html (needs a http server for fetch)
python -m http.server --directory site 8000
# then visit http://localhost:8000
# or serve root: python -m http.server 8000 and open /site/
```

## Repo layout
```
scraper/scraper.py      # IP-based crawler
data/roms.json          # main index
data/by-console/*.json  # sharded
data/meta.json
site/index.html + app.js + style.css
.github/workflows/scrape.yml
```

## Deploy
GitHub Actions runs weekly (`cron: 0 3 * * 1`) + manual dispatch:
1. Runs scraper
2. Commits `data/*.json` if changed
3. Deploys `site/` + `data/` to GitHub Pages

Live URL after push: `https://carthageadev.github.io/roms-search/`

## Filters & sorting (frontend)
- **Company**: Nintendo / SEGA
- **Console**: Game Boy Advance, Genesis, etc. (populated from index)
- **Folder**: free-text substring match on full path (`/Nintendo/Wii`)
- **Sort by**: Relevance (when searching), Title A→Z / Z→A, Console A→Z, Company A→Z, Size, Date

All folder parts are saved as `folder` + `folderParts` + `searchText` for full-text.

## IP mode
We intentionally use `https://92.35.124.13` with `verify=False` and manual `quote(unquote(...))` encoding. Swap `BASE_URL` to `https://lolroms.com` if you prefer DNS.
