const DATA_URL = "../data/roms.json";
const META_URL = "../data/meta.json";
let allDocs = [];
let miniSearch = null;
let filtered = [];
let page = 0;
const PAGE_SIZE = 50;

const els = {
  q: document.getElementById('q'),
  company: document.getElementById('companyFilter'),
  console: document.getElementById('consoleFilter'),
  folder: document.getElementById('folderFilter'),
  sortBy: document.getElementById('sortBy'),
  grid: document.getElementById('grid'),
  stats: document.getElementById('stats'),
  countPill: document.getElementById('countPill'),
  pageInfo: document.getElementById('pageInfo'),
  prev: document.getElementById('prevBtn'),
  next: document.getElementById('nextBtn'),
  clear: document.getElementById('clearBtn'),
};

function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

async function load(){
  els.countPill.textContent = "Fetching index… (45 MB, cached after first load)";
  const [res, metaRes] = await Promise.all([fetch(DATA_URL), fetch(META_URL).catch(()=>null)]);
  if(!res.ok) throw new Error("Failed to load roms.json");
  allDocs = await res.json();
  // Build MiniSearch index for instant fuzzy search
  miniSearch = new MiniSearch({
    fields: ['title', 'company', 'console', 'folder', 'searchText'],
    storeFields: ['title','href','url','company','console','folder','size','sizeBytes','date'],
    searchOptions: { prefix: true, fuzzy: 0.2, combineWith: 'AND' }
  });
  miniSearch.addAll(allDocs);
  // Populate company / console filters
  const companies = [...new Set(allDocs.map(d=>d.company))].sort();
  const consoles = [...new Set(allDocs.map(d=>d.console))].sort();
  for(const c of companies){ const o=document.createElement('option'); o.value=c; o.textContent=c; els.company.appendChild(o); }
  for(const c of consoles){ const o=document.createElement('option'); o.value=c; o.textContent=c; els.console.appendChild(o); }

  let metaText="";
  try{
    if(metaRes && metaRes.ok){
      const meta=await metaRes.json();
      metaText = ` · updated ${meta.generatedAt} · ${meta.totalFiles} files`;
    }
  }catch{}
  els.countPill.textContent = `${allDocs.length.toLocaleString()} files indexed${metaText}`;
  applyFilters();
}

function applyFilters(){
  const q = els.q.value.trim().toLowerCase();
  const company = els.company.value;
  const consoleVal = els.console.value;
  const folderSub = els.folder.value.trim().toLowerCase();
  const sortBy = els.sortBy.value;

  let docs;
  if(q && miniSearch){
    // MiniSearch returns ranked results; map back to docs if needed
    const results = miniSearch.search(q);
    // results contain id + score; we want docs in ranked order
    const idSet = new Map(results.map(r=>[r.id, r.score]));
    docs = results.map(r=> allDocs.find(d=>d.id===r.id)).filter(Boolean);
    // fallback: if no MiniSearch hits, do simple includes
    if(docs.length===0){
      docs = allDocs.filter(d=> d.searchText.includes(q) || d.title.toLowerCase().includes(q));
    }
    // attach score for relevance sort
    docs.forEach(d=> d._score = idSet.get(d.id) || 0);
  } else {
    docs = allDocs.slice();
    docs.forEach(d=> d._score = 0);
  }

  if(company) docs = docs.filter(d=> d.company===company);
  if(consoleVal) docs = docs.filter(d=> d.console===consoleVal);
  if(folderSub) docs = docs.filter(d=> d.folder.toLowerCase().includes(folderSub));

  // Sorting
  if(sortBy==="relevance" && q){
    docs.sort((a,b)=> (b._score||0)-(a._score||0));
  } else if(sortBy==="title-asc"){
    docs.sort((a,b)=> a.title.localeCompare(b.title));
  } else if(sortBy==="title-desc"){
    docs.sort((a,b)=> b.title.localeCompare(a.title));
  } else if(sortBy==="console-asc"){
    docs.sort((a,b)=> (a.console||'').localeCompare(b.console||'') || a.title.localeCompare(b.title));
  } else if(sortBy==="company-asc"){
    docs.sort((a,b)=> a.company.localeCompare(b.company) || (a.console||'').localeCompare(b.console||'') || a.title.localeCompare(b.title));
  } else if(sortBy==="size-desc"){
    docs.sort((a,b)=> (b.sizeBytes||0)-(a.sizeBytes||0));
  } else if(sortBy==="size-asc"){
    docs.sort((a,b)=> (a.sizeBytes||0)-(b.sizeBytes||0));
  } else if(sortBy==="date-desc"){
    docs.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  } else if(!q){
    // default when no query: title asc
    docs.sort((a,b)=> a.title.localeCompare(b.title));
  }

  filtered = docs;
  page = 0;
  render();
}

function render(){
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if(page >= totalPages) page = totalPages-1;
  const start = page * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  els.grid.innerHTML = slice.map(d=> `
    <div class="card">
      <div class="left">
        <div class="title" title="${escapeHtml(d.title)}">${escapeHtml(d.title)}</div>
        <div class="meta">
          <span>${escapeHtml(d.company)}</span>
          <span>${escapeHtml(d.console||'—')}</span>
          <span>${escapeHtml(d.folder)}</span>
          <span>${escapeHtml(d.size||'')}</span>
          <span>${escapeHtml(d.date||'')}</span>
        </div>
      </div>
      <div class="actions">
        <a class="btn" href="${d.url}" target="_blank" rel="noopener">Raw IP</a>
        <button class="btn primary" onclick="navigator.clipboard.writeText('${d.url.replace(/'/g,"\\'")}'); this.textContent='Copied!' ; setTimeout(()=> this.textContent='Copy link', 1200)">Copy link</button>
      </div>
    </div>
  `).join('') || `<div class="pill">No results. Try “zelda”, “mario”, “sonic” or clear filters.</div>`;

  els.stats.textContent = `Showing ${total===0?0:start+1}–${Math.min(start+PAGE_SIZE, total)} of ${total.toLocaleString()} results${allDocs.length?` (from ${allDocs.length.toLocaleString()} indexed)`:''}`;
  els.pageInfo.textContent = `Page ${page+1} / ${totalPages}`;
  els.prev.disabled = page===0;
  els.next.disabled = page >= totalPages-1;
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const debouncedApply = debounce(applyFilters, 150);
els.q.addEventListener('input', debouncedApply);
els.company.addEventListener('change', applyFilters);
els.console.addEventListener('change', applyFilters);
els.folder.addEventListener('input', debouncedApply);
els.sortBy.addEventListener('change', applyFilters);
els.prev.addEventListener('click', ()=>{ if(page>0){ page--; render(); window.scrollTo({top:0, behavior:'smooth'}); }});
els.next.addEventListener('click', ()=>{ const tp=Math.ceil(filtered.length/PAGE_SIZE); if(page<tp-1){ page++; render(); window.scrollTo({top:0, behavior:'smooth'}); }});
els.clear.addEventListener('click', ()=>{ els.q.value=''; els.company.value=''; els.console.value=''; els.folder.value=''; els.sortBy.value='relevance'; applyFilters(); els.q.focus(); });

// URL sync: ?q=zelda&company=Nintendo etc
function syncFromUrl(){
  const p=new URLSearchParams(location.search);
  if(p.get('q')) els.q.value=p.get('q');
  if(p.get('company')) els.company.value=p.get('company');
  if(p.get('console')) els.console.value=p.get('console');
  if(p.get('folder')) els.folder.value=p.get('folder');
}
function syncToUrl(){
  const p=new URLSearchParams();
  if(els.q.value) p.set('q', els.q.value);
  if(els.company.value) p.set('company', els.company.value);
  if(els.console.value) p.set('console', els.console.value);
  if(els.folder.value) p.set('folder', els.folder.value);
  history.replaceState(null,'','?'+p.toString());
}
['input','change'].forEach(ev=> {
  els.q.addEventListener(ev, debounce(syncToUrl, 400));
  els.company.addEventListener(ev, syncToUrl);
  els.console.addEventListener(ev, syncToUrl);
  els.folder.addEventListener(ev, debounce(syncToUrl, 400));
});

syncFromUrl();
load().catch(e=>{ els.countPill.textContent="Failed to load index"; els.stats.textContent=String(e); console.error(e); });
