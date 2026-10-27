import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dir = () => join(process.env.SWOT_HOME || join(homedir(), '.swot'), 'sets');
const path = (id, ext = 'json') => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error('Not found'), { status: 404 });
  return join(dir(), `${id}.${ext}`);
};

// file: the original upload ({ bytes, type }) kept for the Source tab: a PDF, a recording or an image.
export async function createSet(fields, file) {
  const now = new Date().toISOString();
  const set = { id: randomUUID(), createdAt: now, openedAt: now, status: 'ready', step: '', icon: '📘',
    intro: { hook: '', cover: [] }, notes: '', notesStatus: 'ready', chapters: [], progress: {}, xp: 0, profile: {},
    flashcards: [], quizTopics: [], podcast: null, chat: [], ...fields, file: file ? { type: file.type } : null };
  await mkdir(dir(), { recursive: true });
  if (file) await writeFile(path(set.id, 'file'), file.bytes);
  await writeFile(path(set.id), JSON.stringify(set, null, 1));
  return set;
}

export async function getSet(id) {
  return JSON.parse(await readFile(path(id), 'utf8'));
}

export async function getFile(id) {
  const set = await getSet(id);
  if (set.file) return { bytes: await readFile(path(id, 'file')), type: set.file.type };
  return { bytes: await readFile(path(id, 'pdf')), type: 'application/pdf' }; // sets saved before files were generalised
}

// Every write goes through one queue per set, so background generation, progress saves and edits never
// overwrite each other. fn gets the fresh set, mutates it (or returns a replacement), and it is saved.
const queues = new Map();
export function mutate(id, fn) {
  const run = (queues.get(id) || Promise.resolve()).then(async () => {
    const set = await getSet(id);
    const next = (await fn(set)) || set;
    await writeFile(path(id), JSON.stringify(next, null, 1));
    return next;
  });
  queues.set(id, run.catch(() => {}));
  return run;
}

export const updateSet = (id, patch) => mutate(id, (s) => Object.assign(s, patch));

export async function deleteSet(id) {
  await rm(path(id), { force: true });
  await rm(path(id, 'file'), { force: true });
  await rm(path(id, 'pdf'), { force: true });
}

export async function listSets() {
  await mkdir(dir(), { recursive: true });
  const sets = [];
  for (const f of await readdir(dir())) {
    if (!f.endsWith('.json')) continue;
    try {
      const { id, title, icon, createdAt, openedAt, status, step, error, source, chapters = [], progress = {} } =
        JSON.parse(await readFile(join(dir(), f), 'utf8'));
      const done = chapters.filter((c, i) => c.pages && (progress[i] || 0) >= c.pages.length).length;
      const current = chapters.findIndex((c, i) => !(c.pages && (progress[i] || 0) >= c.pages.length));
      sets.push({ id, title, icon, createdAt, openedAt: openedAt || createdAt, status, step, error, source,
        chapters: chapters.length, done, current, currentTitle: chapters[current]?.title || '' });
    } catch { /* skip a file mid-write or hand-edited */ }
  }
  return sets.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}
