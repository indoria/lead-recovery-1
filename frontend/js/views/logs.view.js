import * as api from '../data/api.js';
import { el } from '../utils/utility.js';
import { sanitize } from '../utils/security.js';

function formatTimestamp(value) {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
}

function asText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function getMessage(entry) {
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : {};
  const message = payload.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return entry.eventName || '-';
}

function getLevel(entry) {
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : {};
  return asText(payload.level || entry.phase || 'info').toLowerCase();
}

function getModule(entry) {
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : {};
  return asText(payload.module || '-');
}

function createRow(entry) {
  const level = getLevel(entry);
  const levelClass = `log-level-${sanitize(level)}`;
  const message = getMessage(entry);
  return `
    <tr data-id="${sanitize(entry.id)}">
      <td>${sanitize(formatTimestamp(entry.occurredAt))}</td>
      <td><span class="log-level-chip ${levelClass}">${sanitize(level)}</span></td>
      <td>${sanitize(getModule(entry))}</td>
      <td>${sanitize(asText(entry.eventName || '-'))}</td>
      <td>${sanitize(asText(entry.category || '-'))}</td>
      <td>${sanitize(asText(entry.direction || '-'))}</td>
      <td class="log-message">${sanitize(message)}</td>
      <td class="muted">${sanitize(asText(entry.correlationId || '-'))}</td>
    </tr>
  `;
}

export function renderLogsView() {
  const root = el('section', 'view logs-view');
  root.innerHTML = `
    <h2 class="section-title">Logs</h2>
    <div class="form-actions logs-filters">
      <select id="logLevelFilter">
        <option value="">All levels</option>
        <option value="debug">debug</option>
        <option value="info">info</option>
        <option value="warn">warn</option>
        <option value="error">error</option>
        <option value="fatal">fatal</option>
      </select>
      <input id="logModuleFilter" type="text" placeholder="Module (e.g. escalation-service)" />
      <input id="logEventFilter" type="text" placeholder="Event name" />
      <select id="logCategoryFilter">
        <option value="">All categories</option>
        <option value="analytics">analytics</option>
        <option value="workflow">workflow</option>
        <option value="system-api">system-api</option>
        <option value="webhook">webhook</option>
        <option value="third-party-api">third-party-api</option>
      </select>
      <select id="logDirectionFilter">
        <option value="">All directions</option>
        <option value="inbound">inbound</option>
        <option value="outbound">outbound</option>
        <option value="internal">internal</option>
      </select>
      <input id="logSearchFilter" type="text" placeholder="Search text" />
      <input id="logFromFilter" type="datetime-local" />
      <input id="logToFilter" type="datetime-local" />
      <button id="logRefreshBtn" class="ghost">Refresh</button>
      <button id="logClearBtn" class="ghost">Clear filters</button>
    </div>
    <div class="log-toolbar muted">
      <span id="logCountLabel">0 rows</span>
      <span id="logLiveLabel">Live refresh every 2s</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Level</th>
          <th>Module</th>
          <th>Event</th>
          <th>Category</th>
          <th>Direction</th>
          <th>Message</th>
          <th>Correlation Id</th>
        </tr>
      </thead>
      <tbody id="logsBody"></tbody>
    </table>
  `;

  const levelFilter = root.querySelector('#logLevelFilter');
  const moduleFilter = root.querySelector('#logModuleFilter');
  const eventFilter = root.querySelector('#logEventFilter');
  const categoryFilter = root.querySelector('#logCategoryFilter');
  const directionFilter = root.querySelector('#logDirectionFilter');
  const searchFilter = root.querySelector('#logSearchFilter');
  const fromFilter = root.querySelector('#logFromFilter');
  const toFilter = root.querySelector('#logToFilter');
  const refreshBtn = root.querySelector('#logRefreshBtn');
  const clearBtn = root.querySelector('#logClearBtn');
  const logsBody = root.querySelector('#logsBody');
  const logCountLabel = root.querySelector('#logCountLabel');

  let pollingTimer = null;
  let previousFirstId = null;

  function toIsoFromDateTimeLocal(raw) {
    if (!raw) {
      return '';
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  function currentFilters() {
    return {
      limit: 200,
      level: levelFilter.value,
      module: moduleFilter.value.trim(),
      eventName: eventFilter.value.trim(),
      category: categoryFilter.value,
      direction: directionFilter.value,
      search: searchFilter.value.trim(),
      from: toIsoFromDateTimeLocal(fromFilter.value),
      to: toIsoFromDateTimeLocal(toFilter.value),
    };
  }

  function renderRows(items) {
    if (!Array.isArray(items) || items.length === 0) {
      logsBody.innerHTML = '<tr><td colspan="8" class="muted">No logs found</td></tr>';
      logCountLabel.textContent = '0 rows';
      return;
    }

    logsBody.innerHTML = items.map((entry) => createRow(entry)).join('');
    logCountLabel.textContent = `${items.length} rows`;
  }

  async function loadAndRender(forceRender = false) {
    const response = await api.getLogs(currentFilters());
    const rows = Array.isArray(response.items) ? response.items : [];
    const firstId = rows[0]?.id || null;
    if (forceRender || firstId !== previousFirstId) {
      renderRows(rows);
      previousFirstId = firstId;
    }
  }

  async function handleRefresh(forceRender = true) {
    try {
      await loadAndRender(forceRender);
    } catch {
      logsBody.innerHTML = '<tr><td colspan="8" class="muted">Failed to load logs</td></tr>';
    }
  }

  function bindFilterInput(element, eventName = 'change') {
    element.addEventListener(eventName, () => {
      previousFirstId = null;
      void handleRefresh(true);
    });
  }

  bindFilterInput(levelFilter);
  bindFilterInput(moduleFilter, 'input');
  bindFilterInput(eventFilter, 'input');
  bindFilterInput(categoryFilter);
  bindFilterInput(directionFilter);
  bindFilterInput(searchFilter, 'input');
  bindFilterInput(fromFilter);
  bindFilterInput(toFilter);

  refreshBtn.addEventListener('click', () => {
    previousFirstId = null;
    void handleRefresh(true);
  });

  clearBtn.addEventListener('click', () => {
    levelFilter.value = '';
    moduleFilter.value = '';
    eventFilter.value = '';
    categoryFilter.value = '';
    directionFilter.value = '';
    searchFilter.value = '';
    fromFilter.value = '';
    toFilter.value = '';
    previousFirstId = null;
    void handleRefresh(true);
  });

  void handleRefresh(true);
  pollingTimer = window.setInterval(() => {
    void handleRefresh(false);
  }, 2000);

  return {
    element: root,
    cleanup: () => {
      if (pollingTimer !== null) {
        window.clearInterval(pollingTimer);
      }
    },
  };
}
