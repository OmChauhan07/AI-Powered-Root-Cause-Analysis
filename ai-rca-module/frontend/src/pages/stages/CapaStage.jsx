import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateCapaActionStatus } from '../../features/investigation/investigationSlice';

export const CapaStage = () => {
  const dispatch = useDispatch();
  const capaActions = useSelector((state) => state.investigation.capaRecommendations);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.tag}>CAPA Management</div>
        <h2 style={styles.title}>Corrective and Preventive Actions (CAPA)</h2>
        <p style={styles.subtitle}>
          AI-generated CAPA recommendations linked to established root causes. Actions must be justified by evidence and require human review.
        </p>
      </div>

      {capaActions.length === 0 ? (
        <div style={styles.emptyNotice}>
          No CAPA recommendations generated yet. Complete cause analysis or load the sample scenario.
        </div>
      ) : (
        <div style={styles.actionGrid}>
          {capaActions.map((action) => (
            <div key={action.id} style={styles.actionCard}>
              <div style={styles.cardHeader}>
                <span
                  style={{
                    ...styles.typeBadge,
                    backgroundColor:
                      action.action_type === 'corrective'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : 'rgba(56, 189, 248, 0.15)',
                    color: action.action_type === 'corrective' ? '#f87171' : '#38bdf8',
                  }}
                >
                  {action.action_type.toUpperCase()} ACTION
                </span>
                <div style={styles.statusGroup}>
                  <button
                    onClick={() =>
                      dispatch(
                        updateCapaActionStatus({ id: action.id, review_status: 'accepted' })
                      )
                    }
                    style={{
                      ...styles.statusBtn,
                      backgroundColor: action.review_status === 'accepted' ? '#10b981' : '#1e293b',
                      color: action.review_status === 'accepted' ? '#ffffff' : '#94a3b8',
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() =>
                      dispatch(
                        updateCapaActionStatus({ id: action.id, review_status: 'rejected' })
                      )
                    }
                    style={{
                      ...styles.statusBtn,
                      backgroundColor: action.review_status === 'rejected' ? '#ef4444' : '#1e293b',
                      color: action.review_status === 'rejected' ? '#ffffff' : '#94a3b8',
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div style={styles.actionText}>{action.action_text}</div>

              <div style={styles.metaGrid}>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Rationale:</span>
                  <span style={styles.metaValue}>{action.rationale}</span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Responsible Role:</span>
                  <span style={styles.metaValue}>{action.suggested_owner_role}</span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Proposed Due Date:</span>
                  <span style={styles.metaValue}>{action.proposed_due_date || 'TBD'}</span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Effectiveness Check:</span>
                  <span style={styles.metaValue}>{action.effectiveness_check}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: { backgroundColor: '#1e293b', borderRadius: '10px', padding: '24px', border: '1px solid #334155' },
  header: { marginBottom: '20px' },
  tag: { display: 'inline-block', fontSize: '0.72rem', fontWeight: '700', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px', marginBottom: '8px' },
  title: { margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: '700' },
  subtitle: { margin: '6px 0 0 0', fontSize: '0.875rem', color: '#94a3b8' },
  actionGrid: { display: 'flex', flexDirection: 'column', gap: '16px' },
  actionCard: { backgroundColor: '#0f172a', borderRadius: '8px', padding: '18px', border: '1px solid #334155' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  typeBadge: { fontSize: '0.7rem', fontWeight: '800', padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.04em' },
  statusGroup: { display: 'flex', gap: '6px' },
  statusBtn: { border: '1px solid #334155', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' },
  actionText: { fontSize: '1rem', fontWeight: '600', color: '#f8fafc', marginBottom: '14px', lineHeight: 1.4 },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', backgroundColor: '#1e293b', padding: '12px', borderRadius: '6px' },
  metaItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  metaLabel: { fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600' },
  metaValue: { fontSize: '0.82rem', color: '#f1f5f9' },
  emptyNotice: { padding: '24px', textAlign: 'center', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', fontSize: '0.85rem' },
};

export default CapaStage;
