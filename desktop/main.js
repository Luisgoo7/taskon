// Widget de desktop do TaskON: uma bolinha fixa no canto superior direito,
// sempre por cima das outras janelas. Clicar nela abre/fecha o app completo.
const { app, BrowserWindow, Menu, ipcMain, screen, shell, dialog } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const icsHandler = require('../api/ics.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = 5180;
const BUBBLE = 76; // tamanho da janela da bolinha (a bolinha tem 64px + sombra)
const MARGIN = 14; // distância da borda direita da tela
const TOP = 26; // distância do topo da tela
const PANEL_WIDTH = 340;
const PANEL_MAX_HEIGHT = 600;
const PANEL_ZOOM = 0.85; // deixa textos e botões do painel menores

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/calendar.js': ['calendar.js', 'text/javascript; charset=utf-8'],
  '/sync.js': ['sync.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'],
  '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'],
};

let bubble;
let panel;

// ---------- Servidor local: arquivos do app + busca da agenda ----------
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const { pathname } = new URL(req.url, `http://127.0.0.1:${PORT}`);

      if (pathname === '/api/ics') {
        // Reaproveita a mesma função usada na Vercel
        let raw = '';
        for await (const chunk of req) raw += chunk;
        try {
          req.body = JSON.parse(raw || '{}');
        } catch {
          req.body = {};
        }
        const out = {
          status(code) { res.statusCode = code; return out; },
          setHeader: (k, v) => res.setHeader(k, v),
          json(obj) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); },
          send(body) { res.end(body); },
        };
        return icsHandler(req, out);
      }

      // Volta do link do e-mail: a página /auth entrega a sessão para o painel
      if (pathname === '/auth') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return fs.createReadStream(path.join(__dirname, 'auth.html')).pipe(res);
      }
      if (pathname === '/api/session' && req.method === 'POST') {
        // Só aceita a página /auth deste mesmo servidor
        if (req.headers.origin !== `http://127.0.0.1:${PORT}`) {
          res.statusCode = 403;
          return res.end();
        }
        let raw = '';
        for await (const chunk of req) raw += chunk;
        let tokens;
        try {
          const { access_token, refresh_token } = JSON.parse(raw);
          if (typeof access_token !== 'string' || typeof refresh_token !== 'string') throw new Error();
          tokens = { access_token, refresh_token };
        } catch {
          res.statusCode = 400;
          return res.end();
        }
        const ok = await panel.webContents.executeJavaScript(
          `TaskSync.setSession(${JSON.stringify(tokens)}).then((r) => !r.error)`
        );
        if (!ok) {
          res.statusCode = 401;
          return res.end();
        }
        setOpen(true);
        res.setHeader('Content-Type', 'application/json');
        return res.end('{"ok":true}');
      }

      const file = FILES[pathname];
      if (!file) {
        res.statusCode = 404;
        return res.end('Not found');
      }
      res.setHeader('Content-Type', file[1]);
      fs.createReadStream(path.join(ROOT, file[0])).pipe(res);
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
}

// ---------- Janelas ----------
function positions() {
  const area = screen.getPrimaryDisplay().workArea;
  const bubbleX = area.x + area.width - BUBBLE - MARGIN;
  const bubbleY = area.y + TOP;
  const panelY = bubbleY + BUBBLE + 4;
  return {
    bubble: { x: bubbleX, y: bubbleY },
    panel: {
      x: area.x + area.width - PANEL_WIDTH - MARGIN,
      y: panelY,
      width: PANEL_WIDTH,
      height: Math.min(PANEL_MAX_HEIGHT, area.y + area.height - panelY - MARGIN),
    },
  };
}

function place() {
  const pos = positions();
  bubble.setBounds({ ...pos.bubble, width: BUBBLE, height: BUBBLE });
  panel.setBounds(pos.panel);
}

function keepOnTop(win) {
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function createWindows() {
  const pos = positions();

  bubble = new BrowserWindow({
    ...pos.bubble,
    width: BUBBLE,
    height: BUBBLE,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  keepOnTop(bubble);
  bubble.loadFile(path.join(__dirname, 'bubble.html'));

  panel = new BrowserWindow({
    ...pos.panel,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#0a0f1c',
    title: 'TaskON',
  });
  keepOnTop(panel);
  panel.loadURL(`http://127.0.0.1:${PORT}/`);
  panel.webContents.on('did-finish-load', () => panel.webContents.setZoomFactor(PANEL_ZOOM));

  // Links (Meet, Zoom...) abrem no navegador, não dentro do widget
  panel.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  panel.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  screen.on('display-metrics-changed', place);
  screen.on('display-added', place);
  screen.on('display-removed', place);
}

function setOpen(open) {
  if (open) {
    panel.show();
    panel.focus();
    keepOnTop(bubble); // a bolinha continua por cima do painel
  } else {
    panel.hide();
  }
  bubble.webContents.send('state', open);
}

const toggle = () => setOpen(!panel.isVisible());

// No modo de desenvolvimento o Windows precisa saber qual pasta abrir
const loginOptions = app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] };

function showMenu() {
  Menu.buildFromTemplate([
    { label: panel.isVisible() ? 'Fechar TaskON' : 'Abrir TaskON', click: toggle },
    { label: 'Recarregar', click: () => panel.reload() },
    { type: 'separator' },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings(loginOptions).openAtLogin,
      click: (item) => app.setLoginItemSettings({ ...loginOptions, openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Sair do TaskON', click: () => app.quit() },
  ]).popup({ window: bubble });
}

// ---------- Início ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Abrir o TaskON de novo só abre/fecha o painel
  app.on('second-instance', () => toggle());

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    try {
      await startServer();
    } catch (error) {
      dialog.showErrorBox('TaskON', `Não foi possível iniciar (porta ${PORT} ocupada?).\n\n${error.message}`);
      return app.quit();
    }
    ipcMain.on('toggle', toggle);
    ipcMain.on('menu', showMenu);
    createWindows();
  });

  // O widget fica rodando mesmo com o painel fechado
  app.on('window-all-closed', (e) => e.preventDefault());
}
