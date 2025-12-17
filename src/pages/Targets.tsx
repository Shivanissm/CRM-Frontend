import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { targetsApi } from '../services/targets';
import { usersApi } from '../services/users';
import type {
  DashboardResponse,
  FiltersResponse,
  TargetCategory,
  TimePreset,
  CategoryTable,
  DealSummary,
  TargetRow,
  SalesUserWithOrganizations,
  TargetResponse,
  CategoryMonthlyBreakdownResponse,
} from '../types/target';
import type { User } from '../types/user';
import './Targets.css';
import { getStoredUser } from '../utils/authToken';
import SetTargetModal from '../components/SetTargetModal';
import EditTargetModal from '../components/EditTargetModal';
import Loader from '../components/Loader';

type ViewMode = 'USERS' | 'MONTHLY_TOTALS' | 'MONTHLY_GRID';
type TargetLayer = 'SALES' | 'PRESALES';

const CATEGORY_BREAKDOWN_PRESETS: TimePreset[] = ['THIS_YEAR', 'HALF_YEAR', 'THIS_QUARTER', 'CUSTOM_RANGE'];

const VIEW_MODE_OPTIONS: Array<{
  value: ViewMode;
  label: string;
  requiresBreakdown: boolean;
}> = [
  { value: 'USERS', label: 'Users', requiresBreakdown: false },
  { value: 'MONTHLY_TOTALS', label: 'Monthly Totals', requiresBreakdown: true },
  { value: 'MONTHLY_GRID', label: 'Monthly Grid', requiresBreakdown: true },
];

const UsersIcon = () => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="8" cy="8" r="3" />
    <circle cx="16" cy="8" r="3" />
    <path d="M4 18c0-2.21 1.79-4 4-4h0c2.21 0 4 1.79 4 4" />
    <path d="M12 18c0-2.21 1.79-4 4-4h0c2.21 0 4 1.79 4 4" />
  </svg>
);

const TotalsIcon = () => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <path d="M5 19V9" />
    <path d="M10 19V5" />
    <path d="M15 19v-7" />
    <path d="M20 19v-4" />
  </svg>
);

const GridIcon = () => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <rect x="14" y="14" width="6" height="6" rx="1" />
  </svg>
);

const VIEW_MODE_ICONS: Record<ViewMode, () => JSX.Element> = {
  USERS: UsersIcon,
  MONTHLY_TOTALS: TotalsIcon,
  MONTHLY_GRID: GridIcon,
};

const HIDDEN_TIME_PRESETS: TimePreset[] = ['NEXT_MONTH'];

const GRID_HEADER_CLASSES = [
  'targets-grid-card-header-blue',
  'targets-grid-card-header-green',
  'targets-grid-card-header-purple',
  'targets-grid-card-header-amber',
  'targets-grid-card-header-pink',
  'targets-grid-card-header-teal',
];

interface DashboardFilterParams {
  timePreset: TimePreset;
  category?: TargetCategory;
  month?: number;
  year?: number;
  fromMonth?: number;
  fromYear?: number;
  toMonth?: number;
  toYear?: number;
}

// Unused function - kept for potential future use
// const formatMonthLabel = (month: number, year: number): string => {
//   return new Intl.DateTimeFormat('en-US', {
//     month: 'long',
//     year: 'numeric',
//   }).format(new Date(year, month - 1));
// };

const formatMonthName = (month: number): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
  }).format(new Date(2000, month - 1));
};

const chunkArray = <T,>(items: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

const filterRowsByTargetLayer = (rows: TargetRow[], layer: TargetLayer): TargetRow[] => {
  return rows.filter((row) => {
    // If backend hasn't started sending userRole yet, treat such rows as SALES-only
    if (!row.userRole) {
      return layer === 'SALES';
    }
    return row.userRole === layer;
  });
};

export default function Targets() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [filtersMeta, setFiltersMeta] = useState<FiltersResponse | null>(null);
  const [isSetTargetModalOpen, setIsSetTargetModalOpen] = useState(false);
  const [isEditTargetModalOpen, setIsEditTargetModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetResponse | null>(null);
  const [salesUsers, setSalesUsers] = useState<SalesUserWithOrganizations[]>([]);
  const [preSalesUsers, setPreSalesUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('USERS');
  const [targetLayer, setTargetLayer] = useState<TargetLayer>('SALES');
  const [categoryBreakdownCache, setCategoryBreakdownCache] = useState<Record<string, CategoryMonthlyBreakdownResponse>>({});
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  
  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<TargetCategory | 'all'>('all');
  const [selectedTimePreset, setSelectedTimePreset] = useState<TimePreset>('THIS_MONTH');
  const [customMonth, setCustomMonth] = useState<number>(new Date().getMonth() + 1);
  const [customYear, setCustomYear] = useState<number>(new Date().getFullYear());
  const [fromMonth, setFromMonth] = useState<number>(1);
  const [fromYear, setFromYear] = useState<number>(new Date().getFullYear());
  const [toMonth, setToMonth] = useState<number>(12);
  const [toYear, setToYear] = useState<number>(new Date().getFullYear());

  const user = getStoredUser();
  const userRole = user?.role;
  const isAdmin = userRole === 'ADMIN';
  const isSales = userRole === 'SALES';
  const isPreSales = userRole === 'PRESALES';
  const isCategoryManager = userRole === 'CATEGORY_MANAGER';

  // Auto-derived category for a category manager, based on which Sales users report
  // to them and which category tables those Sales users appear in.
  const [autoCategoryForCategoryManager, setAutoCategoryForCategoryManager] =
    useState<TargetCategory | null>(null);
  // Auto-derived category for a Sales user, based on where they have targets.
  const [autoCategoryForSales, setAutoCategoryForSales] =
    useState<TargetCategory | null>(null);
  // Auto-derived category for a Pre-Sales user, based on where they have targets.
  const [autoCategoryForPreSales, setAutoCategoryForPreSales] =
    useState<TargetCategory | null>(null);

  /**
   * For category managers, the backend can optionally restrict the dashboard to a single
   * category via `dashboardData.filters.category`. When this happens we treat that category
   * as fixed:
   * - Only that category table is shown.
   * - The Category filter dropdown is locked to that category.
   * - The "All Users" selector is automatically scoped to users within that category
   *   (via `filteredCategoryTables` further down).
   */
  const restrictedCategoryForCategoryManager: TargetCategory | null =
    isCategoryManager && !isAdmin
      ? autoCategoryForCategoryManager || (dashboardData?.filters?.category ?? null)
      : null;

  const restrictedCategoryForSales: TargetCategory | null =
    isSales && !isAdmin ? autoCategoryForSales : null;

  const restrictedCategoryForPreSales: TargetCategory | null =
    isPreSales && !isAdmin ? autoCategoryForPreSales : null;

  // Category order for display
  const categoryOrder: TargetCategory[] = ['PHOTOGRAPHY', 'MAKEUP', 'PLANNING_AND_DECOR'];
  const availableTimePresets = useMemo(
    () => filtersMeta?.presets.filter((preset) => !HIDDEN_TIME_PRESETS.includes(preset.code)) ?? [],
    [filtersMeta],
  );

  // When a category manager, sales, or pre-sales user has a derived / backend-enforced
  // category, always use that in place of the user-selectable category state.
  const effectiveSelectedCategory: TargetCategory | 'all' =
    restrictedCategoryForCategoryManager ??
    restrictedCategoryForSales ??
    restrictedCategoryForPreSales ??
    selectedCategory;

  const filterParams = useMemo<DashboardFilterParams>(() => {
    const params: DashboardFilterParams = {
      timePreset: selectedTimePreset,
    };

    if (effectiveSelectedCategory !== 'all') {
      params.category = effectiveSelectedCategory;
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

    return params;
  }, [
    selectedTimePreset,
    effectiveSelectedCategory,
    customMonth,
    customYear,
    fromMonth,
    fromYear,
    toMonth,
    toYear,
  ]);

  const hasCategorySelected = effectiveSelectedCategory !== 'all';
  const presetSupportsBreakdown = CATEGORY_BREAKDOWN_PRESETS.includes(selectedTimePreset);
  const canUseCategoryBreakdown = hasCategorySelected && presetSupportsBreakdown;
  const categoryBreakdownParams: DashboardFilterParams | null =
    canUseCategoryBreakdown && filterParams.category ? filterParams : null;
  const categoryBreakdownCacheKey = categoryBreakdownParams ? JSON.stringify(categoryBreakdownParams) : null;
  const categoryBreakdownData: CategoryMonthlyBreakdownResponse | null = categoryBreakdownCacheKey
    ? categoryBreakdownCache[categoryBreakdownCacheKey] || null
    : null;

  useEffect(() => {
    loadFilters();
    loadSalesUsers();
    loadPreSalesUsers();
  }, []);

  useEffect(() => {
    if (filtersMeta) {
      loadDashboard();
    }
  }, [filterParams, filtersMeta]);

  useEffect(() => {
    // Navigate to the per‑user breakdown page when a user is selected from the
    // "All Users" dropdown. Access rules:
    // - ADMIN & CATEGORY_MANAGER: can open any user they can see.
    // - SALES: can open their own Sales detail page and Pre‑Sales users under them.
    // - PRESALES: can open their own Pre‑Sales detail page.
    if (!selectedUserId || selectedUserId === '') {
      return;
    }

    const canNavigate = isAdmin || isCategoryManager || isSales || isPreSales;
    if (!canNavigate) {
      return;
    }

    if (targetLayer === 'SALES') {
      navigate(`/targets/users/${selectedUserId}`);
    } else if (targetLayer === 'PRESALES') {
      navigate(`/targets/pre-sales/${selectedUserId}`);
    }
  }, [selectedUserId, targetLayer, navigate, isAdmin, isCategoryManager, isSales, isPreSales]);

  useEffect(() => {
    // Reset selected user when switching between Sales and Pre-Sales
    setSelectedUserId('');
  }, [targetLayer]);

  useEffect(() => {
    if (HIDDEN_TIME_PRESETS.includes(selectedTimePreset)) {
      setSelectedTimePreset('THIS_MONTH');
    }
  }, [selectedTimePreset]);

  useEffect(() => {
    if (!canUseCategoryBreakdown && viewMode !== 'USERS') {
      setViewMode('USERS');
    }
  }, [canUseCategoryBreakdown, viewMode]);

  useEffect(() => {
    if (viewMode === 'USERS') {
      setBreakdownError(null);
    }
  }, [viewMode]);

  // For Pre-Sales users, always stay on the Pre-Sales layer.
  useEffect(() => {
    if (isPreSales && !isAdmin && targetLayer !== 'PRESALES') {
      setTargetLayer('PRESALES');
    }
  }, [isPreSales, isAdmin, targetLayer]);

  useEffect(() => {
    if (!categoryBreakdownParams || !categoryBreakdownCacheKey) {
      setBreakdownLoading(false);
      return;
    }

    if (categoryBreakdownCache[categoryBreakdownCacheKey]) {
      return;
    }

    let isCancelled = false;
    setBreakdownLoading(true);
    setBreakdownError(null);

    const typedParams = {
      ...categoryBreakdownParams,
      category: categoryBreakdownParams.category as TargetCategory,
    };

    targetsApi
      .getCategoryBreakdown(typedParams)
      .then((data) => {
        if (isCancelled) return;
        setCategoryBreakdownCache((prev) => ({
          ...prev,
          [categoryBreakdownCacheKey]: data,
        }));
      })
      .catch((err: any) => {
        if (isCancelled) return;
        console.error('Failed to load category breakdown', err);
        setBreakdownError(err?.response?.data?.message || err?.message || 'Failed to load category breakdown.');
      })
      .finally(() => {
        if (!isCancelled) {
          setBreakdownLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [categoryBreakdownParams, categoryBreakdownCacheKey, categoryBreakdownCache, viewMode]);

  const loadFilters = async () => {
    try {
      const data = await targetsApi.getFilters();
      setFiltersMeta(data);
      // Set default year to current year
      const currentYear = new Date().getFullYear();
      setCustomYear(currentYear);
      setFromYear(currentYear);
      setToYear(currentYear);
    } catch (err: any) {
      console.error('Failed to load filters', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load filters.');
    }
  };

  const loadSalesUsers = async () => {
    try {
      const users = await targetsApi.getSalesUsers();
      // Backend may send an isAccessibleForTargets flag; when present, use it to
      // restrict the list, otherwise include all users for backwards compatibility.
      const filtered = users.filter((u: any) => {
        const flag = (u as any)?.isAccessibleForTargets;
        return flag === undefined || !!flag;
      });
      setSalesUsers(filtered);
    } catch (err: any) {
      console.error('Failed to load sales users', err);
    }
  };

  const loadPreSalesUsers = async () => {
    try {
      const users = await usersApi.list();
      // Apply isAccessibleForTargets when provided by backend.
      const accessibleUsers = users.filter((u: any) => {
        const flag = (u as any)?.isAccessibleForTargets;
        return flag === undefined || !!flag;
      });
      const presales = accessibleUsers.filter((u) => u.role === 'PRESALES');
      setPreSalesUsers(presales);
      setAllUsers(accessibleUsers);
    } catch (err: any) {
      console.error('Failed to load pre-sales users', err);
    }
  };

  const loadDashboard = async () => {
    if (!filtersMeta) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await targetsApi.getDashboard(filterParams);
      setDashboardData(data);
    } catch (err: any) {
      console.error('Failed to load dashboard', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const safeNumber = (value?: number): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }
    return value;
  };

  const formatPercent = (value?: number): string => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '0.0%';
    }
    return `${value.toFixed(1)}%`;
  };

  const formatCurrencyOrDash = (value?: number, showDashForZero = false): string => {
    const amount = safeNumber(value);
    if (showDashForZero && amount === 0) {
      return '-';
    }
    return formatCurrency(amount);
  };

  const formatPercentOrDash = (value?: number, showDashForZero = false): string => {
    if ((value === undefined || Number.isNaN(value) || value === 0) && showDashForZero) {
      return '-';
    }
    return formatPercent(value);
  };

  // For Pre-Sales monthly totals, targets/achieved are counts (divert deals), not currency
  const formatCountOrDash = (value?: number): string => {
    const n = safeNumber(value);
    return n === 0 ? '-' : n.toString();
  };

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

  const getCategoryLabel = (category: TargetCategory): string => {
    const map: Record<TargetCategory, string> = {
      PHOTOGRAPHY: 'Photography',
      MAKEUP: 'Makeup',
      PLANNING_AND_DECOR: 'Planning & Decor',
    };
    return map[category] || category;
  };

  // Group deals by category (used for the Sales "Won Deals - {category}" tables)
  const dealsByCategory = useMemo((): Partial<Record<TargetCategory, DealSummary[]>> => {
    if (!dashboardData) return {};
    const grouped: Record<TargetCategory, DealSummary[]> = {
      PHOTOGRAPHY: [],
      MAKEUP: [],
      PLANNING_AND_DECOR: [],
    };
    dashboardData.deals.forEach((deal) => {
      if (grouped[deal.category]) {
        grouped[deal.category].push(deal);
      }
    });
    return grouped;
  }, [dashboardData]);

  // Get category tables from dashboard data.
  // For multi-month presets (e.g. half-yearly, quarterly, yearly), if the main
  // dashboard response doesn't include aggregated rows for the Users view, we
  // fall back to aggregating from the category breakdown data (when available)
  // so that category managers still see totals instead of an empty table.
  const getCategoryTables = (): CategoryTable[] => {
    if (!dashboardData) return [];

    const hasMonthBlocks = dashboardData.months && dashboardData.months.length > 0;

    if (hasMonthBlocks) {
      const firstMonth = dashboardData.months[0];
      const hasAnyRows = firstMonth.categories?.some((cat) => cat.rows && cat.rows.length > 0);

      if (hasAnyRows) {
        return firstMonth.categories;
      }
    }

    // If there are no rows in the main dashboard data (for the current preset),
    // try to build aggregated rows from the category breakdown data.
    if (categoryBreakdownData && categoryBreakdownParams?.category) {
      const aggregatedUsers = new Map<number, TargetRow>();

      categoryBreakdownData.months.forEach((monthBlock) => {
        monthBlock.users.forEach((userRow) => {
          const existing = aggregatedUsers.get(userRow.userId);
          if (!existing) {
            // Clone the row so we don't mutate the cached breakdown data
            aggregatedUsers.set(userRow.userId, { ...userRow });
          } else {
            existing.totalTarget = safeNumber(existing.totalTarget) + safeNumber(userRow.totalTarget);
            existing.achieved = safeNumber(existing.achieved) + safeNumber(userRow.achieved);
            existing.totalDeals = safeNumber(existing.totalDeals) + safeNumber(userRow.totalDeals);
            existing.incentiveAmount =
              safeNumber(existing.incentiveAmount) + safeNumber(userRow.incentiveAmount);
          }
        });
      });

      const rows: TargetRow[] = Array.from(aggregatedUsers.values()).map((row) => {
        const totalTarget = safeNumber(row.totalTarget);
        const achieved = safeNumber(row.achieved);
        const achievementPercent = totalTarget > 0 ? (achieved / totalTarget) * 100 : 0;
        return {
          ...row,
          totalTarget,
          achieved,
          achievementPercent,
        };
      });

      const category = categoryBreakdownParams.category as TargetCategory;
      return [
        {
          category,
          categoryLabel: getCategoryLabel(category),
          rows,
        },
      ];
    }

    // Fallback: no data available
    return [];
  };

  // Get current month and year from dashboard data
  const getCurrentMonthYear = () => {
    if (!dashboardData || dashboardData.months.length === 0) {
      return { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
    }
    const firstMonth = dashboardData.months[0];
    return { month: firstMonth.month, year: firstMonth.year };
  };

  // Handle row click to edit target
  const handleRowClick = async (row: TargetRow, category: TargetCategory) => {
    if (!isAdmin) return; // Only admins can edit
    
    const { month, year } = getCurrentMonthYear();
    
    try {
      // Fetch target records for this category and time period
      const allTargets = await targetsApi.list({
        category,
        month,
        year,
      });

      // Filter by userId client-side (since API doesn't support userId filter)
      const userTargets = allTargets.filter((target) => target.userId === row.userId);

      // If multiple targets exist, we'll edit the first one (or aggregate them)
      // For now, let's edit the first target found
      if (userTargets.length > 0) {
        setEditingTarget(userTargets[0]);
        setIsEditTargetModalOpen(true);
      } else {
        // No target found, show error with a timeout to auto-clear
        const errorMsg = `No target found for ${row.userName} in ${getCategoryLabel(category)} for ${month}/${year}. Please create a new target.`;
        setError(errorMsg);
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      console.error('Failed to load target for editing', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load target for editing.');
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === viewMode) return;
    if (mode !== 'USERS' && !canUseCategoryBreakdown) return;
    setViewMode(mode);
  };

  const categoryTables = getCategoryTables();

  // For SALES users, compute the set of pre‑sales user IDs that report to them.
  const managedPreSalesIds = useMemo(() => {
    if (!isSales || !user?.userId) return new Set<number>();
    const ids = preSalesUsers
      .filter((u) => u.managerId === user.userId)
      .map((u) => u.id);
    return new Set<number>(ids);
  }, [isSales, user, preSalesUsers]);

  const filteredCategoryTables = useMemo(() => {
    const applyRowFilters = (rows: TargetRow[]): TargetRow[] => {
      // First filter by Sales vs Pre‑Sales layer
      let result = filterRowsByTargetLayer(rows, targetLayer);

      // Then apply role-based scoping
      if (!isAdmin && isSales && user?.userId) {
        if (targetLayer === 'SALES') {
          // Sales tab: show only the logged‑in sales user
          result = result.filter((row) => row.userId === user.userId);
        } else {
          // Pre‑Sales tab: show only pre‑sales who report to this sales user
          result = result.filter((row) => managedPreSalesIds.has(row.userId));
        }
      }
      if (!isAdmin && isPreSales && user?.userId) {
        // Pre-Sales users always see only their own row
        result = result.filter((row) => row.userId === user.userId);
      }

      return result;
    };

    if (effectiveSelectedCategory === 'all') {
      // Return all categories in order
      return categoryOrder.map((cat) => {
        const table = categoryTables.find((t) => t.category === cat);
        if (!table) {
          return { category: cat, categoryLabel: getCategoryLabel(cat), rows: [] };
        }
        const filteredRows = applyRowFilters(table.rows);
        return { ...table, rows: filteredRows };
      });
    }

    const table = categoryTables.find((t) => t.category === effectiveSelectedCategory);
    if (!table) return [];
    const filteredRows = applyRowFilters(table.rows);
    return [{ ...table, rows: filteredRows }];
  }, [
    categoryTables,
    effectiveSelectedCategory,
    targetLayer,
    isAdmin,
    isSales,
    user,
    managedPreSalesIds,
    categoryOrder,
  ]);

  // For category manager, sales, and pre-sales users, restrict user dropdown to users that belong
  // to their visible category rows. For others, keep full list but append "- me"
  // to their own name where applicable.
  const currentUserOptions = useMemo(() => {
    const isScopedByVisibleRows = !isAdmin && (isCategoryManager || isSales || isPreSales);

    // Collect userIds that are visible in the current tables (for the active layer)
    const visibleUserIds = new Set<number>();
    if (isScopedByVisibleRows) {
      filteredCategoryTables.forEach((categoryTable) => {
        categoryTable.rows.forEach((row) => {
          visibleUserIds.add(row.userId);
        });
      });
    }

    const mapSalesUserName = (name: string, id: number | string) => {
      if (!user?.userId) return name;
      const currentId = user.userId.toString();
      return id.toString() === currentId && (isSales || isPreSales)
        ? `${name} - me`
        : name;
    };

    // For category managers and sales users, build the user list directly from the
    // visible table rows, so that the "All Users" dropdown always reflects the same
    // people shown in the table, even if /sales-users or /users endpoints are
    // filtered differently.
    if (isScopedByVisibleRows) {
      const uniqueUsers = new Map<number, { id: number; name: string }>();

      filteredCategoryTables.forEach((categoryTable) => {
        categoryTable.rows.forEach((row) => {
          // filteredCategoryTables is already scoped by targetLayer,
          // so we don't have to check userRole here.
          if (!uniqueUsers.has(row.userId)) {
            uniqueUsers.set(row.userId, {
              id: row.userId,
              name: mapSalesUserName(row.userName, row.userId),
            });
          }
        });
      });

      return Array.from(uniqueUsers.values());
    }

    if (targetLayer === 'PRESALES') {
      return preSalesUsers
        .filter((u) => !isScopedByVisibleRows || visibleUserIds.has(u.id))
        .map((u) => {
          const baseName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
          return {
            id: u.id,
            name: mapSalesUserName(baseName, u.id),
          };
        });
    }

    return salesUsers
      .filter((u) => !isScopedByVisibleRows || visibleUserIds.has(u.userId))
      .map((u) => ({
        id: u.userId,
        name: mapSalesUserName(u.userName, u.userId),
      }));
  }, [
    targetLayer,
    preSalesUsers,
    salesUsers,
    filteredCategoryTables,
    isCategoryManager,
    isSales,
    isAdmin,
    isPreSales,
    user,
  ]);

  // For non-admins (including category managers), if backend has already restricted the
  // dashboard to a specific category, use that as the initial selected category so their
  // own category shows by default.
  useEffect(() => {
    if (
      !isAdmin &&
      dashboardData?.filters?.category &&
      selectedCategory === 'all'
    ) {
      setSelectedCategory(dashboardData.filters.category);
    }
  }, [dashboardData?.filters?.category, isAdmin, selectedCategory]);

  /**
   * Filter and recompute monthly breakdown data based on targetLayer.
   * When targetLayer === 'PRESALES', we only aggregate Pre-Sales users.
   * This ensures we show real database data, not mixed Sales + Pre-Sales totals.
   */
  const sortedBreakdownMonths = useMemo(() => {
    if (!categoryBreakdownData?.months) return [];
    
    const months = categoryBreakdownData.months.map((monthBlock) => {
      // Filter users by targetLayer
      const filteredUsers = filterRowsByTargetLayer(monthBlock.users, targetLayer);
      
      if (filteredUsers.length === 0) {
        // No users for this layer in this month - return zeros
        return {
          ...monthBlock,
          totalTarget: 0,
          achieved: 0,
          achievementPercent: 0,
          totalDeals: 0,
          incentiveAmount: 0,
          users: [],
        };
      }
      
      // Recompute totals from filtered users only
      const totals = filteredUsers.reduce(
        (acc, user) => ({
          totalTarget: acc.totalTarget + safeNumber(user.totalTarget),
          achieved: acc.achieved + safeNumber(user.achieved),
          totalDeals: acc.totalDeals + safeNumber(user.totalDeals),
          incentiveAmount: acc.incentiveAmount + safeNumber(user.incentiveAmount),
        }),
        { totalTarget: 0, achieved: 0, totalDeals: 0, incentiveAmount: 0 },
      );
      
      const achievementPercent =
        totals.totalTarget > 0 ? (totals.achieved / totals.totalTarget) * 100 : 0;
      
      return {
        ...monthBlock,
        totalTarget: totals.totalTarget,
        achieved: totals.achieved,
        achievementPercent,
        totalDeals: totals.totalDeals,
        incentiveAmount: totals.incentiveAmount,
        users: filteredUsers,
      };
    });
    
    return months.sort((a, b) => {
      if (a.year === b.year) {
        return a.month - b.month;
      }
      return a.year - b.year;
    });
  }, [categoryBreakdownData, targetLayer]);
  
  /**
   * Recompute overall totals from filtered monthly data.
   */
  const recomputedTotals = useMemo(() => {
    if (sortedBreakdownMonths.length === 0) {
      return categoryBreakdownData?.totals || {
        totalTarget: 0,
        achieved: 0,
        achievementPercent: 0,
        totalDeals: 0,
        incentivePercent: 0,
        incentiveAmount: 0,
      };
    }
    
    const totals = sortedBreakdownMonths.reduce(
      (acc, month) => ({
        totalTarget: acc.totalTarget + safeNumber(month.totalTarget),
        achieved: acc.achieved + safeNumber(month.achieved),
        totalDeals: acc.totalDeals + safeNumber(month.totalDeals),
        incentiveAmount: acc.incentiveAmount + safeNumber(month.incentiveAmount),
      }),
      { totalTarget: 0, achieved: 0, totalDeals: 0, incentiveAmount: 0 },
    );
    
    const achievementPercent =
      totals.totalTarget > 0 ? (totals.achieved / totals.totalTarget) * 100 : 0;
    
    return {
      totalTarget: totals.totalTarget,
      achieved: totals.achieved,
      achievementPercent,
      totalDeals: totals.totalDeals,
      incentivePercent: 0, // Not used in display
      incentiveAmount: totals.incentiveAmount,
    };
  }, [sortedBreakdownMonths, categoryBreakdownData]);

  const gridRowSize = selectedTimePreset === 'THIS_QUARTER' ? 1 : 2;
  const gridMonthsWithIndex = useMemo(
    () => sortedBreakdownMonths.map((block, index) => ({ block, index })),
    [sortedBreakdownMonths],
  );

  const gridRows = useMemo(() => {
    if (!gridMonthsWithIndex.length) return [];
    return chunkArray(gridMonthsWithIndex, gridRowSize);
  }, [gridMonthsWithIndex, gridRowSize]);

  // Derive the category for a category manager based on which Sales users report to them
  // and which category tables those Sales users appear in. We only lock to a category
  // when exactly one such category can be determined.
  useEffect(() => {
    if (!isCategoryManager || isAdmin) return;
    if (autoCategoryForCategoryManager) return;
    if (!dashboardData || !dashboardData.months || dashboardData.months.length === 0) return;
    if (!allUsers.length || !user?.userId) return;

    const managerId = user.userId;
    const managedSalesIds = new Set(
      allUsers
        .filter((u) => u.role === 'SALES' && u.managerId === managerId)
        .map((u) => u.id),
    );

    if (managedSalesIds.size === 0) {
      return;
    }

    const tables = getCategoryTables();
    const categoriesForManager = new Set<TargetCategory>();

    tables.forEach((table) => {
      const hasManagedSales = table.rows.some(
        (row) =>
          managedSalesIds.has(row.userId) &&
          // When userRole is present, ensure we are looking at Sales rows only
          (!row.userRole || row.userRole === 'SALES'),
      );
      if (hasManagedSales) {
        categoriesForManager.add(table.category);
      }
    });

    if (categoriesForManager.size === 1) {
      const onlyCategory = Array.from(categoriesForManager)[0];
      setAutoCategoryForCategoryManager(onlyCategory);
      setSelectedCategory((prev) => (prev === 'all' ? onlyCategory : prev));
    }
  }, [
    isCategoryManager,
    isAdmin,
    autoCategoryForCategoryManager,
    dashboardData,
    allUsers,
    user,
  ]);

  // Derive the category for a Sales user based on where they have targets.
  useEffect(() => {
    if (!isSales || isAdmin) return;
    if (autoCategoryForSales) return;
    if (!dashboardData || !dashboardData.months || dashboardData.months.length === 0) return;
    if (!user?.userId) return;

    const categoriesForSales = new Set<TargetCategory>();
    dashboardData.months.forEach((monthBlock) => {
      (monthBlock.categories || []).forEach((categoryTable) => {
        (categoryTable.rows || []).forEach((row) => {
          if (
            row.userId === user.userId &&
            // When userRole is present, ensure we are looking at Sales rows only
            (!row.userRole || row.userRole === 'SALES')
          ) {
            categoriesForSales.add(categoryTable.category);
          }
        });
      });
    });

    if (categoriesForSales.size === 1) {
      const onlyCategory = Array.from(categoriesForSales)[0];
      setAutoCategoryForSales(onlyCategory);
      setSelectedCategory((prev) => (prev === 'all' ? onlyCategory : prev));
    }
  }, [isSales, isAdmin, autoCategoryForSales, dashboardData, user]);

  // Derive the category for a Pre-Sales user based on where they have targets.
  useEffect(() => {
    if (!isPreSales || isAdmin) return;
    if (autoCategoryForPreSales) return;
    if (!dashboardData || !dashboardData.months || dashboardData.months.length === 0) return;
    if (!user?.userId) return;

    const categoriesForPreSales = new Set<TargetCategory>();
    dashboardData.months.forEach((monthBlock) => {
      (monthBlock.categories || []).forEach((categoryTable) => {
        (categoryTable.rows || []).forEach((row) => {
          if (
            row.userId === user.userId &&
            // When userRole is present, ensure we are looking at Pre-Sales rows only
            (!row.userRole || row.userRole === 'PRESALES')
          ) {
            categoriesForPreSales.add(categoryTable.category);
          }
        });
      });
    });

    if (categoriesForPreSales.size === 1) {
      const onlyCategory = Array.from(categoriesForPreSales)[0];
      setAutoCategoryForPreSales(onlyCategory);
      setSelectedCategory((prev) => (prev === 'all' ? onlyCategory : prev));
    }
  }, [isPreSales, isAdmin, autoCategoryForPreSales, dashboardData, user]);

  if (loading && !dashboardData) {
    return <Loader message="Loading targets..." size="large" />;
  }

  return (
    <div className="targets-page">
      <div className="targets-header">
        <h1 className="targets-title">Target Dashboard</h1>
      </div>

      {/* Filters */}
      <div className="targets-filters-row">
        <div className="targets-filters">
          <div className="targets-filter-group">
            <label htmlFor="user-filter">Select Users</label>
            <select
              id="user-filter"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="targets-filter-select"
            >
              <option value="">All Users</option>
              {currentUserOptions.map((user) => (
                <option key={user.id} value={user.id.toString()}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div className="targets-filter-group">
            <label htmlFor="category-filter">Category</label>
            <select
              id="category-filter"
              value={effectiveSelectedCategory}
              onChange={(e) => {
                if (
                  restrictedCategoryForCategoryManager ||
                  restrictedCategoryForSales ||
                  restrictedCategoryForPreSales
                ) {
                  // When the backend or auto-derivation has locked the category for
                  // a category manager, sales user, or pre-sales user, ignore manual changes.
                  return;
                }
                setSelectedCategory(e.target.value as TargetCategory | 'all');
              }}
              className="targets-filter-select"
              disabled={
                !!restrictedCategoryForCategoryManager ||
                !!restrictedCategoryForSales ||
                !!restrictedCategoryForPreSales
              }
            >
              {!restrictedCategoryForCategoryManager &&
                !restrictedCategoryForSales &&
                !restrictedCategoryForPreSales && <option value="all">All Categories</option>}
              {filtersMeta?.categories
                .filter((cat) =>
                  restrictedCategoryForCategoryManager
                    ? cat.code === restrictedCategoryForCategoryManager
                    : restrictedCategoryForSales
                    ? cat.code === restrictedCategoryForSales
                    : restrictedCategoryForPreSales
                    ? cat.code === restrictedCategoryForPreSales
                    : true,
                )
                .map((cat) => (
                  <option key={cat.code} value={cat.code}>
                    {cat.label}
                  </option>
                ))}
            </select>
          </div>

          <div className="targets-filter-group">
            <label htmlFor="time-preset-filter">Time Period</label>
            <select
              id="time-preset-filter"
              value={selectedTimePreset}
              onChange={(e) => setSelectedTimePreset(e.target.value as TimePreset)}
              className="targets-filter-select"
            >
              {availableTimePresets.map((preset) => (
                <option key={preset.code} value={preset.code}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {selectedTimePreset === 'CUSTOM_MONTH' && (
            <>
              <div className="targets-filter-group">
                <label htmlFor="custom-month">Month</label>
                <select
                  id="custom-month"
                  value={customMonth}
                  onChange={(e) => setCustomMonth(Number(e.target.value))}
                  className="targets-filter-select"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <option key={month} value={month}>
                      {new Date(2000, month - 1).toLocaleString('en-US', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="targets-filter-group">
                <label htmlFor="custom-year">Year</label>
                <select
                  id="custom-year"
                  value={customYear}
                  onChange={(e) => setCustomYear(Number(e.target.value))}
                  className="targets-filter-select"
                >
                  {Array.from({ length: 10 }, (_, i) => filtersMeta!.minYear + i).map((year) => (
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
              <div className="targets-filter-group">
                <label htmlFor="from-month">From Month</label>
                <select
                  id="from-month"
                  value={fromMonth}
                  onChange={(e) => setFromMonth(Number(e.target.value))}
                  className="targets-filter-select"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <option key={month} value={month}>
                      {new Date(2000, month - 1).toLocaleString('en-US', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="targets-filter-group">
                <label htmlFor="from-year">From Year</label>
                <select
                  id="from-year"
                  value={fromYear}
                  onChange={(e) => setFromYear(Number(e.target.value))}
                  className="targets-filter-select"
                >
                  {Array.from({ length: 10 }, (_, i) => filtersMeta!.minYear + i).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div className="targets-filter-group">
                <label htmlFor="to-month">To Month</label>
                <select
                  id="to-month"
                  value={toMonth}
                  onChange={(e) => setToMonth(Number(e.target.value))}
                  className="targets-filter-select"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <option key={month} value={month}>
                      {new Date(2000, month - 1).toLocaleString('en-US', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="targets-filter-group">
                <label htmlFor="to-year">To Year</label>
                <select
                  id="to-year"
                  value={toYear}
                  onChange={(e) => setToYear(Number(e.target.value))}
                  className="targets-filter-select"
                >
                  {Array.from({ length: 10 }, (_, i) => filtersMeta!.minYear + i).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="targets-actions">
          <div className="targets-actions-main">
            {isAdmin && (
              <button
                type="button"
                className="targets-set-target-btn"
                onClick={() => setIsSetTargetModalOpen(true)}
                disabled={!filtersMeta}
              >
                <span className="targets-set-target-plus">+</span>
                <span>Set Target</span>
              </button>
            )}
            <div
              className="targets-view-toggle targets-view-toggle-icons"
              role="group"
              aria-label="Select target view mode"
            >
              {VIEW_MODE_OPTIONS.map((option) => {
                const disabled = option.requiresBreakdown && !canUseCategoryBreakdown;
                const Icon = VIEW_MODE_ICONS[option.value];
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`targets-view-toggle-btn targets-view-toggle-icon-btn ${
                      viewMode === option.value ? 'active' : ''
                    }`}
                    onClick={() => handleViewModeChange(option.value)}
                    disabled={disabled}
                    aria-label={option.label}
                  >
                    <span className="targets-view-toggle-icon">
                      <Icon />
                    </span>
                    <span className="targets-view-toggle-icon-label">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {!isPreSales && (
            <div className="targets-layer-toggle">
              <div className="targets-view-toggle">
                <button
                  type="button"
                  className={`targets-view-toggle-btn ${targetLayer === 'SALES' ? 'active' : ''}`}
                  onClick={() => setTargetLayer('SALES')}
                >
                  Sales
                </button>
                <button
                  type="button"
                  className={`targets-view-toggle-btn ${targetLayer === 'PRESALES' ? 'active' : ''}`}
                  onClick={() => setTargetLayer('PRESALES')}
                >
                  Pre-Sales
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="targets-error">
          {error}
        </div>
      )}

      {viewMode === 'USERS' ? (
        <>
          {targetLayer === 'SALES' && (
            <div className="targets-tables-container">
              {filteredCategoryTables.map((categoryTable) => (
                <div key={categoryTable.category} className="targets-category-section">
                  {/* Category Table - Sales */}
                  <div className="targets-table-wrapper">
                    <table className="targets-table">
                      <thead>
                        <tr className="targets-table-category-header">
                          <th colSpan={6} className="targets-category-title">
                            {categoryTable.categoryLabel}
                          </th>
                        </tr>
                        <tr className="targets-table-header-row">
                          <th className="targets-table-header">Name</th>
                          <th className="targets-table-header">Target</th>
                          <th className="targets-table-header">Achieved</th>
                          <th className="targets-table-header">%</th>
                          <th className="targets-table-header">Total Deals</th>
                          <th className="targets-table-header">Incentive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryTable.rows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="targets-table-empty">
                              No targets set for this category
                            </td>
                          </tr>
                        ) : (
                          categoryTable.rows.map((row) => (
                            <tr
                              key={row.userId}
                              className={`targets-table-row ${isAdmin ? 'targets-table-row-editable' : ''}`}
                              onClick={() => isAdmin && handleRowClick(row, categoryTable.category)}
                              style={isAdmin ? { cursor: 'pointer' } : {}}
                            >
                              <td className="targets-table-cell targets-cell-name">{row.userName}</td>
                              <td className="targets-table-cell targets-cell-target">
                                {formatCurrency(row.totalTarget)}
                              </td>
                              <td className="targets-table-cell targets-cell-achieved">
                                {formatCurrency(row.achieved)}
                              </td>
                              <td className="targets-table-cell targets-cell-percent">
                                {formatPercent(row.achievementPercent)}
                              </td>
                              <td className="targets-table-cell targets-cell-deals">
                                {row.totalDeals}
                              </td>
                              <td className="targets-table-cell targets-cell-incentive">
                                {formatCurrency(row.incentiveAmount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Deals List for this Category (Sales only) */}
                  {dealsByCategory[categoryTable.category] &&
                    (dealsByCategory[categoryTable.category]?.length ?? 0) > 0 && (
                      <div className="targets-deals-section">
                        <h3 className="targets-deals-title">
                          Won Deals - {categoryTable.categoryLabel}
                        </h3>
                        <div className="targets-deals-table-wrapper">
                          <table className="targets-deals-table">
                            <thead>
                              <tr className="targets-deals-header-row">
                                <th className="targets-deals-header">Deal Name</th>
                                <th className="targets-deals-header">Salesperson</th>
                                <th className="targets-deals-header">Instagram ID</th>
                                <th className="targets-deals-header">Deal Value</th>
                                <th className="targets-deals-header">Commission</th>
                                <th className="targets-deals-header">Source</th>
                                <th className="targets-deals-header">Organization</th>
                                <th className="targets-deals-header">Wedding Date</th>
                                <th className="targets-deals-header">Wedding Venue</th>
                                <th className="targets-deals-header">Phone</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(dealsByCategory[categoryTable.category] || []).map(
                                (deal: DealSummary) => (
                                  <tr key={deal.dealId} className="targets-deals-row">
                                    <td className="targets-deals-cell">{deal.dealName}</td>
                                    <td className="targets-deals-cell">
                                      {deal.userName || '-'}
                                    </td>
                                    <td className="targets-deals-cell">
                                      {deal.instagramId || '-'}
                                    </td>
                                    <td className="targets-deals-cell">
                                      {formatCurrency(deal.dealValue)}
                                    </td>
                                    <td className="targets-deals-cell">
                                      {formatCurrency(deal.commissionAmount)}
                                    </td>
                                    <td className="targets-deals-cell">
                                      {deal.dealSource || deal.personSource || '-'}
                                    </td>
                                    <td className="targets-deals-cell">
                                      {deal.organization || '-'}
                                    </td>
                                    <td className="targets-deals-cell">
                                      {formatDate(deal.eventDate)}
                                    </td>
                                    <td className="targets-deals-cell">
                                      {deal.venue || '-'}
                                    </td>
                                    <td className="targets-deals-cell">
                                      {deal.phoneNumber || '-'}
                                    </td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}

          {targetLayer === 'PRESALES' && (
            <div className="targets-tables-container">
              {filteredCategoryTables.map((categoryTable) => (
                <div key={categoryTable.category} className="targets-category-section">
                  {/* Category Table for Pre-Sales */}
                  <div className="targets-table-wrapper">
                    <table className="targets-table">
                      <thead>
                        <tr className="targets-table-category-header">
                          <th colSpan={6} className="targets-category-title">
                            {categoryTable.categoryLabel} - Pre-Sales
                          </th>
                        </tr>
                        <tr className="targets-table-header-row">
                          <th className="targets-table-header">Name</th>
                      <th className="targets-table-header">Target</th>
                      <th className="targets-table-header">Achieved</th>
                          <th className="targets-table-header">%</th>
                          <th className="targets-table-header">Total Deals</th>
                          <th className="targets-table-header">Incentive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryTable.rows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="targets-table-empty">
                              No targets set for this category
                            </td>
                          </tr>
                        ) : (
                          categoryTable.rows.map((row) => (
                            <tr
                              key={row.userId}
                              className={`targets-table-row ${isAdmin ? 'targets-table-row-editable' : ''}`}
                              onClick={() => isAdmin && handleRowClick(row, categoryTable.category)}
                              style={isAdmin ? { cursor: 'pointer' } : {}}
                            >
                              <td className="targets-table-cell targets-cell-name">{row.userName}</td>
                              <td className="targets-table-cell targets-cell-target">
                                {row.totalTarget}
                              </td>
                              <td className="targets-table-cell targets-cell-achieved">
                                {row.achieved}
                              </td>
                              <td className="targets-table-cell targets-cell-percent">
                                {formatPercent(row.achievementPercent)}
                              </td>
                              <td className="targets-table-cell targets-cell-deals">
                                {row.totalDeals}
                              </td>
                              <td className="targets-table-cell targets-cell-incentive">
                                {formatCurrency(row.incentiveAmount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="targets-breakdown-container">
          {breakdownError && (
            <div className="targets-error targets-breakdown-error">
              {breakdownError}
            </div>
          )}

          {breakdownLoading && !categoryBreakdownData && (
            <Loader message="Loading category breakdown..." size="medium" />
          )}

          {!breakdownLoading && !categoryBreakdownData && (
            <div className="targets-breakdown-empty">
              Select a supported preset and category to view monthly insights.
            </div>
          )}

          {categoryBreakdownData && viewMode === 'MONTHLY_TOTALS' && (
            <div className="targets-breakdown-table-wrapper">
              <table className="targets-breakdown-table">
                <thead>
                  <tr className="targets-breakdown-header-row">
                    <th>Month</th>
                    <th>Target</th>
                    <th>Achieved</th>
                    <th>%</th>
                    <th>Total Deals</th>
                    <th>Incentive</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBreakdownMonths.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="targets-breakdown-empty-row">
                        No monthly data available for this selection.
                      </td>
                    </tr>
                  ) : (
                    sortedBreakdownMonths.map((monthBlock) => (
                      <tr key={`${monthBlock.year}-${monthBlock.month}`}>
                        <td className="targets-breakdown-cell targets-breakdown-cell-month">
                          {formatMonthName(monthBlock.month)}
                        </td>
                        <td className="targets-breakdown-cell targets-breakdown-cell-target">
                          {targetLayer === 'PRESALES'
                            ? formatCountOrDash(monthBlock.totalTarget)
                            : formatCurrencyOrDash(monthBlock.totalTarget, true)}
                        </td>
                        <td className="targets-breakdown-cell targets-breakdown-cell-achieved">
                          {targetLayer === 'PRESALES'
                            ? formatCountOrDash(monthBlock.achieved)
                            : formatCurrency(safeNumber(monthBlock.achieved))}
                        </td>
                        <td className="targets-breakdown-cell targets-breakdown-cell-percent">
                          {formatPercentOrDash(monthBlock.achievementPercent, true)}
                        </td>
                        <td className="targets-breakdown-cell targets-breakdown-cell-deals">
                          {safeNumber(monthBlock.totalDeals)}
                        </td>
                        <td className="targets-breakdown-cell targets-breakdown-cell-incentive">
                          {formatCurrencyOrDash(monthBlock.incentiveAmount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {recomputedTotals && (
                  <tfoot>
                    <tr className="targets-breakdown-row-total">
                      <td className="targets-breakdown-cell targets-breakdown-cell-month">Total</td>
                      <td className="targets-breakdown-cell targets-breakdown-cell-target">
                        {targetLayer === 'PRESALES'
                          ? formatCountOrDash(recomputedTotals.totalTarget)
                          : formatCurrencyOrDash(recomputedTotals.totalTarget)}
                      </td>
                      <td className="targets-breakdown-cell targets-breakdown-cell-achieved">
                        {targetLayer === 'PRESALES'
                          ? formatCountOrDash(recomputedTotals.achieved)
                          : formatCurrencyOrDash(recomputedTotals.achieved)}
                      </td>
                      <td className="targets-breakdown-cell targets-breakdown-cell-percent">
                        {formatPercentOrDash(recomputedTotals.achievementPercent)}
                      </td>
                      <td className="targets-breakdown-cell targets-breakdown-cell-deals">
                        {safeNumber(recomputedTotals.totalDeals)}
                      </td>
                      <td className="targets-breakdown-cell targets-breakdown-cell-incentive">
                        {formatCurrencyOrDash(recomputedTotals.incentiveAmount)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {categoryBreakdownData && viewMode === 'MONTHLY_GRID' && sortedBreakdownMonths.length > 0 && (
            <div className="targets-grid">
              {gridRows.map((row, rowIndex) => (
                <div className="targets-grid-row" key={`grid-row-${rowIndex}`}>
                  {row.map(({ block: monthBlock }) => {
                    const headerColorClass = GRID_HEADER_CLASSES[rowIndex % GRID_HEADER_CLASSES.length];
                    return (
                      <div className="targets-grid-card" key={`${monthBlock.year}-${monthBlock.month}`}>
                        <div className={`targets-grid-card-header ${headerColorClass}`}>
                          <div className="targets-grid-card-title">{formatMonthName(monthBlock.month)}</div>
                        </div>
                        <div className="targets-grid-mini-table-wrapper">
                          <table className="targets-grid-mini-table">
                            <thead>
                              <tr>
                                <th className="targets-grid-header targets-grid-th-name">
                                  Name
                                </th>
                                <th className="targets-grid-header targets-grid-th-target">Target</th>
                                <th className="targets-grid-header targets-grid-th-achieved">Achieved</th>
                                <th className="targets-grid-header targets-grid-th-percent">%</th>
                                <th className="targets-grid-header targets-grid-th-deals">
                                  {targetLayer === 'PRESALES' ? 'Total Deals' : 'Deals'}
                                </th>
                                <th className="targets-grid-header targets-grid-th-incentive">Incentive</th>
                              </tr>
                            </thead>
                            <tbody>
                              {monthBlock.users.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="targets-grid-empty">
                                    No users for this month.
                                  </td>
                                </tr>
                              ) : (
                                filterRowsByTargetLayer(monthBlock.users, targetLayer).map((userRow) => (
                                  <tr
                                    key={`${monthBlock.year}-${monthBlock.month}-${userRow.userId}`}
                                    className={
                                      isAdmin
                                        ? 'targets-grid-user-row targets-grid-user-row-editable'
                                        : 'targets-grid-user-row'
                                    }
                                    onClick={() =>
                                      isAdmin &&
                                      effectiveSelectedCategory !== 'all' &&
                                      handleRowClick(userRow, effectiveSelectedCategory as TargetCategory)
                                    }
                                    style={isAdmin ? { cursor: 'pointer' } : {}}
                                  >
                                    <td>{userRow.userName}</td>
                                    <td>
                                      {targetLayer === 'PRESALES'
                                        ? userRow.totalTarget
                                        : formatCurrency(userRow.totalTarget)}
                                    </td>
                                    <td>
                                      {targetLayer === 'PRESALES'
                                        ? userRow.achieved
                                        : formatCurrency(userRow.achieved)}
                                    </td>
                                    <td>{formatPercent(userRow.achievementPercent)}</td>
                                    <td>{userRow.totalDeals}</td>
                                    <td>{formatCurrency(userRow.incentiveAmount)}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {categoryBreakdownData &&
            viewMode === 'MONTHLY_GRID' &&
            sortedBreakdownMonths.length === 0 && (
              <div className="targets-breakdown-empty">
                No users found for the selected filters.
              </div>
            )}
        </div>
      )}

      {isAdmin && (
        <>
          <SetTargetModal
            isOpen={isSetTargetModalOpen}
            onClose={() => setIsSetTargetModalOpen(false)}
            onCreated={async () => {
              await loadDashboard();
            }}
            categories={filtersMeta?.categories ?? []}
            defaultAssigneeType={targetLayer === 'PRESALES' ? 'PRE_SALES' : 'SALES'}
          />
          {editingTarget && (
            <EditTargetModal
              isOpen={isEditTargetModalOpen}
              onClose={() => {
                setIsEditTargetModalOpen(false);
                setEditingTarget(null);
                setError(null);
              }}
              onUpdated={async () => {
                await loadDashboard();
              }}
              target={editingTarget}
              categories={filtersMeta?.categories ?? []}
            />
          )}
        </>
      )}
    </div>
  );
}

