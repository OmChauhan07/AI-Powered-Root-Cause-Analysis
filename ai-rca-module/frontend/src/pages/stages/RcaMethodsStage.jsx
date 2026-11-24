import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setInvestigationMethod,
  updateCauseCandidateStatus,
} from '../../features/investigation/investigationSlice';

export const RcaMethodsStage = () => {
  const dispatch = useDispatch();
  const method = useSelector((state) => state.investigation.investigationMethod);
  const fiveWhys = useSelector((state) => state.investigation.fiveWhysChains);
  const fishbone = useSelector((state) => state.investigation.fishboneCategories);
  const causeCandidates = useSelector((state) => state.investigation.causeCandidates);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.tag}>Investigation Methods</div>
        <h2 style={styles.title}>Root Cause Analysis: 5 Whys & Fishbone (6M)</h2>
        <p style={styles.subtitle}>
          Explore causal sequences and multi-factor categories. AI candidates remain unconfirmed hypotheses until an authorized quality reviewer confirms them.
        </p>
      </div>

      {/* Method Selector */}
      <div style={styles.methodSelector}>
        <button
          onClick={() => dispatch(setInvestigationMethod('five_whys'))}
          style={{
            ...styles.methodBtn,
            backgroundColor: method === 'five_whys' ? '#0284c7' : '#0f172a',
            color: '#ffffff',
          }}
        >
          🔬 5 Whys Questioning Chain
        </button>
        <button
          onClick={() => dispatch(setInvestigationMethod('fishbone'))}
          style={{
            ...styles.methodBtn,
            backgroundColor: method === 'fishbone' ? '#0284c7' : '#0f172a',
            color: '#ffffff',
          }}
        >
          🐟 Fishbone (Ishikawa 6M)
        </button>
      </div>

      {/* 5 Whys View */}
      {method === 'five_whys' && (
        <div style={styles.panel}>
          <h3 style={styles.panelHeading}>5 Whys Causal Investigation Chain</h3>
          {fiveWhys.length === 0 ? (
            <div style={styles.emptyNotice}>No 5 Whys chain formulated yet.</div>
          ) : (
            <div style={styles.chainList}>
              {fiveWhys.map((step) => (
                <div key={step.step} style={styles.chainCard}>
                  <div style={styles.chainStepHeader}>
                    <span style={styles.stepBadge}>WHY #{step.step}</span>
                    {step.hypothesis && <span style={styles.hypoTag}>HYPOTHESIS</span>}
                  </div>
                  <div style={styles.whyQuestion}>{step.why}</div>
                  <div style={styles.answerText}>
                    <strong>Answer:</strong> {step.answer}
                  </div>
                  <div style={styles.evidenceRef}>
                    <strong>Evidence Reference:</strong> {step.evidence}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fishbone View */}
      {method === 'fishbone' && (
        <div style={styles.panel}>
          <h3 style={styles.panelHeading}>Fishbone 6M Multi-Factor Breakdown</h3>
          <div style={styles.fishboneGrid}>
            {Object.entries(fishbone).map(([category, items]) => (
              <div key={category} style={styles.fishCard}>
                <h4 style={styles.fishCategory}>{category.toUpperCase()}</h4>
                {items.length === 0 ? (
                  <div style={styles.fishEmpty}>No factors flagged</div>
                ) : (
                  <ul style={styles.fishList}>
                    {items.map((it, idx) => (
                      <li key={idx} style={styles.fishItem}>
                        {it}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Potential Root Cause Candidates & Human Review Status */}
      <div style={styles.causesSection}>
        <h3 style={styles.panelHeading}>
          Candidate Root Causes & Reviewer Confirmation ({causeCandidates.length})
        </h3>
        {causeCandidates.length === 0 ? (
          <div style={styles.emptyNotice}>No cause candidates evaluated yet.</div>
        ) : (
          <div style={styles.causeList}>
            {causeCandidates.map((c) => (
              <div key={c.id} style={styles.causeCard}>
                <div style={styles.causeHeader}>
                  <div>
                    <span style={styles.categoryBadge}>{c.category}</span>
                    <span style={styles.aiStatusBadge}>AI STATUS: {c.ai_status.replace(/_/g, ' ').toUpperCase()}</span>
                  </div>
                  <div style={styles.reviewControls}>
                    <button
                      onClick={() =>
                        dispatch(
                          updateCauseCandidateStatus({
                            id: c.id,
                            review_status: 'confirmed',
                            reviewer_note: 'Verified against calibration and batch records.',
                          })
                        )
                      }
                      style={{
                        ...styles.statusBtn,
                        backgroundColor: c.review_status === 'confirmed' ? '#10b981' : '#1e293b',
                        color: c.review_status === 'confirmed' ? '#ffffff' : '#94a3b8',
                      }}
                    >
                      ✓ Confirm
                    </button>
                    <button
                      onClick={() =>
                        dispatch(
                          updateCauseCandidateStatus({
                            id: c.id,
                            review_status: 'rejected',
                            reviewer_note: 'Contradicted by lab evidence.',
                          })
                        )
                      }
                      style={{
                        ...styles.statusBtn,
                        backgroundColor: c.review_status === 'rejected' ? '#ef4444' : '#1e293b',
                        color: c.review_status === 'rejected' ? '#ffffff' : '#94a3b8',
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
                    <strong>Reviewer Note:</strong> {c.reviewer_note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: { backgroundColor: '#1e293b', borderRadius: '10px', padding: '24px', border: '1px solid #334155' },
  header: { marginBottom: '20px' },
  tag: { display: 'inline-block', fontSize: '0.72rem', fontWeight: '700', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '4px', marginBottom: '8px' },
  title: { margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: '700' },
  subtitle: { margin: '6px 0 0 0', fontSize: '0.875rem', color: '#94a3b8' },
  methodSelector: { display: 'flex', gap: '12px', marginBottom: '20px' },
  methodBtn: { border: '1px solid #334155', borderRadius: '6px', padding: '10px 18px', fontWeight: '600', cursor: 'pointer', fontSize: '0.88rem' },
  panel: { backgroundColor: '#0f172a', padding: '18px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '24px' },
  panelHeading: { margin: '0 0 14px 0', fontSize: '1rem', color: '#f1f5f9', fontWeight: '600' },
  chainList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  chainCard: { backgroundColor: '#1e293b', padding: '14px', borderRadius: '6px', border: '1px solid #334155' },
  chainStepHeader: { display: 'flex', gap: '8px', marginBottom: '6px' },
  stepBadge: { backgroundColor: '#0284c7', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' },
  hypoTag: { backgroundColor: '#eab308', color: '#000000', padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '800' },
  whyQuestion: { fontSize: '0.92rem', fontWeight: '700', color: '#f8fafc', marginBottom: '4px' },
  answerText: { fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '4px' },
  evidenceRef: { fontSize: '0.75rem', color: '#38bdf8' },
  fishboneGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  fishCard: { backgroundColor: '#1e293b', padding: '12px', borderRadius: '6px', border: '1px solid #334155' },
  fishCategory: { margin: '0 0 8px 0', color: '#38bdf8', fontSize: '0.82rem', fontWeight: '700' },
  fishEmpty: { fontSize: '0.78rem', color: '#64748b' },
  fishList: { margin: 0, paddingLeft: '16px', fontSize: '0.82rem', color: '#cbd5e1' },
  fishItem: { marginBottom: '4px' },
  causesSection: { marginTop: '20px' },
  causeList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  causeCard: { backgroundColor: '#0f172a', padding: '16px', borderRadius: '6px', border: '1px solid #334155' },
  causeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' },
  categoryBadge: { backgroundColor: '#334155', color: '#f8fafc', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '700', marginRight: '8px' },
  aiStatusBadge: { backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' },
  reviewControls: { display: 'flex', gap: '6px' },
  statusBtn: { border: '1px solid #334155', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' },
  causeText: { fontSize: '0.92rem', color: '#f8fafc', fontWeight: '600', marginBottom: '6px', lineHeight: 1.4 },
  rationaleText: { fontSize: '0.82rem', color: '#94a3b8', marginBottom: '6px' },
  reviewerNote: { fontSize: '0.8rem', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: '4px' },
  emptyNotice: { padding: '20px', textAlign: 'center', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', fontSize: '0.85rem' },
};

export default RcaMethodsStage;
