import * as api from '../data/api.js';
import { formatPercent, el } from '../utils/utility.js';
import { sanitize } from '../utils/security.js';

function drawBars(canvas, values, color) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const entries = Object.entries(values);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  const barWidth = Math.floor(width / entries.length) - 16;
  entries.forEach(([label, value], idx) => {
    const x = idx * (barWidth + 16) + 8;
    const h = Math.round((value / max) * (height - 30));
    ctx.fillStyle = color;
    ctx.fillRect(x, height - h - 22, barWidth, h);
    ctx.fillStyle = '#d5e7f3';
    ctx.font = '12px Barlow';
    ctx.fillText(label, x, height - 6);
  });
}

function drawLine(canvas, series, color) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (series.length === 0) {
    return;
  }
  const max = Math.max(...series, 1);
  const step = width / (series.length - 1 || 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((point, idx) => {
    const x = idx * step;
    const y = height - (point / max) * (height - 20) - 10;
    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

export function renderAnalyticsView() {
  const root = el('section', 'view');
  root.innerHTML = `
    <h2 class="section-title">Analytics</h2>
    <div class="form-actions">
      <select id="rangeSelect">
        <option value="7d">Last 7 days</option>
        <option value="30d" selected>Last 30 days</option>
        <option value="90d">Last 90 days</option>
      </select>
    </div>
    <div id="kpis" class="grid-cards" style="margin-top: 10px;"></div>
    <div class="chart-grid" style="margin-top: 12px;">
      <div class="chart-box"><h3>Conversion trend</h3><canvas id="lineChart" width="420" height="180"></canvas></div>
      <div class="chart-box"><h3>Outcomes</h3><canvas id="barChart" width="420" height="180"></canvas></div>
    </div>
    <h3>Top leads</h3>
    <table>
      <thead><tr><th>Lead</th><th>Probability</th></tr></thead>
      <tbody id="topLeadsBody"></tbody>
    </table>
  `;

  const rangeSelect = root.querySelector('#rangeSelect');
  const kpis = root.querySelector('#kpis');
  const lineChart = root.querySelector('#lineChart');
  const barChart = root.querySelector('#barChart');
  const topLeadsBody = root.querySelector('#topLeadsBody');

  async function load() {
    const data = await api.getAnalytics(rangeSelect.value);
    const topLeads = await api.getTopLeads();
    const total = Object.values(data.outcomes).reduce((acc, n) => acc + n, 0);
    const conversionRate = total ? data.outcomes.recovered / total : 0;

    kpis.replaceChildren();
    const cards = [
      ['Total calls', total],
      ['Conversion', formatPercent(conversionRate)],
      ['Avg duration', '03:42'],
      ['Top objection', Object.keys(data.objections)[0] || 'n/a'],
    ];
    cards.forEach(([label, value]) => {
      const node = document.createElement('lr-metric-card');
      node.setAttribute('label', label);
      node.setAttribute('value', String(value));
      kpis.append(node);
    });

    drawLine(lineChart, data.series, '#f2a541');
    drawBars(barChart, data.outcomes, '#67b3f3');

    if (!topLeads.length) {
      topLeadsBody.innerHTML = '<tr><td colspan="2" class="muted">No records found</td></tr>';
      return;
    }

    topLeadsBody.innerHTML = topLeads
      .map((lead) => `<tr><td>${sanitize(String(lead.name || ''))}</td><td>${sanitize(String(Math.round((lead.probability || 0) * 100)))}%</td></tr>`)
      .join('');
  }

  rangeSelect.addEventListener('change', load);
  void load();

  return { element: root };
}
