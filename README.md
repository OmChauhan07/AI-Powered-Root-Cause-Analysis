# AI-Powered Root Cause Analysis (RCA) Module

> **GxP-Compliant AI-Assisted Deviation Investigation, Root Cause Analysis, and CAPA Management for Pharmaceutical Manufacturing**

An intelligent, full-stack investigation platform designed specifically for pharmaceutical quality assurance (QA) and regulatory compliance teams. The application guides investigators through Active Pharmaceutical Ingredient (API) deviations (such as out-of-specification purity assays), orchestrates multi-source document ingestion, executes agentic reasoning via **LangGraph** and **Groq (`llama-3.3-70b-versatile`)**, detects timeline anomalies and evidence conflicts, maps causal chains using **5 Whys** and **Ishikawa 6M Fishbone**, cross-references supporting versus contradicting evidence, and formulates measurable **CAPA action plans**—while strictly enforcing human authority boundaries per FDA 21 CFR Part 11.

---

## 📁 Repository Structure

The complete project implementation is located in the [`ai-rca-module/`](./ai-rca-module) directory:

```text
ai-rca-module/
├── frontend/                     # React 19 + Vite + Redux Toolkit SPA
│   ├── src/
│   │   ├── components/           # Navigation, health cards, badges
│   │   ├── features/             # Redux Toolkit investigation slice & tests
│   │   ├── layouts/              # Master 6-stage investigation stepper workspace
│   │   ├── pages/stages/         # Intake, Form, Evidence, RCA Methods, CAPA, Summary
│   │   └── services/             # Axios API client abstraction layer
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # Python 3.12 + FastAPI Async REST Backend
│   ├── alembic/                  # Database migration versions
│   ├── app/
│   │   ├── ai/                   # LangGraph StateGraph, nodes, prompts, Groq client
│   │   ├── api/v1/               # Health, Documents, Extraction, Evidence, RCA, CAPA, Dossier
│   │   ├── core/                 # Config & Pydantic settings
│   │   ├── database/             # SQLAlchemy engine & session management
│   │   ├── models/               # Investigation, Evidence, Cause, and CAPA ORM entities
│   │   ├── schemas/              # Pydantic v2 validation contracts
│   │   └── services/             # Document parser (PyMuPDF, email RFC-822, normalizer)
│   ├── requirements.txt
│   └── tests/                    # 50 comprehensive pytest suites
│
├── .gitignore                    # Comprehensive exclusion rules (venv, secrets, node_modules)
└── README.md                     # Complete project documentation & guide
```

For full architectural documentation, API contracts, and user guides, please refer to:
👉 **[ai-rca-module/README.md](./ai-rca-module/README.md)**

---

## ⚡ Quick Start Commands

### Backend (FastAPI):
```bash
cd ai-rca-module/backend
python -m venv venv
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux / macOS:
# source venv/bin/activate

pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (React + Vite):
```bash
cd ai-rca-module/frontend
npm install
npm run dev
```

- Web Application: [http://localhost:5173](http://localhost:5173)
- API Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health Check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

## 🧪 Verification & Automated Testing

- **Backend Tests (50/50 passing)**:
  ```bash
  cd ai-rca-module/backend
  .\venv\Scripts\pytest.exe -v
  ```
- **Frontend Tests (12/12 passing, 0 lint errors)**:
  ```bash
  cd ai-rca-module/frontend
  npm test
  npm run lint
  npm run build
  ```
