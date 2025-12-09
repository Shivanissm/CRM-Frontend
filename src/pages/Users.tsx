import { FormEvent, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import './Users.css';
import Loader from '../components/Loader';
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
  const location = useLocation();
  const navigate = useNavigate();
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
  const [showDuplicateEmailToast, setShowDuplicateEmailToast] = useState(false);
  const [inviteForm, setInviteForm] = useState(INVITE_FORM_INITIAL);
  const hasHandledOpenModal = useRef(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSalesId, setSelectedSalesId] = useState<number | null>(null);

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

  // Check if modal should be opened from navigation state
  useEffect(() => {
    const state = (location as any)?.state;
    if (state?.openModal && !inviteOpen && !hasHandledOpenModal.current) {
      hasHandledOpenModal.current = true;
      setInviteOpen(true);
      // Clear the state to prevent reopening on re-render
      requestAnimationFrame(() => {
        navigate(location.pathname, { replace: true, state: {} });
      });
    }
  }, [location.pathname, (location as any)?.state, inviteOpen, navigate]);
  
  // Reset the ref when modal is closed and state is cleared
  useEffect(() => {
    if (!inviteOpen) {
      const state = (location as any)?.state;
      if (!state?.openModal && hasHandledOpenModal.current) {
        const timer = setTimeout(() => {
          hasHandledOpenModal.current = false;
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [inviteOpen, (location as any)?.state]);

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

  useEffect(() => {
    if (filteredUsers.length === 0) {
      if (selectedUser) {
        setSelectedUser(null);
      }
      return;
    }
    if (!selectedUser || !filteredUsers.some((user) => user.id === selectedUser.id)) {
      setSelectedUser(filteredUsers[0]);
      setIsDetailVisible(true);
    }
  }, [filteredUsers, selectedUser]);

  const admins = useMemo(() => users.filter((user) => user.role === 'ADMIN'), [users]);
  const categoryManagers = useMemo(() => users.filter((user) => user.role === 'CATEGORY_MANAGER'), [users]);
  const salesUsers = useMemo(() => users.filter((user) => user.role === 'SALES'), [users]);
  const preSalesUsers = useMemo(() => users.filter((user) => user.role === 'PRESALES'), [users]);

  useEffect(() => {
    if (viewMode !== 'tree') return;
    if (categoryManagers.length === 0) {
      setSelectedCategoryId(null);
      setSelectedSalesId(null);
      return;
    }
    if (!selectedCategoryId || !categoryManagers.some((cm) => cm.id === selectedCategoryId)) {
      setSelectedCategoryId(categoryManagers[0].id);
      setSelectedSalesId(null);
      return;
    }
    const linkedSales = salesUsers.filter((sales) => sales.managerId === selectedCategoryId);
    if (
      selectedSalesId &&
      !linkedSales.some((sales) => sales.id === selectedSalesId)
    ) {
      setSelectedSalesId(linkedSales[0]?.id ?? null);
    } else if (!selectedSalesId && linkedSales.length > 0) {
      setSelectedSalesId(linkedSales[0].id);
    }
  }, [viewMode, categoryManagers, salesUsers, selectedCategoryId, selectedSalesId]);

  const selectedCategory = useMemo(
    () => categoryManagers.find((manager) => manager.id === selectedCategoryId) ?? null,
    [categoryManagers, selectedCategoryId],
  );

  const salesForSelectedCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return salesUsers.filter((sales) => sales.managerId === selectedCategory.id);
  }, [salesUsers, selectedCategory]);

  const selectedSales = useMemo(
    () => salesForSelectedCategory.find((sales) => sales.id === selectedSalesId) ?? null,
    [salesForSelectedCategory, selectedSalesId],
  );

  const preSalesForSelectedSales = useMemo(() => {
    if (!selectedSales) return [];
    return preSalesUsers.filter((preSales) => preSales.managerId === selectedSales.id);
  }, [preSalesUsers, selectedSales]);

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
    hasHandledOpenModal.current = false;
    // Clear location state to prevent modal from reopening
    navigate(location.pathname, { replace: true, state: {} });
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
      const errorMessage = message.toLowerCase();
      
      // Check if error is related to duplicate email
      if (errorMessage.includes('already exists') || 
          errorMessage.includes('duplicate') || 
          errorMessage.includes('email') && (errorMessage.includes('exist') || errorMessage.includes('taken'))) {
        setShowDuplicateEmailToast(true);
      } else {
      setInviteError(message);
      }
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

  const renderDetailPanel = () => {
    if (!selectedUser) {
      return null;
    }

    if (!isDetailVisible) {
      return (
        <div className="detail-card-slot">
          <button className="detail-reopen" type="button" onClick={() => setIsDetailVisible(true)}>
            Show details
          </button>
        </div>
      );
    }

    const displayName =
      [selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ').trim() || selectedUser.email;

    const totalMembers = selectedUser.totalMembers ?? 0;
    const directReports = selectedUser.directReports ?? 0;

    return (
      <div className="detail-card-slot">
        <aside className="detail-card-overlay">
          <div className="user-detail-card">
            <button
              className="detail-close-btn"
              type="button"
              aria-label="Close user details"
              onClick={() => setIsDetailVisible(false)}
            >
              ×
            </button>
            <div className="detail-card-header-section">
              <div className="detail-name-section">
                <div className="detail-avatar">{buildAvatar(selectedUser)}</div>
                <p className="detail-user-name">{displayName}</p>
                <span className="detail-role-pill">{getUserRoleLabel(selectedUser.role)}</span>
                <p className="detail-user-email">{selectedUser.email}</p>
              </div>
              <div className="detail-stats-section">
                <div className="stat-box">
                  <div className="stat-number">{totalMembers}</div>
                  <div className="stat-label">Total Members</div>
                </div>
                <div className="stat-box">
                  <div className="stat-number">{directReports}</div>
                  <div className="stat-label">Direct Reports</div>
                </div>
              </div>
            </div>

            <div className="detail-info-section">
              <div className="detail-info-line">
                <span className="detail-info-label">Status:</span>
                <span className="detail-info-value">{selectedUser.active ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="detail-info-line">
                <span className="detail-info-label">Role:</span>
                <span className="detail-info-value">{getUserRoleLabel(selectedUser.role)}</span>
              </div>
              <div className="detail-info-line">
                <span className="detail-info-label">Manager:</span>
                <span className="detail-info-value">{selectedUser.managerName ?? '—'}</span>
              </div>
              <div className="detail-info-line">
                <span className="detail-info-label">Created:</span>
                <span className="detail-info-value">{formatDate(selectedUser.createdAt)}</span>
              </div>
              <div className="detail-info-line">
                <span className="detail-info-label">Last login:</span>
                <span className="detail-info-value">{formatDate(selectedUser.lastLoginAt)}</span>
              </div>
            </div>

            <div className="detail-card-actions">
              <button className="detail-action-btn" type="button" title="Email user">
                ✉
              </button>
              <button className="detail-action-btn" type="button" title="Call user">
                📞
              </button>
              <button className="detail-action-btn" type="button" title="Message user">
                💬
              </button>
              <button
                className="detail-action-btn"
                type="button"
                title="Clear selection"
                onClick={() => setSelectedUser(null)}
              >
                ✕
              </button>
            </div>
          </div>
        </aside>
      </div>
    );
  };

  const renderTreeView = () => (
    <div className="tree-board">
      <div className="org-grid">
          <div className="org-col admin-col">
          <div className="org-title">
            admin <span className="title-badge">{admins.length}</span>
          </div>
            <div className="avatar-stack">
            {admins.map((admin) => (
              <button
                key={admin.id}
                type="button"
                className={`avatar-small ${selectedUser?.id === admin.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedUser(admin);
                  setIsDetailVisible(true);
                  setSelectedCategoryId(null);
                  setSelectedSalesId(null);
                }}
              >
                {buildAvatar(admin)}
              </button>
            ))}
            </div>
          </div>

          <div className="org-col cm-col">
          <div className="org-title">
            category manager <span className="title-badge">{categoryManagers.length}</span>
          </div>
            <div className="cm-stack">
            {categoryManagers.map((manager) => {
              const initials = buildAvatar(manager);
              const isActive = selectedCategory?.id === manager.id;
                return (
                <button
                  key={manager.id}
                  type="button"
                    className={`cm-circle ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCategoryId(manager.id);
                    const firstSales = salesUsers.find((sales) => sales.managerId === manager.id);
                    setSelectedSalesId(firstSales?.id ?? null);
                    setSelectedUser(manager);
                    setIsDetailVisible(true);
                  }}
                  >
                    <div className="cm-circle-inner">
                      <div className="cm-avatar">{initials}</div>
                    <div className="cm-name">
                      {[manager.firstName, manager.lastName].filter(Boolean).join(' ') || manager.email}
                    </div>
                  </div>
                </button>
              );
              })}
            </div>
          </div>

          <div className="org-col sales-col">
          <div className="column-title">
            sales <span className="title-badge">{salesForSelectedCategory.length}</span>
          </div>
          {!selectedCategory ? (
              <div className="placeholder-msg">Select Category Manager</div>
          ) : salesForSelectedCategory.length === 0 ? (
            <div className="placeholder-msg">No sales reps for this manager</div>
          ) : (
            <div className="column-list with-sales-connectors">
              {salesForSelectedCategory.map((sales) => (
                <button
                  key={sales.id}
                  type="button"
                  className={`board-pill sales ${selectedSales?.id === sales.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedSalesId(sales.id);
                    setSelectedUser(sales);
                    setIsDetailVisible(true);
                  }}
                >
                  <div className="board-pill-avatar">{buildAvatar(sales)}</div>
                    <div className="board-pill-info">
                    <div className="board-pill-name">
                      {[sales.firstName, sales.lastName].filter(Boolean).join(' ') || sales.email}
                    </div>
                    <div className="board-pill-role">Sales Rep</div>
                    <div className="board-pill-email">{sales.email}</div>
                  </div>
                  <span className="row-badge">
                    {preSalesUsers.filter((pre) => pre.managerId === sales.id).length}
                  </span>
                </button>
              ))}
            </div>
            )}
          </div>

          <div className="org-col presales-col">
          <div className="column-title">
            pre sales <span className="title-badge">{preSalesForSelectedSales.length}</span>
          </div>
          {!selectedSales ? (
              <div className="placeholder-msg">Select Sales Rep</div>
          ) : preSalesForSelectedSales.length === 0 ? (
            <div className="placeholder-msg">No pre-sales for this rep</div>
          ) : (
            <div className="column-list with-presales-connectors">
              {preSalesForSelectedSales.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className={`board-pill small presales ${selectedUser?.id === member.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedUser(member);
                    setIsDetailVisible(true);
                  }}
                >
                  <div className="board-pill-avatar">{buildAvatar(member)}</div>
                    <div className="board-pill-info">
                    <div className="board-pill-name">
                      {[member.firstName, member.lastName].filter(Boolean).join(' ') || member.email}
                    </div>
                    <div className="board-pill-role">Pre Sales</div>
                    <div className="board-pill-email">{member.email}</div>
                  </div>
                </button>
              ))}
            </div>
            )}
          {renderDetailPanel()}
        </div>
      </div>
    </div>
  );

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
        <div className="users-filter-group">
          <label htmlFor="users-layout-filter">Layout</label>
          <select
            id="users-layout-filter"
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as typeof viewMode)}
          >
            <option value="table">Table view</option>
            <option value="tree">Tree view</option>
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
        <Loader message="Loading users..." size="large" />
      ) : filteredUsers.length === 0 ? (
        <div className="users-empty">
          <h2>No users found</h2>
          <p>Adjust your filters or invite new team members.</p>
        </div>
        ) : viewMode === 'table' ? (
        <div className="users-content">
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
              {filteredUsers.map((user) => {
                const isSelected = selectedUser?.id === user.id;
                    return (
        <tr
                  key={user.id}
                  className={isSelected ? 'selected' : undefined}
                  onClick={() => {
                    setSelectedUser(user);
                    setIsDetailVisible(true);
                  }}
                >
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
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteUser(user);
                          }}
                          disabled={deleteLoadingId === user.id}
                        >
                          {deleteLoadingId === user.id ? 'Deleting…' : 'Delete'}
                        </button>
                      )}
                    </td>
                  )}
                      </tr>
              )})}
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
            </div>
        ) : (
          renderTreeView()
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

      {/* Duplicate Email Toast Notification */}
      {showDuplicateEmailToast && createPortal(
        <div className="users-toast-overlay" onClick={() => setShowDuplicateEmailToast(false)}>
          <div className="users-toast users-toast-error" onClick={(e) => e.stopPropagation()}>
            <div className="users-toast-icon-wrapper">
              <svg className="users-toast-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#DC2626" strokeWidth="2" fill="none"/>
                <path d="M12 8V12M12 16H12.01" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="users-toast-content">
              <div className="users-toast-message">The user is already exist with the provided email Address</div>
            </div>
            <div className="users-toast-actions">
              <button 
                className="users-toast-ok-btn" 
                onClick={() => setShowDuplicateEmailToast(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
        </div>
  );
}

