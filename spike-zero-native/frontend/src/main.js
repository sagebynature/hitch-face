import './style.css';

const expressionEl = document.getElementById('expression');
const face = document.getElementById('face');
const happy = document.getElementById('happy');
const busy = document.getElementById('busy');

let current = '';

function render(expression) {
  if (!expression || expression === current) return;
  current = expression;
  expressionEl.textContent = expression;
  face.className = 'face';
  if (expression.includes('error')) face.classList.add('error');
  else if (expression.includes('tool') || expression.includes('llm') || expression.includes('busy')) face.classList.add('busy');
  else if (expression.includes('completed') || expression.includes('happy')) face.classList.add('happy');
}

async function invoke(command, payload = {}) {
  if (!window.zero?.invoke) throw new Error('zero-native bridge unavailable');
  return window.zero.invoke(command, payload);
}

async function poll() {
  try {
    const result = await invoke('hitch.nextExpression');
    render(result.expression);
  } catch (error) {
    expressionEl.textContent = `bridge error: ${error.code || error.message}`;
  }
}

happy.addEventListener('click', () => invoke('hitch.setExpression', { expression: 'happy.completed' }).then(poll));
busy.addEventListener('click', () => invoke('hitch.setExpression', { expression: 'tool.requested' }).then(poll));

setInterval(poll, 250);
poll();
