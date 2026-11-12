const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const chromeMajor = (process.versions.chrome || '134.0.0.0').split('.')[0];
const CLEAN_CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;

const CONTROL_PORT = 45921;
const preparedPartitions = new Set();
let mainWindow = null;
let staticServer = null;
let controlServer = null;

function restoreAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function startWindowControlServer() {
  if (controlServer) return;
  controlServer = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && reqPath === '/status') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          running: true,
          minimized: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()),
          visible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible())
        })
      );
      return;
    }
    if (req.method === 'POST' && reqPath === '/open') {
      restoreAndFocusMainWindow();
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'POST' && reqPath === '/minimize') {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'POST' && reqPath === '/close') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => app.quit(), 50);
      return;
    }
    if (req.method === 'POST' && reqPath === '/send-whatsapp') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) req.destroy();
      });
      req.on('end', async () => {
        try {
          if (!mainWindow || mainWindow.isDestroyed()) {
            res.writeHead(200);
            res.end(JSON.stringify({ ok: false, error: 'EcoBill Desktop window is not open' }));
            return;
          }
          const payload = JSON.parse(body || '{}');
          const script = `(async () => {
            if (typeof window.__ecobillRemoteSendWhatsapp !== 'function') {
              return { ok: false, error: 'WhatsApp Web browser view is not ready in EcoBill Desktop' };
            }
            return await window.__ecobillRemoteSendWhatsapp(${JSON.stringify(payload)});
          })()`;
          const result = await mainWindow.webContents.executeJavaScript(script, true);
          res.writeHead(200);
          res.end(JSON.stringify(result || { ok: false, error: 'No response from Desktop WhatsApp tab' }));
        } catch (err) {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: false, error: err?.message || 'Desktop send bridge error' }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  controlServer.on('error', () => {
    // Port already bound by another instance
  });
  controlServer.listen(CONTROL_PORT, '127.0.0.1');
}

function isValidPartition(partition) {
  return typeof partition === 'string' && /^persist:(wa|chrome)_[a-zA-Z0-9_-]{1,64}$/.test(partition);
}

function isAllowedWebUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'));
}

function configureBrowserPartition(partition) {
  if (!isValidPartition(partition) || preparedPartitions.has(partition)) return;
  preparedPartitions.add(partition);

  const ses = session.fromPartition(partition);
  ses.setUserAgent(CLEAN_CHROME_UA);

  // Strip Electron identifiers from UA and Client Hints so WhatsApp Web & Google services treat tabs as standard Chrome
  ses.webRequest.onBeforeSendHeaders(
    { urls: ['https://*/*', 'http://*/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      headers['User-Agent'] = CLEAN_CHROME_UA;
      if (headers['sec-ch-ua']) {
        headers['sec-ch-ua'] = headers['sec-ch-ua'].replace(/Electron/gi, 'Google Chrome');
      }
      if (headers['Sec-CH-UA']) {
        headers['Sec-CH-UA'] = headers['Sec-CH-UA'].replace(/Electron/gi, 'Google Chrome');
      }
      callback({ requestHeaders: headers });
    }
  );

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (!requestingOrigin.startsWith('https://')) return false;
    return ['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(
      permission
    );
  });

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL() || '';
    if (!url.startsWith('https://')) {
      return callback(false);
    }
    const allowed = ['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(
      permission
    );
    callback(allowed);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function startProductionServer() {
  const distDir = path.join(__dirname, '..', 'dist');
  const indexHtml = path.join(distDir, 'index.html');

  return new Promise((resolve, reject) => {
    staticServer = http.createServer((req, res) => {
      const reqUrl = (req.url || '/').split('?')[0];

      // Proxy backend API requests to local service if active on port 5001
      if (reqUrl.startsWith('/api/')) {
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: 5001,
            path: req.url,
            method: req.method,
            headers: req.headers
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );
        proxyReq.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Local backend service offline on port 5001' }));
          }
        });
        req.pipe(proxyReq);
        return;
      }

      const safeRelPath = path.normalize(reqUrl).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(distDir, safeRelPath === '\\' || safeRelPath === '/' ? 'index.html' : safeRelPath);

      if (!filePath.startsWith(distDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = indexHtml;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });

    staticServer.on('error', reject);
    staticServer.listen(0, '127.0.0.1', () => {
      const addr = staticServer.address();
      resolve(`http://localhost:${addr.port}`);
    });
  });
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'EcoBill — Internal Chrome & CRM',
    backgroundColor: '#F3E9DD',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron] Failed to load URL:', validatedURL, errorCode, errorDescription);
  });

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    const src = params.src || '';
    if (src && !isAllowedWebUrl(src)) {
      event.preventDefault();
      return;
    }
    if (isValidPartition(params.partition)) {
      configureBrowserPartition(params.partition);
    }

    delete webPreferences.preloadURL;
    webPreferences.preload = path.join(__dirname, 'whatsappPreload.cjs');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedWebUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const explicitUrl = process.env.ELECTRON_START_URL;
  let targetUrl = explicitUrl;

  if (!targetUrl) {
    const devAlive = await new Promise((resolve) => {
      const req = http.get('http://localhost:5173', (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(false);
      });
    });
    targetUrl = devAlive ? 'http://localhost:5173' : await startProductionServer();
  }

  console.log('[Electron] Loading EcoBill URL:', targetUrl);
  await mainWindow.loadURL(targetUrl);
  if (!mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  }
  console.log('[Electron] Window shown successfully!');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  contents.setUserAgent(CLEAN_CHROME_UA);

  contents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith('blob:') ||
      url.startsWith('about:blank') ||
      url.startsWith('https://accounts.google.com')
    ) {
      return { action: 'allow' };
    }
    if (isAllowedWebUrl(url)) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser:new-tab', { url });
      } else {
        shell.openExternal(url);
      }
    }
    return { action: 'deny' };
  });
});

const MEDIA_MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.3gp': 'video/3gpp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

function inferAttachmentMeta(filePath, fallbackMime) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  const mimeType = MEDIA_MIME_BY_EXT[ext] || fallbackMime || 'application/octet-stream';
  let attachmentType = 'document';
  if (mimeType.startsWith('image/')) attachmentType = 'image';
  else if (mimeType.startsWith('video/')) attachmentType = 'video';
  return { mimeType, attachmentType };
}

ipcMain.handle('wa:pick-media-file', async (_event, filterKind = 'all') => {
  const filters =
    filterKind === 'video'
      ? [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'avi', '3gp', 'mkv'] }, { name: 'All Files', extensions: ['*'] }]
      : filterKind === 'document'
        ? [{ name: 'Documents & Images', extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'webp'] }, { name: 'All Files', extensions: ['*'] }]
        : [
            { name: 'Documents, Images & Videos', extensions: ['pdf', 'mp4', 'mov', 'webm', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'] },
            { name: 'All Files', extensions: ['*'] }
          ];

  const res = await dialog.showOpenDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
    title: 'Select NFF, Brochure, Testimonial Video or Custom File',
    properties: ['openFile'],
    filters
  });

  if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = res.filePaths[0];
  const stat = await fs.promises.stat(filePath).catch(() => null);
  const fileName = path.basename(filePath);
  const { mimeType, attachmentType } = inferAttachmentMeta(filePath);
  return {
    canceled: false,
    filePath,
    fileName,
    mimeType,
    attachmentType,
    size: stat ? stat.size : 0
  };
});

ipcMain.handle('wa:read-media-bytes', async (_event, payload = {}) => {
  const { filePath, fileUrl, fileName, mimeType } = payload || {};
  const maxBytes = 64 * 1024 * 1024; // 64 MB

  try {
    if (filePath && typeof filePath === 'string') {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        return { ok: false, error: 'Selected path is not a file' };
      }
      if (stat.size > maxBytes) {
        return { ok: false, error: 'File exceeds WhatsApp 64 MB attachment limit' };
      }
      const buf = await fs.promises.readFile(filePath);
      const inferred = inferAttachmentMeta(filePath, mimeType);
      return {
        ok: true,
        bytes: new Uint8Array(buf),
        fileName: fileName || path.basename(filePath),
        mimeType: inferred.mimeType,
        attachmentType: inferred.attachmentType
      };
    }

    if (fileUrl && typeof fileUrl === 'string' && isAllowedWebUrl(fileUrl)) {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        return { ok: false, error: `Could not download media (${response.status})` };
      }
      const arrBuf = await response.arrayBuffer();
      if (arrBuf.byteLength > maxBytes) {
        return { ok: false, error: 'Remote media exceeds WhatsApp 64 MB limit' };
      }
      const respMime = response.headers.get('content-type')?.split(';')[0]?.trim();
      const urlName = (() => {
        try {
          return path.basename(new URL(fileUrl).pathname) || 'attachment';
        } catch {
          return 'attachment';
        }
      })();
      const resolvedName = fileName || urlName;
      const inferred = inferAttachmentMeta(resolvedName, mimeType || respMime);
      return {
        ok: true,
        bytes: new Uint8Array(arrBuf),
        fileName: resolvedName,
        mimeType: inferred.mimeType,
        attachmentType: inferred.attachmentType
      };
    }

    return { ok: false, error: 'No local file path or valid media URL provided' };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to read attachment' };
  }
});

ipcMain.handle('wa:prepare-partition', (_event, partition) => {
  configureBrowserPartition(partition);
  return { ok: true };
});

ipcMain.handle('wa:clear-partition', async (_event, partition) => {
  if (!isValidPartition(partition)) return { ok: false };
  const ses = session.fromPartition(partition);
  await ses.clearStorageData();
  return { ok: true };
});

ipcMain.handle('app:open-external', (_event, url) => {
  if (isAllowedWebUrl(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('app:minimize-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
  return { ok: true };
});

ipcMain.handle('app:toggle-maximize-window', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { maximized: false };
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return { maximized: false };
  }
  mainWindow.maximize();
  return { maximized: true };
});

ipcMain.handle('app:close-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
  return { ok: true };
});

// Register ecobill:// custom URI protocol with the project path in unpackaged mode
// so Electron never overwrites HKCU with a bare "%1" missing the app entry path
if (app.isPackaged) {
  app.setAsDefaultProtocolClient('ecobill');
} else {
  app.setAsDefaultProtocolClient('ecobill', process.execPath, [path.resolve(__dirname, '..')]);
}

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  // Another instance is already running — tell it to focus its window, then quit
  app.quit();
} else {
  // Handle ecobill:// URI from second-instance (Windows passes it via argv on second launch)
  app.on('second-instance', (_event, argv) => {
    const hasProtocolUrl = argv.some(a => a.startsWith('ecobill://'));
    restoreAndFocusMainWindow();
    if (hasProtocolUrl) {
      console.log('[Electron] Received ecobill:// protocol URI — window focused.');
    }
  });

  // Handle ecobill:// URI on macOS (open-url event)
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (url.startsWith('ecobill://')) {
      restoreAndFocusMainWindow();
    }
  });

  app.whenReady().then(() => {
    startWindowControlServer();
    // Check if launched via ecobill:// protocol (argv contains the URL)
    const protocolUrl = process.argv.find(a => a.startsWith('ecobill://'));
    if (protocolUrl) {
      console.log('[Electron] Launched via ecobill:// protocol:', protocolUrl);
    }
    return createMainWindow();
  });
}

app.on('window-all-closed', () => {
  if (controlServer) {
    controlServer.close();
    controlServer = null;
  }
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
