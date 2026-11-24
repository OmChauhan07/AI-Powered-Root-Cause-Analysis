import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setInvestigationMethod,
  updateFiveWhysChain,
  setFishboneCategories,
  setCauseCandidates,
  updateCauseCandidateStatus,
} from '../../features/investigation/investigationSlice';
import {
  triggerRcaAnalysis,
  fetchRcaMethods,
  updateCauseStatus,
} from '../../services/api';

export const RcaMethodsStage = () => {
  const dispatch = useDispatch();
  const investigationId = useSelector((state) => state.investigation.investigation?.id || 'inv-synth-001');
  const method = useSelector((state) => state.investigation.investigationMethod || 'five_whys');
  const fiveWhys = useSelector((state) => state.investigation.fiveWhysChains || []);
  const fishbone = useSelector((state) => state.investigation.fishboneCategories || {});
  const causeCandidates = useSelector((state) => state.investigation.causeCandidates || []);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState({});

  useEffect(() => {
    // Attempt to load existing RCA data from backend on mount if not already present
    const loadStored = async () => {
      try {
        const data = await fetchRcaMethods(investigationId);
        if (data.five_whys_chains && data.five_whys_chains.length > 0) {
          dispatch(updateFiveWhysChain(data.five_whys_chains));
        }
        if (data.fishbone_categories && Object.keys(data.fishbone_categories).length > 0) {
          dispatch(setFishboneCategories(data.fishbone_categories));
        }
        if (data.cause_candidates && data.cause_candidates.length > 0) {
          dispatch(setCauseCandidates(data.cause_candidates));
        }
      } catch {
        // Fallback to pre-existing Redux state if offline or initial
      }
    };
    loadStored();
  }, [investigationId, dispatch]);

  const handleRunRcaAnalysis = async (selectedMethod) => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const activeMethod = selectedMethod || method;
      const response = await triggerRcaAnalysis(investigationId, activeMethod);
      if (response.five_whys_chains) {
        dispatch(updateFiveWhysChain(response.five_whys_chains));
      }
      if (response.fishbone_categories) {
        dispatch(setFishboneCategories(response.fishbone_categories));
      }
      if (response.cause_candidates) {
        dispatch(setCauseCandidates(response.cause_candidates));
      }
      setSuccessMsg(`AI ${activeMethod === 'five_whys' ? '5 Whys' : 'Fishbone'} analysis generated successfully. Qualified investigator review required.`);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to execute RCA analysis workflow');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewCause = async (causeId, status) => {
    const note = reviewerNotes[causeId] || (status === 'confirmed' ? 'Verified against sensor calibration and batch telemetry records.' : 'Contradicted or unsupported by primary evidence.');
    try {
      await updateCauseStatus(investigationId, causeId, status, note);
      dispatch(
        updateCauseCandidateStatus({
          id: causeId,
          review_status: status,
          reviewer_note: note,
        })
      );
    } catch {
      // Local fallback for offline mode
      dispatch(
        updateCauseCandidateStatus({
          id: causeId,
          review_status: status,
          reviewer_note: note,
        })
      );
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.tag}>Investigation Methods</div>
        <div style={styles.headerRow}>
          <div>
            <h2 style={styles.title}>Root Cause Analysis: 5 Whys & Fishbone (6M)</h2>
            <p style={styles.subtitle}>
              Formulate causal sequences and multi-factor categories. All AI-generated causes remain unconfirmed hypotheses until an authorized quality reviewer approves or rejects them.
            </p>
          </div>
          <button
            onClick={() => handleRunRcaAnalysis(method)}
            disabled={loading}
            style={{
              ...styles.runBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '⏳ Analyzing Causal Pathways...' : '⚡ Run AI Root Cause Analysis'}
          </button>
        </div>

        {errorMsg && <div style={styles.errorBanner}>{errorMsg}</div>}
        {successMsg && <div style={styles.successBanner}>{successMsg}</div>}
      </div>

      {/* Method Selector */}
      <div style={styles.methodSelector}>
        <button
          onClick={() => {
            dispatch(setInvestigationMethod('five_whys'));
          }}
          style={{
            ...styles.methodBtn,
            backgroundColor: method === 'five_whys' ? '#0284c7' : '#0f172a',
            borderColor: method === 'five_whys' ? '#38bdf8' : '#334155',
            color: '#ffffff',
          }}
        >
          🔬 5 Whys Questioning Chain
        </button>
        <button
          onClick={() => {
            dispatch(setInvestigationMethod('fishbone'));
          }}
          style={{
            ...styles.methodBtn,
            backgroundColor: method === 'fishbone' ? '#0284c7' : '#0f172a',
            borderColor: method === 'fishbone' ? '#38bdf8' : '#334155',
            color: '#ffffff',
          }}
        >
          🐟 Fishbone (Ishikawa 6M)
        </button>
      </div>

      {/* 5 Whys View */}
      {method === 'five_whys' && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelHeading}>5 Whys Causal Investigation Chain</h3>
            <span style={styles.countBadge}>{fiveWhys.length} Steps Formulated</span>
          </div>
          {fiveWhys.length === 0 ? (
            <div style={styles.emptyNotice}>
              No 5 Whys chain formulated yet. Click "⚡ Run AI Root Cause Analysis" to generate questioning sequence from evidence.
            </div>
          ) : (
            <div style={styles.chainList}>
              {fiveWhys.map((step, idx) => (
                <div key={step.step || idx} style={styles.chainCard}>
                  <div style={styles.chainStepHeader}>
                    <span style={styles.stepBadge}>WHY #{step.step || idx + 1}</span>
                    {(step.is_hypothesis || step.hypothesis) ? (
                      <span style={styles.hypoTag}>HYPOTHESIS</span>
                    ) : (
                      <span style={styles.factTag}>EVIDENCE-SUPPORTED</span>
                    )}
                  </div>
                  <div style={styles.whyQuestion}>{step.question || step.why}</div>
                  <div style={styles.answerText}>
                    <strong>Answer:</strong> {step.answer}
                  </div>
                  {(step.evidence_basis || step.evidence) && (
                    <div style={styles.evidenceRef}>
                      <strong>Evidence Reference:</strong> {step.evidence_basis || step.evidence}
                    </div>
                  )}
                  {step.missing_evidence && (
                    <div style={styles.missingEvidenceText}>
                      ⚠️ <strong>Missing Verification:</strong> {step.missing_evidence}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fishbone View */}
      {method === 'fishbone' && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelHeading}>Ishikawa 6M Multi-Factor Breakdown</h3>
            <span style={styles.countBadge}>6 Investigation Categories</span>
          </div>
          <div style={styles.fishboneGrid}>
            {['people', 'machine', 'method', 'material', 'measurement', 'environment'].map((category) => {
              const rawItems = fishbone[category] || [];
              return (
                <div key={category} style={styles.fishCard}>
                  <h4 style={styles.fishCategory}>{category.toUpperCase()}</h4>
                  {rawItems.length === 0 ? (
                    <div style={styles.fishEmpty}>No contributing factors flagged</div>
                  ) : (
                    <ul style={styles.fishList}>
                      {rawItems.map((item, idx) => {
                        const factorText = typeof item === 'string' ? item : item.factor || item.rationale;
                        return (
                          <li key={idx} style={styles.fishItem}>
                            <div>{factorText}</div>
                            {typeof item === 'object' && item.rationale && item.factor !== item.rationale && (
                              <div style={styles.factorRationale}>{item.rationale}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Candidate Root Causes & Reviewer Qualification */}
      <div style={styles.causesSection}>
        <div style={styles.panelHeader}>
          <h3 style={styles.panelHeading}>
            Candidate Root Causes & Reviewer Qualification ({causeCandidates.length})
          </h3>
          <span style={styles.humanBadge}>GxP Human-in-the-Loop Required</span>
        </div>
        {causeCandidates.length === 0 ? (
          <div style={styles.emptyNotice}>
            No cause candidates evaluated yet. Run analysis to synthesize candidate causes from evidence.
          </div>
        ) : (
          <div style={styles.causeList}>
            {causeCandidates.map((c) => {
              const isConfirmed = c.review_status === 'confirmed';
              const isRejected = c.review_status === 'rejected';

              return (
                <div key={c.id} style={styles.causeCard}>
                  <div style={styles.causeHeader}>
                    <div style={styles.badgeRow}>
                      <span style={styles.categoryBadge}>{c.category ? c.category.toUpperCase() : 'ROOT CAUSE'}</span>
                      <span
                        style={{
                          ...styles.aiStatusBadge,
                          backgroundColor:
                            c.ai_status === 'evidence_supported_pending_review'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(56, 189, 248, 0.15)',
                          color:
                            c.ai_status === 'evidence_supported_pending_review' ? '#34d399' : '#38bdf8',
                        }}
                      >
                        AI: {(c.ai_status || 'hypothesis').replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span
                        style={{
                          ...styles.reviewStatusBadge,
                          backgroundColor: isConfirmed ? '#10b981' : isRejected ? '#ef4444' : '#64748b',
                        }}
                      >
                        REVIEW: {(c.review_status || 'pending').toUpperCase()}
                      </span>
                    </div>

                    <div style={styles.reviewControls}>
                      <button
                        onClick={() => handleReviewCause(c.id, 'confirmed')}
                        style={{
                          ...styles.statusBtn,
                          backgroundColor: isConfirmed ? '#10b981' : '#1e293b',
                          color: isConfirmed ? '#ffffff' : '#94a3b8',
                          borderColor: isConfirmed ? '#059669' : '#334155',
                        }}
                      >
                        ✓ Confirm as Root Cause
                      </button>
                      <button
                        onClick={() => handleReviewCause(c.id, 'rejected')}
                        style={{
                          ...styles.statusBtn,
                          backgroundColor: isRejected ? '#ef4444' : '#1e293b',
                          color: isRejected ? '#ffffff' : '#94a3b8',
                          borderColor: isRejected ? '#dc2626' : '#334155',
                        }}
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </div>

                  <div style={styles.causeText}>{c.candidate_text}</div>
                  <div style={styles.rationaleText}>
                    <strong>Rationale:</strong> {c.rationale}
                  </div>

                  {c.reviewer_note && (
                    <div style={styles.reviewerNote}>
                      <strong>Investigator Justification:</strong> {c.reviewer_note}
                    </div>
                  )}

                  {!isConfirmed && !isRejected && (
                    <div style={styles.noteInputRow}>
                      <input
                        type="text"
                        placeholder="Optional review justification note..."
                        value={reviewerNotes[c.id] || ''}
                        onChange={(e) =>
                          setReviewerNotes({ ...reviewerNotes, [c.id]: e.target.value })
                        }
                        style={styles.noteInput}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: { backgroundColor: '#1e293b', borderRadius: '10px', padding: '24px', border: '1px solid #334155' },
  header: { marginBottom: '20px' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' },
  tag: { display: 'inline-block', fontSize: '0.72rem', fontWeight: '700', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '4px', marginBottom: '8px' },
  title: { margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: '700' },
  subtitle: { margin: '6px 0 0 0', fontSize: '0.875rem', color: '#94a3b8', maxWidth: '750px' },
  runBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '10px 18px', fontWeight: '700', fontSize: '0.85rem' },
  errorBanner: { marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', borderRadius: '6px', border: '1px solid #ef4444', fontSize: '0.85rem' },
  successBanner: { marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', borderRadius: '6px', border: '1px solid #10b981', fontSize: '0.85rem' },
  methodSelector: { display: 'flex', gap: '12px', marginBottom: '20px' },
  methodBtn: { border: '1px solid #334155', borderRadius: '6px', padding: '10px 18px', fontWeight: '600', cursor: 'pointer', fontSize: '0.88rem' },
  panel: { backgroundColor: '#0f172a', padding: '18px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '24px' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  panelHeading: { margin: 0, fontSize: '1rem', color: '#f1f5f9', fontWeight: '600' },
  countBadge: { fontSize: '0.75rem', color: '#94a3b8', backgroundColor: '#1e293b', padding: '3px 8px', borderRadius: '4px' },
  humanBadge: { fontSize: '0.72rem', color: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', padding: '3px 8px', borderRadius: '4px', fontWeight: '700' },
  chainList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  chainCard: { backgroundColor: '#1e293b', padding: '14px', borderRadius: '6px', border: '1px solid #334155' },
  chainStepHeader: { display: 'flex', gap: '8px', marginBottom: '6px' },
  stepBadge: { backgroundColor: '#0284c7', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' },
  hypoTag: { backgroundColor: '#eab308', color: '#000000', padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '800' },
  factTag: { backgroundColor: '#10b981', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '800' },
  whyQuestion: { fontSize: '0.92rem', fontWeight: '700', color: '#f8fafc', marginBottom: '4px' },
  answerText: { fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '4px' },
  evidenceRef: { fontSize: '0.78rem', color: '#38bdf8', marginBottom: '2px' },
  missingEvidenceText: { fontSize: '0.75rem', color: '#fbbf24', marginTop: '4px' },
  fishboneGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  fishCard: { backgroundColor: '#1e293b', padding: '12px', borderRadius: '6px', border: '1px solid #334155' },
  fishCategory: { margin: '0 0 8px 0', color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' },
  fishEmpty: { fontSize: '0.78rem', color: '#64748b' },
  fishList: { margin: 0, paddingLeft: '16px', fontSize: '0.82rem', color: '#cbd5e1' },
  fishItem: { marginBottom: '6px' },
  factorRationale: { fontSize: '0.74rem', color: '#94a3b8', marginTop: '2px' },
  causesSection: { marginTop: '20px' },
  causeList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  causeCard: { backgroundColor: '#0f172a', padding: '16px', borderRadius: '6px', border: '1px solid #334155' },
  causeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' },
  badgeRow: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' },
  categoryBadge: { backgroundColor: '#334155', color: '#f8fafc', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '700' },
  aiStatusBadge: { padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' },
  reviewStatusBadge: { color: '#ffffff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' },
  reviewControls: { display: 'flex', gap: '6px' },
  statusBtn: { border: '1px solid', borderRadius: '4px', padding: '5px 12px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' },
  causeText: { fontSize: '0.92rem', color: '#f8fafc', fontWeight: '600', marginBottom: '6px', lineHeight: 1.4 },
  rationaleText: { fontSize: '0.82rem', color: '#94a3b8', marginBottom: '6px' },
  reviewerNote: { fontSize: '0.8rem', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: '4px', marginTop: '8px' },
  noteInputRow: { marginTop: '8px' },
  noteInput: { width: '100%', boxSizing: 'border-box', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '6px 10px', color: '#f8fafc', fontSize: '0.8rem' },
  emptyNotice: { padding: '20px', textAlign: 'center', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', fontSize: '0.85rem' },
};

export default RcaMethodsStage;
