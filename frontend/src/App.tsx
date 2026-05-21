import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CommandPalette } from './components/shared/CommandPalette';
import { LoginPage } from './pages/Login';
import { SetupPage } from './pages/Setup';
import { Dashboard } from './pages/Dashboard';
import { OEEExplorer } from './pages/OEEExplorer';
import { DowntimeAnalysis } from './pages/DowntimeAnalysis';
import { CorrelationEngine } from './pages/CorrelationEngine';
import { AIInsights } from './pages/AIInsights';
import { ActionPlans } from './pages/ActionPlans';
import { Reports } from './pages/Reports';
import { DataUploadPage } from './pages/DataUpload';
import { Architecture } from './pages/Architecture';
import { Settings } from './pages/Settings';
import { RegisterPage } from './pages/Register';
import { UserManagement } from './pages/UserManagement';
import { UsageAnalytics } from './pages/UsageAnalytics';

function AppLayout({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="min-h-screen bg-bg-base">
      <Sidebar />
      <div className="ml-60 transition-all duration-300">
        <Header onSearchOpen={() => setCmdOpen(true)} />
        <main className="pt-14 min-h-screen">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/oee-explorer" element={<ProtectedRoute><OEEExplorer /></ProtectedRoute>} />
        <Route path="/downtime-analysis" element={<ProtectedRoute><DowntimeAnalysis /></ProtectedRoute>} />
        <Route path="/correlation" element={<ProtectedRoute><CorrelationEngine /></ProtectedRoute>} />
        <Route path="/ai-insights" element={<ProtectedRoute><AIInsights /></ProtectedRoute>} />
        <Route path="/action-plans" element={<ProtectedRoute><ActionPlans /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/upload" element={<ProtectedRoute><DataUploadPage /></ProtectedRoute>} />
        <Route path="/architecture" element={<ProtectedRoute><Architecture /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/user-management" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
        <Route path="/usage-analytics" element={<ProtectedRoute><UsageAnalytics /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
