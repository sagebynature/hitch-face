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
