import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './TargetUserDetail.css';
import { usersApi } from '../services/users';
import { targetsApi } from '../services/targets';
import type {
  TimePreset,
  TimePresetOption,
  TargetCategory,
  OrganizationSummary,
  SalesUserOrganizationsResponse,
  UserTargetDetailResponse,
  CategoryOption,
  UserDealDetail,
  DealSummary,
} from '../types/target';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CURRENT_DATE = new Date();
const CURRENT_MONTH = CURRENT_DATE.getMonth() + 1;
const CURRENT_YEAR = CURRENT_DATE.getFullYear();

const PRESET_LABELS: Record<TimePreset, string> = {
  THIS_MONTH: 'This month',
  PREVIOUS_MONTH: 'Previous month',
  NEXT_MONTH: 'Next month',
  THIS_QUARTER: 'This quarter',
  HALF_YEAR: 'Half yearly',
  THIS_YEAR: 'This year',
  CUSTOM_MONTH: 'Selected month',
  CUSTOM_RANGE: 'Custom range',
};

interface MonthYear {
  month: number;
  year: number;
}

interface MonthRange {
  start: MonthYear;
  end: MonthYear;
}

const compareMonthYear = (a: MonthYear, b: MonthYear): number => {
  if (a.year === b.year) {
    return a.month - b.month;
  }
  return a.year - b.year;
};

interface PreSalesMonthlyRow {
  month: number;
  year: number;
  monthName: string;
  /**
   * Total won deals for this month (all sources combined).
   */
  totalDeals: number;
  /**
   * Won deals that came specifically from diversion (Divert) source.
   * This is what we treat as "Achieved" against the diversion target.
   */
  totalDivertDeals: number;
  diversionTarget: number;
  incentive: number;
}

interface WonDeal {
  dealId: number;
  dealName: string;
  dealValue: number;
  organization?: string;
  commission?: number;
  source?: string;
  instagramId?: string;
  wonDate?: string;
  weddingDate?: string;
  weddingVenue?: string;
  phone?: string;
  month?: number;
  year?: number;
}

export default function PreSalesTargetUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [userData, setUserData] = useState<UserTargetDetailResponse | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [loadingUser, setLoadingUser] = useState<boolean>(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [selectedTimePreset, setSelectedTimePreset] = useState<TimePreset>('THIS_YEAR');
  const [customMonth, setCustomMonth] = useState<number>(CURRENT_MONTH);
  const [customYear, setCustomYear] = useState<number>(CURRENT_YEAR);
  const [fromMonth, setFromMonth] = useState<number>(1);
  const [fromYear, setFromYear] = useState<number>(CURRENT_YEAR);
  const [toMonth, setToMonth] = useState<number>(12);
  const [toYear, setToYear] = useState<number>(CURRENT_YEAR);
  const [selectedCategory, setSelectedCategory] = useState<TargetCategory | 'all'>('all');
  const [derivedCategory, setDerivedCategory] = useState<TargetCategory | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>([]);
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const orgDropdownRef = useRef<HTMLDivElement | null>(null);
  const [dashboardDeals, setDashboardDeals] = useState<WonDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState<boolean>(false);
  const [dealsError, setDealsError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      if (!userId) return;
      setLoadingUser(true);
      setUserError(null);
      try {
        const user = await usersApi.getUserById(Number(userId));
        const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
        setUserName(name);

        // Load organizations for the linked Sales team.
        // Backend now supports calling this endpoint with either:
        // - SALES user id, or
        // - PRESALES user id (it will resolve the manager internally).
        try {
          const salesOwnerId = user.managerId ?? user.id;
          if (salesOwnerId) {
            const salesOrgs: SalesUserOrganizationsResponse =
              await targetsApi.getSalesUserOrganizations(salesOwnerId);
            const merged = new Map<number, OrganizationSummary>();

            // Helper to merge a list of organizations into the map
            const mergeOrgs = (list?: OrganizationSummary[] | null) => {
              (list || []).forEach((org) => {
                if (org.id && !merged.has(org.id)) {
                  merged.set(org.id, org);
                }
              });
            };

            // 1) organizationsByMonth (existing structure)
            Object.values(salesOrgs.organizationsByMonth || {}).forEach((orgList) => {
              mergeOrgs(orgList);
            });

            // 2) Optional top-level organizations array (newer backend versions)
            //    We access it via "as any" to stay compatible with older typings.
            const anyPayload = salesOrgs as any;
            if (Array.isArray(anyPayload.organizations)) {
              mergeOrgs(anyPayload.organizations as OrganizationSummary[]);
            }

            const orgArray = Array.from(merged.values());
            setOrganizations(orgArray);

            if (orgArray.length > 0) {
              // Business rule: a pre-sales user works under a single Sales
              // context (category + organization). Use the first organization
              // as the primary one so that Goal Details mirrors the Sales
              // person's page.
              const primaryOrg = orgArray[0];
              if (primaryOrg?.name && primaryOrg.name.trim().length > 0) {
                setSelectedOrganizations([primaryOrg.name]);
              }

              // Derive category directly from the primary organization.
              if (primaryOrg?.category) {
                const raw = primaryOrg.category.toUpperCase();
                let cat: TargetCategory | null = null;
                if (raw.includes('PHOTO')) cat = 'PHOTOGRAPHY';
                else if (raw.includes('MAKEUP')) cat = 'MAKEUP';
                else if (raw.includes('PLANNING') || raw.includes('DECOR')) {
                  cat = 'PLANNING_AND_DECOR';
                }

                if (cat) {
                  setDerivedCategory(cat);
                  setSelectedCategory(cat);
                }
              }
            }
          }
        } catch (innerErr) {
          console.error('Failed to load organizations for linked sales user', innerErr);
        }
      } catch (err: any) {
        console.error('Failed to load pre-sales user detail', err);
        setUserError(err?.response?.data?.message || err?.message || 'Failed to load user.');
      } finally {
        setLoadingUser(false);
      }
    };

    const loadUserTargets = async () => {
      if (!userId) return;
      try {
        const data = await targetsApi.getUserTargetDetail(Number(userId), selectedYear);
        setUserData(data);
      } catch (err: any) {
        console.error('Failed to load pre-sales monthly data', err);
        // Keep any existing userError message, but don't override with a generic one if already set
        if (!userError) {
          setUserError(err?.response?.data?.message || err?.message || 'Failed to load monthly data.');
        }
      }
    };

    loadUser();
    loadUserTargets();
  }, [userId, selectedYear]);

  // Prefer the organizations actually used in the target detail response
  // so that the Goal Details section shows the exact organizations for
  // which the pre‑sales target has been set.
  useEffect(() => {
    if (!userData) return;

    const sourceOrgs: OrganizationSummary[] =
      (userData.organizations && userData.organizations.length > 0 && userData.organizations) ||
      (userData.availableOrganizations && userData.availableOrganizations.length > 0 && userData.availableOrganizations) ||
      [];

    if (!sourceOrgs.length) {
      return;
    }

    const activeIds = new Set<number>(
      (userData.organizationIds && userData.organizationIds.length > 0 && userData.organizationIds) ||
        (userData.availableOrganizationIds &&
          userData.availableOrganizationIds.length > 0 &&
          userData.availableOrganizationIds) ||
        [],
    );

    const filteredOrgs =
      activeIds.size > 0 ? sourceOrgs.filter((org) => org.id && activeIds.has(org.id)) : sourceOrgs;

    const names = filteredOrgs
      .map((org) => org.name?.trim())
      .filter((name): name is string => !!name && name.length > 0);

    if (names.length > 0) {
      setSelectedOrganizations(names);
    }
  }, [userData]);

  // Derive the effective category for this pre‑sales user from the target
  // detail payload. When exactly one category is present, show that;
  // otherwise fall back to "All Categories".
  useEffect(() => {
    if (!userData) return;

    type CategoryLike = CategoryOption | TargetCategory | { category?: TargetCategory; code?: TargetCategory; label?: string };

    const extractCode = (entry?: CategoryLike): TargetCategory | null => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return entry;
      }
      const obj = entry as any;
      return (obj.code as TargetCategory) ?? (obj.category as TargetCategory) ?? null;
    };

    const collectCodes = (list?: CategoryLike[]): TargetCategory[] => {
      if (!list || !list.length) return [];
      const codes = new Set<TargetCategory>();
      list.forEach((entry) => {
        const code = extractCode(entry);
        if (code) {
          codes.add(code);
        }
      });
      return Array.from(codes);
    };

    const fromAvailable = collectCodes(userData.availableCategories as CategoryLike[] | undefined);
    const fromLegacy = collectCodes(userData.categories as CategoryLike[] | undefined);
    const allCodes = fromAvailable.length ? fromAvailable : fromLegacy;

    if (allCodes.length === 1) {
      setDerivedCategory(allCodes[0]);
      setSelectedCategory(allCodes[0]);
    }
  }, [userData]);

  const allRows: PreSalesMonthlyRow[] = useMemo(() => {
    const rows: PreSalesMonthlyRow[] = [];

    for (let month = 1; month <= 12; month++) {
      const monthData = userData?.monthlyData?.find(
        (m) => m.month === month && m.year === selectedYear,
      );

      const diversionTarget = monthData?.target ?? 0;
      const totalDeals = monthData?.totalDeals ?? 0;
      const totalDivertDeals = monthData?.diversionDeals ?? 0;
      const incentive = monthData?.incentive ?? 0;

      rows.push({
        month,
        year: selectedYear,
        monthName: MONTH_NAMES[month - 1],
        totalDeals,
        totalDivertDeals,
        diversionTarget,
        incentive,
      });
    }

    return rows;
  }, [userData, selectedYear]);

  const organizationOptions = useMemo(() => {
    const base =
      (userData?.availableOrganizations?.length && userData.availableOrganizations) ||
      (userData?.organizations?.length && userData.organizations) ||
      organizations ||
      [];

    const merged = new Map<string, OrganizationSummary>();
    base.forEach((org) => {
      if (org.name) {
        merged.set(org.name, org);
      }
    });

    return Array.from(merged.values());
  }, [userData, organizations]);

  const filteredOrganizationOptions = useMemo(() => {
    const term = orgSearch.trim().toLowerCase();
    if (!term) return organizationOptions;
    return organizationOptions.filter((org) => org.name?.toLowerCase().includes(term));
  }, [organizationOptions, orgSearch]);

  const mapSummaryToWonDeal = useCallback(
    (deal: DealSummary): WonDeal => ({
      dealId: deal.dealId,
      dealName: deal.dealName,
      dealValue: deal.dealValue,
      organization: deal.organization,
      commission: deal.commissionAmount,
      source: deal.dealSource || deal.personSource,
      instagramId: deal.instagramId,
      wonDate: deal.wonDate,
      weddingDate: deal.eventDate,
      weddingVenue: deal.venue,
      phone: deal.phoneNumber,
    }),
    [],
  );

  const mapUserDealDetail = useCallback(
    (deal: UserDealDetail): WonDeal => ({
      dealId: deal.dealId,
      dealName: deal.dealName,
      dealValue: deal.dealValue,
      organization: deal.organization,
      commission: deal.commission,
      // Prefer reporting fields (dealSource/personSource), fall back to legacy `source`
      source: deal.source || deal.dealSource || deal.personSource,
      instagramId: deal.instagramId,
      wonDate: deal.wonDate,
      weddingDate: deal.weddingDate,
      weddingVenue: deal.weddingVenue,
      phone: deal.phone,
      month: deal.month,
      year: deal.year,
    }),
    [],
  );

  /**
   * Normalized won deals coming directly from the user detail API.
   *
   * For newer backends this will be a list of DealSummary objects; for older
   * backends it may be a list of UserDealDetail objects. We detect the shape
   * at runtime and map accordingly so that the UI consistently works across
   * both versions.
   */
  const detailDeals: WonDeal[] = useMemo(() => {
    if (!userData?.deals || userData.deals.length === 0) {
      return [];
    }

    return userData.deals.map((raw: UserDealDetail | DealSummary) => {
      const anyDeal: any = raw;
      // Heuristic: DealSummary has "commissionAmount" while UserDealDetail has "commission"
      if (typeof anyDeal.commissionAmount === 'number' || anyDeal.dealSource || anyDeal.personSource) {
        return mapSummaryToWonDeal(anyDeal as DealSummary);
      }
      return mapUserDealDetail(anyDeal as UserDealDetail);
    });
  }, [userData?.deals, mapSummaryToWonDeal, mapUserDealDetail]);

  const loadUserDeals = useCallback(async () => {
    if (!userId) return;
    setDealsLoading(true);
    setDealsError(null);
    try {
      const params: any = {
        timePreset: selectedTimePreset,
      };

      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }

      if (selectedTimePreset === 'CUSTOM_MONTH') {
        params.month = customMonth;
        params.year = customYear;
      } else if (selectedTimePreset === 'CUSTOM_RANGE') {
        params.fromMonth = fromMonth;
        params.fromYear = fromYear;
        params.toMonth = toMonth;
        params.toYear = toYear;
      }

      const dashboard = await targetsApi.getDashboard(params);
      const deals = dashboard.deals
        // For SALES users, deals are attributed directly by owner (userId).
        // For PRE-SALES users, the backend may still attribute deals to the
        // manager in the dashboard response, so we cannot reliably filter by
        // userId alone. Instead, we keep the dashboard deals unfiltered here
        // and rely on the organizations/time range filters below together with
        // the per-user detail API (detailDeals) to scope what is shown.
        .map(mapSummaryToWonDeal);
      setDashboardDeals(deals);
    } catch (err: any) {
      console.error('Failed to load pre-sales won deals', err);
      setDealsError(err?.response?.data?.message || err?.message || 'Failed to load won deals.');
      setDashboardDeals([]);
    } finally {
      setDealsLoading(false);
    }
  }, [
    userId,
    selectedCategory,
    selectedTimePreset,
    customMonth,
    customYear,
    fromMonth,
    fromYear,
    toMonth,
    toYear,
    mapSummaryToWonDeal,
  ]);

  useEffect(() => {
    if (userId) {
      loadUserDeals();
    }
  }, [userId, loadUserDeals]);

  const appliedTimeRange = useMemo<MonthRange>(() => {
    const baseYear = selectedYear;
    const defaultRange: MonthRange = {
      start: { month: 1, year: baseYear },
      end: { month: 12, year: baseYear },
    };

    switch (selectedTimePreset) {
      case 'THIS_MONTH': {
        const month = Math.min(Math.max(CURRENT_MONTH, 1), 12);
        return { start: { month, year: baseYear }, end: { month, year: baseYear } };
      }
      case 'PREVIOUS_MONTH': {
        const month = Math.max(CURRENT_MONTH - 1, 1);
        return { start: { month, year: baseYear }, end: { month, year: baseYear } };
      }
      case 'NEXT_MONTH': {
        const month = Math.min(CURRENT_MONTH + 1, 12);
        return { start: { month, year: baseYear }, end: { month, year: baseYear } };
      }
      case 'THIS_QUARTER': {
        const quarter = Math.ceil(CURRENT_MONTH / 3);
        const startMonth = (quarter - 1) * 3 + 1;
        return {
          start: { month: startMonth, year: baseYear },
          end: { month: startMonth + 2, year: baseYear },
        };
      }
      case 'HALF_YEAR': {
        const firstHalf = CURRENT_MONTH <= 6;
        return {
          start: { month: firstHalf ? 1 : 7, year: baseYear },
          end: { month: firstHalf ? 6 : 12, year: baseYear },
        };
      }
      case 'CUSTOM_MONTH':
        return {
          start: { month: customMonth, year: customYear },
          end: { month: customMonth, year: customYear },
        };
      case 'CUSTOM_RANGE': {
        const start = { month: fromMonth, year: fromYear };
        const end = { month: toMonth, year: toYear };
        return compareMonthYear(start, end) <= 0 ? { start, end } : { start: end, end: start };
      }
      case 'THIS_YEAR':
      default:
        return defaultRange;
    }
  }, [selectedYear, selectedTimePreset, customMonth, customYear, fromMonth, fromYear, toMonth, toYear]);

  const isWithinSelectedRange = useCallback(
    (month: number, year: number) => {
      const { start, end } = appliedTimeRange;
      if (year < start.year || year > end.year) {
        return false;
      }
      if (year === start.year && month < start.month) {
        return false;
      }
      if (year === end.year && month > end.month) {
        return false;
      }
      return true;
    },
    [appliedTimeRange],
  );

  /**
   * Deals that are visible in the Won Deals table after applying
   * organization and time range filters. We re-use this both for
   * rendering the table and for computing achievement (Divert deals).
   */
  const visibleWonDeals = useMemo(() => {
    const source = dashboardDeals.length > 0 ? dashboardDeals : detailDeals;
    if (!source.length) return [];

    return source
      .filter((deal) => {
        if (selectedOrganizations.length === 0) return true;
        return deal.organization && selectedOrganizations.includes(deal.organization);
      })
      .filter((deal) => {
        // For the table we keep deals even when we can't parse month/year,
        // but we still respect the selected time preset whenever possible.
        let { month, year } = deal;
        if ((!month || !year) && deal.weddingDate) {
          const d = new Date(deal.weddingDate);
          if (!Number.isNaN(d.getTime())) {
            month = d.getMonth() + 1;
            year = d.getFullYear();
          }
        }
        if (!month || !year) return true;
        return isWithinSelectedRange(month, year);
      });
  }, [dashboardDeals, detailDeals, selectedOrganizations, isWithinSelectedRange]);

  /**
   * Override the achieved (Divert) counts using the actual visible
   * won deals list. Any deal whose source contains "divert" is
   * treated as a diversion deal and counted in the month of its
   * wedding date (or explicit month/year when provided).
   */
  const divertCountsByMonthYear = useMemo(() => {
    const counts = new Map<string, number>();

    const isDivertSource = (source?: string) =>
      (source || '').toLowerCase().includes('divert');

    visibleWonDeals.forEach((deal) => {
      if (!isDivertSource(deal.source)) {
        return;
      }

      let { month, year } = deal;
      if ((!month || !year) && deal.weddingDate) {
        const d = new Date(deal.weddingDate);
        if (!Number.isNaN(d.getTime())) {
          month = d.getMonth() + 1;
          year = d.getFullYear();
        }
      }

      if (!month || !year) return;
      if (!isWithinSelectedRange(month, year)) return;

      const key = `${year}-${month}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return counts;
  }, [visibleWonDeals, isWithinSelectedRange]);

  const rows = useMemo(
    () =>
      allRows
        .filter((row) => isWithinSelectedRange(row.month, row.year))
        .map((row) => {
          const key = `${row.year}-${row.month}`;
          const overrideDivert = divertCountsByMonthYear.get(key);
          if (overrideDivert === undefined) {
            return row;
          }
          return {
            ...row,
            totalDivertDeals: overrideDivert,
          };
        }),
    [allRows, isWithinSelectedRange, divertCountsByMonthYear],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          target: acc.target + row.diversionTarget,
          achieved: acc.achieved + row.totalDivertDeals,
          totalDeals: acc.totalDeals + row.totalDeals,
          totalDivertDeals: acc.totalDivertDeals + row.totalDivertDeals,
          diversionTarget: acc.diversionTarget + row.diversionTarget,
          incentive: acc.incentive + row.incentive,
        }),
        {
          target: 0,
          achieved: 0,
          totalDeals: 0,
          totalDivertDeals: 0,
          diversionTarget: 0,
          incentive: 0,
        },
      ),
    [rows],
  );

  const totalAchievementPercent =
    totals.target > 0 ? (totals.achieved / totals.target) * 100 : 0;

  const countDifference = totals.achieved - totals.target;

  const formatDifferenceCount = (value: number): string => {
    if (value > 0) {
      return `+${value}`;
    }
    return value.toString();
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const yearOptions = useMemo(() => {
    const base = CURRENT_YEAR;
    return Array.from({ length: 5 }, (_, idx) => base - 2 + idx);
  }, []);

  const timePresetOptions = useMemo<TimePresetOption[]>(() => {
    return (Object.keys(PRESET_LABELS) as TimePreset[]).map((code) => ({
      code,
      label: PRESET_LABELS[code],
    }));
  }, []);

  // Close the organization dropdown when clicking outside
  useEffect(() => {
    if (!isOrgDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!orgDropdownRef.current) return;
      if (!orgDropdownRef.current.contains(event.target as Node)) {
        setIsOrgDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOrgDropdownOpen]);

  const maxDealsForChart = useMemo(() => {
    const maxTarget = Math.max(...rows.map((r) => r.diversionTarget || 0));
    const maxAchieved = Math.max(...rows.map((r) => r.totalDivertDeals || 0));
    const maxVal = Math.max(maxTarget, maxAchieved, 1);
    return maxVal;
  }, [rows]);

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
    } catch {
      return dateString;
    }
  };

  const categoryOptions: { code: TargetCategory; label: string }[] = useMemo(
    () => [
      { code: 'PHOTOGRAPHY', label: 'Photography' },
      { code: 'MAKEUP', label: 'Makeup' },
      { code: 'PLANNING_AND_DECOR', label: 'Planning & Decor' },
    ],
    [],
  );

  return (
    <div className="target-user-detail-page">
      <div className="target-user-detail-header">
        <button
          type="button"
          className="target-user-detail-back-btn"
          onClick={() => navigate('/targets')}
        >
          ← Back to Targets
        </button>
        <h1 className="target-user-detail-title">
          {userName} - Monthly Target Breakdown
        </h1>
      </div>

      {loadingUser && (
        <div className="target-user-detail-loading">Loading user...</div>
      )}
      {userError && (
        <div className="target-user-detail-error">{userError}</div>
      )}

      <div className="target-user-detail-table-wrapper">
        <table className="target-user-detail-table">
          <thead>
            <tr className="target-user-detail-header-row">
              <th className="target-user-detail-header-cell">Month</th>
              <th className="target-user-detail-header-cell">Target</th>
              <th className="target-user-detail-header-cell">Achieved</th>
              <th className="target-user-detail-header-cell">%</th>
              <th className="target-user-detail-header-cell">Total Deals</th>
              <th className="target-user-detail-header-cell">Incentive</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month} className="target-user-detail-row">
                <td className="target-user-detail-cell target-user-detail-cell-month">
                  {row.monthName}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-target">
                  {row.diversionTarget}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-deals">
                  {row.totalDivertDeals}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-percent">
                  {row.diversionTarget > 0
                    ? `${((row.totalDivertDeals / row.diversionTarget) * 100).toFixed(1)}%`
                    : '-'}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-deals">
                  {row.totalDeals}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-incentive">
                  {formatCurrency(row.incentive)}
                </td>
              </tr>
            ))}
            <tr className="target-user-detail-total-row">
              <td className="target-user-detail-cell target-user-detail-cell-month">
                <strong>Total</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-target">
                <strong>{totals.target}</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-deals">
                <strong>{totals.achieved}</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-percent">
                <strong>{totalAchievementPercent.toFixed(1)}%</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-deals">
                <strong>{totals.totalDeals}</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-incentive">
                <strong>{formatCurrency(totals.incentive)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* Goal Details & Chart Section */}
      <div className="target-user-goal-details-section">
        <div className="target-user-goal-details-left">
          <h2 className="target-user-goal-details-title">Goal Details</h2>

          <div className="target-user-goal-filters">
            <div className="target-user-goal-filter-group">
              <label>Pre-Sales Person</label>
              <div className="target-user-goal-filter-value">{userName}</div>
            </div>

            <div className="target-user-goal-filter-group">
              <label>Category</label>
              <div className="target-user-goal-filter-value">
                {derivedCategory
                  ? categoryOptions.find((c) => c.code === derivedCategory)?.label ??
                    derivedCategory.replace(/_/g, ' ')
                  : 'All Categories'}
              </div>
            </div>

            <div className="target-user-goal-filter-group">
              <label>Organizations</label>
              <div className="set-target-multi" ref={orgDropdownRef}>
                <button
                  type="button"
                  className={`set-target-multi-trigger${
                    selectedOrganizations.length === 0 ? ' placeholder' : ''
                  }`}
                  onClick={() => setIsOrgDropdownOpen((open) => !open)}
                  disabled={organizationOptions.length === 0}
                >
                  {selectedOrganizations.length === 0 && <span>All organizations</span>}
                  {selectedOrganizations.length > 0 && (
                    <div className="set-target-multi-tags">
                      {selectedOrganizations.map((name) => (
                        <span key={name} className="set-target-tag">
                          {name}
                          <span
                            className="set-target-tag-remove"
                            role="button"
                            tabIndex={0}
                            aria-label={`Remove ${name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedOrganizations((prev) =>
                                prev.filter((orgName) => orgName !== name),
                              );
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                setSelectedOrganizations((prev) =>
                                  prev.filter((orgName) => orgName !== name),
                                );
                              }
                            }}
                          >
                            ×
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="set-target-multi-caret">▾</span>
                </button>
                {isOrgDropdownOpen && (
                  <div className="set-target-multi-dropdown">
                    <div className="set-target-multi-search">
                      <input
                        type="text"
                        placeholder="Search organizations"
                        value={orgSearch}
                        onChange={(e) => setOrgSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      className="set-target-multi-option special"
                      onClick={() => setSelectedOrganizations([])}
                    >
                      All organizations
                      {selectedOrganizations.length === 0 && (
                        <span className="set-target-check">✓</span>
                      )}
                    </button>
                    <div className="set-target-multi-options">
                      {filteredOrganizationOptions.map((org) => {
                        const isSelected =
                          !!org.name && selectedOrganizations.includes(org.name);
                        return (
                          <button
                            key={org.id}
                            type="button"
                            className={`set-target-multi-option${
                              isSelected ? ' selected' : ''
                            }`}
                            onClick={() => {
                              if (!org.name) return;
                              setSelectedOrganizations((prev) =>
                                prev.includes(org.name!)
                                  ? prev.filter((n) => n !== org.name)
                                  : [...prev, org.name!],
                              );
                            }}
                          >
                            <span>{org.name}</span>
                            {isSelected && <span className="set-target-check">✓</span>}
                          </button>
                        );
                      })}
                      {filteredOrganizationOptions.length === 0 && (
                        <div className="set-target-empty">No matches found.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="target-user-goal-filter-group">
              <label>Time Period</label>
              <select
                value={selectedTimePreset}
                onChange={(e) =>
                  setSelectedTimePreset(e.target.value as TimePreset)
                }
                className="target-user-goal-filter-select"
              >
                {timePresetOptions.map((preset) => (
                  <option key={preset.code} value={preset.code}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            {selectedTimePreset === 'CUSTOM_MONTH' && (
              <>
                <div className="target-user-goal-filter-group">
                  <label>Month</label>
                  <select
                    value={customMonth}
                    onChange={(e) => setCustomMonth(Number(e.target.value))}
                    className="target-user-goal-filter-select"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month}>
                        {MONTH_NAMES[month - 1]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="target-user-goal-filter-group">
                  <label>Year</label>
                  <select
                    value={customYear}
                    onChange={(e) => {
                      const year = Number(e.target.value);
                      setCustomYear(year);
                      setSelectedYear(year);
                    }}
                    className="target-user-goal-filter-select"
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {selectedTimePreset === 'CUSTOM_RANGE' && (
              <>
                <div className="target-user-goal-filter-group">
                  <label>From Month</label>
                  <select
                    value={fromMonth}
                    onChange={(e) => setFromMonth(Number(e.target.value))}
                    className="target-user-goal-filter-select"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month}>
                        {MONTH_NAMES[month - 1]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="target-user-goal-filter-group">
                  <label>From Year</label>
                  <select
                    value={fromYear}
                    onChange={(e) => {
                      const year = Number(e.target.value);
                      setFromYear(year);
                      setSelectedYear(year);
                    }}
                    className="target-user-goal-filter-select"
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="target-user-goal-filter-group">
                  <label>To Month</label>
                  <select
                    value={toMonth}
                    onChange={(e) => setToMonth(Number(e.target.value))}
                    className="target-user-goal-filter-select"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month}>
                        {MONTH_NAMES[month - 1]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="target-user-goal-filter-group">
                  <label>To Year</label>
                  <select
                    value={toYear}
                    onChange={(e) => {
                      const year = Number(e.target.value);
                      setToYear(year);
                      setSelectedYear(year);
                    }}
                    className="target-user-goal-filter-select"
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="target-user-goal-filter-group">
              <label>Target</label>
              <div className="target-user-goal-filter-value">{totals.target}</div>
            </div>
          </div>

          {/* Summary Box */}
          <div className="target-user-summary-box">
            <div className="target-user-summary-item">
              <div className="target-user-summary-label">Total Target</div>
              <div className="target-user-summary-value">{totals.target}</div>
            </div>
            <div className="target-user-summary-item">
              <div className="target-user-summary-label">Achieved</div>
              <div className="target-user-summary-value target-user-summary-achieved">
                {totals.achieved}
              </div>
            </div>
            <div className="target-user-summary-item">
              <div className="target-user-summary-label">Difference</div>
              <div
                className={`target-user-summary-value ${
                  countDifference > 0
                    ? 'target-user-summary-difference-positive'
                    : countDifference < 0
                      ? 'target-user-summary-difference-negative'
                      : ''
                }`}
              >
                {formatDifferenceCount(countDifference)}
              </div>
            </div>
          </div>
        </div>

        {/* Chart Section for diverted deals vs target */}
        <div className="target-user-chart-section">
          <h3 className="target-user-chart-title">
            Monthly Diversion Deals vs Target - {userName} - {selectedYear}
          </h3>
          <div className="target-user-chart-legend">
            <div className="target-user-chart-legend-item">
              <span className="target-user-chart-legend-color target-user-chart-legend-achieved"></span>
              <span>Achieved (Divert Deals)</span>
            </div>
            <div className="target-user-chart-legend-item">
              <span className="target-user-chart-legend-color target-user-chart-legend-target"></span>
              <span>Target (Divert Deals)</span>
            </div>
          </div>
          <div className="target-user-chart-container">
            <div className="target-user-chart-y-axis">
            <div className="target-user-chart-y-label">Deals (count)</div>
              <div className="target-user-chart-y-ticks">
                {Array.from({ length: maxDealsForChart + 1 }, (_, i) => {
                  const value = maxDealsForChart - i;
                  return (
                    <div key={value} className="target-user-chart-y-tick">
                      {value}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="target-user-chart-bars-container">
              {rows.map((row) => {
                const achievedHeight =
                  (row.totalDivertDeals / maxDealsForChart) * 100;
                const targetHeight =
                  row.diversionTarget > 0
                    ? (row.diversionTarget / maxDealsForChart) * 100
                    : 0;
                const achievementPercent =
                  row.diversionTarget > 0
                    ? (row.totalDivertDeals / row.diversionTarget) * 100
                    : 0;

                return (
                  <div
                    key={row.month}
                    className="target-user-chart-bar-wrapper"
                    onMouseEnter={() => setHoveredMonth(row.month)}
                    onMouseLeave={() => setHoveredMonth(null)}
                  >
                    {hoveredMonth === row.month && (
                      <div className="target-user-chart-tooltip">
                        <div className="target-user-chart-tooltip-header">
                          {row.monthName} {selectedYear}
                        </div>
                        <div className="target-user-chart-tooltip-item">
                          <span className="target-user-chart-tooltip-icon target-user-chart-tooltip-icon-achieved">
                            ●
                          </span>
                            <span>Achieved: {row.totalDivertDeals} deals</span>
                        </div>
                        {row.diversionTarget > 0 && (
                          <div className="target-user-chart-tooltip-item">
                            <span className="target-user-chart-tooltip-icon target-user-chart-tooltip-icon-target">
                              ●
                            </span>
                            <span>Target: {row.diversionTarget} deals</span>
                          </div>
                        )}
                        {row.diversionTarget > 0 && (
                          <div className="target-user-chart-tooltip-item">
                            <span className="target-user-chart-tooltip-icon target-user-chart-tooltip-icon-chart">
                              ▊
                            </span>
                            <span>
                              Achievement: {achievementPercent.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="target-user-chart-bar-container">
                      {row.diversionTarget > 0 && (
                        <div
                          className="target-user-chart-bar target-user-chart-bar-target"
                          style={{ height: `${targetHeight}%` }}
                        ></div>
                      )}
                      <div
                        className="target-user-chart-bar target-user-chart-bar-achieved"
                        style={{ height: `${achievedHeight}%` }}
                      ></div>
                    </div>
                    <div className="target-user-chart-x-label">
                      {row.monthName.substring(0, 3)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="target-user-chart-x-axis">
            <div className="target-user-chart-x-label">
              Months ({selectedYear})
            </div>
          </div>
        </div>
      </div>

      {/* Won Deals Section */}
      <div className="target-user-deals-section">
        <h3 className="target-user-deals-title">Won Deals</h3>
        {dealsError && <div className="target-user-detail-error">{dealsError}</div>}
        <div className="target-user-deals-table-wrapper">
          <table className="target-user-deals-table">
            <thead>
              <tr className="target-user-deals-header-row">
                <th className="target-user-deals-header">Deal Name</th>
                <th className="target-user-deals-header">Deal Value</th>
                <th className="target-user-deals-header">Organization</th>
                <th className="target-user-deals-header">Commission</th>
                <th className="target-user-deals-header">Source</th>
                <th className="target-user-deals-header">Won Date</th>
                <th className="target-user-deals-header">Instagram ID</th>
                <th className="target-user-deals-header">Wedding Date</th>
                <th className="target-user-deals-header">Wedding Venue</th>
                <th className="target-user-deals-header">Phone</th>
              </tr>
            </thead>
            <tbody>
              {dealsLoading ? (
                <tr>
                  <td colSpan={9} className="target-user-deals-empty">
                    Loading won deals...
                  </td>
                </tr>
              ) : visibleWonDeals.length ? (
                visibleWonDeals.map((deal) => (
                    <tr key={deal.dealId} className="target-user-deals-row">
                      <td className="target-user-deals-cell">{deal.dealName}</td>
                      <td className="target-user-deals-cell">
                        {formatCurrency(deal.dealValue)}
                      </td>
                      <td className="target-user-deals-cell">
                        {deal.organization || '-'}
                      </td>
                      <td className="target-user-deals-cell">
                        {typeof deal.commission === 'number'
                          ? formatCurrency(deal.commission)
                          : '-'}
                      </td>
                      <td className="target-user-deals-cell">
                        {deal.source || '-'}
                      </td>
                      <td className="target-user-deals-cell">
                        {formatDate(deal.wonDate)}
                      </td>
                      <td className="target-user-deals-cell">
                        {deal.instagramId || '-'}
                      </td>
                      <td className="target-user-deals-cell">
                        {formatDate(deal.weddingDate)}
                      </td>
                      <td className="target-user-deals-cell">
                        {deal.weddingVenue || '-'}
                      </td>
                      <td className="target-user-deals-cell">
                        {deal.phone || '-'}
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={9} className="target-user-deals-empty">
                    No won deals found for this pre-sales user
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


