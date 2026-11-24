import React, { useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addSourceDocument,
  removeSourceDocument,
  setActiveStage,
  setIncidentFields,
  setExtractedFacts,
  setMissingInformation,
  setExtractionWarnings,
} from '../../features/investigation/investigationSlice';
import {
  uploadEvidenceDocument,
  submitPastedNarrative,
  submitEmailRecord,
  triggerAiExtraction,
} from '../../services/api';

export const IntakeStage = () => {
  const dispatch = useDispatch();
  const sourceDocuments = useSelector((state) => state.investigation.sourceDocuments);
  const investigationId = useSelector((state) => state.investigation.investigation.id) || 'draft-inv';

  const [activeTab, setActiveTab] = useState('pdf');
  const [pastedText, setPastedText] = useState('');
  const [pastedTitle, setPastedTitle] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailSender, setEmailSender] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [apiSuccess, setApiSuccess] = useState(null);

  const fileInputRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setApiError(null);
    setApiSuccess(null);

    try {
      const data = await uploadEvidenceDocument(investigationId, file);
      dispatch(
        addSourceDocument({
          id: data.document_id,
          filename: data.filename,
          source_type: data.source_type,
          page_count: data.page_count,
          parse_status: data.parse_status,
          uploaded_at: data.created_at,
          excerpt: data.preview,
          warnings: data.warnings,
        })
      );
      setApiSuccess(`Successfully parsed ${data.filename} (${data.page_count} page(s), ${data.char_count} chars).`);
    } catch (err) {
      // Fallback: Add as local document if backend is offline
      const localDoc = {
        id: `doc-${Date.now()}`,
        filename: file.name,
        source_type: file.name.endsWith('.pdf') ? 'pdf' : file.name.endsWith('.eml') ? 'eml' : 'text',
        page_count: 1,
        parse_status: 'local_pending',
        uploaded_at: new Date().toISOString(),
        excerpt: `Local file: ${file.name} (${Math.round(file.size / 1024)} KB). Backend offline fallback.`,
      };
      dispatch(addSourceDocument(localDoc));
      setApiError(`Backend upload warning: ${err.message || 'Offline'}. Preserved as local draft.`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddPastedText = async () => {
    if (!pastedText.trim()) return;

    setIsLoading(true);
    setApiError(null);
    setApiSuccess(null);

    try {
      const data = await submitPastedNarrative(
        investigationId,
        pastedText,
        pastedTitle || 'Pasted Operational Log'
      );
      dispatch(
        addSourceDocument({
          id: data.document_id,
          filename: data.filename,
          source_type: data.source_type,
          page_count: data.page_count,
          parse_status: data.parse_status,
          uploaded_at: data.created_at,
          excerpt: data.preview,
        })
      );
      setApiSuccess('Pasted narrative successfully normalized and attached.');
      setPastedText('');
      setPastedTitle('');
    } catch (err) {
      // Fallback
      dispatch(
        addSourceDocument({
          id: `doc-${Date.now()}`,
          filename: pastedTitle || 'Pasted Operational Log',
          source_type: 'pasted_text',
          page_count: 1,
          parse_status: 'local_pending',
          uploaded_at: new Date().toISOString(),
          excerpt: pastedText.slice(0, 160),
        })
      );
      setApiError(`Backend note: ${err.message}. Preserved as local draft.`);
      setPastedText('');
      setPastedTitle('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEmailRecord = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;

    setIsLoading(true);
    setApiError(null);
    setApiSuccess(null);

    try {
      const data = await submitEmailRecord(investigationId, {
        subject: emailSubject,
        body: emailBody,
        sender: emailSender || 'qa-alerts@pharmaceutical.invalid',
      });
      dispatch(
        addSourceDocument({
          id: data.document_id,
          filename: data.filename,
          source_type: data.source_type,
          page_count: data.page_count,
          parse_status: data.parse_status,
          uploaded_at: data.created_at,
          excerpt: data.preview,
        })
      );
      setApiSuccess('Email record successfully normalized.');
      setEmailSubject('');
      setEmailSender('');
      setEmailBody('');
    } catch (err) {
      dispatch(
        addSourceDocument({
          id: `doc-${Date.now()}`,
          filename: `Email: ${emailSubject.slice(0, 30)}`,
          source_type: 'email',
          page_count: 1,
          parse_status: 'local_pending',
          uploaded_at: new Date().toISOString(),
          excerpt: emailBody.slice(0, 160),
        })
      );
      setApiError(`Backend note: ${err.message}. Preserved as local draft.`);
      setEmailSubject('');
      setEmailSender('');
      setEmailBody('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAiExtraction = async () => {
    if (sourceDocuments.length === 0) {
      setApiError('Please upload or ingest at least one evidence document before running AI extraction.');
      return;
    }

    setIsExtracting(true);
    setApiError(null);
    setApiSuccess(null);

    try {
      const data = await triggerAiExtraction(investigationId, null, false);
      dispatch(setIncidentFields({ fields: data.incident_fields, overwrite: false }));
      dispatch(setExtractedFacts(data.extracted_facts || []));
      dispatch(setMissingInformation(data.missing_information || []));
      dispatch(setExtractionWarnings(data.warnings || []));
      setApiSuccess(`AI Extraction complete: ${data.extracted_facts?.length || 0} facts extracted. Proceeding to Incident Form...`);
      setTimeout(() => {
        dispatch(setActiveStage('form'));
      }, 700);
    } catch (err) {
      setApiError(`AI Extraction failed: ${err.message || 'Service offline'}. You can still complete the form manually or click 'Load Sample API-X Incident'.`);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.tag}>Normalized Ingestion Pipeline</div>
        <h2 style={styles.title}>Incident Intake & Evidence Document Processing</h2>
        <p style={styles.subtitle}>
          Ingest raw incident telemetry from PDF reports, pasted text logs, or email communications.
          Extracted facts will be normalized into structured form fields with page-level source traceability.
        </p>
      </div>

      {apiSuccess && <div style={styles.successBanner}>{apiSuccess}</div>}
      {apiError && <div style={styles.errorBanner}>{apiError}</div>}

      {/* Input Channel Selector */}
      <div style={styles.channelTabs}>
        <button
          onClick={() => setActiveTab('pdf')}
          style={{
            ...styles.channelBtn,
            borderBottom: activeTab === 'pdf' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'pdf' ? '#f8fafc' : '#94a3b8',
          }}
        >
          📄 PDF Investigation Report
        </button>
        <button
          onClick={() => setActiveTab('text')}
          style={{
            ...styles.channelBtn,
            borderBottom: activeTab === 'text' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'text' ? '#f8fafc' : '#94a3b8',
          }}
        >
          📝 Pasted Incident Narrative
        </button>
        <button
          onClick={() => setActiveTab('email')}
          style={{
            ...styles.channelBtn,
            borderBottom: activeTab === 'email' ? '2px solid #38bdf8' : '2px solid transparent',
            color: activeTab === 'email' ? '#f8fafc' : '#94a3b8',
          }}
        >
          📧 Email / Communication Record
        </button>
      </div>

      {/* Tab Panels */}
      <div style={styles.inputArea}>
        {activeTab === 'pdf' && (
          <div style={styles.dropzone}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📄</div>
            <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc' }}>Upload Investigation PDF / EML</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              Select deviation reports, batch records, or calibration certificates (Max 20MB)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.eml,.txt"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="file-upload-input"
            />
            <label htmlFor="file-upload-input" style={styles.uploadBtn}>
              {isLoading ? 'Processing via PyMuPDF...' : 'Browse & Upload Document'}
            </label>
          </div>
        )}

        {activeTab === 'text' && (
          <div style={styles.textPanel}>
            <input
              type="text"
              value={pastedTitle}
              onChange={(e) => setPastedTitle(e.target.value)}
              placeholder="Document Title (e.g., Crystallization Logbook Shift Notes)"
              style={styles.input}
            />
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste operational log excerpts, operator shift notes, or equipment error transcripts..."
              style={styles.textarea}
              rows={5}
            />
            <button
              onClick={handleAddPastedText}
              disabled={isLoading || !pastedText.trim()}
              style={{
                ...styles.actionBtn,
                opacity: isLoading || !pastedText.trim() ? 0.6 : 1,
              }}
            >
              {isLoading ? 'Normalizing Text...' : 'Submit Pasted Narrative'}
            </button>
          </div>
        )}

        {activeTab === 'email' && (
          <div style={styles.emailPanel}>
            <input
              type="text"
              value={emailSender}
              onChange={(e) => setEmailSender(e.target.value)}
              placeholder="From: (e.g., qa-lead@pharma-manufacturing.invalid)"
              style={styles.input}
            />
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Email Subject: e.g. Urgent - Batch API-X Purity Deviation Alert"
              style={styles.input}
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Email Body text..."
              style={styles.textarea}
              rows={4}
            />
            <button
              onClick={handleAddEmailRecord}
              disabled={isLoading || !emailSubject.trim() || !emailBody.trim()}
              style={{
                ...styles.actionBtn,
                opacity: isLoading || !emailSubject.trim() || !emailBody.trim() ? 0.6 : 1,
              }}
            >
              {isLoading ? 'Normalizing Email...' : 'Ingest Email Record'}
            </button>
          </div>
        )}
      </div>

      {/* Document Registry Table */}
      <div style={styles.docListSection}>
        <h3 style={styles.sectionHeading}>
          Ingested Evidence Documents ({sourceDocuments.length})
        </h3>
        {sourceDocuments.length === 0 ? (
          <div style={styles.emptyNotice}>
            No documents ingested yet. Upload a PDF, submit narrative text, or click "Load Sample API-X Incident" in the header.
          </div>
        ) : (
          <div style={styles.docGrid}>
            {sourceDocuments.map((doc) => (
              <div key={doc.id} style={styles.docCard}>
                <div style={styles.docCardHeader}>
                  <span style={styles.docTypeBadge}>{doc.source_type?.toUpperCase()}</span>
                  <button
                    onClick={() => dispatch(removeSourceDocument(doc.id))}
                    style={styles.deleteBtn}
                    title="Remove document"
                  >
                    ✕
                  </button>
                </div>
                <div style={styles.docFilename}>{doc.filename}</div>
                <div style={styles.docExcerpt}>"{doc.excerpt}"</div>
                <div style={styles.docMeta}>
                  Status:{' '}
                  <strong
                    style={{
                      color:
                        doc.parse_status === 'processed'
                          ? '#10b981'
                          : doc.parse_status === 'partial'
                          ? '#f59e0b'
                          : '#38bdf8',
                    }}
                  >
                    {doc.parse_status}
                  </strong>{' '}
                  • {doc.page_count} page(s)
                </div>
              </div>
            ))}
          </div>
        )}

        {sourceDocuments.length > 0 && (
          <div style={styles.extractionCallout}>
            <div style={styles.extractionText}>
              <div style={styles.extractionTitle}>⚡ LangGraph + Groq AI Extraction Ready</div>
              <div style={styles.extractionDesc}>
                Automatically extract batch numbers, quality specifications, observed laboratory assay, and identify missing GxP data into the RCA Incident Form.
              </div>
            </div>
            <button
              onClick={handleRunAiExtraction}
              disabled={isExtracting}
              style={{
                ...styles.extractRunBtn,
                opacity: isExtracting ? 0.7 : 1,
              }}
            >
              {isExtracting ? 'Extracting via LangGraph + Groq...' : 'Run AI Extraction & Populate Form →'}
            </button>
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
  successBanner: { backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#34d399', padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' },
  errorBanner: { backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' },
  channelTabs: { display: 'flex', gap: '16px', borderBottom: '1px solid #334155', marginBottom: '20px' },
  channelBtn: { backgroundColor: 'transparent', border: 'none', padding: '10px 4px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
  inputArea: { marginBottom: '24px' },
  dropzone: { border: '2px dashed #475569', borderRadius: '8px', padding: '36px', textAlign: 'center', backgroundColor: '#0f172a' },
  uploadBtn: { display: 'inline-block', backgroundColor: '#0284c7', color: '#ffffff', padding: '10px 22px', borderRadius: '6px', fontWeight: '600', fontSize: '0.88rem', cursor: 'pointer' },
  textPanel: { display: 'flex', flexDirection: 'column', gap: '12px' },
  emailPanel: { display: 'flex', flexDirection: 'column', gap: '12px' },
  textarea: { width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '12px', fontSize: '0.88rem', boxSizing: 'border-box' },
  input: { width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', padding: '10px 12px', fontSize: '0.88rem', boxSizing: 'border-box' },
  actionBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '10px 20px', fontWeight: '600', cursor: 'pointer', fontSize: '0.85rem', alignSelf: 'flex-start' },
  docListSection: { marginTop: '24px', borderTop: '1px solid #334155', paddingTop: '16px' },
  sectionHeading: { fontSize: '1rem', color: '#e2e8f0', margin: '0 0 12px 0' },
  emptyNotice: { padding: '24px', textAlign: 'center', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', fontSize: '0.85rem' },
  docGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' },
  docCard: { backgroundColor: '#0f172a', borderRadius: '6px', padding: '14px', border: '1px solid #334155' },
  docCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  docTypeBadge: { backgroundColor: '#334155', color: '#38bdf8', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' },
  deleteBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' },
  docFilename: { fontWeight: '600', color: '#f1f5f9', fontSize: '0.9rem', marginBottom: '6px' },
  docExcerpt: { fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', marginBottom: '8px', lineHeight: 1.4 },
  docMeta: { fontSize: '0.75rem', color: '#64748b' },
  extractionCallout: { marginTop: '20px', padding: '16px 20px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #0284c7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' },
  extractionText: { flex: '1 1 300px' },
  extractionTitle: { fontSize: '0.95rem', fontWeight: '700', color: '#38bdf8', marginBottom: '4px' },
  extractionDesc: { fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.4 },
  extractRunBtn: { backgroundColor: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '10px 20px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', transition: 'background 0.2s', whiteSpace: 'nowrap' },
};

export default IntakeStage;
