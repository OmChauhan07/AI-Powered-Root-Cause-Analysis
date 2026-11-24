import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setEvidenceRecords,
  setMissingInformation,
  setConflictingInformation,
  setTimelineAnomalies,
  resolveGapInState,
} from '../../features/investigation/investigationSlice';
import { triggerEvidenceAnalysis, resolveInvestigationGap } from '../../services/api';

export const EvidenceStage = () => {
  const dispatch = useDispatch();
  const evidenceRecords = useSelector((state) => state.investigation.evidenceRecords || []);
  const gaps = useSelector((state) => state.investigation.missingInformation || []);
  const conflicts = useSelector((state) => state.investigation.conflictingInformation || []);
  const timelineAnomalies = useSelector((state) => state.investigation.timelineAnomalies || []);
  const sourceDocs = useSelector((state) => state.investigation.sourceDocuments || []);
  const investigationId = useSelector((state) => state.investigation.investigation.id) || 'draft-inv';

  const [activeFilter, setActiveFilter] = useState('all');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState(null);

  const handleRunEvidenceAnalysis = async () => {
    if (sourceDocs.length === 0) {
      setFeedbackNotice({
        type: 'error',
        message: 'No evidence documents attached. Ingest documents in Stage 1 or load sample scenario first.',
      });
      return;
    }

    setIsAnalyzing(true);
    setFeedbackNotice(null);

    try {
      const data = await triggerEvidenceAnalysis(investigationId);
      dispatch(setEvidenceRecords(data.evidence_records || []));
      dispatch(setMissingInformation(data.gaps || []));
      dispatch(setConflictingInformation(data.conflicts || []));
      dispatch(setTimelineAnomalies(data.timeline_anomalies || []));
      setFeedbackNotice({
        type: 'success',
        message: `Evidence analysis complete: ${data.evidence_records?.length || 0} records indexed, ${
          data.gaps?.length || 0
        } gaps evaluated.`,
      });
    } catch (err) {
      setFeedbackNotice({
        type: 'error',
        message: `Evidence analysis failed: ${err.message || 'Service offline'}.`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResolveGap = async (gapId) => {
    try {
      await resolveInvestigationGap(investigationId, gapId);
      dispatch(resolveGapInState(gapId));
    } catch {
      // Local optimistic fallback
      dispatch(resolveGapInState(gapId));
    }
  };

  const filteredEvidence = evidenceRecords.filter((rec) => {
    if (activeFilter === 'all') return true;
    return rec.evidence_type === activeFilter;
  });

  return (
    <div style={styles.container}>
      {/* Stage Header */}
      <div style={styles.header}>
        <div style={styles.tag}>GxP Evidence Index & Traceability</div>
        <h2 style={styles.title}>Evidence Management & Investigation Gap Analysis</h2>
        <p style={styles.subtitle}>
          Correlate verified primary evidence (calibration certificates, maintenance logs, batch records) against investigation requirements.
          Critical information gaps and conflicting data are surfaced with clear root-cause impact explanations.
        </p>
      </div>

      {/* Action & Filter Bar */}
      <div style={styles.actionBar}>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Filter Records:</span>
          {['all', 'calibration', 'batch_record', 'maintenance_log', 'lab_result'].map((filterKey) => (
            <button
              key={filterKey}
              onClick={() => setActiveFilter(filterKey)}
              style={{
                ...styles.filterBtn,
                backgroundColor: activeFilter === filterKey ? '#0284c7' : '#1e293b',
                color: activeFilter === filterKey ? '#ffffff' : '#94a3b8',
                borderColor: activeFilter === filterKey ? '#38bdf8' : '#334155',
              }}
            >
              {filterKey === 'all'
                ? 'All Evidence'
                : filterKey.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>

        <button
          onClick={handleRunEvidenceAnalysis}
          disabled={isAnalyzing || sourceDocs.length === 0}
          style={{
            ...styles.analyzeBtn,
            opacity: isAnalyzing || sourceDocs.length === 0 ? 0.6 : 1,
          }}
        >
          {isAnalyzing ? 'Analyzing Evidence via LangGraph...' : '⚡ Run AI Evidence & Gap Analysis'}
        </button>
      </div>

      {feedbackNotice && (
        <div
          style={{
            ...styles.noticeBanner,
            backgroundColor: feedbackNotice.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            borderColor: feedbackNotice.type === 'success' ? '#10b981' : '#ef4444',
            color: feedbackNotice.type === 'success' ? '#34d399' : '#fca5a5',
          }}
        >
          {feedbackNotice.message}
        </div>
      )}

      {/* Contradictions & Discrepancies Callout */}
      {conflicts.length > 0 && (
        <div style={styles.conflictBox}>
          <div style={styles.conflictHeader}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <strong style={{ color: '#f87171' }}>Cross-Document Discrepancies & Contradictions Detected</strong>
          </div>
          {conflicts.map((conf, idx) => (
            <div key={idx} style={styles.conflictItem}>
              <div style={{ fontWeight: '600', color: '#fecaca', marginBottom: '4px' }}>
                {conf.description}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '6px' }}>
                <strong>Resolution Guidance:</strong> {conf.resolution_guidance}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline Anomalies Callout */}
      {timelineAnomalies.length > 0 && (
        <div style={styles.anomalyBox}>
          <div style={styles.anomalyHeader}>
            <span style={{ fontSize: '1.2rem' }}>⏱️</span>
            <strong style={{ color: '#c084fc' }}>Timeline Anomalies (Post-Incident Evidence Events)</strong>
          </div>
          {timelineAnomalies.map((ano, idx) => (
            <div key={idx} style={styles.anomalyItem}>
              <div style={{ fontWeight: '600', color: '#e9d5ff', marginBottom: '4px' }}>
                {ano.event} ({ano.event_date})
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                {ano.discrepancy_explanation}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Investigation Gaps Section */}
      <div style={styles.section}>
        <div style={styles.sectionHeaderRow}>
          <h3 style={styles.sectionTitle}>
            🔍 Contextual Investigation Gaps ({gaps.length})
          </h3>
          <span style={styles.infoTag}>
            Missing records are labelled 'Not Provided' — never assumed to have failed without evidence.
          </span>
        </div>

        {gaps.length === 0 ? (
          <div style={styles.emptyNotice}>
            No investigation gaps identified yet. Click "Run AI Evidence & Gap Analysis" above or ingest additional records.
          </div>
        ) : (
          <div style={styles.gapList}>
            {gaps.map((gap, index) => (
              <div
                key={gap.id || index}
                style={{
                  ...styles.gapCard,
                  borderColor:
                    gap.status === 'resolved'
                      ? '#10b981'
                      : gap.importance === 'critical'
                      ? '#ef4444'
                      : '#334155',
                }}
              >
                <div style={styles.gapCardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={styles.gapTypeBadge}>{gap.gap_type?.toUpperCase().replace('_', ' ')}</span>
                    <strong style={styles.gapField}>{gap.field_or_record || gap.field}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        ...styles.gapStatusBadge,
                        backgroundColor:
                          gap.status === 'resolved'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : gap.status === 'conflicting'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(245, 158, 11, 0.15)',
                        color:
                          gap.status === 'resolved'
                            ? '#34d399'
                            : gap.status === 'conflicting'
                            ? '#f87171'
                            : '#fbbf24',
                      }}
                    >
                      {gap.status?.toUpperCase().replace('_', ' ')}
                    </span>
                    {gap.status !== 'resolved' && (
                      <button
                        onClick={() => handleResolveGap(gap.id || gap.field_or_record)}
                        style={styles.resolveBtn}
                        title="Mark this gap as addressed"
                      >
                        ✓ Resolve Gap
                      </button>
                    )}
                  </div>
                </div>

                <div style={styles.gapDescription}>{gap.description}</div>

                <div style={styles.gapRationaleBox}>
                  <strong style={{ color: '#38bdf8' }}>Why it matters:</strong> {gap.impact_rationale || gap.why_it_matters}
                </div>

                {gap.recommended_action && (
                  <div style={styles.recommendedAction}>
                    <strong style={{ color: '#10b981' }}>Recommended Action:</strong> {gap.recommended_action}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verified Evidence Index */}
      <div style={styles.section}>
        <div style={styles.sectionHeaderRow}>
          <h3 style={styles.sectionTitle}>
            📑 Indexed Technical Evidence Records ({filteredEvidence.length})
          </h3>
        </div>

        {filteredEvidence.length === 0 ? (
          <div style={styles.emptyNotice}>
            No evidence records matched filter. Ingest calibration certificates, batch records, or maintenance logs.
          </div>
        ) : (
          <div style={styles.evidenceGrid}>
            {filteredEvidence.map((ev) => (
              <div key={ev.id} style={styles.evidenceCard}>
                <div style={styles.cardTopRow}>
                  <span style={styles.evidenceTypeBadge}>
                    {ev.evidence_type.toUpperCase().replace('_', ' ')}
                  </span>
                  <span
                    style={{
                      ...styles.evidenceStatusPill,
                      backgroundColor:
                        ev.status === 'available'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : ev.status === 'unclear'
                          ? 'rgba(56, 189, 248, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                      color:
                        ev.status === 'available'
                          ? '#34d399'
                          : ev.status === 'unclear'
                          ? '#38bdf8'
                          : '#f87171',
                    }}
                  >
                    {ev.status.toUpperCase()}
                  </span>
                </div>

                <h4 style={styles.evidenceTitle}>{ev.title}</h4>
                <p style={styles.evidenceDesc}>{ev.description}</p>

                {/* Structured Metrology Calibration Card */}
                {ev.evidence_type === 'calibration' && ev.structured_payload && (
                  <div style={styles.metrologyBox}>
                    <div style={styles.metrologyGrid}>
                      <div>
                        <span style={styles.metrologyKey}>Equipment:</span>{' '}
                        <strong>{ev.structured_payload.equipment_code || 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={styles.metrologyKey}>Tolerance:</span>{' '}
                        <strong>{ev.structured_payload.tolerance_limit || 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={styles.metrologyKey}>Observed Error:</span>{' '}
                        <strong style={{ color: '#f87171' }}>{ev.structured_payload.observed_error || 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={styles.metrologyKey}>Certificate:</span>{' '}
                        {ev.structured_payload.certificate_number || 'N/A'}
                      </div>
                      <div>
                        <span style={styles.metrologyKey}>Cal Date:</span>{' '}
                        {ev.structured_payload.calibration_date || 'N/A'}
                      </div>
                      <div>
                        <span style={styles.metrologyKey}>Status:</span>{' '}
                        <strong style={{ color: '#fbbf24' }}>{ev.structured_payload.calibration_result || 'N/A'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Verbatim Excerpt */}
                {ev.source_excerpt && (
                  <div style={styles.sourceQuote}>
                    "{ev.source_excerpt}"
                  </div>
                )}

                <div style={styles.evidenceFooter}>
                  Source: <strong>{ev.source_filename || 'Evidence File'}</strong>
                  {ev.source_page ? ` • Page ${ev.source_page}` : ''}
                  {ev.evidence_date ? ` • Date: ${ev.evidence_date.slice(0, 10)}` : ''}
                </div>
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
  subtitle: { margin: '6px 0 0 0', fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 },
  actionBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', padding: '12px 16px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' },
  filterGroup: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  filterLabel: { fontSize: '0.8rem', color: '#cbd5e1', fontWeight: '600' },
  filterBtn: { border: '1px solid', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' },
  analyzeBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '8px 18px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' },
  noticeBanner: { padding: '10px 14px', borderRadius: '6px', border: '1px solid', marginBottom: '16px', fontSize: '0.85rem' },
  conflictBox: { backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px' },
  conflictHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  conflictItem: { backgroundColor: '#0f172a', padding: '10px 12px', borderRadius: '6px', border: '1px solid #450a0a', marginTop: '6px' },
  anomalyBox: { backgroundColor: 'rgba(168, 85, 247, 0.12)', border: '1px solid #a855f7', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px' },
  anomalyHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' },
  anomalyItem: { backgroundColor: '#0f172a', padding: '10px 12px', borderRadius: '6px', border: '1px solid #3b0764', marginTop: '6px' },
  section: { marginTop: '24px' },
  sectionHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' },
  sectionTitle: { fontSize: '1rem', color: '#f1f5f9', fontWeight: '700', margin: 0 },
  infoTag: { fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' },
  emptyNotice: { padding: '24px', textAlign: 'center', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', fontSize: '0.85rem' },
  gapList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  gapCard: { backgroundColor: '#0f172a', borderRadius: '8px', padding: '16px', border: '1px solid #334155' },
  gapCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' },
  gapTypeBadge: { fontSize: '0.68rem', fontWeight: '700', color: '#38bdf8', backgroundColor: '#1e293b', padding: '2px 8px', borderRadius: '4px' },
  gapField: { fontSize: '0.92rem', color: '#f8fafc' },
  gapStatusBadge: { fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '4px' },
  resolveBtn: { backgroundColor: '#1e293b', border: '1px solid #10b981', color: '#34d399', fontSize: '0.75rem', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer' },
  gapDescription: { fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '10px', lineHeight: 1.4 },
  gapRationaleBox: { backgroundColor: '#1e293b', padding: '10px 12px', borderRadius: '6px', fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.4, marginBottom: '8px' },
  recommendedAction: { fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.4 },
  evidenceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' },
  evidenceCard: { backgroundColor: '#0f172a', borderRadius: '8px', padding: '16px', border: '1px solid #334155', display: 'flex', flexDirection: 'column' },
  cardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  evidenceTypeBadge: { fontSize: '0.68rem', fontWeight: '700', color: '#38bdf8', backgroundColor: '#1e293b', padding: '2px 6px', borderRadius: '4px' },
  evidenceStatusPill: { fontSize: '0.68rem', fontWeight: '700', padding: '2px 6px', borderRadius: '4px' },
  evidenceTitle: { margin: '0 0 6px 0', fontSize: '0.95rem', color: '#f8fafc', fontWeight: '700' },
  evidenceDesc: { margin: '0 0 10px 0', fontSize: '0.84rem', color: '#94a3b8', lineHeight: 1.4 },
  metrologyBox: { backgroundColor: '#1e293b', padding: '10px 12px', borderRadius: '6px', marginBottom: '10px', border: '1px solid #334155' },
  metrologyGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', fontSize: '0.78rem', color: '#e2e8f0' },
  metrologyKey: { color: '#94a3b8' },
  sourceQuote: { backgroundColor: '#1e293b', padding: '8px 10px', borderRadius: '4px', fontStyle: 'italic', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '10px', borderLeft: '3px solid #0284c7' },
  evidenceFooter: { marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #1e293b', fontSize: '0.72rem', color: '#64748b' },
};

export default EvidenceStage;
