import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Shared/Toast';
import { VoiceCommandProvider } from './contexts/VoiceCommandContext';
import { VoiceFormProvider } from './contexts/VoiceFormContext';
import { VoiceCommandFAB } from './components/AI/VoiceCommandFAB';
import { VoiceOverlayManager } from './components/AI/VoiceOverlayManager';
import { AppLayout } from './components/Layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Quotations from './pages/Quotations';
import CreateQuotation from './pages/CreateQuotation';
import Invoices from './pages/Invoices';
import CreateInvoice from './pages/CreateInvoice';
import CashMemos from './pages/CashMemos';
import CreateCashMemo from './pages/CreateCashMemo';
import ProductLibrary from './pages/ProductLibrary';
import CustomerLibrary from './pages/CustomerLibrary';
import Purchases from './pages/Purchases';
import Settings from './pages/Settings';
import Reconciliation from './pages/Reconciliation';
import AuditorPage from './pages/AuditorPage';
import ReportsPage from './pages/ReportsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="min-h-screen bg-surface flex items-center justify-center font-semibold text-primary">Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  
  return <>{children}</>;
}

function AuthenticatedApp() {
  return (
    <VoiceFormProvider>
      <VoiceCommandProvider>
        <Routes>
          <Route 
            path="/" 
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            
            <Route path="quotations" element={<Quotations />} />
            <Route path="quotations/new" element={<CreateQuotation />} />
            
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/new" element={<CreateInvoice />} />

            <Route path="cash-memos" element={<CashMemos />} />
            <Route path="cash-memos/new" element={<CreateCashMemo />} />

            <Route path="library/products" element={<ProductLibrary />} />
            <Route path="library/customers" element={<CustomerLibrary />} />

            <Route path="purchases" element={<Purchases />} />
            <Route path="reconciliation" element={<Reconciliation />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="auditor" element={<AuditorPage />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        {/* Global Voice Commander FAB - available on all authenticated pages */}
        <VoiceCommandFAB />
        <VoiceOverlayManager />
      </VoiceCommandProvider>
    </VoiceFormProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
