import { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import OrganizationModal from '../components/OrganizationModal';
import Loader from '../components/Loader';
import { organizationsApi } from '../services/organizations';
import { dealsApi } from '../services/deals';
import { usersApi } from '../services/users';
import type { Organization, OrganizationCategory, OrganizationOwner, OrganizationRequest } from '../types/organization';
import type { Deal } from '../types/deal';
import type { User } from '../types/user';
import './Organizations.css';
import { filterOrganizationCategories } from '../constants/categories';
import { clearAuthSession, getStoredUser } from '../utils/authToken';

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; organization: Organization };

export default function Organizations() {
  const location = useLocation();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [owners, setOwners] = useState<OrganizationOwner[]>([]);
  const [categories, setCategories] = useState<OrganizationCategory[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isDateRangeModalOpen, setIsDateRangeModalOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [selectedDateRangeOption, setSelectedDateRangeOption] = useState<string>('');
  const [isDateRangeDropdownOpen, setIsDateRangeDropdownOpen] = useState(false);
  const dateRangeDropdownRef = useRef<HTMLDivElement>(null);
  const hasHandledOpenModal = useRef(false);

  const storedUser = getStoredUser();
  const normalizedRole = (storedUser?.role || '').toUpperCase();
  const isCategoryManager = normalizedRole === 'CATEGORY_MANAGER';
  const currentUserId = storedUser?.userId;

  // Helper function to format date as YYYY-MM-DD
  const formatDateYYYYMMDD = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Filter deals by date range
  const filteredDeals = useMemo(() => {
    if (!dateRange.start || !dateRange.end) {
      return deals;
    }
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    endDate.setHours(23, 59, 59, 999); // Include the entire end date
    
    return deals.filter((deal) => {
      const dealDate = new Date(deal.createdAt);
      return dealDate >= startDate && dealDate <= endDate;
    });
  }, [deals, dateRange]);

  // Handle date range option selection
  const handleDateRangeOption = (option: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate: Date;
    let endDate: Date = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    switch (option) {
      case 'today':
        startDate = new Date(today);
        setDateRange({
          start: formatDateYYYYMMDD(startDate),
          end: formatDateYYYYMMDD(endDate),
        });
        setSelectedDateRangeOption('Today');
        break;
      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        setDateRange({
          start: formatDateYYYYMMDD(startDate),
          end: formatDateYYYYMMDD(endDate),
        });
        setSelectedDateRangeOption('Yesterday');
        break;
      case 'thisWeek':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        setDateRange({
          start: formatDateYYYYMMDD(startDate),
          end: formatDateYYYYMMDD(endDate),
        });
        setSelectedDateRangeOption('This week');
        break;
      case 'lastWeek':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay() - 7); // Start of last week
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6); // End of last week
        endDate.setHours(23, 59, 59, 999);
        setDateRange({
          start: formatDateYYYYMMDD(startDate),
          end: formatDateYYYYMMDD(endDate),
        });
        setSelectedDateRangeOption('Last week');
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        setDateRange({
          start: formatDateYYYYMMDD(startDate),
          end: formatDateYYYYMMDD(endDate),
        });
        setSelectedDateRangeOption('This month');
        break;
      case 'lastMonth':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        endDate.setHours(23, 59, 59, 999);
        setDateRange({
          start: formatDateYYYYMMDD(startDate),
          end: formatDateYYYYMMDD(endDate),
        });
        setSelectedDateRangeOption('Last month');
        break;
      case 'last30Days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
        setDateRange({
          start: formatDateYYYYMMDD(startDate),
          end: formatDateYYYYMMDD(endDate),
        });
        setSelectedDateRangeOption('Last 30 days');
        break;
      case 'custom':
        setIsDateRangeModalOpen(true);
        setIsDateRangeDropdownOpen(false);
        return;
      default:
        return;
    }
    setIsDateRangeDropdownOpen(false);
  };

  const getDateRangeDisplayText = () => {
    if (selectedDateRangeOption) {
      return selectedDateRangeOption;
    }
    if (dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start).toLocaleDateString();
      const end = new Date(dateRange.end).toLocaleDateString();
      return `${start} - ${end}`;
    }
    return 'Select Date Range';
  };

  // Calculate deal counts per organization
  const organizationDealCounts = useMemo(() => {
    const counts: Record<number, { total: number; won: number; lost: number; open: number }> = {};
    
    filteredDeals.forEach((deal) => {
      if (deal.organizationId) {
        if (!counts[deal.organizationId]) {
          counts[deal.organizationId] = { total: 0, won: 0, lost: 0, open: 0 };
        }
        counts[deal.organizationId].total++;
        if (deal.status === 'WON') {
          counts[deal.organizationId].won++;
        } else if (deal.status === 'LOST') {
          counts[deal.organizationId].lost++;
        } else if (deal.status === 'IN_PROGRESS') {
          counts[deal.organizationId].open++;
        }
      }
    });
    
    return counts;
  }, [filteredDeals]);

  const filteredOrganizations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return organizations;
    return organizations.filter((org) => {
      const category = org.category ?? '';
      const calendarEmail = org.googleCalendarId ?? '';
      return (
        org.name.toLowerCase().includes(term) ||
        category.toLowerCase().includes(term) ||
        calendarEmail.toLowerCase().includes(term)
      );
    });
  }, [organizations, search]);

  const organizationSummary = useMemo(() => {
    let totalDeals = 0;
    let won = 0;
    let lost = 0;
    let open = 0;
    filteredOrganizations.forEach((org) => {
      const counts = organizationDealCounts[org.id] || { total: 0, won: 0, lost: 0, open: 0 };
      totalDeals += counts.total;
      won += counts.won;
      lost += counts.lost;
      open += counts.open;
    });
    return {
      organizations: filteredOrganizations.length,
      totalDeals,
      won,
      lost,
      open,
    };
  }, [filteredOrganizations, organizationDealCounts]);

  useEffect(() => {
    void loadOrganizations();
    void loadOwners();
    void loadCategories();
    void loadDeals();
    void loadUsers();
  }, []);

  // Filter organizations based on role
  useEffect(() => {
    if (!isCategoryManager || !currentUserId || allOrganizations.length === 0 || users.length === 0) {
      // If not category manager or data not loaded, show all organizations
      setOrganizations(allOrganizations);
      return;
    }

    // Category Manager: Show organizations owned by sales people under them
    const getUpperRole = (u: User) => (u.role || '').toUpperCase();
    const salesPeopleUnderManager = users.filter(
      (u) => getUpperRole(u) === 'SALES' && u.managerId === currentUserId,
    );
    const salesPeopleIds = new Set(salesPeopleUnderManager.map((s) => s.id));
    const filtered = allOrganizations.filter(
      (org) => org.owner && org.owner.id && salesPeopleIds.has(org.owner.id),
    );
    setOrganizations(filtered);
  }, [allOrganizations, users, isCategoryManager, currentUserId]);
  // Check if modal should be opened from navigation state
  useEffect(() => {
    const state = location.state as any;
    if (state?.openModal && !modalState && !hasHandledOpenModal.current) {
      hasHandledOpenModal.current = true;
      setModalState({ mode: 'create' });
      // Clear the state to prevent reopening on re-render using navigate
      requestAnimationFrame(() => {
        navigate(location.pathname, { replace: true, state: {} });
      });
    }
  }, [location.pathname, location.state, modalState, navigate]);
  
  // Reset the ref when modal is closed and state is cleared
  useEffect(() => {
    if (!modalState) {
      const state = location.state as any;
      if (!state?.openModal && hasHandledOpenModal.current) {
        const timer = setTimeout(() => {
          hasHandledOpenModal.current = false;
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [modalState, location.state]);

  // Close date range dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dateRangeDropdownRef.current && !dateRangeDropdownRef.current.contains(event.target as Node)) {
        setIsDateRangeDropdownOpen(false);
      }
    };

    if (isDateRangeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDateRangeDropdownOpen]);

  const loadDeals = async () => {
    try {
      const data = await dealsApi.list();
      setDeals(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      console.warn('Failed to load deals', err);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await usersApi.list();
      setUsers(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      console.warn('Failed to load users', err);
    }
  };

  const handleAuthRedirect = () => {
    clearAuthSession();
    window.location.href = '/login';
  };

  const loadOwners = async () => {
    try {
      const data = await organizationsApi.listOwners();
      setOwners(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      console.warn('Failed to load organization owners', err);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await organizationsApi.listCategories();
      setCategories(filterOrganizationCategories(data));
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      console.warn('Failed to load organization categories', err);
    }
  };

  const loadOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await organizationsApi.list();
      setAllOrganizations(data);
      // Initial set - filtering will be applied in useEffect if needed
      setOrganizations(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      const message = err?.response?.data?.message || err?.message || 'Failed to load organizations.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const refreshOrganizations = async () => {
    setRefreshing(true);
    try {
      const data = await organizationsApi.list();
      setAllOrganizations(data);
      // Filtering will be applied in useEffect if needed
      setError(null);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      const message = err?.response?.data?.message || err?.message || 'Failed to refresh organizations.';
      setError(message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleModalSubmit = async (payload: OrganizationRequest) => {
    if (!modalState) return;
    try {
      if (modalState.mode === 'create') {
        await organizationsApi.create(payload);
      } else {
        setBusyId(modalState.organization.id);
        await organizationsApi.update(modalState.organization.id, payload);
      }
      await refreshOrganizations();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (organization: Organization) => {
    if (!window.confirm(`Delete organization “${organization.name}”?`)) return;
    setBusyId(organization.id);
    try {
      await organizationsApi.remove(organization.id);
      await refreshOrganizations();
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      const message = err?.response?.data?.message || err?.message || 'Failed to delete organization.';
      setError(message);
    } finally {
      setBusyId(null);
    }
  };

  const getOwnerInitials = (label: string) => {
    const parts = label.trim().split(/\s+/);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?';
  };

  return (
    <div className="organizations-page">
      <header className="organizations-header">
        <div className="organizations-header-copy">
          <h1>Organizations</h1>
          <p>Manage the company records that power dropdowns and ownership flows across CRM.</p>
        </div>
        <div className="organizations-toolbar">
          <div className="organizations-search">
            <svg className="organizations-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search organizations…"
            />
          </div>
          <div className="organizations-toolbar-actions">
            <div className="organizations-date-wrap" ref={dateRangeDropdownRef}>
              <button
                className="organizations-date-range-btn"
                onClick={() => setIsDateRangeDropdownOpen(!isDateRangeDropdownOpen)}
              >
                <span>{getDateRangeDisplayText()}</span>
                <span className="organizations-date-caret">▾</span>
              </button>
              {isDateRangeDropdownOpen && (
                <div className="organizations-date-menu">
                  <button className="organizations-date-option" onClick={() => handleDateRangeOption('today')}>Today</button>
                  <button className="organizations-date-option" onClick={() => handleDateRangeOption('yesterday')}>Yesterday</button>
                  <button className="organizations-date-option" onClick={() => handleDateRangeOption('thisWeek')}>This week</button>
                  <button className="organizations-date-option" onClick={() => handleDateRangeOption('lastWeek')}>Last week</button>
                  <button className="organizations-date-option" onClick={() => handleDateRangeOption('thisMonth')}>This month</button>
                  <button className="organizations-date-option" onClick={() => handleDateRangeOption('lastMonth')}>Last month</button>
                  <button className="organizations-date-option" onClick={() => handleDateRangeOption('last30Days')}>Last 30 days</button>
                  <div className="organizations-date-divider"></div>
                  <button className="organizations-date-option" onClick={() => handleDateRangeOption('custom')}>Select date range</button>
                </div>
              )}
            </div>
            <button className="organizations-add" onClick={() => setModalState({ mode: 'create' })}>
              + Organization
            </button>
            <button
              className="organizations-refresh"
              onClick={() => {
                void refreshOrganizations();
                void loadDeals();
              }}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      {!loading && (
        <section className="organizations-summary" aria-label="Organizations">
          <article className="organizations-stat tone-teal">
            <span className="organizations-stat-label">Organizations</span>
            <strong className="organizations-stat-value">{organizationSummary.organizations}</strong>
          </article>
          <article className="organizations-stat tone-lavender">
            <span className="organizations-stat-label">Total Deals</span>
            <strong className="organizations-stat-value">{organizationSummary.totalDeals}</strong>
          </article>
          <article className="organizations-stat tone-peach">
            <span className="organizations-stat-label">WON</span>
            <strong className="organizations-stat-value">{organizationSummary.won}</strong>
          </article>
          <article className="organizations-stat tone-pink">
            <span className="organizations-stat-label">LOST</span>
            <strong className="organizations-stat-value">{organizationSummary.lost}</strong>
          </article>
          <article className="organizations-stat tone-open">
            <span className="organizations-stat-label">Open</span>
            <strong className="organizations-stat-value">{organizationSummary.open}</strong>
          </article>
        </section>
      )}

      {error && <div className="organizations-error">{error}</div>}

      {loading ? (
        <Loader message="Loading organizations..." size="large" />
      ) : filteredOrganizations.length === 0 ? (
        <div className="organizations-empty">
          <div className="organizations-empty-card">
            <div className="organizations-empty-icon" aria-hidden="true">⌂</div>
            <h2>No organizations yet</h2>
            <p>Use the “+ Organization” button to create your first record.</p>
          </div>
        </div>
      ) : (
        <div className="organizations-panel">
        <div className="organizations-table-wrap">
        <table className="organizations-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>ID</th>
              <th>Name</th>
              <th style={{ width: '200px' }}>Category</th>
              <th style={{ width: '150px' }}>Owner</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Total Deals</th>
              <th style={{ width: '80px', textAlign: 'center' }}>WON</th>
              <th style={{ width: '80px', textAlign: 'center' }}>LOST</th>
              <th style={{ width: '80px', textAlign: 'center' }}>Open</th>
              <th style={{ width: '240px' }}>Calendar email</th>
              <th style={{ width: '180px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrganizations.map((organization) => {
              const isBusy = busyId === organization.id;
              const dealCounts = organizationDealCounts[organization.id] || { total: 0, won: 0, lost: 0, open: 0 };
              const owner = organization.owner;
              const ownerLabel = owner ? owner.displayName || `${owner.firstName} ${owner.lastName}` : '—';
              return (
                <tr key={organization.id}>
                  <td><span className="organizations-id">{organization.id}</span></td>
                  <td><span className="organizations-name">{organization.name}</span></td>
                  <td>
                    {organization.category ? (
                      <span
                        className={`organizations-category-chip ${
                          organization.category.toUpperCase().includes('MAKEUP') ? 'is-makeup' : 'is-photo'
                        }`}
                      >
                        {organization.category}
                      </span>
                    ) : (
                      <span className="organizations-muted">—</span>
                    )}
                  </td>
                  <td>
                    {ownerLabel !== '—' ? (
                      <span className="organizations-owner">
                        <span className="organizations-avatar" aria-hidden="true">{getOwnerInitials(ownerLabel)}</span>
                        <span>{ownerLabel}</span>
                      </span>
                    ) : (
                      <span className="organizations-muted">—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="organizations-count organizations-count-total">{dealCounts.total}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="organizations-count organizations-count-won">{dealCounts.won}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="organizations-count organizations-count-lost">{dealCounts.lost}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="organizations-count organizations-count-open">{dealCounts.open}</span>
                  </td>
                  <td>
                    {organization.googleCalendarId ? (
                      <span className="organizations-calendar-pill" title="This organization syncs to Google Calendar">
                        {organization.googleCalendarId}
                      </span>
                    ) : (
                      <span className="organizations-muted">—</span>
                    )}
                  </td>
                  <td>
                    <div className="organizations-row-actions">
                      <button
                        className="organizations-row-btn"
                        onClick={() => setModalState({ mode: 'edit', organization })}
                        disabled={isBusy}
                      >
                        Edit
                      </button>
                      <button
                        className="organizations-row-btn danger"
                        onClick={() => void handleDelete(organization)}
                        disabled={isBusy}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="organizations-card-list">
          {filteredOrganizations.map((organization) => {
            const isBusy = busyId === organization.id;
            const dealCounts = organizationDealCounts[organization.id] || { total: 0, won: 0, lost: 0, open: 0 };
            const owner = organization.owner;
            const ownerLabel = owner ? owner.displayName || `${owner.firstName} ${owner.lastName}` : '—';
            return (
              <div key={`card-${organization.id}`} className="organizations-card">
                <div className="organizations-card-title">{organization.name}</div>
                <div className="organizations-card-row"><span>ID</span><span>{organization.id}</span></div>
                <div className="organizations-card-row"><span>Category</span><span>{organization.category ?? '—'}</span></div>
                <div className="organizations-card-row"><span>Owner</span><span>{ownerLabel}</span></div>
                <div className="organizations-card-row"><span>Total Deals</span><span>{dealCounts.total}</span></div>
                <div className="organizations-card-row"><span>WON</span><span>{dealCounts.won}</span></div>
                <div className="organizations-card-row"><span>LOST</span><span>{dealCounts.lost}</span></div>
                <div className="organizations-card-row"><span>Open</span><span>{dealCounts.open}</span></div>
                <div className="organizations-card-row"><span>Calendar email</span><span>{organization.googleCalendarId || '—'}</span></div>
                <div className="organizations-row-actions" style={{ marginTop: 10 }}>
                  <button className="organizations-row-btn" onClick={() => setModalState({ mode: 'edit', organization })} disabled={isBusy}>Edit</button>
                  <button className="organizations-row-btn danger" onClick={() => void handleDelete(organization)} disabled={isBusy}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}

      {modalState && (
        <OrganizationModal
          isOpen
          mode={modalState.mode}
          organization={modalState.mode === 'edit' ? modalState.organization : undefined}
          onClose={() => {
            setModalState(null);
            hasHandledOpenModal.current = false;
            // Clear location state to prevent modal from reopening
            navigate(location.pathname, { replace: true, state: {} });
          }}
          onSubmit={handleModalSubmit}
          owners={owners}
          categories={categories}
        />
      )}

      {/* Date Range Modal */}
      {isDateRangeModalOpen && (
        <div
          className="organizations-range-overlay"
          onClick={() => setIsDateRangeModalOpen(false)}
        >
          <div
            className="organizations-range-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Select Date Range</h3>
            <div className="organizations-range-field">
                <label>
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>
            <div className="organizations-range-field">
                <label>
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  min={dateRange.start || undefined}
                />
              </div>
            <div className="organizations-range-actions">
              <button
                  className="organizations-range-clear"
                  onClick={() => {
                    setIsDateRangeModalOpen(false);
                    setDateRange({ start: '', end: '' });
                    setSelectedDateRangeOption('');
                  }}
              >
                Clear
              </button>
              <button
                className="organizations-range-apply"
                onClick={() => {
                  if (dateRange.start && dateRange.end) {
                    setIsDateRangeModalOpen(false);
                    setSelectedDateRangeOption('');
                  }
                }}
                disabled={!dateRange.start || !dateRange.end}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


