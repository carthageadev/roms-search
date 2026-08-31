# roms-search

Search engine for https://92.35.124.13.

Indexes Nintendo and SEGA. Search is instant in the browser.

Live: https://carthageadev.github.io/roms-search/

## How it works
Scraper crawls the IP weekly and builds `data/roms.json`. Frontend uses that JSON for search.

## Run locally
```
pip install -r scraper/requirements.txt
python scraper/scraper.py
python -m http.server 8000
# open http://localhost:8000/site/
```

## Layout
```
scraper/  crawler
data/     roms.json + by-console + meta.json
site/     static frontend
```

## Deploy
GitHub Actions runs weekly. It scrapes, commits data, and deploys to Pages.
