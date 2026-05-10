async function api(path, opts = {}) {
  const isJson = opts.body && !(opts.body instanceof Blob || opts.body instanceof File || opts.body instanceof ArrayBuffer);
  const res = await fetch('/api' + path, {
    headers: {
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {})
    },
    credentials: 'same-origin',
    ...opts
  });
  if (res.status === 401) {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  if (res.status === 204) return null;
  return res;
}

export const Api = {
  // Auth
  me:             ()                    => api('/auth/me'),
  login:          (email, password)     => api('/auth/login',           { method:'POST', body: JSON.stringify({ email, password }) }),
  logout:         ()                    => api('/auth/logout',          { method:'POST' }),
  changePassword: (oldPassword, newPassword) => api('/auth/change-password', { method:'POST', body: JSON.stringify({ oldPassword, newPassword }) }),
  bootstrap:      (email, password, displayName) => api('/auth/bootstrap', { method:'POST', body: JSON.stringify({ email, password, displayName }) }),

  // User management (Admin)
  listUsers:     ()             => api('/users'),
  createUser:    (data)         => api('/users',  { method:'POST', body: JSON.stringify(data) }),
  updateUser:    (email, data)  => api('/users/' + encodeURIComponent(email), { method:'PUT', body: JSON.stringify(data) }),
  resetUserPwd:  (email)        => api('/users/' + encodeURIComponent(email) + '/reset-password', { method:'POST' }),

  // Contractors
  list:      (qs = '')  => api('/contractors' + (qs ? '?' + qs : '')),
  get:       (id)       => api('/contractors/' + encodeURIComponent(id)),
  create:    (data)     => api('/contractors',  { method: 'POST', body: JSON.stringify(data) }),
  update:    (id, d)    => api('/contractors/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(d) }),
  remove:    (id)       => api('/contractors/' + encodeURIComponent(id), { method: 'DELETE' }),
  vendors:   ()         => api('/vendors'),
  entities:  ()         => api('/entities'),
  // Masters management
  vendorsAll:    ()           => api('/vendors?includeInactive=true'),
  createVendor:  (name)       => api('/vendors',  { method:'POST', body: JSON.stringify({ vendorName: name }) }),
  updateVendor:  (id, data)   => api('/vendors/' + id, { method:'PUT', body: JSON.stringify(data) }),
  entitiesAll:   ()           => api('/entities?includeInactive=true'),
  createEntity:  (name)       => api('/entities', { method:'POST', body: JSON.stringify({ entityName: name }) }),
  updateEntity:  (id, data)   => api('/entities/' + id, { method:'PUT', body: JSON.stringify(data) }),
  dashboard: ()         => api('/dashboard'),
  audit:     (id)       => api('/audit/' + encodeURIComponent(id)),
  importFile: (file)    => fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
    credentials: 'same-origin'
  }).then(async r => {
    if (r.status === 401) {
      window.location.href = '/login';
      return null;
    }
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  })
};
