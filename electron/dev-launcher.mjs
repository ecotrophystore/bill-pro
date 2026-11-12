import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const isProd = process.argv.includes('--prod');
const DEV_URL = 'http://localhost:5173';
const isWindows = process.platform === 'win32';

function checkServerReady(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(700, () => {
      req.destroy();
      resolve(false);
    });
  });
}

let viteReady = false;
if (!isProd) {
  viteReady = await checkServerReady(DEV_URL);
}

const cleanEnv = { ...process.env };
// Ensure IDE parent ELECTRON_RUN_AS_NODE=1 does not force Electron into plain Node.js mode
delete cleanEnv.ELECTRON_RUN_AS_NODE;
if (!isProd && viteReady) {
  cleanEnv.ELECTRON_START_URL = DEV_URL;
} else {
  delete cleanEnv.ELECTRON_START_URL;
}

const directElectronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const fallbackBin = path.join(rootDir, 'node_modules', '.bin', isWindows ? 'electron.cmd' : 'electron');
const launchTarget = isWindows && fs.existsSync(directElectronExe) ? directElectronExe : fallbackBin;

console.log('[Desktop] Opening EcoBill Desktop Browser...');
const electronProc = spawn(launchTarget, ['.'], {
  cwd: rootDir,
  env: cleanEnv,
  detached: true,
  stdio: 'ignore',
  windowsHide: false
});

electronProc.unref();
process.exit(0);
