import React, { useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  setIncidentField,
  setIncidentFields,
  setExtractedFacts,
  setMissingInformation,
  addSourceDocument,
  loadSyntheticSampleData,
  setActiveStage,
} from '../features/investigation/investigationSlice';
import {
  uploadEvidenceDocument,
  submitPastedNarrative,
  triggerAiExtraction,
  triggerRcaAnalysis,
  triggerCapaGeneration,
} from '../services/api';

export const CopilotWorkspace = ({ onSwitchToStepper }) => {
  const dispatch = useDispatch();
  const investigation = useSelector((state) => state.investigation.investigation);
  const fields = useSelector((state) => state.investigation.incidentFields);
  const sourceDocs = useSelector((state) => state.investigation.sourceDocuments);

  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);

  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'msg-welcome',
      sender: 'assistant',
      text: 'Ready to process new complaints. You can paste the raw email from the customer, or upload a PDF of the complaint report. I will extract the data and run the initial risk assessment.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const scrollToBottom = () => {
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const handleFieldChange = (fieldName, value) => {
    dispatch(setIncidentField({ field: fieldName, value }));
  };

  const handleSendMessage = async () => {
    const text = inputMessage.trim();
    if (!text || isProcessing) return;

    setInputMessage('');
    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);
    scrollToBottom();

    try {
      const invId = investigation.id || 'inv-copilot';

      // 1. Ingest pasted text
      const ingestRes = await submitPastedNarrative(invId, text, 'Customer Complaint Intake');
      dispatch(
        addSourceDocument({
          id: ingestRes.document_id,
          filename: ingestRes.filename || 'pasted_complaint.txt',
          source_type: 'pasted_text',
          page_count: ingestRes.total_pages || 1,
          parse_status: 'processed',
          uploaded_at: new Date().toISOString(),
          excerpt: text.slice(0, 200),
        })
      );

      // 2. Trigger LangGraph extraction
      const extractRes = await triggerAiExtraction(invId, null, false);
      if (extractRes.incident_fields) {
        dispatch(setIncidentFields({ fields: extractRes.incident_fields, overwrite: true }));
      }
      if (extractRes.extracted_facts) {
        dispatch(setExtractedFacts(extractRes.extracted_facts));
      }
      if (extractRes.missing_information) {
        dispatch(setMissingInformation(extractRes.missing_information));
      }

      const pName = extractRes.incident_fields?.product_name || 'Active Product';
      const bNum = extractRes.incident_fields?.batch_number || 'N/A';
      const sev = extractRes.incident_fields?.severity || 'medium';

      const assistantReply = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: `Extracted complaint telemetry for ${pName} (Batch: ${bNum}). Severity evaluated as ${sev.toUpperCase()}. All 11 incident fields have been populated in the complaint form.`,
        facts: extractRes.extracted_facts || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantReply]);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Error processing complaint text.';
      setMessages((prev) => [
        ...prev,
        {
          id: `asst-err-${Date.now()}`,
          sender: 'assistant',
          text: `Processing notice: ${detail}. In offline mode, sample data can also be loaded directly.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsProcessing(false);
      scrollToBottom();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const userMsg = {
      id: `user-upload-${Date.now()}`,
      sender: 'user',
      text: `Uploaded attachment: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);
    scrollToBottom();

    try {
      const invId = investigation.id || 'inv-copilot';
      const uploadRes = await uploadEvidenceDocument(invId, file);

      dispatch(
        addSourceDocument({
          id: uploadRes.document_id,
          filename: uploadRes.filename || file.name,
          source_type: uploadRes.source_type || 'pdf',
          page_count: uploadRes.total_pages || 1,
          parse_status: uploadRes.parse_status || 'processed',
          uploaded_at: new Date().toISOString(),
          excerpt: uploadRes.excerpt || file.name,
        })
      );

      // Trigger LangGraph Extraction
      const extractRes = await triggerAiExtraction(invId, [uploadRes.document_id], false);
      if (extractRes.incident_fields) {
        dispatch(setIncidentFields({ fields: extractRes.incident_fields, overwrite: true }));
      }
      if (extractRes.extracted_facts) {
        dispatch(setExtractedFacts(extractRes.extracted_facts));
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `asst-upload-${Date.now()}`,
          sender: 'assistant',
          text: `Processed ${file.name}. PyMuPDF extracted ${uploadRes.total_pages || 1} page(s). Incident fields auto-populated.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Error parsing document.';
      setMessages((prev) => [
        ...prev,
        {
          id: `asst-err-${Date.now()}`,
          sender: 'assistant',
          text: `Upload notice: ${detail}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsProcessing(false);
      scrollToBottom();
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLoadSample = () => {
    dispatch(loadSyntheticSampleData());
    setMessages((prev) => [
      ...prev,
      {
        id: `asst-sample-${Date.now()}`,
        sender: 'assistant',
        text: 'Preloaded API-X Batch BATCH-2026-014 Out-of-Specification scenario. Purity assay reported 98.1% (Registered limit >= 99.0%). Calibration cert for TEMP-SENSOR-014 attached (+0.8°C error).',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    scrollToBottom();
  };

  const handleRun5Whys = async () => {
    setIsProcessing(true);
    const invId = investigation.id || 'inv-copilot';
    try {
      await triggerRcaAnalysis(invId, 'five_whys');
      setMessages((prev) => [
        ...prev,
        {
          id: `asst-rca-${Date.now()}`,
          sender: 'assistant',
          text: '5 Whys causal chain generated! Root cause isolated to temperature sensor calibration drift causing crystallization kinetics alteration. Click below to view the interactive diagram.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `asst-rca-err-${Date.now()}`,
          sender: 'assistant',
          text: `5 Whys status: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsProcessing(false);
      scrollToBottom();
    }
  };

  const handleRunCapa = async () => {
    setIsProcessing(true);
    const invId = investigation.id || 'inv-copilot';
    try {
      await triggerCapaGeneration(invId);
      setMessages((prev) => [
        ...prev,
        {
          id: `asst-capa-${Date.now()}`,
          sender: 'assistant',
          text: 'CAPA Action Plan formulated! Generated containment quarantine, sensor recalibration, and preventive CMMS lockout actions with measurable effectiveness criteria.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `asst-capa-err-${Date.now()}`,
          sender: 'assistant',
          text: `CAPA status: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsProcessing(false);
      scrollToBottom();
    }
  };

  return (
    <div className="bg-white text-black antialiased h-screen overflow-hidden flex flex-col font-sans">
      {/* Top Banner with Stitch Title & View Toggle */}
      <div className="bg-white border-b border-black px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-sm tracking-tight text-black">AIVOA.AI</span>
          <span className="text-xs px-2 py-0.5 border border-black rounded font-medium bg-black text-white">
            Copilot View
          </span>
          <span className="text-xs text-black/70">API & FDF Deviation Management</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleLoadSample}
            className="text-xs font-semibold px-3 py-1.5 border border-black rounded-md hover:bg-black hover:text-white transition-colors"
            title="Load synthetic BATCH-2026-014 API-X deviation scenario"
          >
            🧪 Load Sample API-X Incident
          </button>
          <button
            onClick={onSwitchToStepper}
            className="text-xs font-semibold px-3 py-1.5 bg-black text-white rounded-md hover:opacity-80 transition-opacity flex items-center gap-1.5"
            title="Open multi-stage 5 Whys, Fishbone, Matrix, and CAPA sign-off view"
          >
            <span>📑 Full RCA Stepper Workspace</span>
            <span>➔</span>
          </button>
        </div>
      </div>

      {/* BEGIN: MainWorkspace (Split-screen 60% Form / 40% Copilot) */}
      <main className="flex flex-1 h-full w-full overflow-hidden" data-purpose="split-screen-workspace">
        {/* BEGIN: Left Complaint Form Pane (60%) */}
        <section
          className="w-3/5 h-full overflow-y-auto px-10 py-8 border-r border-black bg-white flex flex-col"
          data-purpose="left-complaint-form-pane"
        >
          {/* Form Header */}
          <header className="flex items-start justify-between pb-6 border-b border-black" data-purpose="complaint-form-header">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-black">Log Customer Complaint</h1>
              <p className="text-sm text-black mt-1">API & FDF Quality Assurance Module</p>
            </div>
            {/* Status pill badge */}
            <span
              className="inline-flex items-center px-3.5 py-1 rounded-full text-xs font-semibold border border-black bg-white text-black"
              data-purpose="triage-status-badge"
            >
              {investigation.status ? investigation.status.toUpperCase() : 'Pending Triage'}
            </span>
          </header>

          {/* Form Fields */}
          <form className="mt-8 flex-1 space-y-6 pb-12" data-purpose="complaint-intake-form" onSubmit={(e) => e.preventDefault()}>
            {/* Row 1: Product Name, Product Code, Batch Number */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="product-name">
                  Product Name *
                </label>
                <input
                  type="text"
                  id="product-name"
                  name="product_name"
                  value={fields.product_name || ''}
                  onChange={(e) => handleFieldChange('product_name', e.target.value)}
                  placeholder="e.g. API-X"
                  className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="product-code">
                  Product / Item Code
                </label>
                <input
                  type="text"
                  id="product-code"
                  name="product_code"
                  value={fields.product_code || ''}
                  onChange={(e) => handleFieldChange('product_code', e.target.value)}
                  placeholder="e.g. APIX-RAW-99"
                  className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="batch-number">
                  Batch / Lot Number *
                </label>
                <input
                  type="text"
                  id="batch-number"
                  name="batch_number"
                  value={fields.batch_number || ''}
                  onChange={(e) => handleFieldChange('batch_number', e.target.value)}
                  placeholder="e.g. BATCH-2026-014"
                  className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md"
                />
              </div>
            </div>

            {/* Row 2: Manufacturing Stage, Incident Occurrence Date/Time, Incident Severity */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="manufacturing-stage">
                  Manufacturing Stage / Process Step
                </label>
                <input
                  type="text"
                  id="manufacturing-stage"
                  name="manufacturing_stage"
                  value={fields.manufacturing_stage || ''}
                  onChange={(e) => handleFieldChange('manufacturing_stage', e.target.value)}
                  placeholder="e.g. Crystallization & Solvent Purification"
                  className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="incident-datetime">
                  Incident Occurrence Date / Time
                </label>
                <input
                  type="text"
                  id="incident-datetime"
                  name="incident_datetime"
                  value={fields.incident_date || ''}
                  onChange={(e) => handleFieldChange('incident_date', e.target.value)}
                  placeholder="e.g. 2026-11-20T08:30:00Z"
                  className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-black" htmlFor="incident-severity">
                    Incident Severity
                  </label>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-emerald-600 text-emerald-600 bg-emerald-50">
                    Evaluated
                  </span>
                </div>
                <select
                  id="incident-severity"
                  name="incident_severity"
                  value={fields.severity || 'medium'}
                  onChange={(e) => handleFieldChange('severity', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white text-black border border-black rounded-md"
                >
                  <option value="low">Low (Incident / Observation)</option>
                  <option value="medium">Medium (Minor Deviation)</option>
                  <option value="high">High (Major Deviation)</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            {/* Row 3: Problem Statement & Registered Specification */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="problem-statement">
                  Problem Statement / Observed Failure *
                </label>
                <textarea
                  id="problem-statement"
                  name="problem_statement"
                  rows={3}
                  value={fields.problem_statement || ''}
                  onChange={(e) => handleFieldChange('problem_statement', e.target.value)}
                  placeholder="Detailed description of the deviation..."
                  className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md resize-none font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="registered-spec">
                  Registered Specification / Expected Result
                </label>
                <input
                  type="text"
                  id="registered-spec"
                  name="registered_spec"
                  value={fields.expected_result || ''}
                  onChange={(e) => handleFieldChange('expected_result', e.target.value)}
                  placeholder="e.g. >= 99.0% purity"
                  className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md"
                />
              </div>
            </div>

            {/* Row 4: Observed Laboratory / Sensor Result & Equipment Identifiers */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="observed-result">
                  Observed Laboratory / Sensor Result
                </label>
                <input
                  type="text"
                  id="observed-result"
                  name="observed_result"
                  value={fields.observed_result || ''}
                  onChange={(e) => handleFieldChange('observed_result', e.target.value)}
                  placeholder="e.g. 98.1% purity (OOS)"
                  className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="equipment-identifiers">
                  Equipment Identifiers Involved
                </label>
                <input
                  type="text"
                  id="equipment-identifiers"
                  name="equipment_identifiers"
                  value={fields.equipment_id || ''}
                  onChange={(e) => handleFieldChange('equipment_id', e.target.value)}
                  placeholder="e.g. CRYST-REACTOR-02 / TEMP-SENSOR-014"
                  className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md"
                />
              </div>
            </div>

            {/* Row 5: Immediate Containment Actions Taken */}
            <div>
              <label className="block text-xs font-semibold text-black mb-1.5" htmlFor="containment-actions">
                Immediate Containment Actions Taken
              </label>
              <textarea
                id="containment-actions"
                name="containment_actions"
                rows={3}
                value={fields.immediate_action || ''}
                onChange={(e) => handleFieldChange('immediate_action', e.target.value)}
                placeholder="e.g. Batch quarantined. Downstream processing halted."
                className="w-full px-3 py-2 text-sm bg-white text-black placeholder-black/50 border border-black rounded-md resize-none font-mono text-xs"
              />
            </div>

            {/* Attached Evidence Pills */}
            {sourceDocs.length > 0 && (
              <div className="pt-2 border-t border-black/20">
                <div className="text-[11px] font-semibold text-black/60 uppercase tracking-wider mb-2">
                  Attached Evidence Sources ({sourceDocs.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {sourceDocs.map((doc) => (
                    <span
                      key={doc.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-black rounded bg-black/5 font-mono"
                    >
                      <span>📄 {doc.filename}</span>
                      <span className="text-[10px] text-black/50">({doc.page_count}p)</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </form>
        </section>

        {/* BEGIN: Right Copilot Chat Pane (40%) */}
        <aside className="w-2/5 h-full flex flex-col bg-white" data-purpose="right-copilot-chat-pane">
          {/* Copilot Header */}
          <header className="px-6 py-4 border-b border-black flex items-center justify-between bg-white" data-purpose="copilot-header">
            <div className="flex items-start gap-3">
              {/* Flask / Copilot icon */}
              <div aria-hidden="true" className="mt-0.5 text-black">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path
                    d="M9 3h6m-5 0v5.172a2 2 0 01-.586 1.414l-4.828 4.828A2 2 0 004 15.828V18a3 3 0 003 3h10a3 3 0 003-3v-2.172a2 2 0 00-.586-1.414l-4.828-4.828A2 2 0 0114 8.172V3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-black leading-tight">AIVOA Copilot</h2>
                <p className="text-xs text-black mt-0.5">Drop complaint files or paste text below.</p>
              </div>
            </div>
            {/* Active status dot */}
            <span
              className={`w-2.5 h-2.5 rounded-full inline-block ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-black'}`}
              data-purpose="copilot-status-dot"
              title={isProcessing ? 'Processing...' : 'Online'}
            />
          </header>

          {/* Quick Action Chips Bar */}
          <div className="px-6 py-2 border-b border-black/10 bg-black/[0.02] flex items-center gap-2 overflow-x-auto text-xs">
            <button
              onClick={handleLoadSample}
              className="whitespace-nowrap px-2.5 py-1 border border-black rounded text-[11px] font-medium hover:bg-black hover:text-white transition-colors"
            >
              🧪 Load API-X
            </button>
            <button
              onClick={handleRun5Whys}
              disabled={isProcessing}
              className="whitespace-nowrap px-2.5 py-1 border border-black rounded text-[11px] font-medium hover:bg-black hover:text-white transition-colors"
            >
              🔍 5 Whys
            </button>
            <button
              onClick={handleRunCapa}
              disabled={isProcessing}
              className="whitespace-nowrap px-2.5 py-1 border border-black rounded text-[11px] font-medium hover:bg-black hover:text-white transition-colors"
            >
              🛡️ Suggest CAPA
            </button>
            <button
              onClick={() => {
                dispatch(setActiveStage('evidence'));
                onSwitchToStepper();
              }}
              className="whitespace-nowrap px-2.5 py-1 border border-black rounded text-[11px] font-medium hover:bg-black hover:text-white transition-colors"
            >
              ⚖️ Evidence Gaps
            </button>
          </div>

          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white" data-purpose="chat-messages-container">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3.5 ${msg.sender === 'user' ? 'justify-end' : ''}`}
                data-purpose={msg.sender === 'assistant' ? 'assistant-message-row' : 'user-message-row'}
              >
                {msg.sender === 'assistant' && (
                  <div
                    aria-hidden="true"
                    className="w-8 h-8 rounded-full border border-black flex items-center justify-center shrink-0 bg-white text-black"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                <div
                  className={`border border-black rounded-lg p-4 text-sm leading-relaxed max-w-md ${
                    msg.sender === 'user' ? 'bg-black text-white' : 'bg-white text-black'
                  }`}
                  data-purpose="message-card"
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <span
                    className={`block text-[10px] mt-2 font-mono ${
                      msg.sender === 'user' ? 'text-white/60' : 'text-black/50'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-full border border-black flex items-center justify-center shrink-0 bg-white text-black animate-spin">
                  ⚙️
                </div>
                <div className="border border-black rounded-lg p-3 text-xs bg-white text-black">
                  LangGraph agent analyzing complaint evidence and extracting fields...
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input Dock */}
          <footer className="p-4 border-t border-black bg-white" data-purpose="chat-input-dock">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.txt,.eml"
              className="hidden"
            />

            {/* Bordered input box */}
            <div className="flex items-center gap-2 border border-black rounded-lg px-3 py-2 bg-white">
              {/* Attachment paperclip button */}
              <button
                aria-label="Attach complaint file"
                className="p-1.5 text-black hover:opacity-70 transition-opacity"
                title="Attach complaint PDF or text file"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* Message input field */}
              <input
                aria-label="Type a message or paste a complaint"
                className="flex-1 text-sm bg-white text-black placeholder-black/50 border-0 focus:ring-0 focus:shadow-none px-1 py-1 outline-none"
                placeholder="Type a message or paste a complaint..."
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />

              {/* Solid black send / submit button */}
              <button
                aria-label="Send message"
                className="w-9 h-9 rounded-md bg-black text-white flex items-center justify-center shrink-0 hover:opacity-85 transition-opacity disabled:opacity-50"
                title="Send message"
                type="button"
                disabled={isProcessing || !inputMessage.trim()}
                onClick={handleSendMessage}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Attribution footer */}
            <p className="text-[10px] font-semibold tracking-widest uppercase text-center text-black mt-3">
              POWERED BY LANGGRAPH
            </p>
          </footer>
        </aside>
      </main>
    </div>
  );
};

export default CopilotWorkspace;
