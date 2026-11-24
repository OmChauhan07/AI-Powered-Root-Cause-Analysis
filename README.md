# AIVOA.AI – AI-Powered Root Cause Analysis (RCA) Module

This repository contains the full-stack project for the **AIVOA.AI – AI-Powered Root Cause Analysis (RCA) Module**.

The complete project structure is located in the [`ai-rca-module/`](./ai-rca-module) directory:

```text
ai-rca-module/
├── frontend/     # React + Vite + Redux Toolkit + Axios
├── backend/      # Python 3.12 + FastAPI + LangGraph + Groq + PostgreSQL
├── .gitignore    # Excludes virtual environments, secrets, node_modules
└── README.md     # Detailed documentation and setup guide
```

For complete setup and execution instructions, please refer to:
👉 **[ai-rca-module/README.md](./ai-rca-module/README.md)**

### Quick Commands

#### Backend:
```bash
cd ai-rca-module/backend
python -m venv venv
# On Windows:
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### Frontend:
```bash
cd ai-rca-module/frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.
API Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
Health Check: [http://localhost:8000/api/health](http://localhost:8000/api/health)
