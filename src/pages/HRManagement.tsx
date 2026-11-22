import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Building2,
  Mail,
  Phone,
  Briefcase,
  X,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { User, UserRole } from '../types';
import { ROLE_META, normalizeRole } from '../config/roleAccess';

const ASSIGNABLE_ROLES_BY_ADMIN: UserRole[] = ['admin', 'hr', 'sales', 'user', 'accounts', 'design', 'production'];
const ASSIGNABLE_ROLES_BY_HR: UserRole[] = ['hr', 'sales', 'user', 'accounts', 'design', 'production'];

export default function HRManagement() {
  const { dbUser } = useAuth();
  const currentRole = normalizeRole(dbUser?.role);
  const isAdmin = currentRole === 'admin';
  const canManage = currentRole === 'admin' || currentRole === 'hr';

  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  const [invitedUsers, setInvitedUsers] = useState<User[]>([]);
  const users = useMemo(() => {
    const regEmails = new Set(registeredUsers.map((u) => (u.email || '').toLowerCase()));
    const pendingInvites = invitedUsers.filter((i) => !regEmails.has((i.email || '').toLowerCase()));
    return [...registeredUsers, ...pendingInvites].sort((a, b) =>
      (a.name || a.email || '').localeCompare(b.name || b.email || '')
    );
  }, [registeredUsers, invitedUsers]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal state for inviting or editing staff metadata
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('sales');
  const [formDepartment, setFormDepartment] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [savingForm, setSavingForm] = useState(false);

  useEffect(() => {
    if (!db) return;
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as any),
          id: d.id,
          role: normalizeRole(d.data().role)
        })) as User[];
        setRegisteredUsers(list);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubInvites = onSnapshot(
      collection(db, 'user_invites'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as any),
          id: d.id,
          invited: true,
          role: normalizeRole(d.data().role)
        })) as User[];
        setInvitedUsers(list);
      },
      () => { }
    );

    return () => {
      unsubUsers();
      unsubInvites();
    };
  }, []);

  const stats = useMemo(() => {
    return {
      total: users.length,
      active: users.filter((u) => u.is_active !== false).length,
      admin: users.filter((u) => u.role === 'admin').length,
      hr: users.filter((u) => u.role === 'hr').length,
      sales: users.filter((u) => u.role === 'sales').length,
      design: users.filter((u) => u.role === 'design').length,
      production: users.filter((u) => u.role === 'production').length,
      accounts: users.filter((u) => u.role === 'accounts').length,
      user: users.filter((u) => u.role === 'user').length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.designation || '').toLowerCase().includes(q)
      );
    });
  }, [users, roleFilter, searchTerm]);

  const assignableRoles = isAdmin ? ASSIGNABLE_ROLES_BY_ADMIN : ASSIGNABLE_ROLES_BY_HR;

  const logPermissionAudit = async (actionNote: string) => {
    if (!db || !dbUser) return;
    try {
      await addDoc(collection(db, 'audit_logs'), {
        entity_type: 'user',
        entity_id: dbUser.id,
        action: 'permission_change',
        user_id: dbUser.id,
        notes: `${dbUser.name || dbUser.email} (${currentRole.toUpperCase()}): ${actionNote}`,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      // Non-fatal
    }
  };

  const handleRoleChange = async (targetUser: User, newRole: UserRole) => {
    if (!db || !canManage) return;
    if (targetUser.id === dbUser?.id && newRole !== 'admin') {
      toast.error('You cannot downgrade your own active role.');
      return;
    }
    if (!isAdmin && (targetUser.role === 'admin' || newRole === 'admin')) {
      toast.error('Only Administrators can assign or modify Admin roles.');
      return;
    }

    setUpdatingId(targetUser.id);
    try {
      const targetCol = targetUser.invited ? 'user_invites' : 'users';
      await updateDoc(doc(db, targetCol, targetUser.id), { role: newRole });
      await logPermissionAudit(`Changed role for ${targetUser.email} from ${targetUser.role} to ${newRole}`);
      toast.success(`Updated ${targetUser.name || targetUser.email} to ${ROLE_META[newRole].label}`);
    } catch (err: any) {
      console.error('Role update failed:', err);
      toast.error(err.message || 'Permission denied while updating role');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleActive = async (targetUser: User) => {
    if (!db || !canManage) return;
    if (targetUser.id === dbUser?.id) {
      toast.error('You cannot suspend your own account.');
      return;
    }
    if (!isAdmin && targetUser.role === 'admin') {
      toast.error('Only Administrators can suspend Admin accounts.');
      return;
    }

    const nextActive = targetUser.is_active === false;
    setUpdatingId(targetUser.id);
    try {
      const targetCol = targetUser.invited ? 'user_invites' : 'users';
      await updateDoc(doc(db, targetCol, targetUser.id), { is_active: nextActive });
      await logPermissionAudit(`${nextActive ? 'Activated' : 'Suspended'} access for ${targetUser.email}`);
      toast.success(`${targetUser.name || targetUser.email} is now ${nextActive ? 'Active' : 'Suspended'}`);
    } catch (err: any) {
      toast.error(err.message || 'Could not update account status');
    } finally {
      setUpdatingId(null);
    }
  };

  const openInviteModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormRole('sales');
    setFormDepartment('');
    setFormDesignation('');
    setFormPhone('');
    setIsModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setFormName(u.name || '');
    setFormEmail(u.email || '');
    setFormRole(u.role);
    setFormDepartment(u.department || '');
    setFormDesignation(u.designation || '');
    setFormPhone(u.phone || '');
    setIsModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !canManage) return;

    if (!isAdmin && formRole === 'admin') {
      toast.error('Only Administrators can assign the Admin role.');
      return;
    }

    setSavingForm(true);
    try {
      if (editingUser) {
        const updatePayload: Record<string, any> = {
          name: formName.trim(),
          department: formDepartment.trim(),
          designation: formDesignation.trim(),
          phone: formPhone.trim(),
        };
        if (editingUser.id !== dbUser?.id && (isAdmin || editingUser.role !== 'admin')) {
          updatePayload.role = formRole;
        }
        const targetCol = editingUser.invited ? 'user_invites' : 'users';
        await updateDoc(doc(db, targetCol, editingUser.id), updatePayload);
        await logPermissionAudit(`Updated staff profile for ${editingUser.email}`);
        toast.success('Staff profile updated');
      } else {
        const cleanEmail = formEmail.trim().toLowerCase();
        if (!cleanEmail) {
          toast.error('Email is required');
          setSavingForm(false);
          return;
        }
        const existing = users.find((u) => (u.email || '').toLowerCase() === cleanEmail);
        if (existing) {
          toast.error('A user with this email already exists in the directory.');
          setSavingForm(false);
          return;
        }

        await setDoc(doc(db, 'user_invites', cleanEmail), {
          id: cleanEmail,
          name: formName.trim() || cleanEmail.split('@')[0],
          email: cleanEmail,
          role: formRole,
          department: formDepartment.trim(),
          designation: formDesignation.trim(),
          phone: formPhone.trim(),
          is_active: true,
          invited: true,
          created_at: serverTimestamp()
        });
        await logPermissionAudit(`Pre-registered ${cleanEmail} with role ${formRole}`);
        toast.success(`Pre-assigned ${ROLE_META[formRole].label} access for ${cleanEmail}`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save staff profile');
    } finally {
      setSavingForm(false);
    }
  };

  const handleDeleteInvite = async (targetUser: User) => {
    if (!db || !canManage) return;
    if (!targetUser.invited) return;
    if (!isAdmin && targetUser.role === 'admin') return;
    if (!window.confirm(`Remove pre-assigned invite for "${targetUser.name || targetUser.email}"?`)) return;
    try {
      await deleteDoc(doc(db, 'user_invites', targetUser.id));
      toast.success('Removed pending invite');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove invite');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark flex items-center gap-2.5">
            <Users size={26} className="text-primary" />
            HR & Team Role Access
          </h1>
          <p className="text-sm text-secondary mt-1">
            Manage staff profiles, department roles (Admin, HR, Sales, User), and active access permissions.
          </p>
        </div>

        {canManage && (
          <button
            onClick={openInviteModal}
            className="neo-btn-primary inline-flex items-center gap-2 text-sm"
          >
            <UserPlus size={16} /> Pre-Assign Staff Access
          </button>
        )}
      </div>

      {/* Role Filter Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { key: 'all', label: 'All Staff', count: stats.total },
          { key: 'admin', label: 'Admins', count: stats.admin },
          { key: 'hr', label: 'HR Team', count: stats.hr },
          { key: 'sales', label: 'Sales Team', count: stats.sales },
          { key: 'design', label: 'Designers', count: stats.design },
          { key: 'production', label: 'Production', count: stats.production },
          { key: 'accounts', label: 'Accounts', count: stats.accounts },
        ].map((card) => {
          const active = roleFilter === card.key;
          return (
            <button
              key={card.key}
              onClick={() => setRoleFilter(card.key)}
              className={`p-4 rounded-card text-left transition-all ${active
                ? 'bg-surface shadow-neo-pressed border border-primary/30'
                : 'bg-surface shadow-neo-raised hover:shadow-neo-hover'
                }`}
            >
              <span className="text-xs font-bold text-secondary uppercase tracking-wider block">
                {card.label}
              </span>
              <span className={`text-2xl font-extrabold mt-1 block ${active ? 'text-primary' : 'text-primary-dark'}`}>
                {card.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Bar & Access Guide */}
      <div className="neo-card !p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search staff by name, email, department, or designation..."
            className="neo-input w-full pl-10 text-sm"
          />
        </div>
        <div className="text-xs text-secondary flex items-center gap-2 px-2">
          <Shield size={15} className="text-primary shrink-0" />
          <span>
            Active Accounts: <strong className="text-primary-dark">{stats.active}</strong> / {stats.total}
          </span>
        </div>
      </div>

      {/* Staff Directory Table / Cards */}
      {loading ? (
        <div className="neo-card py-16 flex items-center justify-center text-secondary gap-2">
          <Loader2 size={20} className="animate-spin text-primary" />
          <span className="text-sm font-medium">Loading team directory...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="neo-card py-16 text-center space-y-2">
          <Users size={36} className="mx-auto text-secondary opacity-50" />
          <p className="text-base font-bold text-primary-dark">No matching staff records found</p>
          <p className="text-xs text-secondary">Try clearing your search or role filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredUsers.map((u) => {
            const isSelf = u.id === dbUser?.id;
            const isActive = u.is_active !== false;
            const roleInfo = ROLE_META[normalizeRole(u.role)];
            const canEditThisUser = canManage && (isAdmin || u.role !== 'admin');

            return (
              <div
                key={u.id}
                className={`neo-card !p-5 flex flex-col justify-between gap-4 transition-all ${!isActive ? 'opacity-70' : ''
                  }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-card bg-surface shadow-neo-surface text-primary flex items-center justify-center font-extrabold text-lg shrink-0">
                      {(u.name || u.email || 'U')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-primary-dark truncate">
                          {u.name || 'Unnamed Staff'}
                        </h3>
                        {isSelf && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-surface font-bold">
                            YOU
                          </span>
                        )}
                        {u.invited && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface shadow-neo-surface text-secondary font-semibold">
                            PRE-ASSIGNED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-secondary flex items-center gap-1.5 mt-0.5 truncate">
                        <Mail size={12} className="shrink-0" /> {u.email}
                      </p>
                      {(u.designation || u.department || u.phone) && (
                        <p className="text-[11px] text-secondary flex items-center gap-3 mt-1 flex-wrap">
                          {(u.designation || u.department) && (
                            <span className="flex items-center gap-1">
                              <Briefcase size={11} /> {[u.designation, u.department].filter(Boolean).join(' • ')}
                            </span>
                          )}
                          {u.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={11} /> {u.phone}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Quick Edit / Delete */}
                  {canEditThisUser && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditModal(u)}
                        className="p-2 rounded-lg text-secondary hover:text-primary transition-colors"
                        title="Edit profile details"
                      >
                        <Edit2 size={15} />
                      </button>
                      {canManage && !isSelf && u.invited && (isAdmin || u.role !== 'admin') && (
                        <button
                          onClick={() => handleDeleteInvite(u)}
                          className="p-2 rounded-lg text-secondary hover:text-error transition-colors"
                          title="Remove pre-assigned record"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Role Assignment & Active Status Controls */}
                <div className="pt-3 border-t border-shadow-dark flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-secondary uppercase">Access Role:</span>
                    {canEditThisUser && !isSelf ? (
                      <select
                        value={u.role}
                        disabled={updatingId === u.id}
                        onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                        className="neo-input !py-1.5 !px-3 text-xs font-bold text-primary cursor-pointer"
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_META[r].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-3 py-1 rounded-btn bg-surface shadow-neo-surface text-xs font-bold text-primary">
                        {roleInfo.label}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!canEditThisUser || isSelf || updatingId === u.id}
                    onClick={() => handleToggleActive(u)}
                    className={`px-3 py-1.5 rounded-btn text-xs font-bold flex items-center gap-1.5 transition-all ${isActive
                      ? 'bg-surface shadow-neo-surface text-primary'
                      : 'bg-surface shadow-neo-pressed text-error'
                      } ${!canEditThisUser || isSelf ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-neo-hover'}`}
                  >
                    {updatingId === u.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : isActive ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <XCircle size={13} />
                    )}
                    {isActive ? 'Active' : 'Suspended'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Role Permissions Legend */}
      <div className="neo-card space-y-3">
        <h3 className="text-sm font-bold text-primary-dark flex items-center gap-2">
          <Building2 size={16} className="text-primary" /> Separate Department Access Matrix
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(['admin', 'hr', 'sales', 'design', 'production', 'accounts', 'user'] as UserRole[]).map((r) => (
            <div key={r} className="p-3.5 rounded-card bg-surface shadow-neo-surface space-y-1">
              <div className="text-xs font-extrabold text-primary uppercase tracking-wider">
                {ROLE_META[r].label}
              </div>
              <p className="text-[11px] text-secondary leading-relaxed">{ROLE_META[r].description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add / Edit Staff Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface w-full max-w-md rounded-card shadow-neo-raised p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-dark pb-3">
              <h3 className="text-base font-bold text-primary-dark">
                {editingUser ? 'Edit Staff Profile' : 'Pre-Assign Staff Access'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-secondary hover:text-primary-dark">
                <X size={18} />
              </button>
            </div>

            {!editingUser && (
              <div className="p-3 rounded-card bg-surface shadow-neo-surface text-[11px] text-secondary flex items-start gap-2">
                <AlertCircle size={15} className="text-primary shrink-0 mt-0.5" />
                <span>
                  Pre-assign an email and role here. When the employee creates an account or signs in with this email on the login page, they will automatically receive this role.
                </span>
              </div>
            )}

            <form onSubmit={handleSaveStaff} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-primary-dark block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="neo-input w-full text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-primary-dark block mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  disabled={Boolean(editingUser)}
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="priya@ecotrophy.in"
                  className="neo-input w-full text-xs disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-primary-dark block mb-1">Assigned Role</label>
                  <select
                    value={formRole}
                    disabled={Boolean(editingUser && (editingUser.id === dbUser?.id || (!isAdmin && editingUser.role === 'admin')))}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="neo-input w-full text-xs font-bold text-primary"
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-primary-dark block mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+91 98..."
                    className="neo-input w-full text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-primary-dark block mb-1">Department</label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    placeholder="e.g. HR / Sales / Ops"
                    className="neo-input w-full text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-primary-dark block mb-1">Designation</label>
                  <input
                    type="text"
                    value={formDesignation}
                    onChange={(e) => setFormDesignation(e.target.value)}
                    placeholder="e.g. Executive"
                    className="neo-input w-full text-xs"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="neo-btn text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={savingForm} className="neo-btn-primary text-xs flex items-center gap-2">
                  {savingForm && <Loader2 size={14} className="animate-spin" />}
                  {editingUser ? 'Save Changes' : 'Pre-Assign Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
