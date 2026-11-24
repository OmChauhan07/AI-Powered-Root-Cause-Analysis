import axios from 'axios';

// Resolve base URL from environment or fallback to local backend port 8000
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Response interceptor for consistent error extraction
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorDetails = {
      message: error.response?.data?.message || error.message || 'Network request failed',
      status: error.response?.status,
      data: error.response?.data,
    };
    return Promise.reject(errorDetails);
  }
);

/**
 * Health Check API Call
 * Calls GET /api/health
 */
export const getHealthStatus = async () => {
  const response = await apiClient.get('/api/health');
  return response.data;
};

/**
 * Upload PDF or EML evidence file
 * Calls POST /api/investigations/{investigationId}/documents/upload
 */
export const uploadEvidenceDocument = async (investigationId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(
    `/api/investigations/${investigationId}/documents/upload`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

/**
 * Submit Pasted Incident Narrative
 * Calls POST /api/investigations/{investigationId}/documents/text
 */
export const submitPastedNarrative = async (investigationId, content, title) => {
  const response = await apiClient.post(
    `/api/investigations/${investigationId}/documents/text`,
    { content, title }
  );
  return response.data;
};

/**
 * Submit Email Record
 * Calls POST /api/investigations/{investigationId}/documents/email
 */
export const submitEmailRecord = async (investigationId, emailData) => {
  const response = await apiClient.post(
    `/api/investigations/${investigationId}/documents/email`,
    emailData
  );
  return response.data;
};

/**
 * Retrieve list of source documents
 * Calls GET /api/investigations/{investigationId}/documents
 */
export const fetchSourceDocuments = async (investigationId) => {
  const response = await apiClient.get(`/api/investigations/${investigationId}/documents`);
  return response.data;
};

/**
 * Trigger LangGraph + Groq AI extraction on attached evidence documents
 * Calls POST /api/investigations/{investigationId}/extract
 */
export const triggerAiExtraction = async (investigationId, sourceDocumentIds = null, overwriteUserEdits = false) => {
  const response = await apiClient.post(`/api/investigations/${investigationId}/extract`, {
    source_document_ids: sourceDocumentIds,
    overwrite_user_edits: overwriteUserEdits,
  });
  return response.data;
};

/**
 * Retrieve granular extracted facts with citation provenance
 * Calls GET /api/investigations/{investigationId}/facts
 */
export const fetchExtractedFacts = async (investigationId) => {
  const response = await apiClient.get(`/api/investigations/${investigationId}/facts`);
  return response.data;
};

/**
 * Review an individual extracted fact (Human-in-the-Loop)
 * Calls PATCH /api/investigations/{investigationId}/facts/{factId}
 */
export const reviewExtractedFact = async (investigationId, factId, reviewStatus, reviewerNote = null) => {
  const response = await apiClient.patch(
    `/api/investigations/${investigationId}/facts/${factId}`,
    null,
    {
      params: {
        review_status: reviewStatus,
        reviewer_note: reviewerNote,
      },
    }
  );
  return response.data;
};

/**
 * Trigger Evidence & Gap Analysis across all attached documents
 * Calls POST /api/investigations/{investigationId}/evidence/analyze
 */
export const triggerEvidenceAnalysis = async (investigationId) => {
  const response = await apiClient.post(`/api/investigations/${investigationId}/evidence/analyze`);
  return response.data;
};

/**
 * Fetch stored evidence records, gaps, and timeline anomalies
 * Calls GET /api/investigations/{investigationId}/evidence
 */
export const fetchInvestigationEvidence = async (investigationId) => {
  const response = await apiClient.get(`/api/investigations/${investigationId}/evidence`);
  return response.data;
};

/**
 * Resolve an investigation gap
 * Calls PATCH /api/investigations/{investigationId}/gaps/{gapId}/resolve
 */
export const resolveInvestigationGap = async (investigationId, gapId) => {
  const response = await apiClient.patch(`/api/investigations/${investigationId}/gaps/${gapId}/resolve`);
  return response.data;
};

/**
 * Trigger RCA Methods Analysis (5 Whys or Fishbone 6M)
 * Calls POST /api/investigations/{investigationId}/rca-methods/analyze
 */
export const triggerRcaAnalysis = async (investigationId, method = 'five_whys') => {
  const response = await apiClient.post(`/api/investigations/${investigationId}/rca-methods/analyze`, {
    method,
  });
  return response.data;
};

/**
 * Fetch stored RCA methods data (5 Whys, Fishbone, Cause Candidates)
 * Calls GET /api/investigations/{investigationId}/rca-methods
 */
export const fetchRcaMethods = async (investigationId) => {
  const response = await apiClient.get(`/api/investigations/${investigationId}/rca-methods`);
  return response.data;
};

/**
 * Review/qualify a cause candidate (Human-in-the-Loop)
 * Calls PATCH /api/investigations/{investigationId}/causes/{causeId}
 */
export const updateCauseStatus = async (investigationId, causeId, reviewStatus, reviewerNote = null, candidateText = null) => {
  const response = await apiClient.patch(`/api/investigations/${investigationId}/causes/${causeId}`, {
    review_status: reviewStatus,
    reviewer_note: reviewerNote,
    candidate_text: candidateText,
  });
  return response.data;
};

/**
 * Trigger Cause Candidates & Evidence Assessment Matrix
 * Calls POST /api/investigations/{investigationId}/assessment/evaluate
 */
export const triggerCauseAssessment = async (investigationId) => {
  const response = await apiClient.post(`/api/investigations/${investigationId}/assessment/evaluate`);
  return response.data;
};

/**
 * Fetch Cause Candidates & Evidence Assessment Matrix
 * Calls GET /api/investigations/{investigationId}/assessment/matrix
 */
export const fetchCauseAssessmentMatrix = async (investigationId) => {
  const response = await apiClient.get(`/api/investigations/${investigationId}/assessment/matrix`);
  return response.data;
};

/**
 * Trigger CAPA action recommendations generation
 * Calls POST /api/investigations/{investigationId}/capa-suggestions
 */
export const triggerCapaGeneration = async (investigationId, causeCandidateIds = []) => {
  const response = await apiClient.post(`/api/investigations/${investigationId}/capa-suggestions`, {
    cause_candidate_ids: causeCandidateIds,
    include_followup_investigations: true,
  });
  return response.data;
};

/**
 * Fetch stored CAPA action recommendations
 * Calls GET /api/investigations/{investigationId}/capa-actions
 */
export const fetchCapaActions = async (investigationId) => {
  const response = await apiClient.get(`/api/investigations/${investigationId}/capa-actions`);
  return response.data;
};

/**
 * Review, accept, reject, or edit a CAPA action item (Human-in-the-Loop)
 * Calls PATCH /api/investigations/{investigationId}/capa-actions/{actionId}
 */
export const reviewCapaAction = async (
  investigationId,
  actionId,
  reviewStatus,
  actionText = null,
  effectivenessCheck = null,
  ownerRole = null,
  dueDate = null,
  reviewerNote = null
) => {
  const response = await apiClient.patch(`/api/investigations/${investigationId}/capa-actions/${actionId}`, {
    review_status: reviewStatus,
    action_text: actionText,
    effectiveness_check: effectivenessCheck,
    owner_role: ownerRole,
    due_date: dueDate,
    reviewer_note: reviewerNote,
  });
  return response.data;
};

/**
 * Update editable incident fields in PostgreSQL
 * Calls PATCH /api/investigations/{investigationId}
 */
export const updateInvestigationFields = async (investigationId, fields) => {
  const response = await apiClient.patch(`/api/investigations/${investigationId}`, fields);
  return response.data;
};

/**
 * Save and sign-off reviewed investigation dossier in PostgreSQL
 * Calls POST /api/investigations/{investigationId}/save
 */
export const saveInvestigationDossier = async (investigationId, reviewerNote, status = 'reviewed', reviewerName = null, reviewerRole = null) => {
  const response = await apiClient.post(`/api/investigations/${investigationId}/save`, {
    reviewer_note: reviewerNote,
    status,
    reviewer_name: reviewerName,
    reviewer_role: reviewerRole,
  });
  return response.data;
};

/**
 * Retrieve complete investigation dossier for reload or export
 * Calls GET /api/investigations/{investigationId}
 */
export const fetchInvestigationDossier = async (investigationId) => {
  const response = await apiClient.get(`/api/investigations/${investigationId}`);
  return response.data;
};

/**
 * Send natural conversational message to AI Copilot
 * Calls POST /api/investigations/{investigationId}/copilot/chat
 */
export const sendCopilotMessage = async (investigationId, message, conversationHistory = []) => {
  const response = await apiClient.post(`/api/investigations/${investigationId}/copilot/chat`, {
    message,
    conversation_history: conversationHistory,
  });
  return response.data;
};

/**
 * Check if batch number is already recorded in another investigation
 * Calls GET /api/investigations/check-duplicate?batch_number=...
 */
export const checkDuplicateBatch = async (batchNumber, excludeId = null) => {
  const params = new URLSearchParams();
  if (batchNumber) params.append('batch_number', batchNumber);
  if (excludeId) params.append('exclude_id', excludeId);
  const response = await apiClient.get(`/api/investigations/check-duplicate?${params.toString()}`);
  return response.data;
};

export default apiClient;
