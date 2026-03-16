import * as api from '../data/api.js';
import { search } from '../utils/search.js';
import * as notifications from '../ui/notifications.js';
import { el } from '../utils/utility.js';
import { sanitize } from '../utils/security.js';

function renderRows(tbody, records) {
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">No records found</td></tr>';
    return;
  }

  tbody.innerHTML = records
    .map(
      (row) => `
      <tr>
        <td>${sanitize(String(row.name || ''))}</td>
        <td>${sanitize(String(row.phone || ''))}</td>
        <td>${sanitize(String(row.status || ''))}</td>
        <td>${sanitize(String(Math.round((row.score || 0) * 100)))}%</td>
        <td>
          <button class="ghost" data-view="${sanitize(String(row.id || ''))}">View</button>
          <button data-call="${sanitize(String(row.phone || ''))}">Initiate Call</button>
        </td>
      </tr>`
    )
    .join('');
}

export function renderCustomersView() {
  const root = el('section', 'view');
  root.innerHTML = `
    <h2 class="section-title">Customers</h2>
    <div class="customers-tools">
      <lr-search-input id="searchInput"></lr-search-input>
      <select id="statusFilter">
        <option value="">All status</option>
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="cold">Cold</option>
      </select>
      <select id="pageSize">
        <option value="50">50 per page</option>
        <option value="25">25 per page</option>
      </select>
    </div>
    <div class="panel-row two" style="margin-top: 10px;">
      <div>
        <table>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Status</th><th>Score</th><th>Actions</th></tr>
          </thead>
          <tbody id="customerTableBody"></tbody>
        </table>
      </div>
      <div>
        <h3>Lead ingestion</h3>
        <lr-file-upload id="leadUpload"></lr-file-upload>
        <p class="muted">Accepted formats: CSV, JSON, XLSX up to 10 MB.</p>
      </div>
    </div>
  `;

  const tbody = root.querySelector('#customerTableBody');
  const searchInput = root.querySelector('#searchInput');
  const statusFilter = root.querySelector('#statusFilter');
  const leadUpload = root.querySelector('#leadUpload');
  let rows = [];
  let query = '';

  function applyFilters() {
    const bySearch = search(query, rows, ['name', 'phone', 'status']);
    const filtered = statusFilter.value ? bySearch.filter((row) => row.status === statusFilter.value) : bySearch;
    renderRows(tbody, filtered);
  }

  void api.getCustomers().then((result) => {
    rows = Array.isArray(result) ? result : result.items || [];
    applyFilters();
  });

  searchInput?.addEventListener('search.change', (event) => {
    query = event.detail;
    applyFilters();
  });

  statusFilter?.addEventListener('change', applyFilters);

  tbody?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (target.dataset.view) {
      window.location.hash = `#/customers/${target.dataset.view}`;
      return;
    }
    if (target.dataset.call) {
      notifications.show({ type: 'info', message: `Call queued for ${sanitize(target.dataset.call)}` });
    }
  });

  leadUpload?.addEventListener('file.selected', (event) => {
    const file = event.detail;
    if (!file) {
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notifications.persist({ type: 'error', message: 'File too large. Max size is 10 MB.' });
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    notifications.show({ type: 'info', message: `Uploading ${sanitize(file.name)}...` });
    void api.uploadLeads(formData)
      .then((result) => {
        const imported = result && typeof result.imported === 'number' ? result.imported : 0;
        notifications.show({ type: 'success', message: `Lead import complete. Imported: ${imported}` });
      })
      .catch(() => {
        notifications.persist({ type: 'error', message: 'Lead import failed. Try again.' });
      });
  });

  return { element: root };
}
