import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import './Users.css';
import { usersApi } from '../services/users';
import type { User } from '../types/user';
import { getStoredUser } from '../utils/authToken';

type SortKey = 'name' | 'role' | 'status' | 'createdAt' | 'lastLoginAt';
type SortDirection = 'asc' | 'desc';

const ALLOWED_ROLES = ['ADMIN', 'CATEGORY_MANAGER', 'SALES', 'PRESALES'] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

const ROLE_LABELS: Record<AllowedRole, string> = {
  ADMIN: 'Admin',
  CATEGORY_MANAGER: 'Category Manager',
  SALES: 'Sales',
  PRESALES: 'Pre-Sales',
};

const ROLE_OPTIONS: Array<{ value: AllowedRole; label: string; requiresManager: boolean }> = [
  { value: 'ADMIN', label: ROLE_LABELS.ADMIN, requiresManager: false },
  { value: 'CATEGORY_MANAGER', label: ROLE_LABELS.CATEGORY_MANAGER, requiresManager: false },
  { value: 'SALES', label: ROLE_LABELS.SALES, requiresManager: true },
  { value: 'PRESALES', label: ROLE_LABELS.PRESALES, requiresManager: true },
];

const INVITE_FORM_INITIAL: {
  firstName: string;
  lastName: string;
  email: string;
  role: AllowedRole;
  managerId: string;
} = {
  firstName: '',
  lastName: '',
  email: '',
  role: ROLE_OPTIONS[0]?.value ?? 'CATEGORY_MANAGER',
  managerId: '',
};

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const getUserRoleLabel = (role: string): string =>
  ROLE_LABELS[role as AllowedRole] ?? role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const buildAvatar = (user: User): string => {
  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (initials.length > 0) return initials;
  return user.email?.[0]?.toUpperCase() ?? '?';
};

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | AllowedRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [refreshing, setRefreshing] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState(INVITE_FORM_INITIAL);

  const currentUser = useMemo(() => getStoredUser(), []);
  const isAdmin = (currentUser?.role ?? '').toUpperCase() === 'ADMIN';
  const showActionsColumn = isAdmin;

  const loadUsers = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      try {
        if (!silent) setLoading(true);
        setError(null);
        if (!silent) setDeleteError(null);
        const data = await usersApi.list();
        setUsers(data);
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Failed to load users.';
        setError(message);
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!inviteSuccess) return;
    const timer = window.setTimeout(() => setInviteSuccess(null), 4000);
    return () => window.clearTimeout(timer);
  }, [inviteSuccess]);

  const uniqueRoles = useMemo(() => {
    const set = new Set<AllowedRole>();
    users.forEach((user) => {
      if (ALLOWED_ROLES.includes(user.role as AllowedRole)) {
        set.add(user.role as AllowedRole);
      }
    });
    return Array.from(set).sort((a, b) => getUserRoleLabel(a).localeCompare(getUserRoleLabel(b)));
  }, [users]);

const managerOptions = useMemo(() => {
  switch (inviteForm.role) {
    case 'SALES':
      return users
        .filter((user) => user.active && user.role === 'CATEGORY_MANAGER')
        .slice()
        .sort((a, b) => {
          const nameA = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim().toLowerCase();
          const nameB = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim().toLowerCase();
          return nameA.localeCompare(nameB);
        });
    case 'PRESALES':
      return users
        .filter((user) => user.active && user.role === 'SALES')
        .slice()
        .sort((a, b) => {
          const nameA = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim().toLowerCase();
          const nameB = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim().toLowerCase();
          return nameA.localeCompare(nameB);
        });
    default:
      return [];
  }
}, [users, inviteForm.role]);

  const requiresManager = useMemo(
    () => ROLE_OPTIONS.find((option) => option.value === inviteForm.role)?.requiresManager ?? false,
    [inviteForm.role],
  );

const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users
      .filter((user) => {
        if (roleFilter !== 'ALL' && user.role !== roleFilter) return false;
        if (statusFilter === 'ACTIVE' && !user.active) return false;
        if (statusFilter === 'INACTIVE' && user.active) return false;

        if (term.length === 0) return true;
        const haystack = [
          user.firstName,
          user.lastName,
          user.email,
          user.role,
          user.managerName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => {
        const direction = sortDirection === 'asc' ? 1 : -1;
        switch (sortKey) {
          case 'name': {
            const nameA = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim().toLowerCase();
            const nameB = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim().toLowerCase();
            return nameA.localeCompare(nameB) * direction;
          }
          case 'role':
            return getUserRoleLabel(a.role).localeCompare(getUserRoleLabel(b.role)) * direction;
          case 'status': {
            const delta = Number(a.active) - Number(b.active);
            return delta * direction;
          }
          case 'lastLoginAt': {
            const timeA = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
            const timeB = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
            return (timeA - timeB) * direction;
          }
          case 'createdAt':
          default: {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return (timeA - timeB) * direction;
          }
        }
      });
  }, [users, search, roleFilter, statusFilter, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDirection(key === 'createdAt' || key === 'lastLoginAt' ? 'desc' : 'asc');
      return key;
    });
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? '▲' : '▼';
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setDeleteError(null);
    await loadUsers({ silent: true });
  };

  const handleInviteFieldChange = (key: keyof typeof inviteForm, value: string) => {
    if (key === 'role') {
      setInviteForm((prev) => ({
        ...prev,
        role: value as AllowedRole,
        managerId: '',
      }));
      return;
    }

    setInviteForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const openInviteModal = () => {
    setInviteForm({ ...INVITE_FORM_INITIAL });
    setInviteError(null);
    setInviteOpen(true);
  };

  const closeInviteModal = (force = false) => {
    if (inviteLoading && !force) return;
    setInviteOpen(false);
    setInviteError(null);
    setInviteForm({ ...INVITE_FORM_INITIAL });
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteForm.firstName.trim() || !inviteForm.lastName.trim()) {
      setInviteError('First and last name are required.');
      return;
    }
    if (!inviteForm.email.trim()) {
      setInviteError('Email address is required.');
      return;
    }
    if (!inviteForm.email.includes('@')) {
      setInviteError('Please enter a valid email address.');
      return;
    }
    if (requiresManager && !inviteForm.managerId) {
      setInviteError('Select a manager for this role.');
      return;
    }

    setInviteLoading(true);
    setInviteError(null);
    try {
      const payload = {
        email: inviteForm.email.trim(),
        firstName: inviteForm.firstName.trim(),
        lastName: inviteForm.lastName.trim(),
        role: inviteForm.role,
        managerId: inviteForm.managerId ? Number(inviteForm.managerId) : undefined,
      };
      const created = await usersApi.createUser(payload);
      setInviteSuccess(`Invitation sent to ${created.email}.`);
      closeInviteModal(true);
      await loadUsers();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to invite user.';
      setInviteError(message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!isAdmin) return;
    if (currentUser?.userId && currentUser.userId === user.id) {
      setDeleteError("You can't delete your own account.");
      return;
    }

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const label = fullName.length > 0 ? fullName : user.email;
    const confirmed = window.confirm(`Delete ${label}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      setDeleteLoadingId(user.id);
      setDeleteError(null);
      await usersApi.deleteUser(user.id);
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to delete user.';
      setDeleteError(message);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  return (
    <div className="users-page">
      <header className="users-header">
        <div>
          <h1>Users</h1>
          <p>Review account access, roles, and activity across your team.</p>
        </div>
        <div className="users-actions">
          <button
            className="users-refresh"
            onClick={() => void handleRefresh()}
            disabled={refreshing || loading}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="users-add" onClick={openInviteModal}>
            + Invite user
          </button>
        </div>
      </header>

      <section className="users-filters">
        <input
          type="search"
          placeholder="Search name, email, role, manager…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="users-search"
        />
        <div className="users-filter-group">
          <label htmlFor="users-role-filter">Role</label>
          <select
            id="users-role-filter"
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value === 'ALL' ? 'ALL' : (event.target.value as AllowedRole))
            }
          >
            <option value="ALL">All roles</option>
            {uniqueRoles.map((role) => (
              <option key={role} value={role}>
                {getUserRoleLabel(role)}
              </option>
            ))}
          </select>
        </div>
        <div className="users-filter-group">
          <label htmlFor="users-status-filter">Status</label>
          <select
            id="users-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          >
            <option value="ALL">All users</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </section>

      {error && (
        <div className="users-error">
          <span>{error}</span>
          <button onClick={() => void loadUsers()}>Try again</button>
        </div>
      )}

      {inviteSuccess && (
        <div className="users-success">
          <span>{inviteSuccess}</span>
          <button type="button" onClick={() => setInviteSuccess(null)}>
            Dismiss
          </button>
        </div>
      )}

      {loading && !refreshing ? (
        <div className="users-loading">Loading users…</div>
      ) : filteredUsers.length === 0 ? (
        <div className="users-empty">
          <h2>No users found</h2>
          <p>Adjust your filters or invite new team members.</p>
        </div>
      ) : (
        <div className="users-table-wrapper">
          <table className="users-table">
            <thead>
              <tr>
                <th data-sortable onClick={() => handleSort('name')}>
                  User {sortIndicator('name')}
                </th>
                <th data-sortable onClick={() => handleSort('role')}>
                  Role {sortIndicator('role')}
                </th>
                <th>
                  Manager
                </th>
                <th data-sortable onClick={() => handleSort('status')}>
                  Status {sortIndicator('status')}
                </th>
                <th data-sortable onClick={() => handleSort('createdAt')}>
                  Created {sortIndicator('createdAt')}
                </th>
                <th data-sortable onClick={() => handleSort('lastLoginAt')}>
                  Last login {sortIndicator('lastLoginAt')}
                </th>
                {showActionsColumn && <th className="users-actions-heading">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td data-label="User">
                    <div className="users-user-cell">
                      <div className="users-avatar">{buildAvatar(user)}</div>
                      <div>
                        <div className="users-name">
                          {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                        </div>
                        <div className="users-email">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Role">
                    <span className="users-role-pill">{getUserRoleLabel(user.role)}</span>
                  </td>
                  <td data-label="Manager">
                    {user.managerName ? (
                      <span className="users-manager">{user.managerName}</span>
                    ) : (
                      <span className="users-manager muted">—</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <span className={`users-status ${user.active ? 'active' : 'inactive'}`}>
                      {user.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td data-label="Created">{formatDate(user.createdAt)}</td>
                  <td data-label="Last login">{formatDate(user.lastLoginAt)}</td>
                  {showActionsColumn && (
                    <td data-label="Actions" className="users-actions-cell">
                      {currentUser?.userId === user.id ? (
                        <span className="users-action-placeholder">—</span>
                      ) : (
                        <button
                          type="button"
                          className="users-delete"
                          onClick={() => void handleDeleteUser(user)}
                          disabled={deleteLoadingId === user.id}
                        >
                          {deleteLoadingId === user.id ? 'Deleting…' : 'Delete'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {showActionsColumn && deleteError && (
            <div className="users-inline-error">
              <span>{deleteError}</span>
              <button type="button" onClick={() => setDeleteError(null)}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {inviteOpen && (
        <div className="users-modal-overlay" onClick={() => closeInviteModal(false)}>
          <div className="users-modal" onClick={(event) => event.stopPropagation()}>
            <header className="users-modal-header">
              <h2>Invite user</h2>
              <button
                type="button"
                className="users-modal-close"
                onClick={() => closeInviteModal(false)}
                disabled={inviteLoading}
              >
                ×
              </button>
            </header>
            <p className="users-modal-subtitle">
              Send an invitation so the user can set their password and join your team.
            </p>
            <form className="users-modal-form" onSubmit={handleInviteSubmit}>
              <label className="users-modal-label">
                First name
                <input
                  type="text"
                  value={inviteForm.firstName}
                  onChange={(event) => handleInviteFieldChange('firstName', event.target.value)}
                  placeholder="Taylor"
                  disabled={inviteLoading}
                  required
                />
              </label>
              <label className="users-modal-label">
                Last name
                <input
                  type="text"
                  value={inviteForm.lastName}
                  onChange={(event) => handleInviteFieldChange('lastName', event.target.value)}
                  placeholder="Jordan"
                  disabled={inviteLoading}
                  required
                />
              </label>
              <label className="users-modal-label">
                Email
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(event) => handleInviteFieldChange('email', event.target.value)}
                  placeholder="taylor.jordan@example.com"
                  disabled={inviteLoading}
                  required
                />
              </label>
              <label className="users-modal-label">
                Role
                <select
                  value={inviteForm.role}
                  onChange={(event) => handleInviteFieldChange('role', event.target.value)}
                  disabled={inviteLoading}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="users-modal-label">
                Manager
                {requiresManager ? (
                  <>
                    <select
                      value={inviteForm.managerId}
                      onChange={(event) => handleInviteFieldChange('managerId', event.target.value)}
                      disabled={inviteLoading || managerOptions.length === 0}
                      required
                    >
                      <option value="">
                        {managerOptions.length === 0
                          ? 'No eligible managers available'
                          : 'Select manager'}
                      </option>
                      {managerOptions.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {[manager.firstName, manager.lastName].filter(Boolean).join(' ') || manager.email} ·{' '}
                          {getUserRoleLabel(manager.role)}
                        </option>
                      ))}
                    </select>
                    <span className="users-modal-hint">
                      {managerOptions.length > 0
                        ? inviteForm.role === 'SALES'
                          ? 'Assign a Category Manager who oversees this sales rep.'
                          : 'Assign a Sales user who this pre-sales member supports.'
                        : 'No eligible managers found. Add one first.'}
                    </span>
                  </>
                ) : (
                  <input type="text" value="Not required" disabled />
                )}
              </label>
              {inviteError && <div className="users-modal-error">{inviteError}</div>}
              <div className="users-modal-actions">
                <button
                  type="button"
                  className="users-modal-cancel"
                  onClick={() => closeInviteModal(false)}
                  disabled={inviteLoading}
                >
                  Cancel
                </button>
                <button type="submit" className="users-modal-submit" disabled={inviteLoading}>
                  {inviteLoading ? (
                    <span className="users-modal-submit-content">
                      <span className="users-button-spinner" />
                      Sending…
                    </span>
                  ) : (
                    'Send invite'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
