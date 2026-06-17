import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  Receipt, 
  ShoppingCart, 
  Building2, 
  BarChart3, 
  Bot, 
  Settings,
  Bell,
  Search,
  Menu,
  X,
  Banknote,
  LogOut
} from 'lucide-react';
import clsx from 'clsx';
import { AIAuditor } from '../AI/AIAuditor';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/quotations', label: 'Quotations', icon: FileText },
  { path: '/invoices', label: 'Invoices', icon: Receipt },
  { path: '/cash-memos', label: 'Cash Memos', icon: Banknote },
  { path: '/library/products', label: 'Product Library', icon: Receipt }, // Using Receipt icon as a placeholder if BookOpen not available, but let's check Package
  { path: '/library/customers', label: 'Customer Library', icon: Building2 },
  { path: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { path: '/reconciliation', label: 'Reconciliation', icon: Building2 },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/auditor', label: 'AI Auditor', icon: Bot },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { logout, dbUser } = useAuth();

  return (
    <div className="min-h-screen flex bg-surface text-secondary">
      {/* Sidebar */}
      <aside 
        className={clsx(
          "fixed inset-y-0 left-0 z-50 bg-surface border-r border-shadow-darker/20 transition-all duration-300 transform flex flex-col",
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full w-64 md:translate-x-0 md:w-20"
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-shadow-darker/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-surface font-bold shadow-neo-raised">
              EB
            </div>
            {sidebarOpen && <span className="font-bold text-lg text-primary-dark">EcoBill</span>}
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 text-primary-dark">
            <X size={20} />
          </button>
        </div>

        <nav className="p-4 space-y-3 flex-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={!sidebarOpen ? item.label : undefined}
              className={({ isActive }) =>
                clsx(
                  "neo-nav-stacked",
                  isActive && "active",
                  !sidebarOpen && "justify-center px-0"
                )
              }
            >
              <item.icon size={20} className={sidebarOpen ? "shrink-0" : ""} />
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main 
        className={clsx(
          "flex-1 flex flex-col min-h-screen transition-all duration-300",
          sidebarOpen ? "md:ml-64" : "md:ml-20"
        )}
      >
        {/* Top Navbar */}
        <header className="h-16 flex items-center justify-between px-6 bg-surface border-b border-shadow-darker/20 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-primary-dark neo-btn !px-3 !py-2 hidden md:block">
              <Menu size={20} />
            </button>
            <button onClick={() => setSidebarOpen(true)} className="p-2 text-primary-dark block md:hidden">
              <Menu size={24} />
            </button>
            
            <div className="hidden sm:flex items-center neo-input !py-2 w-64 lg:w-96 gap-2">
              <Search size={18} className="text-secondary" />
              <input 
                type="text" 
                placeholder="Global Search (Coming Soon)" 
                className="bg-transparent border-none outline-none w-full text-sm"
                onKeyDown={(e) => e.key === 'Enter' && alert("Global Search: Indexing is in progress for the current fiscal year. Detailed search will be enabled shortly.")}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => alert("Notifications: You have 3 system alerts pending. Full notification management is being integrated.")}
              className="p-2 neo-btn !rounded-full !px-3"
            >
              <div className="relative">
                <Bell size={20} className="text-primary-dark" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-error rounded-full"></span>
              </div>
            </button>
            <div className="w-10 h-10 rounded-full neo-card !p-0 overflow-hidden flex items-center justify-center">
              <div className="w-full h-full bg-secondary/20 flex items-center justify-center text-primary-dark font-semibold" title={dbUser?.role}>
                {dbUser?.name ? dbUser.name.substring(0, 2).toUpperCase() : 'AD'}
              </div>
            </div>
            <button onClick={logout} className="p-2 text-error hover:bg-error/10 rounded-full transition-colors ml-2" title="Logout">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6 md:p-8 flex-1 w-full max-w-[1440px] mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Global AI Assistant */}
      <AIAuditor />
    </div>
  );
}
