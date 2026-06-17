const assert = require('assert');
const { readFileSync } = require('fs');

console.log('Running power button unit tests...');

const html = readFileSync('app/frontend/index.html', 'utf8');
assert.match(
  html,
  /<button\b[^>]*id="btn-power"[^>]*aria-label="Power off this session"[^>]*>/,
  'power control must be an accessible button'
);
