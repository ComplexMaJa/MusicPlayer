import { app, BrowserWindow, dialog, session, shell } from 'electron';
import path from 'path';
import { initDatabase, flushDatabaseSave } from './database';
import { registerIpcHandlers } from './ipc';
import { registerAudioSchemes, registerAudioProtocols } from './audio';
import { isAllowedInternalUrl } from './security';

let mainWindow: BrowserWindow | null = null;

// Enable full hardware acceleration and GPU rasterization
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,VaapiVideoDecoder');

// Enforce the Chromium sandbox for every renderer, not just ones created with
// an explicit webPreferences flag.
app.enableSandbox();

function openExternalIfSafe(url: string): void {
  try {
    const protocol = new URL(url).protocol;
    if (protocol === 'http:' || protocol === 'https:') {
      void shell.openExternal(url).catch((err) => {
        console.warn('Failed to open external URL:', err);
      });
    }
  } catch {
    // Ignore malformed URLs.
  }
}

function guardNavigation(event: Electron.Event, url: string): void {
  if (isAllowedInternalUrl(url)) return;

  event.preventDefault();
  openExternalIfSafe(url);
}

async function createWindow() {
  await initDatabase();

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  registerAudioProtocols();

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    title: 'MaJa Player',
    backgroundColor: '#050505',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      navigateOnDragDrop: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  registerIpcHandlers(mainWindow);

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);

  // Subframes must never navigate outside the application either.
  mainWindow.webContents.on('will-frame-navigate', (details) => {
    if (details.isMainFrame || isAllowedInternalUrl(details.url)) return;
    details.preventDefault();
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalIfSafe(details.url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  // Register privileged schemes BEFORE app.whenReady()
  registerAudioSchemes();

  app.whenReady()
    .then(createWindow)
    .catch((err) => {
      console.error('Failed to start MaJa Player:', err);
      dialog.showErrorBox(
        'MaJa Player failed to start',
        err instanceof Error ? err.message : String(err)
      );
      app.quit();
    });

  app.on('before-quit', () => {
    flushDatabaseSave();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch((err) => {
        console.error('Failed to recreate MaJa Player window:', err);
      });
    }
  });
}
