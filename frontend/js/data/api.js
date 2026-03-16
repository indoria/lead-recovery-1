import * as http from '../http.js';

const fallback = {
  summary: {
    today: { total: 0, answered: 0, recovered: 0, escalated: 0, failed: 0 },
    weeklyRate: 0,
    pendingEscalations: 0,
    pendingObjections: 0,
    apiLatencyMs: 0,
    uptime: 0,
    recent: [],
  },
  customers: [],
  funnels: [],
  activeCalls: [],
  callLog: [],
  agents: [],
  analytics: {
    series: [],
    outcomes: { recovered: 0, failed: 0, escalated: 0 },
    objections: {},
    dropoff: {},
    topLeads: [],
  },
};

async function tryFetch(primary, backup) {
  try {
    return await primary();
  } catch {
    return backup;
  }
}

function normalizeSummaryResponse(raw) {
  if (!raw || typeof raw !== 'object') {
    return fallback.summary;
  }

  const container = raw.summary && typeof raw.summary === 'object' ? raw.summary : raw;
  const callsTotal = Number(container.callsTotal ?? container.total ?? 0);
  const callsRecovered = Number(container.callsRecovered ?? container.recovered ?? 0);
  const callsEscalated = Number(container.callsEscalated ?? container.escalated ?? 0);
  const callsFailed = Number(container.callsFailed ?? container.failed ?? 0);
  const conversionRate = Number(container.conversionRate ?? 0);
  const avgCallDuration = Number(container.avgCallDuration ?? 0);

  return {
    today: {
      total: callsTotal,
      answered: Number(container.callsAnswered ?? callsTotal),
      recovered: callsRecovered,
      escalated: callsEscalated,
      failed: callsFailed,
    },
    weeklyRate: conversionRate,
    pendingEscalations: Number(container.pendingEscalations ?? callsEscalated),
    pendingObjections: Number(container.pendingObjections ?? container.objectionsEncountered ?? 0),
    apiLatencyMs: Number(container.apiLatencyMs ?? 0),
    uptime: Number(container.uptime ?? 0),
    recent: Array.isArray(container.recent) ? container.recent : [],
    avgCallDuration,
  };
}

export function getSummary() {
  return tryFetch(async () => normalizeSummaryResponse(await http.get('/analytics/summary')), fallback.summary);
}

export function getCustomers() {
  return tryFetch(() => http.get('/customers'), fallback.customers);
}

export function getFunnels() {
  return tryFetch(() => http.get('/funnels'), fallback.funnels);
}

export function saveFunnel(id, payload) {
  return tryFetch(() => http.put(`/funnels/${id}`, payload), { ok: true });
}

export function getActiveCalls() {
  return tryFetch(() => http.get('/calls/active'), fallback.activeCalls);
}

export function getTranscript(callId) {
  return tryFetch(() => http.get(`/calls/${callId}/transcript`, { skipCache: true }), { lines: [] });
}

export function hangupCall(callId) {
  return tryFetch(() => http.post(`/calls/${callId}/hang-up`, {}), { ok: true });
}

export function getCallLog() {
  return tryFetch(() => http.get('/calls/log'), fallback.callLog);
}

export function makeCall(payload) {
  return tryFetch(() => http.post('/calls/manual', payload), { id: `call-${Date.now()}`, status: 'queued' });
}

export function getAgents() {
  return tryFetch(() => http.get('/agents'), fallback.agents);
}

export function saveAgent(payload) {
  return tryFetch(() => http.post('/agents', payload), { ok: true, id: `ag-${Date.now()}` });
}

export function getAnalytics(range) {
  return tryFetch(() => http.get(`/analytics?range=${encodeURIComponent(range || '30d')}`), fallback.analytics);
}

export function getTopLeads() {
  return tryFetch(() => http.get('/analytics/leads/top'), fallback.analytics.topLeads);
}

export function testIntegration(id) {
  return tryFetch(() => http.post(`/integrations/${id}/test`, {}), { ok: true });
}

export function uploadLeads(formData) {
  return tryFetch(
    () =>
      fetch('/api/leads/import', {
        method: 'POST',
        body: formData,
      }).then((res) => res.json()),
    { ok: true, imported: 0 }
  );
}
