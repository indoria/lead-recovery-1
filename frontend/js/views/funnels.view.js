import * as api from '../data/api.js';
import * as notifications from '../ui/notifications.js';
import { el } from '../utils/utility.js';
import { sanitize } from '../utils/security.js';

export function renderFunnelsView() {
  const root = el('section', 'view');
  root.innerHTML = `
    <h2 class="section-title">Products and Funnels</h2>
    <div id="funnelList"></div>
  `;

  const list = root.querySelector('#funnelList');

  void api.getFunnels().then((funnels) => {
    const rows = Array.isArray(funnels) ? funnels : funnels.items || [];
    if (!rows.length) {
      list.innerHTML = '<p class="muted">No records found</p>';
      return;
    }

    list.innerHTML = rows
      .map(
        (funnel) => `
        <div class="metric" style="margin-bottom:10px;">
          <h3>${sanitize(String(funnel.product || ''))} - ${sanitize(String(funnel.name || ''))}</h3>
          <p class="muted">Stages: ${sanitize(Array.isArray(funnel.stages) ? funnel.stages.join(' -> ') : '')}</p>
          <div class="form-actions">
            <button data-editor="${sanitize(String(funnel.id || ''))}">Edit funnel</button>
            <button class="ghost" data-toggle="${sanitize(String(funnel.id || ''))}">${funnel.active ? 'Deactivate' : 'Activate'}</button>
          </div>
        </div>`
      )
      .join('');
  });

  list.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.dataset.editor) {
      window.location.hash = `#/funnels/${target.dataset.editor}/editor`;
      return;
    }
    if (target.dataset.toggle) {
      notifications.show({ type: 'info', message: `Toggled funnel ${sanitize(target.dataset.toggle)}` });
    }
  });

  return { element: root };
}
