# AI RCA Module — AI-Powered Root Cause Analysis

> **AI-assisted pharmaceutical quality investigation, root cause analysis, and CAPA recommendations.**

The **AI RCA Module** is an AI-first, single-page investigation workspace designed specifically for pharmaceutical quality assurance (QA), manufacturing deviation triage, and regulatory compliance teams. 

The application implements a split-screen desktop workspace featuring a live, AI-populated investigation form on the left (~60%) and an interactive conversational AI Copilot on the right (~40%). Users interact naturally with the Copilot to upload incident documents (PDF/TXT), provide narrative updates, execute 5 Whys root cause analysis, identify evidence gaps, formulate evidence-linked CAPA commitments, and formally sign off on the investigation dossier via a GxP Review Modal before persisting to PostgreSQL.

---

## 📁 Repository Structure

The complete project implementation is located in the [`ai-rca-module/`](./ai-rca-module) directory:

```text
ai-rca-module/
├── frontend/                     # React 19 + Vite + Redux Toolkit Single-Page Workspace
│   ├── src/
│   │   ├── components/           # FinalReviewModal, HealthCard, UI badges
│   │   ├── features/             # Redux Toolkit investigation slice & test harness
│   │   ├── pages/                # InvestigationWorkspace (60% Form / 40% Copilot)
│   │   └── services/             # Axios API client (conversational copilot, RCA, CAPA)
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # Python 3.12 + FastAPI Async REST Backend
│   ├── alembic/                  # Database migration versions (6 migrations)
│   │   └── versions/             # Base schema through reviewer notes
│   ├── app/
│   │   ├── ai/                   # LangGraph StateGraph, conversational copilot, 5 Whys, CAPA
│   │   ├── api/v1/               # Copilot, Documents, Extraction, Evidence, RCA, CAPA, Dossier
│   │   ├── core/                 # Config & Pydantic settings
│   │   ├── database/             # SQLAlchemy engine & session management
│   │   ├── models/               # Investigation, Evidence, Cause, and CAPA ORM entities
│   │   ├── schemas/              # Pydantic v2 validation contracts
│   │   └── services/             # Document parser (PyMuPDF, email RFC-822, normalizer)
│   ├── requirements.txt
│   └── tests/                    # 56 comprehensive pytest suites (100% passing)
│
├── .gitignore                    # GxP compliance & confidentiality exclusion rules
└── README.md                     # Comprehensive project documentation
```

For full architectural documentation, API contracts, and user guides, please refer to:
👉 **[ai-rca-module/README.md](./ai-rca-module/README.md)**

---

## ⚡ Running Services & URLs

| Service | URL | Description |
|---|---|---|
| **Frontend Application** | [http://127.0.0.1:5173](http://127.0.0.1:5173) | Single-page split workspace with Copilot & live form |
| **FastAPI Backend API** | [http://127.0.0.1:8000](http://127.0.0.1:8000) | REST API endpoints for copilot, documents, RCA, and CAPA |
| **Interactive API Docs** | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) | Swagger OpenAPI interactive documentation |
| **API Health Check** | [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) | Live system health and database connectivity probe |

### Quick Start Commands

#### Backend (FastAPI):
```bash
cd ai-rca-module/backend
python -m venv venv
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux / macOS:
# source venv/bin/activate

pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

#### Frontend (React + Vite):
```bash
cd ai-rca-module/frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```
