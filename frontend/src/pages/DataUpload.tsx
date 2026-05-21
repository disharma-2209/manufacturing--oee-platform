import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Trash2, Database, Loader2, Play, ArrowRight, BarChart3, Bot, Sparkles, LineChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, streamAIAnalysis } from '@/lib/api-client';
import { DataUpload } from '@/types';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/utils';

interface LineOEEUpload {
  id: number;
  line: string;
  week_number: number;
  year: number;
  original_filename: string;
  upload_time: string;
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  total_boards: number;
  uploaded_by_name?: string;
}

const FALLBACK_LINES = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 6', 'Line 7'];

function sortLinesNumerically(lines: string[]): string[] {
  return [...lines].sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10);
    const numB = parseInt(b.replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

const AI_ANALYSIS_TYPES = [
  'weekly_summary', 'root_cause', 'action_plan',
  'predictive_risk', 'benchmark_gap', 'maintenance_strategy', 'team_performance',
] as const;

export function DataUploadPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const [aiProgress, setAiProgress] = useState<{ running: boolean; completed: number; total: number; current: string }>({
    running: false, completed: 0, total: AI_ANALYSIS_TYPES.length, current: '',
  });

  const { data: uploads, isLoading } = useQuery<DataUpload[]>({
    queryKey: ['uploads'],
    queryFn: () => api.get('/upload/history'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/upload/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  });

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setUploadResult({ success: false, message: 'Only Excel (.xlsx, .xls) and CSV files are supported.' });
      return;
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.uploadFile<{ uploadId: number; recordCount: number; linesDetected: string[] }>('/upload/file', fd);
      setUploadResult({ success: true, message: `✓ Uploaded successfully — ${res.recordCount} incidents loaded across ${res.linesDetected?.length || 0} lines.` });
      setAnalysisReady(false);
      setAnalysisError('');
      qc.invalidateQueries({ queryKey: ['uploads'] });
      qc.invalidateQueries({ queryKey: ['analysis-summary'] });
    } catch (err: unknown) {
      setUploadResult({ success: false, message: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const runAllAIAnalyses = () => {
    const types = [...AI_ANALYSIS_TYPES];
    setAiProgress({ running: true, completed: 0, total: types.length, current: '' });

    let completedCount = 0;
    const onOneDone = () => {
      completedCount++;
      setAiProgress((p) => ({ ...p, completed: completedCount }));
      if (completedCount >= types.length) {
        setAiProgress((p) => ({ ...p, running: false, current: '' }));
        qc.invalidateQueries({ queryKey: ['ai-history', 'v2'] });
        qc.invalidateQueries({ queryKey: ['action-plans'] });
      }
    };

    // Fire all 7 in parallel
    types.forEach((type) => {
      streamAIAnalysis(type, undefined, undefined, () => {}, onOneDone, onOneDone);
    });
  };

  const handleExecuteAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError('');
    setAnalysisReady(false);
    try {
      const result = await api.get<{ empty?: boolean; summary?: { totalIncidents: number; avgOEE: number } }>('/analyze/summary');
      if (result.empty) {
        setAnalysisError('No data found in the database. Please upload a file first.');
      } else {
        setAnalysisReady(true);
        qc.invalidateQueries({ queryKey: ['analysis-summary'] });
        qc.invalidateQueries({ queryKey: ['trends'] });
        runAllAIAnalyses();
      }
    } catch (err: unknown) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDemoData = async () => {
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await api.post<{ uploadId: number; recordCount: number; linesDetected: string[] }>('/upload/demo', {});
      setUploadResult({ success: true, message: `✓ Demo data loaded — ${res.recordCount} incidents across ${res.linesDetected?.length || 0} lines.` });
      setAnalysisReady(false);
      setAnalysisError('');
      qc.invalidateQueries({ queryKey: ['uploads'] });
      qc.invalidateQueries({ queryKey: ['analysis-summary'] });
    } catch (err: unknown) {
      setUploadResult({ success: false, message: err instanceof Error ? err.message : 'Failed to load demo data' });
    } finally {
      setUploading(false);
    }
  };

  const hasUploads = (uploads?.length ?? 0) > 0;

  // ── Per-line OEE file upload state ──────────────────────────────────────────
  // Each line has its own drag-over flag, uploading flag, result, week, year, and file input ref.
  interface LineUploadState {
    dragOver: boolean;
    uploading: boolean;
    result: { success: boolean; message: string; oee?: number; availability?: number; performance?: number; quality?: number; boards?: number; weekNumber?: number } | null;
    week: string;
    year: string;
    detectedWeek: number | null;
    detectionNote: string;
  }
  const initLineState = (): LineUploadState => ({ dragOver: false, uploading: false, result: null, week: '', year: '', detectedWeek: null, detectionNote: '' });
  const [lineStates, setLineStates] = useState<Record<string, LineUploadState>>({});
  const lineFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setLineState = (line: string, patch: Partial<LineUploadState>) =>
    setLineStates((prev) => ({ ...prev, [line]: { ...prev[line], ...patch } }));

  const { data: lineOEEHistory, isLoading: lineHistoryLoading } = useQuery<LineOEEUpload[]>({
    queryKey: ['line-oee-history'],
    queryFn: () => api.get('/line-upload/history'),
  });

  const { data: analysisSummary } = useQuery<{ byLine?: { line: string }[]; empty?: boolean }>({
    queryKey: ['analysis-summary'],
    queryFn: () => api.get('/analyze/summary'),
    staleTime: 60000,
  });

  // Build sorted deduplicated line list from: fallback + summary lines + history lines
  const allLines = React.useMemo(() => {
    const set = new Set<string>(FALLBACK_LINES);
    (analysisSummary?.byLine || []).forEach(l => set.add(l.line));
    (lineOEEHistory || []).forEach(u => set.add(u.line));
    return sortLinesNumerically(Array.from(set));
  }, [analysisSummary, lineOEEHistory]);

  // Lazily ensure every discovered line has an entry in lineStates
  React.useEffect(() => {
    setLineStates(prev => {
      const next = { ...prev };
      let changed = false;
      allLines.forEach(l => {
        if (!next[l]) { next[l] = initLineState(); changed = true; }
      });
      return changed ? next : prev;
    });
  }, [allLines]);

  const deleteLineOEEMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/line-upload/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['line-oee-history'] }),
  });

  const detectWeekFromFile = async (line: string, file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('line', line);
      const res = await api.uploadFile<{ detectedWeek: number; detectedYear: number; detectedLine: string }>('/line-upload/detect', fd);
      const st = lineStates[line];
      
      // Auto-fill week only if user hasn't typed anything
      if (!st.week) {
        setLineState(line, { 
          detectedWeek: res.detectedWeek, 
          detectionNote: `Auto-detected from timestamps. Edit if your file labelling differs.`
        });
      }
    } catch (err) {
      // Detection failed - don't show error to user, just continue without auto-fill
      console.warn('Week detection failed:', err);
    }
  };

  const handleLineOEEFile = async (line: string, file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setLineState(line, { result: { success: false, message: 'Only Excel (.xlsx, .xls) files are supported.' } });
      return;
    }
    
    // Step 1: Detect week from file
    await detectWeekFromFile(line, file);
    
    setLineState(line, { uploading: true, result: null });
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('line', line);
      const st = lineStates[line];
      if (st.week)  fd.append('week',  st.week);
      if (st.year)  fd.append('year',  st.year);
      const res = await api.uploadFile<{ line: string; weekNumber: number; oee: number; availability: number; performance: number; quality: number; totalBoardsProduced: number }>('/line-upload/file', fd);
      
      // Show warning if saved week differs from detected
      let message = `✓ Week ${res.weekNumber} uploaded`;
      if (st.detectedWeek && st.detectedWeek !== res.weekNumber) {
        message += ` (timestamps indicated Week ${st.detectedWeek})`;
      }
      
      setLineState(line, {
        result: {
          success: true,
          message,
          oee: res.oee,
          availability: res.availability,
          performance: res.performance,
          quality: res.quality,
          boards: res.totalBoardsProduced,
          weekNumber: res.weekNumber,
        },
        detectedWeek: null, // Clear detection after successful upload
        detectionNote: '',
      });
      qc.invalidateQueries({ queryKey: ['line-oee-history'] });
      qc.invalidateQueries({ queryKey: ['analysis-summary'] });
      qc.invalidateQueries({ queryKey: ['oee-transparency'] });
      qc.invalidateQueries({ queryKey: ['trends'] });
    } catch (err: unknown) {
      setLineState(line, { result: { success: false, message: err instanceof Error ? err.message : 'Upload failed' } });
    } finally {
      setLineState(line, { uploading: false });
      const ref = lineFileRefs.current[line];
      if (ref) ref.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header with step indicator */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Data Upload</h1>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${hasUploads ? 'bg-green-50 text-success' : 'bg-bg-muted text-text-muted'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold ${hasUploads ? 'bg-success' : 'bg-text-muted'}`}>1</span>
            Upload Data
          </div>
          <ArrowRight className="w-3 h-3" />
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${analysisReady ? 'bg-green-50 text-success' : 'bg-bg-muted text-text-muted'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold ${analysisReady ? 'bg-success' : 'bg-text-muted'}`}>2</span>
            Execute Analysis
          </div>
          <ArrowRight className="w-3 h-3" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium bg-bg-muted text-text-muted">
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold bg-text-muted">3</span>
            View Dashboard
          </div>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        className={`card border-2 border-dashed transition-colors p-12 text-center cursor-pointer ${
          dragOver ? 'border-primary bg-primary-light' : 'border-border-col hover:border-primary/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-text-secondary font-medium">Processing file...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center">
              <Upload className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold text-text-primary">Drop your Excel file here</p>
              <p className="text-sm text-text-muted mt-1">Supports .xlsx, .xls, .csv — or click to browse</p>
            </div>
          </div>
        )}
      </div>

      {/* Result Banner */}
      {uploadResult && (
        <div className={`flex items-center gap-3 p-4 rounded-lg text-sm font-medium ${
          uploadResult.success ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-danger border border-red-200'
        }`}>
          {uploadResult.success
            ? <CheckCircle className="w-5 h-5 flex-shrink-0" />
            : <AlertCircle className="w-5 h-5 flex-shrink-0" />
          }
          {uploadResult.message}
        </div>
      )}

      {/* Execute Analysis CTA — shown whenever uploads exist */}
      {hasUploads && (
        <div className={`card p-5 border-2 transition-colors ${analysisReady && !aiProgress.running ? 'border-success bg-green-50/50' : 'border-primary/30 bg-primary-light/30'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${analysisReady && !aiProgress.running ? 'bg-success' : 'bg-primary'}`}>
                {analysisReady && !aiProgress.running
                  ? <CheckCircle className="w-5 h-5 text-white" />
                  : analyzing || aiProgress.running
                    ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                    : <Play className="w-5 h-5 text-white" />
                }
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {analysisReady && !aiProgress.running
                    ? 'Analysis complete — all insights ready'
                    : aiProgress.running
                      ? 'Generating AI insights in parallel…'
                      : 'Step 2: Execute Analysis'}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {analysisReady && !aiProgress.running
                    ? 'OEE metrics and all 7 AI insights have been generated and saved.'
                    : aiProgress.running
                      ? `${aiProgress.completed} of ${aiProgress.total} insights complete`
                      : 'Computes OEE metrics and automatically generates all 7 AI insights.'}
                </p>
                {analysisError && (
                  <p className="text-xs text-danger mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {analysisError}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {!analysisReady && !aiProgress.running && (
                <Button
                  onClick={handleExecuteAnalysis}
                  disabled={analyzing || uploading}
                  className="gap-2 whitespace-nowrap"
                >
                  {analyzing
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</>
                    : <><Play className="w-4 h-4" />Execute Analysis</>
                  }
                </Button>
              )}
              {aiProgress.running && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {AI_ANALYSIS_TYPES.map((t, i) => (
                      <div key={t} className={`w-2 h-2 rounded-full transition-colors ${
                        i < aiProgress.completed ? 'bg-success' :
                        i === aiProgress.completed ? 'bg-primary animate-pulse' :
                        'bg-border-col'
                      }`} />
                    ))}
                  </div>
                  <span className="text-xs text-text-muted">{aiProgress.completed}/{aiProgress.total}</span>
                </div>
              )}
              {analysisReady && !aiProgress.running && (
                <Button onClick={() => navigate('/')} className="gap-2 whitespace-nowrap">
                  <BarChart3 className="w-4 h-4" /> View Dashboard
                </Button>
              )}
            </div>
          </div>

          {/* AI progress bar */}
          {aiProgress.running && (
            <div className="mt-3 pt-3 border-t border-primary/10">
              <div className="flex items-center gap-2 mb-1.5">
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-primary font-medium">Generating AI insights in background</span>
                <span className="text-xs text-text-muted ml-auto">{aiProgress.completed}/{aiProgress.total} complete</span>
              </div>
              <div className="w-full bg-bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary rounded-full h-1.5 transition-all duration-500"
                  style={{ width: `${(aiProgress.completed / aiProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-text-muted mt-1.5">
                <Sparkles className="w-3 h-3 inline mr-1 text-primary" />
                You can navigate to the Dashboard now — insights will appear automatically when ready.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Demo Data */}
      <div className="card p-5">
        <h3 className="section-title mb-2">No data? Try the demo dataset</h3>
        <p className="text-sm text-text-muted mb-4">
          Loads 4 weeks of synthetic manufacturing downtime data for Enphase IQ8 production lines.
        </p>
        <Button variant="outline" onClick={handleDemoData} disabled={uploading} className="gap-2">
          <Database className="w-4 h-4" />
          Load Demo Data
        </Button>
      </div>

      {/* ── Line-Level OEE Files ─────────────────────────────────────────── */}
      <div className="card p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-primary" />
            <h3 className="section-title">Line-Level OEE Files <span className="text-xs font-normal text-text-muted ml-1">(timestamp extracts from Siemens CMES)</span></h3>
          </div>
          {lineHistoryLoading ? null : (lineOEEHistory?.length ?? 0) > 0 && (
            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {lineOEEHistory!.length} file{lineOEEHistory!.length !== 1 ? 's' : ''} uploaded
            </span>
          )}
        </div>

        {/* Line File Format hint */}
        <div className="mb-4 bg-violet-50 border border-violet-100 rounded-md px-3 py-2 text-[10.5px] text-violet-700">
          <span className="font-semibold">Line File Format</span>
          <span className="text-violet-500 ml-1">— Each file should be a weekly extract with board-level timestamp data.</span>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-[10px]">
            <span><strong>Col H (idx 7):</strong> SPI / Screen Printer timestamp</span>
            <span><strong>Col Z (idx 25):</strong> API / PCB_VI timestamp</span>
            <span><strong>Col AF (idx 31):</strong> Lead Height (LH) timestamp</span>
            <span><strong>Col AX (idx 49):</strong> Carousel timestamp</span>
            <span><strong>Col BG (idx 58):</strong> Wave 3 timestamp</span>
          </div>
        </div>

        {/* 2×N per-line card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {allLines.map((line) => {
            const st = lineStates[line] ?? initLineState();
            // Most-recent uploaded record for this line
            const latestUpload = lineOEEHistory
              ?.filter((u) => u.line === line)
              .sort((a, b) => b.year - a.year || b.week_number - a.week_number)[0];
            const oeeColor = (oee: number) =>
              oee >= 0.72 ? 'text-success' : oee >= 0.55 ? 'text-warning' : 'text-danger';

            return (
              <div
                key={line}
                className="border border-border-col rounded-xl p-3 flex flex-col gap-2 bg-white hover:shadow-card transition-shadow"
              >
                {/* Card header: line name + latest OEE badge */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-text-primary">{line}</span>
                  {latestUpload ? (
                    <span className={`text-[10px] font-bold font-mono ${oeeColor(latestUpload.oee)}`}>
                      WK-{latestUpload.week_number}/{latestUpload.year} · {(latestUpload.oee * 100).toFixed(1)}% OEE
                    </span>
                  ) : (
                    <span className="text-[10px] text-text-muted italic">No file uploaded</span>
                  )}
                </div>

                {/* Week / Year inputs */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[9px] font-semibold text-text-muted uppercase tracking-wide block mb-0.5">Week (optional)</label>
                    <input
                      type="number"
                      min={1} max={53}
                      placeholder={st.detectedWeek ? `Detected: ${st.detectedWeek}` : "Auto-detect"}
                      value={st.week}
                      onChange={(e) => setLineState(line, { week: e.target.value })}
                      className="w-full border border-border-col rounded-md px-2 py-1 text-xs text-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-text-muted/60"
                    />
                    {st.detectionNote && (
                      <p className="text-[8px] text-text-muted mt-1 italic">{st.detectionNote}</p>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] font-semibold text-text-muted uppercase tracking-wide block mb-0.5">Year (optional)</label>
                    <input
                      type="number"
                      min={2020} max={2099}
                      placeholder="Auto-detect"
                      value={st.year}
                      onChange={(e) => setLineState(line, { year: e.target.value })}
                      className="w-full border border-border-col rounded-md px-2 py-1 text-xs text-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-text-muted/60"
                    />
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  className={`border-2 border-dashed rounded-lg px-3 py-3 text-center cursor-pointer transition-colors ${
                    st.dragOver
                      ? 'border-primary bg-primary-light'
                      : st.result?.success
                        ? 'border-success/40 bg-green-50/50'
                        : 'border-border-col hover:border-primary/50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setLineState(line, { dragOver: true }); }}
                  onDragLeave={() => setLineState(line, { dragOver: false })}
                  onDrop={(e) => {
                    e.preventDefault();
                    setLineState(line, { dragOver: false });
                    const file = e.dataTransfer.files[0];
                    if (file) handleLineOEEFile(line, file);
                  }}
                  onClick={() => lineFileRefs.current[line]?.click()}
                >
                  <input
                    ref={(el) => { lineFileRefs.current[line] = el; }}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLineOEEFile(line, f); }}
                  />
                  {st.uploading ? (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-primary">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing timestamps…
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
                      <Upload className="w-3.5 h-3.5" />
                      Drop <strong className="text-text-primary">{line}</strong> file or click to browse
                    </div>
                  )}
                </div>

                {/* Per-card result */}
                {st.result && (
                  <div className={`rounded-md px-2.5 py-1.5 text-[10.5px] ${
                    st.result.success
                      ? 'bg-green-50 border border-green-200 text-success'
                      : 'bg-red-50 border border-red-200 text-danger'
                  }`}>
                    <div className="flex items-center gap-1.5 font-medium">
                      {st.result.success
                        ? <CheckCircle className="w-3 h-3 flex-shrink-0" />
                        : <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                      {st.result.message}
                    </div>
                    {st.result.success && st.result.oee !== undefined && (
                      <div className="flex gap-3 mt-0.5 pl-4 font-semibold text-[10px] text-text-secondary">
                        <span className="text-primary">OEE {(st.result.oee * 100).toFixed(1)}%</span>
                        <span>A {(( st.result.availability ?? 0) * 100).toFixed(1)}%</span>
                        <span>P {((st.result.performance  ?? 0) * 100).toFixed(1)}%</span>
                        <span>Q {((st.result.quality      ?? 0) * 100).toFixed(2)}%</span>
                        {st.result.boards && <span className="text-text-muted">{formatNumber(st.result.boards)} boards</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* History rows for this line */}
                {(lineOEEHistory?.filter((u) => u.line === line).length ?? 0) > 0 && (
                  <div className="border-t border-border-col/30 pt-1.5 space-y-0.5">
                    {lineOEEHistory!
                      .filter((u) => u.line === line)
                      .sort((a, b) => b.year - a.year || b.week_number - a.week_number)
                      .map((u) => (
                        <div key={u.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-text-muted">WK{u.week_number}/{u.year}</span>
                          <span className={`font-bold font-mono ${oeeColor(u.oee)}`}>{(u.oee * 100).toFixed(1)}%</span>
                          <span className="text-text-muted truncate max-w-[90px]" title={u.original_filename}>{u.original_filename}</span>
                          <button
                            onClick={() => { if (confirm(`Remove ${u.line} WK${u.week_number} file?`)) deleteLineOEEMutation.mutate(u.id); }}
                            className="p-0.5 text-text-muted hover:text-danger transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-md p-3">
          <p className="text-xs text-blue-700 font-semibold mb-1">How it works</p>
          <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
            <li>Upload the Siemens CMES timestamp extract for each line (one file per line per week)</li>
            <li>OEE is computed from actual throughput vs. 500 boards/hr target; planned hours are derived automatically from the Lead Height timestamp span (e.g. 120h, 112h, 112.5h)</li>
            <li>Once uploaded, the dashboard uses <strong>line-file OEE</strong> (marked <span className="font-mono bg-blue-100 px-1 rounded">📊 Line File</span>) instead of downtime-based estimates</li>
            <li>Lines without an uploaded file continue to use incident-log OEE — no data is lost</li>
            <li>Re-uploading for the same line/week automatically replaces the previous file</li>
          </ul>
        </div>
      </div>

      {/* Expected Format */}
      <div className="card p-5">
        <h3 className="section-title mb-1">Expected Excel Format</h3>
        <p className="text-xs text-text-muted mb-3">
          Column names are matched case-insensitively. The parser picks the first sheet named "Raw Data", "Data", or "Incidents" — otherwise uses the first sheet.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="bg-bg-muted">
                {['Field', 'Accepted column names', 'Required?'].map((h) => (
                  <th key={h} className="border border-border-col px-2 py-1.5 text-left label-text">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Report Time', 'REPORT TIME, Report Time, Date Reported, Date/Time, Timestamp', '✓ Key'],
                ['Line', 'LINE, Line, Production Line, Prod Line', '✓ Key'],
                ['Equipment', 'EQUIPMENT, Equipment, Machine, Asset', 'Recommended'],
                ['Cause Category', 'CAUSE CATEGORY, Category, Failure Category, DT Category', 'Recommended'],
                ['Cause', 'CAUSE, Cause, Root Cause, Reason, Description, Failure Description', 'Recommended'],
                ['Duration', 'DURATION, Duration (hrs), Downtime Hours, DT Duration, Hours', 'Recommended'],
                ['Team', 'TEAM, Team, Dept, Department', 'Optional'],
                ['Shift', 'SHIFT, Shift — or auto-derived from Report Time', 'Optional'],
                ['Product Code', 'PRODUCT CODE, Product, Part Number, SKU, Model', 'Optional'],
                ['Status', 'STATUS, Status, State', 'Optional'],
                ['Remarks', 'REMARKS, Comments, Notes', 'Optional'],
                ['Repair Description', 'REPAIR DESCRIPTION, Action Taken, Corrective Action, Fix Description', 'Optional'],
              ].map(([field, aliases, req]) => (
                <tr key={field} className="border-b border-border-col/40">
                  <td className="border border-border-col px-2 py-1.5 font-medium text-text-primary whitespace-nowrap">{field}</td>
                  <td className="border border-border-col px-2 py-1.5 text-text-muted">{aliases}</td>
                  <td className={`border border-border-col px-2 py-1.5 whitespace-nowrap font-medium ${
                    req === '✓ Key' ? 'text-primary' : req === 'Recommended' ? 'text-warning' : 'text-text-muted'
                  }`}>{req}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-xs text-blue-700 font-semibold mb-1">💡 Tips for best results</p>
          <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
            <li>Name your sheet <strong>Raw Data</strong> or <strong>Incidents</strong> for auto-detection</li>
            <li>Duration should be in hours (e.g. <strong>1.5</strong>) or HH:MM:SS format</li>
            <li>Dates can be Excel serial numbers, ISO strings, or human-readable formats</li>
            <li>Rows missing both Line and Report Time are skipped silently</li>
          </ul>
        </div>
      </div>

      {/* Upload History */}
      <div className="card p-5">
        <h3 className="section-title mb-4">Upload History</h3>
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : !uploads?.length ? (
          <p className="text-text-muted text-sm">No uploads yet.</p>
        ) : (
          <div className="space-y-2">
            {uploads.map((u) => (
              <div key={u.id} className="flex items-center gap-4 p-3 border border-border-col rounded-lg hover:bg-bg-muted/50">
                <FileSpreadsheet className="w-5 h-5 text-success flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{u.filename}</p>
                  <p className="text-xs text-text-muted">
                    {formatDateTime(u.upload_time)} · {formatNumber(u.record_count)} incidents · Week {u.week_number}
                    {u.lines_detected && ` · ${(() => { try { return JSON.parse(u.lines_detected).length; } catch { return 0; } })()} lines`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  u.status === 'processed' ? 'bg-green-50 text-success' :
                  u.status === 'processing' ? 'bg-yellow-50 text-warning' :
                  'bg-red-50 text-danger'
                }`}>
                  {u.status}
                </span>
                <button
                  onClick={() => { if (confirm('Delete this upload and its data?')) deleteMutation.mutate(u.id); }}
                  className="p-1 text-text-muted hover:text-danger transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
