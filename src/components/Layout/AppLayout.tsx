import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
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
  Bot,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

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
      { path: '/crm-dashboard', label: 'CRM Dashboard', icon: Target },
      { path: '/leads/new', label: 'Add Lead', icon: UserPlus },
      { path: '/leads', label: 'Leads', icon: Users },
      { path: '/pipeline', label: 'Pipeline', icon: Columns3 },
      { path: '/lead-intake', label: 'Intake Log', icon: Inbox },
      { path: '/message-templates', label: 'Templates', icon: MessageSquare },
      { path: '/whatsapp-automation', label: 'WA Automation', icon: Bot },
      { path: '/message-queue', label: 'Queue Log', icon: Send },
      { path: '/audit-logs', label: 'Audit Logs', icon: ShieldAlert },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
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
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
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

  const handleCategoryClick = (categoryId: string) => {
    setOpenCategory((prev) => (prev === categoryId ? null : categoryId));
  };

  const isExpanded = mobileMenuOpen || isHovered;

  return (
    <div className="min-h-screen flex bg-surface text-secondary">
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
          'bg-surface/95 backdrop-blur-xl border border-shadow-darker/20 shadow-2xl',
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
                      ? 'bg-surface shadow-neo-pressed text-primary-dark'
                      : hasActiveChild
                      ? 'bg-primary/5 text-primary border border-primary/20 shadow-sm'
                      : 'bg-surface/80 hover:bg-surface shadow-neo-surface text-secondary hover:text-primary-dark',
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
      <main className={clsx('flex-1 flex flex-col min-h-screen transition-all duration-300', 'md:ml-[104px]')}>
        <header className="h-16 flex items-center justify-between px-6 bg-surface border-b border-shadow-darker/20 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-primary-dark block md:hidden">
              <Menu size={24} />
            </button>

            <div className="hidden sm:flex items-center neo-input !py-2 w-64 lg:w-96 gap-2">
              <Search size={18} className="text-secondary" />
              <input
                type="text"
                placeholder="Global Search (Coming Soon)"
                className="bg-transparent border-none outline-none w-full text-sm"
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  alert('Global Search: Indexing is in progress for the current fiscal year. Detailed search will be enabled shortly.')
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => alert('Notifications: You have 3 system alerts pending. Full notification management is being integrated.')}
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

        <div className="p-6 md:p-8 flex-1 w-full max-w-[1440px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
