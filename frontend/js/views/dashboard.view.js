import * as api from '../data/api.js';
import { el, formatPercent } from '../utils/utility.js';
import { sanitize } from '../utils/security.js';

function makeMetric(label, value, trend) {
  const card = document.createElement('lr-metric-card');
  card.setAttribute('label', label);
  card.setAttribute('value', String(value));
  card.setAttribute('trend', trend || '');
  return card;
}

export function renderDashboardView() {
  const root = el('section', 'view dashboard-view');
  const metrics = el('div', 'grid-cards');
  const body = el('div', 'dashboard-grid');
  const feed = el('div', 'metric');
  const health = el('div', 'metric');

  root.append(el('h2', 'section-title', 'Dashboard'));
  root.append(metrics);
  body.append(feed, health);
  root.append(body);

  let timer;

  async function load() {
    const summary = await api.getSummary();
    metrics.replaceChildren(
      makeMetric('Total calls', summary.today.total),
      makeMetric('Answered', summary.today.answered),
      makeMetric('Recovered', summary.today.recovered, formatPercent(summary.weeklyRate)),
      makeMetric('Escalated', summary.today.escalated),
      makeMetric('Failed', summary.today.failed)
    );

    const recent = Array.isArray(summary.recent) ? summary.recent : [];
    if (!recent.length) {
      feed.innerHTML = '<h3>Recent activity</h3><p class="muted">No records found</p>';
    } else {
      feed.innerHTML = `<h3>Recent activity</h3><ul>${recent.map((entry) => `<li>${sanitize(entry)}</li>`).join('')}</ul>`;
    }
    health.innerHTML = `<h3>System health</h3>
      <p class="muted">API latency: ${sanitize(String(summary.apiLatencyMs))} ms</p>
      <p class="muted">Uptime: ${sanitize(String(summary.uptime))}%</p>
      <p>Pending escalations: <lr-badge tone="warn">${sanitize(String(summary.pendingEscalations))}</lr-badge></p>
      <p>Pending objections: <lr-badge tone="warn">${sanitize(String(summary.pendingObjections))}</lr-badge></p>`;
  }

  void load();
  timer = setInterval(load, 30000);

  return {
    element: root,
    cleanup: () => clearInterval(timer),
  };
}
