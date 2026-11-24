# AI RCA Module — AI-Powered Root Cause Analysis

> **AI-assisted pharmaceutical quality investigation, root cause analysis, and CAPA recommendations.**

The **AI RCA Module** is an AI-first, single-page investigation workspace designed specifically for pharmaceutical quality assurance (QA), manufacturing deviation triage, and regulatory compliance teams. 

The application implements a split-screen desktop workspace featuring a live, AI-populated investigation form on the left (~60%) and an interactive conversational AI Copilot on the right (~40%). Users interact naturally with the Copilot to upload incident documents (PDF/TXT), provide narrative updates, execute 5 Whys root cause analysis, identify evidence gaps, formulate evidence-linked CAPA commitments, and formally sign off on the investigation dossier via a GxP Review Modal before persisting to PostgreSQL.

---

## 🏗️ Architecture & Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       AI RCA Module Workspace                                   │
├────────────────────────────────────────────────────────┬────────────────────────────────────────┤
│           Left Section (60% Desktop Width)             │    Right Section (40% Desktop Width)   │
│           Live RCA Investigation Form                  │    Conversational AI Copilot           │
│                                                        │                                        │
│ • Display-first, AI-populated parameters               │ • Natural language chat (LLM style)   │
│ • Real-time field status badges (Extracted/Modified)   │ • Intent understanding & extraction    │
│ • Monospace problem statement & deviation limits       │ • Real-time live form synchronization  │
│ • Attached evidence pills with page counts             │ • Interactive 5 Whys causal path card  │
│ • Real-time status cards (5 Whys / CAPA / Evidence)    │ • Evidence-linked CAPA recommendation  │
│ • Direct "Commit Incident & Run 5 Whys" button         │ • Missing evidence & gap detection     │
│ • "Open Final Review Modal" sign-off gate              │ • Attachment dock (.pdf, .txt, .eml)   │
└───────────────────────────┬────────────────────────────┴───────────────────┬────────────────────┘
                            │                                                │
                            │              HTTP / REST APIs                  │
                            └───────────────────────┬────────────────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    FastAPI Backend (Python 3.12)                                │
│ • Conversational Copilot Router (`/api/investigations/{id}/copilot/chat`)                       │
│ • LangGraph StateGraph Agentic Workflow (`llama-3.3-70b-versatile` & GxP Offline Fallback)      │
│ • Multi-Format Document Ingestion Engine (PyMuPDF, text cleaner, SHA-256 integrity)             │
│ • 5 Whys Root Cause Analysis Engine (exclusive methodology)                                    │
│ • Evidence-Linked CAPA Formulation Engine (containment, corrective, preventive)                │
│ • PostgreSQL Persistence Layer (SQLAlchemy 2.0 + Alembic Migrations)                            │
└───────────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    PostgreSQL Database (`ai_rca_db`)                            │
│ • Investigations Dossier (lifecycle status, GxP reviewer notes, audit timestamps)               │
│ • Source Documents & Evidence Records (citations, calibration data, assay results)              │
│ • Cause Candidates (hypotheses vs confirmed causes)                                             │
│ • CAPA Action Commitments (owners, due dates, effectiveness verification criteria)               │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Key Capabilities |
|---|---|---|
| **Frontend** | React 19, Vite, Redux Toolkit, Tailwind CSS | Single-page split workspace, real-time Redux synchronization, interactive Copilot cards, Final Review Modal, GxP print export |
| **Backend** | Python 3.12, FastAPI, Pydantic v2 | High-throughput async REST endpoints, GxP validation constraints, conversational copilot service |
| **AI Orchestration** | LangGraph, LangChain Core | Multi-turn stateful StateGraph pipelines with deterministic GxP offline fallback algorithms |
| **LLM Inference** | Groq API (`llama-3.3-70b-versatile`) | High-speed LLM inference with structured JSON output and prompt engineering |
| **Document Engine** | PyMuPDF (fitz), Python email/re | Page-by-page PDF parsing, RFC-822 email parser, whitespace normalizer, SHA-256 integrity |
| **Database** | PostgreSQL, SQLAlchemy 2.0, Alembic | Relational schema with cascade deletions, foreign key indexes, and full audit timestamps |
| **Quality & Testing** | Pytest, Node Test Runner, Vite | 56 automated backend tests (100% passing), 12 frontend tests, 0 lint warnings |

---

## 🔒 GxP & Regulatory Safety Principles (21 CFR Part 11)

1. **Human Authority Boundary**: The AI acts strictly as an analytical assistant. AI outputs remain classified as `hypothesis`, `needs_evidence`, or `evidence_supported_pending_review`.
2. **Never Auto-Confirm**: No AI node or API call can mark a root cause as `confirmed` or close an investigation automatically.
3. **Mandatory Reviewer Justification**: Confirming or saving a reviewed investigation requires an explicit technical justification note (enforced via HTTP 422 if omitted).
4. **Preservation of Human Edits**: Re-running AI extractions or conversational updates preserves user-edited incident fields unless explicitly overwritten.
5. **Role-Based CAPA Owners**: CAPA actions assign organizational roles only (e.g., `Quality Assurance Lead`, `Maintenance Specialist`), avoiding hallucinated employee names.

---

## 🌟 Primary Application Workflow

1. **Document / Narrative Intake**:
   - The user drops a deviation PDF or enters narrative text into the Copilot input dock on the right.
   - The AI extracts structured incident fields (product, batch, stage, observed lab result, equipment).
2. **Live RCA Form Synchronization**:
   - The Live RCA Form on the left automatically populates with extracted parameters.
   - Field status badges indicate `Extracted`, `Modified`, or `Awaiting Input`.
3. **Conversational Exploration & Field Refinement**:
   - The user communicates naturally (e.g., *"Update the batch number to BATCH-2026-014"* or *"Why is calibration important?"*).
   - The AI distinguishes general questions from field updates and synchronizes state in real time.
4. **5 Whys Root Cause Analysis (Exclusive Methodology)**:
   - The user asks *"Run the 5 Whys analysis"* or clicks **"⚡ Commit Incident & Run 5 Whys"**.
   - The system traces the causal path from observed deviation to systemic root cause (step-by-step with evidence links).
5. **Inline Evidence Gaps & CAPA Formulation**:
   - The Copilot highlights open evidence gaps directly in interactive cards.
   - The system formulates evidence-linked CAPA commitments (containment, corrective, preventive) with measurable effectiveness criteria.
6. **Final Review Modal & PostgreSQL Persistence**:
   - The user opens the **Final Review Modal**, inspects and edits parameters, reviews the 5 Whys path and CAPA actions.
   - The user enters reviewer credentials and a mandatory GxP justification note.
   - The reviewed investigation is permanently saved to PostgreSQL `ai_rca_db` and can be printed/exported as a PDF dossier.

---

## 🚀 Quick Start & Running URLs

### Running Service URLs

| Service | URL | Description |
|---|---|---|
| **Frontend Application** | [http://127.0.0.1:5173](http://127.0.0.1:5173) | Single-page split workspace with Copilot & live form |
| **FastAPI Backend API** | [http://127.0.0.1:8000](http://127.0.0.1:8000) | REST API endpoints for copilot, documents, RCA, and CAPA |
| **Interactive API Docs** | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) | Swagger OpenAPI interactive documentation |
| **API Health Check** | [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) | Live system health and database connectivity probe |

### Prerequisites
- **Python**: 3.10+ (Python 3.12 recommended)
- **Node.js**: 18+ (Node 20 or 24 recommended)
- **PostgreSQL**: Local or managed instance on port 5432 (`ai_rca_db`)

### 1. Backend Setup

```bash
cd ai-rca-module/backend

# Virtual environment setup (Windows PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start backend server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend Setup

```bash
cd ai-rca-module/frontend

# Install dependencies
npm install

# Start Vite frontend server
npm run dev -- --host 127.0.0.1 --port 5173
```

---

## 🧪 Automated Test Verification

### Backend Tests (56 Passing Tests)
```bash
cd ai-rca-module/backend
.\venv\Scripts\python.exe -m pytest tests/ -v
```
All 56 tests pass across document parsing, extraction, evidence gaps, 5 Whys causal analysis, CAPA generation, PostgreSQL persistence, and conversational copilot chat.

### Frontend Verification
```bash
cd ai-rca-module/frontend
npm test
npm run lint
npm run build
```
Builds cleanly with 0 errors and 0 lint warnings.

---

## 🧪 Demonstration Scenario: API-X Batch Purity OOS

1. Open [http://127.0.0.1:5173](http://127.0.0.1:5173).
2. Click **"🧪 Load Sample API-X Incident"** in the top navigation bar.
3. Observe the preloaded scenario:
   - **Deviation**: API-X Batch `BATCH-2026-014` purity HPLC assay was `98.1%` (below registered spec $\ge 99.0\%$).
   - **Evidence 1**: Deviation Incident Report.
   - **Evidence 2**: Calibration Certificate for `TEMP-SENSOR-014` showing `+0.8°C` drift.
4. Interact with the **AI Copilot** on the right:
   - Type *"Why is equipment calibration important?"* -> receives educational response without mutating fields.
   - Type *"Update the equipment identifier to TEMP-SENSOR-014"* -> live form updates immediately.
   - Click **"🔍 5 Whys"** -> displays 5-step causal path highlighting sensor drift as the root cause.
   - Click **"🛡️ Suggest CAPA"** -> displays containment, corrective, and preventive action cards.
5. Click **"📋 Open Final Review Modal"**:
   - Inspect and edit parameters, review the 5 Whys chain and CAPA commitments.
   - Enter Reviewer Name (`Dr. Eleanor Vance`), Role (`QA Director`), and GxP Justification Note.
   - Click **"💾 Save Investigation to PostgreSQL"** -> confirms persistence with generated reference code.
   - Click **"🖨️ Print / Export Dossier"** for regulatory archive.
