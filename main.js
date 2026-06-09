const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const sessions = new Map();

ipcMain.on('shutdown-session', (event, sessionId) => {
  const session = sessions.get(sessionId);
  if (session) {
    if (session.window && !session.window.isDestroyed()) {
      session.window.close();
    }
    if (session.bounceInterval) {
      clearInterval(session.bounceInterval);
    }
    sessions.delete(sessionId);
  }
});

let appConfig = {
  speed: 1.0,
  interval_ms: 100,
  port: 8888,
  ticker_speed_s: 15,
  buffer_size: 500,
  movement_enabled: false,
  colors: {}
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
    port: 8888,
    ticker_speed_s: 15,
    buffer_size: 500,
    movement_enabled: false,
    colors: {}
  };
  const configPath = path.join(app.getPath('home'), '.config', 'hitch-face', 'config.toml');
  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = { ...defaultConfig };
    const lines = content.split(/\r?\n/);
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      if (trimmed.startsWith('[')) {
        currentSection = trimmed.replace(/\[|\]/g, '').trim();
        continue;
      }
      
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/"/g, '');
        
        if (currentSection === 'colors') {
          config.colors[key] = value;
        } else {
          if (key === 'speed') {
            config.speed = parseFloat(value);
          } else if (key === 'interval_ms') {
            config.interval_ms = parseInt(value, 10);
          } else if (key === 'port') {
            config.port = parseInt(value, 10);
          } else if (key === 'ticker_speed_s') {
            config.ticker_speed_s = parseFloat(value);
          } else if (key === 'buffer_size') {
            config.buffer_size = parseInt(value, 10);
          } else if (key === 'movement_enabled') {
            config.movement_enabled = value === 'true';
          }
        }
      }
    }
    return config;
  } catch (err) {
    console.error('Failed to parse config.toml:', err);
    return defaultConfig;
  }
}

function createSessionWindow(sessionId, harness) {
  if (sessions.has(sessionId)) return sessions.get(sessionId);

  const win = new BrowserWindow({
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

  const sessionState = {
    window: win,
    bounceInterval: null,
    originalX: null,
    originalY: null,
    vx: 40,
    vy: 30,
    isReady: false,
    eventBuffer: []
  };
  sessions.set(sessionId, sessionState);

  win.loadFile(path.join(__dirname, 'index.html'));

  win.webContents.on('did-finish-load', () => {
    sessionState.isReady = true;
    win.webContents.send('apply-config', {
      ticker_speed_s: appConfig.ticker_speed_s,
      buffer_size: appConfig.buffer_size,
      colors: appConfig.colors
    });
    
    win.webContents.send('init-session', { sessionId, harness });

    // Flush buffered events
    while (sessionState.eventBuffer.length > 0) {
      const envelope = sessionState.eventBuffer.shift();
      win.webContents.send('hitch-event', envelope);
    }
  });

  win.on('closed', () => {
    stopBouncing(sessionId);
    sessions.delete(sessionId);
  });

  return sessionState;
}

function startBouncing(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.window || session.bounceInterval) return;

  const win = session.window;
  const pos = win.getPosition();
  session.originalX = pos[0];
  session.originalY = pos[1];

  // Randomize initial direction (adjusted for speed)
  session.vx = (Math.random() > 0.5 ? 1 : -1) * 16 * appConfig.speed;
  session.vy = (Math.random() > 0.5 ? 1 : -1) * 12 * appConfig.speed;

  session.bounceInterval = setInterval(() => {
    if (win.isDestroyed()) {
      stopBouncing(sessionId);
      return;
    }
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: minX, y: minY, width: screenW, height: screenH } = primaryDisplay.bounds;
    const maxX = minX + screenW;
    const maxY = minY + screenH;

    let [x, y] = win.getPosition();
    x += session.vx;
    y += session.vy;

    // Visual bounding box offsets relative to the 500x500 window
    const padTop = 65;     // top of BMO casing
    const padBottom = 460; // bottom of BMO's feet
    const padLeft = 175;    // left arm tip
    const padRight = 575;  // right arm tip

    // Bounce off screen edges using visual bounds
    if (x + padLeft <= minX) {
      x = minX - padLeft;
      session.vx = -session.vx;
    } else if (x + padRight >= maxX) {
      x = maxX - padRight;
      session.vx = -session.vx;
    }

    if (y + padTop <= minY) {
      y = minY - padTop;
      session.vy = -session.vy;
    } else if (y + padBottom >= maxY) {
      y = maxY - padBottom;
      session.vy = -session.vy;
    }

    win.setPosition(Math.round(x), Math.round(y));
  }, appConfig.interval_ms);
}

function stopBouncing(sessionId) {
  const session = sessions.get(sessionId);
  if (session && session.bounceInterval) {
    clearInterval(session.bounceInterval);
    session.bounceInterval = null;
    if (session.window && !session.window.isDestroyed() && session.originalX !== null && session.originalY !== null) {
      session.window.setPosition(session.originalX, session.originalY);
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
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', reason: 'Invalid JSON' }));
        return;
      }

      try {
        if (!payload || typeof payload !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', reason: 'Payload must be an object' }));
          return;
        }

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
        
        if (!expr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', reason: 'Missing event type (hitch_event_type or expression)' }));
          return;
        }

        const harness = envelope.harness || 'default';
        const sessionId = envelope.session_id || envelope.payload?.session?.id || envelope.payload?.session_id || 'default-session';
        
        const sessionState = createSessionWindow(sessionId, harness);
        const win = sessionState.window;
        
        if (!sessionState.isReady) {
          sessionState.eventBuffer.push(envelope);
        } else if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
          win.webContents.send('hitch-event', envelope);
          console.log(`Event processed for ${sessionId}: ${expr}`);

          // Control window bouncing movement based on event type
          if (appConfig.movement_enabled) {
            if (actionStartEvents.includes(expr)) {
              startBouncing(sessionId);
            } else if (actionStopEvents.includes(expr)) {
              stopBouncing(sessionId);
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', event: expr }));
      } catch (err) {
        console.error('Error handling request:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', reason: 'Internal Server Error' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Handle server startup and port conflict errors gracefully
server.on('error', (err) => {
  console.error('HTTP Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${appConfig.port || 8888} is already in use by another process. Please close any other instances of hitch-face.`);
  }
});

app.whenReady().then(() => {
  appConfig = loadConfig();
  server.listen(appConfig.port, '127.0.0.1', () => {
    console.log(`HTTP Server listening on http://127.0.0.1:${appConfig.port}`);
  });

  app.on('activate', () => {
    // Windows are created on first event, so we don't automatically create one here anymore.
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


