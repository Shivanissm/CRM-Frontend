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

type PieSlice = { key: string; label: string; value: number; color: string };
type ChartView = 'pie' | 'vertical' | 'horizontal';

const chartPalette = ['#2563eb', '#48D1CC', '#f59e0b', '#a855f7', '#ec4899', '#0ea5e9', '#14b8a6', '#f97316'];

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

const formatCount = (value: number): string => value.toLocaleString();

const buildNiceTicks = (maxValue: number): number[] => {
  if (!maxValue || maxValue <= 0) return [0, 100];
  const niceMax = Math.max(100, Math.ceil(maxValue / 100) * 100);
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax; v += 100) {
    ticks.push(v);
  }
  return ticks;
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

export default function DealLostReasonReport() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);

  // Filters
  const [selectedReason, setSelectedReason] = useState<string[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [chartView, setChartView] = useState<ChartView>('vertical');
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const orgMenuRef = useRef<HTMLDivElement | null>(null);
  const [orgSearch, setOrgSearch] = useState('');
  const [reasonMenuOpen, setReasonMenuOpen] = useState(false);
  const reasonMenuRef = useRef<HTMLDivElement | null>(null);
  const [reasonSearch, setReasonSearch] = useState('');

  const storedUser = getStoredUser();

  // Initialize date range from URL params or default to current year
  useEffect(() => {
    const fromParam = searchParams.get('dateFrom');
    const toParam = searchParams.get('dateTo');
    const reasonParam = searchParams.get('reason');
    const orgParam = searchParams.get('organizationId');

    if (fromParam) setDateFrom(fromParam);
    if (toParam) setDateTo(toParam);
    if (reasonParam) {
      const reasons = reasonParam.split(',').map(s => s.trim()).filter(s => s);
      setSelectedReason(reasons);
    }
    if (orgParam) {
      const orgIds = orgParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      setSelectedOrgIds(orgIds);
    }

    // Initialize dates to current year if not provided
    if (!fromParam || !toParam) {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      const formatDate = (date: Date): string => {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      };
      if (!fromParam) setDateFrom(formatDate(start));
      if (!toParam) setDateTo(formatDate(end));
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
          pipelinesApi.list().catch(() => []),
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
              // Pre-sales user: only show organizations owned by their sales manager
              const allOrgs = await organizationsApi.list().catch(() => []);
              orgList = allOrgs.filter((org) => org.owner && org.owner.id === currentUser.managerId);
            } else if (orgList.length === 0) {
              // Fallback: if accessible orgs is empty (role mismatch), try full list
              orgList = await organizationsApi.list().catch(() => []);
            }
          } else if (orgList.length === 0) {
            // Fallback: if accessible orgs is empty, try full list
            orgList = await organizationsApi.list().catch(() => []);
          }
        } else if (orgList.length === 0) {
          // Fallback: if accessible orgs is empty, try full list
          orgList = await organizationsApi.list().catch(() => []);
        }

        setDeals(dealsList || []);
        setOrganizations(orgList || []);
        setPipelines(pipelineList || []);
        setTeams(teamsList || []);
        setAllUsers(userList || []);
        setUsers(
          (userList || []).map((u: any) => {
            const baseName =
              `${(u.firstName || '').trim()} ${(u.lastName || '').trim()}`.trim() || u.email || `User #${u.id}`;
            const name = storedUser?.userId === u.id ? `${baseName} - me` : baseName;
            return { id: u.id, name };
          }),
        );
        setPersons(personsPage.content || []);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.error('Failed to load deal lost reason report data', err);
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
      // Default to current year
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
    const storedUser = getStoredUser();
    if (!storedUser?.userId || !allUsers.length) return false;
    const currentUser = allUsers.find((u: any) => u.id === storedUser.userId);
    if (!currentUser) return false;
    const userRole = (currentUser.role || '').toUpperCase();
    const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
    return presalesRoleCodes.includes(userRole);
  }, [allUsers]);

  // For pre-sales users: find accessible pipeline IDs based on:
  // 1. Teams managed by their sales manager or teams they are members of
  // 2. Pipelines linked to accessible organizations (owned by sales manager)
  const accessiblePipelineIds = useMemo(() => {
    const storedUser = getStoredUser();
    if (!storedUser?.userId || !allUsers.length || !pipelines.length) {
      return new Set<number>(); // Return empty set if data not ready
    }

    const currentUser = allUsers.find((u: any) => u.id === storedUser.userId);
    if (!currentUser) return new Set<number>();

    const userRole = (currentUser.role || '').toUpperCase();
    const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
    const isPresales = presalesRoleCodes.includes(userRole);

    if (!isPresales) {
      // Not a pre-sales user, return empty set (will show all deals if no restrictions)
      return new Set<number>();
    }

    const relevantPipelineIds: number[] = [];

    // Method 1: Find pipelines through teams
    if (teams.length > 0) {
      const relevantTeamIds = new Set<number>();

      // Find teams where the pre-sales user is a member
      const teamsAsMember = teams.filter((team) => 
        team.members.some((member) => member.id === currentUser.id)
      );
      teamsAsMember.forEach((team) => relevantTeamIds.add(team.id));

      // Also find teams where the sales manager (pre-sales user's manager) is the team manager
      if (currentUser.managerId) {
        const salesManagerId = currentUser.managerId;
        const teamsAsManager = teams.filter((team) => team.manager?.id === salesManagerId);
        teamsAsManager.forEach((team) => relevantTeamIds.add(team.id));
      }

      // Find pipelines linked to those teams
      pipelines
        .filter((pipeline) => pipeline.teamId && relevantTeamIds.has(pipeline.teamId))
        .forEach((pipeline) => relevantPipelineIds.push(pipeline.id));
    }

    // Method 2: Find pipelines linked to accessible organizations (owned by sales manager)
    if (currentUser.managerId && organizations.length > 0) {
      const salesManagerId = currentUser.managerId;
      const accessibleOrgIds = new Set(
        organizations
          .filter((org) => org.owner && org.owner.id === salesManagerId)
          .map((org) => org.id)
      );

      // Find pipelines linked to those organizations
      pipelines
        .filter((pipeline) => pipeline.organization?.id && accessibleOrgIds.has(pipeline.organization.id))
        .forEach((pipeline) => relevantPipelineIds.push(pipeline.id));
    }

    return new Set(relevantPipelineIds);
  }, [allUsers, teams, pipelines, organizations]);

  // Filter deals for table - only show LOST deals with date range - using same logic as PreSalesDashboard
  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      // Only show lost deals
      if (deal.status !== 'LOST') return false;

      const created = parseIsoDate(deal.createdAt);
      const inRange = isWithinRange(created, dateRange.from, dateRange.to);
      
      // For pre-sales users: filter by pipeline ID or organization ID
      // If accessiblePipelineIds is empty and user is pre-sales, don't show any deals (data not ready or no access)
      // If accessiblePipelineIds is empty and user is NOT pre-sales, allow all deals
      // Otherwise, include deals from accessible pipelines OR deals from accessible organizations (as fallback)
      let pipelineAllowed: boolean;
      if (accessiblePipelineIds.size === 0) {
        pipelineAllowed = !isPresalesUser; // If no pipelines found and user is pre-sales, exclude all; if not pre-sales, allow all
      } else {
        // Check if deal's pipeline is in accessible pipelines
        const pipelineInAccessible = deal.pipelineId ? accessiblePipelineIds.has(deal.pipelineId) : false;
        
        // Fallback: if pipeline not found but deal belongs to accessible organization, allow it
        // This handles cases where pipeline might not be properly linked but organization is accessible
        const orgInAccessible = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;
        
        pipelineAllowed = pipelineInAccessible || (orgInAccessible && accessibleOrgSet.size > 0);
      }
      
      // Also check organization filter if selected (for additional filtering)
      const orgFilterOk =
        selectedOrgIds.length === 0 || (deal.organizationId ? selectedOrgIds.includes(deal.organizationId) : false);

      // Reason filter
      const reason = (deal.lostReason || 'Not available').trim() || 'Not available';
      const reasonMatch = selectedReason.length === 0 || selectedReason.includes(reason);

      return inRange && pipelineAllowed && orgFilterOk && reasonMatch;
    });
  }, [accessiblePipelineIds, isPresalesUser, deals, dateRange, selectedOrgIds, selectedReason, accessibleOrgSet]);

  // Filter deals for pie chart - ignore date range (like dashboard) but respect organization and reason filters
  // Using same pipeline-based filtering logic as PreSalesDashboard
  const lostReasonDealsForChart = useMemo(() => {
    return deals.filter((deal) => {
      // Only show lost deals
      if (deal.status !== 'LOST') return false;

      // For pre-sales users: filter by pipeline ID or organization ID
      // If accessiblePipelineIds is empty and user is pre-sales, don't show any deals (data not ready or no access)
      // If accessiblePipelineIds is empty and user is NOT pre-sales, allow all deals
      // Otherwise, include deals from accessible pipelines OR deals from accessible organizations (as fallback)
      let pipelineAllowed: boolean;
      if (accessiblePipelineIds.size === 0) {
        pipelineAllowed = !isPresalesUser; // If no pipelines found and user is pre-sales, exclude all; if not pre-sales, allow all
      } else {
        // Check if deal's pipeline is in accessible pipelines
        const pipelineInAccessible = deal.pipelineId ? accessiblePipelineIds.has(deal.pipelineId) : false;
        
        // Fallback: if pipeline not found but deal belongs to accessible organization, allow it
        // This handles cases where pipeline might not be properly linked but organization is accessible
        const orgInAccessible = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;
        
        pipelineAllowed = pipelineInAccessible || (orgInAccessible && accessibleOrgSet.size > 0);
      }
      
      // Also check organization filter if selected (for additional filtering)
      const orgFilterOk =
        selectedOrgIds.length === 0 || (deal.organizationId ? selectedOrgIds.includes(deal.organizationId) : false);

      // Reason filter
      const reason = (deal.lostReason || 'Not available').trim() || 'Not available';
      const reasonMatch = selectedReason.length === 0 || selectedReason.includes(reason);

      return pipelineAllowed && orgFilterOk && reasonMatch;
    });
  }, [accessiblePipelineIds, isPresalesUser, deals, selectedOrgIds, selectedReason, accessibleOrgSet]);

  // Build chart data - always show all 7 lost reasons (normalized labels)
  const lostReasonCategories: { key: string; label: string }[] = useMemo(() => {
    const reasons = [
      'Slot Not Open',
      'Not Interested',
      'Date Postponed',
      'Not Available',
      'Ghosted',
      'Budget Issue',
      'Booked Someone Else',
    ];
    return reasons.map((reason) => ({ key: reason, label: reason }));
  }, []);

  // For simple bar chart, we don't need organization breakdown - just total counts per category
  // Use lostReasonDealsForChart (ignores date range) to match pie chart behavior
  const simpleBarData = useMemo(() => {
    const counts: Record<string, number> = {};
    // If specific reasons are selected, only show those reasons
    const categoriesToShow = selectedReason.length > 0
      ? lostReasonCategories.filter(cat => selectedReason.includes(cat.key))
      : lostReasonCategories;
    
    categoriesToShow.forEach((cat) => {
      counts[cat.key] = lostReasonDealsForChart.filter((deal) => {
        const reason = (deal.lostReason || 'Not available').trim() || 'Not available';
        return reason === cat.key;
      }).length;
    });
    return counts;
  }, [lostReasonCategories, lostReasonDealsForChart, selectedReason]);

  // Build chart data - lost reasons for pie chart (ignore date range like dashboard)
  const lostReasonSlices: PieSlice[] = useMemo(() => {
    const counts = new Map<string, number>();
    lostReasonDealsForChart.forEach((deal) => {
      const raw = (deal.lostReason || 'Not available').trim() || 'Not available';
      const reason = raw;
      counts.set(reason, (counts.get(reason) || 0) + 1);
    });
    if (counts.size === 0) return [];
    const colorByReason: Record<string, string> = {
      'Slot Not Open': '#6B8FA3', // Steel Blue
      'Not Interested': '#C97A7A', // Muted Rose
      'Date Postponed': '#A6A0C4', // Soft Lavender Grey
      'Not Available': '#8A9BA8', // Cool Slate
      Ghosted: '#9E9E9E', // Smoky Grey
      'Budget Issue': '#C9A44C', // Dusty Mustard
      'Booked Someone Else': '#B66A5E', // Muted Brick
    };
    return Array.from(counts.entries()).map(([reason, value]) => ({
      key: reason,
      label: reason,
      value,
      color: colorByReason[reason] || '#cbd5e1',
    }));
  }, [lostReasonDealsForChart]);

  const barColorByReason: Record<string, string> = {
    'Slot Not Open': '#6B8FA3',
    'Not Interested': '#C97A7A',
    'Date Postponed': '#A6A0C4',
    'Not Available': '#8A9BA8',
    Ghosted: '#9E9E9E',
    'Budget Issue': '#C9A44C',
    'Booked Someone Else': '#B66A5E',
  };

  const orgEntries = useMemo(() => {
    const entries = new Map<number, string>();
    organizations.forEach((org) => entries.set(org.id, org.name || 'Untitled org'));
    filteredDeals.forEach((deal) => {
      if (deal.organizationId && !entries.has(deal.organizationId)) {
        const org = organizations.find((o) => o.id === deal.organizationId);
        if (org) entries.set(deal.organizationId, org.name || 'Untitled org');
      }
    });
    return Array.from(entries.entries()).map(([id, name]) => ({ id, name }));
  }, [filteredDeals, organizations]);

  const colorByOrg = useMemo(() => {
    const map = new Map<number, string>();
    orgEntries.forEach((entry, idx) => {
      map.set(entry.id, chartPalette[idx % chartPalette.length]);
    });
    return map;
  }, [orgEntries]);

  const totals = useMemo(
    () =>
      lostReasonCategories.map((cat) => simpleBarData[cat.key] || 0),
    [lostReasonCategories, simpleBarData],
  );

  // Determine date range type and set fixed max height based on range
  const getMaxHeightForDateRange = useMemo(() => {
    if (!dateFrom || !dateTo) return 100; // Default to year (100)
    
    const parseDate = (dateStr: string): Date | null => {
      const parts = dateStr.split('/');
      if (parts.length !== 3) return null;
      const [dd, mm, yyyy] = parts.map(Number);
      if (Number.isNaN(dd) || Number.isNaN(mm) || Number.isNaN(yyyy)) return null;
      return new Date(yyyy, mm - 1, dd);
    };

    const from = parseDate(dateFrom);
    const to = parseDate(dateTo);
    if (!from || !to) return 100;

    const diffTime = to.getTime() - from.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days

    // Determine range type
    if (diffDays === 1) {
      return 5; // Today
    } else if (diffDays <= 7) {
      return 10; // This week
    } else if (diffDays <= 31) {
      return 50; // Month
    } else {
      return 100; // Year or longer
    }
  }, [dateFrom, dateTo]);

  // Calculate maxTotal - use fixed max based on date range, but ensure it's at least the actual max value
  const actualMaxTotal = totals.length > 0 ? Math.max(...totals) : 0;
  const maxTotal = Math.max(actualMaxTotal, getMaxHeightForDateRange);
  const ticks = useMemo(() => buildNiceTicks(maxTotal), [maxTotal]);
  const gridTicks = useMemo(() => ticks.filter((t) => t > 0), [ticks]);

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

  const filteredOrgs = useMemo(() => {
    if (!orgSearch.trim()) return organizations;
    const q = orgSearch.toLowerCase();
    return organizations.filter((o) => (o.name || '').toLowerCase().includes(q));
  }, [organizations, orgSearch]);

  const toggleOrgSelection = (id: number) => {
    setSelectedOrgIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleReasonSelection = (reason: string) => {
    setSelectedReason((prev) => (prev.includes(reason) ? prev.filter((v) => v !== reason) : [...prev, reason]));
  };

  const lostReasonOptions = [
    'Slot not opened',
    'Not Interested',
    'Date postponed',
    'Not Available',
    'Ghosted',
    'Budget',
    'Booked Someone else',
  ];

  const filteredReasons = useMemo(() => {
    if (!reasonSearch.trim()) return lostReasonOptions;
    const q = reasonSearch.toLowerCase();
    return lostReasonOptions.filter((r) => r.toLowerCase().includes(q));
  }, [reasonSearch]);

  const reasonLabel = useMemo(() => {
    if (selectedReason.length === 0) return 'All Lost Reasons';
    return selectedReason.join(', ');
  }, [selectedReason]);

  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as Node;
      if (orgMenuRef.current && !orgMenuRef.current.contains(target)) {
        setOrgMenuOpen(false);
      }
      if (reasonMenuRef.current && !reasonMenuRef.current.contains(target)) {
        setReasonMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, []);

  const formatDateForInput = (dateStr: string): string => {
    // Convert DD/MM/YYYY to YYYY-MM-DD for input
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return dateStr;
  };

  const formatDateForDisplay = (dateStr: string): string => {
    // Convert YYYY-MM-DD to DD/MM/YYYY for display
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
        <h1 style={{ color: '#15803D' }}>Deal Lost by Reason Report</h1>
      </header>

      {/* Filters Section */}
      <div className="deal-source-filters">
        <div className="deal-source-filter-row">
          <div className="deal-source-filter-group" ref={reasonMenuRef}>
            <label>Lost Reason:</label>
            <button
              type="button"
              className="deal-source-org-button"
              onClick={() => setReasonMenuOpen((v) => !v)}
            >
              {reasonLabel}
              <span className="caret">▾</span>
            </button>
            {reasonMenuOpen && (
              <div className="deal-source-org-menu">
                <div className="deal-source-org-menu-header">
                  <span>All Lost Reasons</span>
                  {selectedReason.length > 0 && (
                    <button type="button" onClick={() => setSelectedReason([])}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="deal-source-org-menu-list">
                  <input
                    type="text"
                    className="deal-source-org-search"
                    placeholder="Search reasons"
                    value={reasonSearch}
                    onChange={(e) => setReasonSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    className={`deal-source-org-option${selectedReason.length === 0 ? ' selected' : ''}`}
                    onClick={() => setSelectedReason([])}
                  >
                    All Lost Reasons
                  </button>
                  {filteredReasons.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      className={`deal-source-org-option${selectedReason.includes(reason) ? ' selected' : ''}`}
                      onClick={() => toggleReasonSelection(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

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

        {/* Organization Dots */}
        {selectedOrgIds.length > 0 && (
          <div className="deal-source-org-dots">
            {selectedOrgIds.map((orgId) => {
              const org = organizations.find((o) => o.id === orgId);
              const color = colorByOrg.get(orgId) || '#2563eb';
              return (
                <div key={orgId} className="deal-source-org-dot">
                  <div className="deal-source-org-dot-color" style={{ backgroundColor: color }} />
                  <span>{org?.name || `Org #${orgId}`}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart Section */}
      <div className="deal-source-chart-section">
        <div className="deal-source-chart-header">
          <h2>Deal Lost by Reason Distribution</h2>
          <div className="deal-source-chart-views">
            <button
              type="button"
              className={`deal-source-view-btn${chartView === 'pie' ? ' active' : ''}`}
              onClick={() => setChartView('pie')}
              title="Pie Chart"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
                <path d="M10 2 L10 10 L18 10 A8 8 0 0 0 10 2 Z" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className={`deal-source-view-btn${chartView === 'vertical' ? ' active' : ''}`}
              onClick={() => setChartView('vertical')}
              title="Vertical Bar Chart"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="8" width="3" height="8" fill="currentColor" />
                <rect x="8" y="5" width="3" height="11" fill="currentColor" />
                <rect x="13" y="2" width="3" height="14" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className={`deal-source-view-btn${chartView === 'horizontal' ? ' active' : ''}`}
              onClick={() => setChartView('horizontal')}
              title="Horizontal Bar Chart"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="3" width="8" height="3" fill="currentColor" />
                <rect x="2" y="8" width="11" height="3" fill="currentColor" />
                <rect x="2" y="13" width="14" height="3" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        <div className="deal-source-chart-container">
          {chartView === 'pie' ? (
            <div className="deal-source-pie-chart">
              <div className="deal-source-pie-visual">
                {(() => {
                  const total = lostReasonSlices.reduce((sum, slice) => sum + slice.value, 0);
                  if (total === 0) {
                    return <div className="deal-source-pie-empty">No lost deals found</div>;
                  }
                  let current = 0;
                  const parts: string[] = [];
                  lostReasonSlices.forEach((slice) => {
                    const angle = (slice.value / total) * 360;
                    const next = current + angle;
                    // Highlight selected slice with darker color
                    const color = selectedReason.length > 0 && selectedReason.includes(slice.key)
                      ? '#64748b' 
                      : slice.color;
                    parts.push(`${color} ${current}deg ${next}deg`);
                    current = next;
                  });
                  const gradient = `conic-gradient(${parts.join(', ')})`;
                  return (
                    <div 
                      className="deal-source-pie-circle" 
                      style={{ 
                        backgroundImage: gradient,
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        // Clicking on pie chart resets filter
                        if (selectedReason.length > 0) {
                          setSelectedReason([]);
                        }
                      }}
                      title="Click to show all reasons"
                    />
                  );
                })()}
              </div>
              <div className="deal-source-pie-legend">
                {lostReasonSlices.map((slice) => {
                  const total = lostReasonSlices.reduce((sum, s) => sum + s.value, 0);
                  const percent = total ? Math.round((slice.value / total) * 100) : 0;
                  const isSelected = selectedReason.includes(slice.key);
                  return (
                    <div 
                      key={slice.key} 
                      className="deal-source-pie-legend-item"
                      style={{ 
                        cursor: 'pointer',
                        opacity: selectedReason.length > 0 && !isSelected ? 0.4 : 1
                      }}
                      onClick={() => {
                        toggleReasonSelection(slice.key);
                      }}
                      title={`${slice.label}: ${slice.value} (${percent}%) - Click to filter`}
                    >
                      <div 
                        className="deal-source-pie-legend-dot" 
                        style={{ 
                          backgroundColor: slice.color,
                          border: isSelected ? '2px solid #2563eb' : 'none'
                        }} 
                      />
                      <div className="deal-source-pie-legend-content">
                        <div className="deal-source-pie-legend-label">{slice.label}</div>
                        <div className="deal-source-pie-legend-value">{slice.value} ({percent}%)</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : chartView === 'horizontal' ? (
            <div className="deal-source-horizontal-chart">
              <div className="deal-source-horizontal-bars">
                {(selectedReason.length > 0
                  ? lostReasonCategories.filter(cat => selectedReason.includes(cat.key))
                  : lostReasonCategories
                ).map((cat) => {
                  const totalForCat = simpleBarData[cat.key] || 0;
                  // Use the same maxTotal calculation as vertical chart (based on date range)
                  // Calculate proportional width based on maxTotal
                  const width = maxTotal > 0 && totalForCat > 0
                    ? (totalForCat / maxTotal) * 100
                    : 0;
                  const isSelected = selectedReason.includes(cat.key);
                  const shouldShowBar = totalForCat > 0 && maxTotal > 0;
                  return (
                    <div key={cat.key} className="deal-source-horizontal-bar-row">
                      <div className="deal-source-horizontal-bar-label">{cat.label}</div>
                      <div className="deal-source-horizontal-bar-container">
                        {shouldShowBar ? (
                          <div 
                            className="deal-source-horizontal-bar-simple" 
                            style={{ 
                              width: `${width}%`,
                              backgroundColor: barColorByReason[cat.key] || (isSelected ? '#94a3b8' : '#cbd5e1'),
                              cursor: 'pointer'
                            }}
                            title={`${cat.label}: ${formatCount(totalForCat)} - Click to filter`}
                            onClick={() => {
                              toggleReasonSelection(cat.key);
                            }}
                          />
                        ) : null}
                        <div className="deal-source-horizontal-bar-value">{formatCount(totalForCat)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="deal-source-vertical-chart">
              <div className="deal-source-chart-wrapper">
                <div className="deal-source-y-axis">
                  <div className="deal-source-y-axis-label"></div>
                  <div className="deal-source-y-axis-ticks">
                    {ticks.map((tick) => (
                      <div key={tick} className="deal-source-y-axis-tick">
                        <span></span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="deal-source-chart-area">
                  <div className="deal-source-chart-plot">
                    <div className="deal-source-chart-grid">
                      {gridTicks.map((tick) => (
                        <div key={tick} className="deal-source-chart-grid-line" />
                      ))}
                    </div>
                    <div className="deal-source-chart-bars">
                      {(selectedReason.length > 0
                        ? lostReasonCategories.filter(cat => selectedReason.includes(cat.key))
                        : lostReasonCategories
                      ).map((cat) => {
                        const totalForCat = simpleBarData[cat.key] || 0;
                        const isSelected = selectedReason.includes(cat.key);
                        const shouldShowBar = totalForCat > 0 && maxTotal > 0;
                        const totalHeight = shouldShowBar
                          ? (totalForCat / maxTotal) * 100
                          : 0;
                        return (
                        <div key={cat.key} className="deal-source-chart-bar">
                          {shouldShowBar ? (
                            <div 
                              className="deal-source-chart-bar-simple" 
                              style={{ 
                                height: `${totalHeight}%`,
                                backgroundColor: barColorByReason[cat.key] || (isSelected ? '#94a3b8' : '#cbd5e1'),
                                cursor: 'pointer'
                              }}
                              title={`${cat.label}: ${formatCount(totalForCat)} - Click to filter`}
                              onClick={() => {
                                toggleReasonSelection(cat.key);
                              }}
                            />
                          ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="deal-source-chart-x-axis">
                      <div className="deal-source-chart-x-axis-line" />
                    </div>
                  </div>
                  <div className="deal-source-chart-labels">
                    {(selectedReason.length > 0
                      ? lostReasonCategories.filter(cat => selectedReason.includes(cat.key))
                      : lostReasonCategories
                    ).map((cat) => {
                      const totalForCat = simpleBarData[cat.key] || 0;
                      const isSelected = selectedReason.includes(cat.key);
                      return (
                        <div 
                          key={cat.key} 
                          className="deal-source-chart-label"
                          style={{ 
                            cursor: 'pointer',
                            opacity: selectedReason.length > 0 && !isSelected ? 0.4 : 1
                          }}
                          onClick={() => {
                            toggleReasonSelection(cat.key);
                          }}
                          title={`${cat.label}: ${formatCount(totalForCat)} - Click to filter`}
                        >
                          <span className="deal-source-chart-label-text">{cat.label}</span>
                          <span className="deal-source-chart-label-count">{formatCount(totalForCat)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
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
                <th className="deal-source-table-header">Lost Reason</th>
                <th className="deal-source-table-header">Organization</th>
                <th className="deal-source-table-header">Wedding Date</th>
                <th className="deal-source-table-header">Wedding Venue</th>
                <th className="deal-source-table-header">Phone</th>
                <th className="deal-source-table-header">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan={9} className="deal-source-table-empty">
                    No deals found
                  </td>
                </tr>
              ) : (
                filteredDeals.map((deal) => (
                  <tr key={deal.id} className="deal-source-table-row">
                    <td className="deal-source-table-cell">{deal.name || '-'}</td>
                    <td className="deal-source-table-cell">{getPersonInstagramId(deal.personId)}</td>
                    <td className="deal-source-table-cell">{formatCurrency(deal.value || 0)}</td>
                    <td className="deal-source-table-cell">{deal.lostReason || 'Not available'}</td>
                    <td className="deal-source-table-cell">{getOrganizationName(deal.organizationId)}</td>
                    <td className="deal-source-table-cell">{formatDate(deal.eventDate)}</td>
                    <td className="deal-source-table-cell">{deal.venue || '-'}</td>
                    <td className="deal-source-table-cell">{deal.phoneNumber || '-'}</td>
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

