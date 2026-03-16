import * as api from '../../data/api.js';
import * as notifications from '../../ui/notifications.js';
import { el } from '../../utils/utility.js';
import { sanitize } from '../../utils/security.js';

export function renderActiveCallsView() {
  const root = el('section', 'view');
  root.innerHTML = `
    <h2 class="section-title">Active Calls</h2>
    <div class="panel-row two">
      <div>
        <table>
          <thead><tr><th>Customer</th><th>Funnel</th><th>Stage</th><th>Status</th><th>Duration</th><th>Actions</th></tr></thead>
          <tbody id="activeCallsBody"></tbody>
        </table>
      </div>
      <div>
        <h3>Live transcript</h3>
        <lr-transcript id="transcriptBox"></lr-transcript>
        <lr-audio-player></lr-audio-player>
      </div>
    </div>
  `;

  const tbody = root.querySelector('#activeCallsBody');
  const transcriptBox = root.querySelector('#transcriptBox');
  let selectedCallId = null;
  let timer;

  async function loadCalls() {
    const rows = await api.getActiveCalls();
    const list = Array.isArray(rows) ? rows : rows.items || [];
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No records found</td></tr>';
      selectedCallId = null;
      return;
    }

    tbody.innerHTML = list
      .map(
        (call) => `
      <tr>
        <td>${sanitize(String(call.customer || ''))}</td>
        <td>${sanitize(String(call.funnel || ''))}</td>
        <td>${sanitize(String(call.stage || ''))}</td>
        <td><span class="badge ok">${sanitize(String(call.status || ''))}</span></td>
        <td>${sanitize(String(call.durationSec || 0))}s</td>
        <td>
          <button class="ghost" data-open="${sanitize(String(call.id || ''))}">Transcript</button>
          <button class="warn" data-hangup="${sanitize(String(call.id || ''))}">Hang up</button>
        </td>
      </tr>`
      )
      .join('');

    if (!selectedCallId && list[0]) {
      selectedCallId = list[0].id;
    }
  }

  async function loadTranscript() {
    if (!selectedCallId) {
      transcriptBox.textContent = 'No active call selected.';
      return;
    }
    const transcript = await api.getTranscript(selectedCallId);
    transcriptBox.textContent = (transcript.lines || []).map((line) => sanitize(String(line))).join('\n');
  }

  tbody.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.dataset.open) {
      selectedCallId = target.dataset.open;
      await loadTranscript();
      return;
    }
    if (target.dataset.hangup) {
      await api.hangupCall(target.dataset.hangup);
      notifications.show({ type: 'warning', message: `Call ${sanitize(target.dataset.hangup)} ended` });
      await loadCalls();
      await loadTranscript();
    }
  });

  void loadCalls().then(loadTranscript);
  timer = setInterval(loadTranscript, 2000);

  return {
    element: root,
    cleanup: () => clearInterval(timer),
  };
}
