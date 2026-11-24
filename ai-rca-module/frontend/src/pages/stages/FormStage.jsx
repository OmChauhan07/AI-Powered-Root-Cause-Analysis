import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setIncidentField,
  setIncidentFields,
  setExtractedFacts,
  setMissingInformation,
  setExtractionWarnings,
} from '../../features/investigation/investigationSlice';
import { triggerAiExtraction } from '../../services/api';

export const FormStage = () => {
  const dispatch = useDispatch();
  const fields = useSelector((state) => state.investigation.incidentFields);
  const extractedFacts = useSelector((state) => state.investigation.extractedFacts || []);
  const missingInformation = useSelector((state) => state.investigation.missingInformation || []);
  const warnings = useSelector((state) => state.investigation.warnings || []);
  const sourceDocuments = useSelector((state) => state.investigation.sourceDocuments || []);
  const investigationId = useSelector((state) => state.investigation.investigation.id) || 'draft-inv';

  const [isReExtracting, setIsReExtracting] = useState(false);
  const [overwriteEdits, setOverwriteEdits] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  const handleChange = (field, value) => {
    dispatch(setIncidentField({ field, value }));
  };

  const handleReRunExtraction = async () => {
    if (sourceDocuments.length === 0) {
      setActionNotice({ type: 'error', message: 'No documents attached to re-extract from.' });
      return;
    }

    setIsReExtracting(true);
    setActionNotice(null);

    try {
      const data = await triggerAiExtraction(investigationId, null, overwriteEdits);
      dispatch(setIncidentFields({ fields: data.incident_fields, overwrite: overwriteEdits }));
      dispatch(setExtractedFacts(data.extracted_facts || []));
      dispatch(setMissingInformation(data.missing_information || []));
      dispatch(setExtractionWarnings(data.warnings || []));
      setActionNotice({
        type: 'success',
        message: `Re-extraction complete: ${data.extracted_facts?.length || 0} facts refreshed.${
          overwriteEdits ? ' Manual edits overwritten.' : ' Manual edits preserved.'
        }`,
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Re-extraction failed: ${err.message || 'Service offline'}.`,
      });
    } finally {
      setIsReExtracting(false);
    }
  };

  const renderProvenanceBadge = (fieldName) => {
    const fact = extractedFacts.find((f) => f.field_name === fieldName);
    if (fact) {
      return (
        <span
          style={styles.provenancePill}
          title={fact.source_excerpt ? `Excerpt: "${fact.source_excerpt}"` : 'Extracted from source evidence'}
        >
          ✓ AI Extracted ({fact.source_filename || 'Evidence'}{fact.source_page ? ` p.${fact.source_page}` : ''})
        </span>
      );
    }

    const missing = missingInformation.find((m) => m.field_name === fieldName);
    if (missing) {
      return (
        <span style={styles.missingPill} title={missing.description}>
          ⚠️ Not Provided in Evidence
        </span>
      );
    }

    return null;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.tag}>AI-Populated Predefined Form</div>
        <h2 style={styles.title}>RCA Incident Investigation Form</h2>
        <p style={styles.subtitle}>
          Fields are populated from evidence documents via LangGraph + Groq. All values remain unconfirmed drafts until confirmed by a qualified investigator.
        </p>
      </div>

      {/* Reviewer Safety & Provenance Banner */}
      <div style={styles.complianceNotice}>
        <span style={{ fontSize: '1.1rem' }}>🛡️</span>
        <div>
          <strong style={{ color: '#38bdf8' }}>GxP Integrity Guard:</strong> Field values are extracted automatically from primary evidence documents.
          Review every field before proceeding to RCA Methods and CAPA sign-off.
        </div>
      </div>

      {/* Re-Run Extraction Bar */}
      <div style={styles.reRunBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="checkbox"
              checked={overwriteEdits}
              onChange={(e) => setOverwriteEdits(e.target.checked)}
            />
            Overwrite manual reviewer edits on re-run
          </label>
        </div>
        <button
          onClick={handleReRunExtraction}
          disabled={isReExtracting || sourceDocuments.length === 0}
          style={{
            ...styles.reRunBtn,
            opacity: isReExtracting || sourceDocuments.length === 0 ? 0.6 : 1,
          }}
        >
          {isReExtracting ? 'Re-extracting...' : '🔄 Re-run AI Extraction'}
        </button>
      </div>

      {actionNotice && (
        <div
          style={{
            ...styles.noticeBanner,
            backgroundColor: actionNotice.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            borderColor: actionNotice.type === 'success' ? '#10b981' : '#ef4444',
            color: actionNotice.type === 'success' ? '#34d399' : '#fca5a5',
          }}
        >
          {actionNotice.message}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={styles.warningBox}>
          <strong>⚠️ Extraction Warnings:</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            {warnings.map((w, idx) => (
              <li key={idx} style={{ fontSize: '0.82rem', color: '#fef08a' }}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Form Grid */}
      <div style={styles.grid}>
        {/* Product Information */}
        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Product Name *</label>
            {renderProvenanceBadge('product_name')}
          </div>
          <input
            type="text"
            value={fields.product_name || ''}
            onChange={(e) => handleChange('product_name', e.target.value)}
            placeholder="e.g. API-X"
            style={styles.input}
          />
        </div>

        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Product / Item Code</label>
            {renderProvenanceBadge('product_code')}
          </div>
          <input
            type="text"
            value={fields.product_code || ''}
            onChange={(e) => handleChange('product_code', e.target.value)}
            placeholder="e.g. APIX-RAW-99"
            style={styles.input}
          />
        </div>

        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Batch / Lot Number *</label>
            {renderProvenanceBadge('batch_number')}
          </div>
          <input
            type="text"
            value={fields.batch_number || ''}
            onChange={(e) => handleChange('batch_number', e.target.value)}
            placeholder="e.g. BATCH-2026-014"
            style={styles.input}
          />
        </div>

        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Manufacturing Stage / Process Step</label>
            {renderProvenanceBadge('manufacturing_stage')}
          </div>
          <input
            type="text"
            value={fields.manufacturing_stage || ''}
            onChange={(e) => handleChange('manufacturing_stage', e.target.value)}
            placeholder="e.g. Crystallization & Solvent Purification"
            style={styles.input}
          />
        </div>

        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Incident Occurrence Date / Time</label>
            {renderProvenanceBadge('incident_date')}
          </div>
          <input
            type="text"
            value={fields.incident_date || ''}
            onChange={(e) => handleChange('incident_date', e.target.value)}
            placeholder="e.g. 2026-11-20T08:30:00Z"
            style={styles.input}
          />
        </div>

        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Incident Severity</label>
            <span style={styles.provenancePill}>Evaluated</span>
          </div>
          <select
            value={fields.severity || 'medium'}
            onChange={(e) => handleChange('severity', e.target.value)}
            style={styles.select}
          >
            <option value="critical">Critical (Batch Rejection / OOS)</option>
            <option value="high">High (Major Parameter Excursion)</option>
            <option value="medium">Medium (Minor Deviation)</option>
            <option value="low">Low (Observation)</option>
          </select>
        </div>

        {/* Technical Excursion Details */}
        <div style={{ ...styles.fieldGroup, gridColumn: 'span 2' }}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Problem Statement / Observed Failure *</label>
            {renderProvenanceBadge('problem_statement')}
          </div>
          <textarea
            value={fields.problem_statement || ''}
            onChange={(e) => handleChange('problem_statement', e.target.value)}
            rows={3}
            placeholder="Detailed description of the deviation..."
            style={styles.textarea}
          />
        </div>

        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Registered Specification / Expected Result</label>
            {renderProvenanceBadge('expected_result')}
          </div>
          <input
            type="text"
            value={fields.expected_result || ''}
            onChange={(e) => handleChange('expected_result', e.target.value)}
            placeholder="e.g. >= 99.0% purity"
            style={styles.input}
          />
        </div>

        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Observed Laboratory / Sensor Result</label>
            {renderProvenanceBadge('observed_result')}
          </div>
          <input
            type="text"
            value={fields.observed_result || ''}
            onChange={(e) => handleChange('observed_result', e.target.value)}
            placeholder="e.g. 98.1% purity (OOS)"
            style={styles.input}
          />
        </div>

        <div style={styles.fieldGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Equipment Identifiers Involved</label>
            {renderProvenanceBadge('equipment_id')}
          </div>
          <input
            type="text"
            value={fields.equipment_id || ''}
            onChange={(e) => handleChange('equipment_id', e.target.value)}
            placeholder="e.g. CRYST-REACTOR-02 / TEMP-SENSOR-014"
            style={styles.input}
          />
        </div>

        <div style={{ ...styles.fieldGroup, gridColumn: 'span 2' }}>
          <div style={styles.labelRow}>
            <label style={styles.label}>Immediate Containment Actions Taken</label>
            {renderProvenanceBadge('immediate_action')}
          </div>
          <textarea
            value={fields.immediate_action || ''}
            onChange={(e) => handleChange('immediate_action', e.target.value)}
            rows={2}
            placeholder="e.g. Batch quarantined. Downstream processing halted."
            style={styles.textarea}
          />
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: { backgroundColor: '#1e293b', borderRadius: '10px', padding: '24px', border: '1px solid #334155' },
  header: { marginBottom: '16px' },
  tag: { display: 'inline-block', fontSize: '0.72rem', fontWeight: '700', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px', marginBottom: '8px' },
  title: { margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: '700' },
  subtitle: { margin: '6px 0 0 0', fontSize: '0.875rem', color: '#94a3b8' },
  complianceNotice: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155', marginBottom: '16px', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.4 },
  reRunBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' },
  reRunBtn: { backgroundColor: '#334155', color: '#f8fafc', border: '1px solid #475569', borderRadius: '6px', padding: '6px 14px', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer' },
  noticeBanner: { padding: '10px 14px', borderRadius: '6px', border: '1px solid', marginBottom: '16px', fontSize: '0.85rem' },
  warningBox: { backgroundColor: 'rgba(234, 179, 8, 0.1)', border: '1px solid #ca8a04', padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', color: '#fef08a', fontSize: '0.85rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  labelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' },
  label: { fontSize: '0.8rem', fontWeight: '600', color: '#cbd5e1' },
  provenancePill: { fontSize: '0.7rem', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' },
  missingPill: { fontSize: '0.7rem', color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' },
  input: { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '9px 12px', fontSize: '0.88rem' },
  select: { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '9px 12px', fontSize: '0.88rem' },
  textarea: { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '10px 12px', fontSize: '0.88rem', boxSizing: 'border-box' },
};

export default FormStage;
