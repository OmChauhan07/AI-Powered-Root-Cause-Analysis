import React from 'react';
import { getStatusColor, formatDate } from '../utils/formatters';

export const HealthCard = ({ healthData, isLoading, isError, error, onRefresh, lastChecked }) => {
  return (
    <div style={cardStyles.container}>
      <div style={cardStyles.header}>
        <div>
          <h2 style={cardStyles.title}>System Connectivity & Health Status</h2>
          <p style={cardStyles.subtitle}>
            Real-time diagnostics from FastAPI Backend (GET /api/health)
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          style={{
            ...cardStyles.refreshBtn,
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Checking...' : 'Refresh Health'}
        </button>
      </div>

      {isError && (
        <div style={cardStyles.errorBanner}>
          <strong>Connection Error:</strong> {error}
          <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
            Ensure the FastAPI backend is running on <code>http://localhost:8000</code>.
          </div>
        </div>
      )}

      {healthData && (
        <div style={cardStyles.grid}>
          {/* API Status */}
          <div style={cardStyles.itemCard}>
            <div style={cardStyles.itemHeader}>
              <span style={cardStyles.itemTitle}>Backend API</span>
              <span
                style={{
                  ...cardStyles.badge,
                  color: getStatusColor(healthData.status).text,
                  backgroundColor: getStatusColor(healthData.status).bg,
                }}
              >
                {healthData.status.toUpperCase()}
              </span>
            </div>
            <p style={cardStyles.itemDesc}>
              FastAPI v{healthData.version} ({healthData.environment})
            </p>
            <div style={cardStyles.meta}>
              Endpoints: <code>/api/health</code>, <code>/docs</code>
            </div>
          </div>

          {/* Database Status */}
          <div style={cardStyles.itemCard}>
            <div style={cardStyles.itemHeader}>
              <span style={cardStyles.itemTitle}>PostgreSQL Database</span>
              <span
                style={{
                  ...cardStyles.badge,
                  color: getStatusColor(healthData.services?.database?.status).text,
                  backgroundColor: getStatusColor(healthData.services?.database?.status).bg,
                }}
              >
                {(healthData.services?.database?.status || 'UNKNOWN').toUpperCase()}
              </span>
            </div>
            <p style={cardStyles.itemDesc}>
              {healthData.services?.database?.message || 'Configured via SQLAlchemy'}
            </p>
            <div style={cardStyles.meta}>Driver: psycopg2-binary / SQLAlchemy 2.0</div>
          </div>

          {/* AI Engine Status */}
          <div style={cardStyles.itemCard}>
            <div style={cardStyles.itemHeader}>
              <span style={cardStyles.itemTitle}>AI Engine (LangGraph + Groq)</span>
              <span
                style={{
                  ...cardStyles.badge,
                  color: getStatusColor(healthData.services?.ai_engine?.status).text,
                  backgroundColor: getStatusColor(healthData.services?.ai_engine?.status).bg,
                }}
              >
                {(healthData.services?.ai_engine?.status || 'UNKNOWN').toUpperCase()}
              </span>
            </div>
            <p style={cardStyles.itemDesc}>
              Model: <code>{healthData.services?.ai_engine?.model || 'llama-3.3-70b-versatile'}</code>
            </p>
            <div style={cardStyles.meta}>
              {healthData.services?.ai_engine?.message || 'StateGraph ready'}
            </div>
          </div>
        </div>
      )}

      <div style={cardStyles.footer}>
        Last verified: <span>{formatDate(lastChecked || healthData?.timestamp)}</span>
      </div>
    </div>
  );
};

const cardStyles = {
  container: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid #334155',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
    marginBottom: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#f8fafc',
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  refreshBtn: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontWeight: '500',
    fontSize: '0.875rem',
    transition: 'background-color 0.2s',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #ef4444',
    color: '#fca5a5',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '0.9rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
  },
  itemCard: {
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #1e293b',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  itemTitle: {
    fontWeight: '600',
    fontSize: '0.95rem',
    color: '#e2e8f0',
  },
  badge: {
    padding: '2px 8px',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '700',
  },
  itemDesc: {
    margin: '4px 0 8px 0',
    fontSize: '0.85rem',
    color: '#cbd5e1',
  },
  meta: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  footer: {
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px solid #334155',
    fontSize: '0.8rem',
    color: '#64748b',
  },
};

export default HealthCard;
