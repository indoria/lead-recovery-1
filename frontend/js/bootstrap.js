import * as security from './utils/security.js';
import * as storage from './storage.js';
import * as state from './state.js';
import * as events from './events.js';
import * as i18n from './utils/i18n.js';
import * as auth from './auth.js';
import * as http from './http.js';
import * as cache from './data/cache.js';
import * as telemetry from './utils/telemetry.js';
import * as router from './router.js';
import * as ui from './ui/component-system.js';
import * as notifications from './ui/notifications.js';

import { renderDashboardView } from './views/dashboard.view.js';
import { renderCustomersView } from './views/customers.view.js';
import { renderCustomerDetailView } from './views/customer-detail.view.js';
import { renderFunnelsView } from './views/funnels.view.js';
import { renderFunnelEditorView } from './views/funnel-editor.view.js';
import { renderActiveCallsView } from './views/calls/active-calls.view.js';
import { renderCallLogView } from './views/calls/call-log.view.js';
import { renderMakeCallView } from './views/calls/make-call.view.js';
import { renderAgentsView } from './views/agents.view.js';
import { renderAnalyticsView } from './views/analytics.view.js';
import { renderLogsView } from './views/logs.view.js';
import { renderAccountView } from './views/account.view.js';
import { renderSettingsView } from './views/settings.view.js';
import { renderLoginView } from './views/login.view.js';

const THEME_STORAGE_KEY = 'lr.theme';

function parseTabFromHash(hash) {
  if (hash.startsWith('#/customers')) return 'customers';
  if (hash.startsWith('#/funnels')) return 'funnels';
  if (hash.startsWith('#/calls')) return 'calls';
  if (hash.startsWith('#/agents')) return 'agents';
  if (hash.startsWith('#/analytics')) return 'analytics';
  if (hash.startsWith('#/settings')) return 'settings';
  if (hash.startsWith('#/account')) return 'account';
  return 'dashboard';
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getCurrentTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  return explicit || getSystemTheme();
}

function applyTheme(theme, persist = true) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
    state.dispatch({ type: 'nav.set', payload: { theme } });
    if (persist) {
      storage.set(THEME_STORAGE_KEY, theme, 'local');
    }
    return;
  }

  document.documentElement.removeAttribute('data-theme');
  state.dispatch({ type: 'nav.set', payload: { theme: getSystemTheme() } });
  if (persist) {
    storage.remove(THEME_STORAGE_KEY, 'local');
  }
}

function syncThemeButtonLabel() {
  const button = document.getElementById('themeToggleBtn');
  if (!button) {
    return;
  }
  const current = getCurrentTheme();
  const next = current === 'light' ? 'dark' : 'light';
  button.textContent = `Theme: ${current}`;
  button.setAttribute('aria-label', `Switch to ${next} theme`);
  button.title = `Switch to ${next}`;
}

function bindHeaderControls() {
  syncThemeButtonLabel();

  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const current = getCurrentTheme();
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next, true);
    syncThemeButtonLabel();
  });

  document.getElementById('helpBtn')?.addEventListener('click', () => {
    notifications.show({ type: 'info', message: 'Help center is coming in next iteration.' });
  });

  document.getElementById('logoutHeaderBtn')?.addEventListener('click', () => {
    auth.logout();
    window.location.hash = '#/login';
  });
}

function bindActivityBar() {
  document.querySelectorAll('#activityBar .activity-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const path = button.getAttribute('data-path');
      const tab = button.getAttribute('data-tab') || 'dashboard';
      state.dispatch({ type: 'nav.set', payload: { activeTab: tab } });
      if (path) {
        window.location.hash = path;
      }
    });
  });
}

function updateStatusBar() {
  const target = document.getElementById('statusRole');
  if (!target) {
    return;
  }
  const role = state.get('auth.role') || 'guest';
  target.textContent = role;
}

function updateNavChrome() {
  const activeTab = parseTabFromHash(window.location.hash || '#/');

  state.dispatch({ type: 'nav.set', payload: { activeTab } });

  document.querySelectorAll('#activityBar .activity-btn').forEach((button) => {
    const buttonTab = button.getAttribute('data-tab');
    button.classList.toggle('active', buttonTab === activeTab);
  });

  document.querySelectorAll('#sidePanel .side-section').forEach((section) => {
    const sectionTab = section.getAttribute('data-tab');
    section.classList.toggle('active', sectionTab === activeTab);
  });

  const currentHash = window.location.hash || '#/';
  document.querySelectorAll('#sidePanel .side-link').forEach((link) => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === currentHash);
  });

  updateStatusBar();
}

function buildRoutes() {
  return [
    { path: '#/', render: renderDashboardView, requiresAuth: true },
    { path: '#/customers', render: renderCustomersView, requiresAuth: true },
    { path: '#/customers/:id', render: renderCustomerDetailView, requiresAuth: true },
    { path: '#/funnels', render: renderFunnelsView, requiresAuth: true },
    { path: '#/funnels/:id/editor', render: renderFunnelEditorView, requiresAuth: true, roles: ['admin'] },
    { path: '#/calls/active', render: renderActiveCallsView, requiresAuth: true },
    { path: '#/calls/log', render: renderCallLogView, requiresAuth: true },
    { path: '#/calls/make', render: renderMakeCallView, requiresAuth: true, roles: ['admin', 'sales_manager'] },
    { path: '#/agents', render: renderAgentsView, requiresAuth: true, roles: ['admin'] },
    { path: '#/analytics', render: renderAnalyticsView, requiresAuth: true },
    { path: '#/analytics/logs', render: renderLogsView, requiresAuth: true },
    { path: '#/account', render: renderAccountView, requiresAuth: true },
    { path: '#/settings/:section', render: renderSettingsView, requiresAuth: true, roles: ['admin'] },
    { path: '#/login', render: renderLoginView, requiresAuth: false },
  ];
}

function resolveApiBaseUrl() {
  return `https://verbose-broccoli-q6grrx4p95f49j5-3000.app.github.dev/api`;
}

async function start() {
  security.init();
  storage.init();

  const savedTheme = storage.get(THEME_STORAGE_KEY, 'local');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    applyTheme(savedTheme, false);
  } else {
    applyTheme('auto', false);
  }

  state.init();
  events.init();
  await i18n.init('en');
  auth.init();
  const apiBaseUrl = resolveApiBaseUrl();
  http.init(apiBaseUrl);
  cache.init();
  telemetry.init(`${apiBaseUrl}/telemetry`);
  ui.init();
  notifications.init();

  bindHeaderControls();
  bindActivityBar();
  updateNavChrome();

  router.init(buildRoutes(), document.getElementById('mainContent'));

  window.addEventListener('hashchange', () => {
    updateNavChrome();
  });

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (!storage.get(THEME_STORAGE_KEY, 'local')) {
      applyTheme('auto', false);
      syncThemeButtonLabel();
    }
  });

  updateStatusBar();
}

void start();
