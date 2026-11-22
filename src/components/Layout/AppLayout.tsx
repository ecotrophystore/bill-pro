import { useState, useEffect, useMemo } from 'react';
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
  Sparkles,
  Minus,
  Monitor,
  Square,
  Maximize2,
  RotateCcw,
  Palette,
  Factory,
  Trophy,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useAi } from '../../contexts/AiContext';
import { GlobalSearchModal } from './GlobalSearchModal';
import { NotificationDrawer } from './NotificationDrawer';
import { ActiveAlarmModal } from '../CRM/ActiveAlarmModal';
import { WhatsAppLeadApprovalModal } from '../WhatsAppAutomation/WhatsAppLeadApprovalModal';
import { WhatsAppWebBrowserView } from '../WhatsAppAutomation/WhatsAppWebBrowserView';
import { useWhatsAppAutoProcessor } from '../../hooks/useWhatsAppAutoProcessor';
import { useWhatsAppFollowupScheduler } from '../../hooks/useWhatsAppFollowupScheduler';
import {
  copyDesktopWinRCommand,
  getDesktopAppStatus,
  triggerDesktopAction,
  type DesktopAppStatus
} from '../../services/desktopControlService';
import { Toaster } from 'react-hot-toast';
import { preloadRoute } from '../../utils/routePreloader';
import { canAccessRoute, ROLE_META, normalizeRole } from '../../config/roleAccess';

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
      { path: '/trophy-creator', label: 'Trophy Studio (AI)', icon: Trophy },
      { path: '/pipeline', label: 'Pipeline Board', icon: Columns3 },
      { path: '/pipeline?pipeline=design_pipeline', label: 'Design Pipeline', icon: Palette },
      { path: '/pipeline?pipeline=production_pipeline', label: 'Production Pipeline', icon: Factory },
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

function WhatsAppProcessorGuard() {
  useWhatsAppAutoProcessor();
  useWhatsAppFollowupScheduler();
  return null;
}

export function AppLayout() {
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
  const { toggleAi } = useAi();
  const currentRole = normalizeRole(dbUser?.role);
  const roleInfo = ROLE_META[currentRole];
  const canUseWhatsApp = canAccessRoute(currentRole, '/whatsapp-automation');
  const currentFullPath = location.pathname + (location.search || '');

  // Role-enforced pipeline redirect
  useEffect(() => {
    if (location.pathname === '/pipeline') {
      if (currentRole === 'design' && !location.search.includes('design_pipeline')) {
        navigate('/pipeline?pipeline=design_pipeline', { replace: true });
      } else if (currentRole === 'production' && !location.search.includes('production_pipeline')) {
        navigate('/pipeline?pipeline=production_pipeline', { replace: true });
      } else if (
        currentRole === 'sales' &&
        (location.search.includes('design_pipeline') || location.search.includes('production_pipeline'))
      ) {
        navigate('/pipeline', { replace: true });
      }
    }
  }, [location.pathname, location.search, currentRole, navigate]);

  const visibleNavCategories = useMemo(() => {
    return navCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => canAccessRoute(currentRole, item.path)),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [currentRole]);

  // Helper to identify category for path
  const getActiveCategoryForPath = (pathname: string): string | null => {
    for (const category of visibleNavCategories) {
      if (
        category.items.some((item) => {
          if (item.path.includes('?')) {
            return currentFullPath === item.path || currentFullPath.startsWith(item.path + '&');
          }
          return pathname === item.path || pathname.startsWith(item.path + '/');
        })
      ) {
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
  const isFullBleedWorkspace = location.pathname.startsWith('/whatsapp-automation');
  const isElectronDesktop = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);
  const [browserMinimized, setBrowserMinimized] = useState(false);
  const [waSummary, setWaSummary] = useState<{ totalUnread: number; isAnyConnected: boolean }>({
    totalUnread: 0,
    isAnyConnected: false
  });
  const [showDesktopPopover, setShowDesktopPopover] = useState(false);
  const [desktopStatus, setDesktopStatus] = useState<DesktopAppStatus | null>(null);

  useEffect(() => {
    if (isFullBleedWorkspace) {
      setBrowserMinimized(false);
    }
  }, [isFullBleedWorkspace]);

  const refreshDesktopStatus = async () => {
    const st = await getDesktopAppStatus();
    setDesktopStatus(st);
  };

  return (
    <div className="min-h-screen flex bg-transparent text-secondary">
      {canUseWhatsApp && <WhatsAppProcessorGuard />}
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

          {/* Role-filtered Category Accordions */}
          {visibleNavCategories.map((category) => {
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
                          const isDesignItem = subItem.path.includes('design_pipeline');
                          const isProductionItem = subItem.path.includes('production_pipeline');
                          const isRegularPipelineItem = subItem.path === '/pipeline';
                          const isCustomActive = isDesignItem
                            ? location.pathname === '/pipeline' && location.search.includes('design_pipeline')
                            : isProductionItem
                            ? location.pathname === '/pipeline' && location.search.includes('production_pipeline')
                            : isRegularPipelineItem
                            ? location.pathname === '/pipeline' && !location.search.includes('pipeline=')
                            : undefined;

                          return (
                            <NavLink
                              key={subItem.path}
                              to={subItem.path}
                              onClick={() => setMobileMenuOpen(false)}
                              onMouseEnter={() => preloadRoute(subItem.path)}
                              onTouchStart={() => preloadRoute(subItem.path)}
                              className={({ isActive }) => {
                                const active = isCustomActive !== undefined ? isCustomActive : isActive;
                                return clsx(
                                  'flex items-center min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 group',
                                  active
                                    ? 'bg-primary text-surface shadow-md font-bold'
                                    : 'text-secondary hover:text-primary-dark hover:bg-primary/10'
                                );
                              }}
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
      <main
        className={clsx(
          'flex-1 flex flex-col transition-all duration-300 w-full min-w-0 overflow-x-hidden',
          isFullBleedWorkspace ? 'h-screen overflow-hidden' : 'min-h-screen',
          'md:ml-[104px]'
        )}
      >
        <header
          className={clsx(
            'flex items-center justify-between px-4 sm:px-6 bg-transparent border-b border-shadow-darker/20 sticky top-0 z-40 shrink-0',
            isFullBleedWorkspace ? 'h-12' : 'h-16'
          )}
        >
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

            {/* Quick Refresh App Button */}
            <button
              onClick={() => {
                if ('caches' in window) {
                  caches.keys().then((names) => {
                    names.forEach((name) => caches.delete(name));
                  });
                }
                window.location.href = window.location.origin + window.location.pathname + '?reload=' + Date.now();
              }}
              className="p-2 neo-btn !rounded-full !px-3 text-secondary hover:text-primary transition-colors cursor-pointer"
              title="Refresh / Sync Latest Version"
            >
              <RotateCcw size={18} />
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

            {/* Ask Bill Pro AI Assistant Trigger */}
            <button
              onClick={toggleAi}
              className="p-2 neo-btn !rounded-full !px-3 flex items-center gap-1.5 text-primary-dark hover:text-primary transition-colors"
              title="Ask Bill Pro AI Assistant"
            >
              <Sparkles size={18} className="text-primary" />
              <span className="hidden xl:inline text-xs font-semibold">Ask Bill Pro</span>
            </button>

            {/* Active Role Badge & User Avatar */}
            <div className="hidden md:flex items-center px-3 py-1 rounded-btn bg-surface shadow-neo-surface text-[11px] font-extrabold text-primary tracking-wider uppercase" title={roleInfo.description}>
              {roleInfo.shortLabel}
            </div>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full neo-card !p-0 overflow-hidden flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-secondary/20 flex items-center justify-center text-primary-dark font-semibold text-xs" title={`${dbUser?.name || 'User'} (${roleInfo.label})`}>
                {dbUser?.name ? dbUser.name.substring(0, 2).toUpperCase() : 'US'}
              </div>
            </div>

            {/* Desktop App / WhatsApp Quick Open-Minimize-Close Controls */}
            {canUseWhatsApp && isElectronDesktop && (
              <button
                onClick={() => {
                  setBrowserMinimized(false);
                  navigate('/whatsapp-automation');
                }}
                className={clsx(
                  'p-2 neo-btn !rounded-full !px-3 flex items-center gap-1.5 text-xs font-bold transition-all',
                  isFullBleedWorkspace ? 'text-primary' : 'text-primary-dark hover:text-primary'
                )}
                title="Open Internal Chrome & WhatsApp Web"
              >
                <span
                  className={clsx(
                    'w-2 h-2 rounded-full',
                    waSummary.isAnyConnected ? 'bg-primary animate-pulse' : 'bg-secondary opacity-50'
                  )}
                />
                <span className="hidden sm:inline">WhatsApp</span>
                {waSummary.totalUnread > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-primary text-surface text-[10px] font-extrabold leading-none">
                    {waSummary.totalUnread}
                  </span>
                )}
              </button>
            )}

            {canUseWhatsApp && !isElectronDesktop && (
              <div className="relative">
                <button
                  onClick={() => {
                    const next = !showDesktopPopover;
                    setShowDesktopPopover(next);
                    if (next) refreshDesktopStatus();
                  }}
                  className="p-2 neo-btn !rounded-full !px-3 flex items-center gap-1.5 text-primary-dark hover:text-primary text-xs font-bold"
                  title="Open / Minimize / Close EcoBill Desktop App"
                >
                  <Monitor size={16} className="text-primary" />
                  <span className="hidden sm:inline">Desktop</span>
                </button>

                {showDesktopPopover && (
                  <div className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-64 z-50 p-3 rounded-card bg-surface shadow-neo-raised border border-shadow-dark space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-primary-dark">EcoBill Desktop App</span>
                      <button
                        onClick={() => setShowDesktopPopover(false)}
                        className="p-1 rounded-full text-secondary hover:text-primary-dark"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <p className="text-[11px] text-secondary">
                      Status:{' '}
                      <strong className={desktopStatus?.running ? 'text-primary' : 'text-secondary'}>
                        {desktopStatus?.running ? 'Running' : 'Not Open'}
                      </strong>
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {!desktopStatus?.running && desktopStatus?.sandboxed ? (
                        <button
                          onClick={async () => {
                            await copyDesktopWinRCommand(desktopStatus?.winRCommand);
                            setShowDesktopPopover(false);
                          }}
                          className="neo-btn-primary !px-2 !py-2 text-[11px] font-bold flex items-center justify-center gap-1"
                        >
                          <Maximize2 size={12} /> Copy
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            const res = await triggerDesktopAction('open');
                            if (res.ok) refreshDesktopStatus();
                            setShowDesktopPopover(false);
                          }}
                          className="neo-btn-primary !px-2 !py-2 text-[11px] font-bold flex items-center justify-center gap-1"
                        >
                          <Maximize2 size={12} /> Open
                        </button>
                      )}
                      <button
                        disabled={!desktopStatus?.running}
                        onClick={async () => {
                          await triggerDesktopAction('minimize');
                        }}
                        className="neo-btn !px-2 !py-2 text-[11px] font-bold text-primary-dark flex items-center justify-center gap-1 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <Minus size={12} /> Min
                      </button>
                      <button
                        disabled={!desktopStatus?.running}
                        onClick={async () => {
                          const res = await triggerDesktopAction('close');
                          if (res.ok) refreshDesktopStatus();
                          setShowDesktopPopover(false);
                        }}
                        className="neo-btn !px-2 !py-2 text-[11px] font-bold text-error flex items-center justify-center gap-1 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <X size={12} /> Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Logout */}
            <button onClick={logout} className="p-2 text-error hover:bg-error/10 rounded-full transition-colors hidden sm:block" title="Logout">
              <LogOut size={20} />
            </button>

            {/* Electron OS Window Minimize / Maximize / Close Buttons */}
            {isElectronDesktop && (
              <div className="flex items-center gap-1 pl-2 border-l border-shadow-darker/30">
                <button
                  onClick={() => window.electronAPI?.minimizeWindow?.()}
                  title="Minimize EcoBill Desktop Window"
                  className="w-8 h-8 rounded-btn bg-surface shadow-neo-surface text-secondary hover:text-primary-dark flex items-center justify-center"
                >
                  <Minus size={14} />
                </button>
                <button
                  onClick={() => window.electronAPI?.toggleMaximizeWindow?.()}
                  title="Maximize / Restore Window"
                  className="hidden sm:flex w-8 h-8 rounded-btn bg-surface shadow-neo-surface text-secondary hover:text-primary-dark items-center justify-center"
                >
                  <Square size={12} />
                </button>
                <button
                  onClick={() => window.electronAPI?.closeWindow?.()}
                  title="Close EcoBill Desktop"
                  className="w-8 h-8 rounded-btn bg-surface shadow-neo-surface text-secondary hover:text-error flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </header>

        <div
          className={clsx(
            'flex-1 w-full min-w-0',
            isFullBleedWorkspace
              ? 'p-1.5 sm:p-2 md:p-2.5 min-h-0 flex flex-col pb-24 md:pb-2.5'
              : 'p-3 sm:p-4 md:p-8 max-w-[1440px] mx-auto pb-28 sm:pb-32 md:pb-8'
          )}
        >
          {(() => {
            const isRouteAllowed =
              canAccessRoute(currentRole, currentFullPath) ||
              (location.pathname === '/pipeline' && (currentRole === 'design' || currentRole === 'production'));

            return isRouteAllowed ? (
              <Outlet />
            ) : (
              <div className="min-h-[60vh] flex items-center justify-center p-4 animate-fade-in">
                <div className="neo-card max-w-md w-full text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-card bg-surface shadow-neo-surface text-error flex items-center justify-center">
                    <ShieldAlert size={32} />
                  </div>
                  <div className="space-y-1">
                    <span className="inline-block px-3 py-1 rounded-btn bg-surface shadow-neo-surface text-[11px] font-bold text-primary uppercase tracking-wider mb-1">
                      Active Role: {roleInfo.label}
                    </span>
                    <h2 className="text-xl font-bold text-primary-dark">Access Restricted</h2>
                    <p className="text-xs text-secondary leading-relaxed">
                      Your department role ({roleInfo.label}) does not have permission to open <code className="text-primary-dark font-semibold">{currentFullPath}</code>. Contact your Administrator or HR if you require access.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(roleInfo.homePath)}
                    className="neo-btn-primary text-xs w-full"
                  >
                    Return to {roleInfo.label} Home
                  </button>
                </div>
              </div>
            );
          })()}

          {isElectronDesktop && canUseWhatsApp && (
            <WhatsAppWebBrowserView
              visible={
                isFullBleedWorkspace &&
                !browserMinimized &&
                (canAccessRoute(currentRole, currentFullPath) ||
                  (location.pathname === '/pipeline' && (currentRole === 'design' || currentRole === 'production')))
              }
              onSummaryChange={setWaSummary}
              onMinimize={() => {
                setBrowserMinimized(true);
                navigate(canAccessRoute(currentRole, '/pipeline') ? '/pipeline' : '/dashboard');
              }}
              onClose={() => {
                setBrowserMinimized(false);
                navigate(canAccessRoute(currentRole, '/pipeline') ? '/pipeline' : '/dashboard');
              }}
            />
          )}
        </div>
      </main>

      {/* Mobile-First Minimized Floating WhatsApp Dock Pill */}
      {isElectronDesktop && canUseWhatsApp && browserMinimized && !isFullBleedWorkspace && (
        <div className="fixed bottom-24 left-3 right-3 sm:left-auto sm:right-5 md:bottom-5 z-40 px-3.5 py-2.5 rounded-card bg-surface shadow-neo-raised border border-shadow-dark flex items-center justify-between gap-3 animate-fade-in">
          <button
            onClick={() => {
              setBrowserMinimized(false);
              navigate('/whatsapp-automation');
            }}
            className="flex items-center gap-2 text-left min-w-0 flex-1"
          >
            <span
              className={clsx(
                'w-2.5 h-2.5 rounded-full shrink-0',
                waSummary.isAnyConnected ? 'bg-primary animate-pulse' : 'bg-secondary opacity-50'
              )}
            />
            <span className="text-xs font-extrabold text-primary-dark truncate">WhatsApp Chrome Live</span>
            {waSummary.totalUnread > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-primary text-surface text-[10px] font-extrabold shrink-0">
                {waSummary.totalUnread}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                setBrowserMinimized(false);
                navigate('/whatsapp-automation');
              }}
              className="neo-btn-primary !px-3 !py-1.5 text-[11px] font-bold flex items-center gap-1"
            >
              <Maximize2 size={12} /> Open
            </button>
            <button
              onClick={() => setBrowserMinimized(false)}
              title="Dismiss Floating Bar (WhatsApp stays logged in)"
              className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-error"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Floating Bottom Navigation */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 z-50 bg-surface/95 backdrop-blur-xl border border-shadow-light shadow-neo-raised rounded-[2rem] p-2 flex items-center justify-between px-6">
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

        {canAccessRoute(currentRole, '/pipeline') ? (
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
        ) : canAccessRoute(currentRole, '/settings') ? (
          <NavLink
            to="/settings?tab=hr_team"
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 w-14 mr-4',
                isActive ? 'text-primary scale-110 drop-shadow-md' : 'text-secondary/60 hover:text-primary hover:-translate-y-1'
              )
            }
          >
            <Users size={22} strokeWidth={2.5} />
            <span className="text-[9px] font-bold mt-1 tracking-wide">HR Team</span>
          </NavLink>
        ) : (
          <NavLink
            to="/library/products"
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 w-14 mr-4',
                isActive ? 'text-primary scale-110 drop-shadow-md' : 'text-secondary/60 hover:text-primary hover:-translate-y-1'
              )
            }
          >
            <Receipt size={22} strokeWidth={2.5} />
            <span className="text-[9px] font-bold mt-1 tracking-wide">Catalog</span>
          </NavLink>
        )}

        {/* Center Floating Action Button */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-6">
          <NavLink
            to={canAccessRoute(currentRole, '/quotations/new') ? '/quotations/new' : '/expense'}
            className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg shadow-primary/40 transform transition-transform duration-300 hover:scale-110 active:scale-95 border-4 border-surface"
          >
            <Plus size={28} strokeWidth={3} />
          </NavLink>
        </div>

        {canAccessRoute(currentRole, '/whatsapp-automation') ? (
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
        ) : (
          <NavLink
            to="/expense"
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-300 w-14 ml-4',
                isActive ? 'text-primary scale-110 drop-shadow-md' : 'text-secondary/60 hover:text-primary hover:-translate-y-1'
              )
            }
          >
            <Wallet size={22} strokeWidth={2.5} />
            <span className="text-[9px] font-bold mt-1 tracking-wide">Expense</span>
          </NavLink>
        )}

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

      <WhatsAppLeadApprovalModal />
      <Toaster position="top-right" />
    </div>
  );
}


