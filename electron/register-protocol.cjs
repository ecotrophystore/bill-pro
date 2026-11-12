/**
 * EcoBill URI Protocol Registration
 * Registers `ecobill://` as a custom Windows URI scheme so clicking
 * "ecobill://open" in Chrome launches electron.exe directly — no terminal needed.
 *
 * Run ONCE from your own Windows terminal:
 *   node electron/register-protocol.cjs
 *
 * This writes a single registry key under HKCU (no admin required).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const electronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');

if (!fs.existsSync(electronExe)) {
  console.error('[EcoBill] electron.exe not found at:', electronExe);
  console.error('[EcoBill] Run `npm install` first.');
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.log('[EcoBill] Protocol registration is Windows-only. On macOS/Linux, Electron handles this automatically via app.setAsDefaultProtocolClient.');
  process.exit(0);
}

// Registry path: HKCU\Software\Classes\ecobill
// No admin rights needed — HKCU is always writable by the current user.
const regRoot = 'HKCU\\Software\\Classes\\ecobill';
const electronPath = electronExe.replace(/\//g, '\\');
const rootPath = rootDir.replace(/\//g, '\\');

// Command: "C:\path\electron.exe" "C:\path\bill-pro" "%1"
//   %1 = the full ecobill://... URL passed by Windows
const command = `"${electronPath}" "${rootPath}" "%1"`;

try {
  // Create the main key with URL Protocol marker
  execSync(`reg add "${regRoot}" /v "" /t REG_SZ /d "URL:ecobill Protocol" /f`, { stdio: 'pipe' });
  execSync(`reg add "${regRoot}" /v "URL Protocol" /t REG_SZ /d "" /f`, { stdio: 'pipe' });

  // DefaultIcon
  execSync(`reg add "${regRoot}\\DefaultIcon" /v "" /t REG_SZ /d "${electronPath},0" /f`, { stdio: 'pipe' });

  // shell\open\command
  execSync(`reg add "${regRoot}\\shell\\open\\command" /v "" /t REG_SZ /d "${command}" /f`, { stdio: 'pipe' });

  console.log('\n✅ EcoBill protocol registered successfully!');
  console.log('   Protocol:  ecobill://');
  console.log('   Launches:  ' + electronPath);
  console.log('   Project:   ' + rootPath);
  console.log('\nNow clicking "Open Desktop" in Chrome will launch EcoBill instantly!');
  console.log('(No terminal needed after this one-time setup)\n');
} catch (err) {
  console.error('[EcoBill] Registry write failed:', err.message);
  console.error('Try running this script as Administrator if the error persists.');
  process.exit(1);
}

