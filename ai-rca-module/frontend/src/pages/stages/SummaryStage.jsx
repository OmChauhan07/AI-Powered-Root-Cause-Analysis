import React from 'react';
import { useSelector } from 'react-redux';

export const SummaryStage = () => {
  const fields = useSelector((state) => state.investigation.incidentFields);
  const causeCandidates = useSelector((state) => state.investigation.causeCandidates);
  const capaActions = useSelector((state) => state.investigation.capaRecommendations);
  const sourceDocs = useSelector((state) => state.investigation.sourceDocuments);

  const confirmedCauses = causeCandidates.filter((c) => c.review_status === 'confirmed');
  const acceptedCapa = capaActions.filter((a) => a.review_status === 'accepted');

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.tag}>Human Review Boundary</div>
        <h2 style={styles.title}>Investigation Review & Quality Sign-Off</h2>
        <p style={styles.subtitle}>
          Pharmaceutical investigations require human qualification. AI output is stored as draft analysis; confirmed causes and approved CAPAs are committed with reviewer timestamps.
        </p>
      </div>

      <div style={styles.statGrid}>
        <div style={styles.statCard}>
          <div style={styles.statNum}>{sourceDocs.length}</div>
          <div style={styles.statLabel}>Evidence Sources</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNum}>{causeCandidates.length}</div>
          <div style={styles.statLabel}>Total Causes Formulated</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: '#10b981' }}>{confirmedCauses.length}</div>
          <div style={styles.statLabel}>Confirmed Root Causes</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: '#38bdf8' }}>{acceptedCapa.length}</div>
          <div style={styles.statLabel}>Approved CAPA Actions</div>
        </div>
      </div>

      <div style={styles.summaryCard}>
        <h3 style={styles.summaryTitle}>Investigation Executive Summary</h3>
        <p style={styles.summaryText}>
          <strong>Incident:</strong> {fields.problem_statement || 'No incident statement recorded.'}
        </p>
        <p style={styles.summaryText}>
          <strong>Product:</strong> {fields.product_name || 'N/A'} (Batch: {fields.batch_number || 'N/A'})
        </p>
        <p style={styles.summaryText}>
          <strong>Root Cause Status:</strong>{' '}
          {confirmedCauses.length > 0
            ? `${confirmedCauses.length} root cause(s) confirmed by reviewer.`
            : 'No causes confirmed yet (all candidates remain in hypothesis/draft state).'}
        </p>

        <div style={styles.actionRow}>
          <button style={styles.saveBtn} onClick={() => alert('Investigation draft prepared for PostgreSQL persistence in Phase 02/09.')}>
            💾 Save Reviewed Investigation Draft
          </button>
        </div>
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
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' },
  statCard: { backgroundColor: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155', textAlign: 'center' },
  statNum: { fontSize: '1.6rem', fontWeight: '800', color: '#f8fafc' },
  statLabel: { fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' },
  summaryCard: { backgroundColor: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' },
  summaryTitle: { margin: '0 0 12px 0', fontSize: '1rem', color: '#f1f5f9', fontWeight: '600' },
  summaryText: { margin: '0 0 8px 0', fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5 },
  actionRow: { marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '16px' },
  saveBtn: { backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '10px 20px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' },
};

export default SummaryStage;
