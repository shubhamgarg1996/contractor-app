async function api(path, opts = {}) {
  const isJson = opts.body && !(opts.body instanceof Blob || opts.body instanceof File || opts.body instanceof ArrayBuffer);
  const res = await fetch('/api' + path, {
    headers: {
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {})
    },
    ...opts
  });
  if (res.status === 401) {
    window.location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(window.location.pathname);
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
  list:      (qs = '') => api('/contractors' + (qs ? '?' + qs : '')),
  get:       (id)      => api('/contractors/' + encodeURIComponent(id)),
  create:    (data)    => api('/contractors',  { method: 'POST', body: JSON.stringify(data) }),
  update:    (id, d)   => api('/contractors/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(d) }),
  remove:    (id)      => api('/contractors/' + encodeURIComponent(id), { method: 'DELETE' }),
  vendors:   ()        => api('/vendors'),
  entities:  ()        => api('/entities'),
  dashboard: ()        => api('/dashboard'),
  audit:     (id)      => api('/audit/' + encodeURIComponent(id)),
  importFile: (file)   => fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file
  }).then(async r => {
    if (r.status === 401) {
      window.location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(window.location.pathname);
      return null;
    }
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  })
};
