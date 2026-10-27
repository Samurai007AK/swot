import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createSet, getSet, getFile, mutate, updateSet, deleteSet, listSets } from './store.js';
import { fromPdf, fromText, fromTopic, fromUrl } from './extract.js';
import { ask, parseJson } from './llm.js';
import * as P from './prompts.js';

export const PORT = Number(process.env.SWOT_PORT || 4310);
const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

function hasCli(cmd) {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
}

// The engine (provider + model) used by background work started for a set, e.g. prefetching the next chapter.
const engines = new Map();
const engineOf = (id, b = {}) => {
  if (b.provider) engines.set(id, { provider: b.provider, model: b.model || '' });
  return engines.get(id) || { provider: 'claude', model: '' };
};

// Runs fn over items with at most `limit` running at once (so a long book doesn't fire 30 CLI processes).
async function pool(items, limit, fn) {
  const out = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

async function digestLongSource(id, engine) {
  let set = await getSet(id);
  if (set.source?.kind === 'topic' || set.text.length <= P.LONG || set.digest) return set;
  const parts = P.splitParts(set.text);
  set = await updateSet(id, { parts, step: `Skimming part 1 of ${parts.length}` });
  const chars = Math.max(2500, Math.min(8000, Math.floor(100_000 / parts.length)));
  let done = 0;
  const digests = await pool(parts, 3, async (_, i) => {
    const d = P.stripFence(await ask({ ...engine, prompt: P.digestPrompt(set, i, chars) }));
    await updateSet(id, { step: `Skimming part ${Math.min(++done + 1, parts.length)} of ${parts.length}` });
    return `## Part ${i + 1}\n${d}`;
  });
  return updateSet(id, { digest: digests.join('\n\n'), step: 'Planning your chapters' });
}

async function generateCourse(id, engine) {
  let set;
  try { set = await digestLongSource(id, engine); } catch (e) {
    await updateSet(id, { status: 'error', step: '', error: e.message, notesStatus: 'error' }).catch(() => {});
    return;
  }
  const notes = ask({ ...engine, prompt: P.notesPrompt(set) })
    .then((md) => updateSet(id, { notes: P.stripFence(md), notesStatus: 'ready' }))
    .catch((e) => updateSet(id, { notesStatus: 'error', notesError: e.message }));
  try {
    await updateSet(id, { step: 'Planning your chapters' });
    const course = P.buildCourse(parseJson(await ask({ ...engine, prompt: P.planPrompt(set) })), set.parts?.length || 0);
    if (course.chapters.length < 3) throw new Error('The model returned no chapters. Try again or pick a stronger model.');
    await updateSet(id, { ...course, title: course.title || set.title, status: 'ready', step: '',
      model: `${engine.provider}${engine.model ? ` (${engine.model})` : ''}` });
    chapter(id, 1).catch(() => {});
  } catch (e) {
    await updateSet(id, { status: 'error', step: '', error: e.message }).catch(() => {});
  }
  await notes;
}

// Chapter pages are written when first needed; the one after it is prefetched so "Continue" never waits.
const inflight = new Map();
function chapter(id, index) {
  const key = `${id}:${index}`;
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const set = await getSet(id);
    const ch = set.chapters[index];
    if (!ch) throw bad('No such chapter.', 404);
    if (ch.pages?.length) return set;
    const pages = P.cleanPages(parseJson(await ask({ ...engineOf(id), prompt: P.chapterPrompt(set, index) })).pages);
    if (!pages.length) throw new Error('The model wrote an empty chapter. Try again.');
    return mutate(id, (s) => { s.chapters[index].pages = pages; });
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function body(req) {
  let size = 0; const chunks = [];
  for await (const c of req) {
    if ((size += c.length) > 160e6) throw bad('Upload is over 120 MB.', 413);
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

const CLIENT_FIELDS = ['progress', 'xp', 'profile', 'notes', 'openedAt', 'title'];

const routes = [
  ['GET', /^\/api\/config$/, () => ({ providers: { claude: hasCli('claude'), codex: hasCli('codex') } })],
  ['GET', /^\/api\/sets$/, () => listSets()],
  ['GET', /^\/api\/sets\/([\w-]+)$/, (_, id) => getSet(id)],
  ['DELETE', /^\/api\/sets\/([\w-]+)$/, async (_, id) => (await deleteSet(id), { ok: true })],

  ['POST', /^\/api\/sets$/, async (b) => {
    const upload = b.fileBase64 ? { bytes: Buffer.from(b.fileBase64, 'base64'), type: String(b.fileType || 'application/octet-stream') } : null;
    let src;
    if (b.kind === 'pdf') {
      src = await fromPdf(upload?.bytes || Buffer.alloc(0), b.name, b.ocr || {});
      // Scanned pages come back to the browser, which runs OCR on them and sends the text with the PDF again.
      if (src.missing.length) throw Object.assign(bad(`${src.missing.length} page(s) are scanned images and need OCR.`, 422), { needsOcr: src.missing });
    } else if (b.kind === 'url' || b.kind === 'youtube') src = await fromUrl(b.url);
    else if (b.kind === 'audio' || b.kind === 'image') src = fromText(b.text, b.name || (b.kind === 'audio' ? 'Recording' : 'Image'), b.kind);
    else if (b.kind === 'text') src = fromText(b.text, b.name || undefined);
    else src = fromTopic(b.text);
    const { missing, file, ...fields } = src;
    const set = await createSet({ ...fields, status: 'processing', step: 'Reading your material', notesStatus: 'processing' }, file || upload);
    generateCourse(set.id, engineOf(set.id, b));
    return set;
  }],

  ['PATCH', /^\/api\/sets\/([\w-]+)$/, (b, id) => mutate(id, (s) => {
    for (const k of CLIENT_FIELDS) if (k in b) s[k] = b[k];
  })],

  ['POST', /^\/api\/sets\/([\w-]+)\/chapters\/(\d+)$/, async (b, id, n) => {
    engineOf(id, b);
    const set = await chapter(id, +n);
    if (set.chapters[+n + 1] && !set.chapters[+n + 1].pages) chapter(id, +n + 1).catch(() => {});
    return set;
  }],

  ['POST', /^\/api\/sets\/([\w-]+)\/notes$/, async (b, id) => {
    const set = await getSet(id);
    return updateSet(id, { notes: P.stripFence(await ask({ ...engineOf(id, b), prompt: P.notesPrompt(set) })), notesStatus: 'ready' });
  }],

  ['POST', /^\/api\/sets\/([\w-]+)\/flashcards$/, async (b, id) => {
    const count = [10, 20, 30, 50].includes(+b.count) ? +b.count : 20;
    const set = await getSet(id);
    const cards = P.cleanCards(parseJson(await ask({ ...engineOf(id, b), prompt: P.flashcardsPrompt(set, count, String(b.instructions || '').slice(0, 500)) })).flashcards);
    if (!cards.length) throw new Error('The model returned no flashcards. Try again.');
    return updateSet(id, { flashcards: cards });
  }],

  ['POST', /^\/api\/sets\/([\w-]+)\/quiz$/, async (b, id) => {
    const set = await getSet(id);
    const topics = (parseJson(await ask({ ...engineOf(id, b), prompt: P.quizTopicsPrompt(set) })).topics || [])
      .filter((t) => t?.title).map((t) => ({ title: String(t.title).trim(), description: String(t.description || '').trim(), questions: null, best: null }));
    if (!topics.length) throw new Error('The model returned no topics. Try again.');
    return updateSet(id, { quizTopics: topics });
  }],

  ['POST', /^\/api\/sets\/([\w-]+)\/quiz\/(\d+)$/, async (b, id, n) => {
    const set = await getSet(id);
    const topic = set.quizTopics[+n];
    if (!topic) throw bad('No such topic.', 404);
    if (b.score != null) return mutate(id, (s) => { s.quizTopics[+n].best = Math.max(s.quizTopics[+n].best ?? 0, +b.score); });
    const questions = P.cleanQuestions(parseJson(await ask({ ...engineOf(id, b), prompt: P.topicQuestionsPrompt(set, topic) })).questions);
    if (!questions.length) throw new Error('The model returned no questions. Try again.');
    return mutate(id, (s) => { s.quizTopics[+n].questions = questions; });
  }],

  ['POST', /^\/api\/sets\/([\w-]+)\/podcast$/, async (b, id) => {
    const set = await getSet(id);
    const out = parseJson(await ask({ ...engineOf(id, b), prompt: P.podcastPrompt(set, {
      language: String(b.language || 'English').slice(0, 40), length: b.length, instructions: String(b.instructions || '').slice(0, 500) }) }));
    const lines = (out.lines || []).filter((l) => l?.text).map((l) => ({ speaker: l.speaker === 2 ? 2 : 1, text: String(l.text).trim() }));
    if (!lines.length) throw new Error('The model returned an empty script. Try again.');
    return updateSet(id, { podcast: { title: String(out.title || set.title), language: b.language || 'English', lines } });
  }],

  ['POST', /^\/api\/sets\/([\w-]+)\/chat$/, async (b, id) => {
    const message = String(b.message || '').trim();
    if (!message) throw bad('Type a question first.');
    const set = await getSet(id);
    const reply = await ask({ ...engineOf(id, b), prompt: P.chatPrompt(set, message, String(b.context || '').slice(0, 4000)) });
    return mutate(id, (s) => { s.chat.push({ role: 'user', content: message }, { role: 'assistant', content: reply }); });
  }],
];

export function startServer(port = PORT) {
  const local = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const server = createServer(async (req, res) => {
    const send = (status, data, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(type === 'application/json' ? JSON.stringify(data) : data);
    };
    // The API spends the user's subscription: refuse other hosts (DNS rebinding) and other sites' pages (CSRF).
    const origin = req.headers.origin?.replace(/^https?:\/\//, '');
    if (!local.has(req.headers.host) || (origin && !local.has(origin))) return send(403, { error: 'Forbidden' });
    const url = new URL(req.url, 'http://x');
    try {
      const fileRoute = req.method === 'GET' && url.pathname.match(/^\/api\/sets\/([\w-]+)\/file$/);
      if (fileRoute) { const f = await getFile(fileRoute[1]); return send(200, f.bytes, f.type); }
      if (url.pathname.startsWith('/api/')) {
        for (const [method, re, fn] of routes) {
          const m = req.method === method && url.pathname.match(re);
          if (m) return send(200, await fn(method === 'GET' || method === 'DELETE' ? null : await body(req), ...m.slice(1)));
        }
        return send(404, { error: 'Not found' });
      }
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[\w.-]+$/.test(name)) return send(404, 'Not found', 'text/plain');
      send(200, await readFile(join(WEB, name)), TYPES[extname(name)] || 'application/octet-stream');
    } catch (e) {
      send(e.status || (e.code === 'ENOENT' ? 404 : 500), { error: e.code === 'ENOENT' ? 'Not found' : e.message, ...(e.needsOcr ? { needsOcr: e.needsOcr } : {}) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  }).then(async (s) => {
    // Generation runs inside this process, so anything still "processing" died with the last one.
    for (const set of await listSets()) {
      if (set.status === 'processing') await updateSet(set.id, { status: 'error', step: '', error: 'Interrupted. Delete it and try again.' });
      else await mutate(set.id, (x) => { if (x.notesStatus === 'processing') x.notesStatus = 'error'; });
    }
    return s;
  });
}
