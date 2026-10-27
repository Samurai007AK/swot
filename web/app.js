const $app = document.getElementById('app');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- helpers ------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

async function api(path, { method, body } = {}) {
  const res = await fetch(`/api${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { data });
  return data;
}

const P = {
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  quiz: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 12 2 2 4-4"/>',
  cards: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  podcast: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  yt: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z"/>',
  trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/>',
  up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  sound: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  chip: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  pen: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
};
const icon = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
const fillIcon = (n) => icon(n, 'icon--fill');

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  const [n, u] = s < 60 ? [0, ''] : s < 3600 ? [Math.round(s / 60), 'minute'] : s < 86400 ? [Math.round(s / 3600), 'hour'] : [Math.round(s / 86400), 'day'];
  return u ? `${n} ${u}${n === 1 ? '' : 's'} ago` : 'just now';
}

// markdown: escape first, then a small safe subset
function inline(s) {
  return s.replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}
function md(src) {
  const out = []; let para = []; const stack = [];
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
  const closeLists = (depth = 0) => { while (stack.length > depth) out.push(`</li></${stack.pop().tag}>`); };
  for (const raw of esc(src).split('\n')) {
    const line = raw.trimEnd(); let m;
    if (!line.trim()) { flushPara(); closeLists(); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); closeLists(); out.push('<hr>'); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { flushPara(); closeLists(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/))) {
      flushPara();
      const depth = Math.min(Math.floor(m[1].replace(/\t/g, '  ').length / 2) + 1, 4);
      const tag = /\d/.test(m[2]) ? 'ol' : 'ul';
      if (stack.length > depth) closeLists(depth);
      if (stack.length === depth && stack[depth - 1].tag !== tag) closeLists(depth - 1);
      if (stack.length === depth) out.push('</li>');
      while (stack.length < depth) { out.push(`<${tag}>`); stack.push({ tag }); }
      out.push(`<li>${inline(m[3])}`);
      continue;
    }
    if ((m = line.match(/^&gt;\s?(.*)/))) { flushPara(); closeLists(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    closeLists(); para.push(line.trim());
  }
  flushPara(); closeLists();
  return out.join('\n');
}
const plain = (s) => String(s || '').replace(/[*`#>_]/g, '').replace(/^\s*[-\d.]+\s+/gm, '');

// --- engine: which subscription and model run the work ------------------------
const MODELS = { claude: ['sonnet', 'opus', 'haiku', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'], codex: [] };
const NAMES = { claude: 'Claude Code', codex: 'Codex' };
const engine = () => {
  const provider = store.get('swot.provider', 'claude');
  return { provider, model: store.get(`swot.model.${provider}`, '') };
};
const engineLabel = () => { const e = engine(); return `${NAMES[e.provider]}${e.model ? ` · ${e.model}` : ''}`; };
let installed = null;
api('/config').then((c) => { installed = c.providers; }).catch(() => {});

function topbar(title, setId) {
  const e = engine();
  return `<header class="bar">
    <a class="logo" href="#/" aria-label="Swot home"><svg viewBox="0 0 24 24" class="icon" aria-hidden="true">${P.pen}</svg>swot</a>
    ${title ? `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">${icon('home')}Home</a><span aria-hidden="true">›</span><b>${esc(title)}</b></nav>` : ''}
    <div class="bar__end">
      <details class="engine" id="engine"><summary>${icon('chip')}<span>${esc(engineLabel())}</span></summary>
        <div class="engine__pop card">
          <label>Run on<select id="eng-provider">${Object.entries(NAMES).map(([k, v]) => `<option value="${k}" ${k === e.provider ? 'selected' : ''}>${v}${installed && !installed[k] ? ' (not installed)' : ''}</option>`).join('')}</select></label>
          <label>Model<input id="eng-model" list="eng-models" value="${esc(e.model)}" placeholder="CLI default" autocomplete="off" spellcheck="false"></label>
          <datalist id="eng-models">${MODELS[e.provider].map((m) => `<option value="${m}">`).join('')}</datalist>
          <p>Everything runs on your own ${NAMES[e.provider]} login. Leave the model blank to use its default.</p>
        </div></details>
    </div></header>`;
}

function bindTopbar() {
  const d = document.getElementById('engine'); if (!d) return;
  const prov = d.querySelector('#eng-provider'); const model = d.querySelector('#eng-model');
  const sync = () => { d.querySelector('summary span').textContent = engineLabel(); };
  prov.onchange = () => {
    store.set('swot.provider', prov.value);
    model.value = store.get(`swot.model.${prov.value}`, '');
    d.querySelector('#eng-models').innerHTML = MODELS[prov.value].map((m) => `<option value="${m}">`).join('');
    sync();
  };
  model.onchange = () => { store.set(`swot.model.${prov.value}`, model.value.trim()); sync(); };
  document.addEventListener('click', (ev) => { if (d.open && !d.contains(ev.target)) d.open = false; }, { signal: life.signal });
}

// --- router -------------------------------------------------------------------
let life = new AbortController();
const later = (fn, ms) => { const t = setTimeout(fn, ms); life.signal.addEventListener('abort', () => clearTimeout(t)); };

async function route() {
  life.abort(); life = new AbortController();
  speechSynthesis?.cancel();
  const [, view, id, sub] = location.hash.split('/');
  try {
    if (view === 'set' && id) await showSet(id, sub || 'learn');
    else if (view === 'learn' && id) await showPlayer(id, +sub || 0);
    else if (view === 'quiz' && id) await showQuizPlayer(id, +sub || 0);
    else await showHome();
  } catch (e) {
    $app.innerHTML = `${topbar()}<div class="center-note" role="alert"><h1>Something went wrong</h1><p class="error">${esc(e.message)}</p><a class="btn" href="#/">Back home</a></div>`;
    bindTopbar();
  }
}
addEventListener('hashchange', route);

// keyboard: the current screen registers one handler
const onKeys = (fn) => addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  fn(e);
}, { signal: life.signal });

// --- home -----------------------------------------------------------------------
const EXAMPLES = ['how compound interest works', 'the French Revolution in an hour', 'photosynthesis for a biology test', 'how DNS finds a website', 'Newton\'s laws with everyday examples', 'recursion, explained slowly'];

function pct(set) {
  if (!set.chapters?.length) return 0;
  const sum = set.chapters.reduce((a, c, i) => a + (c.pages?.length ? Math.min(1, (set.progress[i] || 0) / c.pages.length) : 0), 0);
  return Math.round((sum / set.chapters.length) * 100);
}
const chapterDone = (set, i) => !!set.chapters[i]?.pages?.length && (set.progress[i] || 0) >= set.chapters[i].pages.length;
const currentChapter = (set) => { const i = set.chapters.findIndex((_, k) => !chapterDone(set, k)); return i < 0 ? set.chapters.length : i; };

const toBase64 = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(blob); });
const KEEP_FILE_MB = 100; // recordings and images larger than this are transcribed but not kept for the Source tab
const kindOf = (f) => (/\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? 'pdf'
  : f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') || f.type.startsWith('video/') || /\.(mp3|m4a|wav|ogg|webm|aac|flac)$/i.test(f.name) ? 'audio' : 'text');

async function showHome() {
  document.title = 'Swot';
  $app.innerHTML = `${topbar()}
  <main class="home">
    <h1>What are we learning today?</h1>
    <form class="ask-box card" id="ask" novalidate>
      <div id="attach" hidden></div>
      <label class="visually-hidden" for="q">A topic, notes, or a link</label>
      <textarea id="q" rows="1" placeholder="${esc(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)])}"></textarea>
      <div class="ask-box__row" id="chips">
        <button type="button" class="chip chip--rec" id="rec">${icon('mic')}<span>Record</span></button>
        <button type="button" class="chip chip--up" id="up">${icon('upload')}<span>Upload</span></button>
        <button type="button" class="chip chip--yt" id="yt" aria-pressed="false">${icon('yt')}<span>YouTube</span></button>
        <input type="file" id="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown,image/*,audio/*,video/webm,video/mp4" hidden>
        <div class="ask-box__send"><kbd title="Press / to type">/</kbd><button class="send" type="submit" id="send" disabled aria-label="Start learning">${icon('up')}</button></div>
      </div>
      <div class="ask-box__row rec-bar" id="recbar" hidden>
        <span class="rec-dot" aria-hidden="true"></span><span class="rec-time" id="rectime" role="timer">0:00</span><span class="muted">Recording. Swot transcribes it on your computer when you stop.</span>
        <div class="ask-box__send"><button type="button" class="btn btn--sm btn--ghost" id="reccancel">Cancel</button><button type="button" class="btn btn--sm btn--primary" id="recstop">Stop and learn</button></div>
      </div>
    </form>
    <div class="form-msg" id="msg" role="status" aria-live="polite"></div>
    <div id="jump"></div>
    <section aria-labelledby="lessons-h">
      <div class="lessons__head"><h2 id="lessons-h">Your courses</h2></div>
      <div class="lessons" id="lessons"><div class="skel"></div><div class="skel skel--s"></div></div>
    </section>
  </main>`;
  bindTopbar();

  const form = document.getElementById('ask'); const q = document.getElementById('q');
  const file = document.getElementById('file'); const yt = document.getElementById('yt');
  const send = document.getElementById('send'); const msg = document.getElementById('msg'); const attach = document.getElementById('attach');
  let picked = null; let busy = false;
  const ready = () => { send.disabled = busy || !(picked || q.value.trim()); };
  const grow = () => { q.style.height = 'auto'; q.style.height = `${q.scrollHeight}px`; };
  const say = (text, frac) => {
    msg.classList.remove('error');
    msg.innerHTML = `${esc(text)}${frac == null ? '' : `<progress max="1" value="${Math.max(0, Math.min(1, frac))}"></progress>`}`;
  };
  const fail = (err) => { msg.textContent = err.message; msg.classList.add('error'); busy = false; ready(); };
  q.addEventListener('input', () => { grow(); ready(); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!send.disabled) form.requestSubmit(); } });
  onKeys((e) => { if (e.key === '/') { e.preventDefault(); q.focus(); } });
  yt.onclick = () => {
    const on = yt.getAttribute('aria-pressed') !== 'true';
    yt.setAttribute('aria-pressed', on);
    q.placeholder = on ? 'Paste a YouTube or web link' : EXAMPLES[0];
    q.focus();
  };
  document.getElementById('up').onclick = () => file.click();
  const showAttach = () => {
    attach.hidden = !picked;
    attach.innerHTML = picked ? `<span class="attach">${icon(kindOf(picked) === 'audio' ? 'mic' : 'file')}${esc(picked.name)}<button type="button" aria-label="Remove file">${icon('x')}</button></span>` : '';
    attach.querySelector('button')?.addEventListener('click', () => { picked = null; file.value = ''; showAttach(); ready(); });
  };
  file.onchange = () => { picked = file.files[0] || null; showAttach(); ready(); q.focus(); };

  const create = async (body) => {
    const set = await api('/sets', { body: { ...body, ...engine() } });
    location.hash = `#/set/${set.id}/learn`;
  };
  const media = () => import('./media.js');

  // audio from a file or the recorder: transcribe locally, then send the transcript (and the recording, if small enough)
  const learnFromAudio = async (blob, name) => {
    const { transcribe } = await media();
    const text = await transcribe(blob, say);
    say('Starting your lesson');
    const keep = blob.size <= KEEP_FILE_MB * 1e6;
    await create({ kind: 'audio', name, text, ...(keep ? { fileBase64: await toBase64(blob), fileType: blob.type || 'audio/webm' } : {}) });
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true; ready(); say('Starting');
    const text = q.value.trim();
    try {
      if (picked) {
        const kind = kindOf(picked);
        if (kind === 'pdf') {
          say('Reading your PDF');
          const body = { kind: 'pdf', name: picked.name, fileBase64: await toBase64(picked), fileType: 'application/pdf' };
          try { await create(body); } catch (err) {
            if (!err.data?.needsOcr) throw err;
            const { ocrPdfPages } = await media();
            body.ocr = await ocrPdfPages(picked, err.data.needsOcr, say);
            say('Starting your lesson');
            await create(body);
          }
        } else if (kind === 'image') {
          const { ocrImage } = await media();
          const ocrText = await ocrImage(picked, say);
          const keep = picked.size <= KEEP_FILE_MB * 1e6;
          await create({ kind: 'image', name: picked.name.replace(/\.\w+$/, ''), text: [text, ocrText].filter(Boolean).join('\n\n'),
            ...(keep ? { fileBase64: await toBase64(picked), fileType: picked.type } : {}) });
        } else if (kind === 'audio') await learnFromAudio(picked, picked.name.replace(/\.\w+$/, ''));
        else await create({ kind: 'text', name: picked.name.replace(/\.\w+$/, ''), text: await picked.text() });
      } else if (/^https?:\/\/\S+$/i.test(text) || /^(www\.|youtu\.?be)/i.test(text) || yt.getAttribute('aria-pressed') === 'true') {
        say(/youtu\.?be/i.test(text) ? 'Fetching the transcript' : 'Reading the page');
        await create({ kind: 'url', url: /^https?:/i.test(text) ? text : `https://${text}` });
      } else await create({ kind: text.length > 600 ? 'text' : 'topic', text });
    } catch (err) { fail(err); }
  };

  // Record: the chips row turns into a recording bar with a timer
  let recording = null; let tick;
  const chips = document.getElementById('chips'); const recbar = document.getElementById('recbar');
  const recMode = (on) => { chips.hidden = on; recbar.hidden = !on; q.disabled = on; };
  const stopTimer = () => clearInterval(tick);
  life.signal.addEventListener('abort', () => { stopTimer(); recording?.cancel(); });
  document.getElementById('rec').onclick = async () => {
    try {
      const { startRecording } = await media();
      recording = await startRecording();
      recMode(true); msg.textContent = '';
      tick = setInterval(() => { const s = Math.floor(recording.seconds()); document.getElementById('rectime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
      document.getElementById('recstop').focus();
    } catch (err) { fail(err); }
  };
  document.getElementById('reccancel').onclick = () => { stopTimer(); recording?.cancel(); recording = null; recMode(false); };
  document.getElementById('recstop').onclick = async () => {
    stopTimer();
    const blob = await recording.stop(); recording = null; recMode(false);
    busy = true; ready();
    try { await learnFromAudio(blob, `Recording ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`); }
    catch (err) { fail(err); }
  };

  await drawLessons();
}

async function drawLessons() {
  const list = document.getElementById('lessons');
  if (!list) return;
  let sets;
  try { sets = await api('/sets'); } catch (e) {
    document.getElementById('lessons').innerHTML = `<p class="empty error" role="alert">Could not load your lessons: ${esc(e.message)}</p>`; return;
  }
  if (!sets.length) { list.innerHTML = '<p class="empty">Courses you start will be listed here.</p>'; return; }
  const pctOf = (s) => (s.chapters ? Math.round((s.done / s.chapters) * 100) : 0);
  list.innerHTML = sets.map((s) => `<a class="lesson card" href="#/set/${s.id}/learn">
      <span class="lesson__icon" aria-hidden="true">${esc(s.icon || '📘')}</span>
      <span class="lesson__body"><span class="lesson__title">${esc(s.title)}</span>
        <span class="lesson__meta ${s.status === 'error' ? 'error' : ''}">${s.status === 'processing' ? esc(s.step || 'Generating') : s.status === 'error' ? 'Did not finish' : `Opened ${timeAgo(s.openedAt)}`}</span></span>
      ${s.status === 'processing' ? '<span class="ring ring--spin" aria-label="Generating"></span>' : `<span class="ring" style="--p:${pctOf(s)}" aria-label="${pctOf(s)}% complete"><span>${pctOf(s)}</span></span>`}
    </a>`).join('');
  const last = sets.find((s) => s.status === 'ready' && s.done < s.chapters);
  if (last) {
    document.getElementById('jump').innerHTML = `<a class="jump card" href="#/learn/${last.id}/${last.current}">
      <span class="ring ring--sm" style="--p:${pctOf(last)}" aria-hidden="true"></span>
      <span class="jump__t">${esc(last.title)}</span><span class="jump__ch">Ch. ${last.current + 1}</span><span class="jump__go">Keep going →</span></a>`;
  } else {
    document.getElementById('jump').innerHTML = '';
  }
  if (sets.some((s) => s.status === 'processing')) later(drawLessons, 3000);
}

// --- a set: rail + tabs ---------------------------------------------------------
const TABS = [['learn', 'Learn', 'book'], ['notes', 'Notes', 'notes'], ['quiz', 'Quiz', 'quiz'], ['flashcards', 'Flashcards', 'cards'], ['podcast', 'Podcast', 'podcast'], ['source', 'Source', 'file']];
let openedOnce = '';

async function showSet(id, tab) {
  const set = await api(`/sets/${id}`);
  document.title = `${set.title} · Swot`;
  if (set.status !== 'ready') return showGenerating(set);
  if (openedOnce !== id) { openedOnce = id; api(`/sets/${id}`, { method: 'PATCH', body: { openedAt: new Date().toISOString() } }).catch(() => {}); }
  $app.innerHTML = `${topbar(set.title, id)}<div class="shell">
    <nav class="rail" aria-label="Study modes">${TABS.map(([k, label, ic]) => `<a href="#/set/${id}/${k}" ${k === tab ? 'aria-current="page"' : ''}>${icon(ic)}${label}</a>`).join('')}</nav>
    <div class="main" id="main"></div></div>`;
  bindTopbar();
  const main = document.getElementById('main');
  ({ learn: drawLearn, notes: drawNotes, quiz: drawQuiz, flashcards: drawCards, podcast: drawPodcast, source: drawSource }[tab] || drawLearn)(main, set);
}

function showGenerating(set) {
  const failed = set.status === 'error';
  const skim = set.step?.startsWith('Skimming') ? set.step : 'Skimming a long document';
  const steps = ['Reading your material', ...(set.parts?.length ? [skim] : []), 'Planning your chapters', 'Writing your first chapter'];
  const at = Math.max(0, steps.indexOf(set.step));
  $app.innerHTML = `${topbar(set.title)}
    <div class="gen card" ${failed ? 'role="alert"' : 'role="status" aria-live="polite"'}>
      ${failed ? `<h1>This lesson did not finish</h1><p class="error">${esc(set.error)}</p>
        <p class="muted">Check that <code>${esc(engine().provider)}</code> is signed in (run it once in a terminal), then try again.</p>
        <div class="row-end"><button class="btn" id="del" type="button">Delete it</button><a class="btn btn--primary" href="#/">Start a new one</a></div>`
      : `<span class="ring ring--spin" aria-hidden="true"></span><h1>Building your lesson</h1>
        <p class="muted">Your model is reading ${set.text.length.toLocaleString()} characters. This usually takes a minute or two.</p>
        <ol class="steps">${steps.map((s, i) => `<li class="${i < at ? 'ok' : i === at ? 'on' : ''}">${i < at ? icon('check') : `<span class="ring ring--sm ${i === at ? 'ring--spin' : ''}"></span>`}${s}</li>`).join('')}</ol>`}
    </div>`;
  bindTopbar();
  if (failed) document.getElementById('del').onclick = async () => { await api(`/sets/${set.id}`, { method: 'DELETE' }); location.hash = '#/'; };
  else later(route, 2500);
}

// --- Learn: the course overview ---------------------------------------------------
function drawLearn(main, set) {
  const cur = currentChapter(set);
  const all = cur >= set.chapters.length;
  const done = set.chapters.filter((_, i) => chapterDone(set, i)).length;
  const p = pct(set);
  const items = set.chapters.map((c, i) => {
    const special = c.kind === 'checkpoint' || c.kind === 'final';
    const n = c.pages?.length || 0; const got = Math.min(set.progress[i] || 0, n);
    if (chapterDone(set, i)) {
      return `<li class="tl tl--done"><span class="tl__dot">${icon('check')}</span><div class="tl__row"><a href="#/learn/${set.id}/${i}"><h3>${esc(c.title)}</h3></a><span class="tl__tag">${special ? 'Checkpoint' : `${n} pages`}</span></div></li>`;
    }
    if (i === cur) {
      return `<li class="tl tl--active"><span class="tl__dot">${special ? fillIcon('star') : i + 1}</span>
        <div class="tl__card card"><div><h3>${esc(c.title)}</h3><p>${n ? `${n} pages, ${got} done` : special ? 'Questions across the chapters so far' : esc(c.summary || 'Written when you open it')}</p>
        ${n ? `<div class="segs" aria-hidden="true">${Array.from({ length: n }, (_, k) => `<i class="${k < got ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>
        <a class="btn btn--primary" href="#/learn/${set.id}/${i}">${got ? 'Continue' : 'Start'}</a></div></li>`;
    }
    return `<li class="tl"><span class="tl__dot">${special ? fillIcon('star') : i + 1}</span><div class="tl__row"><h3>${esc(c.title)}</h3>
      <span class="tl__tag">${special ? 'Checkpoint' : n ? `${n} pages` : ''}${icon('lock')}</span></div></li>`;
  }).join('');
  main.innerHTML = `<div class="pane">
    <header class="course-head"><div class="course-icon" aria-hidden="true">${esc(set.icon)}</div>
      <div><h1>${esc(set.title)}</h1><div class="bar-progress"><div class="track" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="Lesson progress"><i style="width:${p}%"></i></div><span>${p}%</span></div></div></header>
    <div class="next">${all ? `<a class="btn btn--big btn--green" href="#/learn/${set.id}/0">Review</a><div><small>COURSE FINISHED</small><b>${set.xp} XP earned</b></div>`
      : `<a class="btn btn--big btn--primary" href="#/learn/${set.id}/${cur}">Continue</a><div><small>NEXT CHAPTER</small><b>${esc(set.chapters[cur].title)}</b></div>`}</div>
    <section aria-labelledby="contents-h">
      <div class="contents__head"><h2 id="contents-h">Contents</h2><span class="muted">${done} of ${set.chapters.length} complete</span></div>
      <ol class="timeline">${items}<li class="tl tl--end"><span class="tl__dot">${icon('trophy')}</span><div class="tl__row"><span class="tl__end">Clear every chapter to finish the course</span></div></li></ol>
    </section>
    <p class="row-end" style="margin-top:48px"><button type="button" class="btn btn--ghost btn--sm" id="del">Delete lesson</button></p>
  </div>`;
  const del = document.getElementById('del');
  del.onclick = async () => {
    if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Click again to delete for good'; return; }
    await api(`/sets/${set.id}`, { method: 'DELETE' }); location.hash = '#/';
  };
  del.onblur = () => { del.dataset.armed = ''; del.textContent = 'Delete lesson'; };
}

// --- the player: one stream of pages, used by chapters and quizzes ----------------
function pageText(pg, withAnswer) {
  if (pg.type === 'text') return `${pg.heading ? `${pg.heading}. ` : ''}${plain(pg.body)}`;
  const q = pg.type === 'fill' ? pg.sentence.replace('____', 'blank') : pg.question;
  return `${q}\n${pg.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}${withAnswer ? `\nAnswer: ${pg.answer}` : ''}`;
}

function pageHTML(pg, i, past) {
  if (pg.type === 'text') return `<section class="pg" data-i="${i}">${pg.heading ? `<h2>${esc(pg.heading)}</h2>` : ''}<div class="pg__body">${md(pg.body)}</div></section>`;
  const mark = (c) => (past && c === pg.answer ? 'is-right' : '');
  if (pg.type === 'fill') {
    const [a, b] = esc(pg.sentence).split('____');
    return `<section class="pg" data-i="${i}"><p class="fill">${a}<span class="blank ${past ? 'is-right' : ''}">${past ? esc(pg.answer) : '&nbsp;'}</span>${b ?? ''}</p>
      <div class="words">${pg.choices.map((c, k) => `<button type="button" class="opt ${mark(c)}" data-k="${k}" ${past ? 'disabled' : ''}><kbd>${k + 1}</kbd>${esc(c)}</button>`).join('')}</div></section>`;
  }
  return `<section class="pg" data-i="${i}"><h2 class="pg__q">${esc(pg.question)}</h2>
    <div class="opts">${pg.choices.map((c, k) => `<button type="button" class="opt ${pg.type === 'profile' ? '' : mark(c)}" data-k="${k}" ${past ? 'disabled' : ''}><kbd>${k + 1}</kbd>${esc(c)}</button>`).join('')}</div></section>`;
}

// opts: { set, title, label(i,n), pages, start, exit, onStep(i, correct), onDone(stats), context }
function runPlayer(opts) {
  const { set, pages } = opts;
  let i = Math.min(opts.start, pages.length); let xp = set.xp || 0;
  const stats = { right: 0, asked: 0, xp: 0 };
  $app.innerHTML = `<div class="player">
    <div class="player__top"><div class="player__in">
      <div class="player__meta"><a class="x" href="${opts.exit}" aria-label="Close">${icon('x')}</a><span id="lbl"></span><span class="xp" aria-label="XP">${fillIcon('zap')}<b id="xp">${xp}</b></span></div>
      <div class="track" role="progressbar" aria-label="Progress"><i id="bar"></i></div></div></div>
    <main class="stream" id="stream">${pages.slice(0, i).map((p, k) => pageHTML(p, k, true)).join('')}</main>
    <footer class="player__foot" id="foot"></footer></div>`;
  const stream = document.getElementById('stream'); const foot = document.getElementById('foot');
  let sel = null; let checked = false;

  const progress = () => {
    document.getElementById('lbl').textContent = opts.label(Math.min(i + 1, pages.length), pages.length);
    document.getElementById('bar').style.width = `${(i / pages.length) * 100}%`;
    document.getElementById('xp').textContent = xp;
  };
  const scrollTo = (el) => el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });

  const footer = () => {
    const pg = pages[i];
    const q = pg.type !== 'text';
    if (checked && pg.type !== 'profile') {
      const ok = sel != null && pg.choices[sel] === pg.answer;
      foot.className = `player__foot ${ok ? 'is-right' : 'is-wrong'}`;
      foot.innerHTML = `<div class="player__in"><div class="verdict" role="status"><b>${ok ? 'Nice!' : 'Not quite'}</b><p>${ok ? '' : `Answer: <strong>${esc(pg.answer)}</strong>. `}${esc(pg.explanation || '')}</p></div>
        <div class="foot__end"><button type="button" class="pill-btn" id="ask">${icon('chat')}Ask</button><button type="button" class="btn ${ok ? 'btn--green' : 'btn--red'}" id="go">Continue</button></div></div>`;
    } else {
      foot.className = 'player__foot';
      foot.innerHTML = `<div class="player__in"><button type="button" class="pill-btn" id="listen">${icon('sound')}Listen</button><button type="button" class="pill-btn" id="ask">${icon('chat')}Ask</button>
        <div class="foot__end">${q ? `<span class="foot__hint">Keys 1-${pg.choices.length}</span>` : ''}
        <button type="button" class="btn ${q && pg.type !== 'profile' ? 'btn--green' : 'btn--primary'}" id="go" ${q && sel == null ? 'disabled' : ''}>${q && pg.type !== 'profile' ? 'Check' : 'Continue'} <kbd>↵</kbd></button></div></div>`;
      foot.querySelector('#listen').onclick = () => speak(pageText(pg));
    }
    foot.querySelector('#ask').onclick = () => openChat(set, { title: 'Ask Swot', context: () => pageText(pages[i], checked) });
    foot.querySelector('#go').onclick = go;
  };

  const choose = (k) => {
    const pg = pages[i]; if (pg.type === 'text' || checked || !pg.choices[k]) return;
    sel = k;
    const el = stream.querySelector(`.pg[data-i="${i}"]`);
    el.querySelectorAll('.opt').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.k === k));
    if (pg.type === 'fill') el.querySelector('.blank').textContent = pg.choices[k];
    footer();
  };

  const go = () => {
    const pg = pages[i];
    if (pg.type === 'mcq' || pg.type === 'fill') {
      if (sel == null) return;
      if (!checked) {
        checked = true; stats.asked++;
        const ok = pg.choices[sel] === pg.answer;
        if (ok) { stats.right++; stats.xp += 10; xp += 10; }
        const el = stream.querySelector(`.pg[data-i="${i}"]`);
        el.querySelectorAll('.opt').forEach((b) => {
          b.disabled = true;
          const c = pg.choices[b.dataset.k];
          if (c === pg.answer) b.classList.add('is-right'); else if (+b.dataset.k === sel) b.classList.add('is-wrong');
        });
        if (pg.type === 'fill') el.querySelector('.blank').classList.add(ok ? 'is-right' : 'is-wrong');
        progress(); footer(); foot.querySelector('#go').focus();
        return;
      }
    }
    if (pg.type === 'profile') {
      if (sel == null) return;
      stream.querySelectorAll(`.pg[data-i="${i}"] .opt`).forEach((b) => { b.disabled = true; });
    }
    opts.onStep(i, pg, sel, xp);
    i++; sel = null; checked = false;
    if (i >= pages.length) { progress(); return opts.onDone({ ...stats, xp: stats.xp, total: xp }); }
    stream.insertAdjacentHTML('beforeend', pageHTML(pages[i], i, false));
    const el = stream.lastElementChild;
    el.querySelectorAll('.opt').forEach((b) => { b.onclick = () => choose(+b.dataset.k); });
    progress(); footer(); scrollTo(el);
  };

  onKeys((e) => {
    if (e.key === 'Enter') { const b = foot.querySelector('#go'); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
    else if (/^[1-9]$/.test(e.key)) choose(+e.key - 1);
  });

  if (i >= pages.length) return opts.onDone(stats);
  if (!stream.querySelector(`.pg[data-i="${i}"]`)) {
    stream.insertAdjacentHTML('beforeend', pageHTML(pages[i], i, false));
    stream.lastElementChild.querySelectorAll('.opt').forEach((b) => { b.onclick = () => choose(+b.dataset.k); });
  }
  progress(); footer();
  later(() => scrollTo(stream.lastElementChild), 50);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function doneScreen({ emoji, title, line, stats, actions }) {
  $app.innerHTML = `<main class="done-screen"><div class="big" aria-hidden="true">${emoji}</div><h1>${esc(title)}</h1><p class="muted">${esc(line)}</p>
    <div class="stats"><div class="stat stat--xp card"><b>+${stats.xp}</b><span>XP earned</span></div>
    <div class="stat stat--acc card"><b>${stats.asked ? Math.round((stats.right / stats.asked) * 100) : 100}%</b><span>Accuracy</span></div></div>
    <div class="row-end">${actions}</div></main>`;
  $app.querySelector('.btn--primary')?.focus();
}

function loadingNote(title, line) {
  $app.innerHTML = `<div class="center-note" role="status" aria-live="polite"><span class="ring ring--spin" aria-hidden="true"></span><h1>${esc(title)}</h1><p class="muted">${esc(line)}</p></div>`;
}

async function showPlayer(id, ch) {
  let set = await api(`/sets/${id}`);
  if (set.status !== 'ready') { location.hash = `#/set/${id}/learn`; return; }
  const c = set.chapters[ch];
  if (!c || (ch > 0 && !chapterDone(set, ch - 1) && !chapterDone(set, ch))) { location.hash = `#/set/${id}/learn`; return; }
  document.title = `${c.title} · Swot`;
  if (!c.pages?.length) {
    loadingNote(c.kind === 'chapter' ? `Writing "${c.title}"` : `Writing your ${c.title.toLowerCase()}`, 'Your model is preparing this part of the lesson. It takes about a minute.');
    try { set = await api(`/sets/${id}/chapters/${ch}`, { body: engine() }); } catch (e) {
      $app.innerHTML = `<div class="center-note" role="alert"><h1>This chapter did not load</h1><p class="error">${esc(e.message)}</p><div class="row-end"><a class="btn" href="#/set/${id}/learn">Back</a><button class="btn btn--primary" type="button" id="retry">Try again</button></div></div>`;
      document.getElementById('retry').onclick = route; return;
    }
    if (!location.hash.startsWith(`#/learn/${id}/${ch}`)) return;
  } else api(`/sets/${id}/chapters/${ch}`, { body: engine() }).catch(() => {}); // warms the next chapter
  const pages = set.chapters[ch].pages;
  const review = chapterDone(set, ch);
  const progress = { ...set.progress };
  runPlayer({
    set, pages, start: review ? 0 : progress[ch] || 0, exit: `#/set/${id}/learn`,
    label: (k, n) => `${set.chapters[ch].title} · ${k} of ${n}`,
    onStep: (k, pg, sel, xp) => {
      const patch = { xp };
      if (!review) { progress[ch] = Math.max(progress[ch] || 0, k + 1); patch.progress = progress; }
      if (pg.type === 'profile') { set.profile = { ...set.profile, [pg.key]: pg.choices[sel] }; patch.profile = set.profile; }
      set.xp = xp;
      api(`/sets/${id}`, { method: 'PATCH', body: patch }).catch(() => {});
    },
    onDone: (stats) => {
      const next = set.chapters[ch + 1];
      doneScreen({ emoji: next ? '🎉' : '🏆', title: next ? 'Chapter complete!' : 'Lesson complete!',
        line: next ? `Up next: ${next.title}` : 'You finished every section.', stats,
        actions: `<a class="btn" href="#/set/${id}/learn">Back to lesson</a>${next ? `<a class="btn btn--primary" href="#/learn/${id}/${ch + 1}">Continue</a>` : ''}` });
    },
  });
}

// --- chat (side panel, drawer) ------------------------------------------------------
function chatInner(set, { acts } = {}) {
  const msgs = set.chat.map((m) => `<div class="msg msg--${m.role}">${m.role === 'user' ? esc(m.content) : md(m.content)}</div>`).join('');
  return msgs ? `<div class="msgs">${msgs}</div>` : `${acts ? `<div class="acts">
      <a class="act card act--wide" href="#/set/${set.id}/quiz"><b>${icon('quiz')}Quiz</b><span>See what stuck</span></a>
      <a class="act card" href="#/set/${set.id}/podcast"><b>${icon('podcast')}Podcast</b><span>Learn it on a walk</span></a>
      <a class="act card" href="#/set/${set.id}/flashcards"><b>${icon('cards')}Flashcards</b><span>Drill the key terms</span></a></div>` : ''}
    <div class="hello"><h3>Stuck on something?</h3><p>${acts ? 'Ask about anything in this course, or ask me to explain it another way.' : 'I have read the whole source. Ask me where something is, or what it means.'}</p></div>`;
}

function chatPanel(set, { title, acts, context, close }) {
  return `<div class="side__head"><span>${esc(title)}</span>${close ? `<button type="button" class="x" id="chat-close" aria-label="Close chat">${icon('x')}</button>` : ''}</div>
    <div class="side__scroll" id="chat-scroll">${chatInner(set, { acts })}</div>
    <form class="chat-form card" id="chat-form"><label class="visually-hidden" for="chat-q">Your question</label>
      <textarea id="chat-q" rows="2" placeholder="Type a question here..."></textarea>
      <div class="chat-form__row"><span class="typing" id="chat-status" role="status"></span><button class="send" type="submit" aria-label="Send">${icon('up')}</button></div></form>`;
}

function bindChat(root, set, { acts, context }) {
  const form = root.querySelector('#chat-form'); const q = form.querySelector('textarea');
  const scroll = root.querySelector('#chat-scroll'); const status = root.querySelector('#chat-status');
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const message = q.value.trim(); if (!message) return;
    const btn = form.querySelector('button'); btn.disabled = true; q.value = '';
    set.chat = [...set.chat, { role: 'user', content: message }];
    scroll.innerHTML = chatInner(set, { acts }); status.textContent = 'Thinking...'; status.classList.remove('error');
    scroll.scrollTop = scroll.scrollHeight;
    try {
      const next = await api(`/sets/${set.id}/chat`, { body: { message, context: context?.() || '', ...engine() } });
      set.chat = next.chat; status.textContent = '';
    } catch (err) { set.chat = set.chat.slice(0, -1); q.value = message; status.textContent = err.message; status.classList.add('error'); }
    scroll.innerHTML = chatInner(set, { acts }); scroll.scrollTop = scroll.scrollHeight;
    btn.disabled = false; q.focus();
  };
  scroll.scrollTop = scroll.scrollHeight;
}

function openChat(set, { title, context }) {
  document.querySelector('.drawer')?.remove();
  const d = document.createElement('aside');
  d.className = 'drawer'; d.setAttribute('aria-label', title);
  d.innerHTML = chatPanel(set, { title, close: true });
  document.body.append(d);
  bindChat(d, set, { context });
  const close = () => d.remove();
  d.querySelector('#chat-close').onclick = close;
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  life.signal.addEventListener('abort', close);
  d.querySelector('textarea').focus();
}

// --- Notes ---------------------------------------------------------------------------
function drawNotes(main, set) {
  main.innerHTML = `<div class="split"><div class="pane" id="doc-pane"></div><aside class="side card" id="side" aria-label="Chat">${chatPanel(set, { title: 'Chat', acts: true })}</aside></div>`;
  bindChat(document.getElementById('side'), set, { acts: true });
  const pane = document.getElementById('doc-pane');
  const view = () => {
    if (set.notesStatus === 'processing') {
      pane.innerHTML = '<div role="status" aria-live="polite"><p class="muted">Your model is still writing the notes.</p><div class="skel skel--h"></div><div class="skel"></div><div class="skel skel--s"></div><div class="skel"></div></div>';
      later(async () => { Object.assign(set, await api(`/sets/${set.id}`)); view(); }, 3000); return;
    }
    if (set.notesStatus === 'error' || !set.notes) {
      pane.innerHTML = `<div class="center-note" role="alert"><h1>No notes yet</h1><p class="muted">${esc(set.notesError || 'The notes did not finish.')}</p><button class="btn btn--primary" type="button" id="regen">Write notes</button></div>`;
      document.getElementById('regen').onclick = async (e) => {
        e.currentTarget.disabled = true; e.currentTarget.textContent = 'Writing...';
        try { Object.assign(set, await api(`/sets/${set.id}/notes`, { body: engine() })); view(); }
        catch (err) { pane.querySelector('.muted').textContent = err.message; e.currentTarget.disabled = false; e.currentTarget.textContent = 'Try again'; }
      };
      return;
    }
    pane.innerHTML = `<div class="doc-tools"><button type="button" class="btn btn--sm" id="edit">${icon('pen')}Edit</button></div><article class="doc">${md(set.notes)}</article>`;
    document.getElementById('edit').onclick = edit;
  };
  const edit = () => {
    pane.innerHTML = `<div class="doc-tools"><button type="button" class="btn btn--sm btn--ghost" id="cancel">Cancel</button><button type="button" class="btn btn--sm btn--primary" id="save">Save</button></div>
      <label class="visually-hidden" for="doc-edit">Notes in markdown</label><textarea class="doc-edit" id="doc-edit" spellcheck="true">${esc(set.notes)}</textarea>`;
    document.getElementById('cancel').onclick = view;
    document.getElementById('save').onclick = async () => {
      set.notes = document.getElementById('doc-edit').value;
      await api(`/sets/${set.id}`, { method: 'PATCH', body: { notes: set.notes } });
      view();
    };
    document.getElementById('doc-edit').focus();
  };
  view();
}

// --- Quiz ------------------------------------------------------------------------------
function drawQuiz(main, set) {
  const topics = set.quizTopics || [];
  if (!topics.length) {
    main.innerHTML = `<div class="welcome"><h1>Quiz yourself</h1><p class="sub">Swot splits your material into topics. Pick one and answer questions on just that part.</p>
      <button type="button" class="btn btn--primary btn--wide" id="gen">Find quiz topics</button><p class="form-msg" id="msg" role="status"></p></div>`;
  } else {
    main.innerHTML = `<div class="welcome"><h1>Quiz yourself</h1><p class="sub">Pick a topic. Its questions are written the first time you open it.</p>
      <div class="topics">${topics.map((t, i) => `<a class="topic card" href="#/quiz/${set.id}/${i}"><b>${esc(t.title)}</b><span>${esc(t.description)}</span>
        ${t.best != null ? `<em>Best ${t.best} of ${t.questions?.length || 0}</em>` : `<span>${t.questions ? `${t.questions.length} questions` : 'Not started'}</span>`}</a>`).join('')}</div>
      <p class="row-end"><button type="button" class="btn btn--sm btn--ghost" id="gen">New topics</button></p><p class="form-msg" id="msg" role="status"></p></div>`;
  }
  document.getElementById('gen').onclick = async (e) => {
    const b = e.currentTarget; const msg = document.getElementById('msg');
    b.disabled = true; b.textContent = 'Finding topics...'; msg.textContent = ''; msg.classList.remove('error');
    try { Object.assign(set, await api(`/sets/${set.id}/quiz`, { body: engine() })); drawQuiz(main, set); }
    catch (err) { msg.textContent = err.message; msg.classList.add('error'); b.disabled = false; b.textContent = 'Try again'; }
  };
}

async function showQuizPlayer(id, n) {
  let set = await api(`/sets/${id}`);
  const topic = set.quizTopics?.[n];
  if (!topic) { location.hash = `#/set/${id}/quiz`; return; }
  if (!topic.questions?.length) {
    loadingNote(`Writing questions on ${topic.title}`, 'This takes about a minute.');
    try { set = await api(`/sets/${id}/quiz/${n}`, { body: engine() }); } catch (e) {
      $app.innerHTML = `<div class="center-note" role="alert"><h1>Questions did not load</h1><p class="error">${esc(e.message)}</p><div class="row-end"><a class="btn" href="#/set/${id}/quiz">Back</a><button class="btn btn--primary" id="retry" type="button">Try again</button></div></div>`;
      document.getElementById('retry').onclick = route; return;
    }
    if (!location.hash.startsWith(`#/quiz/${id}/${n}`)) return;
  }
  const qs = set.quizTopics[n].questions;
  runPlayer({
    set, pages: qs, start: 0, exit: `#/set/${id}/quiz`, label: (k, total) => `${topic.title} · ${k} of ${total}`,
    onStep: (k, pg, sel, xp) => { set.xp = xp; api(`/sets/${id}`, { method: 'PATCH', body: { xp } }).catch(() => {}); },
    onDone: (stats) => {
      api(`/sets/${id}/quiz/${n}`, { body: { score: stats.right } }).catch(() => {});
      doneScreen({ emoji: stats.right === stats.asked ? '🏆' : '✅', title: `${stats.right} of ${stats.asked} right`, line: topic.title, stats,
        actions: `<a class="btn" href="#/set/${id}/quiz">All topics</a><button class="btn btn--primary" type="button" id="again">Try again</button>` });
      document.getElementById('again').onclick = route;
    },
  });
}

// --- Flashcards -------------------------------------------------------------------------
const COUNTS = [[10, 'A quick pass'], [20, 'The essentials'], [30, 'Most of it'], [50, 'Everything']];

function drawCards(main, set, fresh = false) {
  if (!set.flashcards.length || fresh) {
    let count = 20;
    main.innerHTML = `<div class="welcome"><h1>Make flashcards</h1><p class="sub">How many cards should Swot write?</p>
      <div class="counts" role="group" aria-label="How many cards">${COUNTS.map(([n, l]) => `<button type="button" class="count" data-n="${n}" aria-pressed="${n === count}"><b>${n}</b><span>${l}</span></button>`).join('')}</div>
      <label class="field">Focus on (optional)<textarea id="instr" placeholder="For example: only dates and names, or just chapter 3. Leave empty for a bit of everything."></textarea></label>
      <button type="button" class="btn btn--primary btn--wide" id="gen">Make 20 cards</button>
      ${set.flashcards.length ? '<p class="row-end"><button type="button" class="btn btn--sm btn--ghost" id="back">Back to my deck</button></p>' : ''}
      <p class="form-msg" id="msg" role="status"></p></div>`;
    const gen = document.getElementById('gen');
    main.querySelector('.counts').onclick = (e) => {
      const b = e.target.closest('.count'); if (!b) return;
      count = +b.dataset.n;
      main.querySelectorAll('.count').forEach((x) => x.setAttribute('aria-pressed', x === b));
      gen.textContent = `Make ${count} cards`;
    };
    document.getElementById('back')?.addEventListener('click', () => drawCards(main, set));
    gen.onclick = async () => {
      const msg = document.getElementById('msg');
      gen.disabled = true; gen.textContent = `Writing ${count} cards...`; msg.textContent = ''; msg.classList.remove('error');
      try { Object.assign(set, await api(`/sets/${set.id}/flashcards`, { body: { count, instructions: document.getElementById('instr').value, ...engine() } })); drawCards(main, set); }
      catch (err) { msg.textContent = err.message; msg.classList.add('error'); gen.disabled = false; gen.textContent = 'Try again'; }
    };
    return;
  }
  // a simple Leitner pass: "Again" sends a card to the back, "Got it" retires it
  let deck = set.flashcards.map((_, i) => i); let back = false; let again = 0;
  const draw = () => {
    if (!deck.length) {
      main.innerHTML = `<div class="done-screen"><div class="big" aria-hidden="true">🎉</div><h1>Deck done</h1><p class="muted">${set.flashcards.length} cards, ${again} sent back for another look.</p>
        <div class="row-end"><button class="btn" type="button" id="new">New set</button><button class="btn btn--primary" type="button" id="restart">Go again</button></div></div>`;
      document.getElementById('restart').onclick = () => { deck = set.flashcards.map((_, i) => i).sort(() => Math.random() - 0.5); again = 0; draw(); };
      document.getElementById('new').onclick = () => drawCards(main, set, true);
      document.getElementById('restart').focus();
      return;
    }
    const c = set.flashcards[deck[0]];
    main.innerHTML = `<div class="deck"><div class="deck__meta"><span>${deck.length} of ${set.flashcards.length} left</span><button class="btn btn--sm btn--ghost" type="button" id="new">New set</button></div>
      <button type="button" class="flash card ${back ? 'is-back' : ''}" id="card" aria-live="polite"><span><small>${back ? 'Answer' : 'Question'}</small>${esc(back ? c.back : c.front)}</span></button>
      <div class="deck__actions" ${back ? '' : 'hidden'}><button type="button" class="btn btn--red" id="again">Again <kbd>1</kbd></button><button type="button" class="btn btn--green" id="got">Got it <kbd>2</kbd></button></div>
      <p class="muted" style="text-align:center">${back ? '' : 'Space or click to flip'}</p></div>`;
    document.getElementById('card').onclick = () => { back = !back; draw(); document.getElementById(back ? 'got' : 'card').focus(); };
    document.getElementById('new').onclick = () => drawCards(main, set, true);
    if (back) {
      document.getElementById('again').onclick = () => { deck.push(deck.shift()); again++; back = false; draw(); document.getElementById('card')?.focus(); };
      document.getElementById('got').onclick = () => { deck.shift(); back = false; draw(); document.getElementById('card')?.focus(); };
    }
  };
  onKeys((e) => {
    if (e.key === ' ' && e.target.id !== 'card') { e.preventDefault(); document.getElementById('card')?.click(); }
    if (back && e.key === '1') document.getElementById('again')?.click();
    if (back && e.key === '2') document.getElementById('got')?.click();
  });
  draw();
}

// --- Podcast: a two-host script, read aloud by the browser's own voices -----------------
const LANGS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Hindi', 'Bengali', 'Japanese', 'Korean', 'Chinese', 'Arabic'];
const voices = () => (window.speechSynthesis?.getVoices() || []);

function drawPodcast(main, set, fresh = false) {
  const vs = voices();
  const voiceSel = (n) => {
    const cur = store.get(`swot.voice${n}`, vs[n - 1]?.name || '');
    return `<select id="voice${n}">${vs.length ? vs.map((v) => `<option ${v.name === cur ? 'selected' : ''}>${esc(v.name)}</option>`).join('') : '<option value="">Browser default</option>'}</select>`;
  };
  if (!vs.length && window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', () => drawPodcast(main, set, fresh), { once: true, signal: life.signal });
  if (!set.podcast || fresh) {
    main.innerHTML = `<div class="welcome"><h1>Turn it into a podcast</h1><p class="sub">Two hosts talk through your material while you listen.</p>
      <div class="inline-fields"><label>Language <select id="lang">${LANGS.map((l) => `<option>${l}</option>`).join('')}</select></label>
        <label>Length <select id="len"><option value="short">Short (3-5 min)</option><option value="medium">Medium (8-10 min)</option><option value="long">Long (15 min)</option></select></label></div>
      <div class="speakers"><label class="card">Voice of host 1 ${voiceSel(1)}</label><label class="card">Voice of host 2 ${voiceSel(2)}</label></div>
      <label class="field">Focus on (optional)<textarea id="instr" placeholder="For example: explain it like I am new to this, or only the parts on exams. Leave empty to cover it all."></textarea></label>
      <button type="button" class="btn btn--primary btn--wide" id="gen">Make the episode</button>
      ${set.podcast ? '<p class="row-end"><button type="button" class="btn btn--sm btn--ghost" id="back">Back to my episode</button></p>' : ''}
      <p class="form-msg" id="msg" role="status"></p></div>`;
    ['voice1', 'voice2'].forEach((v, k) => { document.getElementById(v).onchange = (e) => store.set(`swot.voice${k + 1}`, e.target.value); });
    document.getElementById('back')?.addEventListener('click', () => drawPodcast(main, set));
    const gen = document.getElementById('gen');
    gen.onclick = async () => {
      const msg = document.getElementById('msg');
      gen.disabled = true; gen.textContent = 'Writing the episode...'; msg.textContent = ''; msg.classList.remove('error');
      try {
        Object.assign(set, await api(`/sets/${set.id}/podcast`, { body: { language: document.getElementById('lang').value, length: document.getElementById('len').value, instructions: document.getElementById('instr').value, ...engine() } }));
        drawPodcast(main, set);
      } catch (err) { msg.textContent = err.message; msg.classList.add('error'); gen.disabled = false; gen.textContent = 'Try again'; }
    };
    return;
  }
  const pod = set.podcast; const words = pod.lines.reduce((a, l) => a + l.text.split(/\s+/).length, 0);
  main.innerHTML = `<div class="pod"><div class="pod__player card"><button type="button" class="pod__play" id="play" aria-label="Play">${fillIcon('play')}</button>
      <div><h2>${esc(pod.title)}</h2><p class="muted">${pod.lines.length} lines, about ${Math.max(1, Math.round(words / 150))} min, ${esc(pod.language)}</p></div></div>
    <div class="lines" id="lines">${pod.lines.map((l, i) => `<button type="button" class="line" data-i="${i}"><b>Host ${l.speaker}</b><span>${esc(l.text)}</span></button>`).join('')}</div>
    <p class="row-end"><button type="button" class="btn btn--sm btn--ghost" id="new">New episode</button></p></div>`;
  let at = 0; let playing = false;
  const play = document.getElementById('play');
  const mark = () => {
    main.querySelectorAll('.line').forEach((b) => b.classList.toggle('is-now', playing && +b.dataset.i === at));
    play.innerHTML = fillIcon(playing ? 'pause' : 'play'); play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  };
  const say = () => {
    if (!playing || at >= pod.lines.length) { playing = false; at = at >= pod.lines.length ? 0 : at; mark(); return; }
    const l = pod.lines[at]; const u = new SpeechSynthesisUtterance(l.text);
    const name = store.get(`swot.voice${l.speaker}`, ''); const v = voices().find((x) => x.name === name);
    if (v) u.voice = v; else u.pitch = l.speaker === 2 ? 1.25 : 0.9;
    u.onend = () => { if (playing) { at++; say(); } };
    speechSynthesis.speak(u); mark();
    main.querySelector(`.line[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  };
  play.onclick = () => { if (!window.speechSynthesis) return; playing = !playing; speechSynthesis.cancel(); if (playing) say(); else mark(); };
  document.getElementById('lines').onclick = (e) => { const b = e.target.closest('.line'); if (!b) return; speechSynthesis.cancel(); at = +b.dataset.i; playing = true; say(); };
  document.getElementById('new').onclick = () => { playing = false; speechSynthesis.cancel(); drawPodcast(main, set, true); };
  life.signal.addEventListener('abort', () => { playing = false; });
}

// --- Source -------------------------------------------------------------------------------
function drawSource(main, set) {
  const kind = set.source?.kind; const fileUrl = `/api/sets/${set.id}/file`;
  const yt = set.source?.url?.match(/[?&]v=([\w-]{11})/)?.[1];
  const text = `<pre>${esc(kind === 'topic' ? `Topic: ${set.text}\n\nThis lesson was written from general knowledge, not from a document.` : set.text)}</pre>`;
  const viewer = kind === 'pdf' && set.file !== null ? `<div class="viewer"><iframe src="${fileUrl}" title="${esc(set.source.name)}"></iframe></div>`
    : yt ? `<div class="viewer viewer--video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="${esc(set.source.name)}" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>${text}</div>`
    : kind === 'audio' ? `<div class="viewer viewer--media">${set.file ? `<audio controls preload="metadata" src="${fileUrl}"></audio>` : ''}${text}</div>`
    : kind === 'image' && set.file ? `<div class="viewer viewer--media"><img src="${fileUrl}" alt="${esc(set.source.name)}">${text}</div>`
    : kind === 'web' ? `<div class="viewer viewer--media"><a class="btn btn--sm" href="${esc(set.source.url)}" target="_blank" rel="noopener noreferrer">${icon('link')}Open the original page</a>${text}</div>`
    : `<div class="viewer">${text}</div>`;
  main.innerHTML = `<div class="source">${viewer}<aside class="side card" id="side" aria-label="Ask the source">${chatPanel(set, { title: 'Ask the source' })}</aside></div>`;
  bindChat(document.getElementById('side'), set, {});
}

route();
