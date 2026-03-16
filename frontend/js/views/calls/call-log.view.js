import * as api from '../../data/api.js';
import { el } from '../../utils/utility.js';
import { sanitize } from '../../utils/security.js';

export function renderCallLogView() {
  const root = el('section', 'view');
  root.innerHTML = `
    <h2 class="section-title">Call Log</h2>
    <div class="form-actions">
      <button id="exportCsvBtn" class="ghost">Export CSV</button>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Customer</th><th>Outcome</th><th>Stage</th></tr></thead>
      <tbody id="callLogBody"></tbody>
    </table>
  `;

  const tbody = root.querySelector('#callLogBody');
  const exportCsvBtn = root.querySelector('#exportCsvBtn');

  void api.getCallLog().then((rows) => {
    const list = Array.isArray(rows) ? rows : rows.items || [];
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No records found</td></tr>';
      return;
    }

    tbody.innerHTML = list
      .map((row) => `<tr><td>${sanitize(new Date(row.at).toLocaleString())}</td><td>${sanitize(String(row.customer || ''))}</td><td>${sanitize(String(row.outcome || ''))}</td><td>${sanitize(String(row.stage || ''))}</td></tr>`)
      .join('');
  });

  exportCsvBtn.addEventListener('click', () => {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 86400000).toISOString();
    const to = now.toISOString();
    window.open(`/api/calls/export?format=csv&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, '_blank');
  });

  return { element: root };
}
