import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dealsApi } from '../services/deals';
import { organizationsApi } from '../services/organizations';
import { pipelinesApi } from '../services/pipelines';
import { teamsApi } from '../services/teams';
import { usersApi } from '../services/users';
import { personsApi } from '../services/api';
import type { Deal } from '../types/deal';
import type { Organization } from '../types/organization';
import type { Pipeline } from '../types/pipeline';
import type { Team } from '../types/team';
import type { Person } from '../types/person';
import { getStoredUser } from '../utils/authToken';
import './DealSourceReport.css';
import './RoleDashboards.css';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
};

const formatDate = (dateString?: string | null) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const parseIsoDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWithinRange = (date: Date | null, start: Date, end: Date): boolean => {
  if (!date) return false;
  return date >= start && date <= end;
};

function DealDurationWidget({ 
  averageDuration, 
  totalDealValue,
}: { 
  averageDuration: number;
  totalDealValue: number;
}) {
  const storedUser = getStoredUser();
  const userName = storedUser?.firstName || storedUser?.email || 'User';

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  return (
    <section 
      className="role-dashboard-card presales-analytics-card deal-duration-widget"
    >
      <div className="analytics-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="deal-duration-icon" style={{ color: '#15803D' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 2C5.58 2 2 5.58 2 10C2 14.42 5.58 18 10 18C14.42 18 18 14.42 18 10C18 5.58 14.42 2 10 2ZM10 16C6.69 16 4 13.31 4 10C4 6.69 6.69 4 10 4C13.31 4 16 6.69 16 10C16 13.31 13.31 16 10 16ZM10.5 6H9V11L13.25 13.15L14 11.92L10.5 10.25V6Z" fill="currentColor"/>
            </svg>
          </div>
          <h3 style={{ color: '#15803D' }}>Deal duration</h3>
        </div>
      </div>
      <div className="deal-duration-content">
        <div className="deal-duration-filters">
          <button className="deal-duration-filter-tag">
            {totalDealValue > 0 ? (
              <>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Total Deal Value </span>
                <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{formatCurrency(totalDealValue)}</span>
              </>
            ) : (
              '(NO VALUE)'
            )}
          </button>
          <button className="deal-duration-user-btn">{userName.toUpperCase()}</button>
        </div>
        <div className="deal-duration-value">
          <div className="deal-duration-change">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 2L10 6H7V10H5V6H2L6 2Z" fill="#ef4444"/>
            </svg>
            <span>0 days</span>
          </div>
          <div className="deal-duration-main">{averageDuration} days</div>
          <div className="deal-duration-label">Average duration (days)</div>
        </div>
      </div>
    </section>
  );
}

export default function DealDurationReport() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);

  // Filters
  const [selectedOrgIds, setSelectedOrgIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const orgMenuRef = useRef<HTMLDivElement | null>(null);
  const [orgSearch, setOrgSearch] = useState('');

  const storedUser = getStoredUser();

  // Initialize date range from URL params
  useEffect(() => {
    const fromParam = searchParams.get('dateFrom');
    const toParam = searchParams.get('dateTo');
    const orgParam = searchParams.get('organizationId');

    if (fromParam) setDateFrom(fromParam);
    if (toParam) setDateTo(toParam);
    if (orgParam) {
      const orgIds = orgParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      setSelectedOrgIds(orgIds);
    }
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dealsList, orgListPrimary, pipelineList, teamsList, userList, personsPage] = await Promise.all([
          dealsApi.list().catch(() => []),
          organizationsApi.listAccessibleForCurrentUser().catch(() => []),
          pipelinesApi.list({ includeStages: true }).catch(() => []),
          teamsApi.list().catch(() => []),
          usersApi.list().catch(() => []),
          personsApi.list({ page: 0, size: 1000 }).catch(() => ({ content: [] })),
        ]);

        // For pre-sales users: filter organizations to only those owned by their sales manager
        let orgList = orgListPrimary && orgListPrimary.length > 0 ? orgListPrimary : [];
        
        if (storedUser?.userId && userList && userList.length > 0) {
          const currentUser = userList.find((u: any) => u.id === storedUser.userId);
          if (currentUser) {
            const userRole = (currentUser.role || '').toUpperCase();
            const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
            const isPresales = presalesRoleCodes.includes(userRole);
            
            if (isPresales && currentUser.managerId) {
              const allOrgs = await organizationsApi.list().catch(() => []);
              orgList = allOrgs.filter((org) => org.owner && org.owner.id === currentUser.managerId);
            } else if (orgList.length === 0) {
              orgList = await organizationsApi.list().catch(() => []);
            }
          } else if (orgList.length === 0) {
            orgList = await organizationsApi.list().catch(() => []);
          }
        } else if (orgList.length === 0) {
          orgList = await organizationsApi.list().catch(() => []);
        }

        setDeals(dealsList || []);
        setOrganizations(orgList || []);
        setPipelines(pipelineList || []);
        setTeams(teamsList || []);
        setAllUsers(userList || []);
        setPersons(personsPage.content || []);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error('Failed to load deal duration report data', err);
        setError('Unable to load data right now. Please try again.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => controller.abort();
  }, []);

  // Calculate date range
  const dateRange = useMemo(() => {
    if (!dateFrom || !dateTo) {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return { from: start, to: end };
    }

    // Parse DD/MM/YYYY format
    const parseDate = (dateStr: string): Date | null => {
      const parts = dateStr.split('/');
      if (parts.length !== 3) return null;
      const [dd, mm, yyyy] = parts.map(Number);
      if (Number.isNaN(dd) || Number.isNaN(mm) || Number.isNaN(yyyy)) return null;
      return new Date(yyyy, mm - 1, dd);
    };

    const from = parseDate(dateFrom) || new Date();
    const to = parseDate(dateTo) || new Date();
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }, [dateFrom, dateTo]);

  // Accessible organizations set (for pre-sales users)
  const accessibleOrgSet = useMemo(() => new Set(organizations.map((o) => o.id)), [organizations]);

  // Check if current user is pre-sales
  const isPresalesUser = useMemo(() => {
    if (!storedUser?.userId || !allUsers.length) return false;
    const currentUser = allUsers.find((u: any) => u.id === storedUser.userId);
    if (!currentUser) return false;
    const userRole = (currentUser.role || '').toUpperCase();
    const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
    return presalesRoleCodes.includes(userRole);
  }, [allUsers, storedUser]);

  // For pre-sales users: find accessible pipeline IDs
  const accessiblePipelineIds = useMemo(() => {
    if (!storedUser?.userId || !allUsers.length || !pipelines.length) {
      return new Set<number>();
    }

    const currentUser = allUsers.find((u: any) => u.id === storedUser.userId);
    if (!currentUser) return new Set<number>();

    const userRole = (currentUser.role || '').toUpperCase();
    const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
    const isPresales = presalesRoleCodes.includes(userRole);

    if (!isPresales) {
      return new Set<number>();
    }

    const relevantPipelineIds: number[] = [];

    // Method 1: Find pipelines through teams
    if (teams.length > 0) {
      const relevantTeamIds = new Set<number>();

      const teamsAsMember = teams.filter((team) => 
        team.members.some((member) => member.id === currentUser.id)
      );
      teamsAsMember.forEach((team) => relevantTeamIds.add(team.id));

      if (currentUser.managerId) {
        const salesManagerId = currentUser.managerId;
        const teamsAsManager = teams.filter((team) => team.manager?.id === salesManagerId);
        teamsAsManager.forEach((team) => relevantTeamIds.add(team.id));
      }

      pipelines
        .filter((pipeline) => pipeline.teamId && relevantTeamIds.has(pipeline.teamId))
        .forEach((pipeline) => relevantPipelineIds.push(pipeline.id));
    }

    // Method 2: Find pipelines linked to accessible organizations
    if (currentUser.managerId && organizations.length > 0) {
      const salesManagerId = currentUser.managerId;
      const accessibleOrgIds = new Set(
        organizations
          .filter((org) => org.owner && org.owner.id === salesManagerId)
          .map((org) => org.id)
      );

      pipelines
        .filter((pipeline) => pipeline.organization?.id && accessibleOrgIds.has(pipeline.organization.id))
        .forEach((pipeline) => relevantPipelineIds.push(pipeline.id));
    }

    return new Set(relevantPipelineIds);
  }, [allUsers, teams, pipelines, organizations, storedUser]);

  // Filter deals - align with PreSalesDashboard and other deal reports
  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      const created = parseIsoDate(deal.createdAt);
      const inRange = isWithinRange(created, dateRange.from, dateRange.to);

      let pipelineAllowed: boolean;
      if (accessiblePipelineIds.size === 0) {
        if (isPresalesUser && accessibleOrgSet.size > 0) {
          pipelineAllowed = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;
        } else {
          pipelineAllowed = true;
        }
      } else {
        const pipelineInAccessible = deal.pipelineId ? accessiblePipelineIds.has(deal.pipelineId) : false;
        const orgInAccessible = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;
        pipelineAllowed = pipelineInAccessible || (orgInAccessible && accessibleOrgSet.size > 0);
      }

      const orgFilterOk =
        selectedOrgIds.length === 0 || (deal.organizationId ? selectedOrgIds.includes(deal.organizationId) : false);

      return inRange && pipelineAllowed && orgFilterOk;
    });
  }, [accessiblePipelineIds, isPresalesUser, deals, dateRange, selectedOrgIds, accessibleOrgSet]);

  // Calculate total deal value for ALL deals
  const totalDealValue = useMemo(() => {
    return filteredDeals.reduce((sum, deal) => sum + (deal.value || 0), 0);
  }, [filteredDeals]);

  // Calculate average deal duration:
  // - From deal creation (first stage) until it is WON / LOST (using updatedAt)
  // - For in‑progress deals, from creation until the end of the selected date range (or today, whichever is earlier)
  // - Only computed when the selected date range covers at least 7 days (one week)
  const averageDealDuration = useMemo(() => {
    if (!filteredDeals.length) return 0;

    // Enforce a minimum window of 7 days for a meaningful average
    const diffMs = dateRange.to.getTime() - dateRange.from.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays < 7) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveRangeEnd = dateRange.to < today ? dateRange.to : today;

    const durations: number[] = [];

    filteredDeals.forEach((deal) => {
      const createdDate = parseIsoDate(deal.createdAt);
      if (!createdDate) return;

      let endDate: Date | null = null;

      // If the deal is already closed (won / lost), use its last update as the end of the journey.
      if (deal.status === 'WON' || deal.status === 'LOST') {
        endDate = parseIsoDate(deal.updatedAt) || effectiveRangeEnd;
      } else {
        // Still in pipeline – measure until the end of the selected window.
        endDate = effectiveRangeEnd;
      }

      const durationMs = endDate.getTime() - createdDate.getTime();
      const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
      if (durationDays >= 0) {
        durations.push(durationDays);
      }
    });

    if (durations.length === 0) return 0;
    const sum = durations.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / durations.length);
  }, [filteredDeals, dateRange]);

  const filteredOrgs = useMemo(() => {
    if (!orgSearch.trim()) return organizations;
    const q = orgSearch.toLowerCase();
    return organizations.filter((o) => (o.name || '').toLowerCase().includes(q));
  }, [organizations, orgSearch]);

  const toggleOrgSelection = (id: number) => {
    setSelectedOrgIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as Node;
      if (orgMenuRef.current && !orgMenuRef.current.contains(target)) {
        setOrgMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, []);

  const formatDateForInput = (dateStr: string): string => {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return dateStr;
  };

  const formatDateForDisplay = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      return `${dd}/${mm}/${yyyy}`;
    }
    return dateStr;
  };

  const handleDateFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      setDateFrom(formatDateForDisplay(value));
    } else {
      setDateFrom('');
    }
  };

  const handleDateToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      setDateTo(formatDateForDisplay(value));
    } else {
      setDateTo('');
    }
  };

  // Get person Instagram ID
  const getPersonInstagramId = (personId?: number | null): string => {
    if (!personId) return '-';
    const person = persons.find((p) => p.id === personId);
    return person?.instagramId || '-';
  };

  // Get organization name
  const getOrganizationName = (orgId?: number | null): string => {
    if (!orgId) return '-';
    const org = organizations.find((o) => o.id === orgId);
    return org?.name || '-';
  };

  if (loading) {
    return (
      <div className="deal-source-report-page">
        <div className="deal-source-report-loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="deal-source-report-page">
        <div className="deal-source-report-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="deal-source-report-page">
      <header className="deal-source-report-header">
        <h1 style={{ color: '#15803D' }}>Deal Duration Report</h1>
      </header>

      {/* Filters Section */}
      <div className="deal-source-filters">
        <div className="deal-source-filter-row">
          <div className="deal-source-filter-group">
            <label>Date Range:</label>
            <div className="deal-source-date-inputs">
              <input
                type="date"
                value={dateFrom ? formatDateForInput(dateFrom) : ''}
                onChange={handleDateFromChange}
                className="deal-source-date-input"
              />
              <span>to</span>
              <input
                type="date"
                value={dateTo ? formatDateForInput(dateTo) : ''}
                onChange={handleDateToChange}
                className="deal-source-date-input"
              />
            </div>
          </div>

          <div className="deal-source-filter-group" ref={orgMenuRef}>
            <label>Organization:</label>
            <button
              type="button"
              className="deal-source-org-button"
              onClick={() => setOrgMenuOpen(!orgMenuOpen)}
            >
              {selectedOrgIds.length === 0
                ? 'All Organizations'
                : `${selectedOrgIds.length} selected`}
              <span className="caret">▾</span>
            </button>
            {orgMenuOpen && (
              <div className="deal-source-org-menu">
                <div className="deal-source-org-menu-header">
                  <span>All Organizations</span>
                  {selectedOrgIds.length > 0 && (
                    <button type="button" onClick={() => setSelectedOrgIds([])}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="deal-source-org-menu-list">
                  <input
                    type="text"
                    className="deal-source-org-search"
                    placeholder="Search organizations"
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    className={`deal-source-org-option${selectedOrgIds.length === 0 ? ' selected' : ''}`}
                    onClick={() => setSelectedOrgIds([])}
                  >
                    All Organizations
                  </button>
                  {filteredOrgs.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      className={`deal-source-org-option${selectedOrgIds.includes(org.id) ? ' selected' : ''}`}
                      onClick={() => toggleOrgSelection(org.id)}
                    >
                      {org.name || `Org #${org.id}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Average Duration Widget Section */}
      <div style={{ marginTop: '32px', marginBottom: '40px' }}>
        <DealDurationWidget
          averageDuration={averageDealDuration}
          totalDealValue={totalDealValue}
        />
      </div>

      {/* Deal Summary Table */}
      <div className="deal-source-table-section">
        <h2 className="deal-source-table-title">Deal Summary</h2>
        <div className="deal-source-table-wrapper">
          <table className="deal-source-table">
            <thead>
              <tr className="deal-source-table-header-row">
                <th className="deal-source-table-header">Deal Name</th>
                <th className="deal-source-table-header">Instagram ID</th>
                <th className="deal-source-table-header">Deal Value</th>
                <th className="deal-source-table-header">Organization</th>
                <th className="deal-source-table-header">Wedding Date</th>
                <th className="deal-source-table-header">Wedding Venue</th>
                <th className="deal-source-table-header">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="deal-source-table-empty">
                    No deals found
                  </td>
                </tr>
              ) : (
                filteredDeals.map((deal) => (
                  <tr key={deal.id} className="deal-source-table-row">
                    <td className="deal-source-table-cell">{deal.name || '-'}</td>
                    <td className="deal-source-table-cell">{getPersonInstagramId(deal.personId)}</td>
                    <td className="deal-source-table-cell">{formatCurrency(deal.value || 0)}</td>
                    <td className="deal-source-table-cell">{getOrganizationName(deal.organizationId)}</td>
                    <td className="deal-source-table-cell">{formatDate(deal.eventDate)}</td>
                    <td className="deal-source-table-cell">{deal.venue || '-'}</td>
                    <td className="deal-source-table-cell">
                      {deal.status === 'WON' ? (
                        <span className="deal-status-badge deal-status-won">Won</span>
                      ) : deal.status === 'LOST' ? (
                        <span className="deal-status-badge deal-status-lost">Lost</span>
                      ) : (
                        <span className="deal-status-badge deal-status-open">Open</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

