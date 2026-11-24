import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  STAGES,
  setActiveStage,
  loadSyntheticSampleData,
  resetInvestigation,
} from '../features/investigation/investigationSlice';

export const StageNav = () => {
  const dispatch = useDispatch();
  const activeStage = useSelector((state) => state.investigation.activeStage);
  const investigation = useSelector((state) => state.investigation.investigation);
  const incidentFields = useSelector((state) => state.investigation.incidentFields);

  return (
    <div style={navStyles.container}>
      <div style={navStyles.topBar}>
        <div>
          <div style={navStyles.refCode}>
            {investigation.reference_code || 'NEW DRAFT INVESTIGATION'}
            <span
              style={{
                ...navStyles.statusTag,
                backgroundColor:
                  investigation.status === 'confirmed'
                    ? 'rgba(16, 185, 129, 0.2)'
                    : 'rgba(245, 158, 11, 0.2)',
                color:
                  investigation.status === 'confirmed' ? '#10b981' : '#f59e0b',
              }}
            >
              {investigation.status.toUpperCase()}
            </span>
          </div>
          <div style={navStyles.invTitle}>
            {incidentFields.product_name
              ? `${incidentFields.product_name} • ${incidentFields.batch_number || 'No Batch'}`
              : 'Pharmaceutical API Root Cause Analysis & CAPA'}
          </div>
        </div>

        <div style={navStyles.actionGroup}>
          <button
            onClick={() => dispatch(loadSyntheticSampleData())}
            style={navStyles.sampleBtn}
            title="Load sample API-X crystallization deviation scenario"
          >
            📋 Load Sample API-X Incident
          </button>
          <button
            onClick={() => dispatch(resetInvestigation())}
            style={navStyles.clearBtn}
            title="Reset workspace fields"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Workflow Stages Tabs */}
      <div style={navStyles.tabsWrapper}>
        {STAGES.map((stage) => {
          const isActive = activeStage === stage.id;
          return (
            <button
              key={stage.id}
              onClick={() => dispatch(setActiveStage(stage.id))}
              style={{
                ...navStyles.tabBtn,
                borderBottom: isActive
                  ? '3px solid #38bdf8'
                  : '3px solid transparent',
                backgroundColor: isActive ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                color: isActive ? '#f8fafc' : '#94a3b8',
              }}
            >
              <div style={navStyles.tabLabel}>{stage.label}</div>
              <div style={navStyles.tabDesc}>{stage.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const navStyles = {
  container: {
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #1e293b',
    padding: '16px 24px 0 24px',
    marginBottom: '24px',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '16px',
  },
  refCode: {
    fontSize: '0.82rem',
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#38bdf8',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusTag: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: '800',
    letterSpacing: '0.04em',
  },
  invTitle: {
    fontSize: '1.15rem',
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: '4px',
  },
  actionGroup: {
    display: 'flex',
    gap: '8px',
  },
  sampleBtn: {
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    border: '1px solid #0284c7',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  clearBtn: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  tabsWrapper: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: '4px',
  },
  tabBtn: {
    border: 'none',
    padding: '10px 12px',
    textAlign: 'left',
    cursor: 'pointer',
    borderRadius: '6px 6px 0 0',
    transition: 'all 0.15s ease',
  },
  tabLabel: {
    fontSize: '0.85rem',
    fontWeight: '700',
  },
  tabDesc: {
    fontSize: '0.7rem',
    marginTop: '2px',
    opacity: 0.8,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};

export default StageNav;
