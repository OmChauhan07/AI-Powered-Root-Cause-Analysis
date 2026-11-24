import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setCapaRecommendations,
  updateCapaActionStatus,
} from '../../features/investigation/investigationSlice';
import {
  triggerCapaGeneration,
  fetchCapaActions,
  reviewCapaAction,
} from '../../services/api';

export const CapaStage = () => {
  const dispatch = useDispatch();
  const investigationId = useSelector((state) => state.investigation.investigation?.id || 'inv-synth-001');
  const capaActions = useSelector((state) => state.investigation.capaRecommendations || []);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deferredReason, setDeferredReason] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'containment' | 'corrective' | 'preventive' | 'investigation_followup'
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({});

  useEffect(() => {
    const loadStored = async () => {
      try {
        const data = await fetchCapaActions(investigationId);
        if (data.capa_recommendations && data.capa_recommendations.length > 0) {
          dispatch(setCapaRecommendations(data.capa_recommendations));
        }
      } catch {
        // Fallback to local Redux state
      }
    };
    loadStored();
  }, [investigationId, dispatch]);

  const handleGenerateCapa = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setDeferredReason('');
    try {
      const response = await triggerCapaGeneration(investigationId);
      if (response.capa_recommendations) {
        dispatch(setCapaRecommendations(response.capa_recommendations));
      }
      if (response.deferred_reason) {
        setDeferredReason(response.deferred_reason);
      }
      setSuccessMsg('Evidence-linked CAPA recommendations formulated successfully.');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to generate CAPA action recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewAction = async (actionId, status) => {
    try {
      await reviewCapaAction(investigationId, actionId, status);
      dispatch(updateCapaActionStatus({ id: actionId, review_status: status }));
      setSuccessMsg(`Action marked as '${status}'.`);
    } catch {
      // Local fallback
      dispatch(updateCapaActionStatus({ id: actionId, review_status: status }));
      setSuccessMsg(`Action marked as '${status}' (local update).`);
    }
  };

  const handleSaveEdit = async (actionId) => {
    const current = capaActions.find((a) => a.id === actionId);
    if (!current) return;

    const updatedText = editFields.action_text !== undefined ? editFields.action_text : current.action_text;
    const updatedCheck = editFields.effectiveness_check !== undefined ? editFields.effectiveness_check : current.effectiveness_check;
    const updatedRole = editFields.owner_role !== undefined ? editFields.owner_role : current.owner_role;

    try {
      await reviewCapaAction(investigationId, actionId, 'edited', updatedText, updatedCheck, updatedRole);
      dispatch(
        updateCapaActionStatus({
          id: actionId,
          review_status: 'edited',
          action_text: updatedText,
          effectiveness_check: updatedCheck,
        })
      );
      setEditingId(null);
      setSuccessMsg('CAPA action successfully updated and marked as EDITED.');
    } catch {
      dispatch(
        updateCapaActionStatus({
          id: actionId,
          review_status: 'edited',
          action_text: updatedText,
          effectiveness_check: updatedCheck,
        })
      );
      setEditingId(null);
      setSuccessMsg('CAPA action updated locally.');
    }
  };

  const filteredActions = capaActions.filter((a) => {
    if (filterType === 'all') return true;
    return a.action_type === filterType;
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.tag}>CAPA Action Management</div>
        <div style={styles.headerRow}>
          <div>
            <h2 style={styles.title}>Corrective & Preventive Actions (CAPA)</h2>
            <p style={styles.subtitle}>
              Formulate evidence-linked containment, corrective, and preventive actions. Every suggestion must address a verified root cause or open evidence gap, specify an objective effectiveness check, and require quality professional sign-off.
            </p>
          </div>
          <button
            onClick={handleGenerateCapa}
            disabled={loading}
            style={{
              ...styles.generateBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '⏳ Synthesizing CAPA Plan...' : '⚡ Generate AI CAPA Recommendations'}
          </button>
        </div>

        {errorMsg && <div style={styles.errorBanner}>{errorMsg}</div>}
        {successMsg && <div style={styles.successBanner}>{successMsg}</div>}

        {deferredReason && (
          <div style={styles.deferredBanner}>
            <div style={styles.deferredTitle}>⚠️ Preventive CAPA Deferral Notice</div>
            <div>{deferredReason}</div>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>Filter Actions:</span>
        {[
          { key: 'all', label: `All (${capaActions.length})` },
          { key: 'containment', label: 'Containment / Holds' },
          { key: 'corrective', label: 'Corrective Actions' },
          { key: 'preventive', label: 'Preventive Measures' },
          { key: 'investigation_followup', label: 'Investigation Follow-up' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterType(tab.key)}
            style={{
              ...styles.filterBtn,
              backgroundColor: filterType === tab.key ? '#0284c7' : '#0f172a',
              color: filterType === tab.key ? '#ffffff' : '#94a3b8',
              borderColor: filterType === tab.key ? '#38bdf8' : '#334155',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredActions.length === 0 ? (
        <div style={styles.emptyNotice}>
          No CAPA action recommendations found for this filter. Click "⚡ Generate AI CAPA Recommendations" to synthesize action plans from supported root causes.
        </div>
      ) : (
        <div style={styles.actionGrid}>
          {filteredActions.map((action) => {
            const isEditing = editingId === action.id;
            const isAccepted = action.review_status === 'accepted';
            const isRejected = action.review_status === 'rejected';
            const isEdited = action.review_status === 'edited';

            const typeColorMap = {
              containment: { bg: 'rgba(249, 115, 22, 0.15)', text: '#fb923c', border: '#ea580c' },
              corrective: { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: '#0284c7' },
              preventive: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#059669' },
              investigation_followup: { bg: 'rgba(234, 179, 8, 0.15)', text: '#facc15', border: '#ca8a04' },
            };
            const typeStyle = typeColorMap[action.action_type] || typeColorMap.corrective;

            return (
              <div key={action.id} style={styles.actionCard}>
                <div style={styles.cardHeader}>
                  <div style={styles.badgeRow}>
                    <span
                      style={{
                        ...styles.typeBadge,
                        backgroundColor: typeStyle.bg,
                        color: typeStyle.text,
                        border: `1px solid ${typeStyle.border}`,
                      }}
                    >
                      {action.action_type.replace('_', ' ').toUpperCase()}
                    </span>
                    <span
                      style={{
                        ...styles.reviewBadge,
                        backgroundColor:
                          isAccepted ? '#10b981' : isRejected ? '#ef4444' : isEdited ? '#8b5cf6' : '#64748b',
                      }}
                    >
                      {(action.review_status || 'pending_review').replace('_', ' ').toUpperCase()}
                    </span>
                    {action.cause_candidate_id && (
                      <span style={styles.causeLinkedBadge}>🔗 Linked to Root Cause</span>
                    )}
                  </div>

                  <div style={styles.statusGroup}>
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(action.id);
                            setEditFields({
                              action_text: action.action_text,
                              effectiveness_check: action.effectiveness_check,
                              owner_role: action.owner_role,
                            });
                          }}
                          style={styles.editBtn}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleReviewAction(action.id, 'accepted')}
                          style={{
                            ...styles.statusBtn,
                            backgroundColor: isAccepted ? '#10b981' : '#1e293b',
                            color: isAccepted ? '#ffffff' : '#94a3b8',
                            borderColor: isAccepted ? '#059669' : '#334155',
                          }}
                        >
                          ✓ Accept
                        </button>
                        <button
                          onClick={() => handleReviewAction(action.id, 'rejected')}
                          style={{
                            ...styles.statusBtn,
                            backgroundColor: isRejected ? '#ef4444' : '#1e293b',
                            color: isRejected ? '#ffffff' : '#94a3b8',
                            borderColor: isRejected ? '#dc2626' : '#334155',
                          }}
                        >
                          ✕ Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div style={styles.actionTitle}>{action.title}</div>

                {isEditing ? (
                  <div style={styles.editForm}>
                    <label style={styles.fieldLabel}>Action Plan Statement:</label>
                    <textarea
                      rows={3}
                      value={editFields.action_text !== undefined ? editFields.action_text : action.action_text}
                      onChange={(e) => setEditFields({ ...editFields, action_text: e.target.value })}
                      style={styles.textArea}
                    />

                    <label style={styles.fieldLabel}>Effectiveness Verification Criteria:</label>
                    <textarea
                      rows={2}
                      value={editFields.effectiveness_check !== undefined ? editFields.effectiveness_check : action.effectiveness_check || ''}
                      onChange={(e) => setEditFields({ ...editFields, effectiveness_check: e.target.value })}
                      style={styles.textArea}
                    />

                    <label style={styles.fieldLabel}>Responsible Functional Role:</label>
                    <input
                      type="text"
                      value={editFields.owner_role !== undefined ? editFields.owner_role : action.owner_role || ''}
                      onChange={(e) => setEditFields({ ...editFields, owner_role: e.target.value })}
                      style={styles.inputField}
                    />

                    <div style={styles.editActions}>
                      <button onClick={() => handleSaveEdit(action.id)} style={styles.saveBtn}>
                        ✓ Save Changes
                      </button>
                      <button onClick={() => setEditingId(null)} style={styles.cancelBtn}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={styles.actionText}>{action.action_text}</div>

                    <div style={styles.metaGrid}>
                      <div style={styles.metaItem}>
                        <span style={styles.metaLabel}>Causal Rationale:</span>
                        <span style={styles.metaValue}>{action.rationale}</span>
                      </div>
                      <div style={styles.metaItem}>
                        <span style={styles.metaLabel}>Assigned Functional Role:</span>
                        <span style={{ ...styles.metaValue, color: '#38bdf8', fontWeight: '600' }}>
                          {action.owner_role || action.suggested_owner_role || 'Quality Assurance Lead'}
                        </span>
                      </div>
                      <div style={styles.metaItem}>
                        <span style={styles.metaLabel}>Objective Effectiveness Check:</span>
                        <span style={{ ...styles.metaValue, color: '#34d399' }}>
                          {action.effectiveness_check || 'Audit subsequent batches for zero recurrence.'}
                        </span>
                      </div>
                      <div style={styles.metaItem}>
                        <span style={styles.metaLabel}>Target Due Date:</span>
                        <span style={styles.metaValue}>
                          {action.due_date || action.proposed_due_date || 'To be determined by QA sign-off'}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: { backgroundColor: '#1e293b', borderRadius: '10px', padding: '24px', border: '1px solid #334155' },
  header: { marginBottom: '20px' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' },
  tag: { display: 'inline-block', fontSize: '0.72rem', fontWeight: '700', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px', marginBottom: '8px' },
  title: { margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: '700' },
  subtitle: { margin: '6px 0 0 0', fontSize: '0.875rem', color: '#94a3b8', maxWidth: '780px' },
  generateBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '10px 18px', fontWeight: '700', fontSize: '0.85rem' },
  errorBanner: { marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', borderRadius: '6px', border: '1px solid #ef4444', fontSize: '0.85rem' },
  successBanner: { marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', borderRadius: '6px', border: '1px solid #10b981', fontSize: '0.85rem' },
  deferredBanner: { marginTop: '12px', padding: '12px 16px', backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', color: '#fde68a', fontSize: '0.85rem' },
  deferredTitle: { fontWeight: '700', marginBottom: '4px', color: '#fbbf24' },
  filterBar: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  filterLabel: { fontSize: '0.78rem', color: '#94a3b8', fontWeight: '600', marginRight: '4px' },
  filterBtn: { border: '1px solid #334155', borderRadius: '6px', padding: '6px 12px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' },
  actionGrid: { display: 'flex', flexDirection: 'column', gap: '16px' },
  actionCard: { backgroundColor: '#0f172a', borderRadius: '8px', padding: '18px', border: '1px solid #334155' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' },
  badgeRow: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' },
  typeBadge: { fontSize: '0.7rem', fontWeight: '800', padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.04em' },
  reviewBadge: { color: '#ffffff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' },
  causeLinkedBadge: { backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '600' },
  statusGroup: { display: 'flex', gap: '6px' },
  editBtn: { backgroundColor: '#1e293b', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '4px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' },
  statusBtn: { border: '1px solid #334155', borderRadius: '4px', padding: '5px 12px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' },
  actionTitle: { fontSize: '1rem', fontWeight: '700', color: '#f8fafc', marginBottom: '6px' },
  actionText: { fontSize: '0.92rem', color: '#cbd5e1', marginBottom: '14px', lineHeight: 1.4 },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', backgroundColor: '#1e293b', padding: '12px', borderRadius: '6px' },
  metaItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  metaLabel: { fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600' },
  metaValue: { fontSize: '0.82rem', color: '#f1f5f9' },
  editForm: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' },
  fieldLabel: { fontSize: '0.76rem', color: '#94a3b8', fontWeight: '600', marginTop: '6px' },
  textArea: { width: '100%', boxSizing: 'border-box', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '8px 10px', color: '#f8fafc', fontSize: '0.85rem' },
  inputField: { width: '100%', boxSizing: 'border-box', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '8px 10px', color: '#f8fafc', fontSize: '0.85rem' },
  editActions: { display: 'flex', gap: '8px', marginTop: '8px' },
  saveBtn: { backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' },
  cancelBtn: { backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' },
  emptyNotice: { padding: '24px', textAlign: 'center', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', fontSize: '0.85rem' },
};

export default CapaStage;
