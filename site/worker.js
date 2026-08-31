/* ROMs Search Worker - runs MiniSearch off main thread */
importScripts('./minisearch.js');

let allDocs = [];
let byId = new Map();
let miniSearch = null;
let ready = false;

function send(type, payload){ self.postMessage({type, ...payload}); }

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'load') {
    try {
      // Prefer compressed .gz (3.3 MB) then .br then raw
      const tryUrls = [msg.dataUrl + '.gz', msg.dataUrl + '.br', msg.dataUrl];
      let buffer = null;
      for(const u of tryUrls){
        try{
          send('progress', {text: `Fetching ${u.split('/').pop()}…`});
          const res = await fetch(u);
          if(!res.ok) continue;
          if(u.endsWith('.gz')){
            send('progress', {text: 'Decompressing gzip…'});
            // DecompressionStream is native in modern browsers
            if(typeof DecompressionStream !== 'undefined'){
              const ds = new DecompressionStream('gzip');
              const decompressed = res.body.pipeThrough(ds);
              const text = await new Response(decompressed).text();
              buffer = JSON.parse(text);
            } else {
              // fallback: fetch as arrayBuffer and let server handle? try plain
              const ab = await res.arrayBuffer();
              // if no DecompressionStream, we cannot decompress, try next url
              continue;
            }
          } else if(u.endsWith('.br')){
            // brotli not natively supported via DecompressionStream, skip unless we bundle decoder
            continue;
          } else {
            const total = parseInt(res.headers.get('Content-Length')||'0',10);
            if(res.body && total){
              const reader = res.body.getReader();
              let received = 0;
              const chunks = [];
              while(true){
                const {done, value} = await reader.read();
                if(done) break;
                chunks.push(value);
                received += value.length;
                if(received % (2*1024*1024) < 65536){
                  send('progress', {text: `Downloading ${(received/1024/1024).toFixed(1)} / ${(total/1024/1024).toFixed(1)} MB…`});
                }
              }
              const blob = new Blob(chunks);
              const text = await blob.text();
              buffer = JSON.parse(text);
            } else {
              send('progress', {text: 'Parsing JSON…'});
              buffer = await res.json();
            }
          }
          if(buffer) break;
        }catch(e){ continue; }
      }
      if(!buffer) throw new Error('Failed to fetch any index variant');
      allDocs = buffer;
      byId = new Map(allDocs.map(d=>[d.id,d]));
      send('progress', {text: `Indexing ${allDocs.length.toLocaleString()} docs…`});

      miniSearch = new MiniSearch({
        fields: ['title','company','console','folder','searchText'],
        storeFields: ['title','href','url','company','console','folder','size','sizeBytes','date'],
        searchOptions: { prefix: true, fuzzy: 0.2, combineWith: 'AND' },
        idField: 'id'
      });
      // Chunked add to avoid blocking worker too long and to report progress
      const CHUNK = 5000;
      for(let i=0;i<allDocs.length;i+=CHUNK){
        miniSearch.addAll(allDocs.slice(i, i+CHUNK));
        send('progress', {text: `Indexing ${Math.min(i+CHUNK, allDocs.length).toLocaleString()} / ${allDocs.length.toLocaleString()}…`});
        // yield to event loop
        await new Promise(r=> setTimeout(r, 0));
      }
      // fetch meta if provided
      let meta = null;
      if(msg.metaUrl){
        try{ const mr = await fetch(msg.metaUrl); if(mr.ok) meta = await mr.json(); }catch{}
      }
      ready = true;
      const companies = [...new Set(allDocs.map(d=>d.company))].sort();
      const consoles = [...new Set(allDocs.map(d=>d.console))].sort();
      send('ready', {total: allDocs.length, companies, consoles, meta});
    } catch(err){
      send('error', {error: String(err.stack||err)});
    }
  }

  if(msg.type === 'search'){
    if(!ready){ send('searchResult', {total:0, docs:[], queryId: msg.queryId}); return; }
    const {q, company, consoleVal, folderSub, sortBy, page, pageSize, queryId} = msg;
    let docs;
    let scores = new Map();
    const trimmed = (q||'').trim();
    if(trimmed){
      try{
        const results = miniSearch.search(trimmed);
        scores = new Map(results.map(r=>[r.id, r.score]));
        // O(1) via byId instead of O(n) find
        docs = results.map(r=> byId.get(r.id)).filter(Boolean);
        if(docs.length===0){
          // fallback substring scan (still fast, single pass)
          const low = trimmed.toLowerCase();
          docs = allDocs.filter(d=> d.searchText.includes(low));
        }
        docs.forEach(d=> d._score = scores.get(d.id)||0);
      }catch{
        const low = trimmed.toLowerCase();
        docs = allDocs.filter(d=> d.searchText.includes(low));
      }
    } else {
      docs = allDocs.slice();
      docs.forEach(d=> d._score = 0);
    }

    if(company) docs = docs.filter(d=> d.company===company);
    if(consoleVal) docs = docs.filter(d=> d.console===consoleVal);
    if(folderSub){
      const low = folderSub.toLowerCase();
      docs = docs.filter(d=> d.folder.toLowerCase().includes(low));
    }

    // sorting - keep in worker to avoid shipping 67k docs to main thread
    if(sortBy==='relevance' && trimmed){
      docs.sort((a,b)=>(b._score||0)-(a._score||0));
    } else if(sortBy==='title-asc'){
      docs.sort((a,b)=> a.title.localeCompare(b.title));
    } else if(sortBy==='title-desc'){
      docs.sort((a,b)=> b.title.localeCompare(a.title));
    } else if(sortBy==='console-asc'){
      docs.sort((a,b)=> (a.console||'').localeCompare(b.console||'') || a.title.localeCompare(b.title));
    } else if(sortBy==='company-asc'){
      docs.sort((a,b)=> a.company.localeCompare(b.company) || (a.console||'').localeCompare(b.console||'') || a.title.localeCompare(b.title));
    } else if(sortBy==='size-desc'){
      docs.sort((a,b)=> (b.sizeBytes||0)-(a.sizeBytes||0));
    } else if(sortBy==='size-asc'){
      docs.sort((a,b)=> (a.sizeBytes||0)-(b.sizeBytes||0));
    } else if(sortBy==='date-desc'){
      docs.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
    } else if(!trimmed){
      docs.sort((a,b)=> a.title.localeCompare(b.title));
    }

    const total = docs.length;
    const start = page * pageSize;
    const slice = docs.slice(start, start + pageSize);
    send('searchResult', {total, docs: slice, page, queryId, trimmed});
  }
};
