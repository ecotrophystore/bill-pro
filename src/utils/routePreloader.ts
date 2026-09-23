export const preloadRoute = (path: string) => {
  try {
    switch (path) {
      case '/dashboard':
        import('../pages/Dashboard');
        break;
      case '/pipeline':
        import('../pages/PipelineBoard');
        break;
      case '/leads':
        import('../pages/Leads');
        break;
      case '/crm-dashboard':
        import('../pages/CRMDashboard');
        break;
      case '/library/customers':
        import('../pages/CustomerLibrary');
        break;
      case '/whatsapp-automation':
        import('../pages/WhatsAppAutomation');
        break;
      case '/message-templates':
        import('../pages/MessageTemplates');
        break;
      case '/message-queue':
        import('../pages/MessageQueue');
        break;
      case '/lead-intake':
        import('../pages/LeadIntake');
        break;
      case '/audit-logs':
        import('../pages/AuditLogs');
        break;
      case '/quotations':
        import('../pages/Quotations');
        break;
      case '/proforma-invoices':
        import('../pages/ProformaInvoices');
        break;
      case '/invoices':
        import('../pages/Invoices');
        break;
      case '/cash-memos':
        import('../pages/CashMemos');
        break;
      case '/purchases':
        import('../pages/Purchases');
        break;
      case '/expense':
        import('../pages/Expense');
        break;
      case '/reconciliation':
        import('../pages/Reconciliation');
        break;
      case '/library/products':
        import('../pages/ProductLibrary');
        break;
      case '/reports':
        import('../pages/ReportsPage');
        break;
      case '/settings':
        import('../pages/Settings');
        break;
      default:
        break;
    }
  } catch (error) {
    console.error('Failed to prefetch route:', error);
  }
};
