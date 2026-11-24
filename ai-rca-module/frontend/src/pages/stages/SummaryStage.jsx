import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  saveInvestigationDossier,
  fetchInvestigationDossier,
  updateInvestigationFields,
} from '../../services/api';
import {
  loadFullInvestigationDossier,
  setIncidentField,
} from '../../features/investigation/investigationSlice';

export const SummaryStage = () => {
  const dispatch = useDispatch();
  const investigation = useSelector((state) => state.investigation.investigation);
  const fields = useSelector((state) => state.investigation.incidentFields);
  const causeCandidates = useSelector((state) => state.investigation.causeCandidates);
  const capaActions = useSelector((state) => state.investigation.capaRecommendations);
  const sourceDocs = useSelector((state) => state.investigation.sourceDocuments);
  const facts = useSelector((state) => state.investigation.extractedFacts);
  const gaps = useSelector((state) => state.investigation.missingInformation);
  const fiveWhys = useSelector((state) => state.investigation.fiveWhysChains);

  // Reviewer sign-off form state
  const [reviewerName, setReviewerName] = useState('Dr. Eleanor Vance');
  const [reviewerRole, setReviewerRole] = useState('Quality Assurance Lead');
  const [reviewerNote, setReviewerNote] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('reviewed');
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Editable fields drawer / mode
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [editedFields, setEditedFields] = useState({ ...fields });

  const confirmedCauses = causeCandidates.filter((c) => c.review_status === 'confirmed');
  const acceptedCapa = capaActions.filter((a) => a.review_status === 'accepted');
  const unreviewedCauses = causeCandidates.filter(
    (c) => c.review_status === 'hypothesis' || c.review_status === 'needs_evidence' || c.review_status === 'evidence_supported_pending_review'
  );
  const openGaps = gaps.filter((g) => g.status !== 'resolved');

  const handleSaveDossier = async () => {
    if (!investigation?.id) {
      setErrorMessage('No active investigation ID found. Please create or load an investigation first.');
      return;
    }
    if (!reviewerNote.trim()) {
      setErrorMessage('GxP Compliance Rule: An explicit reviewer sign-off justification note is mandatory before persisting this investigation.');
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await saveInvestigationDossier(
        investigation.id,
        reviewerNote.trim(),
        selectedStatus,
        reviewerName.trim(),
        reviewerRole.trim()
      );
      setStatusMessage(
        `✅ Investigation dossier successfully persisted in PostgreSQL! Reference: ${res.reference_code || investigation.id} at ${new Date(res.updated_at || Date.now()).toLocaleTimeString()} (Status: ${res.status}).`
      );
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Error persisting dossier.';
      setErrorMessage(`Persistence Error: ${detail}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReloadDossier = async () => {
    if (!investigation?.id) {
      setErrorMessage('No active investigation ID to reload.');
      return;
    }

    setIsReloading(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const dossier = await fetchInvestigationDossier(investigation.id);
      dispatch(loadFullInvestigationDossier(dossier));
      if (dossier.investigation?.reviewer_note) {
        setReviewerNote(dossier.investigation.reviewer_note);
      }
      if (dossier.investigation?.status) {
        setSelectedStatus(dossier.investigation.status);
      }
      setStatusMessage(`🔄 Complete investigation dossier reloaded fresh from PostgreSQL database! (${new Date().toLocaleTimeString()})`);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Error reloading dossier.';
      setErrorMessage(`Reload Error: ${detail}`);
    } finally {
      setIsReloading(false);
    }
  };

  const handleSaveFieldEdits = async () => {
    if (!investigation?.id) return;
    try {
      await updateInvestigationFields(investigation.id, editedFields);
      Object.entries(editedFields).forEach(([k, v]) => {
        dispatch(setIncidentField({ field: k, value: v }));
      });
      setIsEditingFields(false);
      setStatusMessage('✅ Incident fields updated in database.');
    } catch (err) {
      setErrorMessage(`Failed to update incident fields: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handlePrintDossier = () => {
    window.print();
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.badgeRow}>
          <span style={styles.tag}>GxP 21 CFR Part 11 Boundary</span>
          <span style={styles.subTag}>Human Review & Quality Persistence</span>
        </div>
        <div style={styles.headerFlex}>
          <div>
            <h2 style={styles.title}>Investigation Dossier Review & Sign-Off</h2>
            <p style={styles.subtitle}>
              Pharmaceutical quality investigations require formal qualified reviewer validation. AI acts solely as an analytical assistant. Review the consolidated dossier, verify evidence alignment, and record formal regulatory sign-off.
            </p>
          </div>
          <div style={styles.headerActions}>
            <button
              style={styles.printBtn}
              onClick={handlePrintDossier}
              title="Print or export PDF of complete investigation dossier"
            >
              🖨️ Print / Export Dossier
            </button>
            <button
              style={styles.reloadBtn}
              onClick={handleReloadDossier}
              disabled={isReloading}
              title="Fetch fresh data from PostgreSQL database"
            >
              {isReloading ? '🔄 Reloading...' : '🔄 Reload from DB'}
            </button>
          </div>
        </div>
      </div>

      {/* Status & Error Banners */}
      {statusMessage && <div style={styles.statusBanner}>{statusMessage}</div>}
      {errorMessage && <div style={styles.errorBanner}>{errorMessage}</div>}

      {/* Metrics Bar */}
      <div style={styles.statGrid}>
        <div style={styles.statCard}>
          <div style={styles.statNum}>{sourceDocs.length}</div>
          <div style={styles.statLabel}>Evidence Sources</div>
          <div style={styles.statSub}>{facts.length} granular facts cited</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statNum}>{causeCandidates.length}</div>
          <div style={styles.statLabel}>Total Causes Formulated</div>
          <div style={styles.statSub}>{unreviewedCauses.length} pending review</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: confirmedCauses.length > 0 ? '#10b981' : '#f59e0b' }}>
            {confirmedCauses.length}
          </div>
          <div style={styles.statLabel}>Confirmed Root Causes</div>
          <div style={styles.statSub}>
            {confirmedCauses.length > 0 ? 'Evidence-verified' : '0 confirmed yet'}
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: acceptedCapa.length > 0 ? '#38bdf8' : '#94a3b8' }}>
            {acceptedCapa.length}
          </div>
          <div style={styles.statLabel}>Approved CAPA Actions</div>
          <div style={styles.statSub}>{capaActions.length} total generated</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statNum, color: openGaps.length === 0 ? '#10b981' : '#ef4444' }}>
            {openGaps.length}
          </div>
          <div style={styles.statLabel}>Open Investigation Gaps</div>
          <div style={styles.statSub}>{openGaps.length === 0 ? 'All gaps resolved' : 'Requires review'}</div>
        </div>
      </div>

      {/* Qualified Reviewer Sign-Off Panel */}
      <div style={styles.signOffPanel}>
        <div style={styles.signOffHeader}>
          <div>
            <h3 style={styles.panelTitle}>📝 Formal Quality Reviewer Sign-Off & Persistence</h3>
            <p style={styles.panelSubtitle}>
              Recording this review persists all current analysis, evidence linkages, causes, and approved CAPA items to PostgreSQL with audit timestamps.
            </p>
          </div>
          <div style={styles.currentStatusBadge}>
            Current State: <strong>{investigation?.status || 'draft'}</strong>
          </div>
        </div>

        <div style={styles.signOffFormGrid}>
          <div>
            <label style={styles.label}>Reviewer Full Name (GxP Identity)</label>
            <input
              type="text"
              style={styles.input}
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="e.g., Dr. Eleanor Vance"
            />
          </div>
          <div>
            <label style={styles.label}>Reviewer Role / Title</label>
            <input
              type="text"
              style={styles.input}
              value={reviewerRole}
              onChange={(e) => setReviewerRole(e.target.value)}
              placeholder="e.g., Quality Assurance Lead"
            />
          </div>
          <div>
            <label style={styles.label}>Investigation Lifecycle Status</label>
            <select
              style={styles.select}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="draft">Draft (Work in progress)</option>
              <option value="in_progress">In Progress (Active investigation)</option>
              <option value="reviewed">Reviewed (QA reviewed, awaiting completion)</option>
              <option value="confirmed">Confirmed (Root cause established & CAPA approved)</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: '14px' }}>
          <label style={styles.label}>
            Reviewer Evaluation & Justification Note <span style={{ color: '#ef4444' }}>* (Mandatory for GxP sign-off)</span>
          </label>
          <textarea
            style={styles.textarea}
            rows={3}
            value={reviewerNote}
            onChange={(e) => setReviewerNote(e.target.value)}
            placeholder="Document your technical assessment, concurrence with temperature sensor calibration drift as primary root cause, solvent purity clearance, and rationale for approved CAPA actions..."
          />
        </div>

        <div style={styles.signOffActionRow}>
          <button
            style={styles.saveBtn}
            onClick={handleSaveDossier}
            disabled={isSaving}
          >
            {isSaving ? '💾 Persisting to PostgreSQL...' : '💾 Save & Persist Reviewed Investigation Dossier'}
          </button>
          <div style={styles.auditNotice}>
            🔒 21 CFR Part 11 Notice: Saving does not automatically close deviations; QA retains full oversight.
          </div>
        </div>
      </div>

      {/* Complete Investigation Dossier Sections */}
      <div style={styles.dossierContainer}>
        {/* Section 1: Incident Specification */}
        <div style={styles.dossierSection}>
          <div style={styles.sectionHeader}>
            <h4 style={styles.sectionTitle}>1. Deviation Incident Specification</h4>
            <button
              style={styles.secondaryBtn}
              onClick={() => {
                setEditedFields({ ...fields });
                setIsEditingFields(!isEditingFields);
              }}
            >
              {isEditingFields ? 'Cancel Editing' : '✏️ Edit Incident Fields'}
            </button>
          </div>

          {isEditingFields ? (
            <div style={styles.editFieldsBox}>
              <div style={styles.fieldGrid}>
                <div>
                  <label style={styles.label}>Product Name</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={editedFields.product_name || ''}
                    onChange={(e) => setEditedFields({ ...editedFields, product_name: e.target.value })}
                  />
                </div>
                <div>
                  <label style={styles.label}>Batch Number</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={editedFields.batch_number || ''}
                    onChange={(e) => setEditedFields({ ...editedFields, batch_number: e.target.value })}
                  />
                </div>
                <div>
                  <label style={styles.label}>Manufacturing Stage</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={editedFields.manufacturing_stage || ''}
                    onChange={(e) => setEditedFields({ ...editedFields, manufacturing_stage: e.target.value })}
                  />
                </div>
                <div>
                  <label style={styles.label}>Equipment ID</label>
                  <input
                    type="text"
                    style={styles.input}
                    value={editedFields.equipment_id || ''}
                    onChange={(e) => setEditedFields({ ...editedFields, equipment_id: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <label style={styles.label}>Problem Statement</label>
                <textarea
                  style={styles.textarea}
                  rows={2}
                  value={editedFields.problem_statement || ''}
                  onChange={(e) => setEditedFields({ ...editedFields, problem_statement: e.target.value })}
                />
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button style={styles.saveBtn} onClick={handleSaveFieldEdits}>
                  Save Field Changes
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.tableLikeGrid}>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Problem Statement</span>
                <span style={styles.gridVal}>{fields.problem_statement || 'N/A'}</span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Product & Batch</span>
                <span style={styles.gridVal}>
                  {fields.product_name || 'N/A'} (Batch: <strong>{fields.batch_number || 'N/A'}</strong>)
                </span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Stage & Equipment</span>
                <span style={styles.gridVal}>
                  {fields.manufacturing_stage || 'N/A'} / {fields.equipment_id || 'N/A'}
                </span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Observed vs Expected</span>
                <span style={styles.gridVal}>
                  Observed: <strong style={{ color: '#ef4444' }}>{fields.observed_result || 'N/A'}</strong> | Expected: <strong style={{ color: '#10b981' }}>{fields.expected_result || 'N/A'}</strong>
                </span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Immediate Containment Action</span>
                <span style={styles.gridVal}>{fields.immediate_action || 'N/A'}</span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Severity</span>
                <span style={styles.gridVal}>
                  <span style={styles.severityBadge(fields.severity)}>
                    {(fields.severity || 'unknown').toUpperCase()}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Evidentiary Records & Provenance */}
        <div style={styles.dossierSection}>
          <h4 style={styles.sectionTitle}>2. Supporting Evidence & Investigation Gaps</h4>
          <div style={styles.evidenceSubGrid}>
            <div>
              <div style={styles.subTitle}>Attached Evidence Documents ({sourceDocs.length})</div>
              {sourceDocs.length === 0 ? (
                <div style={styles.emptyNote}>No evidence documents attached.</div>
              ) : (
                <div style={styles.docList}>
                  {sourceDocs.map((doc) => (
                    <div key={doc.id} style={styles.docItem}>
                      <span style={styles.docName}>📄 {doc.filename}</span>
                      <span style={styles.docMeta}>{doc.source_type?.toUpperCase()} • {doc.parse_status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={styles.subTitle}>Investigation Gaps ({gaps.length})</div>
              {gaps.length === 0 ? (
                <div style={styles.emptyNote}>No open or identified gaps.</div>
              ) : (
                <div style={styles.gapList}>
                  {gaps.map((gap, idx) => (
                    <div key={gap.id || idx} style={styles.gapItem}>
                      <span style={gap.status === 'resolved' ? styles.gapBadgeResolved : styles.gapBadgeOpen}>
                        {gap.status?.toUpperCase() || 'OPEN'}
                      </span>
                      <span style={styles.gapText}>{gap.field_or_record || gap.field}: {gap.why_it_matters || gap.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Root Cause Analysis Methods & Confirmed Findings */}
        <div style={styles.dossierSection}>
          <h4 style={styles.sectionTitle}>3. Root Cause Analysis Findings (5 Whys & Cause Candidates)</h4>
          {fiveWhys && fiveWhys.length > 0 && (
            <div style={styles.fiveWhysBox}>
              <div style={styles.subTitle}>5 Whys Investigation Path</div>
              <div style={styles.whysList}>
                {fiveWhys.map((step, idx) => (
                  <div key={idx} style={styles.whyStep}>
                    <span style={styles.stepNum}>Why #{step.step || idx + 1}:</span>
                    <span style={styles.stepText}>{step.why}</span>
                    <span style={styles.stepAns}>➔ {step.because}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '16px' }}>
            <div style={styles.subTitle}>Candidate Root Causes & Human Review Decisions ({causeCandidates.length})</div>
            {causeCandidates.length === 0 ? (
              <div style={styles.emptyNote}>No root cause candidates recorded.</div>
            ) : (
              <div style={styles.causeCardGrid}>
                {causeCandidates.map((c) => (
                  <div key={c.id} style={styles.causeCard(c.review_status)}>
                    <div style={styles.causeCardTop}>
                      <span style={styles.categoryBadge}>{c.category?.toUpperCase() || 'UNCLASSIFIED'}</span>
                      <span style={styles.reviewStatusBadge(c.review_status)}>
                        {c.review_status === 'confirmed' ? '✓ CONFIRMED ROOT CAUSE' : c.review_status.toUpperCase()}
                      </span>
                    </div>
                    <div style={styles.causeStatement}>{c.cause_statement}</div>
                    <div style={styles.causeDetails}>
                      <div><strong>Likelihood:</strong> {c.likelihood_score || 'N/A'} / 1.0</div>
                      <div><strong>Confidence:</strong> {c.confidence_score || 'N/A'} / 1.0</div>
                      <div><strong>Method:</strong> {c.investigation_method || '5 Whys / 6M'}</div>
                    </div>
                    {c.reviewer_note && (
                      <div style={styles.reviewerNoteBox}>
                        <strong>Reviewer Rationale:</strong> {c.reviewer_note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Approved CAPA Action Plan */}
        <div style={styles.dossierSection}>
          <h4 style={styles.sectionTitle}>4. Agreed CAPA Action Plan ({capaActions.length})</h4>
          {capaActions.length === 0 ? (
            <div style={styles.emptyNote}>No CAPA actions registered.</div>
          ) : (
            <div style={styles.capaTable}>
              <div style={styles.capaHeaderRow}>
                <span style={{ width: '15%' }}>Type</span>
                <span style={{ width: '35%' }}>Action Description</span>
                <span style={{ width: '25%' }}>Measurable Effectiveness Check</span>
                <span style={{ width: '13%' }}>Owner Role</span>
                <span style={{ width: '12%' }}>Status</span>
              </div>
              {capaActions.map((act) => (
                <div key={act.id} style={styles.capaRow(act.review_status)}>
                  <span style={{ width: '15%', fontWeight: '700', color: '#93c5fd' }}>
                    {act.action_type?.toUpperCase()}
                  </span>
                  <span style={{ width: '35%', color: '#f1f5f9' }}>{act.action_text}</span>
                  <span style={{ width: '25%', color: '#cbd5e1', fontSize: '0.8rem' }}>
                    {act.effectiveness_check || 'N/A'}
                  </span>
                  <span style={{ width: '13%', color: '#94a3b8', fontSize: '0.8rem' }}>
                    {act.owner_role || 'Unassigned'}
                  </span>
                  <span style={{ width: '12%' }}>
                    <span style={styles.capaStatusBadge(act.review_status)}>
                      {act.review_status?.toUpperCase()}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: { backgroundColor: '#1e293b', borderRadius: '10px', padding: '24px', border: '1px solid #334155' },
  header: { marginBottom: '20px' },
  badgeRow: { display: 'flex', gap: '8px', marginBottom: '8px' },
  tag: { fontSize: '0.72rem', fontWeight: '700', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '4px' },
  subTag: { fontSize: '0.72rem', fontWeight: '700', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px' },
  headerFlex: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' },
  title: { margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: '700' },
  subtitle: { margin: '6px 0 0 0', fontSize: '0.875rem', color: '#94a3b8', maxWidth: '750px', lineHeight: 1.5 },
  headerActions: { display: 'flex', gap: '10px' },
  printBtn: { backgroundColor: '#334155', color: '#f1f5f9', border: '1px solid #475569', borderRadius: '6px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  reloadBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  statusBanner: { backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#34d399', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.88rem' },
  errorBanner: { backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.88rem' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' },
  statCard: { backgroundColor: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155', textAlign: 'center' },
  statNum: { fontSize: '1.6rem', fontWeight: '800', color: '#f8fafc' },
  statLabel: { fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px', fontWeight: '600' },
  statSub: { fontSize: '0.72rem', color: '#64748b', marginTop: '2px' },
  signOffPanel: { backgroundColor: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #38bdf8', marginBottom: '24px' },
  signOffHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' },
  panelTitle: { margin: 0, fontSize: '1.05rem', color: '#f1f5f9', fontWeight: '700' },
  panelSubtitle: { margin: '4px 0 0 0', fontSize: '0.82rem', color: '#94a3b8' },
  currentStatusBadge: { backgroundColor: '#1e293b', border: '1px solid #475569', color: '#38bdf8', padding: '6px 12px', borderRadius: '6px', fontSize: '0.82rem' },
  signOffFormGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  label: { display: 'block', fontSize: '0.78rem', color: '#cbd5e1', fontWeight: '600', marginBottom: '4px' },
  input: { width: '100%', boxSizing: 'border-box', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '8px 10px', borderRadius: '6px', fontSize: '0.85rem' },
  select: { width: '100%', boxSizing: 'border-box', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '8px 10px', borderRadius: '6px', fontSize: '0.85rem' },
  textarea: { width: '100%', boxSizing: 'border-box', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '8px 10px', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'inherit' },
  signOffActionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginTop: '16px', borderTop: '1px solid #1e293b', paddingTop: '16px' },
  saveBtn: { backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '10px 20px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' },
  auditNotice: { fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' },
  dossierContainer: { display: 'flex', flexDirection: 'column', gap: '20px' },
  dossierSection: { backgroundColor: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  sectionTitle: { margin: 0, fontSize: '0.98rem', color: '#f1f5f9', fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#334155', color: '#cbd5e1', border: '1px solid #475569', borderRadius: '4px', padding: '6px 10px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: '600' },
  editFieldsBox: { backgroundColor: '#1e293b', padding: '14px', borderRadius: '6px', border: '1px solid #475569' },
  fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' },
  tableLikeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' },
  gridItem: { backgroundColor: '#1e293b', padding: '10px 14px', borderRadius: '6px', border: '1px solid #334155' },
  gridLabel: { display: 'block', fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' },
  gridVal: { fontSize: '0.85rem', color: '#f1f5f9', lineHeight: 1.4 },
  severityBadge: (sev) => ({
    display: 'inline-block',
    fontSize: '0.7rem',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: sev === 'critical' ? '#ef4444' : sev === 'high' ? '#f59e0b' : '#3b82f6',
    color: '#ffffff',
  }),
  evidenceSubGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  subTitle: { fontSize: '0.85rem', fontWeight: '700', color: '#cbd5e1', marginBottom: '8px' },
  emptyNote: { fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' },
  docList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  docItem: { display: 'flex', justifyContent: 'space-between', backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: '4px', fontSize: '0.82rem', border: '1px solid #334155' },
  docName: { color: '#f1f5f9' },
  docMeta: { color: '#64748b', fontSize: '0.74rem' },
  gapList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  gapItem: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: '4px', fontSize: '0.82rem', border: '1px solid #334155' },
  gapBadgeResolved: { fontSize: '0.68rem', fontWeight: '700', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px' },
  gapBadgeOpen: { fontSize: '0.68rem', fontWeight: '700', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: '4px' },
  gapText: { color: '#cbd5e1', fontSize: '0.8rem' },
  fiveWhysBox: { backgroundColor: '#1e293b', padding: '14px', borderRadius: '6px', border: '1px solid #334155' },
  whysList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  whyStep: { fontSize: '0.82rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '2px' },
  stepNum: { color: '#38bdf8', fontWeight: '700' },
  stepText: { color: '#f8fafc', fontWeight: '600' },
  stepAns: { color: '#a5f3fc', paddingLeft: '12px' },
  causeCardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' },
  causeCard: (status) => ({
    backgroundColor: '#1e293b',
    borderRadius: '6px',
    padding: '12px',
    border: status === 'confirmed' ? '1px solid #10b981' : '1px solid #334155',
  }),
  causeCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  categoryBadge: { fontSize: '0.7rem', color: '#94a3b8', backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' },
  reviewStatusBadge: (status) => ({
    fontSize: '0.68rem',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: status === 'confirmed' ? 'rgba(16, 185, 129, 0.2)' : status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
    color: status === 'confirmed' ? '#34d399' : status === 'rejected' ? '#f87171' : '#fbbf24',
  }),
  causeStatement: { fontSize: '0.85rem', color: '#f1f5f9', fontWeight: '600', marginBottom: '8px', lineHeight: 1.4 },
  causeDetails: { fontSize: '0.75rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '2px' },
  reviewerNoteBox: { marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #334155', fontSize: '0.75rem', color: '#34d399', fontStyle: 'italic' },
  capaTable: { display: 'flex', flexDirection: 'column', gap: '6px' },
  capaHeaderRow: { display: 'flex', padding: '8px 12px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: '700', borderBottom: '1px solid #334155' },
  capaRow: (status) => ({
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    fontSize: '0.82rem',
    backgroundColor: '#1e293b',
    borderRadius: '4px',
    border: status === 'accepted' ? '1px solid #38bdf8' : '1px solid #334155',
  }),
  capaStatusBadge: (status) => ({
    fontSize: '0.68rem',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: status === 'accepted' ? 'rgba(56, 189, 248, 0.2)' : status === 'rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(148, 163, 184, 0.2)',
    color: status === 'accepted' ? '#38bdf8' : status === 'rejected' ? '#f87171' : '#94a3b8',
  }),
};

export default SummaryStage;
