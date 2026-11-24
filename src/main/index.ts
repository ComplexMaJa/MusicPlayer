import { app, BrowserWindow, dialog, session, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { initDatabase, flushDatabaseSave } from './database';
import { bindMainWindow, registerIpcHandlers, shutdownServices } from './ipc';
import { registerAudioSchemes, registerAudioProtocols } from './audio';
import { getTrustedDevServerUrl, isAllowedInternalUrl } from './security';

let mainWindow: BrowserWindow | null = null;
let appInitPromise: Promise<void> | null = null;
let windowCreationPromise: Promise<BrowserWindow> | null = null;

// Enable full hardware acceleration and GPU rasterization
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,VaapiVideoDecoder');

// Enforce the Chromium sandbox for every renderer, not just ones created with
// an explicit webPreferences flag.
app.enableSandbox();

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in main process:', reason);
});

function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '../renderer/icon.png'),
    path.join(__dirname, '../../public/icon.png'),
    path.join(__dirname, '../../build/icon.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

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

async function initializeApp(): Promise<void> {
  if (appInitPromise) {
    return appInitPromise;
  }

  appInitPromise = (async () => {
    await initDatabase();

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setDevicePermissionHandler(() => false);

    registerAudioProtocols();
    registerIpcHandlers();
  })();

  try {
    await appInitPromise;
  } catch (err) {
    appInitPromise = null;
    throw err;
  }
}

async function createWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  if (windowCreationPromise) {
    return windowCreationPromise;
  }

  windowCreationPromise = (async () => {
    await initializeApp();

    const win = new BrowserWindow({
      width: 1380,
      height: 880,
      minWidth: 1024,
      minHeight: 680,
      title: 'MaJa Player',
      icon: resolveAppIconPath(),
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

    mainWindow = win;
    bindMainWindow(win);

    win.webContents.on('will-navigate', guardNavigation);

    // Block unexpected redirects without automatically launching external URLs.
    win.webContents.on('will-redirect', (event, url) => {
      if (isAllowedInternalUrl(url)) return;
      event.preventDefault();
    });

    // Subframes must never navigate at all.
    win.webContents.on('will-frame-navigate', (details) => {
      if (details.isMainFrame) return;
      details.preventDefault();
    });

    win.webContents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    win.webContents.setWindowOpenHandler((details) => {
      openExternalIfSafe(details.url);
      return { action: 'deny' };
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) {
        console.error(`Main window failed to load ${validatedURL} (${errorCode}): ${errorDescription}`);
      }
    });

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('Renderer process exited unexpectedly:', details);
    });

    win.on('closed', () => {
      if (mainWindow === win) {
        mainWindow = null;
      }
    });

    const devServerUrl = getTrustedDevServerUrl();
    if (!app.isPackaged && devServerUrl) {
      win.loadURL(devServerUrl).catch((err) => {
        console.error('Failed to load dev server URL:', err);
      });
      win.webContents.openDevTools({ mode: 'detach' });
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html')).catch((err) => {
        console.error('Failed to load renderer entry:', err);
      });
    }

    return win;
  })();

  try {
    return await windowCreationPromise;
  } finally {
    windowCreationPromise = null;
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  // Register privileged schemes BEFORE app.whenReady()
  registerAudioSchemes();

  app.whenReady()
    .then(async () => {
      await initializeApp();
      await createWindow();
    })
    .catch((err) => {
      console.error('Failed to start MaJa Player:', err);
      dialog.showErrorBox(
        'MaJa Player failed to start',
        err instanceof Error ? err.message : String(err)
      );
      app.quit();
    });

  app.on('before-quit', () => {
    try {
      shutdownServices();
    } catch (err) {
      console.error('Error shutting down services:', err);
    }
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
