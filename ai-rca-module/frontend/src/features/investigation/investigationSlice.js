import { createSlice } from '@reduxjs/toolkit';

export const STAGES = [
  { id: 'intake', label: '1. Incident Intake', description: 'Upload documents, paste text, or input emails' },
  { id: 'form', label: '2. RCA Incident Form', description: 'AI-extracted incident facts & specifications' },
  { id: 'evidence', label: '3. Evidence & Gap Analysis', description: 'Extracted records, missing data & conflicts' },
  { id: 'rca_methods', label: '4. Root Cause Analysis', description: '5 Whys questioning & 6M Fishbone factors' },
  { id: 'capa', label: '5. CAPA Action Plans', description: 'Evidence-linked corrective & preventive actions' },
  { id: 'summary', label: '6. Review & Save', description: 'Quality professional sign-off and database persistence' },
];

const initialIncidentFields = {
  product_name: '',
  product_code: '',
  batch_number: '',
  manufacturing_stage: '',
  problem_statement: '',
  incident_date: '',
  expected_result: '',
  observed_result: '',
  immediate_action: '',
  equipment_id: '',
  severity: 'medium',
};

const initialState = {
  activeStage: 'intake',
  investigation: {
    id: null,
    reference_code: null,
    title: '',
    status: 'draft', // 'draft' | 'pending_review' | 'reviewed' | 'confirmed'
    created_at: null,
    updated_at: null,
  },
  incidentFields: { ...initialIncidentFields },
  sourceDocuments: [],
  extractedFacts: [],
  evidenceRecords: [],
  missingInformation: [],
  conflictingInformation: [],
  timelineAnomalies: [],
  investigationMethod: 'five_whys', // 'five_whys' | 'fishbone'
  fiveWhysChains: [],
  fishboneCategories: {
    people: [],
    machine: [],
    method: [],
    material: [],
    measurement: [],
    environment: [],
  },
  causeCandidates: [],
  capaRecommendations: [],
  isAnalyzing: false,
  error: null,
};

export const investigationSlice = createSlice({
  name: 'investigation',
  initialState,
  reducers: {
    setActiveStage: (state, action) => {
      state.activeStage = action.payload;
    },
    setIncidentField: (state, action) => {
      const { field, value } = action.payload;
      if (field in state.incidentFields) {
        state.incidentFields[field] = value;
      }
    },
    setIncidentFields: (state, action) => {
      const payload = action.payload;
      const fields = payload.fields ? payload.fields : payload;
      const overwrite = payload.overwrite !== undefined ? payload.overwrite : true;

      if (overwrite) {
        state.incidentFields = {
          ...state.incidentFields,
          ...fields,
        };
      } else {
        const merged = { ...state.incidentFields };
        Object.entries(fields).forEach(([k, v]) => {
          if (!merged[k] && v) {
            merged[k] = v;
          }
        });
        state.incidentFields = merged;
      }
    },
    setExtractedFacts: (state, action) => {
      state.extractedFacts = action.payload;
    },
    setMissingInformation: (state, action) => {
      state.missingInformation = action.payload;
    },
    setExtractionWarnings: (state, action) => {
      state.warnings = action.payload;
    },
    setAnalyzing: (state, action) => {
      state.isAnalyzing = action.payload;
    },
    updateFactReviewStatus: (state, action) => {
      const { field_name, review_status } = action.payload;
      const fact = state.extractedFacts.find((f) => f.field_name === field_name);
      if (fact) {
        fact.review_status = review_status;
      }
    },
    setEvidenceRecords: (state, action) => {
      state.evidenceRecords = action.payload;
    },
    setConflictingInformation: (state, action) => {
      state.conflictingInformation = action.payload;
    },
    setTimelineAnomalies: (state, action) => {
      state.timelineAnomalies = action.payload;
    },
    resolveGapInState: (state, action) => {
      const gapId = action.payload;
      const gap = state.missingInformation.find((g) => g.id === gapId || g.field_or_record === gapId);
      if (gap) {
        gap.status = 'resolved';
      }
    },
    setInvestigationMethod: (state, action) => {
      state.investigationMethod = action.payload;
    },
    addSourceDocument: (state, action) => {
      state.sourceDocuments.push(action.payload);
    },
    removeSourceDocument: (state, action) => {
      state.sourceDocuments = state.sourceDocuments.filter(
        (doc) => doc.id !== action.payload
      );
    },
    updateFiveWhysChain: (state, action) => {
      state.fiveWhysChains = action.payload;
    },
    setFishboneCategories: (state, action) => {
      state.fishboneCategories = action.payload;
    },
    setCauseCandidates: (state, action) => {
      state.causeCandidates = action.payload;
    },
    updateFishboneCategory: (state, action) => {
      const { category, items } = action.payload;
      if (category in state.fishboneCategories) {
        state.fishboneCategories[category] = items;
      }
    },
    updateCauseCandidateStatus: (state, action) => {
      const { id, review_status, reviewer_note } = action.payload;
      const candidate = state.causeCandidates.find((c) => c.id === id);
      if (candidate) {
        candidate.review_status = review_status;
        if (reviewer_note !== undefined) {
          candidate.reviewer_note = reviewer_note;
        }
      }
    },
    updateCapaActionStatus: (state, action) => {
      const { id, review_status, action_text, effectiveness_check } = action.payload;
      const actionItem = state.capaRecommendations.find((a) => a.id === id);
      if (actionItem) {
        if (review_status !== undefined) actionItem.review_status = review_status;
        if (action_text !== undefined) actionItem.action_text = action_text;
        if (effectiveness_check !== undefined) actionItem.effectiveness_check = effectiveness_check;
      }
    },
    loadSyntheticSampleData: (state) => {
      // Preloads synthetic API-X batch BATCH-2026-014 from sample-data.md
      state.investigation = {
        id: 'inv-synth-001',
        reference_code: 'RCA-2026-001',
        title: 'API-X Batch BATCH-2026-014 Purity Out-of-Specification Investigation',
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.incidentFields = {
        product_name: 'API-X (Active Pharmaceutical Ingredient)',
        product_code: 'APIX-RAW-99',
        batch_number: 'BATCH-2026-014',
        manufacturing_stage: 'Final Crystallization & Solvent Purification',
        problem_statement: 'Purity HPLC assay yielded 98.1%, below the registered release limit of >= 99.0%.',
        incident_date: '2026-11-20T08:30:00Z',
        expected_result: '>= 99.0% purity (HPLC area %)',
        observed_result: '98.1% purity (HPLC area %)',
        immediate_action: 'Batch quarantined. Downstream packaging halted pending comprehensive RCA.',
        equipment_id: 'CRYST-REACTOR-02 / TEMP-SENSOR-014',
        severity: 'high',
      };
      state.sourceDocuments = [
        {
          id: 'doc-001',
          filename: 'incident_report_APIX_BATCH_2026_014.pdf',
          source_type: 'pdf',
          page_count: 3,
          parse_status: 'processed',
          uploaded_at: '2026-11-20T09:00:00Z',
          excerpt: 'QC laboratory reported out-of-specification purity for batch BATCH-2026-014 at crystallization stage.',
        },
        {
          id: 'doc-002',
          filename: 'calibration_cert_TEMP_SENSOR_014.pdf',
          source_type: 'pdf',
          page_count: 2,
          parse_status: 'processed',
          uploaded_at: '2026-11-20T09:15:00Z',
          excerpt: 'As-found temperature error +0.8°C exceeding tolerance of ±0.5°C on sensor TEMP-SENSOR-014.',
        },
      ];
      state.missingInformation = [
        {
          field: 'maintenance_log_cooling_jacket',
          status: 'not_provided',
          why_it_matters: 'Cooling profile telemetry is needed to determine if temperature drift altered crystallization kinetics.',
        },
        {
          field: 'raw_material_solvent_lot_coa',
          status: 'available',
          why_it_matters: 'Solvent purity confirmed within specification at 99.8% on Lot S-8821.',
        },
      ];
      state.fiveWhysChains = [
        {
          step: 1,
          why: 'Why was API-X purity 98.1% (below 99.0% limit)?',
          answer: 'Excessive residual isomer impurity remained in crystallization mother liquor.',
          evidence: 'HPLC Certificate of Analysis (Page 2)',
          hypothesis: false,
        },
        {
          step: 2,
          why: 'Why did the crystallization fail to separate the isomer?',
          answer: 'Reaction mixture cooled slower than required crystallization trajectory between 65°C and 45°C.',
          evidence: 'Batch Manufacturing Record Batch-2026-014 (Section 4.2)',
          hypothesis: false,
        },
        {
          step: 3,
          why: 'Why did the mixture cool slower than the specified trajectory?',
          answer: 'Temperature probe TEMP-SENSOR-014 read 2°C cooler than actual reactor bath temperature.',
          evidence: 'Sensor Calibration Log (Observed Error +0.8°C to +1.2°C)',
          hypothesis: false,
        },
        {
          step: 4,
          why: 'Why was temperature probe TEMP-SENSOR-014 out of calibration tolerance?',
          answer: 'Thermal paste degradation and delayed preventive recalibration cycle during turnaround.',
          evidence: 'Maintenance work order #M-4401 (Overdue by 18 days)',
          hypothesis: true,
        },
        {
          step: 5,
          why: 'Why was the maintenance cycle delayed without interim verification?',
          answer: 'Calibration management system lacked automated lockouts for overdue critical-process instruments.',
          evidence: 'Quality System SOP-ENG-012 inspection',
          hypothesis: true,
        },
      ];
      state.fishboneCategories = {
        people: ['Operator followed standard batch instructions without manual thermometer check.'],
        machine: ['Temperature probe TEMP-SENSOR-014 out of calibration tolerance (+0.8°C drift).', 'Cooling jacket valve response lag.'],
        method: ['Cooling curve trajectory lacked secondary verification step in SOP-PR-401.'],
        material: ['Solvent purity verified compliant (Lot S-8821 > 99.8%).'],
        measurement: ['HPLC analytical method calibrated and verified compliant.'],
        environment: ['Cleanroom ambient temperature and humidity verified nominal.'],
      };
      state.causeCandidates = [
        {
          id: 'cause-001',
          method: 'five_whys',
          category: 'Machine / Calibration',
          candidate_text: 'Reactor crystallization temperature sensor (TEMP-SENSOR-014) positive drift caused premature crystal nucleation and impurity occlusion.',
          rationale: 'Observed calibration error of +0.8°C led control system to under-cool the crystallization mixture.',
          ai_status: 'evidence_supported_pending_review',
          review_status: 'pending',
          supporting_evidence_ids: ['doc-002', 'HPLC-QC-01'],
          contradicting_evidence_ids: [],
        },
        {
          id: 'cause-002',
          method: 'fishbone',
          category: 'Method',
          candidate_text: 'Lack of automated equipment lockout in CMMS for instruments exceeding scheduled recalibration intervals.',
          rationale: 'Allowed reactor to be charged while critical instrumentation was overdue for verification.',
          ai_status: 'hypothesis',
          review_status: 'pending',
          supporting_evidence_ids: ['M-4401'],
          contradicting_evidence_ids: [],
        },
      ];
      state.capaRecommendations = [
        {
          id: 'capa-001',
          cause_candidate_id: 'cause-001',
          action_type: 'corrective',
          action_text: 'Recalibrate and replace thermal paste on reactor temperature sensor TEMP-SENSOR-014 before next batch.',
          rationale: 'Directly restores measurement accuracy for crystallization thermal profile.',
          suggested_owner_role: 'Instrumentation & Maintenance Engineering',
          proposed_due_date: '2026-11-28',
          effectiveness_check: 'Perform 3-point temperature validation study during water-trial run.',
          review_status: 'pending_review',
        },
        {
          id: 'capa-002',
          cause_candidate_id: 'cause-002',
          action_type: 'preventive',
          action_text: 'Implement electronic interlocking in MES/CMMS preventing batch initiation if critical instruments are past calibration due dates.',
          rationale: 'Prevents recurrence of using overdue instruments across all API production lines.',
          suggested_owner_role: 'Quality Assurance & Automation',
          proposed_due_date: '2026-12-15',
          effectiveness_check: 'Audit batch records over subsequent 90 days for zero overdue instrument occurrences.',
          review_status: 'pending_review',
        },
      ];
      state.activeStage = 'form';
    },
    resetInvestigation: () => initialState,
  },
});

export const {
  setActiveStage,
  setIncidentField,
  setIncidentFields,
  setInvestigationMethod,
  addSourceDocument,
  removeSourceDocument,
  updateFiveWhysChain,
  setFishboneCategories,
  setCauseCandidates,
  updateFishboneCategory,
  updateCauseCandidateStatus,
  updateCapaActionStatus,
  loadSyntheticSampleData,
  setExtractedFacts,
  setMissingInformation,
  setExtractionWarnings,
  setAnalyzing,
  updateFactReviewStatus,
  setEvidenceRecords,
  setConflictingInformation,
  setTimelineAnomalies,
  resolveGapInState,
  resetInvestigation,
} = investigationSlice.actions;

export default investigationSlice.reducer;
