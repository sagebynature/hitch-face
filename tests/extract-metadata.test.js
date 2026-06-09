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
      hudText: 'TOOL \u25b8 grep_search',
      tickerText: 'tool.requested | tool: grep_search | query: "hitch_event_type"',
      consoleText: 'event: tool.requested\nharness: omp\ntool.name: grep_search\ntool.input.query: hitch_event_type'
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
      hudText: 'LLM \u25b8 stop',
      tickerText: 'llm.completed | finish: stop | tokens: 120 | cost: $0.0024',
      consoleText: 'event: llm.completed\nharness: codex\nllm.finish_reason: stop\nllm.usage.tokens: 120\nllm.usage.cost: 0.0024'
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
      hudText: 'PROMPT \u25b8 HERMES',
      tickerText: 'turn.user_prompt | prompt: "Explain quantum computing"',
      consoleText: 'event: turn.user_prompt\nharness: hermes\nturn.prompt: Explain quantum computing'
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
