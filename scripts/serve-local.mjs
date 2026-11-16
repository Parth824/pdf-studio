import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const directory = path.resolve('.runtime');
mkdirSync(directory, { recursive: true });
const python = path.resolve('.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (existsSync(python)) {
  await new Promise((resolve, reject) => {
    const setup = spawn(python, ['engine/office_service.py', '--auto-start'], { windowsHide: true, stdio: 'inherit' });
    setup.on('error', reject);
    setup.on('exit', code => code === 0 ? resolve() : reject(new Error('The local Office service could not start.')));
  });
}
const port = process.env.PDF_STUDIO_PORT || '3000';
const output = openSync(path.join(directory, 'server.log'), 'a');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', port], {
  cwd: process.cwd(),
  windowsHide: true,
  detached: true,
  stdio: ['ignore', output, output],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
child.unref();
writeFileSync(path.join(directory, 'server.json'), JSON.stringify({ pid: child.pid, url: `http://127.0.0.1:${port}`, started: new Date().toISOString() }, null, 2));
const url = `http://127.0.0.1:${port}`;
console.log(`Starting PDF Studio (process ${child.pid}). Logs: .runtime/server.log`);
let ready = false;
for (let attempt = 0; attempt < 120; attempt++) {
  try {
    process.kill(child.pid, 0);
  } catch {
    throw new Error('PDF Studio stopped during startup. Check .runtime/server.log.');
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    // Next.js is still starting; try again before reporting readiness.
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!ready) throw new Error('PDF Studio did not become ready. Check .runtime/server.log.');
console.log(`PDF Studio is ready at ${url}`);
