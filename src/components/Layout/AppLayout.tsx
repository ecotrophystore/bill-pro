import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  ShoppingCart,
  Building2,
  BarChart3,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  Banknote,
  LogOut,
  Wallet,
  Inbox,
  UserPlus,
  Users,
  Columns3,
  MessageSquare,
  Send,
  Target,
  ShieldAlert,
  Shield,
  Bot,
  ChevronDown,
  Command,
  Plus,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { GlobalSearchModal } from './GlobalSearchModal';
import { NotificationDrawer } from './NotificationDrawer';
import { ActiveAlarmModal } from '../CRM/ActiveAlarmModal';
import { useWhatsAppAutoProcessor } from '../../hooks/useWhatsAppAutoProcessor';
import { Toaster } from 'react-hot-toast';
import { preloadRoute } from '../../utils/routePreloader';

interface SubMenuItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: SubMenuItem[];
}

const mainNavItem = {
  path: '/dashboard',
  label: 'Dashboard',
  icon: LayoutDashboard,
};

const navCategories: NavCategory[] = [
  {
    id: 'crm',
    label: 'CRM',
    icon: Target,
    items: [
      { path: '/pipeline', label: 'Pipeline Board', icon: Columns3 },
      { path: '/leads', label: 'Leads Directory', icon: Users },
      { path: '/company-intelligence', label: 'Company Intelligence', icon: Building2 },
      { path: '/crm-dashboard', label: 'CRM Analytics', icon: BarChart3 },
      { path: '/library/customers', label: 'Customer Library', icon: Building2 },
      { path: '/whatsapp-automation', label: 'WhatsApp Automation', icon: Bot },
      { path: '/stage-automation', label: 'Stage Automation', icon: Settings },
      { path: '/lead-intake', label: 'Lead Intake Logs', icon: Inbox },
      { path: '/audit-logs', label: 'Audit Logs', icon: Shield },
    ],
  },
  {
    id: 'sales_finance',
    label: 'Sales & Finance',
    icon: Receipt,
    items: [
      { path: '/quotations', label: 'Quotations', icon: FileText },
      { path: '/proforma-invoices', label: 'Proforma Invoices', icon: FileText },
      { path: '/invoices', label: 'Invoices', icon: Receipt },
      { path: '/cash-memos', label: 'Cash Memos', icon: Banknote },
      { path: '/purchases', label: 'Purchases', icon: ShoppingCart },
      { path: '/expense', label: 'Expense Tracking', icon: Wallet },
      { path: '/reconciliation', label: 'Reconciliation', icon: Building2 },
    ],
  },
  {
    id: 'library_reports',
    label: 'Library & Reports',
    icon: BarChart3,
    items: [
      { path: '/library/products', label: 'Product Library', icon: Receipt },
      { path: '/library/customers', label: 'Customer Library', icon: Building2 },
      { path: '/reports', label: 'Reports', icon: BarChart3 },
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function AppLayout() {
  useWhatsAppAutoProcessor();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  
  useEffect(() => {
    const handleNavigate = (e: any) => {
      if (e.detail) {
        navigate(e.detail);
      }
    };
    window.addEventListener('app:navigate', handleNavigate);
    return () => window.removeEventListener('app:navigate', handleNavigate);
  }, [navigate]);

  const { logout, dbUser } = useAuth();

  // Helper to identify category for path
  const getActiveCategoryForPath = (pathname: string): string | null => {
    for (const category of navCategories) {
      if (category.items.some((item) => pathname === item.path || pathname.startsWith(item.path + '/'))) {
        return category.id;
      }
    }
    return null;
  };

  const [openCategory, setOpenCategory] = useState<string | null>(() => getActiveCategoryForPath(location.pathname));

  // Auto-expand category containing current active page
  useEffect(() => {
    const activeCat = getActiveCategoryForPath(location.pathname);
    if (activeCat) {
      setOpenCategory(activeCat);
    }
  }, [location.pathname]);

  // Lock body scrolling when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Keyboard shortcut for Cmd/Ctrl+K to trigger global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCategoryClick = (categoryId: string) => {
    setOpenCategory((prev) => (prev === categoryId ? null : categoryId));
  };

  const isExpanded = mobileMenuOpen || isHovered;

  return (
    <div className="min-h-screen flex bg-transparent text-secondary">
      {/* Global Omnichannel Search Modal */}
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Global Live Reminder Audio Alarm Modal */}
      <ActiveAlarmModal />

      {/* Mobile Dark Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={clsx(
          'fixed z-50 transition-all duration-300 transform flex flex-col',
          'bg-surface border border-shadow-darker/20 shadow-2xl',
          'md:left-4 md:top-4 md:bottom-4 md:rounded-2xl',
          mobileMenuOpen ? 'inset-y-0 left-0 w-64 translate-x-0' : '-translate-x-full md:translate-x-0',
          !mobileMenuOpen && (isHovered ? 'md:w-64' : 'md:w-[72px]')
        )}
      >
        {/* Top Logo & App Title Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-shadow-darker/20 overflow-hidden shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-surface font-bold shadow-lg shrink-0">
              EB
            </div>
            <span
              className={clsx(
                'font-bold text-xl text-primary-dark whitespace-nowrap transition-opacity duration-300',
                isExpanded ? 'opacity-100' : 'opacity-0 w-0 hidden'
              )}
            >
              EcoBill
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-2 text-primary-dark hover:bg-shadow-darker/10 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Menu Content Area */}
        <nav className="p-3 flex-1 overflow-y-auto overflow-x-hidden custom-sidebar-scrollbar space-y-2">
          {/* Main Dashboard Navigation Item */}
          <NavLink
            to={mainNavItem.path}
            onClick={() => setMobileMenuOpen(false)}
            onMouseEnter={() => preloadRoute(mainNavItem.path)}
            onTouchStart={() => preloadRoute(mainNavItem.path)}
            title={!isExpanded ? mainNavItem.label : undefined}
            className={({ isActive }) =>
              clsx(
                'neo-nav-stacked flex items-center min-h-[48px] px-3.5 py-2.5 rounded-xl font-semibold transition-all duration-200 whitespace-nowrap overflow-hidden group',
                isActive
                  ? 'active shadow-sm border border-primary/20 text-primary'
                  : 'hover:bg-shadow-darker/10 text-secondary',
                !isExpanded && 'justify-center px-0 w-11 mx-auto'
              )
            }
          >
            <mainNavItem.icon size={22} className="shrink-0 transition-transform duration-300 group-hover:scale-110" />
            <span
              className={clsx(
                'ml-3 text-sm transition-all duration-300',
                isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 hidden'
              )}
            >
              {mainNavItem.label}
            </span>
          </NavLink>

          <div className="my-2 border-t border-shadow-darker/20" />

          {/* 3 Collapsible Category Accordions */}
          {navCategories.map((category) => {
            const isOpen = openCategory === category.id;
            const hasActiveChild = category.items.some(
              (item) => location.pathname === item.path || location.pathname.startsWith(item.path + '/')
            );
            const CategoryIcon = category.icon;

            return (
              <div key={category.id} className="space-y-1">
                {/* Category Accordion Card Header */}
                <button
                  type="button"
                  onClick={() => handleCategoryClick(category.id)}
                  title={!isExpanded ? category.label : undefined}
                  className={clsx(
                    'w-full flex items-center justify-between min-h-[48px] px-3.5 py-2.5 rounded-xl font-bold text-left transition-all duration-200 select-none group',
                    isOpen
                      ? 'bg-transparent shadow-neo-pressed text-primary-dark'
                      : hasActiveChild
                      ? 'bg-primary/5 text-primary border border-primary/20 shadow-sm'
                      : 'bg-transparent hover:bg-transparent shadow-neo-surface text-secondary hover:text-primary-dark',
                    !isExpanded && 'justify-center px-0 w-11 mx-auto'
                  )}
                >
                  <div className="flex items-center overflow-hidden">
                    <CategoryIcon
                      size={20}
                      className={clsx(
                        'shrink-0 transition-transform duration-300 group-hover:scale-110',
                        isOpen || hasActiveChild ? 'text-primary' : 'text-secondary'
                      )}
                    />
                    <span
                      className={clsx(
                        'ml-3 text-sm font-bold tracking-tight whitespace-nowrap transition-all duration-300',
                        isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 hidden'
                      )}
                    >
                      {category.label}
                    </span>
                  </div>

                  {/* Chevron Down Arrow */}
                  {isExpanded && (
                    <ChevronDown
                      size={18}
                      className={clsx(
                        'shrink-0 transition-transform duration-300 ml-2',
                        isOpen ? 'rotate-180 text-primary' : 'text-secondary/60'
                      )}
                    />
                  )}
                </button>

                {/* Submenu Accordion Expandable Container */}
                {isExpanded && (
                  <div
                    className={clsx(
                      'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
                      isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="ml-4 pl-2.5 border-l-2 border-primary/20 space-y-1 my-1">
                        {category.items.map((subItem) => {
                          const SubIcon = subItem.icon;
                          return (
                            <NavLink
                              key={subItem.path}
                              to={subItem.path}
                              onClick={() => setMobileMenuOpen(false)}
                              onMouseEnter={() => preloadRoute(subItem.path)}
                              onTouchStart={() => preloadRoute(subItem.path)}
                              className={({ isActive }) =>
                                clsx(
                                  'flex items-center min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 group',
                                  isActive
                                    ? 'bg-primary text-surface shadow-md font-bold'
                                    : 'text-secondary hover:text-primary-dark hover:bg-primary/10'
                                )
                              }
                            >
                              <SubIcon size={16} className="shrink-0 mr-2.5 transition-transform group-hover:scale-110" />
                              <span className="truncate">{subItem.label}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main App Content Area */}
      <main className={clsx('flex-1 flex flex-col min-h-screen transition-all duration-300 w-full overflow-x-hidden', 'md:ml-[104px]')}>
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-transparent border-b border-shadow-darker/20 sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-primary-dark block md:hidden">
              <Menu size={24} />
            </button>

            {/* Global Search Bar Button */}
            <div
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center neo-input !py-2 w-64 lg:w-96 gap-2 cursor-pointer hover:bg-shadow-darker/5 transition-colors select-none group"
            >
              <Search size={18} className="text-secondary group-hover:text-primary transition-colors" />
              <span className="text-secondary/70 text-sm flex-1 font-medium">Quick search anything...</span>
              <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-transparent border border-shadow-darker/20 rounded shadow-xs text-secondary">
                <Command size={10} />K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 relative shrink-0">
            {/* Mobile search trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 neo-btn !rounded-full !px-3 sm:hidden"
              title="Search"
            >
              <Search size={18} className="text-primary-dark" />
            </button>

            {/* Notification Bell with Drawer */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="p-2 neo-btn !rounded-full !px-3 relative"
                title="Notifications"
              >
                <div className="relative">
                  <Bell size={20} className="text-primary-dark" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-error text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
              </button>

              <NotificationDrawer
                isOpen={notificationsOpen}
                onClose={() => setNotificationsOpen(false)}
                onUnreadCountChange={setUnreadCount}
              />
            </div>

            {/* User Avatar */}
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full neo-card !p-0 overflow-hidden flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-secondary/20 flex items-center justify-center text-primary-dark font-semibold text-xs" title={`Role: ${dbUser?.role || 'User'}`}>
                {dbUser?.name ? dbUser.name.substring(0, 2).toUpperCase() : 'AD'}
              </div>
            </div>

            {/* Logout */}
            <button onClick={logout} className="p-2 text-error hover:bg-error/10 rounded-full transition-colors hidden sm:block" title="Logout">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="p-3 sm:p-4 md:p-8 flex-1 w-full max-w-[1440px] mx-auto min-w-0 pb-24 md:pb-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Floating Bottom Navigation */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-[2rem] p-2 flex items-center justify-between px-6">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 w-14',
              isActive ? 'text-primary scale-110 drop-shadow-md' : 'text-secondary/60 hover:text-primary hover:-translate-y-1'
            )
          }
        >
          <LayoutDashboard size={22} strokeWidth={2.5} />
          <span className="text-[9px] font-bold mt-1 tracking-wide">Home</span>
        </NavLink>

        <NavLink
          to="/pipeline"
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 w-14 mr-4',
              isActive ? 'text-primary scale-110 drop-shadow-md' : 'text-secondary/60 hover:text-primary hover:-translate-y-1'
            )
          }
        >
          <Columns3 size={22} strokeWidth={2.5} />
          <span className="text-[9px] font-bold mt-1 tracking-wide">Pipeline</span>
        </NavLink>

        {/* Center Floating Action Button (New Quotation/Action) */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-6">
          <NavLink
            to="/quotations/new"
            className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg shadow-primary/40 transform transition-transform duration-300 hover:scale-110 active:scale-95 border-4 border-surface"
          >
            <Plus size={28} strokeWidth={3} />
          </NavLink>
        </div>

        <NavLink
          to="/whatsapp-automation"
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 w-14 ml-4',
              isActive ? 'text-primary scale-110 drop-shadow-md' : 'text-secondary/60 hover:text-primary hover:-translate-y-1'
            )
          }
        >
          <Bot size={22} strokeWidth={2.5} />
          <span className="text-[9px] font-bold mt-1 tracking-wide">Chat</span>
        </NavLink>

        <button
          onClick={() => setMobileMenuOpen(true)}
          className={clsx(
            'flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 w-14',
            mobileMenuOpen ? 'text-primary scale-110 drop-shadow-md' : 'text-secondary/60 hover:text-primary hover:-translate-y-1'
          )}
        >
          <Menu size={22} strokeWidth={2.5} />
          <span className="text-[9px] font-bold mt-1 tracking-wide">Menu</span>
        </button>
      </nav>

      <Toaster position="top-right" />
    </div>
  );
}


