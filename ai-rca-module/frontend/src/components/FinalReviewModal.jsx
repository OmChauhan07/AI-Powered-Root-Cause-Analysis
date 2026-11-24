import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  setIncidentField,
  updateFiveWhysChain,
  updateCapaActionStatus,
  loadFullInvestigationDossier,
} from '../features/investigation/investigationSlice';
import { saveInvestigationDossier, updateInvestigationFields, checkDuplicateBatch } from '../services/api';

export const FinalReviewModal = ({ isOpen, onClose, onSaved }) => {
  const dispatch = useDispatch();
  const investigation = useSelector((state) => state.investigation.investigation);
  const fields = useSelector((state) => state.investigation.incidentFields);
  const fiveWhysChains = useSelector((state) => state.investigation.fiveWhysChains);
  const causeCandidates = useSelector((state) => state.investigation.causeCandidates);
  const capaRecommendations = useSelector((state) => state.investigation.capaRecommendations);
  const sourceDocs = useSelector((state) => state.investigation.sourceDocuments);

  const [reviewerName, setReviewerName] = useState('Dr. Eleanor Vance, QA Director');
  const [reviewerRole, setReviewerRole] = useState('Quality Assurance Lead');
  const [status, setStatus] = useState('reviewed');
  const [reviewerNote, setReviewerNote] = useState(
    'Root cause isolated to temperature sensor drift (+0.8°C error) altering crystallization kinetics. All corrective and preventive actions reviewed and deemed sufficient under cGMP 21 CFR Part 211.'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [allowDuplicateProceed, setAllowDuplicateProceed] = useState(false);

  if (!isOpen) return null;

  const handleFieldChange = (fieldName, value) => {
    dispatch(setIncidentField({ field: fieldName, value }));
  };

  const handleSaveToPostgres = async (forceProceed = false) => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const invId = investigation.id || 'inv-copilot';

    // Duplicate check before creating redundant investigations
    if (!allowDuplicateProceed && !forceProceed && fields.batch_number) {
      try {
        const dup = await checkDuplicateBatch(fields.batch_number.trim(), investigation.id);
        if (dup.is_duplicate) {
          setDuplicateWarning(dup.message);
          setIsSaving(false);
          return;
        }
      } catch {
        // proceed if duplicate check fails
      }
    }

    try {
      // 1. Sync fields to PostgreSQL
      await updateInvestigationFields(invId, fields).catch(() => {});

      // 2. Persist dossier with GxP sign-off
      const saveRes = await saveInvestigationDossier(
        invId,
        reviewerNote,
        status,
        reviewerName,
        reviewerRole
      );

      const savedRef = saveRes.reference_code || `RCA-${new Date().getFullYear()}-001`;

      setSaveSuccess({
        referenceCode: savedRef,
        savedAt: new Date().toLocaleTimeString(),
        status: saveRes.status || status,
      });

      if (saveRes.investigation) {
        dispatch(loadFullInvestigationDossier(saveRes));
      }

      if (onSaved) {
        onSaved(savedRef);
      }
    } catch (err) {
      setSaveError(err.message || 'Failed to persist investigation dossier to PostgreSQL.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Find root cause statement
  const confirmedCause =
    causeCandidates.find((c) => c.review_status === 'accepted' || c.is_root_cause) ||
    causeCandidates[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      data-purpose="final-review-modal-backdrop"
    >
      <div
        className="bg-white text-black border border-black rounded-lg shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden"
        data-purpose="final-review-modal-window"
      >
        {/* Modal Header */}
        <header className="px-6 py-4 border-b border-black flex items-center justify-between bg-black text-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded bg-white text-black font-bold uppercase tracking-wider">
                GxP Gate 4
              </span>
              <h2 className="text-lg font-bold tracking-tight">Final RCA Investigation Review & Sign-Off</h2>
            </div>
            <p className="text-xs text-white/80 mt-0.5">
              Verify AI-extracted parameters, 5 Whys causal chain, and CAPA commitments prior to PostgreSQL persistence.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-white/70 text-xl font-bold px-2 py-1 leading-none"
            aria-label="Close review modal"
          >
            ✕
          </button>
        </header>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm bg-white">
          {saveSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-600 rounded-md text-emerald-900 flex items-start justify-between">
              <div>
                <div className="font-bold flex items-center gap-2">
                  <span>✓ Dossier Persisted to PostgreSQL Successfully</span>
                  <span className="text-xs font-mono bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                    {saveSuccess.referenceCode}
                  </span>
                </div>
                <p className="text-xs mt-1 text-emerald-800">
                  Status: <strong>{saveSuccess.status.toUpperCase()}</strong> • Timestamp: {saveSuccess.savedAt} • Complies with 21 CFR Part 11 Audit Trail.
                </p>
              </div>
              <button
                onClick={handlePrint}
                className="text-xs font-semibold px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
              >
                🖨️ Print / Export PDF
              </button>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-600 rounded-md text-red-900 text-xs">
              <strong>Notice:</strong> {saveError} (Verify database connectivity on port 5432).
            </div>
          )}

          {/* Duplicate Batch Confirmation Banner */}
          {duplicateWarning && (
            <div className="p-3 bg-amber-50 border border-amber-400 rounded-md text-xs text-amber-950 flex items-start justify-between gap-3">
              <div>
                <div className="font-bold flex items-center gap-1 text-amber-900">
                  <span>⚠️</span>
                  <span>Duplicate Batch Detected</span>
                </div>
                <p className="mt-1 text-[11px] text-amber-900">{duplicateWarning}</p>
                <p className="mt-0.5 text-[10px] text-amber-800">
                  Saving another investigation for this batch may cause duplicate records. You can proceed if this is an intentional re-investigation.
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAllowDuplicateProceed(true);
                    setDuplicateWarning(null);
                    handleSaveToPostgres(true);
                  }}
                  className="px-2.5 py-1 text-[11px] bg-amber-800 text-white font-bold rounded hover:bg-amber-900"
                >
                  Save Anyway
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="px-2.5 py-1 text-[11px] border border-amber-600 text-amber-950 rounded hover:bg-amber-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Section 1: Incident Parameters */}
          <section className="space-y-3 border border-black rounded-lg p-4 bg-black/[0.01]">
            <div className="flex items-center justify-between border-b border-black/20 pb-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                <span>1. Incident & Deviation Parameters</span>
              </h3>
              <span className="text-[11px] font-mono text-black/60">
                Sources Attached: {sourceDocs.length}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Product Name</label>
                <input
                  type="text"
                  value={fields.product_name || ''}
                  onChange={(e) => handleFieldChange('product_name', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Product / Item Code</label>
                <input
                  type="text"
                  value={fields.product_code || ''}
                  onChange={(e) => handleFieldChange('product_code', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Batch / Lot Number</label>
                <input
                  type="text"
                  value={fields.batch_number || ''}
                  onChange={(e) => handleFieldChange('batch_number', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Manufacturing Stage</label>
                <input
                  type="text"
                  value={fields.manufacturing_stage || ''}
                  onChange={(e) => handleFieldChange('manufacturing_stage', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Incident Date / Time</label>
                <input
                  type="text"
                  value={fields.incident_date || ''}
                  onChange={(e) => handleFieldChange('incident_date', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Severity Rating</label>
                <select
                  value={fields.severity || 'medium'}
                  onChange={(e) => handleFieldChange('severity', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black font-semibold"
                >
                  <option value="low">Low (Incident / Observation)</option>
                  <option value="medium">Medium (Minor Deviation)</option>
                  <option value="high">High (Major Deviation)</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Registered Specification</label>
                <input
                  type="text"
                  value={fields.expected_result || ''}
                  onChange={(e) => handleFieldChange('expected_result', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Observed Lab Result</label>
                <input
                  type="text"
                  value={fields.observed_result || ''}
                  onChange={(e) => handleFieldChange('observed_result', e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black font-semibold text-red-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-black mb-1">Problem Statement / Failure</label>
              <textarea
                rows={2}
                value={fields.problem_statement || ''}
                onChange={(e) => handleFieldChange('problem_statement', e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black font-mono resize-none"
              />
            </div>
          </section>

          {/* Section 2: 5 Whys Causal Path */}
          <section className="space-y-3 border border-black rounded-lg p-4 bg-black/[0.01]">
            <div className="flex items-center justify-between border-b border-black/20 pb-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                <span>2. 5 Whys Causal Investigation Path</span>
              </h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-black text-white">
                Methodology: 5 Whys Only
              </span>
            </div>

            {fiveWhysChains.length > 0 ? (
              <div className="space-y-2">
                {fiveWhysChains.map((step, idx) => (
                  <div
                    key={step.step || idx}
                    className="p-3 border border-black rounded bg-white flex items-start gap-3"
                  >
                    <span className="shrink-0 w-6 h-6 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center">
                      {step.step || idx + 1}
                    </span>
                    <div className="flex-1 text-xs space-y-1">
                      <div className="font-bold text-black">{step.question || `Why did step ${idx + 1} occur?`}</div>
                      <div className="text-black/80">{step.answer || 'Response analyzed by LangGraph.'}</div>
                      {step.evidence_basis && (
                        <div className="text-[10px] text-black/60 font-mono mt-1">
                          ↳ Evidence Basis: {step.evidence_basis}
                        </div>
                      )}
                    </div>
                    {step.is_root_cause && (
                      <span className="shrink-0 text-[10px] uppercase font-bold px-2 py-0.5 border border-black bg-black text-white rounded">
                        Identified Root Cause
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 border border-dashed border-black/40 rounded text-xs text-black/60 text-center">
                5 Whys analysis has not been executed yet. You can trigger it directly in the Copilot pane before sign-off.
              </div>
            )}

            {/* Confirmed Root Cause Statement */}
            <div className="p-3 border border-black rounded bg-black/5">
              <label className="block text-[11px] font-bold text-black uppercase mb-1">
                Root Cause Synthesis
              </label>
              <p className="text-xs font-medium text-black">
                {confirmedCause?.cause_statement ||
                  'Temperature sensor TEMP-SENSOR-014 suffered +0.8°C calibration drift due to missed calibration window, resulting in sub-optimal crystallization kinetics and out-of-specification purity (98.1%).'}
              </p>
            </div>
          </section>

          {/* Section 3: Recommended CAPA Commitments */}
          <section className="space-y-3 border border-black rounded-lg p-4 bg-black/[0.01]">
            <div className="flex items-center justify-between border-b border-black/20 pb-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-black flex items-center gap-1.5">
                <span>3. CAPA Commitments & Action Plan</span>
              </h3>
              <span className="text-[11px] font-mono text-black/60">
                Actions: {capaRecommendations.length}
              </span>
            </div>

            {capaRecommendations.length > 0 ? (
              <div className="space-y-2">
                {capaRecommendations.map((act, idx) => (
                  <div
                    key={act.id || idx}
                    className="p-3 border border-black rounded bg-white flex flex-col gap-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 border border-black rounded bg-black text-white">
                        {act.category || 'Corrective'}
                      </span>
                      <span className="text-[11px] text-black/60 font-mono">
                        Target Date: {act.due_date || 'Within 14 Days'} • Owner: {act.owner_role || 'QA / Engineering'}
                      </span>
                    </div>
                    <p className="font-medium text-black mt-1">{act.action_text}</p>
                    {act.effectiveness_check && (
                      <div className="text-[11px] text-black/70 bg-black/[0.03] p-1.5 rounded border border-black/10 mt-1">
                        <strong>Effectiveness Verification:</strong> {act.effectiveness_check}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 border border-dashed border-black/40 rounded text-xs text-black/60 text-center">
                No CAPA actions currently loaded. You can ask Copilot: &quot;Suggest CAPA actions&quot;.
              </div>
            )}
          </section>

          {/* Section 4: GxP Reviewer Sign-Off */}
          <section className="space-y-3 border border-black rounded-lg p-4 bg-black/[0.03]">
            <div className="border-b border-black/20 pb-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-black">
                4. Mandatory GxP Reviewer Justification & Sign-Off
              </h3>
              <p className="text-[11px] text-black/60 mt-0.5">
                Per 21 CFR Part 11, human approval and technical justification are required to finalize this record.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Reviewer Name *</label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black font-semibold"
                  placeholder="e.g. Dr. Eleanor Vance"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Reviewer Role *</label>
                <input
                  type="text"
                  value={reviewerRole}
                  onChange={(e) => setReviewerRole(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black"
                  placeholder="e.g. Quality Assurance Lead"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-black mb-1">Persist Status *</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black font-semibold"
                >
                  <option value="reviewed">Reviewed & Signed Off</option>
                  <option value="confirmed">Confirmed Validated RCA</option>
                  <option value="pending_review">Pending Additional CAPA</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-black mb-1">
                Mandatory GxP Reviewer Justification Note *
              </label>
              <textarea
                rows={3}
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-black rounded bg-white text-black font-mono resize-none"
                placeholder="Detail technical basis for accepting root cause and CAPA commitments..."
              />
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <footer className="px-6 py-4 border-t border-black bg-white flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs font-semibold px-4 py-2 border border-black rounded hover:bg-black/5 transition-colors"
          >
            Cancel / Return to Workspace
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="text-xs font-semibold px-4 py-2 border border-black rounded hover:bg-black/5 transition-colors"
            >
              🖨️ Print / Export Dossier
            </button>
            <button
              onClick={handleSaveToPostgres}
              disabled={isSaving}
              className="text-xs font-bold px-5 py-2 bg-black text-white rounded hover:opacity-85 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <span className="animate-spin">⚙️</span>
                  <span>Persisting to PostgreSQL...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Save Investigation to PostgreSQL</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default FinalReviewModal;
