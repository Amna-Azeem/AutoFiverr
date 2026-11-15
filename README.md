# AutoFiverr

Autonomous multi-agent freelancing platform. This build ships **Agency 4:
Autonomous Lead Research & Sales Personalization** ("Smart Lead Finder &
Pitcher") end to end — a strict seven-agent pipeline that discovers real
companies, verifies source-backed facts, writes outreach, and exports CRM-ready
leads.

## Stack
- **Backend:** Node.js ES modules, Express, MongoDB/Mongoose, Gemini API,
  Brave Search, Cheerio, `docx`, Multer + `pdf-parse` for PDF uploads.
- **Frontend:** React (Vite) + Tailwind CSS, Server-Sent Events for live
  agent log streaming.

## Project structure
```
autofiverr/
  backend/
    src/
      agents/            Agent 1-7 implementations
      orchestrator/       Runs the strict seven-agent pipeline per project
      models/             Project, Agency (Mongoose)
      controllers/ routes/ Express API
      middleware/upload.js Multer PDF upload
      utils/logger.js     Persists + SSE-broadcasts agent logs
      server.js
  frontend/
    src/
      pages/               Landing, AgenciesDirectory, AgencyWorkspace,
                            DeliverablesDashboard, AdminLogsDashboard
      components/          Navbar, AgencyCard, ProjectForm, AgentLogStream
      api/client.js
```

## Setup

### 1. Backend
```bash
cd backend
cp .env.example .env
# edit .env: set MONGODB_URI and a real GEMINI_API_KEY
npm install
npm run dev        # http://localhost:5000
```
You need MongoDB (local `mongod`, Docker, or Atlas), `BRAVE_API_KEY`,
`GEMINI_API_KEY`, and `JWT_SECRET`. `GEMINI_MODEL` and `EXPORT_DIR` are optional.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```
The Vite dev server proxies `/api` to `http://localhost:5000` (see
`vite.config.js`), so no CORS setup is needed locally beyond
`CLIENT_ORIGIN` in the backend `.env`.

### 3. Try it
1. Open http://localhost:5173, click **Explore AI Agencies**.
2. Open the **Smart Lead Finder & Pitcher** workspace.
3. Fill in a project goal and what you offer, optionally attach a PDF brief.
4. Watch the seven agents run live in the execution dashboard.
5. Open the deliverables view for verified facts, copy-ready outreach, sources,
  and downloadable Word/CSV reports.
6. Check `/admin` for aggregate run stats across every project.

## API surface
- `GET /api/agencies` / `GET /api/agencies/:slug`
- `GET /api/projects` / `POST /api/projects` (multipart, optional `file`)
- `GET /api/projects/:id`
- `GET /api/projects/:id/stream-token` — short-lived token for authenticated SSE
- `GET /api/projects/:id/stream?token=...` — SSE stream of live agent logs
- `GET /api/projects/:id/export.csv` / `export.docx` — CRM exports
- `POST /api/upload` — standalone PDF parse (no project created)
- `GET /api/admin/stats` — system-wide execution stats

## Notes on scope
- Only Agency 4 is fully wired end-to-end, per the brief. The other three
  agencies are seeded as "Coming soon" placeholders in the directory.
- The orchestrator runs fire-and-forget after the `POST /api/projects` call
  returns `202`; the frontend follows progress via SSE. For real production
  use at scale you'd move this to a proper job queue (e.g. BullMQ), but for
  a single-run-at-a-time demo the in-process approach keeps setup simple.
- Research is not mocked: projects require live Brave Search and Gemini API
  credentials. Companies that fail verification gates are recorded as
  discarded, not replaced with placeholders.
