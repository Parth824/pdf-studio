import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, openSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const runtime = path.join(root, '.runtime');
const executable = path.join(runtime, 'tools', 'cloudflared.exe');
const stateFile = path.join(runtime, 'tunnel.json');
const local = 'http://127.0.0.1:3000';
if (!existsSync(executable)) throw new Error('Run scripts/setup-tunnel.py first.');
try {
  const response = await fetch(local, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error();
} catch {
  throw new Error('Start PDF Studio with start-local.cmd before sharing it.');
}
if (existsSync(stateFile)) {
  try {
    const previous = JSON.parse(readFileSync(stateFile, 'utf8'));
    process.kill(previous.pid, 0);
    if (previous.url && (await fetch(previous.url, { signal: AbortSignal.timeout(15000) })).ok) {
      console.log(`PDF Studio is live at ${previous.url}`);
      process.exit(0);
    }
    throw new Error('The existing tunnel is still running but not reachable. Use stop-public.cmd before starting another.');
  } catch (error) {
    if (error.code !== 'ESRCH' && !(error instanceof SyntaxError)) throw error;
  }
}
const logFile = path.join(runtime, `tunnel-${Date.now()}.log`);
const log = openSync(logFile, 'a');
const child = spawn(executable, ['--no-autoupdate', 'tunnel', '--url', local, '--protocol', 'http2'], {
  cwd: root, windowsHide: true, detached: true, stdio: ['ignore', log, log],
});
child.unref();
const state = { pid: child.pid, url: null, logFile, started: new Date().toISOString() };
writeFileSync(stateFile, JSON.stringify(state, null, 2));
for (let attempt = 0; attempt < 90; attempt++) {
  process.kill(child.pid, 0);
  const match = readFileSync(logFile, 'utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match) {
    state.url = match[0];
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
    try {
      const response = await fetch(state.url, { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        console.log(`PDF Studio is live at ${state.url}`);
        console.log('Temporary public URL. Keep this computer awake and the app running. Use stop-public.cmd to stop sharing.');
        process.exit(0);
      }
    } catch { /* DNS and the tunnel connection may still be starting. */ }
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
throw new Error(`Tunnel is not ready. Check ${logFile}.`);
