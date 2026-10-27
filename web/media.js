// OCR and speech-to-text, run in the browser with free, open-source models.
// Nothing here loads until someone uploads a scanned PDF, an image or audio, or presses Record.
//   OCR:    Tesseract (Apache-2.0) via tesseract.js, pages rendered with pdf.js (Apache-2.0)
//   Speech: OpenAI Whisper base (MIT) via transformers.js (Apache-2.0), on WebAssembly
// The models download once from public CDNs and the browser caches them.

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
const OCR_LANGS = 'eng+hin'; // English and Hindi (Devanagari) together, so mixed pages work; Hinglish in Latin letters reads as English
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';
const WHISPER = 'onnx-community/whisper-base';
const SAMPLE_RATE = 16000;
const SLICE_S = 120; // transcribe in 2-minute slices so long lectures report progress

let ocrWorker;
async function ocr(onProgress) {
  if (!ocrWorker) {
    onProgress?.('Loading the text reader (first time only)', 0);
    const { default: Tesseract } = await import(TESSERACT);
    ocrWorker = await Tesseract.createWorker(OCR_LANGS);
  }
  return ocrWorker;
}

// Recognise text on the given 1-based pages of a PDF file. Returns { [page]: text }.
export async function ocrPdfPages(file, pages, onProgress) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const worker = await ocr(onProgress);
  const out = {};
  for (const [k, n] of pages.entries()) {
    onProgress?.(`Reading scanned page ${k + 1} of ${pages.length}`, k / pages.length);
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    out[n] = (await worker.recognize(canvas)).data.text.trim();
    page.cleanup();
  }
  onProgress?.('Done reading', 1);
  return out;
}

export async function ocrImage(file, onProgress) {
  const worker = await ocr(onProgress);
  onProgress?.('Reading the image', 0.3);
  const text = (await worker.recognize(file)).data.text.trim();
  onProgress?.('Done reading', 1);
  return text;
}

async function decode(blob) {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (audio.numberOfChannels === 1) return audio.getChannelData(0);
    const mono = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) audio.getChannelData(c).forEach((v, i) => { mono[i] += v / audio.numberOfChannels; });
    return mono;
  } catch {
    throw new Error('Your browser could not decode that audio file. Try MP3, M4A, WAV, OGG or WebM.');
  } finally { ctx.close(); }
}

let asr;
async function whisper(onProgress) {
  if (asr) return asr;
  const { pipeline } = await import(TRANSFORMERS);
  const files = {};
  const progress_callback = (p) => {
    if (p.status !== 'progress' || !p.total) return;
    files[p.file] = [p.loaded, p.total];
    const [got, all] = Object.values(files).reduce(([a, b], [l, t]) => [a + l, b + t], [0, 0]);
    onProgress?.(`Downloading the speech model, ${Math.round(all / 1e6)} MB (first time only)`, got / all);
  };
  // WebAssembly with 8-bit weights: an 80 MB download that runs about 3x faster than real time on a laptop CPU.
  // (WebGPU measured no faster and needs a 209 MB download.)
  asr = await pipeline('automatic-speech-recognition', WHISPER, { device: 'wasm', dtype: 'q8', progress_callback });
  return asr;
}

const stamp = (s) => `[${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}]`;

// Speech to timestamped text, like a YouTube transcript.
export async function transcribe(blob, onProgress) {
  onProgress?.('Decoding the audio', 0);
  const audio = await decode(blob);
  const model = await whisper(onProgress);
  const total = audio.length / SAMPLE_RATE;
  const lines = [];
  for (let start = 0; start < audio.length; start += SLICE_S * SAMPLE_RATE) {
    const at = start / SAMPLE_RATE;
    onProgress?.(`Transcribing ${stamp(at).slice(1, -1)} of ${stamp(total).slice(1, -1)}`, at / total);
    const slice = audio.subarray(start, Math.min(audio.length, start + SLICE_S * SAMPLE_RATE));
    if (slice.length < SAMPLE_RATE / 2) break;
    const out = await model(slice, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
    for (const c of out.chunks || [{ timestamp: [0], text: out.text }]) {
      const t = c.text.trim();
      if (t && !/^\[.*\]$|^\(.*\)$/.test(t)) lines.push(`${stamp(at + (c.timestamp?.[0] || 0))} ${t}`);
    }
  }
  onProgress?.('Done transcribing', 1);
  return lines.join('\n');
}

export function startRecording() {
  return navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : {});
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(1000);
    const started = Date.now();
    const end = () => stream.getTracks().forEach((t) => t.stop());
    return {
      seconds: () => (Date.now() - started) / 1000,
      stop: () => new Promise((resolve) => {
        rec.onstop = () => { end(); resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); };
        rec.stop();
      }),
      cancel: () => { rec.onstop = null; if (rec.state !== 'inactive') rec.stop(); end(); },
    };
  }).catch((e) => {
    throw new Error(e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in the browser and try again.' : `Could not start recording: ${e.message}`);
  });
}
