import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';

const SOURCE_DIRECTORY = 'src';
const POLL_INTERVAL_MS = 500;

let sourceSnapshot = '';
let serverProcess;
let isChecking = false;
let isShuttingDown = false;

async function getJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return getJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  }));

  return nestedFiles.flat();
}

async function getSourceSnapshot() {
  const files = await getJavaScriptFiles(SOURCE_DIRECTORY);
  const fileStates = await Promise.all(files.map(async (file) => {
    const fileInfo = await stat(file);
    return `${file}:${fileInfo.mtimeMs}:${fileInfo.size}`;
  }));

  return fileStates.sort().join('\n');
}

function startServer() {
  serverProcess = spawn(process.execPath, ['src/server.js'], { stdio: 'inherit' });
}

async function restartServer() {
  serverProcess.kill('SIGTERM');
  await once(serverProcess, 'exit');
  startServer();
}

async function checkForChanges() {
  const nextSnapshot = await getSourceSnapshot();
  if (nextSnapshot === sourceSnapshot) return;

  sourceSnapshot = nextSnapshot;
  console.log('[dev] source changed; restarting API');
  await restartServer();
}

sourceSnapshot = await getSourceSnapshot();
startServer();

const watcher = setInterval(() => {
  if (isChecking || isShuttingDown) return;
  isChecking = true;
  checkForChanges().catch((error) => {
    console.error('[dev] could not check source files:', error.message);
  }).finally(() => {
    isChecking = false;
  });
}, POLL_INTERVAL_MS);

process.on('SIGTERM', async () => {
  isShuttingDown = true;
  clearInterval(watcher);
  if (serverProcess?.exitCode === null) {
    serverProcess.kill('SIGTERM');
    await once(serverProcess, 'exit');
  }
  process.exit(0);
});
