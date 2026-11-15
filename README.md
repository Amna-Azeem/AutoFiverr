# AutoFiverr

AutoFiverr is an AI-powered web platform designed to help users carry
out service-related tasks through specialized AI agents. It provides a
shared workspace where users can select an available service, submit
project requirements, monitor processing, review generated results, and
export their data.

The platform is designed around a modular structure so that additional
AI-powered services can be integrated over time. **Smart Lead Finder &
Pitcher** is the currently implemented service.

## Current Service: Smart Lead Finder & Pitcher

Smart Lead Finder & Pitcher helps users research potential business
customers and prepare personalized outreach. A user provides details
such as the target industry, geographical area, research signals,
service offer, and desired number of leads. The system then carries out
a sequence of research and processing tasks.

Its workflow uses eight specialized agents:

1.  **Target Profiler** -- interprets the user's requirements and
    prepares the research criteria.
2.  **Candidate Discovery** -- searches for companies that may match
    those criteria.
3.  **Company Scraper** -- collects relevant information from publicly
    accessible company websites.
4.  **Content Relevance Filter** -- identifies information related to
    the user's service offer and research requirements.
5.  **Evidence Verification** -- checks whether the collected evidence
    is supported by the available source content.
6.  **Outreach Writer** -- prepares personalized outreach messages using
    the available company information.
7.  **Outreach QA** -- reviews the generated messages and flags content
    that needs attention.
8.  **CRM Structurer** -- organizes the resulting lead information into
    structured records.

A central orchestrator coordinates the agents and manages the workflow.
It is responsible for passing information between stages and tracking
execution. The orchestrator coordinates the agents; it is not an
additional agent.

## Platform Features

-   User registration and login
-   Dashboard for accessing platform activities
-   Service selection and project creation
-   Project-specific requirements and processing
-   Execution progress and agent activity monitoring
-   Generated lead and evidence review
-   Outreach message review and editing
-   Project history and result management
-   Word document and CSV exports
-   CRM-compatible CSV formats for tools such as HubSpot, Salesforce,
    Zoho CRM, and Pipedrive

CRM-compatible exports are downloadable files intended for import into
the user's CRM. AutoFiverr does not currently synchronize records
directly with external CRM accounts.

## Technology Stack

### Frontend

-   React.js
-   React Router
-   Tailwind CSS
-   HTML and CSS

### Backend

-   Node.js
-   Express.js
-   Mongoose

### Database

-   MongoDB Atlas

### AI and External Services

-   Google Gemini API
-   Brave Search API
-   HTTP requests and HTML parsing for public website data extraction

## How It Works

1.  The user signs in and selects an available service.
2.  The user creates a project and submits the required information.
3.  The backend validates the request and stores the project.
4.  The selected service workflow is started and coordinated by the
    orchestrator.
5.  The agents process the task and pass relevant information between
    stages.
6.  The platform records execution progress and stores the generated
    results under the project.
7.  The user reviews the results and can download them in supported
    export formats.

## Getting Started

### Prerequisites

Before running the project, make sure you have:

-   Node.js and npm installed
-   Access to a MongoDB Atlas database, or a compatible MongoDB
    connection
-   A Google Gemini API key
-   A Brave Search API key

### Installation

Clone the repository:

``` bash
git clone <repository-url>
cd <repository-folder>
```

Install the backend dependencies:

``` bash
cd backend
npm install
```

Install the frontend dependencies:

``` bash
cd ../frontend
npm install
```

### Environment Configuration

Configure the environment variables required by the backend before
starting the application. These include the database connection string,
JWT authentication secret, Google Gemini API key, and Brave Search API
key.

Use the variable names expected by the backend configuration in your
local environment file. Do not commit API keys, database credentials,
JWT secrets, or other private values to GitHub.

### Run the Application

Start the backend from the `backend` directory using the development
script defined in its `package.json`. In a separate terminal, start the
frontend from the `frontend` directory using its development script.

``` bash
# Terminal 1
cd backend
npm run dev
```

``` bash
# Terminal 2
cd frontend
npm run dev
```

If your local scripts use different names, run the corresponding scripts
listed in each folder's `package.json`.

## Project Structure

The repository contains separate frontend and backend applications:

``` text
AutoFiverr/
├── frontend/       # React user interface
├── backend/        # Express API, project handling and service logic
└── README.md
```

The exact internal folders and files may vary as the project develops.

## Project Status

AutoFiverr is under development. Smart Lead Finder & Pitcher is the
currently implemented service. The platform's modular design is intended
to support the integration of additional services in future development.

## Security

-   Keep API keys and secrets in local environment variables.
-   Do not upload `.env` files containing private credentials.
-   Do not commit database passwords, access tokens, or other sensitive
    configuration.
-   Use a secure JWT secret in any deployed environment.

## License

No license has been specified for this repository yet. All rights and
permissions remain with the project owners unless a license is added.
