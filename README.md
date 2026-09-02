# atlas

ROM search for https://92.35.124.13.

Live: https://carthageadev.github.io/atlas/

## How it works
Scraper crawls the IP weekly and builds `data/roms.json.gz`. Frontend loads the gzip and searches in the browser.

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
data/     roms.json.gz + meta.json
site/     static frontend
```

## Deploy
GitHub Actions runs weekly. It scrapes and deploys to Pages.
