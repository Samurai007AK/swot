import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

// About 1,000 pages. Sources longer than LONG are split into parts and digested (see server.js), so this
// cap only guards memory and disk, not the model's context.
export const MAX_CHARS = 2_000_000;
const cap = (s) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n\n[truncated at ${MAX_CHARS.toLocaleString('en')} characters]` : s);
const bad = (message) => Object.assign(new Error(message), { status: 400 });

// A page with fewer than this many characters of text is treated as scanned and needs OCR.
const MIN_PAGE_TEXT = 12;

// ocr maps 1-based page numbers to text the browser recognised. Returns { missing } when pages still need OCR.
export async function fromPdf(bytes, name = 'document.pdf', ocr = {}) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  let pdf;
  try { pdf = await getDocumentProxy(new Uint8Array(bytes)); } catch { throw bad('That file is not a readable PDF.'); }
  const { text } = await extractText(pdf, { mergePages: false });
  const missing = [];
  const pages = text.map((t, i) => {
    const own = t.trim();
    const read = String(ocr[i + 1] || '').trim();
    if (own.replace(/\s/g, '').length >= MIN_PAGE_TEXT) return own;
    if (read) return read;
    missing.push(i + 1);
    return own;
  });
  const body = pages.map((t, i) => `--- page ${i + 1} ---\n${t}`).join('\n\n');
  return { title: name.replace(/\.pdf$/i, ''), text: cap(body), source: { kind: 'pdf', name, pages: pages.length }, missing };
}

export async function fromPdfPath(path) {
  const out = await fromPdf(await readFile(path), basename(path));
  if (out.missing.length === out.source.pages) throw bad('This PDF is scanned. Open it in the Swot app, which reads scanned pages with OCR.');
  return out;
}

export function fromText(text, title = 'Pasted notes', kind = 'text') {
  if (!text?.trim()) throw bad(kind === 'audio' ? 'No speech was found in the recording.' : kind === 'image' ? 'No text was found in the image.' : 'The text is empty.');
  return { title, text: cap(text.trim()), source: { kind, name: title } };
}

export function fromTopic(topic) {
  const t = String(topic || '').trim();
  if (!t) throw bad('Type what you want to learn first.');
  if (t.length > 2000) return fromText(t, 'My notes');
  return { title: t.length > 70 ? `${t.slice(0, 67)}...` : t, text: t, source: { kind: 'topic', name: t } };
}

export function youtubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/) ||
    String(url).match(/^([\w-]{11})$/);
  if (!m) throw bad('That does not look like a YouTube link.');
  return m[1];
}

export function parseTimedText(xml) {
  const decode = (s) => s.replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const lines = [];
  for (const m of xml.matchAll(/<p t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = decode(m[2]).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const s = Math.floor(+m[1] / 1000);
    lines.push(`[${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}] ${text}`);
  }
  return lines.join('\n');
}

export async function fromYoutube(url) {
  const id = youtubeId(url);
  // The ANDROID innertube client returns caption URLs that work without a PO token.
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ videoId: id, context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } } }),
  });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}.`);
  const player = await res.json();
  if (player.playabilityStatus?.status !== 'OK') throw bad(`Video unavailable: ${player.playabilityStatus?.reason || 'unknown reason'}.`);
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const pick = tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr') ||
    tracks.find((t) => t.languageCode?.startsWith('en')) || tracks[0];
  if (!pick) throw bad('This video has no captions. Download its audio and upload it to Swot to transcribe it instead.');
  const text = parseTimedText(await (await fetch(pick.baseUrl)).text());
  if (!text) throw bad('The caption track came back empty.');
  const title = player.videoDetails?.title || `YouTube ${id}`;
  return { title, text: cap(text), source: { kind: 'youtube', name: title, url: `https://www.youtube.com/watch?v=${id}` } };
}

// Readable text from an article's HTML: headings, paragraphs and list items, in order.
const BLOCKS = 'h1, h2, h3, h4, p, li, pre, blockquote, td';
export async function htmlToText(html, url = 'https://example.com/') {
  const { parseHTML } = await import('linkedom');
  const { Readability } = await import('@mozilla/readability');
  const { document } = parseHTML(html);
  const fallbackTitle = document.querySelector('title')?.textContent?.trim() || '';
  const article = new Readability(document, { charThreshold: 200 }).parse();
  const root = parseHTML(`<div id="r">${article?.content || ''}</div>`).document.getElementById('r');
  const lines = [];
  for (const el of root.querySelectorAll(BLOCKS)) {
    if (el.parentElement?.closest(BLOCKS)) continue; // its text is already in the outer block
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const tag = el.tagName.toLowerCase();
    lines.push(/^h\d$/.test(tag) ? `\n${'#'.repeat(+tag[1] + 1)} ${t}` : tag === 'li' ? `- ${t}` : t);
  }
  const text = lines.join('\n').trim() || (article?.textContent || '').trim();
  return { title: (article?.title || fallbackTitle || new URL(url).hostname).trim(), text };
}

export async function fromUrl(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { throw bad('That does not look like a link.'); }
  if (!/^https?:$/.test(url.protocol)) throw bad('Only http and https links work.');
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) return fromYoutube(url.href);
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Swot study app)', accept: 'text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5' } });
  } catch (e) { throw bad(`Could not open that page: ${e.name === 'TimeoutError' ? 'it took too long to answer' : e.message}.`); }
  if (!res.ok) throw bad(`That page answered ${res.status}${res.status === 403 ? ': it blocks apps like Swot. Paste its text instead' : ''}.`);
  const type = res.headers.get('content-type') || '';
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 40e6) throw bad('That page is over 40 MB.');
  if (type.includes('pdf') || bytes.subarray(0, 5).toString() === '%PDF-') {
    const name = decodeURIComponent(url.pathname.split('/').pop() || 'document.pdf');
    const out = await fromPdf(bytes, name);
    if (out.missing.length === out.source.pages) throw bad('That PDF is scanned. Download it and upload it to Swot, which reads scanned pages with OCR.');
    return { ...out, source: { ...out.source, url: url.href }, file: { bytes, type: 'application/pdf' } };
  }
  if (type.startsWith('text/plain')) return { ...fromText(bytes.toString('utf8'), url.hostname, 'web'), source: { kind: 'web', name: url.hostname, url: url.href } };
  const { title, text } = await htmlToText(bytes.toString('utf8'), url.href);
  if (text.length < 200) throw bad('Could not find readable text on that page. It may need a login or JavaScript; paste its text instead.');
  return { title, text: cap(text), source: { kind: 'web', name: title, url: url.href } };
}
