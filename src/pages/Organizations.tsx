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
      setCategories(data);
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

  return (
    <div className="organizations-page">
      <header className="organizations-header">
        <div>
          <h1>Organizations</h1>
          <p>Manage the company records that power dropdowns and ownership flows across CRM.</p>
        </div>
        <div className="organizations-header-actions">
          <div className="organizations-search">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search organizations…"
            />
          </div>
          <div style={{ position: 'relative' }} ref={dateRangeDropdownRef}>
            <button 
              className="organizations-date-range-btn"
              onClick={() => setIsDateRangeDropdownOpen(!isDateRangeDropdownOpen)}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{getDateRangeDisplayText()}</span>
              <span style={{ fontSize: '10px' }}>▾</span>
            </button>
            {isDateRangeDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  backgroundColor: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  minWidth: '200px',
                  zIndex: 1000,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => handleDateRangeOption('today')}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Today
                </button>
                <button
                  onClick={() => handleDateRangeOption('yesterday')}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Yesterday
                </button>
                <button
                  onClick={() => handleDateRangeOption('thisWeek')}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  This week
                </button>
                <button
                  onClick={() => handleDateRangeOption('lastWeek')}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Last week
                </button>
                <button
                  onClick={() => handleDateRangeOption('thisMonth')}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  This month
                </button>
                <button
                  onClick={() => handleDateRangeOption('lastMonth')}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Last month
                </button>
                <button
                  onClick={() => handleDateRangeOption('last30Days')}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Last 30 days
                </button>
                <div style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }}></div>
                <button
                  onClick={() => handleDateRangeOption('custom')}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Select date range
                </button>
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
      </header>

      {error && <div className="organizations-error">{error}</div>}

      {loading ? (
        <Loader message="Loading organizations..." size="large" />
      ) : filteredOrganizations.length === 0 ? (
        <div className="organizations-empty">
          <div className="organizations-empty-card">
            <h2>No organizations yet</h2>
            <p>Use the “+ Organization” button to create your first record.</p>
          </div>
        </div>
      ) : (
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
              return (
                <tr key={organization.id}>
                  <td>{organization.id}</td>
                  <td>{organization.name}</td>
                  <td>{organization.category ?? '—'}</td>
                  <td>{owner ? owner.displayName || `${owner.firstName} ${owner.lastName}` : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{dealCounts.total}</td>
                  <td style={{ textAlign: 'center' }}>{dealCounts.won}</td>
                  <td style={{ textAlign: 'center' }}>{dealCounts.lost}</td>
                  <td style={{ textAlign: 'center' }}>{dealCounts.open}</td>
                  <td>
                    {organization.googleCalendarId ? (
                      <span className="organizations-calendar-pill" title="This organization syncs to Google Calendar">
                        {organization.googleCalendarId}
                      </span>
                    ) : (
                      '—'
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
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setIsDateRangeModalOpen(false)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              padding: '24px',
              borderRadius: '8px',
              minWidth: '400px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>Select Date Range</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  min={dateRange.start || undefined}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                  onClick={() => {
                    setIsDateRangeModalOpen(false);
                    setDateRange({ start: '', end: '' });
                    setSelectedDateRangeOption('');
                  }}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Clear
              </button>
              <button
                onClick={() => {
                  if (dateRange.start && dateRange.end) {
                    setIsDateRangeModalOpen(false);
                    setSelectedDateRangeOption(''); // Clear preset option when using custom range
                  }
                }}
                disabled={!dateRange.start || !dateRange.end}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: (!dateRange.start || !dateRange.end) ? '#ccc' : '#2563eb',
                  color: 'white',
                  cursor: (!dateRange.start || !dateRange.end) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
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


