import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, Send, Clock, ChevronDown, ChevronUp, Loader2,
  KeyRound, AlertTriangle, Sparkles, History, RefreshCw,
} from 'lucide-react';
import { api, streamAIAnalysis } from '@/lib/api-client';
import { AIAnalysis } from '@/types';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import { AIInsightCard } from '@/components/shared/AIInsightCard';
import { useSearchParams } from 'react-router-dom';

const ANALYSIS_TYPES = [
  { value: 'weekly_summary', label: 'Weekly Summary', desc: 'Executive overview, highlights & concerns' },
  { value: 'root_cause', label: 'Root Cause Analysis', desc: '5-Why deep dive into top failure patterns' },
  { value: 'action_plan', label: 'Action Plan', desc: 'Prioritised corrective actions with DRI & timeline' },
  { value: 'predictive', label: 'Predictive Risk', desc: 'Equipment at highest risk of failure next 1–2 weeks' },
  { value: 'predictive_risk', label: 'Predictive Risk (v2)', desc: 'Equipment at highest risk of failure next 1–2 weeks' },
  { value: 'oee_improvement', label: 'OEE Improvement', desc: 'Gap vs world-class benchmarks & roadmap' },
  { value: 'equipment_health', label: 'Maintenance Strategy', desc: 'PM intervals, MTBF/MTTR improvement plan' },
  { value: 'team_performance', label: 'Team Performance', desc: 'Response & resolution time analysis by team' },
];

const VALID_TYPES = ANALYSIS_TYPES.map(t => t.value);

export function AIInsights() {
  const [searchParams] = useSearchParams();
  const autoType = searchParams.get('type');
  const [selectedType, setSelectedType] = useState('root_cause');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [completedText, setCompletedText] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);
  const textareaRef = useRef<HTMLDivElement>(null);
  const autoTriggeredRef = useRef(false);

  const { data: history, refetch: refetchHistory } = useQuery<AIAnalysis[]>({
    queryKey: ['ai-history', 'v2'],
    queryFn: () => api.get('/ai/history'),
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (streamText && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [streamText]);

  useEffect(() => {
    if (autoType && VALID_TYPES.includes(autoType) && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      setSelectedType(autoType);
      setStreamText('');
      setCompletedText('');
      setError('');
      setStreaming(true);
      const stop = streamAIAnalysis(
        autoType,
        undefined,
        undefined,
        (chunk) => setStreamText((prev) => prev + chunk),
        (fullText) => { setStreaming(false); setCompletedText(fullText); refetchHistory(); },
        (err) => { setError(err); setStreaming(false); }
      );
      stopStreamRef.current = stop;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoType]);

  const handleAnalyze = () => {
    setStreamText('');
    setCompletedText('');
    setError('');
    setStreaming(true);

    const stop = streamAIAnalysis(
      selectedType,
      undefined,
      undefined,
      (chunk) => setStreamText((prev) => prev + chunk),
      (fullText) => {
        setStreaming(false);
        setCompletedText(fullText);
        refetchHistory();
      },
      (err) => {
        setError(err);
        setStreaming(false);
      }
    );
    stopStreamRef.current = stop;
  };

  const handleStop = () => {
    stopStreamRef.current?.();
    setStreaming(false);
  };

  const selectedMeta = ANALYSIS_TYPES.find((t) => t.value === selectedType);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">AI Insights</h1>
            <p className="text-xs text-text-muted">Powered by Anthropic Claude — structured, actionable analysis</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchHistory()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh History
        </Button>
      </div>

      {/* Analysis launcher */}
      <div className="card p-5">
        <h3 className="section-title mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Run AI Analysis
        </h3>

        {/* Type grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-5">
          {ANALYSIS_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => { setSelectedType(type.value); setStreamText(''); setError(''); }}
              className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                selectedType === type.value
                  ? 'border-primary bg-primary-light text-primary font-semibold'
                  : 'border-border-col bg-bg-surface text-text-secondary hover:border-primary/40 hover:bg-primary-light/50'
              }`}
            >
              <p className="font-medium leading-tight">{type.label}</p>
              <p className="text-xs text-text-muted mt-0.5 leading-snug">{type.desc}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleAnalyze} disabled={streaming} className="gap-2">
            {streaming
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</>
              : <><Send className="w-4 h-4" />Run {selectedMeta?.label || 'Analysis'}</>
            }
          </Button>
          {streaming && <Button variant="outline" onClick={handleStop}>Stop</Button>}
        </div>

        {/* Error display */}
        {error && (
          <div className={`mt-4 rounded-lg p-4 text-sm ${
            error.toLowerCase().includes('credit') || error.toLowerCase().includes('billing')
              ? 'bg-red-50 border border-red-200 text-red-800'
              : error.toLowerCase().includes('anthropic_api_key') || error.toLowerCase().includes('not configured')
              ? 'bg-amber-50 border border-amber-200 text-amber-800'
              : 'bg-red-50 border border-red-200 text-danger'
          }`}>
            {error.toLowerCase().includes('credit') || error.toLowerCase().includes('billing') ? (
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
                <div>
                  <p className="font-semibold mb-1">Insufficient Anthropic credits</p>
                  <p className="text-xs mb-2">{error}</p>
                  <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer"
                    className="text-xs underline font-medium">Add credits at console.anthropic.com/settings/billing →</a>
                </div>
              </div>
            ) : error.toLowerCase().includes('not configured') ? (
              <div className="flex gap-3">
                <KeyRound className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-semibold mb-1">API key not configured</p>
                  <code className="block bg-amber-100 px-3 py-1.5 rounded text-xs font-mono my-1">ANTHROPIC_API_KEY=sk-ant-...</code>
                  <p className="text-xs">Add to <code className="font-mono">backend/.env</code> and restart the server.</p>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Analysis result panel */}
        {(streaming || completedText) && (
          <div className="mt-5 border border-primary/20 rounded-xl bg-bg-base overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border-b border-primary/10">
              <Bot className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary">{selectedMeta?.label}</span>
              {streaming
                ? <span className="ml-auto text-xs text-text-muted">Analyzing your data...</span>
                : <span className="ml-auto text-xs text-success font-semibold">✓ Analysis complete</span>
              }
            </div>
            <div ref={textareaRef} className="p-5 max-h-[600px] overflow-y-auto">
              {streaming ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                    <Bot className="w-5 h-5 text-primary absolute inset-0 m-auto" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-text-primary">Claude is analyzing your data</p>
                    <p className="text-xs text-text-muted mt-1">Generating {selectedMeta?.label}...</p>
                  </div>
                </div>
              ) : completedText ? (
                <AIInsightCard analysisType={selectedType} response={completedText} />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div className="card p-5">
        <h3 className="section-title mb-4 flex items-center gap-2">
          <History className="w-4 h-4 text-text-muted" /> Analysis History
        </h3>
        {!history?.length ? (
          <div className="text-center py-8">
            <Bot className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
            <p className="text-text-muted text-sm">No analyses yet. Run your first analysis above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div key={item.id} className="border border-border-col rounded-xl overflow-hidden hover:border-primary/30 transition-colors">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-muted/40 transition-colors"
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-light text-primary whitespace-nowrap">
                      {(ANALYSIS_TYPES.find((t) => t.value === item.analysis_type)?.label) || item.analysis_type.replace(/_/g, ' ')}
                    </span>
                    {item.line && <span className="text-xs text-text-muted hidden sm:inline">Line: {item.line}</span>}
                    <span className="text-xs text-text-muted truncate">{formatDateTime(item.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-text-muted hidden md:inline">by {item.created_by_name}</span>
                    {expandedId === item.id
                      ? <ChevronUp className="w-4 h-4 text-text-muted" />
                      : <ChevronDown className="w-4 h-4 text-text-muted" />
                    }
                  </div>
                </button>
                {expandedId === item.id && item.response && (
                  <div className="border-t border-border-col bg-bg-base p-5">
                    <AIInsightCard analysisType={item.analysis_type} response={item.response} />
                  </div>
                )}
                {expandedId === item.id && !item.response && (
                  <div className="border-t border-border-col bg-bg-base px-5 py-4">
                    <p className="text-xs text-text-muted italic">Response not stored for this analysis.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
