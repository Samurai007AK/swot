// node test.mjs — offline checks for the parts with real logic. No model calls.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SWOT_HOME = await mkdtemp(join(tmpdir(), 'swot-test-'));
const { youtubeId, parseTimedText, fromText, fromTopic } = await import('./lib/extract.js');
const { parseJson } = await import('./lib/llm.js');
const { cleanPages, cleanCards, buildCourse, chapterPrompt } = await import('./lib/prompts.js');
const { createSet, listSets, getSet, mutate } = await import('./lib/store.js');
const { startServer } = await import('./lib/server.js');

for (const u of ['https://www.youtube.com/watch?v=aircAruvnKk&t=3', 'https://youtu.be/aircAruvnKk', 'https://youtube.com/shorts/aircAruvnKk', 'aircAruvnKk'])
  assert.equal(youtubeId(u), 'aircAruvnKk');
assert.throws(() => youtubeId('https://example.com'));
assert.equal(parseTimedText('<p t="65000" d="1"><s>Hello</s> &amp; <s>world</s></p><p t="1" d="1"> </p>'), '[1:05] Hello & world');
assert.equal(fromTopic('black holes').source.kind, 'topic');
assert.throws(() => fromTopic('  '));

assert.deepEqual(parseJson('Sure!\n```json\n{"a":[1,{"b":"}"}]}\n```'), { a: [1, { b: '}' }] });
assert.throws(() => parseJson('no json here'));

const pages = cleanPages([
  { type: 'text', heading: 'H', body: 'Body' },
  { type: 'mcq', question: 'Q1', choices: ['x', 'y'], answer: 'y' },
  { type: 'mcq', question: 'answer not a choice', choices: ['x', 'y'], answer: 'z' },
  { type: 'fill', sentence: 'The ____ act', choices: ['Stamp', 'Tea'], answer: 'Stamp' },
  { type: 'fill', sentence: 'no blank', choices: ['a', 'b'], answer: 'a' },
  { type: 'text', body: '' },
]);
assert.deepEqual(pages.map((p) => p.type), ['text', 'mcq', 'fill']);
assert.equal(cleanCards([{ front: 'a', back: 'b' }, { front: 'a' }]).length, 1);

// 9 chapters: intro, 4 chapters, checkpoint, 4 chapters... then the final quiz
const course = buildCourse({ title: 'T', hook: 'Why?', cover: ['a', 'b'], warmup: [{ type: 'mcq', question: 'q', choices: ['a', 'b'], answer: 'a' }],
  chapters: Array.from({ length: 9 }, (_, i) => ({ title: `C${i + 1}`, summary: 's' })) });
assert.deepEqual(course.chapters.map((c) => c.kind), ['intro', 'chapter', 'chapter', 'chapter', 'chapter', 'checkpoint', 'chapter', 'chapter', 'chapter', 'chapter', 'checkpoint', 'chapter', 'final']);
assert.deepEqual(course.chapters[0].pages.map((p) => p.type), ['text', 'text', 'profile', 'profile', 'text', 'mcq']);
assert.match(chapterPrompt({ ...course, text: 'x', source: { kind: 'text' }, profile: { goal: 'Exam prep' } }, 10), /C5; C6; C7; C8/);

// long sources: parts cover the whole text without gaps, cut near line breaks, and chapters keep their parts
const { splitParts, LONG } = await import('./lib/prompts.js');
const longText = Array.from({ length: 6000 }, (_, i) => `Line ${i} of a long book about cells and energy.`).join('\n');
const parts = splitParts(longText);
assert.ok(longText.length > LONG && parts.length >= 4);
assert.equal(parts[0].start, 0); assert.equal(parts.at(-1).end, longText.length);
parts.slice(1).forEach((p, i) => assert.equal(p.start, parts[i].end));
assert.ok(parts.slice(0, -1).every((p) => longText[p.end] === '\n'));
const withParts = buildCourse({ chapters: [{ title: 'A', parts: [1, 2] }, { title: 'B', parts: [99] }] }, 3);
assert.deepEqual(withParts.chapters[1].parts, [0, 1]);
assert.equal(withParts.chapters[2].parts, undefined, 'out-of-range parts are dropped');

// article extraction keeps headings and list items, drops navigation
const { htmlToText } = await import('./lib/extract.js');
const art = await htmlToText(`<html><head><title>Cells</title></head><body><nav>Home | About | Login</nav><article><h1>Cells</h1>
  <p>${'The cell is the basic unit of life. '.repeat(12)}</p><h2>Parts</h2><ul><li>Nucleus holds DNA</li><li>Mitochondria make ATP</li></ul>
  <p>${'Cells divide by mitosis and meiosis. '.repeat(10)}</p></article><footer>Copyright</footer></body></html>`);
assert.match(art.text, /### Parts/); assert.match(art.text, /- Mitochondria make ATP/); assert.doesNotMatch(art.text, /Login/);

const set = await createSet(fromText('Mitochondria make ATP.', 'Bio'));
assert.equal((await getSet(set.id)).text, 'Mitochondria make ATP.');
// concurrent writes through the queue must all land
await Promise.all([1, 2, 3, 4, 5].map((n) => mutate(set.id, (s) => { s.progress[n] = n; })));
assert.deepEqual((await getSet(set.id)).progress, { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 });
assert.equal((await listSets())[0].title, 'Bio');
await assert.rejects(getSet('../../etc/passwd'));

const server = await startServer(4399);
const base = 'http://127.0.0.1:4399';
assert.equal((await fetch(`${base}/api/sets`)).status, 200);
assert.equal((await fetch(`${base}/`)).headers.get('content-type'), 'text/html; charset=utf-8');
assert.equal((await fetch(`${base}/api/sets`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status, 403);
assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 404);
const bad = await fetch(`${base}/api/sets`, { method: 'POST', body: JSON.stringify({ kind: 'text', text: '  ' }) });
assert.equal(bad.status, 400);
const patched = await (await fetch(`${base}/api/sets/${set.id}`, { method: 'PATCH', body: JSON.stringify({ xp: 30, status: 'hacked' }) })).json();
assert.equal(patched.xp, 30);
assert.equal(patched.status, 'ready', 'PATCH only accepts client-owned fields');
server.close();

console.log('ok');
