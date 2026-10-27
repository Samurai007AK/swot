import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { createSet, getSet, mutate, listSets } from './store.js';
import { fromPdfPath, fromText, fromTopic, fromUrl } from './extract.js';
import { buildCourse, cleanCards, cleanPages, cleanQuestions } from './prompts.js';
import { startServer, PORT } from './server.js';

const link = (id) => `http://127.0.0.1:${PORT}/#/set/${id}`;
const reply = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 1) }] });

const question = z.object({
  type: z.enum(['mcq', 'fill']),
  question: z.string().optional().describe('mcq: the question'),
  sentence: z.string().optional().describe('fill: a sentence containing ____'),
  choices: z.array(z.string()).describe('2-5 options; one must equal answer exactly'),
  answer: z.string(),
  explanation: z.string().optional(),
});
const page = z.union([z.object({ type: z.literal('text'), heading: z.string().optional(), body: z.string() }), question]);

export async function startMcp() {
  // The agent's own model does the writing; this server only extracts, stores and shows.
  // It also hosts the web UI when the port is free, so saved courses open in the browser.
  await startServer().catch(() => {});
  const mcp = new McpServer({ name: 'swot', version: '0.2.0' });

  mcp.registerTool('extract_source', {
    description: 'Get the text to learn from: a local PDF or .txt/.md path, a web or YouTube URL (article text or transcript), pasted text, or a bare topic to teach from general knowledge. Returns {title, text, source}; pass them to save_course.',
    inputSchema: { path: z.string().optional(), url: z.string().optional(), text: z.string().optional(), topic: z.string().optional() },
  }, async ({ path, url, text, topic }) => {
    const { title, text: body, source } = path ? (/\.pdf$/i.test(path) ? await fromPdfPath(path) : fromText(await readFile(path, 'utf8'), path.split(/[\\/]/).pop()))
      : url ? await fromUrl(url) : topic ? fromTopic(topic) : fromText(text);
    return reply({ title, text: body, source });
  });

  mcp.registerTool('save_course', {
    description: 'Save a course you wrote from a source: notes plus a chapter outline. Chapters you leave without pages are written later by the web app when the learner opens them. Returns a link to learn it in the Swot app.',
    inputSchema: {
      title: z.string(),
      icon: z.string().optional().describe('one emoji'),
      source: z.object({ kind: z.enum(['pdf', 'youtube', 'web', 'audio', 'image', 'text', 'topic']), name: z.string(), url: z.string().optional() }),
      text: z.string().describe('the extracted source text, unchanged'),
      notes: z.string().describe('markdown: "# <emoji> title", overview, ---, "## section <emoji>" blocks with "- **term**: explanation" bullets, "## Key takeaways"'),
      hook: z.string().describe('two curious sentences that open the course'),
      cover: z.array(z.string()).describe('4-6 short phrases: what the course covers'),
      warmup: z.array(question).describe('3 easy questions'),
      chapters: z.array(z.object({ title: z.string(), summary: z.string(), pages: z.array(page).optional().describe('6-9 pages alternating text and questions') })),
      flashcards: z.array(z.object({ front: z.string(), back: z.string() })).optional(),
    },
  }, async (a) => {
    const course = buildCourse(a);
    let k = 0;
    for (const ch of course.chapters) {
      if (ch.kind !== 'chapter') continue;
      const pages = cleanPages(a.chapters[k++]?.pages);
      ch.pages = pages.length ? pages : null;
    }
    const set = await createSet({ title: a.title, source: a.source, text: a.text, notes: a.notes, ...course,
      icon: course.icon, flashcards: cleanCards(a.flashcards), model: 'agent' });
    return reply({ id: set.id, url: link(set.id), chapters: course.chapters.length });
  });

  mcp.registerTool('add_quiz_topic', {
    description: 'Add a quiz topic with questions to an existing course (shown in its Quiz tab).',
    inputSchema: { id: z.string(), title: z.string(), description: z.string().optional(), questions: z.array(question) },
  }, async ({ id, title, description = '', questions }) => {
    const next = await mutate(id, (s) => { s.quizTopics.push({ title, description, questions: cleanQuestions(questions), best: null }); });
    return reply({ id, topics: next.quizTopics.length, url: link(id) });
  });

  mcp.registerTool('list_courses', { description: 'List saved courses with progress.', inputSchema: {} },
    async () => reply((await listSets()).map((s) => ({ ...s, url: link(s.id) }))));

  mcp.registerTool('get_course', {
    description: 'Read one course: notes, chapters with pages, progress, flashcards, quiz topics and source text.',
    inputSchema: { id: z.string() },
  }, async ({ id }) => reply(await getSet(id)));

  await mcp.connect(new StdioServerTransport());
}
