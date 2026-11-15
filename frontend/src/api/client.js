const BASE = "/api";
function authHeaders() {
  const token = localStorage.getItem("autofiverrToken");

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with ${res.status}`);
  }
  return res.json();
}

async function handleBlob(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with ${res.status}`);
  }
  return res.blob();
}

export const api = {
  signup: (data) =>
    fetch(`${BASE}/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then(handle),

  login: (data) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then(handle),

  
  verifyEmail: (token) =>
    fetch(`${BASE}/auth/verify-email/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }).then(handle),

  resendVerification: (data) =>
    fetch(`${BASE}/auth/resend-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then(handle),


    forgotPassword: (data) =>
  fetch(`${BASE}/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  }).then(handle),

resetPassword: (token, data) =>
  fetch(`${BASE}/auth/reset-password/${token}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  }).then(handle),

  changePassword: (data) =>
    fetch(`${BASE}/auth/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).then(handle),

  deleteProject: (id) =>
  fetch(`${BASE}/projects/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then(handle),

  rerunProject: (id) =>
  fetch(`${BASE}/projects/${id}/rerun`, {
    method: "POST",
    headers: authHeaders(),
  }).then(handle),
  
  listAgencies: () => fetch(`${BASE}/agencies`).then(handle),

  getAgency: (slug) =>
  fetch(`${BASE}/agencies/${slug}`).then(handle),
  
  listProjects: () =>
  fetch(`${BASE}/projects`, {
    headers: authHeaders(),
  }).then(handle),

  getProject: (id) =>
  fetch(`${BASE}/projects/${id}`, {
    headers: authHeaders(),
  }).then(handle),

  createProject: (formData) =>
  fetch(`${BASE}/projects`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  }).then(handle),

  streamProjectLogs: async (id, onMessage) => {
  const { token } = await fetch(`${BASE}/projects/${id}/stream-token`, {
    headers: authHeaders(),
  }).then(handle);

  const es = new EventSource(
    `${BASE}/projects/${id}/stream?token=${encodeURIComponent(token)}`
  );

  es.onopen = () => {
    console.log("SSE CONNECTED");
  };

  es.onerror = (err) => {
    console.log("SSE ERROR", err);
  };

  es.onmessage = (evt) => {
    console.log("RAW EVENT:", evt.data);

    try {
      onMessage(JSON.parse(evt.data));
    } catch (e) {
      console.log("PARSE ERROR", e);
    }
  };

  return () => es.close();
},
  getSystemStats: () =>
    fetch(`${BASE}/admin/stats`).then(handle),

  crmExportCsvUrl: (id) =>
    `${BASE}/projects/${id}/export.csv`,

  downloadCrmExportCsv: (id) =>
    fetch(`${BASE}/projects/${id}/export.csv`, {
      headers: authHeaders(),
    }).then(handleBlob),

  downloadCrmExportDocx: (id) =>
    fetch(`${BASE}/projects/${id}/export.docx`, {
      headers: authHeaders(),
    }).then(handleBlob),
};