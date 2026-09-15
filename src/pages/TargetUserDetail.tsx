import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { filterTargetCategoryOptions } from '../constants/categories';
import { targetsApi } from '../services/targets';
import SetTargetModal from '../components/SetTargetModal';
import { getStoredUser } from '../utils/authToken';
import type {
  UserMonthlyData,
  UserTargetDetailResponse,
  TargetCategory,
  CategoryOption,
  TimePreset,
  TimePresetOption,
  DealSummary,
  UserDealDetail,
} from '../types/target';
import type { Organization } from '../types/organization';
import './TargetUserDetail.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
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

const compareMonthYear = (a: MonthYear, b: MonthYear): number => {
  if (a.year === b.year) {
    return a.month - b.month;
  }
  return a.year - b.year;
};

export default function TargetUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserTargetDetailResponse | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [filtersMeta, setFiltersMeta] = useState<any>(null);
  const [isSetTargetModalOpen, setIsSetTargetModalOpen] = useState(false);
  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<TargetCategory | 'all'>('PHOTOGRAPHY');
  // For organization filter, allow multi-select. When the array is empty, it means "all organizations".
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>([]);
  const [selectedTimePreset, setSelectedTimePreset] = useState<TimePreset>('THIS_YEAR');
  const [customMonth, setCustomMonth] = useState<number>(CURRENT_MONTH);
  const [customYear, setCustomYear] = useState<number>(CURRENT_YEAR);
  const [fromMonth, setFromMonth] = useState<number>(1);
  const [fromYear, setFromYear] = useState<number>(CURRENT_YEAR);
  const [toMonth, setToMonth] = useState<number>(12);
  const [toYear, setToYear] = useState<number>(CURRENT_YEAR);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [dashboardDeals, setDashboardDeals] = useState<WonDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState<boolean>(false);
  const [dealsError, setDealsError] = useState<string | null>(null);
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const orgDropdownRef = useRef<HTMLDivElement | null>(null);
  const storedUser = getStoredUser();
  const isAdmin = storedUser?.role === 'ADMIN';
  const isSales = storedUser?.role === 'SALES';
  const isPreSales = storedUser?.role === 'PRESALES';
  const loggedInUserId = storedUser?.userId;

  // Access control:
  // - ADMIN & CATEGORY_MANAGER: full access to this Sales detail page.
  // - SALES: can see only their own detail page.
  // - PRESALES (and others): should not be on this page at all; redirect to dashboard.
  useEffect(() => {
    if (isPreSales) {
      navigate('/targets');
      return;
    }

    if (isSales && userId && loggedInUserId && Number(userId) !== loggedInUserId) {
      navigate('/targets');
    }
  }, [isPreSales, isSales, userId, loggedInUserId, navigate]);

  useEffect(() => {
    if (userId) {
      loadUserData();
      loadFilters();
    }
  }, [userId, selectedYear]);

  useEffect(() => {
    if (userId) {
      loadUserData();
    }
  }, [selectedCategory, selectedOrganizations, selectedYear]);


  useEffect(() => {
    setCustomYear(selectedYear);
    setFromYear(selectedYear);
    setToYear(selectedYear);
  }, [selectedYear]);

  const loadUserData = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await targetsApi.getUserTargetDetail(Number(userId), selectedYear);
      setUserData(data);
    } catch (err: any) {
      console.error('Failed to load user target detail', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load user data.');
    } finally {
      setLoading(false);
    }
  };

  const mapSummaryToWonDeal = useCallback((deal: DealSummary): WonDeal => ({
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
  }), []);

  const mapUserDealDetail = useCallback(
    (deal: UserDealDetail): WonDeal => ({
      dealId: deal.dealId,
      dealName: deal.dealName,
      dealValue: deal.dealValue,
      organization: deal.organization,
      commission: deal.commission,
      // Prefer the explicit reporting fields when present, but keep backward
      // compatibility with the older `source` property.
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
        .filter((deal) => deal.userId === Number(userId))
        .map(mapSummaryToWonDeal);
      setDashboardDeals(deals);
    } catch (err: any) {
      console.error('Failed to load user deals', err);
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

  const loadFilters = async () => {
    try {
      const filters = await targetsApi.getFilters();
      setFiltersMeta(filters);
    } catch (err: any) {
      console.error('Failed to load filters', err);
    }
  };

  interface CategoryLike {
    code?: TargetCategory;
    category?: TargetCategory;
    label?: string;
  }

  const resolveCategoryCode = useCallback(
    (option?: CategoryOption | TargetCategory | CategoryLike): TargetCategory | null => {
      if (!option) return null;
      if (typeof option === 'string') {
        return option;
      }
      return option.code ?? option.category ?? null;
    },
    [],
  );

  const normalizeCategoryOption = useCallback(
    (option: CategoryOption | TargetCategory | CategoryLike | undefined): CategoryOption | null => {
      const code = resolveCategoryCode(option);
      if (!code) return null;

      const fallbackLabel =
        (filtersMeta?.categories || []).find((cat: CategoryOption) => cat.code === code)?.label ??
        (typeof option === 'object' && option?.label) ??
        code.replace(/_/g, ' ');

      return { code, label: fallbackLabel };
    },
    [filtersMeta, resolveCategoryCode],
  );

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const normalizedFrom = (source?: Array<CategoryOption | TargetCategory | CategoryLike>) => {
      if (!source || !source.length) return [];
      return source.reduce<CategoryOption[]>((acc, entry) => {
        const normalized = normalizeCategoryOption(entry);
        if (normalized && !acc.some((opt) => opt.code === normalized.code)) {
          acc.push(normalized);
        }
        return acc;
      }, []);
    };

    const availableCategories = normalizedFrom(userData?.availableCategories);
    if (availableCategories.length) {
      return filterTargetCategoryOptions(availableCategories);
    }

    const legacyCategories = normalizedFrom(userData?.categories);
    if (legacyCategories.length) {
      return filterTargetCategoryOptions(legacyCategories);
    }

    return filterTargetCategoryOptions(
      (filtersMeta?.categories || [])
        .map((cat: CategoryOption) => normalizeCategoryOption(cat))
        .filter((cat: CategoryOption | null): cat is CategoryOption => Boolean(cat)),
    );
  }, [userData, filtersMeta, normalizeCategoryOption]);

  useEffect(() => {
    if (selectedCategory !== 'all') return;
    if (!categoryOptions.length) return;
    setSelectedCategory(categoryOptions[0].code);
  }, [categoryOptions, selectedCategory]);

  const organizationOptions = useMemo(() => {
    const base: Organization[] =
      (userData?.availableOrganizations?.length && userData.availableOrganizations) ||
      (userData?.organizations?.length && userData.organizations) ||
      [];

    const merged = new Map<string, Organization>();
    base.forEach((org) => {
      if (org.name) {
        merged.set(org.name, org);
      }
    });

    return Array.from(merged.values());
  }, [userData]);

  const filteredOrganizationOptions = useMemo(() => {
    const term = orgSearch.trim().toLowerCase();
    if (!term) return organizationOptions;
    return organizationOptions.filter((org) => org.name?.toLowerCase().includes(term));
  }, [organizationOptions, orgSearch]);

  const defaultModalCategory = useMemo<TargetCategory | undefined>(() => {
    if (selectedCategory !== 'all') {
      return selectedCategory;
    }
    return categoryOptions[0]?.code;
  }, [selectedCategory, categoryOptions]);

  const currentUserId = useMemo(() => (userId ? Number(userId) : undefined), [userId]);

  useEffect(() => {
    // When no specific organizations are selected and there is exactly one organization,
    // auto-select it for convenience.
    if (selectedOrganizations.length > 0) return;
    if (!organizationOptions.length) return;
    const firstOrgWithName = organizationOptions.find(
      (org) => org.name && org.name.trim().length > 0,
    );
    if (!firstOrgWithName?.name) return;
    setSelectedOrganizations([firstOrgWithName.name]);
  }, [organizationOptions, selectedOrganizations]);

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

  const timePresetOptions = useMemo<TimePresetOption[]>(() => {
    if (filtersMeta?.presets?.length) {
      return filtersMeta.presets;
    }
    return (Object.keys(PRESET_LABELS) as TimePreset[]).map((code) => ({
      code,
      label: PRESET_LABELS[code],
    }));
  }, [filtersMeta]);

  useEffect(() => {
    if (!timePresetOptions.length) return;
    if (!timePresetOptions.some((preset) => preset.code === selectedTimePreset)) {
      setSelectedTimePreset(timePresetOptions[0].code);
    }
  }, [timePresetOptions, selectedTimePreset]);

  const yearOptions = useMemo(() => {
    const minYear = filtersMeta?.minYear ?? selectedYear - 5;
    let startYear = minYear;
    if (selectedYear > minYear + 9) {
      startYear = selectedYear - 9;
    }
    return Array.from({ length: 10 }, (_, i) => startYear + i);
  }, [filtersMeta, selectedYear]);

  const handleCustomYearChange = (yearValue: number) => {
    setCustomYear(yearValue);
    if (yearValue !== selectedYear) {
      setSelectedYear(yearValue);
    }
  };

  const handleFromYearChange = (yearValue: number) => {
    setFromYear(yearValue);
    if (yearValue !== selectedYear) {
      setSelectedYear(yearValue);
    }
    if (yearValue > toYear) {
      setToYear(yearValue);
    }
  };

  const handleToYearChange = (yearValue: number) => {
    setToYear(yearValue);
    if (yearValue !== selectedYear) {
      setSelectedYear(yearValue);
    }
    if (yearValue < fromYear) {
      setFromYear(yearValue);
    }
  };

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
  }, [
    selectedYear,
    selectedTimePreset,
    customMonth,
    customYear,
    fromMonth,
    fromYear,
    toMonth,
    toYear,
  ]);

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

  // Auto-select category/organization based on user data
  useEffect(() => {
    if (!userData) return;

    if (selectedCategory === 'all') {
      if (categoryOptions.length === 1) {
        setSelectedCategory(categoryOptions[0].code);
      }
    } else {
      const exists = categoryOptions.some((cat) => cat.code === selectedCategory);
      if (!exists) {
        setSelectedCategory('all');
      }
    }

    // Organization auto-selection / validation for multi-select
    if (selectedOrganizations.length === 0) {
      if (organizationOptions.length === 1) {
        setSelectedOrganizations([organizationOptions[0].name]);
      }
    } else {
      const validNames = new Set(organizationOptions.map((org) => org.name));
      const filteredSelection = selectedOrganizations.filter((name) => validNames.has(name));
      if (filteredSelection.length !== selectedOrganizations.length) {
        setSelectedOrganizations(filteredSelection);
      }
    }
  }, [userData, selectedCategory, selectedOrganizations, organizationOptions, categoryOptions]);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Generate all 12 months with data
  const allMonthlyRows = useMemo(() => {
    const rows: (UserMonthlyData & { monthName: string })[] = [];

    for (let month = 1; month <= 12; month++) {
      const monthData = userData?.monthlyData?.find(
        (m) => m.month === month && m.year === selectedYear
      );

      rows.push({
        month,
        year: selectedYear,
        monthName: MONTH_NAMES[month - 1],
        // Target: backend returns null for future months or when no target is set
        target: monthData?.target ?? null,
        achieved: monthData?.achieved ?? 0,
        achievementPercent: monthData?.achievementPercent ?? 0,
        totalDeals: monthData?.totalDeals ?? 0,
        incentive: monthData?.incentive ?? 0,
        diversionDeals: monthData?.diversionDeals ?? 0,
        instaDeals: monthData?.instaDeals ?? 0,
        referenceDeals: monthData?.referenceDeals ?? 0,
        plannerDeals: monthData?.plannerDeals ?? 0,
      });
    }

    return rows;
  }, [userData, selectedYear]);

  const monthlyRows = useMemo(() => {
    return allMonthlyRows.filter((row) => isWithinSelectedRange(row.month, row.year));
  }, [allMonthlyRows, isWithinSelectedRange]);

  // Calculate totals
  const totals = useMemo(() => {
    return monthlyRows.reduce(
      (acc, row) => ({
        target: acc.target + (row.target ?? 0),
        achieved: acc.achieved + row.achieved,
        totalDeals: acc.totalDeals + row.totalDeals,
        incentive: acc.incentive + row.incentive,
        diversionDeals: acc.diversionDeals + row.diversionDeals,
        instaDeals: acc.instaDeals + row.instaDeals,
        referenceDeals: acc.referenceDeals + row.referenceDeals,
        plannerDeals: acc.plannerDeals + row.plannerDeals,
      }),
      {
        target: 0,
        achieved: 0,
        totalDeals: 0,
        incentive: 0,
        diversionDeals: 0,
        instaDeals: 0,
        referenceDeals: 0,
        plannerDeals: 0,
      }
    );
  }, [monthlyRows]);

  const totalAchievementPercent = totals.target > 0 
    ? (totals.achieved / totals.target) * 100 
    : 0;

  const difference = totals.achieved - totals.target;

  const formatDifference = (value: number): string => {
    if (value > 0) {
      return `+${formatCurrency(value)}`;
    }
    return formatCurrency(value);
  };

  // Filter deals based on selected filters
  const filteredDeals = useMemo(() => {
    const userDeals =
      userData?.deals?.map((deal) =>
        'commission' in deal ? mapUserDealDetail(deal as UserDealDetail) : mapSummaryToWonDeal(deal as DealSummary)
      ) ?? [];
    const sourceDeals = dashboardDeals.length > 0 ? dashboardDeals : userDeals;
    if (!sourceDeals.length) return [];
    let deals = sourceDeals;

    if (selectedCategory !== 'all') {
      // Note: We'll need to add category to deals if backend provides it
      // For now, we'll show all deals
    }

    if (selectedOrganizations.length > 0) {
      deals = deals.filter(
        (deal) => deal.organization && selectedOrganizations.includes(deal.organization),
      );
    }

    deals = deals.filter((deal) => {
      if (!deal.month || !deal.year) {
        return true;
      }
      return isWithinSelectedRange(deal.month, deal.year);
    });

    return deals;
  }, [
    dashboardDeals,
    userData?.deals,
    selectedCategory,
    selectedOrganizations,
    isWithinSelectedRange,
    mapUserDealDetail,
  ]);

  // Get max value for chart scaling - round up to nearest 5L
  const maxChartValue = useMemo(() => {
    const maxTarget = Math.max(...monthlyRows.map(r => r.target ?? 0));
    const maxAchieved = Math.max(...monthlyRows.map(r => r.achieved));
    const maxValue = Math.max(maxTarget, maxAchieved, 100000); // Minimum 1L
    // Round up to nearest 5L (500000)
    return Math.ceil(maxValue / 500000) * 500000;
  }, [monthlyRows]);

  // Get the target value for the line (use first month with target, or average)
  const chartTargetValue = useMemo(() => {
    const targets = monthlyRows.filter(r => r.target !== null && r.target > 0).map(r => r.target!);
    if (targets.length > 0) {
      // Use the first target value (assuming monthly targets are consistent)
      return targets[0];
    }
    return 0;
  }, [monthlyRows]);

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

  if (loading) {
    return (
      <div className="target-user-detail-page">
        <div className="target-user-detail-loading">Loading...</div>
      </div>
    );
  }

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
          {userData?.userName || 'User'} - Monthly Target Breakdown
        </h1>
        {isAdmin && (
          <div className="target-user-detail-header-actions">
            <button
              type="button"
              className="target-user-detail-set-target-btn"
              onClick={() => setIsSetTargetModalOpen(true)}
              disabled={!categoryOptions.length}
            >
              <span className="target-user-detail-set-target-plus">+</span>
              <span>Set Target</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="target-user-detail-error">
          {error}
        </div>
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
              <th className="target-user-detail-header-cell">Diversion Deal</th>
              <th className="target-user-detail-header-cell">Insta</th>
              <th className="target-user-detail-header-cell">Reference</th>
              <th className="target-user-detail-header-cell">Planner</th>
            </tr>
          </thead>
          <tbody>
            {monthlyRows.map((row) => (
              <tr key={row.month} className="target-user-detail-row">
                <td className="target-user-detail-cell target-user-detail-cell-month">
                  {row.monthName}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-target">
                  {row.target === null ? '-' : formatCurrency(row.target)}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-achieved">
                  {formatCurrency(row.achieved)}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-percent">
                  {row.target && row.target > 0
                    ? `${row.achievementPercent.toFixed(1)}%`
                    : '-'}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-deals">
                  {row.totalDeals}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-incentive">
                  {formatCurrency(row.incentive)}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-source">
                  {row.diversionDeals}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-source">
                  {row.instaDeals}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-source">
                  {row.referenceDeals}
                </td>
                <td className="target-user-detail-cell target-user-detail-cell-source">
                  {row.plannerDeals}
                </td>
              </tr>
            ))}
            {/* Total Row */}
            <tr className="target-user-detail-total-row">
              <td className="target-user-detail-cell target-user-detail-cell-month">
                <strong>Total</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-target">
                <strong>{formatCurrency(totals.target)}</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-achieved">
                <strong>{formatCurrency(totals.achieved)}</strong>
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
              <td className="target-user-detail-cell target-user-detail-cell-source">
                <strong>{totals.diversionDeals}</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-source">
                <strong>{totals.instaDeals}</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-source">
                <strong>{totals.referenceDeals}</strong>
              </td>
              <td className="target-user-detail-cell target-user-detail-cell-source">
                <strong>{totals.plannerDeals}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Goal Details Section */}
      <div className="target-user-goal-details-section">
        <div className="target-user-goal-details-left">
          <h2 className="target-user-goal-details-title">Goal Details</h2>
          
          <div className="target-user-goal-filters">
            <div className="target-user-goal-filter-group">
              <label>Sales Person</label>
              <div className="target-user-goal-filter-value">{userData?.userName || '-'}</div>
            </div>

            <div className="target-user-goal-filter-group">
              <label>Category</label>
              {isAdmin ? (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value as TargetCategory | 'all')}
                  className="target-user-goal-filter-select"
                  disabled={categoryOptions.length <= 1}
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat.code} value={cat.code}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="target-user-goal-filter-value">
                  {categoryOptions.find((c) => c.code === selectedCategory)?.label ||
                    selectedCategory.replace(/_/g, ' ')}
                </div>
              )}
            </div>

            <div className="target-user-goal-filter-group">
              <label>Organizations</label>
              {isAdmin ? (
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
              ) : (
                <div className="target-user-goal-filter-value">
                  {selectedOrganizations.length === 0
                    ? organizationOptions.map((o) => o.name).join(', ') || 'All Organizations'
                    : selectedOrganizations.join(', ')}
                </div>
              )}
            </div>

            <div className="target-user-goal-filter-group">
              <label>Time Period</label>
              <select
                value={selectedTimePreset}
                onChange={(e) => setSelectedTimePreset(e.target.value as TimePreset)}
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
                    onChange={(e) => handleCustomYearChange(Number(e.target.value))}
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
                    onChange={(e) => handleFromYearChange(Number(e.target.value))}
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
                    onChange={(e) => handleToYearChange(Number(e.target.value))}
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
              <label>Target Amount</label>
              <div className="target-user-goal-filter-value">{formatCurrency(totals.target)}</div>
            </div>
          </div>

          {/* Summary Box */}
          <div className="target-user-summary-box">
            <div className="target-user-summary-item">
              <div className="target-user-summary-label">Total Target</div>
              <div className="target-user-summary-value">{formatCurrency(totals.target)}</div>
            </div>
            <div className="target-user-summary-item">
              <div className="target-user-summary-label">Achieved</div>
              <div className="target-user-summary-value target-user-summary-achieved">
                {formatCurrency(totals.achieved)}
              </div>
            </div>
            <div className="target-user-summary-item">
              <div className="target-user-summary-label">Difference</div>
              <div
                className={`target-user-summary-value ${
                  difference > 0
                    ? 'target-user-summary-difference-positive'
                    : difference < 0
                      ? 'target-user-summary-difference-negative'
                      : ''
                }`}
              >
                {formatDifference(difference)}
              </div>
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="target-user-chart-section">
          <h3 className="target-user-chart-title">
            Monthly Revenue Progress - {userData?.userName || 'User'} - {selectedYear}
          </h3>
          <div className="target-user-chart-legend">
            <div className="target-user-chart-legend-item">
              <span className="target-user-chart-legend-color target-user-chart-legend-achieved"></span>
              <span>Achieved Revenue</span>
            </div>
            <div className="target-user-chart-legend-item">
              <span className="target-user-chart-legend-color target-user-chart-legend-target"></span>
              <span>Target</span>
            </div>
          </div>
          <div className="target-user-chart-container">
            <div className="target-user-chart-y-axis">
              <div className="target-user-chart-y-label">Deal Value (₹ Lakhs)</div>
              <div className="target-user-chart-y-ticks">
                {Array.from({ length: Math.floor(maxChartValue / 500000) + 1 }, (_, i) => {
                  const maxTick = Math.floor(maxChartValue / 500000);
                  const value = (maxTick - i) * 5; // Reverse order: highest at top (0L at bottom)
                  return (
                    <div key={i} className="target-user-chart-y-tick">
                      ₹{value}L
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="target-user-chart-bars-container">
              {chartTargetValue > 0 && (
                <div 
                  className="target-user-chart-target-line" 
                  style={{ bottom: `${(chartTargetValue / maxChartValue) * 100}%` }}
                  title={`Target: ₹${(chartTargetValue / 100000).toFixed(2)}L`}
                ></div>
              )}
              {monthlyRows.map((row) => {
                const achievedHeight = (row.achieved / maxChartValue) * 100;
                const targetHeight = row.target ? (row.target / maxChartValue) * 100 : 0;
                const achievementPercent = row.target && row.target > 0 
                  ? (row.achieved / row.target) * 100 
                  : 0;
                const needsAttention = row.target && row.target > 0 && achievementPercent < 80;
                const formatCurrencyLakhs = (amount: number): string => {
                  return `₹${(amount / 100000).toFixed(2)}L`;
                };
                
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
                          <span className="target-user-chart-tooltip-icon target-user-chart-tooltip-icon-achieved">●</span>
                          <span>Achieved Revenue: {formatCurrencyLakhs(row.achieved)}</span>
                        </div>
                        {row.target && (
                          <div className="target-user-chart-tooltip-item">
                            <span className="target-user-chart-tooltip-icon target-user-chart-tooltip-icon-target">●</span>
                            <span>Target: {formatCurrencyLakhs(row.target)}</span>
                          </div>
                        )}
                        {row.target && row.target > 0 && (
                          <div className="target-user-chart-tooltip-item">
                            <span className="target-user-chart-tooltip-icon target-user-chart-tooltip-icon-chart">▊</span>
                            <span>Achievement: {achievementPercent.toFixed(1)}%</span>
                          </div>
                        )}
                        {needsAttention && (
                          <div className="target-user-chart-tooltip-item">
                            <span className="target-user-chart-tooltip-icon target-user-chart-tooltip-icon-attention">●</span>
                            <span>Needs Attention</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="target-user-chart-bar-container">
                      {row.target && (
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
                    <div className="target-user-chart-x-label">{row.monthName.substring(0, 3)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="target-user-chart-x-axis">
            <div className="target-user-chart-x-label">Months ({selectedYear})</div>
          </div>
        </div>
      </div>

      {/* Deals List */}
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
              ) : filteredDeals.length > 0 ? (
                filteredDeals.map((deal) => (
                  <tr key={deal.dealId} className="target-user-deals-row">
                    <td className="target-user-deals-cell">{deal.dealName}</td>
                    <td className="target-user-deals-cell">{formatCurrency(deal.dealValue)}</td>
                    <td className="target-user-deals-cell">{deal.organization || '-'}</td>
                    <td className="target-user-deals-cell">
                      {typeof deal.commission === 'number' ? formatCurrency(deal.commission) : '-'}
                    </td>
                    <td className="target-user-deals-cell">{deal.source || '-'}</td>
                    <td className="target-user-deals-cell">
                      {formatDate(deal.wonDate)}
                    </td>
                    <td className="target-user-deals-cell">{deal.instagramId || '-'}</td>
                    <td className="target-user-deals-cell">{formatDate(deal.weddingDate)}</td>
                    <td className="target-user-deals-cell">{deal.weddingVenue || '-'}</td>
                    <td className="target-user-deals-cell">{deal.phone || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="target-user-deals-empty">
                    No won deals found for this user
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {isAdmin && currentUserId !== undefined && (
        <SetTargetModal
          isOpen={isSetTargetModalOpen}
          onClose={() => setIsSetTargetModalOpen(false)}
          onCreated={async () => {
            await loadUserData();
            await loadUserDeals();
          }}
          categories={categoryOptions}
          defaultCategory={defaultModalCategory}
          defaultUserId={currentUserId}
        />
      )}
    </div>
  );
}


