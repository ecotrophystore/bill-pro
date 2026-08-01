import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { AppLayout } from './components/Layout/AppLayout';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const AddLead = lazy(() => import('./pages/AddLead'));
const Leads = lazy(() => import('./pages/Leads'));
const LeadDetail = lazy(() => import('./pages/LeadDetail'));
const PipelineBoard = lazy(() => import('./pages/PipelineBoard'));
const LeadIntake = lazy(() => import('./pages/LeadIntake'));
const Quotations = lazy(() => import('./pages/Quotations'));
const CreateQuotation = lazy(() => import('./pages/CreateQuotation'));
const Invoices = lazy(() => import('./pages/Invoices'));
const CreateInvoice = lazy(() => import('./pages/CreateInvoice'));
const CashMemos = lazy(() => import('./pages/CashMemos'));
const CreateCashMemo = lazy(() => import('./pages/CreateCashMemo'));
const ProductLibrary = lazy(() => import('./pages/ProductLibrary'));
const CustomerLibrary = lazy(() => import('./pages/CustomerLibrary'));
const Purchases = lazy(() => import('./pages/Purchases'));
const CreatePurchase = lazy(() => import('./pages/CreatePurchase'));
const Settings = lazy(() => import('./pages/Settings'));
const Reconciliation = lazy(() => import('./pages/Reconciliation'));
const AuditorPage = lazy(() => import('./pages/AuditorPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ProformaInvoices = lazy(() => import('./pages/ProformaInvoices'));
const CreateProformaInvoice = lazy(() => import('./pages/CreateProformaInvoice'));
const ExpensePage = lazy(() => import('./pages/Expense'));
const MessageTemplates = lazy(() => import('./pages/MessageTemplates'));
const MessageQueue = lazy(() => import('./pages/MessageQueue'));
const CRMDashboard = lazy(() => import('./pages/CRMDashboard'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const WhatsAppAutomation = lazy(() => import('./pages/WhatsAppAutomation'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="min-h-screen bg-surface flex items-center justify-center font-semibold text-primary">Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function RouteFallback() {
  return <div className="min-h-[50vh] flex items-center justify-center text-secondary font-semibold">Loading page...</div>;
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />

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
                <Route path="leads" element={<Leads />} />
                <Route path="leads/new" element={<AddLead />} />
                <Route path="leads/:id" element={<LeadDetail />} />
                <Route path="pipeline" element={<PipelineBoard />} />
                <Route path="lead-intake" element={<LeadIntake />} />
                <Route path="message-templates" element={<MessageTemplates />} />
                <Route path="message-queue" element={<MessageQueue />} />
                <Route path="whatsapp-automation" element={<WhatsAppAutomation />} />
                <Route path="crm-dashboard" element={<CRMDashboard />} />
                <Route path="audit-logs" element={<AuditLogs />} />

                <Route path="quotations" element={<Quotations />} />
                <Route path="quotations/new" element={<CreateQuotation />} />
                <Route path="quotations/edit/:id" element={<CreateQuotation />} />

                <Route path="invoices" element={<Invoices />} />
                <Route path="invoices/new" element={<CreateInvoice />} />
                <Route path="invoices/edit/:id" element={<CreateInvoice />} />

                <Route path="proforma-invoices" element={<ProformaInvoices />} />
                <Route path="proforma-invoices/new" element={<CreateProformaInvoice />} />
                <Route path="proforma-invoices/edit/:id" element={<CreateProformaInvoice />} />

                <Route path="cash-memos" element={<CashMemos />} />
                <Route path="cash-memos/new" element={<CreateCashMemo />} />
                <Route path="cash-memos/edit/:id" element={<CreateCashMemo />} />

                <Route path="library/products" element={<ProductLibrary />} />
                <Route path="library/customers" element={<CustomerLibrary />} />

                <Route path="purchases" element={<Purchases />} />
                <Route path="purchases/new" element={<CreatePurchase />} />
                <Route path="reconciliation" element={<Reconciliation />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="auditor" element={<AuditorPage />} />
                <Route path="expense" element={<ExpensePage />} />
                <Route path="settings" element={<Settings />} />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}
