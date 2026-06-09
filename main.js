const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow;
let bounceInterval = null;
let originalX = null;
let originalY = null;
let vx = 40;
let vy = 30;

let appConfig = {
  speed: 1.0,
  interval_ms: 100,
  port: 8888
};

const actionStartEvents = [
  'session.started',
  'turn.started',
  'tool.requested',
  'llm.requested',
  'subagent.started',
  'retry.started'
];

const actionStopEvents = [
  'session.ended',
  'turn.completed',
  'tool.completed',
  'llm.completed',
  'subagent.completed',
  'retry.completed',
  'error.reported',
  'turn.assistant_completed'
];

function loadConfig() {
  const defaultConfig = {
    speed: 1.0,
    interval_ms: 100,
    port: 8888
  };
  const configPath = path.join(app.getPath('home'), '.config', 'hitch-face', 'config.toml');
  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = { ...defaultConfig };
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) {
        continue;
      }
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key === 'speed') {
          config.speed = parseFloat(value);
        } else if (key === 'interval_ms') {
          config.interval_ms = parseInt(value, 10);
        } else if (key === 'port') {
          config.port = parseInt(value, 10);
        }
      }
    }
    return config;
  } catch (err) {
    console.error('Failed to parse config.toml:', err);
    return defaultConfig;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 750,
    height: 500,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    enableLargerThanScreen: true,
    type: 'panel',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    stopBouncing();
    mainWindow = null;
  });
}

function startBouncing() {
  if (bounceInterval) return;
  if (!mainWindow) return;

  const pos = mainWindow.getPosition();
  originalX = pos[0];
  originalY = pos[1];

  // Randomize initial direction (adjusted for speed)
  vx = (Math.random() > 0.5 ? 1 : -1) * 16 * appConfig.speed;
  vy = (Math.random() > 0.5 ? 1 : -1) * 12 * appConfig.speed;

  bounceInterval = setInterval(() => {
    if (!mainWindow) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: minX, y: minY, width: screenW, height: screenH } = primaryDisplay.bounds;
    const maxX = minX + screenW;
    const maxY = minY + screenH;

    let [x, y] = mainWindow.getPosition();
    x += vx;
    y += vy;

    // Visual bounding box offsets relative to the 500x500 window
    // (BMO body: 310x370, arms: 48px, legs: 40px, centered inside 450x450 container)
    const padTop = 65;     // top of BMO casing
    const padBottom = 460; // bottom of BMO's feet
    const padLeft = 50;    // left arm tip
    const padRight = 450;  // right arm tip

    // Bounce off screen edges using visual bounds
    if (x + padLeft <= minX) {
      x = minX - padLeft;
      vx = -vx;
    } else if (x + padRight >= maxX) {
      x = maxX - padRight;
      vx = -vx;
    }

    if (y + padTop <= minY) {
      y = minY - padTop;
      vy = -vy;
    } else if (y + padBottom >= maxY) {
      y = maxY - padBottom;
      vy = -vy;
    }

    mainWindow.setPosition(Math.round(x), Math.round(y));
  }, appConfig.interval_ms);
}

function stopBouncing() {
  if (bounceInterval) {
    clearInterval(bounceInterval);
    bounceInterval = null;
    if (mainWindow && originalX !== null && originalY !== null) {
      mainWindow.setPosition(originalX, originalY);
    }
  }
}

// Start local HTTP server
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && (req.url === '/event' || req.url === '/expression')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        let expr = payload.hitch_event_type;
        let envelope = payload;
        
        // Backwards compatibility for legacy /expression or plain string updates
        if (req.url === '/expression') {
          expr = payload.expression;
          envelope = {
            hitch_event_type: expr,
            harness: 'omp',
            payload: {}
          };
        }
        
        if (expr && mainWindow) {
          mainWindow.webContents.send('hitch-event', envelope);
          console.log(`Event processed: ${expr}`);

          // Control window bouncing movement based on event type
          if (actionStartEvents.includes(expr)) {
            startBouncing();
          } else if (actionStopEvents.includes(expr)) {
            stopBouncing();
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', event: expr }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', reason: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

app.whenReady().then(() => {
  appConfig = loadConfig();
  createWindow();
  server.listen(appConfig.port, '127.0.0.1', () => {
    console.log(`HTTP Server listening on http://127.0.0.1:${appConfig.port}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  server.close();
});


