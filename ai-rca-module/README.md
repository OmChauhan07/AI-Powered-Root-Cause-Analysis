# AIVOA.AI – AI-Powered Root Cause Analysis (RCA) Module

Enterprise-grade full-stack foundation for the **AI-Powered Root Cause Analysis (RCA) Module**. Built with a modular, scalable architecture to ingest system telemetry, analyze failure modes, orchestrate AI-driven hypothesis testing via LangGraph and Groq, and deliver actionable root cause diagnoses through an intuitive dashboard.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19 + Vite | High-performance Single Page Application |
| **State Management** | Redux Toolkit + React Redux | Predictable global state management & async API dispatch |
| **HTTP Client** | Axios | Frontend-backend communication with interceptors |
| **Backend** | Python 3.12 + FastAPI | High-throughput asynchronous REST API |
| **AI Orchestration** | LangGraph | Multi-stage stateful agentic workflow orchestration |
| **LLM Inference** | Groq API (`llama-3.3-70b-versatile`) | Ultra-low latency LLM reasoning |
| **Database** | PostgreSQL + SQLAlchemy 2.0 | Relational data persistence with connection pooling |

---

## 📁 Project Structure

```text
ai-rca-module/
├── frontend/
│   ├── src/
│   │   ├── components/         # Reusable UI components (HealthCard, badges)
│   │   ├── pages/              # Application views & pages (Dashboard)
│   │   ├── features/           # Feature slices (healthSlice)
│   │   ├── store/              # Redux Toolkit store configuration
│   │   ├── services/           # Axios client & API abstraction layer
│   │   ├── hooks/              # Custom React hooks (useHealth)
│   │   ├── layouts/            # Page layouts & navigation bars (Navbar)
│   │   ├── utils/              # Data formatting and helper utilities
│   │   ├── App.jsx             # Main application component
│   │   ├── main.jsx            # React root with Redux Provider
│   │   └── index.css           # Global theme styles
│   ├── public/                 # Static web assets
│   ├── .env.example            # Frontend environment variable template
│   ├── package.json            # Node.js dependencies and scripts
│   └── vite.config.js          # Vite build configuration
│
├── backend/
│   ├── app/
│   │   ├── api/                # API routers & versioning (v1 endpoints)
│   │   │   ├── router.py       # Central router aggregation
│   │   │   └── v1/
│   │   │       └── health.py   # System health-check endpoint (/api/health)
│   │   ├── core/               # App configuration & environment settings
│   │   │   └── config.py       # Pydantic BaseSettings with CORS parsing
│   │   ├── models/             # SQLAlchemy ORM models
│   │   │   └── rca.py          # RCARecord database model
│   │   ├── schemas/            # Pydantic validation & response schemas
│   │   │   ├── health.py       # Health check schema
│   │   │   └── rca.py          # RCA request/response schemas
│   │   ├── services/           # Business logic layer
│   │   │   └── rca_service.py  # Orchestrator for DB and AI graphs
│   │   ├── ai/                 # LangGraph & Groq integration
│   │   │   ├── groq_client.py  # Groq client factory & health probe
│   │   │   ├── state.py        # RCAState TypedDict for LangGraph
│   │   │   ├── nodes.py        # Log analyzer, hypothesis, root cause nodes
│   │   │   └── workflow.py     # StateGraph compilation pipeline
│   │   ├── database/           # PostgreSQL connection & session factory
│   │   │   ├── base.py         # SQLAlchemy DeclarativeBase
│   │   │   └── session.py      # Engine, sessionmaker, and connectivity probe
│   │   └── main.py             # FastAPI app initialization & CORS middleware
│   ├── requirements.txt        # Python backend dependencies
│   └── .env.example            # Backend environment variable template
│
├── .gitignore                  # Git exclusion rules
└── README.md                   # Project documentation
```

---

## 🚀 Getting Started Locally

### Prerequisites
- **Python**: Version `3.10` or higher (`3.12` recommended)
- **Node.js**: Version `18.0.0` or higher (`v24.x` recommended)
- **npm**: Version `9.0.0` or higher
- **PostgreSQL**: (Optional for initial startup, required for full DB persistence)

---

### 1. Backend Setup (FastAPI)

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment**:
   - **Windows (PowerShell)**:
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   - **macOS / Linux**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   ```bash
   # Copy example environment configuration
   cp .env.example .env
   ```
   Edit `.env` to configure your credentials:
   - `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql://postgres:password@localhost:5432/rca_db`)
   - `GROQ_API_KEY`: Your Groq API key from [Groq Console](https://console.groq.com/keys)
   - `CORS_ORIGINS`: Allowed origins, defaults to `http://localhost:5173,http://127.0.0.1:5173`

5. **Start the FastAPI backend server**:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

6. **Verify the backend**:
   - Health Check: [http://localhost:8000/api/health](http://localhost:8000/api/health)
   - Interactive Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
   - Alternative ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

### 2. Frontend Setup (React + Vite + Redux Toolkit)

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install npm dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Ensure `VITE_API_BASE_URL` points to your backend:
   ```env
   VITE_API_BASE_URL="http://localhost:8000"
   ```

4. **Start the Vite development server**:
   ```bash
   npm run dev
   ```

5. **Access the application**:
   Open [http://localhost:5173](http://localhost:5173) in your browser. The dashboard automatically queries `/api/health` and displays the real-time status of the backend API, PostgreSQL, and the Groq AI engine.

---

## 🔍 Health-Check Endpoint Specification

### `GET /api/health`

Returns diagnostic details regarding backend components:

**Example Response**:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "development",
  "timestamp": "2026-11-24T11:06:54.056426Z",
  "services": {
    "api": {
      "status": "healthy",
      "service": "AIVOA.AI - Root Cause Analysis (RCA) Module"
    },
    "database": {
      "status": "connected",
      "message": "Successfully connected to PostgreSQL database."
    },
    "ai_engine": {
      "status": "ready",
      "message": "Groq API key configured",
      "model": "llama-3.3-70b-versatile"
    }
  }
}
```

---

## 🧠 AI Workflow & LangGraph Architecture

The AI module (`backend/app/ai/`) implements a stateful agentic pipeline using **LangGraph**:

1. **State Definition (`state.py`)**: `RCAState` manages typed context containing incident telemetry, anomalies, hypotheses, candidate root causes, and remediation proposals.
2. **Modular Nodes (`nodes.py`)**:
   - `log_analyzer_node`: Ingests and parses unstructured logs and telemetry metrics.
   - `hypothesis_generator_node`: Formulates probable failure hypotheses.
   - `root_cause_identifier_node`: Synthesizes evidence to isolate the root cause.
   - `recommendation_node`: Generates actionable recovery and mitigation playbooks.
3. **Workflow Compilation (`workflow.py`)**: Connects nodes in a directed execution graph via `StateGraph(RCAState)`.
4. **Groq Client Factory (`groq_client.py`)**: Manages high-performance Groq LLM instances (`ChatGroq`) with fallback and diagnostic reporting.

---

## 🔒 Security & Privacy Notice
- `.env` files are strictly excluded via `.gitignore`. Never commit API keys or production database credentials.
- In accordance with assignment instructions, this project must **not** be pushed or published to public or remote repositories.
