# AutoFiverr

**An Autonomous Multi-Agent AI Freelancing Platform**

AutoFiverr is an AI-powered platform designed to automate service-related tasks through specialized AI agents. It provides a shared workspace where users can select services, submit project requirements, monitor task execution, review generated results, and download deliverables.

The platform follows a modular architecture that allows different AI-powered services to operate within one platform and supports the integration of additional services over time.

## Current Implemented Service: Smart Lead Finder & Pitcher

Smart Lead Finder & Pitcher is an AI-powered business research and outreach service within AutoFiverr. It helps users identify potential business customers, collect relevant company information, verify research evidence, and prepare personalized outreach messages.

Users provide project requirements such as:

- Target industry
- Ideal customer description
- Geographical location
- Research signals
- Known target companies (optional)
- Service or business offer
- Maximum number of prospects
- Optional PDF project brief

The system processes these requirements through eight specialized AI agents coordinated by a central orchestrator.

### Eight-Agent Workflow

| Agent | Responsibility |
|---|---|
| 1. Target Profiler | Understands project requirements and defines research criteria. |
| 2. Candidate Discovery | Searches for potential companies using live search. |
| 3. Company Scraper | Extracts relevant information from publicly accessible company websites. |
| 4. Content Relevance Filter | Identifies information relevant to the user's requirements and service offer. |
| 5. Evidence Verification Agent | Checks collected information against available source content. |
| 6. Outreach Writer | Creates personalized outreach messages using verified company information. |
| 7. Outreach QA | Reviews outreach messages and identifies content that needs attention. |
| 8. CRM Structurer | Organizes qualified lead information into structured records. |

A central orchestrator manages the workflow, coordinates communication between agents, and tracks execution progress. It is responsible for managing the agents rather than acting as an additional agent.

## Key Platform Features

- User registration and authentication
- Centralized dashboard
- Service discovery and selection
- Project creation and requirement submission
- Specialized AI-agent execution
- Live execution progress and agent activity logs
- Company research and source-backed evidence
- Evidence verification and lead qualification
- Personalized outreach generation
- Outreach review and editing
- Project history and result management
- Downloadable Word and CSV reports
- CRM-compatible CSV exports

**CRM exports:** Generated CSV files can be imported into CRM platforms such as HubSpot, Salesforce, Zoho CRM, and Pipedrive. Direct synchronization with external CRM accounts is not currently supported.

## Technology Stack

### Frontend
- React.js
- Vite
- React Router
- Tailwind CSS
- HTML and CSS

### Backend
- Node.js
- Express.js
- JavaScript ES Modules

### Database
- MongoDB Atlas
- Mongoose

### AI and Research Services
- Google Gemini API
- Brave Search API
- HTTP requests and Cheerio for website data extraction

### Additional Tools and Libraries
- Multer for file uploads
- PDF parsing for project briefs
- Server-Sent Events (SSE) for live execution updates
- DOCX generation for downloadable reports

## System Workflow

1. **User Input:** The user signs in, selects an available service, and submits project requirements.
2. **Request Handling:** The backend validates the submitted information and creates a project.
3. **Workflow Initialization:** The orchestrator starts the selected service workflow.
4. **Agent Execution:** Specialized agents perform research, data extraction, evidence checking, and content generation.
5. **Information Processing:** Results are passed between agents according to the workflow requirements.
6. **Progress Monitoring:** Execution updates and agent activities are made available through the platform.
7. **Result Delivery:** Processed results are stored with the project and presented to the user.
8. **Export:** Users can review their results and download supported Word and CSV reports.

## Project Structure

```text
AutoFiverr/
│
├── backend/
│   ├── src/
│   │   ├── agents/          # Specialized AI agents
│   │   ├── orchestrator/    # Agent workflow coordination
│   │   ├── models/          # Database models
│   │   ├── controllers/     # Request handling
│   │   ├── routes/          # API routes
│   │   ├── middleware/      # Authentication and file uploads
│   │   └── utils/           # Shared utilities
│   │
│   └── server.js
│
├── frontend/
│   └── src/
│       ├── components/      # Reusable UI components
│       ├── pages/           # Application pages
│       └── api/             # API communication
│
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Getting Started

### Prerequisites

Before running AutoFiverr, make sure you have:

- Node.js and npm installed
- A MongoDB Atlas account or another MongoDB instance
- A Google Gemini API key
- A Brave Search API key

### 1. Clone the Repository

```bash
git clone https://github.com/Amna-Azeem/AutoFiverr.git
cd AutoFiverr
```

### 2. Configure the Backend

Navigate to the backend directory:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file using `.env.example` as a reference and provide your own configuration values.

Example configuration:

```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secure_jwt_secret

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=your_gemini_model

BRAVE_API_KEY=your_brave_api_key

EXPORT_DIR=./exports
MAX_UPLOAD_MB=15
```

Replace the example values with your actual credentials. Never upload your `.env` file or private API keys to GitHub.

Start the backend:

```bash
npm run dev
```

The backend runs at:

```text
http://localhost:5000
```

### 3. Configure the Frontend

Open another terminal and navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend is available at:

```text
http://localhost:5173
```

### 4. Explore AutoFiverr

1. Open the application in your browser.
2. Register or sign in.
3. Explore the available AI services.
4. Open the Smart Lead Finder & Pitcher workspace.
5. Create a project and submit your requirements.
6. Monitor agent execution and research progress.
7. Review the generated leads, evidence, and outreach messages.
8. Download the available reports.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/agencies` | Retrieves available services. |
| GET | `/api/agencies/:slug` | Retrieves service details. |
| GET | `/api/projects` | Retrieves projects. |
| POST | `/api/projects` | Creates a new project. |
| GET | `/api/projects/:id` | Retrieves project details. |
| GET | `/api/projects/:id/stream-token` | Generates a short-lived SSE token. |
| GET | `/api/projects/:id/stream?token=...` | Streams live agent execution logs. |
| GET | `/api/projects/:id/export.csv` | Exports project results as CSV. |
| GET | `/api/projects/:id/export.docx` | Exports project results as Word. |
| POST | `/api/upload` | Processes a standalone PDF upload. |
| GET | `/api/admin/stats` | Retrieves system-wide execution statistics. |

## Project Status

AutoFiverr is an ongoing development project. Its modular architecture is designed to support multiple AI-powered services within one platform.

Smart Lead Finder & Pitcher is the currently implemented service, featuring an eight-agent workflow for business research, evidence verification, personalized outreach, and structured lead management.

Additional services are intended to be integrated as development progresses.

## Security

- Keep API keys and credentials in environment variables.
- Never commit `.env` files containing private information.
- Use secure JWT secrets.
- Validate user inputs and uploaded files.
- Protect authenticated API endpoints.
- Avoid exposing sensitive server-side information in application responses.

## License

No open-source license has been specified for this repository. All rights and permissions remain with the project owners unless a license is added.
