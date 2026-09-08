import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Trash2,
  Receipt,
  Users,
  AlertTriangle,
  Info,
  ExternalLink,
  Loader2,
  X,
  Building2,
  Calendar,
} from 'lucide-react';
import clsx from 'clsx';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc, writeBatch, getDocs } from 'firebase/firestore';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type?: 'invoice' | 'lead' | 'system' | 'expense' | 'reconciliation';
  link?: string;
  is_read: boolean;
  timestamp: any;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationDrawer({ isOpen, onClose, onUnreadCountChange }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Listen to Firestore notifications or synthesize real live reminders
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const notifQuery = query(collection(db, 'notifications'), orderBy('created_at', 'desc'), limit(20));

    const unsub = onSnapshot(
      notifQuery,
      async (snapshot) => {
        if (!snapshot.empty) {
          const items: AppNotification[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title || 'System Notification',
              message: data.message || '',
              type: data.type || 'system',
              link: data.link || '/dashboard',
              is_read: !!data.is_read,
              timestamp: data.created_at || new Date(),
            };
          });
          setNotifications(items);
          const unread = items.filter((n) => !n.is_read).length;
          onUnreadCountChange?.(unread);
          setLoading(false);
        } else {
          // If no stored notification docs exist yet, check live invoice/leads to provide useful system alerts
          try {
            const defaultNotifs: AppNotification[] = [];

            // Check unpaid invoices
            const unpaidInvSnap = await getDocs(query(collection(db, 'invoices'), limit(5)));
            unpaidInvSnap.forEach((d) => {
              const data = d.data();
              if (data.payment_status === 'unpaid' && data.grand_total > 0) {
                defaultNotifs.push({
                  id: `unpaid-${d.id}`,
                  title: `Unpaid Invoice: ${data.number || 'Tax Invoice'}`,
                  message: `Payment of ₹${Number(data.grand_total).toLocaleString('en-IN')} pending from ${data.customer_name || 'Customer'}.`,
                  type: 'invoice',
                  link: `/invoices/edit/${d.id}`,
                  is_read: false,
                  timestamp: data.created_at || new Date(),
                });
              }
            });

            // Check recent leads
            const leadsSnap = await getDocs(query(collection(db, 'leads'), limit(5)));
            leadsSnap.forEach((d) => {
              const data = d.data();
              if (data.status === 'New' || data.status === 'Intake' || !data.status) {
                defaultNotifs.push({
                  id: `lead-${d.id}`,
                  title: `New Lead: ${data.name || 'Inbound Lead'}`,
                  message: `Source: ${data.source || data.platform || 'Direct'} • Phone: ${data.phone || 'N/A'}`,
                  type: 'lead',
                  link: `/leads/${d.id}`,
                  is_read: false,
                  timestamp: data.created_at || new Date(),
                });
              }
            });

            // Fallback system welcome notification
            if (defaultNotifs.length === 0) {
              defaultNotifs.push({
                id: 'sys-welcome',
                title: 'Welcome to EcoBill Pro',
                message: 'All GST billing, Day Book expenses, CRM leads, and WhatsApp automation systems are operational.',
                type: 'system',
                link: '/dashboard',
                is_read: false,
                timestamp: new Date(),
              });
            }

            setNotifications(defaultNotifs);
            const unread = defaultNotifs.filter((n) => !n.is_read).length;
            onUnreadCountChange?.(unread);
          } catch (err) {
            console.error('Error generating fallback notifications:', err);
          } finally {
            setLoading(false);
          }
        }
      },
      (err) => {
        console.error('Notification snapshot error:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [onUnreadCountChange]);

  const markAsRead = async (notif: AppNotification) => {
    if (notif.is_read) return;

    // Local update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
    );

    if (db && !notif.id.startsWith('unpaid-') && !notif.id.startsWith('lead-') && !notif.id.startsWith('sys-')) {
      try {
        await updateDoc(doc(db, 'notifications', notif.id), { is_read: true });
      } catch (err) {
        console.error('Error updating notification:', err);
      }
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    onUnreadCountChange?.(0);

    if (db) {
      try {
        const batch = writeBatch(db);
        notifications
          .filter((n) => !n.id.startsWith('unpaid-') && !n.id.startsWith('lead-') && !n.id.startsWith('sys-'))
          .forEach((n) => {
            batch.update(doc(db, 'notifications', n.id), { is_read: true });
          });
        await batch.commit();
      } catch (err) {
        console.error('Error batch updating notifications:', err);
      }
    }
  };

  const clearAll = () => {
    setNotifications([]);
    onUnreadCountChange?.(0);
  };

  const handleNotificationClick = (notif: AppNotification) => {
    markAsRead(notif);
    onClose();
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (!isOpen) return null;

  const getIcon = (type?: string) => {
    switch (type) {
      case 'invoice':
        return <Receipt size={16} className="text-emerald-600" />;
      case 'lead':
        return <Users size={16} className="text-indigo-600" />;
      case 'expense':
        return <AlertTriangle size={16} className="text-rose-600" />;
      case 'reconciliation':
        return <Building2 size={16} className="text-teal-600" />;
      default:
        return <Info size={16} className="text-primary" />;
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-14 w-80 sm:w-96 neo-card !p-0 shadow-2xl border border-shadow-darker/20 z-50 animate-scale-up overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-shadow-darker/10 bg-surface">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-primary" />
          <span className="font-bold text-sm text-primary-dark">Notifications</span>
          {unreadCount > 0 && (
            <span className="bg-error text-white text-[10px] font-bold px-2 py-0.2 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <button
              onClick={markAllAsRead}
              title="Mark all as read"
              className="p-1.5 text-secondary hover:text-primary rounded hover:bg-shadow-darker/10 transition-colors text-xs flex items-center gap-1"
            >
              <CheckCheck size={16} />
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              title="Clear all"
              className="p-1.5 text-secondary hover:text-error rounded hover:bg-shadow-darker/10 transition-colors text-xs"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-secondary hover:text-primary-dark rounded hover:bg-shadow-darker/10 transition-colors ml-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-[360px] overflow-y-auto divide-y divide-shadow-darker/5 custom-sidebar-scrollbar bg-surface/95">
        {loading ? (
          <div className="py-12 flex items-center justify-center text-secondary">
            <Loader2 size={24} className="animate-spin text-primary mr-2" />
            <span className="text-xs">Loading alerts...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-secondary">
            <Bell size={32} className="mx-auto mb-2 opacity-25 text-primary" />
            <p className="font-semibold text-primary-dark text-sm">All caught up!</p>
            <p className="text-xs text-secondary/70 mt-0.5">No pending notifications or alerts.</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={clsx(
                'p-3.5 flex items-start gap-3 cursor-pointer transition-colors duration-150 relative group',
                notif.is_read ? 'hover:bg-shadow-darker/5 opacity-75' : 'bg-primary/5 hover:bg-primary/10'
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-surface shadow-neo-surface flex items-center justify-center shrink-0 mt-0.5">
                {getIcon(notif.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className={clsx('text-xs truncate font-bold', notif.is_read ? 'text-secondary' : 'text-primary-dark')}>
                    {notif.title}
                  </p>
                  {!notif.is_read && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0"></span>
                  )}
                </div>
                <p className="text-xs text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                  {notif.message}
                </p>
              </div>
              <ExternalLink size={12} className="text-secondary opacity-0 group-hover:opacity-60 transition-opacity shrink-0 mt-1" />
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-shadow-darker/10 bg-surface/80 flex items-center justify-between text-[11px] text-secondary">
        <span>System updates & live reminders</span>
        <button
          onClick={() => {
            onClose();
            navigate('/audit-logs');
          }}
          className="text-primary hover:underline font-semibold"
        >
          View Audit Trail →
        </button>
      </div>
    </div>
  );
}
