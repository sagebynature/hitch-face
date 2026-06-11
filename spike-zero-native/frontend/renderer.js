const zeroNativeBridge = typeof window !== 'undefined' && window.zero && typeof window.zero.invoke === 'function' ? window.zero : null;

const container = typeof document !== 'undefined' ? document.getElementById('app-container') : null;
const sessionValue = typeof document !== 'undefined' ? document.getElementById('session-id-value') : null;
const statusLabel = typeof document !== 'undefined' ? document.querySelector('.status-label') : null;
const hudHeader = typeof document !== 'undefined' ? document.querySelector('.hud-header') : null;
const tickerWrap = typeof document !== 'undefined' ? document.querySelector('.ticker-wrap') : null;
const consoleContent = typeof document !== 'undefined' ? document.querySelector('.console-content') : null;
const screenConsoleContent = typeof document !== 'undefined' ? document.getElementById('screen-console-content') : null;
const consoleFooter = typeof document !== 'undefined' ? document.querySelector('.console-footer') : null;
const btnRed = typeof document !== 'undefined' ? document.querySelector('.btn-red') : null;
const screenTerminal = typeof document !== 'undefined' ? document.querySelector('.screen-terminal') : null;

let resetTimeout = null;
let consoleBuffer = [];
let appBufferSize = 500;

// Map Hitch event types to styling categories (states) and specific classes
const eventMap = {
  // Session Events
  'session.started': { state: 'state-session', className: 'expression-session-started', sticky: true },
  'session.resumed': { state: 'state-session', className: 'expression-session-resumed', sticky: true },
  'session.ended': { state: 'state-session', className: 'expression-session-ended', sticky: true },
  'session.compacted': { state: 'state-session', className: 'expression-session-compacted', duration: 3000 },

  // Turn Events
  'turn.started': { state: 'state-turn', className: 'expression-turn-started', sticky: true },
  'turn.user_prompt': { state: 'state-turn', className: 'expression-turn-user-prompt', sticky: true },
  'turn.assistant_started': { state: 'state-turn', className: 'expression-turn-assistant-started', sticky: true },
  'turn.assistant_completed': { state: 'state-turn', className: 'expression-turn-assistant-completed', duration: 4000 },
  'turn.completed': { state: 'state-turn', className: 'expression-turn-completed', duration: 2500 },

  // LLM Events
  'llm.requested': { state: 'state-llm', className: 'expression-llm-requested', sticky: true },
  'llm.completed': { state: 'state-llm', className: 'expression-llm-completed', duration: 2000 },

  // Tool Events
  'tool.requested': { state: 'state-tool', className: 'expression-tool-requested', sticky: true },
  'tool.permission_requested': { state: 'state-tool', className: 'expression-tool-permission-requested', sticky: true },
  'tool.completed': { state: 'state-tool', className: 'expression-tool-completed', duration: 2500 },
  'tool.progress': { state: 'state-tool', className: 'expression-tool-progress', sticky: true },

  // Retry Events
  'retry.started': { state: 'state-tool', className: 'expression-retry-started', sticky: true },
  'retry.completed': { state: 'state-tool', className: 'expression-retry-completed', duration: 2500 },

  // Subagent Events
  'subagent.started': { state: 'state-subagent', className: 'expression-subagent-started', sticky: true },
  'subagent.completed': { state: 'state-subagent', className: 'expression-subagent-completed', duration: 2500 },

  // Diagnostics
  'error.reported': { state: 'state-error', className: 'expression-error-reported', duration: 5000 }
};

// Web Audio API Sound Generator
let audioCtx = null;
let soundEnabled = true;

function playRobotSound(expr) {
  if (!soundEnabled) return;
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    if (expr === 'error.reported') {
      // Descending warning beep
      playBeep(now, 180, 100, 0.15, 'sawtooth');
      playBeep(now + 0.18, 140, 80, 0.2, 'sawtooth');
    } else if (expr === 'tool.permission_requested') {
      // Alert chime: high-low-high alert
      playBeep(now, 523.25, 523.25, 0.1, 'sine');
      playBeep(now + 0.12, 392.00, 392.00, 0.1, 'sine');
      playBeep(now + 0.24, 659.25, 659.25, 0.15, 'sine');
    } else if (expr.startsWith('session.')) {
      // Upward sweep
      playSweep(now, 200, 800, 0.25, 'triangle');
    } else if (expr.startsWith('tool.')) {
      // Click diagnostic chime
      playBeep(now, 600, 600, 0.04, 'square');
      playBeep(now + 0.08, 900, 900, 0.04, 'square');
    } else if (expr.startsWith('llm.')) {
      // Chirp
      playSweep(now, 1000, 600, 0.12, 'sine');
    } else if (expr === 'turn.user_prompt') {
      // Pop blip
      playSweep(now, 400, 600, 0.1, 'sine');
    } else if (expr === 'turn.assistant_completed') {
      // Success melody
      playBeep(now, 523.25, 523.25, 0.08, 'sine');
      playBeep(now + 0.08, 659.25, 659.25, 0.08, 'sine');
      playBeep(now + 0.16, 783.99, 783.99, 0.15, 'sine');
    } else {
      // Standard chirp
      playBeep(now, 600, 800, 0.08, 'sine');
    }
  } catch (err) {
    console.error('Failed to play audio:', err);
  }
}

function playBeep(time, startFreq, endFreq, duration, type = 'sine') {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, time);
  if (startFreq !== endFreq) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
  }

  // Keep volume moderate (0.05)
  gain.gain.setValueAtTime(0.05, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(time);
  osc.stop(time + duration);
}

function playSweep(time, startFreq, endFreq, duration, type = 'sine') {
  playBeep(time, startFreq, endFreq, duration, type);
}

// Reset to default idle standby state
function resetToIdle() {
  if (container) {
    const isDrawerOpen = container.classList.contains('drawer-open');
    container.className = 'state-idle';
    if (isDrawerOpen) {
      container.classList.add('drawer-open');
    }
  }
  // if (statusLabel) statusLabel.textContent = 'STANDBY';
}

function handleHitchEvent(envelope) {
  // Clear any pending transition timeouts
  if (resetTimeout) {
    clearTimeout(resetTimeout);
    resetTimeout = null;
  }

  const expr = envelope.hitch_event_type;
  const config = eventMap[expr];

  // Play robot sound
  playRobotSound(expr);

  // Extract and update metadata UI elements
  const metadata = extractMetadata(envelope);
  if (hudHeader) {
    hudHeader.textContent = metadata.hudText;
  }
  if (tickerWrap) {
    tickerWrap.textContent = metadata.tickerText;
  }
  if (consoleContent || screenConsoleContent) {
    const formattedLines = metadata.consoleText.split('\n').map(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex);
        const val = line.substring(colonIndex + 1);
        return `<span>${key}:</span>${val}`;
      }
      return line;
    });

    if (consoleBuffer.length > 0) {
      consoleBuffer.push('<br><span>---</span>');
    }
    consoleBuffer.push(...formattedLines);
    if (consoleBuffer.length > appBufferSize) {
      consoleBuffer = consoleBuffer.slice(-appBufferSize);
    }
    const formattedHtml = consoleBuffer.join('<br>');

    if (consoleContent) {
      consoleContent.innerHTML = formattedHtml;
      consoleContent.scrollTop = consoleContent.scrollHeight;
    }
    if (screenConsoleContent) {
      screenConsoleContent.innerHTML = formattedHtml;
      if (screenTerminal) screenTerminal.scrollTop = screenTerminal.scrollHeight;
    }
  }
  if (consoleFooter) {
    consoleFooter.textContent = `Status: ${metadata.event}`;
  }

  // Update expression classes and status label
  if (config) {
    const isDrawerOpen = container ? container.classList.contains('drawer-open') : false;
    if (container) {
      container.className = `${config.state} ${config.className}`;
      if (isDrawerOpen) {
        container.classList.add('drawer-open');
      }
    }
    if (statusLabel) {
      statusLabel.textContent = expr.replace('.', ' / ').toUpperCase();
    }

    // If the expression has a limited duration, set a timer to return to idle
    if (!config.sticky && config.duration) {
      resetTimeout = setTimeout(() => {
        resetToIdle();
      }, config.duration);
    }
  } else {
    // If unknown expression received, show it as generic raw state
    const isDrawerOpen = container ? container.classList.contains('drawer-open') : false;
    if (container) {
      container.className = 'state-idle';
      if (isDrawerOpen) {
        container.classList.add('drawer-open');
      }
    }
    if (statusLabel) {
      statusLabel.textContent = expr.toUpperCase().substring(0, 16);
    }
  }
}

let appColors = {};
let currentSessionId = null;

function applyHostConfig(config) {
  if (!config) return;
  if (config.ticker_speed_s !== undefined) {
    document.documentElement.style.setProperty('--ticker-speed', `${config.ticker_speed_s}s`);
  }
  if (config.buffer_size !== undefined) {
    appBufferSize = config.buffer_size;
  }
  if (config.colors) {
    appColors = config.colors;
  }
}

function initHostSession({ sessionId, harness }) {
  currentSessionId = sessionId;
  if (sessionValue) {
    sessionValue.textContent = sessionId;
  }

  if (harness && appColors[harness]) {
    const color = appColors[harness];
    document.documentElement.style.setProperty('--bmo-casing', color);
    document.documentElement.style.setProperty('--bmo-casing-dark', color);
    document.documentElement.style.setProperty('--bmo-casing-light', color);
  }
}

if (zeroNativeBridge) {
  (async () => {
    try {
      applyHostConfig(await zeroNativeBridge.invoke('hitch.getConfig'));
      initHostSession(await zeroNativeBridge.invoke('hitch.getSession'));
    } catch (err) {
      console.error('zero-native init failed:', err);
    }

    setInterval(async () => {
      try {
        const result = await zeroNativeBridge.invoke('hitch.nextEvents');
        const events = result && Array.isArray(result.events) ? result.events : [];
        for (const envelope of events) {
          handleHitchEvent(envelope);
        }
      } catch (err) {
        // Keep UI parity path quiet; bridge failures should not spam the face.
        console.error('zero-native event drain failed:', err);
      }
    }, 250);
  })();
}

// Bind red button click to toggle console drawer
async function setDrawerOpen(open) {
  if (!container) return;
  container.classList.toggle('drawer-open', open);
  if (document.body) {
    document.body.classList.toggle('drawer-open', open);
  }
  if (zeroNativeBridge) {
    try {
      await zeroNativeBridge.invoke('hitch.setDrawerOpen', { open });
    } catch (err) {
      console.warn('Failed to resize Hitch Face window for drawer state:', err);
    }
  }
}

if (btnRed) {
  btnRed.addEventListener('click', () => {
    setDrawerOpen(!container?.classList.contains('drawer-open'));
  });
}

const btnPower = typeof document !== 'undefined' ? document.getElementById('btn-power') : null;

// Bind blue triangle button to power down window for session
if (btnPower) {
  btnPower.addEventListener('click', () => {
    if (zeroNativeBridge) {
      zeroNativeBridge.invoke('hitch.closeSession').catch(() => {});
    }
  });
}

const btnSound = typeof document !== 'undefined' ? document.getElementById('btn-sound') : null;

// Bind sound button click to toggle sound on/off
if (btnSound) {
  btnSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (container) {
      if (soundEnabled) {
        container.classList.remove('sound-disabled');
        // Play a little confirmation blip if enabling
        try {
          if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          if (audioCtx.state === 'suspended') audioCtx.resume();
          playBeep(audioCtx.currentTime, 600, 800, 0.08, 'sine');
        } catch (e) {}
      } else {
        container.classList.add('sound-disabled');
      }
    }
  });
}

function extractMetadata(envelope) {
  if (!envelope) {
    return { harness: 'UNKNOWN', event: 'UNKNOWN', hudText: 'NO EVENT', tickerText: 'No event envelope', consoleText: '' };
  }

  const rawHarness = envelope.harness || 'unknown';
  const harness = rawHarness.toUpperCase();
  const eventType = envelope.hitch_event_type || 'unknown';
  const event = eventType.toUpperCase();
  const payload = envelope.payload || {};

  // --- HUD: event-contextual label (not harness) ---
  let hudText = event;

  // --- Ticker: event type + key params ---
  const tickerParts = [eventType];

  // --- Console: full payload dump via key-path flattening ---
  const consoleLines = [`event: ${eventType}`, `harness: ${rawHarness}`];

  function flattenObj(obj, prefix) {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) {
        flattenObj(v, path);
      } else {
        consoleLines.push(`${path}: ${Array.isArray(v) ? JSON.stringify(v) : String(v ?? '')}`);
      }
    }
  }
  if (Object.keys(payload).length > 0) flattenObj(payload, '');

  // --- Event-specific HUD + ticker enrichment ---
  if (eventType === 'tool.requested' || eventType === 'tool.completed') {
    const tool = payload.tool || {};
    if (tool.name) {
      hudText = `TOOL \u25b8 ${tool.name}`;
      tickerParts.push(`tool: ${tool.name}`);
    }
    if (tool.input && typeof tool.input === 'object') {
      for (const [k, v] of Object.entries(tool.input)) {
        const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
        tickerParts.push(`${k}: "${valStr}"`);
      }
    }
  } else if (eventType === 'llm.completed') {
    const llm = payload.llm || {};
    if (llm.finish_reason) {
      hudText = `LLM \u25b8 ${llm.finish_reason}`;
      tickerParts.push(`finish: ${llm.finish_reason}`);
    }
    if (llm.usage) {
      if (llm.usage.tokens !== undefined) tickerParts.push(`tokens: ${llm.usage.tokens}`);
      if (llm.usage.cost !== undefined) tickerParts.push(`cost: $${llm.usage.cost}`);
    }
  } else if (eventType === 'turn.user_prompt') {
    const turn = payload.turn || {};
    if (turn.prompt) {
      const short = turn.prompt.replace(/\r?\n/g, ' ');
      hudText = `PROMPT \u25b8 ${rawHarness.toUpperCase()}`;
      tickerParts.push(`prompt: "${short}"`);
    }
  } else if (eventType === 'llm.requested') {
    const llm = payload.llm || {};
    hudText = llm.model ? `LLM \u25b8 ${llm.model}` : 'LLM \u25b8 pending';
    if (llm.model) tickerParts.push(`model: ${llm.model}`);
  } else {
    // Default: category ▸ action
    const parts = eventType.split('.');
    hudText = parts.length >= 2
      ? `${parts[0].toUpperCase()} \u25b8 ${parts.slice(1).join('.')}`
      : event;
  }

  let tickerText = tickerParts.join(' | ');
  if (tickerText.length > 200) tickerText = tickerText.substring(0, 197) + '...';

  return { harness, event, hudText, tickerText, consoleText: consoleLines.join('\n') };
}

if (typeof module !== 'undefined') {
  module.exports = { extractMetadata };
}
