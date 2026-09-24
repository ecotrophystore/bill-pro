import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ReminderAlarmProvider } from './contexts/ReminderAlarmContext';
import { AppLayout } from './components/Layout/AppLayout';
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

// Lazy loaded routes
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
const PurchaseAnalytics = lazy(() => import('./pages/PurchaseAnalytics'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, dbUser, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) return <div className="min-h-screen bg-transparent flex items-center justify-center font-semibold text-primary">Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  
  if (dbUser && !dbUser.is_active) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col items-center justify-center font-semibold text-primary gap-4">
        <p className="text-xl">Your account is pending admin approval.</p>
        <button onClick={logout} className="neo-btn-primary px-6 py-2">Sign Out</button>
      </div>
    );
  }

  return <>{children}</>;
}

function RouteFallback() {
  return (
    <div className="h-full min-h-[calc(100vh-64px)] w-full flex items-center justify-center text-secondary font-semibold">
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <span>Loading...</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ReminderAlarmProvider>
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
                <Route path="purchase-analytics" element={<PurchaseAnalytics />} />
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
        </ReminderAlarmProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

