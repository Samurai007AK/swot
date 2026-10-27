#!/usr/bin/env node
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('-')) || 'serve';

function openBrowser(url) {
  const [bin, ...rest] = process.platform === 'win32' ? ['cmd', '/c', 'start', '""', url]
    : process.platform === 'darwin' ? ['open', url] : ['xdg-open', url];
  spawn(bin, rest, { stdio: 'ignore', detached: true, windowsVerbatimArguments: true }).on('error', () => {}).unref();
}

if (cmd === 'mcp') {
  await (await import('../lib/mcp.js')).startMcp();
} else if (cmd === 'serve') {
  const { startServer, PORT } = await import('../lib/server.js');
  const url = `http://127.0.0.1:${PORT}`;
  try {
    await startServer();
    console.log(`Swot is running at ${url}  (Ctrl+C to stop)`);
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    console.log(`Port ${PORT} is busy, so Swot is probably already running. Opening ${url}`);
    console.log('If that is something else, start Swot on another port: SWOT_PORT=4320 npx swot-study');
  }
  if (!args.includes('--no-open')) openBrowser(url);
} else {
  console.log('usage: swot-study [serve|mcp] [--no-open]');
  process.exit(1);
}
