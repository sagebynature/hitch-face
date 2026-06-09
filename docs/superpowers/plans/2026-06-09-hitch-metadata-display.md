# Hitch Metadata Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the `hitch-face` BMO desktop widget to display additional metadata (harness name and payload details) via a Screen HUD, scrolling ticker, and on-demand Side Console Drawer (toggled by the physical Red Button).

**Architecture:** 
1. The bash adapter forwards the entire Hitch event envelope JSON.
2. The Electron main process hosts an HTTP server on port 8888, receives the JSON at `/event`, and forwards it to the renderer via IPC.
3. The renderer extracts metadata, renders it inside a screen HUD & ticker, and logs it inside a side console drawer that slides out without moving BMO's body.

**Tech Stack:** Node.js, Electron, Vanilla HTML/CSS/JS

---

### Task 1: Create Unit Tests for Metadata Extraction

**Files:**
- Create: `tests/extract-metadata.test.js`

- [ ] **Step 1: Write the unit tests**
  Create a test suite in Node.js using assert that verifies the metadata extraction helper function correctly formats different types of Hitch event payloads.
  
  Code for `tests/extract-metadata.test.js`:
  ```javascript
  const assert = require('assert');
  const { extractMetadata } = require('../renderer.js');

  const testCases = [
    {
      name: 'tool.requested',
      envelope: {
        harness: 'omp',
        hitch_event_type: 'tool.requested',
        payload: {
          tool: {
            name: 'grep_search',
            input: { query: 'hitch_event_type' }
          }
        }
      },
      expected: {
        harness: 'OMP',
        event: 'TOOL.REQUESTED',
        tickerText: 'OMP | tool.requested | tool: grep_search | query: "hitch_event_type"',
        consoleText: 'harness: omp\nevent: tool.requested\ntool: grep_search\nquery: "hitch_event_type"'
      }
    },
    {
      name: 'llm.completed',
      envelope: {
        harness: 'codex',
        hitch_event_type: 'llm.completed',
        payload: {
          llm: {
            finish_reason: 'stop',
            usage: { tokens: 120, cost: 0.0024 }
          }
        }
      },
      expected: {
        harness: 'CODEX',
        event: 'LLM.COMPLETED',
        tickerText: 'CODEX | llm.completed | finish: stop | tokens: 120 | cost: $0.0024',
        consoleText: 'harness: codex\nevent: llm.completed\nfinish: stop\ntokens: 120\ncost: $0.0024'
      }
    },
    {
      name: 'turn.user_prompt',
      envelope: {
        harness: 'hermes',
        hitch_event_type: 'turn.user_prompt',
        payload: {
          turn: {
            prompt: 'Explain quantum computing'
          }
        }
      },
      expected: {
        harness: 'HERMES',
        event: 'TURN.USER_PROMPT',
        tickerText: 'HERMES | turn.user_prompt | prompt: "Explain quantum computing"',
        consoleText: 'harness: hermes\nevent: turn.user_prompt\nprompt: "Explain quantum computing"'
      }
    }
  ];

  console.log('Running metadata extraction unit tests...');
  let failed = 0;

  for (const tc of testCases) {
    try {
      const result = extractMetadata(tc.envelope);
      assert.deepStrictEqual(result, tc.expected);
      console.log(`✅ PASS: ${tc.name}`);
    } catch (err) {
      console.error(`❌ FAIL: ${tc.name}`);
      console.error(err);
      failed++;
    }
  }

  process.exit(failed > 0 ? 1 : 0);
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node tests/extract-metadata.test.js`
  Expected: FAIL with `Cannot find module '../renderer.js'` (or function not defined).

- [ ] **Step 3: Commit initial test**
  ```bash
  git add tests/extract-metadata.test.js
  git commit -m "test: add metadata extraction unit tests"
  ```

---

### Task 2: Implement Metadata Extraction Logic

**Files:**
- Modify: `renderer.js`

- [ ] **Step 1: Write minimal implementation in `renderer.js`**
  Add the `extractMetadata` function to `renderer.js` and export it at the bottom of the file.
  
  Add to the end of `renderer.js`:
  ```javascript
  function extractMetadata(envelope) {
    if (!envelope) {
      return { harness: 'UNKNOWN', event: 'UNKNOWN', tickerText: 'No event envelope', consoleText: '' };
    }
    
    const rawHarness = envelope.harness || 'unknown';
    const harness = rawHarness.toUpperCase();
    const event = (envelope.hitch_event_type || 'unknown').toUpperCase();
    
    let tickerText = `${harness} | ${envelope.hitch_event_type || ''}`;
    let consoleLines = [
      `harness: ${rawHarness}`,
      `event: ${envelope.hitch_event_type || ''}`
    ];
    
    const payload = envelope.payload || {};
    
    if (envelope.hitch_event_type === 'tool.requested' || envelope.hitch_event_type === 'tool.completed') {
      const tool = payload.tool || {};
      if (tool.name) {
        tickerText += ` | tool: ${tool.name}`;
        consoleLines.push(`tool: ${tool.name}`);
      }
      if (tool.input) {
        const inputStr = typeof tool.input === 'object' ? JSON.stringify(tool.input) : tool.input;
        tickerText += ` | input: ${inputStr}`;
        // Formatted details for console
        for (const [k, v] of Object.entries(tool.input)) {
          const valStr = typeof v === 'object' ? JSON.stringify(v) : v;
          consoleLines.push(`${k}: "${valStr}"`);
        }
      }
    } else if (envelope.hitch_event_type === 'llm.completed') {
      const llm = payload.llm || {};
      if (llm.finish_reason) {
        tickerText += ` | finish: ${llm.finish_reason}`;
        consoleLines.push(`finish: ${llm.finish_reason}`);
      }
      if (llm.usage) {
        if (llm.usage.tokens !== undefined) {
          tickerText += ` | tokens: ${llm.usage.tokens}`;
          consoleLines.push(`tokens: ${llm.usage.tokens}`);
        }
        if (llm.usage.cost !== undefined) {
          tickerText += ` | cost: $${llm.usage.cost}`;
          consoleLines.push(`cost: $${llm.usage.cost}`);
        }
      }
    } else if (envelope.hitch_event_type === 'turn.user_prompt') {
      const turn = payload.turn || {};
      if (turn.prompt) {
        const cleanedPrompt = turn.prompt.replace(/\r?\n/g, ' ');
        tickerText += ` | prompt: "${cleanedPrompt}"`;
        consoleLines.push(`prompt: "${cleanedPrompt}"`);
      }
    }
    
    // Shorten ticker text if it is excessively long (soft cap for ticker aesthetics)
    if (tickerText.length > 200) {
      tickerText = tickerText.substring(0, 197) + '...';
    }
    
    return {
      harness,
      event,
      tickerText,
      consoleText: consoleLines.join('\n')
    };
  }

  // Support exporting for Node.js unit tests
  if (typeof module !== 'undefined') {
    module.exports = { extractMetadata };
  }
  ```

- [ ] **Step 2: Run test to verify it passes**
  Run: `node tests/extract-metadata.test.js`
  Expected: PASS

- [ ] **Step 3: Commit implementation**
  ```bash
  git add renderer.js
  git commit -m "feat: implement metadata extraction logic and pass tests"
  ```

---

### Task 3: Update Bash Adapter (`adapter.sh`)

**Files:**
- Modify: `adapter.sh`

- [ ] **Step 1: Modify `adapter.sh` to forward full JSON payload**
  Update `adapter.sh` to post the entire stdin payload instead of just the extracted event type.
  
  Target block in `adapter.sh`:
  ```bash
  # If the event type is valid, POST it to the desktop widget endpoint
  if [ -n "$EVENT_TYPE" ] && [ "$EVENT_TYPE" != "null" ]; then
    curl -s -X POST \
      -H "Content-Type: application/json" \
      -d "{\"expression\":\"$EVENT_TYPE\"}" \
      http://127.0.0.1:${PORT}/expression > /dev/null 2>&1 || true
  fi
  ```
  
  Replacement block:
  ```bash
  # If the input is non-empty, POST the entire envelope to the /event endpoint
  if [ -n "$INPUT" ] && [ "$EVENT_TYPE" != "null" ]; then
    curl -s -X POST \
      -H "Content-Type: application/json" \
      -d "$INPUT" \
      http://127.0.0.1:${PORT}/event > /dev/null 2>&1 || true
  fi
  ```

- [ ] **Step 2: Commit adapter changes**
  ```bash
  git add adapter.sh
  git commit -m "feat: modify adapter.sh to forward full event envelope"
  ```

---

### Task 4: Update Electron Main Process (`main.js`)

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Resize window & update HTTP server**
  Update the window dimensions in `createWindow()` from `500x500` to `750x500` to accommodate the slide-out console. Update the server routes to handle `POST /event` and forward the full envelope.
  
  Target lines 79-81:
  ```javascript
    mainWindow = new BrowserWindow({
      width: 500,
      height: 500,
  ```
  
  Replacement:
  ```javascript
    mainWindow = new BrowserWindow({
      width: 750,
      height: 500,
  ```
  
  Target lines 177-208:
  ```javascript
    if (req.method === 'POST' && req.url === '/expression') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const expr = payload.expression;
          if (expr && mainWindow) {
            mainWindow.webContents.send('set-expression', expr);
            console.log(`Expression updated to: ${expr}`);
  
            // Control window bouncing movement based on event type
            if (actionStartEvents.includes(expr)) {
              startBouncing();
            } else if (actionStopEvents.includes(expr)) {
              stopBouncing();
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', expression: expr }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', reason: 'Invalid JSON' }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  ```
  
  Replacement:
  ```javascript
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
  ```

- [ ] **Step 2: Commit main.js changes**
  ```bash
  git add main.js
  git commit -m "feat: update main.js window size and add /event server route"
  ```

---

### Task 5: Update HTML structure (`index.html`) & Styles (`style.css`)

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Add new elements in `index.html`**
  Add the `.hud-header` and `.screen-ticker` inside BMO's screen. Add `.console-drawer` at the same level as `.bmo-body` inside a wrapping container.
  
  Target lines 11-14 in `index.html`:
  ```html
  <body>
    <div id="app-container" class="state-idle">
      <!-- BMO Main Body (Draggable) -->
      <div class="bmo-body">
  ```
  
  Replacement:
  ```html
  <body>
    <div id="app-container" class="state-idle">
      <div class="bmo-relative-container">
        <!-- Side Console Drawer (Slides out from behind BMO) -->
        <div class="console-drawer">
          <div>
            <div class="console-header">>_ Hitch Log Console</div>
            <div class="console-content">
              <!-- Log text updated dynamically -->
            </div>
          </div>
          <div class="console-footer">Status: Idle</div>
        </div>

        <!-- BMO Main Body (Draggable) -->
        <div class="bmo-body">
  ```
  
  Target lines 21-23 (inside `.bmo-screen`):
  ```html
          <div class="bmo-screen">
            <div class="scanline"></div>
  ```
  
  Replacement:
  ```html
          <div class="bmo-screen">
            <div class="scanline"></div>
            
            <!-- Screen HUD Details -->
            <div class="hud-header"></div>
  ```
  
  Target lines 38-43 (end of `.bmo-screen`):
  ```html
            </div>
  
            <!-- Status Indicator (retro LCD style) -->
            <div class="status-panel">
              <span class="status-label">STANDBY</span>
            </div>
          </div>
  ```
  
  Replacement:
  ```html
            </div>
  
            <!-- Status Indicator (retro LCD style) -->
            <div class="status-panel">
              <span class="status-label">STANDBY</span>
            </div>

            <!-- Scrolling Ticker at bottom of Screen -->
            <div class="screen-ticker">
              <div class="ticker-wrap"></div>
            </div>
          </div>
  ```
  
  Remember to close the wrapping div `</div>` for `.bmo-relative-container` right before `</body>`.
  
  Target line 93-97:
  ```html
      </div>
    </div>
  
    <script src="renderer.js"></script>
  </body>
  ```
  
  Replacement:
  ```html
      </div>
    </div>
  
    <script src="renderer.js"></script>
  </body>
  ```
  *(Wait, the new closing tag is for `.bmo-relative-container`:)*
  ```html
      </div> <!-- Close bmo-relative-container -->
    </div> <!-- Close app-container -->
  
    <script src="renderer.js"></script>
  </body>
  ```

- [ ] **Step 2: Update `style.css` layouts and console styles**
  Adjust the window widths, keep BMO centered, and add the layout rules for HUD, ticker, and drawer.
  
  Target lines 12-24 in `style.css`:
  ```css
  body {
    margin: 0;
    padding: 0;
    width: 500px;
    height: 500px;
    background: transparent;
    font-family: var(--font-family);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
  }
  ```
  
  Replacement:
  ```css
  body {
    margin: 0;
    padding: 0;
    width: 750px;
    height: 500px;
    background: transparent;
    font-family: var(--font-family);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
  }
  ```
  
  Target lines 27-35:
  ```css
  #app-container {
    position: relative;
    width: 450px;
    height: 450px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.5s ease;
  }
  ```
  
  Replacement:
  ```css
  #app-container {
    position: relative;
    width: 750px;
    height: 450px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.5s ease;
  }
  
  .bmo-relative-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  ```
  
  Add to the bottom of `style.css`:
  ```css
  /* ==========================================================================
     Hitch Metadata Display (Screen HUD, Ticker, and Drawer)
     ========================================================================== */
  
  /* Side Console Drawer */
  .console-drawer {
    position: absolute;
    top: 50%;
    left: calc(50% + 150px); /* Positioned right at BMO's right edge (150px is half of 300px BMO bounds) */
    transform: translateY(-50%) scaleX(0);
    transform-origin: left center;
    width: 200px;
    height: 270px;
    background: #1e293b;
    border: 3px solid #334155;
    border-left: none;
    border-top-right-radius: 20px;
    border-bottom-right-radius: 20px;
    box-shadow: 5px 10px 20px rgba(0,0,0,0.3);
    z-index: 5;
    box-sizing: border-box;
    padding: 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  /* Open Drawer State class applied to app-container */
  #app-container.drawer-open .console-drawer {
    transform: translateY(-50%) scaleX(1);
  }
  
  .console-header {
    font-size: 10px;
    font-weight: 800;
    color: #e11d48;
    border-bottom: 1px solid rgba(225, 29, 72, 0.2);
    padding-bottom: 4px;
    margin-bottom: 8px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  
  .console-content {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    color: #cbd5e1;
    flex-grow: 1;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-y: auto;
  }
  
  .console-footer {
    font-size: 8px;
    color: #64748b;
    text-align: right;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 4px;
    margin-top: 4px;
  }
  
  /* Screen HUD & Ticker Elements */
  .hud-header {
    position: absolute;
    top: 4px;
    left: 8px;
    font-family: 'Outfit', sans-serif;
    font-size: 8px;
    color: var(--face-color);
    font-weight: 600;
    opacity: 0.5;
    text-transform: uppercase;
  }
  
  .screen-ticker {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    background: rgba(0, 0, 0, 0.04);
    border-top: 1px dashed rgba(0, 0, 0, 0.1);
    height: 16px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    overflow: hidden;
    padding: 0 4px;
    opacity: 0.9;
  }
  
  .ticker-wrap {
    white-space: nowrap;
    display: inline-block;
    animation: ticker 15s linear infinite;
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px;
    color: var(--face-color);
    font-weight: bold;
  }
  
  @keyframes ticker {
    0% { transform: translate3d(100%, 0, 0); }
    100% { transform: translate3d(-100%, 0, 0); }
  }
  
  /* Slide BMO Face upward when screen ticker is active */
  #app-container:not(.state-idle) .bmo-face {
    transform: translateY(-4px);
  }
  
  /* Hide standard status panel when screen ticker is active */
  #app-container:not(.state-idle) .status-panel {
    display: none;
  }
  
  /* Red Button interactivity pulse hint when active */
  #app-container:not(.state-idle) .btn-red {
    position: relative;
  }
  #app-container:not(.state-idle) .btn-red::after {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border-radius: 50%;
    border: 1px dashed #e11d48;
    animation: button-pulse 10s linear infinite;
    pointer-events: none;
  }
  @keyframes button-pulse {
    100% { transform: rotate(360deg); }
  }
  ```

- [ ] **Step 3: Commit HTML and CSS changes**
  ```bash
  git add index.html style.css
  git commit -m "feat: add HTML structures and CSS styles for HUD, ticker, and console drawer"
  ```

---

### Task 6: Connect Frontend Logic (`renderer.js`)

**Files:**
- Modify: `renderer.js`

- [ ] **Step 1: Wire IPC listeners and Red Button click handler**
  Update `renderer.js` to handle the `hitch-event` IPC message, update HUD / Ticker / Drawer DOM elements, and bind the red button to slide out the drawer.
  
  Target lines 126-154 in `renderer.js`:
  ```javascript
  ipcRenderer.on('set-expression', (event, expr) => {
    // Clear any pending transition timeouts
    if (resetTimeout) {
      clearTimeout(resetTimeout);
      resetTimeout = null;
    }
  
    const config = eventMap[expr];
    if (!config) {
      // If unknown expression received, show it as generic raw state
      container.className = 'state-idle';
      statusLabel.textContent = expr.toUpperCase().substring(0, 16);
      return;
    }
  
    // Play robot sound
    playRobotSound(expr);
  
    // Update classes
    container.className = `${config.state} ${config.className}`;
    statusLabel.textContent = expr.replace('.', ' / ').toUpperCase();
  
    // If the expression has a limited duration, set a timer to return to idle
    if (!config.sticky && config.duration) {
      resetTimeout = setTimeout(() => {
        resetToIdle();
      }, config.duration);
    }
  });
  ```
  
  Replacement:
  ```javascript
  const hudHeader = document.querySelector('.hud-header');
  const tickerWrap = document.querySelector('.ticker-wrap');
  const consoleContent = document.querySelector('.console-content');
  const consoleFooter = document.querySelector('.console-footer');
  const redButton = document.querySelector('.btn-red');
  
  // Bind physical red button click to toggle drawer
  if (redButton) {
    redButton.addEventListener('click', (e) => {
      e.stopPropagation();
      container.classList.toggle('drawer-open');
    });
  }
  
  // Handle old set-expression message (simulate basic event envelope)
  ipcRenderer.on('set-expression', (event, expr) => {
    handleEventEnvelope({
      hitch_event_type: expr,
      harness: 'omp',
      payload: {}
    });
  });
  
  // Handle full event envelope
  ipcRenderer.on('hitch-event', (event, envelope) => {
    handleEventEnvelope(envelope);
  });
  
  function handleEventEnvelope(envelope) {
    const expr = envelope.hitch_event_type;
    
    // Clear any pending transition timeouts
    if (resetTimeout) {
      clearTimeout(resetTimeout);
      resetTimeout = null;
    }
  
    const config = eventMap[expr];
    if (!config) {
      // If unknown expression received, show it as generic raw state
      container.className = 'state-idle';
      statusLabel.textContent = expr.toUpperCase().substring(0, 16);
      hudHeader.textContent = '';
      tickerWrap.textContent = '';
      consoleContent.textContent = '';
      return;
    }
  
    // Play robot sound
    playRobotSound(expr);
  
    // Extract metadata
    const meta = extractMetadata(envelope);
  
    // Update classes and legacy status text
    container.className = `${config.state} ${config.className}`;
    
    // Maintain drawer-open state if it was open
    if (container.classList.contains('drawer-open')) {
      // (keep class drawer-open intact)
    }
    
    statusLabel.textContent = expr.replace('.', ' / ').toUpperCase();
    
    // Update Screen HUD, Ticker, and Console Drawer contents
    hudHeader.textContent = `[${meta.harness} / ${meta.event}]`;
    tickerWrap.textContent = meta.tickerText;
    consoleContent.textContent = meta.consoleText;
    consoleFooter.textContent = `Event ID: ${envelope.event_id || 'n/a'}`;
  
    // If the expression has a limited duration, set a timer to return to idle
    if (!config.sticky && config.duration) {
      resetTimeout = setTimeout(() => {
        resetToIdle();
      }, config.duration);
    }
  }
  
  // Extend resetToIdle to clear HUD and Ticker
  const originalResetToIdle = resetToIdle;
  resetToIdle = function() {
    // Keep drawer open or close on idle (let's close on idle to keep BMO minimal)
    container.classList.remove('drawer-open');
    originalResetToIdle();
    hudHeader.textContent = '';
    tickerWrap.textContent = '';
    consoleContent.textContent = '';
  };
  ```

- [ ] **Step 2: Commit renderer changes**
  ```bash
  git add renderer.js
  git commit -m "feat: integrate IPC event listeners and red button drawer toggle"
  ```

---

### Task 7: Visual & End-to-End Verification

**Files:**
- Create: `tests/test-payloads.sh`

- [ ] **Step 1: Write test payload shell script**
  Create a shell script that fires complete Hitch event payloads with diverse properties to the local server, allowing manual validation of BMO.
  
  Code for `tests/test-payloads.sh`:
  ```bash
  #!/bin/bash
  PORT=8888
  
  # 1. Start turn.user_prompt
  echo "Sending turn.user_prompt..."
  curl -s -X POST -H "Content-Type: application/json" -d '{
    "harness": "omp",
    "hitch_event_type": "turn.user_prompt",
    "event_id": "evt_prompt_01",
    "payload": {
      "turn": {
        "prompt": "Find all exact pattern matches using ripgrep in workspace"
      }
    }
  }' http://127.0.0.1:${PORT}/event
  sleep 4
  
  # 2. Start tool.requested
  echo "Sending tool.requested..."
  curl -s -X POST -H "Content-Type: application/json" -d '{
    "harness": "omp",
    "hitch_event_type": "tool.requested",
    "event_id": "evt_tool_02",
    "payload": {
      "tool": {
        "name": "grep_search",
        "input": {
          "query": "hitch_event_type",
          "SearchPath": "/Users/sage/workspace/hitch-face"
        }
      }
    }
  }' http://127.0.0.1:${PORT}/event
  sleep 6
  
  # 3. Complete tool
  echo "Sending tool.completed..."
  curl -s -X POST -H "Content-Type: application/json" -d '{
    "harness": "omp",
    "hitch_event_type": "tool.completed",
    "event_id": "evt_tool_03",
    "payload": {
      "tool": {
        "name": "grep_search",
        "input": {
          "query": "hitch_event_type"
        },
        "output": "Found 1 match in adapter.sh"
      }
    }
  }' http://127.0.0.1:${PORT}/event
  sleep 4
  
  # 4. LLM completed
  echo "Sending llm.completed..."
  curl -s -X POST -H "Content-Type: application/json" -d '{
    "harness": "codex",
    "hitch_event_type": "llm.completed",
    "event_id": "evt_llm_04",
    "payload": {
      "llm": {
        "finish_reason": "stop",
        "usage": {
          "tokens": 450,
          "cost": 0.009
        }
      }
    }
  }' http://127.0.0.1:${PORT}/event
  sleep 4
  
  # 5. Reset to idle
  echo "Completing turn..."
  curl -s -X POST -H "Content-Type: application/json" -d '{
    "harness": "omp",
    "hitch_event_type": "turn.completed",
    "event_id": "evt_turn_05"
  }' http://127.0.0.1:${PORT}/event
  
  echo "Manual verification payloads sent!"
  ```

- [ ] **Step 2: Ensure test file is executable**
  Run: `chmod +x tests/test-payloads.sh`

- [ ] **Step 3: Run the tests while BMO widget is running**
  Start BMO widget using `npm start` in one terminal window.
  In another terminal window, run the tests:
  Run: `./tests/test-payloads.sh`
  Expected:
  - BMO's screen displays the correct status, harness label (top-left HUD), and scrolling parameters (bottom ticker).
  - Pressing BMO's red physical button opens/closes the Side Console Drawer displaying full parameters of the active tool/LLM event.
  - The drawer stays in position and BMO doesn't shift left or misalign.

- [ ] **Step 4: Commit verification script**
  ```bash
  git add tests/test-payloads.sh
  git commit -m "test: add manual verification payloads script"
  ```
