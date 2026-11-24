import test from 'node:test';
import assert from 'node:assert';
import reducer, {
  setIncidentField,
  setIncidentFields,
  setExtractedFacts,
  setMissingInformation,
  updateFactReviewStatus,
  setEvidenceRecords,
  setConflictingInformation,
  setTimelineAnomalies,
  resolveGapInState,
  setActiveStage,
  loadSyntheticSampleData,
  updateCauseCandidateStatus,
  updateCapaActionStatus,
  loadFullInvestigationDossier,
  resetInvestigation,
} from './investigationSlice.js';

test('investigationSlice initial state has intake stage active', () => {
  const state = reducer(undefined, { type: 'unknown' });
  assert.strictEqual(state.activeStage, 'intake');
  assert.strictEqual(state.investigation.status, 'draft');
  assert.strictEqual(state.incidentFields.product_name, '');
});

test('setActiveStage updates active stage', () => {
  const state = reducer(undefined, setActiveStage('form'));
  assert.strictEqual(state.activeStage, 'form');
});

test('setIncidentField updates individual field without mutating others', () => {
  const state1 = reducer(undefined, setIncidentField({ field: 'product_name', value: 'API-X' }));
  assert.strictEqual(state1.incidentFields.product_name, 'API-X');
  assert.strictEqual(state1.incidentFields.batch_number, '');
});

test('setIncidentFields preserves user edits when overwrite is false', () => {
  // User manually entered product_name
  const userEdited = reducer(undefined, setIncidentField({ field: 'product_name', value: 'API-X (Custom Edit)' }));

  // AI extraction returns batch_number and generic product_name
  const extractedPayload = {
    fields: {
      product_name: 'API-X Generic',
      batch_number: 'BATCH-2026-014',
    },
    overwrite: false,
  };

  const merged = reducer(userEdited, setIncidentFields(extractedPayload));
  // User edit preserved
  assert.strictEqual(merged.incidentFields.product_name, 'API-X (Custom Edit)');
  // New empty field populated
  assert.strictEqual(merged.incidentFields.batch_number, 'BATCH-2026-014');
});

test('setExtractedFacts and updateFactReviewStatus manage human review states', () => {
  const facts = [
    { field_name: 'batch_number', field_value: 'BATCH-2026-014', review_status: 'pending' },
    { field_name: 'observed_result', field_value: '98.1%', review_status: 'pending' },
  ];
  const withFacts = reducer(undefined, setExtractedFacts(facts));
  assert.strictEqual(withFacts.extractedFacts.length, 2);

  const reviewed = reducer(
    withFacts,
    updateFactReviewStatus({ field_name: 'batch_number', review_status: 'accepted' })
  );
  assert.strictEqual(reviewed.extractedFacts[0].review_status, 'accepted');
  assert.strictEqual(reviewed.extractedFacts[1].review_status, 'pending');
});

test('setMissingInformation stores audit gaps', () => {
  const missing = [
    { field_name: 'equipment_id', description: 'Equipment not recorded in shift report' },
  ];
  const state = reducer(undefined, setMissingInformation(missing));
  assert.strictEqual(state.missingInformation.length, 1);
  assert.strictEqual(state.missingInformation[0].field_name, 'equipment_id');
});

test('loadSyntheticSampleData populates API-X scenario', () => {
  const state = reducer(undefined, loadSyntheticSampleData());
  assert.strictEqual(state.investigation.reference_code, 'RCA-2026-001');
  assert.strictEqual(state.incidentFields.batch_number, 'BATCH-2026-014');
  assert.strictEqual(state.sourceDocuments.length, 2);
  assert.strictEqual(state.fiveWhysChains.length, 5);
  assert.strictEqual(state.causeCandidates.length, 2);
  assert.strictEqual(state.capaRecommendations.length, 2);
  assert.strictEqual(state.activeStage, 'form');
});

test('updateCauseCandidateStatus modifies review status and reviewer note', () => {
  const populated = reducer(undefined, loadSyntheticSampleData());
  const updated = reducer(
    populated,
    updateCauseCandidateStatus({
      id: 'cause-001',
      review_status: 'confirmed',
      reviewer_note: 'Confirmed by QA Lead',
    })
  );
  const candidate = updated.causeCandidates.find((c) => c.id === 'cause-001');
  assert.strictEqual(candidate.review_status, 'confirmed');
  assert.strictEqual(candidate.reviewer_note, 'Confirmed by QA Lead');
});

test('updateCapaActionStatus updates acceptance state', () => {
  const populated = reducer(undefined, loadSyntheticSampleData());
  const updated = reducer(
    populated,
    updateCapaActionStatus({
      id: 'capa-001',
      review_status: 'accepted',
    })
  );
  const action = updated.capaRecommendations.find((a) => a.id === 'capa-001');
  assert.strictEqual(action.review_status, 'accepted');
});

test('setEvidenceRecords, setConflictingInformation, and resolveGapInState manage evidence state', () => {
  const records = [
    { id: 'ev-01', evidence_type: 'calibration', title: 'TEMP-SENSOR-014 Cert', status: 'available' },
  ];
  const withRecords = reducer(undefined, setEvidenceRecords(records));
  assert.strictEqual(withRecords.evidenceRecords.length, 1);
  assert.strictEqual(withRecords.evidenceRecords[0].evidence_type, 'calibration');

  const conflicts = [
    { conflict_type: 'equipment_id_mismatch', description: 'Sensor 14 vs 12' },
  ];
  const withConflicts = reducer(withRecords, setConflictingInformation(conflicts));
  assert.strictEqual(withConflicts.conflictingInformation.length, 1);

  const anomalies = [
    { event: 'Post-incident calibration', event_date: '2026-11-22' },
  ];
  const withAnomalies = reducer(withConflicts, setTimelineAnomalies(anomalies));
  assert.strictEqual(withAnomalies.timelineAnomalies.length, 1);

  const gaps = [
    { id: 'gap-01', field_or_record: 'calibration_certificate', status: 'not_provided' },
  ];
  const withGaps = reducer(withAnomalies, setMissingInformation(gaps));
  assert.strictEqual(withGaps.missingInformation[0].status, 'not_provided');

  const resolved = reducer(withGaps, resolveGapInState('gap-01'));
  assert.strictEqual(resolved.missingInformation[0].status, 'resolved');
});

test('resetInvestigation restores initial state', () => {
  const populated = reducer(undefined, loadSyntheticSampleData());
  const reset = reducer(populated, resetInvestigation());
  assert.strictEqual(reset.activeStage, 'intake');
  assert.strictEqual(reset.incidentFields.product_name, '');
  assert.strictEqual(reset.sourceDocuments.length, 0);
});

test('loadFullInvestigationDossier populates state from backend dossier response', () => {
  const dossier = {
    investigation: { id: 'inv-dossier-test', status: 'reviewed', reviewer_note: 'Validated by QA' },
    incident_fields: { product_name: 'API-X', batch_number: 'BATCH-2026-014' },
    extracted_facts: [{ field_name: 'product_name', field_value: 'API-X', confidence: 0.95 }],
    evidence_records: [{ id: 'ev-1', title: 'Calibration Cert' }],
    investigation_gaps: [{ id: 'gap-1', field_or_record: 'Solvent COA', status: 'resolved' }],
    cause_candidates: [{ id: 'c-1', candidate_text: 'Sensor drift', review_status: 'confirmed' }],
    capa_actions: [{ id: 'capa-1', action_text: 'Recalibrate sensor', review_status: 'accepted' }],
    source_documents: [{ id: 'doc-1', filename: 'report.pdf' }],
  };

  const loaded = reducer(undefined, loadFullInvestigationDossier(dossier));
  assert.strictEqual(loaded.investigation.id, 'inv-dossier-test');
  assert.strictEqual(loaded.incidentFields.product_name, 'API-X');
  assert.strictEqual(loaded.extractedFacts.length, 1);
  assert.strictEqual(loaded.evidenceRecords.length, 1);
  assert.strictEqual(loaded.missingInformation.length, 1);
  assert.strictEqual(loaded.causeCandidates[0].review_status, 'confirmed');
  assert.strictEqual(loaded.capaRecommendations[0].review_status, 'accepted');
  assert.strictEqual(loaded.sourceDocuments.length, 1);
});
