# AI-Powered Root Cause Analysis (RCA) Module

> **GxP-Compliant AI-Assisted Deviation Investigation, Root Cause Analysis, and CAPA Management for Pharmaceutical Manufacturing**

An intelligent, full-stack investigation platform designed specifically for pharmaceutical quality assurance (QA) and regulatory compliance teams. The application guides investigators through Active Pharmaceutical Ingredient (API) deviations (such as out-of-specification purity assays), orchestrates multi-source document ingestion, executes agentic reasoning via **LangGraph** and **Groq (`llama-3.3-70b-versatile`)**, detects timeline anomalies and evidence conflicts, maps causal chains using **5 Whys** and **Ishikawa 6M Fishbone**, cross-references supporting versus contradicting evidence, and formulates measurable **CAPA action plans**—while strictly enforcing human authority boundaries per FDA 21 CFR Part 11.

---

## 🏗️ Architecture & Technology Stack

```
                              ┌───────────────────────────────────────────────┐
                              │            React 19 + Vite Frontend           │
                              │  Redux Toolkit • Axios • Human Review Gates   │
                              └───────────────────────┬───────────────────────┘
                                                      │ REST APIs
                                                      ▼
                              ┌───────────────────────────────────────────────┐
                              │            FastAPI Backend (Py 3.12)          │
                              │  Modular Routers • Pydantic v2 • Audit Trails │
                              └───────┬───────────────────────────────┬───────┘
                                      │                               │
                                      ▼                               ▼
     ┌──────────────────────────────────────────────────┐   ┌───────────────────────────┐
     │          LangGraph Agentic Orchestrator          │   │   PostgreSQL + SQLAlchemy │
     │  • Multi-Format Document Parser (PyMuPDF)        │   │  • Alembic Migrations     │
     │  • Fact Extraction & Citation Provenance         │   │  • Investigation Dossiers │
     │  • Cross-Document Gap & Conflict Detector        │   │  • Evidence Records       │
     │  • 5 Whys & Ishikawa 6M Methods                  │   │  • Cause Candidates       │
     │  • Supporting vs Contradicting Evidence Matrix   │   │  • CAPA Action Plans      │
     │  • Role-Based CAPA Formulation                   │   └───────────────────────────┘
     │  • Groq LLM (llama-3.3-70b) + GxP Offline Fallback│
     └──────────────────────────────────────────────────┘
```

| Layer | Technology | Key Capabilities |
|---|---|---|
| **Frontend** | React 19, Vite, Redux Toolkit, Axios | 6-stage guided investigation stepper, responsive layout, real-time draft state, printable GxP dossiers |
| **Backend** | Python 3.12, FastAPI, Pydantic v2 | High-throughput async REST endpoints, GxP validation constraints, dependency injection |
| **AI Orchestration** | LangGraph, LangChain Core | Multi-stage stateful StateGraph pipelines with deterministic GxP offline fallbacks |
| **LLM Inference** | Groq API (`llama-3.3-70b-versatile`) | High-speed LLM inference with structured JSON output and prompt engineering |
| **Document Engine** | PyMuPDF (fitz), Python email/re | Page-by-page PDF parsing, RFC-822 email parser, whitespace normalizer, SHA-256 integrity |
| **Database** | PostgreSQL, SQLAlchemy 2.0, Alembic | Relational schema with cascade deletions, foreign key indexes, and full audit timestamps |
| **Quality & Testing** | Pytest, Node Test Runner, Oxlint | 50 automated backend tests, 12 frontend tests, 0 lint warnings |

---

## 🔒 GxP & Regulatory Safety Principles (21 CFR Part 11)

1. **Human Authority Boundary**: The AI acts strictly as an analytical assistant. AI outputs remain classified as `hypothesis`, `needs_evidence`, or `evidence_supported_pending_review`.
2. **Never Auto-Confirm**: No AI node or API call can mark a root cause as `confirmed` or close an investigation automatically. Only an authorized human investigator can confirm a cause.
3. **Mandatory Reviewer Justification**: Confirming or rejecting a root cause candidate requires an explicit technical justification note (enforced via HTTP 422 if omitted).
4. **Preservation of Human Edits**: Re-running AI extractions or analysis graphs never silently overwrites reviewer-edited incident fields without explicit overwrite flags.
5. **No Hallucinated Records or Roles**: CAPA actions assign roles only (e.g. `Maintenance Lead`, `Validation Specialist`), never hallucinating employee names.

---

## 📋 Guided 6-Stage Investigation Workflow

1. **Stage 1: Evidence Intake & Ingestion (`IntakeStage.jsx`)**
   - Upload deviation PDFs, paste unstructured shift logs, or ingest `.eml` email records.
   - Computes SHA-256 checksums, page counts, and sanitizes filenames.
   - Built-in `Load Sample API-X Incident` button instantly preloads the synthetic API purity deviation scenario.
2. **Stage 2: AI Incident Extraction (`FormStage.jsx`)**
   - Extracts 11 standardized pharmaceutical deviation fields (Product, Batch, Stage, Problem Statement, Expected/Observed Results, Immediate Actions, Equipment, Severity).
   - Shows source citation provenance (filename, page number, excerpt) and confidence percentage.
   - In-line human verification toggle (`Accept`, `Reject`, `Edit`) for every individual fact.
3. **Stage 3: Evidence Extraction & Gap Analysis (`EvidenceStage.jsx`)**
   - Parses technical evidence (calibration certificates, batch records, analytical assays).
   - Detects chronological anomalies (e.g. post-incident calibration used to justify pre-incident run).
   - Flags cross-document inconsistencies and generates actionable investigation gap alerts.
4. **Stage 4: Root Cause Analysis Methods (`RcaMethodsStage.jsx`)**
   - **5 Whys Analysis**: Interactive multi-step iterative causal drill-down.
   - **Ishikawa 6M Fishbone**: Categorization into *Machine*, *Method*, *Material*, *People*, *Measurement*, and *Environment*.
   - **Cause vs Evidence Matrix**: Separates supporting from contradicting evidence (e.g. solvent purity COA refuting raw material hypothesis).
   - Human qualification controls (`Confirm Root Cause`, `Reject`, `Mark Needs Evidence`).
5. **Stage 5: CAPA Action Formulation (`CapaStage.jsx`)**
   - AI generates structured actions categorized into *Containment*, *Corrective*, *Preventive*, and *Investigation Follow-up*.
   - Assigns role-based owners and defines measurable effectiveness check criteria (e.g., 3 consecutive commercial batches with purity $\ge 99.0\%$).
   - Safety rule: If no cause is evidence-supported, CAPA generation is deferred with an explicit warning.
6. **Stage 6: Investigation Dossier & Formal Sign-Off (`SummaryStage.jsx`)**
   - Consolidated executive review of the entire investigation dossier.
   - Qualified reviewer identity recording (`reviewer_name`, `reviewer_role`, `reviewer_note`, lifecycle status).
   - Direct PostgreSQL persistence with audit timestamps.
   - One-click DB reload and print/export dossier formatted for regulatory submission.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python**: 3.10+ (Python 3.12 recommended)
- **Node.js**: 18+ (Node 20 or 24 recommended)
- **PostgreSQL**: Local or cloud instance (e.g. Supabase, Neon, or local Docker)

### 1. Backend Setup

```bash
# Navigate to backend directory
cd ai-rca-module/backend

# Create and activate virtual environment
# Windows PowerShell:
python -m venv venv
.\venv\Scripts\Activate.ps1
# Linux / macOS:
# python3 -m venv venv && source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL DATABASE_URL and optional GROQ_API_KEY
# If GROQ_API_KEY is omitted, the system seamlessly uses deterministic GxP offline fallback algorithms.

# Run database migrations
alembic upgrade head

# Start FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API Health Check: [http://localhost:8000/api/health](http://localhost:8000/api/health)
- Swagger OpenAPI Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Frontend Setup

```bash
# In a new terminal, navigate to frontend directory
cd ai-rca-module/frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

- Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Comprehensive Automated Test Suites

### Backend Tests (50 Tests Passing)
```bash
cd ai-rca-module/backend
.\venv\Scripts\pytest.exe -v
```
Test modules include:
- `test_health.py`: Health check and landing endpoints.
- `test_database.py`: SQLAlchemy ORM models, relations, cascades.
- `test_document_parser.py`: PyMuPDF page parsing, email RFC-822, whitespace cleaner, SHA-256.
- `test_document_api.py`: Uploads, text ingest, validation errors, security sanitization.
- `test_extraction.py`: LangGraph extraction node, complete/partial sources, edit preservation.
- `test_evidence.py`: Evidence records, gap detection, timeline anomalies, conflict identification.
- `test_rca_methods.py`: 5 Whys chain, Fishbone 6M categorization, human qualification.
- `test_cause_assessment.py`: Supporting/contradicting evidence matrix, mandatory justification note.
- `test_capa.py`: CAPA generation, deferral without supported cause, role assignment, acceptance.
- `test_persistence.py`: Field updates, reviewed draft saving, GxP sign-off, full dossier reload.
- `test_workflow.py`: LangGraph StateGraph compilation, execution, and Groq health probe.

### Frontend Tests (12 Tests Passing)
```bash
cd ai-rca-module/frontend
npm test
npm run lint
npm run build
```
- 12 unit tests verifying Redux slices, human review actions, gap resolution, sample data preloader, and dossier serialization.
- Oxlint: 0 warnings, 0 errors across 21 files.
- Vite build: Production bundle created cleanly.

---

## 🧪 Demonstration Scenario: API-X Batch Purity OOS

To demonstrate the full end-to-end investigation:
1. Open [http://localhost:5173](http://localhost:5173).
2. Click **"🧪 Load Sample API-X Incident"** in the top navigation bar.
3. Observe the preloaded scenario:
   - **Deviation**: API-X Batch `BATCH-2026-014` purity HPLC assay yielded `98.1%` (below limit $\ge 99.0\%$).
   - **Evidence 1**: Deviation Incident Report (`doc-001`).
   - **Evidence 2**: Calibration Certificate for `TEMP-SENSOR-014` showing `+0.8°C` drift (`doc-002`).
   - **Contradicting Evidence**: Solvent Lot `S-8821` COA showed `99.8%` purity, refuting raw material impurity.
4. Step through the stages:
   - **Stage 2**: View extracted incident fields with confidence scores and source citations.
   - **Stage 3**: Review identified calibration anomaly and missing cooling jacket telemetry gap.
   - **Stage 4**: Inspect the 5 Whys causal chain and Fishbone 6M diagram. Review the Cause vs Evidence Matrix. Click **"Confirm Root Cause"** on Sensor Drift and enter justification note.
   - **Stage 5**: Generate and approve evidence-linked CAPA actions (sensor recalibration, cooling jacket SOP update).
   - **Stage 6**: Enter reviewer sign-off details, click **"💾 Save & Persist Reviewed Investigation Dossier"**, and click **"🔄 Reload from DB"** to verify PostgreSQL persistence.
