import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
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
  LogOut,
  User,
  Package,
  ChevronDown
} from 'lucide-react';
import clsx from 'clsx';
import { AIAuditor } from '../AI/AIAuditor';
import { VoiceOverlayManager } from '../AI/VoiceOverlayManager';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Shared/Toast';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/quotations', label: 'Quotations', icon: FileText },
  { path: '/invoices', label: 'Invoices', icon: Receipt },
  { path: '/cash-memos', label: 'Cash Memos', icon: Banknote },
  { path: '/library/products', label: 'Product Library', icon: Package },
  { path: '/library/customers', label: 'Customer Library', icon: Building2 },
  { path: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { path: '/reconciliation', label: 'Reconciliation', icon: Building2 },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/auditor', label: 'AI Auditor', icon: Bot },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, dbUser, logout } = useAuth();
  const { showToast } = useToast();

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      // Smart navigation based on search query
      if (q.includes('invoice') || q.includes('bill')) navigate('/invoices');
      else if (q.includes('quote') || q.includes('quotation')) navigate('/quotations');
      else if (q.includes('cash') || q.includes('memo')) navigate('/cash-memos');
      else if (q.includes('product') || q.includes('inventory')) navigate('/library/products');
      else if (q.includes('customer') || q.includes('client')) navigate('/library/customers');
      else if (q.includes('purchase') || q.includes('vendor')) navigate('/purchases');
      else if (q.includes('reconcil')) navigate('/reconciliation');
      else if (q.includes('report') || q.includes('gst') || q.includes('financial')) navigate('/reports');
      else if (q.includes('audit') || q.includes('log')) navigate('/auditor');
      else if (q.includes('setting') || q.includes('config')) navigate('/settings');
      else {
        showToast(`Searching for "${searchQuery}" — try: invoice, quotation, customer, product, report...`, 'info');
        return;
      }
      showToast(`Navigated to ${searchQuery}`, 'success');
      setSearchQuery('');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      showToast('Signed out successfully', 'success');
    } catch (err) {
      showToast('Failed to sign out', 'error');
    }
  };

  const userInitials = user?.email 
    ? user.email.substring(0, 2).toUpperCase()
    : dbUser?.name 
      ? dbUser.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) 
      : 'AD';

  const notifications = [
    { id: '1', text: 'System ready — All modules operational', time: 'Just now', read: false },
    { id: '2', text: 'Firestore sync active with real-time listeners', time: '2m ago', read: false },
    { id: '3', text: 'AI Auditor available for queries', time: '5m ago', read: true },
  ];

  return (
    <div className="min-h-screen flex bg-surface text-secondary">
      {/* Sidebar */}
      <aside 
        className={clsx(
          "fixed inset-y-0 left-0 z-50 bg-surface border-r border-shadow-darker/20 transition-all duration-300 transform",
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

        <nav className="p-4 space-y-3">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={!sidebarOpen ? item.label : undefined}
              onClick={() => {
                // Close sidebar on mobile after navigation
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
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

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

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
            
            <div className={clsx(
              "hidden sm:flex items-center neo-input !py-2 w-64 lg:w-96 gap-2 transition-all",
              searchFocused && "ring-2 ring-primary/30"
            )}>
              <Search size={18} className="text-secondary" />
              <input 
                type="text" 
                placeholder="Search modules... (invoices, reports, products)" 
                className="bg-transparent border-none outline-none w-full text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={handleSearch}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowUserMenu(false);
                }}
                className="p-2 neo-btn !rounded-full !px-3"
              >
                <div className="relative">
                  <Bell size={20} className="text-primary-dark" />
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-error rounded-full animate-pulse"></span>
                  )}
                </div>
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 neo-card !p-0 shadow-lg animate-fade-in overflow-hidden">
                  <div className="p-3 border-b border-shadow-darker/10 flex justify-between items-center">
                    <span className="text-sm font-bold text-primary-dark">Notifications</span>
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {notifications.filter(n => !n.read).length} new
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map(n => (
                      <div key={n.id} className={clsx(
                        "p-3 border-b border-shadow-darker/5 hover:bg-shadow-darker/5 transition-colors cursor-pointer",
                        !n.read && "bg-primary/5"
                      )}>
                        <p className="text-sm text-primary-dark font-medium">{n.text}</p>
                        <p className="text-[10px] text-secondary mt-1">{n.time}</p>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => {
                      setShowNotifications(false);
                      showToast('All notifications marked as read', 'success');
                    }}
                    className="w-full p-2.5 text-xs font-bold text-primary hover:bg-primary/5 transition-colors text-center"
                  >
                    Mark All as Read
                  </button>
                </div>
              )}
            </div>

            {/* User Avatar with Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button 
                onClick={() => {
                  setShowUserMenu(!showUserMenu);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2 neo-card !p-1.5 !pr-3 cursor-pointer hover:shadow-neo-inset transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary-dark font-bold text-sm">
                  {userInitials}
                </div>
                <ChevronDown size={14} className={clsx(
                  "text-secondary transition-transform duration-200 hidden sm:block",
                  showUserMenu && "rotate-180"
                )} />
              </button>

              {/* User Menu Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 neo-card !p-0 shadow-lg animate-fade-in overflow-hidden">
                  <div className="p-4 border-b border-shadow-darker/10">
                    <p className="text-sm font-bold text-primary-dark truncate">{user?.email || 'Admin User'}</p>
                    <p className="text-[10px] text-secondary mt-0.5 uppercase tracking-wider font-bold">{dbUser?.role || 'Manager'}</p>
                  </div>
                  <div className="py-1">
                    <button 
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate('/settings');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-secondary hover:bg-shadow-darker/5 hover:text-primary-dark transition-colors"
                    >
                      <User size={16} />
                      Profile & Settings
                    </button>
                    <button 
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6 md:p-8 flex-1 w-full max-w-[1440px] mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Global AI Assistant & Voice Overlays */}
      <VoiceOverlayManager />
      <AIAuditor />
    </div>
  );
}
