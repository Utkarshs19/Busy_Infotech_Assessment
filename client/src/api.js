const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, { method = 'GET', body, params } = {}) {
  let url = `${BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    ).toString();
    if (qs) url += `?${qs}`;
  }
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = isJson && data && data.error ? data.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),
  listUsers: () => request('/auth/users'),
  createUser: (payload) => request('/auth/users', { method: 'POST', body: payload }),

  listMenu: (includeArchived) => request('/menu-items', { params: { includeArchived } }),
  createMenuItem: (payload) => request('/menu-items', { method: 'POST', body: payload }),
  updateMenuItem: (id, payload) => request(`/menu-items/${id}`, { method: 'PATCH', body: payload }),
  archiveMenuItem: (id) => request(`/menu-items/${id}/archive`, { method: 'POST' }),
  unarchiveMenuItem: (id) => request(`/menu-items/${id}/unarchive`, { method: 'POST' }),
  bulkMenuUpdate: (payload) => request('/menu-items/bulk', { method: 'POST', body: payload }),

  listOrders: (params) => request('/orders', { params }),
  myOrders: () => request('/orders/mine'),
  getOrder: (id) => request(`/orders/${id}`),
  createOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
  setOrderStatus: (id, to) => request(`/orders/${id}/status`, { method: 'POST', body: { to } }),
  cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: 'POST' }),
  archiveOrder: (id) => request(`/orders/${id}/archive`, { method: 'POST' }),
  unarchiveOrder: (id) => request(`/orders/${id}/unarchive`, { method: 'POST' }),
  addLine: (id, payload) => request(`/orders/${id}/lines`, { method: 'POST', body: payload }),
  voidLine: (id, lineId, reason) => request(`/orders/${id}/lines/${lineId}/void`, { method: 'POST', body: { reason } }),
  addCollaborator: (id, userId) => request(`/orders/${id}/collaborators`, { method: 'POST', body: { userId } }),
  addNote: (id, note) => request(`/orders/${id}/notes`, { method: 'POST', body: { note } }),
  alerts: () => request('/orders/alerts'),
  ackAlert: (id) => request(`/orders/${id}/alerts/ack`, { method: 'POST' }),
  exportCsvUrl: () => {
    const token = getToken();
    return `${BASE}/orders/export/csv?token=${encodeURIComponent(token || '')}`;
  },

  dashboard: () => request('/dashboard'),
};

export { getToken };
