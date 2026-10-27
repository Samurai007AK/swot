import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const win = process.platform === 'win32';

// Runs a CLI with the prompt on stdin. On Windows the CLIs are .cmd shims, which need a shell,
// so every argument is quoted and the only user-supplied one (the model) is validated first.
function run(cmd, args, input, cwd) {
  return new Promise((resolve, reject) => {
    const argv = win ? args.map((a) => `"${a}"`) : args;
    const child = spawn(cmd, argv, { cwd, shell: win, windowsHide: true });
    let out = '', err = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); // decodes multi-byte characters split across chunks
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? `${cmd} is not installed or not on PATH.` : e.message)));
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${(err || out).trim().slice(-400)}`))));
    child.stdin.end(input);
  });
}

export async function ask({ provider = 'claude', model = '', prompt }) {
  if (model && !/^[\w.:\-[\]/]+$/.test(model)) throw new Error('Model names may only contain letters, digits and . : - _ [ ] /');
  const cwd = await mkdtemp(join(tmpdir(), 'swot-'));
  try {
    if (provider === 'codex') {
      const outFile = join(cwd, 'last.txt');
      await run('codex', ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-o', outFile,
        ...(model ? ['-m', model] : []), '-'], prompt, cwd);
      return (await readFile(outFile, 'utf8')).trim();
    }
    // No tools, no MCP, no user hooks/plugins: a plain completion billed to the user's own login.
    const raw = await run('claude', ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence',
      '--strict-mcp-config', '--setting-sources', 'project', ...(model ? ['--model', model] : [])], prompt, cwd);
    const res = JSON.parse(raw);
    if (res.is_error) throw new Error(`claude: ${res.result || res.subtype}`);
    return String(res.result).trim();
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export function parseJson(text) {
  const body = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The model did not return JSON.');
  return JSON.parse(body.slice(start, end + 1));
}

