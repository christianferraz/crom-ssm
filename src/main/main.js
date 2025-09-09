'use strict';

import { app, BrowserWindow, ipcMain, nativeTheme, session, shell } from 'electron';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc/handlers.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

logger.info('Iniciando aplicação Crom-SSM...');

let mainWindow = null;
const IS_DEV = !app.isPackaged || process.env.NODE_ENV === 'development';

if (process.platform === 'win32') {
  try {
    app.setAppUserModelId('Crom-SSM');
  } catch (e) {
    logger.warn('Falha ao setar AppUserModelID:', e);
  }
}

function getDistDir() {
  const devCandidate = resolve(__dirname, '..', '..', 'dist');
  if (existsSync(join(devCandidate, 'welcome.html'))) return devCandidate;

  const packagedCandidate = join(app.getAppPath(), 'dist');
  if (!existsSync(join(packagedCandidate, 'index.html'))) {
    logger.error('Dist directory não encontrado ou vazio!');
  }
  return packagedCandidate;
}

const DIST_DIR = getDistDir();
const resolveDistFile = (fileName) => join(DIST_DIR, fileName);

async function safeLoadFile(fileName) {
  if (!mainWindow) return;

  const filePath = resolveDistFile(fileName);
  if (!existsSync(filePath)) {
    logger.warn(`Arquivo não encontrado: ${filePath}`);
    return;
  }
  try {
    await mainWindow.loadFile(filePath);
    logger.info(`Carregando arquivo: ${fileName}`);
  } catch (err) {
    logger.error(`Erro ao carregar ${fileName}: ${err?.stack || err}`);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Crom-SSM',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121212' : '#FFFFFF',
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolve(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: IS_DEV,
      spellcheck: false,
    },
  });

  safeLoadFile('welcome.html');

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error(`Falha ao carregar (${errorCode}): ${errorDescription} - ${validatedURL}`);
    if (validatedURL?.endsWith('welcome.html')) safeLoadFile('index.html');
  });

  if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

ipcMain.on('navigate:to:main', () => {
  logger.info('Recebido evento para navegar para a aplicação principal.');
  if (!mainWindow) {
    logger.warn('MainWindow não existe; recriando.');
    createWindow();
    return;
  }
  safeLoadFile('index.html');
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.warn('Outra instância detectada; encerrando.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    logger.info('App pronto. Registrando handlers IPC e criando janela.');
    registerIpcHandlers();
    hardenSecurity();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        logger.info('App ativado, criando nova janela.');
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  logger.info('Todas as janelas foram fechadas.');
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => logger.info('Aplicação encerrando...'));
app.on('quit', () => logger.info('Aplicação encerrada.'));

function hardenSecurity() {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      else logger.warn(`window.open bloqueado para URL: ${url}`);
      return { action: 'deny' };
    });

    contents.on('will-navigate', (e, url) => {
      if (!url.startsWith('file://')) {
        logger.warn(`Navegação bloqueada para: ${url}`);
        e.preventDefault();
      }
    });
  });

  const ses = session.defaultSession;
  if (ses) {
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      logger.info(`Permissão solicitada: ${permission} (negada)`);
      callback(false);
    });
  }
}

process.on('uncaughtException', (err) => logger.error('Uncaught exception', err));
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', reason));
