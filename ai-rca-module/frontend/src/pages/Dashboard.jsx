import React from 'react';
import { useHealth } from '../hooks/useHealth';
import HealthCard from '../components/HealthCard';

export const Dashboard = () => {
  const { healthData, isLoading, isError, error, refetch, lastChecked } = useHealth(true);

  return (
    <div style={dashStyles.container}>
      {/* Hero Section */}
      <div style={dashStyles.hero}>
        <div style={dashStyles.tag}>Architecture & Environment Status</div>
        <h1 style={dashStyles.heroTitle}>AI RCA Module</h1>
        <p style={dashStyles.heroSubtitle}>
          <strong>AI-Powered Root Cause Analysis</strong> — AI-assisted pharmaceutical quality investigation, root cause analysis, and CAPA management.
        </p>
      </div>

      {/* Backend Health Check Card */}
      <HealthCard
        healthData={healthData}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRefresh={refetch}
        lastChecked={lastChecked}
      />

      {/* Architecture Modules Overview */}
      <div style={dashStyles.section}>
        <h2 style={dashStyles.sectionTitle}>Modular Architecture Components</h2>
        <div style={dashStyles.moduleGrid}>
          <div style={dashStyles.moduleCard}>
            <div style={dashStyles.moduleIcon}>⚡</div>
            <h3 style={dashStyles.moduleHeading}>FastAPI Modular Backend</h3>
            <p style={dashStyles.moduleText}>
              Modular routing, CORS policy configured for Vite frontend (<code>:5173</code>), Pydantic v2 validation, and standardized JSON responses.
            </p>
            <div style={dashStyles.modulePath}>backend/app/api/</div>
          </div>

          <div style={dashStyles.moduleCard}>
            <div style={dashStyles.moduleIcon}>🧠</div>
            <h3 style={dashStyles.moduleHeading}>LangGraph + Groq Workflow</h3>
            <p style={dashStyles.moduleText}>
              Multi-node StateGraph pipeline configured with Groq high-speed LLM inference (Llama 3.3 70B), state schema, and node execution stages.
            </p>
            <div style={dashStyles.modulePath}>backend/app/ai/</div>
          </div>

          <div style={dashStyles.moduleCard}>
            <div style={dashStyles.moduleIcon}>🗄️</div>
            <h3 style={dashStyles.moduleHeading}>PostgreSQL Connectivity</h3>
            <p style={dashStyles.moduleText}>
              SQLAlchemy 2.0 ORM session management with pre-ping pooling, declarative models, and database health diagnostic checks.
            </p>
            <div style={dashStyles.modulePath}>backend/app/database/</div>
          </div>

          <div style={dashStyles.moduleCard}>
            <div style={dashStyles.moduleIcon}>⚛️</div>
            <h3 style={dashStyles.moduleHeading}>React + Redux Toolkit</h3>
            <p style={dashStyles.moduleText}>
              Vite single-page application with Redux Toolkit async thunks, Axios API client with interceptors, and modular feature architecture.
            </p>
            <div style={dashStyles.modulePath}>frontend/src/</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const dashStyles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '32px 24px',
  },
  hero: {
    marginBottom: '28px',
  },
  tag: {
    display: 'inline-block',
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    padding: '4px 10px',
    borderRadius: '9999px',
    marginBottom: '10px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: '2rem',
    fontWeight: '800',
    color: '#f8fafc',
    margin: '0 0 10px 0',
  },
  heroSubtitle: {
    fontSize: '1rem',
    color: '#94a3b8',
    margin: 0,
    lineHeight: 1.6,
    maxWidth: '800px',
  },
  section: {
    marginTop: '32px',
  },
  sectionTitle: {
    fontSize: '1.2rem',
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: '16px',
  },
  moduleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
  },
  moduleCard: {
    backgroundColor: '#1e293b',
    borderRadius: '10px',
    padding: '20px',
    border: '1px solid #334155',
  },
  moduleIcon: {
    fontSize: '1.5rem',
    marginBottom: '8px',
  },
  moduleHeading: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#f1f5f9',
    margin: '0 0 8px 0',
  },
  moduleText: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    lineHeight: 1.5,
    margin: '0 0 12px 0',
  },
  modulePath: {
    fontSize: '0.75rem',
    fontFamily: 'monospace',
    color: '#38bdf8',
    backgroundColor: '#0f172a',
    padding: '4px 8px',
    borderRadius: '4px',
    display: 'inline-block',
  },
};

export default Dashboard;
