import * as api from '../data/api.js';
import * as notifications from '../ui/notifications.js';
import { collectFormValues } from '../ui/forms.js';
import { el } from '../utils/utility.js';
import { sanitize } from '../utils/security.js';

export function renderAgentsView() {
  const root = el('section', 'view');
  root.innerHTML = `
    <h2 class="section-title">Agents</h2>
    <div id="agentList"></div>
    <h3>Create persona</h3>
    <form id="agentForm">
      <label>Name</label><input name="name" />
      <label>Language</label><input name="language" value="en-IN" />
      <label>Voice ID</label><input name="voiceId" />
      <div class="form-actions"><button type="submit">Save Agent</button></div>
    </form>
  `;

  const list = root.querySelector('#agentList');
  const form = root.querySelector('#agentForm');

  function renderAgents(rows) {
    if (!rows.length) {
      list.innerHTML = '<p class="muted">No records found</p>';
      return;
    }

    list.innerHTML = rows
      .map(
        (agent) => `
        <div class="agent-card">
          <h3>${sanitize(String(agent.name || ''))}</h3>
          <p class="muted">${sanitize(String(agent.language || ''))} - ${sanitize(String(agent.voiceId || ''))}</p>
          <p>Calls: ${sanitize(String(agent.calls || 0))} | Avg score: ${sanitize(String(Math.round((agent.avgScore || 0) * 100)))}% | Escalation rate: ${sanitize(String(Math.round((agent.escalationRate || 0) * 100)))}%</p>
          <button class="ghost" data-test="${sanitize(String(agent.id || ''))}">Test voice</button>
        </div>`
      )
      .join('');
  }

  void api.getAgents().then((rows) => {
    const listRows = Array.isArray(rows) ? rows : rows.items || [];
    renderAgents(listRows);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = collectFormValues(form);
    await api.saveAgent(values);
    notifications.show({ type: 'success', message: 'Agent saved' });
  });

  list.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement && target.dataset.test) {
      notifications.show({ type: 'info', message: `Playing sample for ${sanitize(target.dataset.test)}` });
    }
  });

  return { element: root };
}
