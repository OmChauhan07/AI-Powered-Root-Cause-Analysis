import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setInvestigationMethod,
  updateFiveWhysChain,
  setFishboneCategories,
  setCauseCandidates,
  setCauseEvidenceMatrix,
  updateCauseCandidateStatus,
} from '../../features/investigation/investigationSlice';
import {
  triggerRcaAnalysis,
  fetchRcaMethods,
  updateCauseStatus,
  triggerCauseAssessment,
  fetchCauseAssessmentMatrix,
} from '../../services/api';

export const RcaMethodsStage = () => {
  const dispatch = useDispatch();
  const investigationId = useSelector((state) => state.investigation.investigation?.id || 'inv-synth-001');
  const storedMethod = useSelector((state) => state.investigation.investigationMethod || 'five_whys');
  const fiveWhys = useSelector((state) => state.investigation.fiveWhysChains || []);
  const fishbone = useSelector((state) => state.investigation.fishboneCategories || {});
  const causeCandidates = useSelector((state) => state.investigation.causeCandidates || []);
  const matrix = useSelector((state) => state.investigation.causeEvidenceMatrix || []);

  const [activeTab, setActiveTab] = useState(storedMethod || 'five_whys'); // 'five_whys' | 'fishbone' | 'matrix'
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState({});

  useEffect(() => {
    // Attempt to load existing RCA data and matrix from backend on mount
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
        // Fallback to local Redux
      }

      try {
        const matData = await fetchCauseAssessmentMatrix(investigationId);
        if (matData.matrix && matData.matrix.length > 0) {
          dispatch(setCauseEvidenceMatrix(matData.matrix));
        }
      } catch {
        // Fallback
      }
    };
    loadStored();
  }, [investigationId, dispatch]);

  const handleRunRcaAnalysis = async (selectedMethod) => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const activeMethod = selectedMethod || (activeTab === 'fishbone' ? 'fishbone' : 'five_whys');
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
      setSuccessMsg(`AI ${activeMethod === 'five_whys' ? '5 Whys' : 'Fishbone'} analysis generated successfully.`);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to execute RCA analysis workflow');
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluateMatrix = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const matResponse = await triggerCauseAssessment(investigationId);
      if (matResponse.matrix) {
        dispatch(setCauseEvidenceMatrix(matResponse.matrix));
      }
      setSuccessMsg('Cause/Evidence Assessment Matrix evaluated against empirical records and telemetry.');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to evaluate cause-evidence matrix');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewCause = async (causeId, status) => {
    const userNote = reviewerNotes[causeId]?.trim();
    if (!userNote) {
      setErrorMsg(`A justification note from the quality investigator is mandatory to ${status} a cause candidate under GxP compliance.`);
      return;
    }
    setErrorMsg('');

    try {
      await updateCauseStatus(investigationId, causeId, status, userNote);
      dispatch(
        updateCauseCandidateStatus({
          id: causeId,
          review_status: status,
          reviewer_note: userNote,
        })
      );
      // Also update local matrix item if present
      if (matrix.length > 0) {
        const updatedMatrix = matrix.map((m) =>
          (m.cause_id === causeId || m.id === causeId)
            ? { ...m, review_status: status, reviewer_note: userNote }
            : m
        );
        dispatch(setCauseEvidenceMatrix(updatedMatrix));
      }
      setSuccessMsg(`Cause candidate marked as '${status}' by reviewer.`);
    } catch {
      // Local fallback for offline mode
      dispatch(
        updateCauseCandidateStatus({
          id: causeId,
          review_status: status,
          reviewer_note: userNote,
        })
      );
      if (matrix.length > 0) {
        const updatedMatrix = matrix.map((m) =>
          (m.cause_id === causeId || m.id === causeId)
            ? { ...m, review_status: status, reviewer_note: userNote }
            : m
        );
        dispatch(setCauseEvidenceMatrix(updatedMatrix));
      }
      setSuccessMsg(`Cause candidate marked as '${status}' (local update).`);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.tag}>Investigation Methods & Evidence Assessment</div>
        <div style={styles.headerRow}>
          <div>
            <h2 style={styles.title}>Root Cause Analysis & Evidence Assessment</h2>
            <p style={styles.subtitle}>
              Formulate causal sequences (5 Whys), multi-factor breakdowns (Ishikawa 6M), and evaluate candidates against supporting vs contradicting empirical records. All AI findings remain unconfirmed hypotheses until confirmed by a qualified human investigator.
            </p>
          </div>
          <div style={styles.headerActions}>
            {activeTab === 'matrix' ? (
              <button
                onClick={handleEvaluateMatrix}
                disabled={loading}
                style={{
                  ...styles.runBtn,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? '⏳ Evaluating Evidence Matrix...' : '⚖️ Evaluate Cause/Evidence Matrix'}
              </button>
            ) : (
              <button
                onClick={() => handleRunRcaAnalysis(activeTab)}
                disabled={loading}
                style={{
                  ...styles.runBtn,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? '⏳ Analyzing Causal Pathways...' : '⚡ Run AI Root Cause Analysis'}
              </button>
            )}
          </div>
        </div>

        {errorMsg && <div style={styles.errorBanner}>{errorMsg}</div>}
        {successMsg && <div style={styles.successBanner}>{successMsg}</div>}
      </div>

      {/* Primary Tab Navigation */}
      <div style={styles.methodSelector}>
        <button
          onClick={() => {
            setActiveTab('five_whys');
            dispatch(setInvestigationMethod('five_whys'));
          }}
          style={{
            ...styles.methodBtn,
            backgroundColor: activeTab === 'five_whys' ? '#0284c7' : '#0f172a',
            borderColor: activeTab === 'five_whys' ? '#38bdf8' : '#334155',
            color: '#ffffff',
          }}
        >
          🔬 5 Whys Questioning Chain
        </button>
        <button
          onClick={() => {
            setActiveTab('fishbone');
            dispatch(setInvestigationMethod('fishbone'));
          }}
          style={{
            ...styles.methodBtn,
            backgroundColor: activeTab === 'fishbone' ? '#0284c7' : '#0f172a',
            borderColor: activeTab === 'fishbone' ? '#38bdf8' : '#334155',
            color: '#ffffff',
          }}
        >
          🐟 Fishbone (Ishikawa 6M)
        </button>
        <button
          onClick={() => setActiveTab('matrix')}
          style={{
            ...styles.methodBtn,
            backgroundColor: activeTab === 'matrix' ? '#0284c7' : '#0f172a',
            borderColor: activeTab === 'matrix' ? '#38bdf8' : '#334155',
            color: '#ffffff',
          }}
        >
          ⚖️ Cause vs Evidence Matrix ({matrix.length > 0 ? matrix.length : causeCandidates.length})
        </button>
      </div>

      {/* 5 Whys View */}
      {activeTab === 'five_whys' && (
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
      {activeTab === 'fishbone' && (
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

      {/* Cause vs Evidence Matrix View */}
      {activeTab === 'matrix' && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <h3 style={styles.panelHeading}>Empirical Cause vs Evidence Correlation Matrix</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                Cross-references potential root causes against supporting data, contradicting lab tests, timeline checks, and missing gaps.
              </p>
            </div>
            <span style={styles.humanBadge}>GxP Review Sign-Off Required</span>
          </div>

          {(matrix.length === 0 && causeCandidates.length === 0) ? (
            <div style={styles.emptyNotice}>
              No cause candidates evaluated yet. Click "⚖️ Evaluate Cause/Evidence Matrix" to correlate candidates against evidence.
            </div>
          ) : (
            <div style={styles.matrixList}>
              {(matrix.length > 0 ? matrix : causeCandidates).map((item) => {
                const causeId = item.cause_id || item.id;
                const isConfirmed = item.review_status === 'confirmed';
                const isRejected = item.review_status === 'rejected';

                const aiStatus = item.ai_status || 'hypothesis';
                const aiStatusColors = {
                  evidence_supported_pending_review: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#059669' },
                  needs_evidence: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: '#d97706' },
                  not_supported: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: '#dc2626' },
                  hypothesis: { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: '#0284c7' },
                }[aiStatus] || { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: '#0284c7' };

                return (
                  <div key={causeId} style={styles.matrixCard}>
                    {/* Card Top: Badges and Human Review Controls */}
                    <div style={styles.matrixTopRow}>
                      <div style={styles.badgeRow}>
                        <span style={styles.categoryBadge}>
                          {item.category ? item.category.toUpperCase() : 'GENERAL'}
                        </span>
                        <span
                          style={{
                            ...styles.aiStatusBadge,
                            backgroundColor: aiStatusColors.bg,
                            color: aiStatusColors.text,
                            borderColor: aiStatusColors.border,
                            border: '1px solid',
                          }}
                        >
                          AI: {aiStatus.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span
                          style={{
                            ...styles.reviewStatusBadge,
                            backgroundColor: isConfirmed ? '#10b981' : isRejected ? '#ef4444' : '#64748b',
                          }}
                        >
                          REVIEW: {(item.review_status || 'pending').toUpperCase()}
                        </span>
                        {item.equipment_aligned && (
                          <span style={styles.alignmentBadge}>✓ Equipment ID Aligned</span>
                        )}
                        {item.timeline_aligned && (
                          <span style={styles.alignmentBadge}>✓ Timeline Aligned</span>
                        )}
                      </div>

                      <div style={styles.reviewControls}>
                        <button
                          onClick={() => handleReviewCause(causeId, 'confirmed')}
                          style={{
                            ...styles.statusBtn,
                            backgroundColor: isConfirmed ? '#10b981' : '#1e293b',
                            color: isConfirmed ? '#ffffff' : '#94a3b8',
                            borderColor: isConfirmed ? '#059669' : '#334155',
                          }}
                        >
                          ✓ Confirm Root Cause
                        </button>
                        <button
                          onClick={() => handleReviewCause(causeId, 'rejected')}
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

                    {/* Candidate Cause Statement */}
                    <div style={styles.matrixCauseText}>{item.candidate_text}</div>
                    <div style={styles.matrixRationale}>
                      <strong>Investigative Rationale:</strong> {item.rationale}
                    </div>

                    {item.alignment_details && (
                      <div style={styles.matrixAlignmentDetails}>
                        ℹ️ {item.alignment_details}
                      </div>
                    )}

                    {/* Evidence Grids: Supporting vs Contradicting */}
                    <div style={styles.evidenceColumns}>
                      {/* Supporting Evidence Column */}
                      <div style={styles.evidenceCol}>
                        <div style={styles.colHeaderSupporting}>
                          ✓ Supporting Evidence ({item.supporting_evidence ? item.supporting_evidence.length : (item.supporting_evidence_ids || []).length})
                        </div>
                        {(!item.supporting_evidence || item.supporting_evidence.length === 0) && (!item.supporting_evidence_ids || item.supporting_evidence_ids.length === 0) ? (
                          <div style={styles.emptyColText}>No direct supporting records attached.</div>
                        ) : (
                          <div style={styles.evidenceItemList}>
                            {(item.supporting_evidence || []).map((ev, sIdx) => (
                              <div key={ev.id || sIdx} style={styles.supportingCard}>
                                <div style={styles.evCardTitle}>{ev.title || ev.document_name}</div>
                                <div style={styles.evCardFindings}>{ev.findings}</div>
                                {ev.status && (
                                  <span style={styles.evStatusTag}>Status: {ev.status}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Contradicting Evidence Column */}
                      <div style={styles.evidenceCol}>
                        <div style={styles.colHeaderContradicting}>
                          ✕ Contradicting Evidence ({item.contradicting_evidence ? item.contradicting_evidence.length : (item.contradicting_evidence_ids || []).length})
                        </div>
                        {(!item.contradicting_evidence || item.contradicting_evidence.length === 0) && (!item.contradicting_evidence_ids || item.contradicting_evidence_ids.length === 0) ? (
                          <div style={styles.emptyColText}>No contradicting evidence found.</div>
                        ) : (
                          <div style={styles.evidenceItemList}>
                            {(item.contradicting_evidence || []).map((ev, cIdx) => (
                              <div key={ev.id || cIdx} style={styles.contradictingCard}>
                                <div style={styles.evCardTitleContradict}>{ev.title || ev.document_name}</div>
                                <div style={styles.evCardFindings}>{ev.findings}</div>
                                <div style={styles.refutationNote}>
                                  ⚠️ This record actively refutes or rules out this cause hypothesis.
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Evidence Gaps */}
                    {item.evidence_gaps && item.evidence_gaps.length > 0 && (
                      <div style={styles.gapsSection}>
                        <div style={styles.gapsTitle}>⚠️ Unverified Gaps & Missing Evidence:</div>
                        <ul style={styles.gapsList}>
                          {item.evidence_gaps.map((gap, gIdx) => (
                            <li key={gIdx} style={styles.gapItem}>{gap}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Reviewer Note & Mandatory Input */}
                    {item.reviewer_note && (
                      <div style={styles.reviewerNote}>
                        <strong>Investigator Justification:</strong> {item.reviewer_note}
                      </div>
                    )}

                    {!isConfirmed && !isRejected && (
                      <div style={styles.noteInputRow}>
                        <input
                          type="text"
                          placeholder="Mandatory reviewer justification note (required before confirming or rejecting)..."
                          value={reviewerNotes[causeId] || ''}
                          onChange={(e) =>
                            setReviewerNotes({ ...reviewerNotes, [causeId]: e.target.value })
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
      )}

      {/* Candidate Root Causes Summary Section (always shown at bottom if not in matrix tab) */}
      {activeTab !== 'matrix' && (
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
                          placeholder="Mandatory reviewer justification note..."
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
      )}
    </div>
  );
};

const styles = {
  container: { backgroundColor: '#1e293b', borderRadius: '10px', padding: '24px', border: '1px solid #334155' },
  header: { marginBottom: '20px' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' },
  headerActions: { display: 'flex', gap: '8px' },
  tag: { display: 'inline-block', fontSize: '0.72rem', fontWeight: '700', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '4px', marginBottom: '8px' },
  title: { margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: '700' },
  subtitle: { margin: '6px 0 0 0', fontSize: '0.875rem', color: '#94a3b8', maxWidth: '750px' },
  runBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '10px 18px', fontWeight: '700', fontSize: '0.85rem' },
  errorBanner: { marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', borderRadius: '6px', border: '1px solid #ef4444', fontSize: '0.85rem' },
  successBanner: { marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#6ee7b7', borderRadius: '6px', border: '1px solid #10b981', fontSize: '0.85rem' },
  methodSelector: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' },
  methodBtn: { border: '1px solid #334155', borderRadius: '6px', padding: '10px 18px', fontWeight: '600', cursor: 'pointer', fontSize: '0.88rem' },
  panel: { backgroundColor: '#0f172a', padding: '18px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '24px' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' },
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
  alignmentBadge: { backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '600' },
  reviewControls: { display: 'flex', gap: '6px' },
  statusBtn: { border: '1px solid', borderRadius: '4px', padding: '5px 12px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' },
  causeText: { fontSize: '0.92rem', color: '#f8fafc', fontWeight: '600', marginBottom: '6px', lineHeight: 1.4 },
  rationaleText: { fontSize: '0.82rem', color: '#94a3b8', marginBottom: '6px' },
  reviewerNote: { fontSize: '0.8rem', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: '4px', marginTop: '8px' },
  noteInputRow: { marginTop: '8px' },
  noteInput: { width: '100%', boxSizing: 'border-box', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '6px 10px', color: '#f8fafc', fontSize: '0.8rem' },
  emptyNotice: { padding: '20px', textAlign: 'center', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', fontSize: '0.85rem' },
  matrixList: { display: 'flex', flexDirection: 'column', gap: '16px' },
  matrixCard: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' },
  matrixTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' },
  matrixCauseText: { fontSize: '1rem', fontWeight: '700', color: '#f8fafc', marginBottom: '6px' },
  matrixRationale: { fontSize: '0.84rem', color: '#cbd5e1', marginBottom: '8px' },
  matrixAlignmentDetails: { fontSize: '0.78rem', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.08)', padding: '6px 10px', borderRadius: '4px', marginBottom: '12px' },
  evidenceColumns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '12px' },
  evidenceCol: { backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155', padding: '12px' },
  colHeaderSupporting: { fontSize: '0.8rem', fontWeight: '700', color: '#34d399', marginBottom: '8px' },
  colHeaderContradicting: { fontSize: '0.8rem', fontWeight: '700', color: '#f87171', marginBottom: '8px' },
  emptyColText: { fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' },
  evidenceItemList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  supportingCard: { backgroundColor: '#1e293b', borderLeft: '3px solid #10b981', padding: '8px 10px', borderRadius: '0 4px 4px 0' },
  contradictingCard: { backgroundColor: '#1e293b', borderLeft: '3px solid #ef4444', padding: '8px 10px', borderRadius: '0 4px 4px 0' },
  evCardTitle: { fontSize: '0.8rem', fontWeight: '700', color: '#f8fafc', marginBottom: '2px' },
  evCardTitleContradict: { fontSize: '0.8rem', fontWeight: '700', color: '#fca5a5', marginBottom: '2px' },
  evCardFindings: { fontSize: '0.76rem', color: '#94a3b8' },
  evStatusTag: { display: 'inline-block', fontSize: '0.68rem', color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '1px 6px', borderRadius: '3px', marginTop: '4px' },
  refutationNote: { fontSize: '0.72rem', color: '#fca5a5', marginTop: '4px', fontStyle: 'italic' },
  gapsSection: { backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '6px', padding: '10px 12px', marginBottom: '10px' },
  gapsTitle: { fontSize: '0.78rem', fontWeight: '700', color: '#fbbf24', marginBottom: '4px' },
  gapsList: { margin: 0, paddingLeft: '16px', fontSize: '0.76rem', color: '#fde68a' },
  gapItem: { marginBottom: '2px' },
};

export default RcaMethodsStage;
