import React from 'react';
import { Database, Server, Globe, Cpu, GitBranch, Layers, ArrowRight, ArrowDown } from 'lucide-react';

interface ArchNode {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  icon: React.ReactNode;
}

interface ArchLayer {
  title: string;
  nodes: ArchNode[];
}

const layers: ArchLayer[] = [
  {
    title: 'Data Sources',
    nodes: [
      { id: 'excel', label: 'Excel / CSV', sublabel: 'Downtime records', color: 'bg-green-50 border-green-200 text-green-800', icon: <Layers className="w-4 h-4" /> },
      { id: 'demo', label: 'Demo Generator', sublabel: 'Synthetic data', color: 'bg-blue-50 border-blue-200 text-blue-800', icon: <GitBranch className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Backend (Node.js / Express)',
    nodes: [
      { id: 'upload', label: 'Upload Service', sublabel: 'multer + xlsx parser', color: 'bg-purple-50 border-purple-200 text-purple-800', icon: <Server className="w-4 h-4" /> },
      { id: 'oee', label: 'OEE Engine', sublabel: 'Availability · Perf · Quality', color: 'bg-purple-50 border-purple-200 text-purple-800', icon: <Cpu className="w-4 h-4" /> },
      { id: 'correlation', label: 'Correlation Engine', sublabel: 'Pearson · pattern detect', color: 'bg-purple-50 border-purple-200 text-purple-800', icon: <GitBranch className="w-4 h-4" /> },
      { id: 'ai', label: 'AI Service', sublabel: 'Anthropic Claude (streaming)', color: 'bg-orange-50 border-orange-200 text-orange-800', icon: <Cpu className="w-4 h-4" /> },
      { id: 'auth', label: 'Auth + RBAC', sublabel: 'JWT · bcrypt · roles', color: 'bg-red-50 border-red-200 text-red-800', icon: <Server className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Persistence',
    nodes: [
      { id: 'sqlite', label: 'SQLite (better-sqlite3)', sublabel: 'incidents · uploads · actions · users', color: 'bg-yellow-50 border-yellow-200 text-yellow-800', icon: <Database className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Frontend (React 18 + Vite)',
    nodes: [
      { id: 'dashboard', label: 'Dashboard', sublabel: 'KPIs + charts', color: 'bg-teal-50 border-teal-200 text-teal-800', icon: <Globe className="w-4 h-4" /> },
      { id: 'oeeexp', label: 'OEE Explorer', sublabel: 'Line drill-down', color: 'bg-teal-50 border-teal-200 text-teal-800', icon: <Globe className="w-4 h-4" /> },
      { id: 'downtime', label: 'Downtime Analysis', sublabel: 'Pareto · heatmap', color: 'bg-teal-50 border-teal-200 text-teal-800', icon: <Globe className="w-4 h-4" /> },
      { id: 'corr', label: 'Correlation Engine', sublabel: 'Matrix view', color: 'bg-teal-50 border-teal-200 text-teal-800', icon: <Globe className="w-4 h-4" /> },
      { id: 'aiui', label: 'AI Insights', sublabel: 'Streaming analysis', color: 'bg-teal-50 border-teal-200 text-teal-800', icon: <Globe className="w-4 h-4" /> },
      { id: 'actions', label: 'Action Plans', sublabel: 'CRUD + export', color: 'bg-teal-50 border-teal-200 text-teal-800', icon: <Globe className="w-4 h-4" /> },
    ],
  },
];

const techStack = [
  { category: 'Runtime', items: ['Node.js 18', 'TypeScript 5'] },
  { category: 'Framework', items: ['Express 4', 'React 18', 'Vite 5'] },
  { category: 'Database', items: ['SQLite (better-sqlite3)', 'Drizzle-style raw SQL'] },
  { category: 'AI', items: ['Anthropic Claude claude-3-5-sonnet', 'Server-Sent Events streaming'] },
  { category: 'Auth', items: ['JWT (jsonwebtoken)', 'bcryptjs', 'express-rate-limit'] },
  { category: 'UI', items: ['Tailwind CSS 3', 'Recharts', 'Lucide React', 'Radix UI', 'shadcn/ui'] },
  { category: 'State', items: ['Zustand (auth)', 'TanStack React Query v5'] },
  { category: 'Data', items: ['xlsx (SheetJS)', 'exceljs (reports)'] },
];

export function Architecture() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">System Architecture</h1>
          <p className="text-sm text-text-muted">Manufacturing OEE Intelligence Platform</p>
        </div>
      </div>

      {/* Architecture Diagram */}
      <div className="card p-6">
        <h3 className="section-title mb-6">Component Diagram</h3>
        <div className="space-y-2">
          {layers.map((layer, li) => (
            <div key={layer.title}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">{layer.title}</span>
                <div className="flex-1 h-px bg-border-col" />
              </div>
              <div className="flex flex-wrap gap-3 mb-2">
                {layer.nodes.map((node) => (
                  <div
                    key={node.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${node.color}`}
                  >
                    {node.icon}
                    <div>
                      <p className="font-semibold text-xs">{node.label}</p>
                      {node.sublabel && <p className="text-xs opacity-70">{node.sublabel}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {li < layers.length - 1 && (
                <div className="flex justify-center my-1">
                  <ArrowDown className="w-4 h-4 text-text-muted" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Data Flow */}
      <div className="card p-6">
        <h3 className="section-title mb-4">Data Flow</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[
            'Excel Upload',
            'xlsx Parser',
            'OEE Engine',
            'SQLite Storage',
            'REST API',
            'React Query Cache',
            'Dashboard / Charts',
          ].map((step, i, arr) => (
            <React.Fragment key={step}>
              <span className="px-3 py-1.5 rounded-full bg-primary-light text-primary font-medium text-xs">
                {step}
              </span>
              {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {[
            'Analysis Request',
            'Context Builder',
            'Claude claude-3-5-sonnet API',
            'SSE Stream',
            'Real-time Text',
          ].map((step, i, arr) => (
            <React.Fragment key={step}>
              <span className="px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 font-medium text-xs border border-orange-200">
                {step}
              </span>
              {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tech Stack */}
      <div className="card p-6">
        <h3 className="section-title mb-4">Technology Stack</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {techStack.map((group) => (
            <div key={group.category}>
              <p className="label-text mb-2">{group.category}</p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item} className="text-xs text-text-secondary bg-bg-muted px-2 py-1 rounded">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* API Endpoints */}
      <div className="card p-6">
        <h3 className="section-title mb-4">Key API Endpoints</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
          {[
            { method: 'POST', path: '/api/auth/login', desc: 'Authenticate user, get JWT' },
            { method: 'POST', path: '/api/auth/setup', desc: 'First-run admin setup' },
            { method: 'POST', path: '/api/upload', desc: 'Upload Excel/CSV file' },
            { method: 'POST', path: '/api/upload/demo', desc: 'Generate synthetic data' },
            { method: 'GET', path: '/api/analyze/summary', desc: 'OEE summary + KPIs' },
            { method: 'GET', path: '/api/analyze/by-line', desc: 'OEE breakdown by line' },
            { method: 'GET', path: '/api/analyze/pareto', desc: 'Pareto failure analysis' },
            { method: 'GET', path: '/api/analyze/timeline', desc: 'Incident timeline' },
            { method: 'GET', path: '/api/analyze/correlation', desc: 'Correlation matrix' },
            { method: 'POST', path: '/api/ai/analyze', desc: 'Run AI analysis (SSE)' },
            { method: 'GET', path: '/api/ai/history', desc: 'Past AI analyses' },
            { method: 'GET', path: '/api/actions', desc: 'List action plans' },
            { method: 'POST', path: '/api/actions', desc: 'Create action plan' },
            { method: 'GET', path: '/api/settings', desc: 'OEE settings / thresholds' },
          ].map((ep) => (
            <div key={ep.path} className="flex items-baseline gap-2 py-1 border-b border-border-col/40">
              <span className={`text-xs font-mono font-bold flex-shrink-0 ${
                ep.method === 'GET' ? 'text-success' : ep.method === 'POST' ? 'text-primary' : 'text-warning'
              }`}>
                {ep.method}
              </span>
              <span className="text-xs font-mono text-text-secondary">{ep.path}</span>
              <span className="text-xs text-text-muted ml-auto">{ep.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
