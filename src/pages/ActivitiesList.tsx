import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { activitiesApi, type Activity, type PageResponse, type ActivityFilters } from '../services/activities';
import FilterDropdown, { type SavedFilter as DropdownSavedFilter } from '../components/FilterDropdown';
import FilterModal, { type FilterCondition } from '../components/FilterModal';
import ActivityModal, { type ActivityFormValues } from '../components/ActivityModal';
import ColumnMenu from '../components/ColumnMenu';
import BulkEditModal from '../components/BulkEditModal';
import { organizationsApi } from '../services/organizations';
import { usersApi } from '../services/users';
import { dealsApi } from '../services/deals';
import type { Organization } from '../types/organization';
import type { User } from '../types/user';
import { getStoredUser } from '../utils/authToken';
import '../components/SetTargetModal.css';

const tabOptions = ['All', 'To‑do', 'Overdue', 'Today', 'Tomorrow', 'This week', 'Next week', 'This month', 'Prev month', 'This year', 'Select period', 'Select Date'] as const;
const primaryTabs: Array<(typeof tabOptions)[number]> = ['All', 'Overdue', 'Today'];
type TabOption = (typeof tabOptions)[number];
type SummaryCardAction =
  | 'activityAll'
  | 'activityPending'
  | 'activityCompleted'
  | 'callAll'
  | 'callDone'
  | 'meetingAll'
  | 'meetingDone'
  | 'overdue';

export default function ActivitiesList() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activityRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [highlightedActivityId, setHighlightedActivityId] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadCountsAbortControllerRef = useRef<AbortController | null>(null);

  const [data, setData] = useState<PageResponse<Activity> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<'Activity' | 'Call' | 'Meeting scheduler'>('Activity');
  const [tab, setTab] = useState<TabOption>('Today');
  
  // Initialize filters with "Today" date range to avoid blank initial load
  const getInitialFilters = (): ActivityFilters => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const todayStr = `${day}/${month}/${year}`;
    return { page: 0, size: 25, dateFrom: todayStr, dateTo: todayStr };
  };
  
  const [filters, setFilters] = useState<ActivityFilters>(getInitialFilters());
  const filtersRef = useRef<ActivityFilters>(filters);
  
  // Keep filtersRef in sync with filters state
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isTabDropdownOpen, setIsTabDropdownOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  type SavedFilterOption = DropdownSavedFilter<FilterCondition>;
  const [savedFilters, setSavedFilters] = useState<SavedFilterOption[]>([]);
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);
  const [activeCustomFilters, setActiveCustomFilters] = useState<FilterCondition[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const hasHandledOpenModal = useRef(false);
  const [columnMenu, setColumnMenu] = useState<{
    isOpen: boolean;
    columnName: string;
    position: { top: number; left: number };
  } | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [isDateRangeModalOpen, setIsDateRangeModalOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [isSingleDateModalOpen, setIsSingleDateModalOpen] = useState(false);
  const [selectedSingleDate, setSelectedSingleDate] = useState<string>('');
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());
  const [selectedActivities, setSelectedActivities] = useState<Set<number>>(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ activity: Activity; x: number; y: number } | null>(null);
  const [overdueCount, setOverdueCount] = useState(0);
  const [callAssignedCount, setCallAssignedCount] = useState(0);
  const [callTakenCount, setCallTakenCount] = useState(0);
  const [meetingAssignedCount, setMeetingAssignedCount] = useState(0);
  const [meetingDoneCount, setMeetingDoneCount] = useState(0);
  const [totalCallDurationMinutes, setTotalCallDurationMinutes] = useState(0);
  const [activityTotalCount, setActivityTotalCount] = useState(0);
  const [activityPendingCount, setActivityPendingCount] = useState(0);
  const [activityCompletedCount, setActivityCompletedCount] = useState(0);
  const [dealsMap, setDealsMap] = useState<Map<number, string>>(new Map());
  const DEFAULT_CATEGORY_OPTIONS: Array<{ code: string; label: string }> = [
    { code: 'PHOTOGRAPHY', label: 'Photography' },
    { code: 'MAKEUP', label: 'Makeup' },
    { code: 'PLANNING_DECOR', label: 'Planning & Decor' },
  ];
  const defaultServiceCategoryCode = DEFAULT_CATEGORY_OPTIONS[0].code;
  const categoryLabelMap = useMemo(() => {
    return DEFAULT_CATEGORY_OPTIONS.reduce<Record<string, string>>((acc, option) => {
      acc[option.code] = option.label;
      return acc;
    }, {});
  }, []);
  const [categoryFilterOptions, setCategoryFilterOptions] = useState<Array<{ code: string; label: string }>>(DEFAULT_CATEGORY_OPTIONS);
  const [organizationOptions, setOrganizationOptions] = useState<Organization[]>([]);
  const [baseOrganizationOptions, setBaseOrganizationOptions] = useState<Organization[]>([]);
  const [managerOptions, setManagerOptions] = useState<User[]>([]);
  const [baseManagerOptions, setBaseManagerOptions] = useState<User[]>([]);
  // For ADMIN, CATEGORY_MANAGER, SALES, and PRESALES: support multi-select (array), for others: single select (string)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | string[]>('');
  const [selectedOrganizationFilter, setSelectedOrganizationFilter] = useState<string | number[]>('');
  const [selectedManagerFilter, setSelectedManagerFilter] = useState<string | number[]>('');
  const [showCategoryMultiSelect, setShowCategoryMultiSelect] = useState(false);
  const [showOrgMultiSelect, setShowOrgMultiSelect] = useState(false);
  const [showUserMultiSelect, setShowUserMultiSelect] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const categoryMultiSelectRef = useRef<HTMLDivElement>(null);
  const orgMultiSelectRef = useRef<HTMLDivElement>(null);
  const userMultiSelectRef = useRef<HTMLDivElement>(null);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<number, string>>({});
  const [durationEntries, setDurationEntries] = useState<Record<number, string>>({});
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [pendingDoneActivity, setPendingDoneActivity] = useState<Activity | null>(null);
  const [pendingDoneValue, setPendingDoneValue] = useState(false);
  const [pendingDurationValue, setPendingDurationValue] = useState('');
  const [pendingAttachmentFile, setPendingAttachmentFile] = useState<File | null>(null);
  const [pendingAttachmentPreview, setPendingAttachmentPreview] = useState<string | null>(null);
  const [pendingUploading, setPendingUploading] = useState(false);
  const [pendingDialogPosition, setPendingDialogPosition] = useState<{ top: number; left: number } | null>(null);
  const [lastClickPosition, setLastClickPosition] = useState<{ top: number; left: number } | null>(null);
  const [screenshotViewerActivity, setScreenshotViewerActivity] = useState<Activity | null>(null);
  const [screenshotViewerImageUrl, setScreenshotViewerImageUrl] = useState<string | null>(null);
  const [screenshotReplacementFile, setScreenshotReplacementFile] = useState<File | null>(null);
  const [screenshotReplacementPreview, setScreenshotReplacementPreview] = useState<string | null>(null);
  const [screenshotReplacing, setScreenshotReplacing] = useState(false);
  const SERVICE_CATEGORY_STORAGE_KEY = 'activityServiceCategories';

  const storedUser = getStoredUser();
  const normalizedRole = (storedUser?.role || '').toUpperCase();
  const isAdmin = normalizedRole === 'ADMIN';
  const isCategoryManager = normalizedRole === 'CATEGORY_MANAGER';
  const isSales = normalizedRole === 'SALES';
  const isPresales =
    normalizedRole === 'PRESALES' ||
    normalizedRole === 'PRE_SALES' ||
    normalizedRole === 'PRE-SALES';

  const deriveCategoryCode = useCallback(
    (input?: string | null) => {
      if (!input) return undefined;
      const normalized = input
        .toUpperCase()
        .replace(/&/g, 'AND')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return DEFAULT_CATEGORY_OPTIONS.find((opt) => {
        const code = opt.code
          .toUpperCase()
          .replace(/&/g, 'AND')
          .replace(/_/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const label = opt.label
          .toUpperCase()
          .replace(/&/g, 'AND')
          .replace(/_/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return normalized === code || normalized === label;
      })?.code;
    },
    [DEFAULT_CATEGORY_OPTIONS],
  );

  const [organizationCategoryLookup, setOrganizationCategoryLookup] = useState<Record<string, string>>({});

  const [serviceCategories, setServiceCategories] = useState<Record<number, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(SERVICE_CATEGORY_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const updateServiceCategory = useCallback((id: number, value?: string) => {
    setServiceCategories((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next[id];
      } else {
        next[id] = value;
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem(SERVICE_CATEGORY_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [SERVICE_CATEGORY_STORAGE_KEY]);
  const getServiceCategoryForActivity = useCallback((id: number) => serviceCategories[id] || defaultServiceCategoryCode, [serviceCategories]);

  useEffect(() => {
    if (!data?.content) return;
    setServiceCategories((prev) => {
      let changed = false;
      const next = { ...prev };
      data.content?.forEach((activity) => {
        if (!next[activity.id]) {
          const orgKey = activity.organization?.toLowerCase() || '';
          const derivedCategory = organizationCategoryLookup[orgKey];
          next[activity.id] = derivedCategory || defaultServiceCategoryCode;
          changed = true;
        }
      });
      if (changed) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(SERVICE_CATEGORY_STORAGE_KEY, JSON.stringify(next));
        }
        return next;
      }
      return prev;
    });
  }, [data, defaultServiceCategoryCode, SERVICE_CATEGORY_STORAGE_KEY, organizationCategoryLookup]);

  // Helper function to get calendar days for a month
  const getCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysInMonth = lastDay.getDate();
    
    const days = [];
    
    // Add previous month's trailing days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(year, month - 1, prevMonthLastDay - i));
    }
    
    // Add current month's days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    // Add next month's leading days to fill the grid (42 cells = 6 weeks)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push(new Date(year, month + 1, i));
    }
    
    return days;
  };

  // Format date to dd/MM/yyyy
  const formatDateDDMMYYYY = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // Format date to yyyy-MM-dd for input
  const formatDateYYYYMMDD = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Parse dd/MM/yyyy to Date
  const parseDateDDMMYYYY = (dateStr: string): Date | null => {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts.map(Number);
    return new Date(yyyy, mm - 1, dd);
  };

  const toBackendDateString = (dateStr?: string): string | undefined => {
    if (!dateStr) return undefined;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    return dateStr;
  };

  const mapActivityTypeToCategory = (activityType?: string): string => {
    if (!activityType) return getCategoryEnum(category);
    switch (activityType.toUpperCase()) {
      case 'CALL':
        return 'CALL';
      case 'MEETING':
      case 'MEETING_SCHEDULER':
        return 'MEETING_SCHEDULER';
      case 'FOLLOW_UP':
      case 'SEND_QUOTES':
      case 'TASK':
      case 'OTHER':
      case 'ACTIVITY':
      default:
        return 'ACTIVITY';
    }
  };

  const formatActivityTypeLabel = (value?: string | null): string => {
    if (!value) return '-';
    return value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };
  
  // Convert category to backend enum format
  const getCategoryEnum = (cat: string): string => {
    switch (cat) {
      case 'Activity':
        return 'ACTIVITY';
      case 'Call':
        return 'CALL';
      case 'Meeting scheduler':
        return 'MEETING_SCHEDULER';
      default:
        return cat.toUpperCase().replace(/\s+/g, '_');
    }
  };

  const getDefaultColumnOrder = () => {
    if (category === 'Activity') {
      return ['Done', 'Subject', 'Type', 'Deal', 'Instagram ID', 'Phone', 'Organization', 'Category', 'Due date', 'Assigned user', 'Priority', 'Notes'];
    }
    if (category === 'Call') {
      return ['Done', 'Subject', 'Type', 'Deal', 'Instagram ID', 'Phone', 'Organization', 'Category', 'Schedule date', 'Schedule time', 'Duration', 'Attach image', 'Assigned user', 'Priority', 'Notes'];
    }
    return ['Done', 'Subject', 'Type', 'Deal', 'Instagram ID', 'Phone', 'Organization', 'Category', 'Schedule date', 'Schedule time', 'Assigned user', 'Priority', 'Notes'];
  };

  
  const [columnOrder, setColumnOrder] = useState<string[]>(getDefaultColumnOrder());

  useEffect(() => {
    const defaultOrder = getDefaultColumnOrder();
    setColumnOrder(defaultOrder);
    setHiddenColumns(new Set());
    setSortConfig(null);
  }, [category]);

  const systemFilters: SavedFilterOption[] = [
    { name: 'Activity Date today', conditions: [], isSystem: true },
    { name: 'Activity Date this week', conditions: [], isSystem: true },
    { name: 'Activity Date this month', conditions: [], isSystem: true },
    { name: 'Activity Date yesterday', conditions: [], isSystem: true },
    { name: 'Activity created this month', conditions: [], isSystem: true },
    { name: 'Activity created last month', conditions: [], isSystem: true },
  ];

  const availableFields = [
    { value: 'personId', label: 'Person ID', type: 'text' as const },
    { value: 'assignedUser', label: 'Assigned User', type: 'text' as const },
    { value: 'organization', label: 'Organization', type: 'text' as const },
    { value: 'category', label: 'Category', type: 'select' as const },
    { value: 'status', label: 'Status', type: 'select' as const },
    { value: 'callType', label: 'Call Type', type: 'select' as const },
    { value: 'done', label: 'Done', type: 'select' as const },
    { value: 'dateFrom', label: 'Date From', type: 'date' as const },
    { value: 'dateTo', label: 'Date To', type: 'date' as const },
  ];

  const fieldOptions: Record<string, string[]> = {
    category: ['Activity', 'Call', 'Meeting scheduler'],
    status: ['Pending', 'Completed', 'Cancelled'],
    callType: ['Inbound', 'Outbound'],
    done: ['true', 'false'],
  };

  useEffect(() => {
    let isMounted = true;
    const loadFilterOptions = async () => {
      try {
        const [orgs, users] = await Promise.all([
          organizationsApi.list().catch(() => []),
          usersApi.list().catch(() => []),
        ]);
        if (!isMounted) return;

        const allOrganizations = Array.isArray(orgs) ? orgs : [];
        const allUsers = Array.isArray(users) ? users : [];

        // Start with everything returned by the backend; then narrow for specific roles.
        let scopedOrganizations = allOrganizations;
        let scopedUsers = allUsers;

        const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
        const getUpperRole = (u: User) => (u.role || '').toUpperCase();

        const currentUserId = storedUser?.userId;
        const currentFullUser = currentUserId
          ? allUsers.find((u) => u.id === currentUserId)
          : undefined;

        const normalizeCategoryString = (value?: string | null) =>
          (value || '')
            .toUpperCase()
            .replace(/&/g, 'AND')
            .replace(/_/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (isCategoryManager && currentUserId) {
          // Category Manager:
          // - Organizations: all organizations owned by sales people under them
          // - Users: Sales users reporting directly to them + their Presales reports
          const salesPeopleUnderManager = allUsers.filter(
            (u) => getUpperRole(u) === 'SALES' && u.managerId === currentUserId,
          );
          const salesPeopleIds = new Set(salesPeopleUnderManager.map((s) => s.id));
          const presalesUnderSales = allUsers.filter(
            (u) => presalesRoleCodes.includes(getUpperRole(u)) && u.managerId && salesPeopleIds.has(u.managerId),
          );
          scopedOrganizations = allOrganizations.filter(
            (org) => org.owner && org.owner.id && salesPeopleIds.has(org.owner.id),
          );
          const uniqueUsers = new Map<number, User>();
          [...salesPeopleUnderManager, ...presalesUnderSales].forEach((user) => {
            if (!uniqueUsers.has(user.id)) {
              uniqueUsers.set(user.id, user);
            }
          });
          scopedUsers = Array.from(uniqueUsers.values());

          // For category managers, always auto-detect and set their category
          // This ensures they see activities from their category even if filter was already set
          const derivedCategoryCode =
            scopedOrganizations
              .map((org) => {
                const orgCategory = normalizeCategoryString(org.category);
                const match = DEFAULT_CATEGORY_OPTIONS.find((opt) => {
                  const code = normalizeCategoryString(opt.code);
                  const label = normalizeCategoryString(opt.label);
                  return orgCategory === code || orgCategory === label;
                });
                return match?.code;
              })
              .find((code): code is string => Boolean(code)) || undefined;

          if (derivedCategoryCode) {
            setSelectedCategoryFilter(derivedCategoryCode);
          }
        } else if (isSales && currentUserId) {
          // Sales user:
          // - Organizations: only those where this Sales user is set as owner (shown in "All Organizations" dropdown)
          // - Users: the Sales user themselves and their Presales users (shown in "All Users" dropdown)
          scopedOrganizations = allOrganizations.filter(
            (org) => org.owner && org.owner.id === currentUserId,
          );
          // Include the SALES user themselves and their PRESALES team members
          // Sort: SALES user first, then PRESALES team members
          const salesAndPresales = allUsers.filter(
            (u) => u.id === currentUserId || (presalesRoleCodes.includes(getUpperRole(u)) && u.managerId === currentUserId),
          );
          scopedUsers = salesAndPresales.sort((a, b) => {
            if (a.id === currentUserId) return -1; // SALES user first
            if (b.id === currentUserId) return 1;
            return 0;
          });
        } else if (isPresales && currentFullUser?.managerId) {
          // Presales:
          // - Organizations: those owned by their Sales manager
          // - Users: themselves and their Sales manager
          const salesManagerId = currentFullUser.managerId;
          scopedOrganizations = allOrganizations.filter(
            (org) => org.owner && org.owner.id === salesManagerId,
          );
          // Include both the PRESALES user and their Sales manager
          // Sort: PRESALES user first, then Sales manager
          const presalesAndSales = allUsers.filter(
            (u) => u.id === currentUserId || u.id === salesManagerId,
          );
          scopedUsers = presalesAndSales.sort((a, b) => {
            if (a.id === currentUserId) return -1; // PRESALES user first
            if (b.id === currentUserId) return 1;
            return 0;
          });
        }

        const orgCategoryMap: Record<string, string> = {};
        scopedOrganizations.forEach((org) => {
          const categoryCode = deriveCategoryCode(org.category);
          if (categoryCode && org.name) {
            orgCategoryMap[org.name.toLowerCase()] = categoryCode;
          }
        });

        setCategoryFilterOptions(DEFAULT_CATEGORY_OPTIONS);
        setBaseOrganizationOptions(scopedOrganizations);
        setBaseManagerOptions(scopedUsers);
        setOrganizationOptions(scopedOrganizations);
        setManagerOptions(scopedUsers);
        setOrganizationCategoryLookup(orgCategoryMap);

        // For category managers, ensure category filter is set from orgCategoryMap
        if (isCategoryManager) {
          const firstCategory = Object.values(orgCategoryMap)[0];
          if (firstCategory) {
            setSelectedCategoryFilter(firstCategory);
          }
        }
      } catch (err) {
        console.error('Failed to load filter options', err);
      }
    };
    loadFilterOptions();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter organizations and users by selected category when admin selects a category
  // For sales/presales/category managers, ensure they always see their scoped options
  useEffect(() => {
    if (!isAdmin) {
      // For non-admin users (sales, presales, category managers), use base options (already filtered by role)
      // This ensures sales users see only their organizations and their presales users
      setOrganizationOptions(baseOrganizationOptions);
      setManagerOptions(baseManagerOptions);
      return;
    }

    // For admin: always filter users to SALES and PRESALES only
    const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
    const getUpperRole = (u: User) => (u.role || '').toUpperCase();
    
    // Filter base users to only SALES and PRESALES for admin
    const allSalesAndPresales = baseManagerOptions.filter((u) => {
      const role = getUpperRole(u);
      return role === 'SALES' || presalesRoleCodes.includes(role);
    });

    // For admin: apply category filter if selected (handle both single and multiple categories)
    const selectedCategories = Array.isArray(selectedCategoryFilter) 
      ? selectedCategoryFilter 
      : (selectedCategoryFilter ? [selectedCategoryFilter] : []);
    
    if (selectedCategories.length === 0) {
      // No category selected: show all organizations and all SALES/PRESALES users
      setOrganizationOptions(baseOrganizationOptions);
      setManagerOptions(allSalesAndPresales);
      return;
    }
    
    // Normalize category for comparison (handle different formats)
    const normalizeCategory = (cat: string | null | undefined): string => {
      if (!cat) return '';
      return cat
        .toUpperCase()
        .replace(/&/g, 'AND')  // Replace & with AND
        .replace(/_/g, ' ')    // Replace _ with space
        .replace(/\s+/g, ' ')   // Collapse multiple spaces
        .trim();
    };
    
    // Filter organizations by any of the selected categories
    const filteredOrgs = baseOrganizationOptions.filter((org) => {
      if (!org.category) return false;
      
      const orgCategory = org.category.toUpperCase();
      const orgCategoryNormalized = normalizeCategory(org.category);
      
      // Check if organization matches any of the selected categories
      return selectedCategories.some((selectedCat) => {
        const selectedCategoryOption = categoryFilterOptions.find(
          (opt) => opt.code === selectedCat
        );
        const selectedCategoryCode = selectedCat.toUpperCase();
        const selectedCategoryLabel = selectedCategoryOption?.label?.toUpperCase() || '';
        const selectedCategoryNormalized = normalizeCategory(selectedCat);
        
      return (
        orgCategory === selectedCategoryCode ||
        orgCategory === selectedCategoryLabel ||
        orgCategoryNormalized === selectedCategoryNormalized ||
        (selectedCategoryOption?.label && normalizeCategory(selectedCategoryOption.label) === orgCategoryNormalized)
      );
      });
    });
    
    // Filter users to only SALES and PRESALES linked to any of the selected categories
    // Get owner IDs from filtered organizations (these are SALES users)
    const salesOwnerIdsInCategory = new Set(
      filteredOrgs
        .map((org) => org.owner?.id)
        .filter((id): id is number => id !== undefined && id !== null)
    );
    
    // Filter users:
    // 1. SALES users who own organizations in any of the selected categories
    // 2. PRESALES users who report to those SALES users
    const filteredUsers = allSalesAndPresales.filter((u) => {
      const role = getUpperRole(u);
      
      if (role === 'SALES') {
        // Include SALES users who own organizations in any of the categories
        return salesOwnerIdsInCategory.has(u.id);
      } else if (presalesRoleCodes.includes(role)) {
        // Include PRESALES users whose manager (SALES user) owns organizations in any of the categories
        return u.managerId !== null && salesOwnerIdsInCategory.has(u.managerId);
      }
      
      return false;
    });
    
    setOrganizationOptions(filteredOrgs);
    setManagerOptions(filteredUsers);
  }, [selectedCategoryFilter, isAdmin, baseOrganizationOptions, baseManagerOptions, categoryFilterOptions]);

  // Note: Backend now automatically scopes activities by role:
  // - SALES: activities assigned to themselves and their PRESALES team
  // - CATEGORY_MANAGER: activities assigned to themselves, their SALES reports, and PRESALES under those SALES
  // - PRESALES: activities assigned to themselves and their Sales manager
  // Setting assignedUserId here is optional but makes the filter explicit in the UI
  useEffect(() => {
    if ((isSales || isPresales) && storedUser?.userId && !filters.assignedUserId) {
      setFilters((prev) => ({
        ...prev,
        assignedUserId: storedUser.userId,
      }));
      setSelectedManagerFilter(String(storedUser.userId));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDatePreservingFilters = () => {
    const next: ActivityFilters = { page: 0, size: 25 };
    if (filters.dateFrom) {
      next.dateFrom = filters.dateFrom;
    }
    if (filters.dateTo) {
      next.dateTo = filters.dateTo;
    }
    if (filters.organizationId) {
      next.organizationId = filters.organizationId;
    }
    if (filters.assignedUserId) {
      next.assignedUserId = filters.assignedUserId;
    }
    return next;
  };

  const normalizeDateFilters = (source?: ActivityFilters): ActivityFilters => {
    const normalized: ActivityFilters = {};
    if (source?.dateFrom) {
      normalized.dateFrom = toBackendDateString(source.dateFrom);
    }
    if (source?.dateTo) {
      normalized.dateTo = toBackendDateString(source.dateTo);
    }
    if (source?.organizationId) {
      normalized.organizationId = source.organizationId;
    }
    if (source?.assignedUserId) {
      normalized.assignedUserId = source.assignedUserId;
    }
    if (source?.serviceCategory) {
      normalized.serviceCategory = source.serviceCategory;
    }
    if (source?.organizationCategory) {
      normalized.organizationCategory = source.organizationCategory;
    }
    return normalized;
  };

  // Memoize filters key to prevent unnecessary re-renders
  // This creates a stable reference for filter values that actually matter
  const filtersKey = useMemo(() => {
    return JSON.stringify({
      category: filters.category,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      organizationId: filters.organizationId,
      assignedUserId: filters.assignedUserId,
      status: filters.status,
      callType: filters.callType,
      done: filters.done,
      personId: filters.personId,
      page: filters.page,
      size: filters.size,
      sort: filters.sort,
    });
  }, [
    filters.category,
    filters.dateFrom,
    filters.dateTo,
    filters.organizationId,
    filters.assignedUserId,
    filters.status,
    filters.callType,
    filters.done,
    filters.personId,
    filters.page,
    filters.size,
    filters.sort,
  ]);

  const parseTimeToMinutes = (time?: string | null) => {
    if (!time) return null;
    const [hoursStr, minutesStr] = time.split(':');
    const hours = Number(hoursStr);
    const minutes = Number(minutesStr);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };

  const parseDurationInputToMinutes = (value: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;

    if (trimmed.includes(':')) {
      const parts = trimmed.split(':').map((p) => p.trim());
      if (parts.length < 2 || parts.length > 3) {
        return null;
      }
      const [hoursStr, minutesStr, secondsStr] = parts;
      const hours = Number(hoursStr);
      const minutes = Number(minutesStr);
      const seconds = parts.length === 3 ? Number(secondsStr) : 0;
      if ([hours, minutes, seconds].some((n) => Number.isNaN(n))) {
        return null;
      }
      return hours * 60 + minutes + Math.floor(seconds / 60);
    }

    const numericMinutes = Number(trimmed);
    if (Number.isNaN(numericMinutes)) {
      return null;
    }
    return numericMinutes;
  };

  const formatMinutesToHHMM = (minutes: number) => {
    const safeMinutes = Math.max(0, minutes);
    const hours = Math.floor(safeMinutes / 60);
    const remainingMinutes = safeMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
  };

  const loadActivities = useCallback((customFilters?: ActivityFilters) => {
    // Cancel any pending request with the same purpose
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setLoading(true);
    // Use filtersRef to get the latest filters, avoiding stale closure issues
    const filtersToUse = customFilters || filtersRef.current;
    // Only apply page category if category is not already specified in filters
    // If category is explicitly undefined/null, don't apply any category filter
    const finalFilters =
      Object.prototype.hasOwnProperty.call(filtersToUse, 'category') && filtersToUse.category === undefined
        ? filtersToUse
        : filtersToUse.category
          ? filtersToUse
          : { ...filtersToUse, category: getCategoryEnum(category) };
    const normalizedFilters: ActivityFilters = { ...finalFilters };
    // When a service category filter is selected (e.g. Makeup / Photography),
    // also forward the first selected value to the backend so that it can
    // reduce the result set server‑side. We still keep the client‑side
    // filtering in shouldShow for safety and for multi‑select behaviour.
    const selectedCategories = Array.isArray(selectedCategoryFilter)
      ? selectedCategoryFilter
      : (selectedCategoryFilter ? [selectedCategoryFilter] : []);
    if (selectedCategories.length > 0) {
      // Send comma‑separated list so backend can treat this as an IN‑filter
      // (e.g. "PHOTOGRAPHY,MAKEUP"), while still working for a single value.
      const joinedCategories = selectedCategories.join(',');
      // Send both `serviceCategory` and `organizationCategory` so that whichever
      // parameter name the backend expects will be honoured. Both carry the
      // same PHOTOGRAPHY / MAKEUP / PLANNING_DECOR codes.
      normalizedFilters.serviceCategory = joinedCategories;
      normalizedFilters.organizationCategory = joinedCategories;
    } else {
      delete normalizedFilters.serviceCategory;
      delete normalizedFilters.organizationCategory;
    }
    if (normalizedFilters.dateFrom) {
      normalizedFilters.dateFrom = toBackendDateString(normalizedFilters.dateFrom);
    }
    if (normalizedFilters.dateTo) {
      normalizedFilters.dateTo = toBackendDateString(normalizedFilters.dateTo);
    }

    // Handle multiple assignedUserId and organizationId values by making separate API calls
    const assignedUserIds = normalizedFilters.assignedUserId;
    const organizationIds = normalizedFilters.organizationId;
    const userIdsArray = Array.isArray(assignedUserIds) ? assignedUserIds : (assignedUserIds ? [assignedUserIds] : []);
    const orgIdsArray = Array.isArray(organizationIds) ? organizationIds : (organizationIds ? [organizationIds] : []);

    // If multiple users or organizations selected, make separate calls and merge results
    if (userIdsArray.length > 1 || orgIdsArray.length > 1) {
      // Create all combinations of user and org filters
      const filterCombinations: ActivityFilters[] = [];
      
      if (userIdsArray.length > 0 && orgIdsArray.length > 0) {
        // Both users and orgs selected - create cartesian product
        userIdsArray.forEach((userId) => {
          orgIdsArray.forEach((orgId) => {
            filterCombinations.push({
              ...normalizedFilters,
              assignedUserId: userId,
              organizationId: orgId,
            });
          });
        });
      } else if (userIdsArray.length > 1) {
        // Only multiple users
        userIdsArray.forEach((userId) => {
          filterCombinations.push({
            ...normalizedFilters,
            assignedUserId: userId,
          });
        });
      } else if (orgIdsArray.length > 1) {
        // Only multiple organizations
        orgIdsArray.forEach((orgId) => {
          filterCombinations.push({
            ...normalizedFilters,
            organizationId: orgId,
          });
        });
      }

      const requests = filterCombinations.map((filters) => {
        return activitiesApi.list(filters, { signal: abortController.signal });
      });

      Promise.all(requests)
        .then(async (responses) => {
          if (abortController.signal.aborted) return;

          // Merge all responses: combine content, sum totals, take max pages
          const mergedContent: Activity[] = [];
          const seenIds = new Set<number>();
          let totalElements = 0;
          let totalPages = 0;

          responses.forEach((response) => {
            response.content.forEach((activity) => {
              if (!seenIds.has(activity.id)) {
                seenIds.add(activity.id);
                mergedContent.push(activity);
              }
            });
            totalElements += response.totalElements || 0;
            totalPages = Math.max(totalPages, response.totalPages || 0);
          });

          // Sort by date (most recent first) or keep original order
          mergedContent.sort((a, b) => {
            const dateA = a.dateTime || a.date || a.dueDate || '';
            const dateB = b.dateTime || b.date || b.dueDate || '';
            return dateB.localeCompare(dateA);
          });

          const mergedResponse: PageResponse<Activity> = {
            content: mergedContent,
            totalElements: mergedContent.length, // Use actual merged count
            totalPages: Math.ceil(mergedContent.length / (normalizedFilters.size || 25)),
            number: normalizedFilters.page || 0,
            size: normalizedFilters.size || 25,
          };

          // Fetch deal names for activities that have dealId but no dealName
          const activitiesWithDealId = mergedResponse.content.filter(a => a.dealId && !a.dealName);
          if (activitiesWithDealId.length > 0) {
            try {
              const allDeals = await dealsApi.list();
              if (abortController.signal.aborted) return mergedResponse;

              const newDealsMap = new Map<number, string>();
              allDeals.forEach(deal => {
                if (deal.id) {
                  newDealsMap.set(deal.id, deal.name);
                }
              });
              setDealsMap(newDealsMap);

              const updatedContent = mergedResponse.content.map(activity => {
                if (activity.dealId && !activity.dealName) {
                  const dealName = newDealsMap.get(activity.dealId);
                  if (dealName) {
                    return { ...activity, dealName };
                  }
                }
                return activity;
              });

              return { ...mergedResponse, content: updatedContent };
            } catch (err) {
              if (!abortController.signal.aborted) {
                console.error('Failed to load deals for activity names:', err);
              }
              return mergedResponse;
            }
          }

          return mergedResponse;
        })
        .then((response) => {
          if (response && !abortController.signal.aborted) {
            setData(response);
          }
        })
        .catch((e) => {
          if (!abortController.signal.aborted) {
            setError(e?.message ?? 'Failed to load');
          }
        })
        .finally(() => {
          if (!abortController.signal.aborted) {
            setLoading(false);
          }
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null;
          }
        });
      return; // Exit early for multi-user case
    }

    // Single user or no user filter - use normal flow
    activitiesApi
      .list(normalizedFilters, { signal: abortController.signal })
      .then(async (response) => {
        // Check if request was aborted
        if (abortController.signal.aborted) {
          return;
        }
        
        // Fetch deal names for activities that have dealId but no dealName
        const activitiesWithDealId = response.content.filter(a => a.dealId && !a.dealName);
        if (activitiesWithDealId.length > 0) {
          try {
            // Fetch all deals to get names
            const allDeals = await dealsApi.list();
            if (abortController.signal.aborted) {
              return;
            }
            
            const newDealsMap = new Map<number, string>();
            allDeals.forEach(deal => {
              if (deal.id) {
                newDealsMap.set(deal.id, deal.name);
              }
            });
            setDealsMap(newDealsMap);
            
            // Update activities with deal names
            const updatedContent = response.content.map(activity => {
              if (activity.dealId && !activity.dealName) {
                const dealName = newDealsMap.get(activity.dealId);
                if (dealName) {
                  return { ...activity, dealName };
                }
              }
              return activity;
            });
            
            return { ...response, content: updatedContent };
          } catch (err) {
            if (!abortController.signal.aborted) {
              console.error('Failed to load deals for activity names:', err);
            }
            return response;
          }
        }
        return response;
      })
      .then((response) => {
        if (response && !abortController.signal.aborted) {
          setData(response);

          // Keep activity summary cards in sync with the list response so that
          // TOTAL / PENDING / COMPLETED always reflect what the user sees in
          // the table for the current tab (All / Overdue / Today, etc.).
          const activities = response.content ?? [];
          const total = response.totalElements ?? activities.length;
          const pending = activities.filter((a) => !a.done).length;
          const completed = activities.filter((a) => a.done).length;

          setActivityTotalCount(total);
          setActivityPendingCount(pending);
          setActivityCompletedCount(completed);
        }
      })
      .catch((e) => {
        if (!abortController.signal.aborted) {
          setError(e?.message ?? 'Failed to load');
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
        // Clear the ref if this was the current request
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      });
  }, [category]); // Remove filters from dependencies - use filtersRef instead

  const loadCounts = useCallback(
    async (currentFilters?: ActivityFilters) => {
      // Cancel any pending loadCounts request
      if (loadCountsAbortControllerRef.current) {
        loadCountsAbortControllerRef.current.abort();
      }

      // Create new AbortController for this request
      const abortController = new AbortController();
      loadCountsAbortControllerRef.current = abortController;

      try {
        const dateOnlyFilters = normalizeDateFilters(currentFilters);

        // Preserve org/user/done filters when asking backend for summary
        const summaryFilters: ActivityFilters = {
          ...dateOnlyFilters,
        };
        if (currentFilters?.organizationId) summaryFilters.organizationId = currentFilters.organizationId;
        if (currentFilters?.assignedUserId) summaryFilters.assignedUserId = currentFilters.assignedUserId;
        if (currentFilters?.done !== undefined) summaryFilters.done = currentFilters.done;

        // Let the backend compute all aggregates in a single /summary call
        const summary = await activitiesApi.summary(summaryFilters, { signal: abortController.signal });

        if (abortController.signal.aborted) {
          return;
        }

        setCallAssignedCount(summary.callAssignedCount ?? 0);
        setCallTakenCount(summary.callTakenCount ?? 0);
        setMeetingAssignedCount(summary.meetingAssignedCount ?? 0);
        setMeetingDoneCount(summary.meetingDoneCount ?? 0);
        setOverdueCount(summary.overdueCount ?? 0);
        setTotalCallDurationMinutes(summary.totalCallDurationMinutes ?? 0);

        // IMPORTANT:
        // Do NOT take activity TOTAL / PENDING / COMPLETED from the /summary
        // endpoint. Different backends / roles can return 0 or incomplete data
        // here, which caused the summary cards to show 0 when switching to
        // date-based tabs such as "Today".
        //
        // Instead, we always derive the three activity counts from the
        // currently loaded table rows in the list-sync effect below
        // (`useEffect` that depends on `data` + `category`). That logic already
        // respects the active tab (All / Overdue / Today / etc.) via
        // `shouldShow`, so the numbers in the cards will always match what the
        // user actually sees in the table.

        // Ensure Call / Meeting counts, overdue, and total call duration are
        // consistent across Call / Meeting tabs by explicitly querying the
        // list endpoint with the same filters. We aggregate over the required
        // categories only (not all three) to avoid unnecessary requests.
        // - On Call tab we need CALL + MEETING_SCHEDULER stats
        // - On Meeting scheduler tab we need MEETING_SCHEDULER + CALL stats
        // - On Activity tab we also want CALL + MEETING_SCHEDULER stats
        //   restricted by the current tab's date filters (Today / This week /
        //   etc.) so that "Total Assign Call" and "Total Meeting Scheduled"
        //   reflect what the user is looking at.
        const baseFilters: ActivityFilters = {
          ...summaryFilters,
        };
        if (currentFilters?.organizationId) baseFilters.organizationId = currentFilters.organizationId;
        if (currentFilters?.assignedUserId) baseFilters.assignedUserId = currentFilters.assignedUserId;

        const fetchPaged = async (categoryCode: string): Promise<Activity[]> => {
          const pageSize = 200;
          let page = 0;
          let totalPages = 1;
          const collected: Activity[] = [];
          while (page < totalPages) {
            const resp = await activitiesApi.list(
              {
                ...baseFilters,
                category: categoryCode,
                page,
                size: pageSize,
              },
              { signal: abortController.signal },
            );
            if (abortController.signal.aborted) break;
            collected.push(...(resp.content || []));
            totalPages = resp.totalPages ?? 1;
            page += 1;
          }
          return collected;
        };
        // Decide which backend categories we actually need for the active tab.
        // Avoid fetching all three categories blindly.
        let allCalls: Activity[] = [];
        let allMeetings: Activity[] = [];
        let allActivities: Activity[] = [];

        const isCallTab = category === 'Call';
        const isMeetingTab = category === 'Meeting scheduler';

        // For all three main categories (Activity / Call / Meeting scheduler)
        // we want CALL and MEETING_SCHEDULER stats to stay in sync so that
        // "Total Assign Call" and "Call Taken" always show the same numbers
        // regardless of which tab the user is on.
        if (isCallTab || isMeetingTab || category === 'Activity') {
          allCalls = await fetchPaged('CALL');
        }
        if (isMeetingTab || isCallTab || category === 'Activity') {
          allMeetings = await fetchPaged('MEETING_SCHEDULER');
        }
        if (!isCallTab && !isMeetingTab && category !== 'Activity') {
          // Fallback for any future categories: preserve previous behaviour.
          [allCalls, allMeetings, allActivities] = await Promise.all([
            fetchPaged('CALL'),
            fetchPaged('MEETING_SCHEDULER'),
            fetchPaged('ACTIVITY'),
          ]);
        }

        if (!abortController.signal.aborted) {
          // Call / Meeting stats
          const todayDate = new Date();
          todayDate.setHours(0, 0, 0, 0);

          const parseDateSafe = (a: Activity): Date | undefined => {
            const raw = (a.date ?? a.dueDate) || undefined;
            if (!raw) return undefined;
            const p = raw.includes('-') ? raw.split('-') : raw.split('/');
            let y: number, m: number, d: number;
            if (p.length === 3 && p[0].length === 2) {
              d = +p[0]; m = +p[1] - 1; y = +p[2];
            } else if (p.length === 3) {
              y = +p[0]; m = +p[1] - 1; d = +p[2];
            } else {
              return undefined;
            }
            const dt = new Date(y, m, d);
            dt.setHours(0, 0, 0, 0);
            return dt;
          };

          const parseTimeToMinutes = (time?: string | null): number | null => {
            if (!time) return null;
            const [h, m] = time.split(':');
            if (h === undefined || m === undefined) return null;
            const hours = Number(h);
            const minutes = Number(m);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
            return hours * 60 + minutes;
          };

          let callTotal = 0;
          let callDoneTotal = 0;
          let callOverdue = 0;
          let callDurationMinutes = 0;

          const isDateScopedTab = (t: TabOption) =>
            t === 'Today' ||
            t === 'Tomorrow' ||
            t === 'Overdue' ||
            t === 'This week' ||
            t === 'Next week' ||
            t === 'This month' ||
            t === 'Prev month' ||
            t === 'This year';

          const matchesTabDateForAgg = (ed?: Date) => {
            if (!ed) return !isDateScopedTab(tab);
            // Mirror the date logic used in `shouldShow` so that the counts
            // match the rows visible in the table.
            if (tab === 'Today') {
              return ed.getTime() === todayDate.getTime();
            }
            if (tab === 'Tomorrow') {
              const tomorrow = new Date(todayDate);
              tomorrow.setDate(tomorrow.getDate() + 1);
              return ed.getTime() === tomorrow.getTime();
            }
            if (tab === 'Overdue') {
              return ed.getTime() < todayDate.getTime();
            }
            if (tab === 'This week') {
              const weekStart = new Date(todayDate);
              weekStart.setDate(todayDate.getDate() - todayDate.getDay());
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekStart.getDate() + 6);
              weekEnd.setHours(23, 59, 59, 999);
              return ed.getTime() >= weekStart.getTime() && ed.getTime() <= weekEnd.getTime();
            }
            if (tab === 'Next week') {
              const weekStart = new Date(todayDate);
              weekStart.setDate(todayDate.getDate() - todayDate.getDay());
              const nextWeekStart = new Date(weekStart);
              nextWeekStart.setDate(weekStart.getDate() + 7);
              const nextWeekEnd = new Date(nextWeekStart);
              nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
              nextWeekEnd.setHours(23, 59, 59, 999);
              return ed.getTime() >= nextWeekStart.getTime() && ed.getTime() <= nextWeekEnd.getTime();
            }
            if (tab === 'This month') {
              const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
              monthStart.setHours(0, 0, 0, 0);
              const monthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
              monthEnd.setHours(23, 59, 59, 999);
              return ed.getTime() >= monthStart.getTime() && ed.getTime() <= monthEnd.getTime();
            }
            if (tab === 'Prev month') {
              const prevMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1);
              prevMonthStart.setHours(0, 0, 0, 0);
              const prevMonthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0);
              prevMonthEnd.setHours(23, 59, 59, 999);
              return ed.getTime() >= prevMonthStart.getTime() && ed.getTime() <= prevMonthEnd.getTime();
            }
            if (tab === 'This year') {
              const yearStart = new Date(todayDate.getFullYear(), 0, 1);
              yearStart.setHours(0, 0, 0, 0);
              const yearEnd = new Date(todayDate.getFullYear(), 11, 31);
              yearEnd.setHours(23, 59, 59, 999);
              return ed.getTime() >= yearStart.getTime() && ed.getTime() <= yearEnd.getTime();
            }
            // For non date-specific tabs (All, To‑do, Select period / Date),
            // rely on backend filters instead of local date checks.
            return true;
          };

          allCalls.forEach((a) => {
            const ed = parseDateSafe(a);
            if (!matchesTabDateForAgg(ed)) return;

            callTotal += 1;
            if (a.done) {
              callDoneTotal += 1;
              const start = parseTimeToMinutes(a.startTime);
              const end = parseTimeToMinutes(a.endTime);
              if (start != null && end != null && end > start) {
                callDurationMinutes += end - start;
              }
            } else if (ed && ed.getTime() < todayDate.getTime()) {
              // Overdue = not done and past today, regardless of which
              // date-based tab is active (matches existing overdue semantics).
              callOverdue += 1;
            }
          });

          // Meeting stats
          let meetingTotal = 0;
          let meetingDoneTotal = 0;
          let meetingOverdue = 0;
          allMeetings.forEach((a) => {
            const ed = parseDateSafe(a);
            if (!matchesTabDateForAgg(ed)) return;

            meetingTotal += 1;
            if (a.done) {
              meetingDoneTotal += 1;
            } else if (ed && ed.getTime() < todayDate.getTime()) {
              meetingOverdue += 1;
            }
          });

          // Activity stats (for overdue aggregation)
          let activityOverdue = 0;
          allActivities.forEach((a) => {
            if (!a.done) {
              const ed = parseDateSafe(a);
              if (ed && ed.getTime() < todayDate.getTime()) {
                activityOverdue += 1;
              }
            }
          });

          // Only override counts that are actually based on the categories we
          // fetched. This keeps /summary values for anything we did not
          // re‑compute locally.
          //
          // Behaviour by main tab:
          // - Activity tab: show BOTH call + meeting stats.
          // - Call tab: show call stats and keep meeting stats from /summary.
          // - Meeting scheduler tab: show ONLY meeting stats; hide call stats
          //   so that we never display a non‑zero "Total Assign Call / Call
          //   Taken" when the Meeting list is empty.
          const isCallTab = category === 'Call';
          const isMeetingTab = category === 'Meeting scheduler';

          if (!isMeetingTab && allCalls.length > 0) {
            setCallAssignedCount(callTotal);
            setCallTakenCount(callDoneTotal);
            setTotalCallDurationMinutes(callDurationMinutes);
          }

          if (allMeetings.length > 0) {
            setMeetingAssignedCount(meetingTotal);
            setMeetingDoneCount(meetingDoneTotal);
          }

          if (isMeetingTab) {
            // On Meeting tab, force call cards to 0 so the user does not see
            // a non‑zero call count with an empty Meeting list.
            setCallAssignedCount(0);
            setCallTakenCount(0);
            setTotalCallDurationMinutes(0);
          }

          // Overdue card should be context-sensitive:
          // - On Call tab: show overdue calls
          // - On Meeting scheduler tab: show overdue meetings
          // - On Activity tab: prefer backend summary (handled above)
          const isActivityTab = category === 'Activity';

          if (category === 'Call') {
            setOverdueCount(callOverdue);
          } else if (category === 'Meeting scheduler') {
            setOverdueCount(meetingOverdue);
          } else if (!isActivityTab) {
            // Fallback for any future categories that might use combined overdue.
            const combinedOverdue = activityOverdue + callOverdue + meetingOverdue;
            setOverdueCount(summary.overdueCount ?? combinedOverdue);
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error('Failed to load activity summary:', error);
        }
      } finally {
        // Clear the ref if this was the current request
        if (loadCountsAbortControllerRef.current === abortController) {
          loadCountsAbortControllerRef.current = null;
        }
      }
    },
    [category, tab],
  );

  // Keep summary cards in sync with the currently loaded list data for the active category.
  // This ensures that "Total Activities", "Pending", and "Completed" always reflect what
  // the user sees in the table, even if the backend summary endpoint returns 0 or is
  // missing some fields. Call / meeting cards are driven by loadCounts so that they
  // stay consistent across the Activity / Call / Meeting tabs.
  useEffect(() => {
    if (!data?.content || data.content.length === 0) {
      if (category === 'Activity') {
        setActivityTotalCount(0);
        setActivityPendingCount(0);
        setActivityCompletedCount(0);
      }
      return;
    }

    // When a service category filter is active, counts are already recomputed
    // in the service‑category effect below; don't override those here.
    const selectedCategories = Array.isArray(selectedCategoryFilter) 
      ? selectedCategoryFilter 
      : (selectedCategoryFilter ? [selectedCategoryFilter] : []);
    if (selectedCategories.length > 0) {
      return;
    }

    const visible = data.content.filter((a) => shouldShow(a));

    if (category === 'Activity') {
      setActivityTotalCount(visible.length);
      setActivityPendingCount(visible.filter((a) => !a.done).length);
      setActivityCompletedCount(visible.filter((a) => a.done).length);
    }
  }, [data, category, selectedCategoryFilter]);

  // When a service category filter is active, override counts by fetching activities
  // for the relevant type(s) and mapping them to the service category locally. We
  // avoid fetching all three categories when only one or two are needed for the
  // currently selected tab.
  useEffect(() => {
    const selectedCategories = Array.isArray(selectedCategoryFilter) 
      ? selectedCategoryFilter 
      : (selectedCategoryFilter ? [selectedCategoryFilter] : []);
    
    if (selectedCategories.length === 0) return;

    let isCancelled = false;

    const buildBaseFilters = (): ActivityFilters => {
      const normalized = normalizeDateFilters(filters);
      const payload: ActivityFilters = { ...normalized };
      // Always include organizationId and assignedUserId if they're set
      // Note: Backend now scopes activities by assigned user (SALES/PRESALES/CATEGORY_MANAGER see only assigned activities)
      // organizationId can still be sent to further filter results, but visibility is based on assignment
      if (filters.organizationId) payload.organizationId = filters.organizationId;
      if (filters.assignedUserId) payload.assignedUserId = filters.assignedUserId;
      if (filters.done !== undefined) payload.done = filters.done;
      return payload;
    };

    const fetchActivitiesForCategory = async (categoryCode: string) => {
      const pageSize = 200;
      let page = 0;
      let totalPages = 1;
      const collected: Activity[] = [];
      const baseFilters = buildBaseFilters();
      while (page < totalPages) {
        if (isCancelled) break;
        const response = await activitiesApi.list({
          ...baseFilters,
          category: categoryCode,
          page,
          size: pageSize,
        });
        if (isCancelled) break;
        collected.push(...(response.content || []));
        totalPages = response.totalPages ?? 1;
        page += 1;
      }
      return collected;
    };

    const recalc = async () => {
      try {
        // Decide which backend categories we actually need to look at based on
        // the active tab. This keeps network usage low while still keeping the
        // visible summary cards accurate.
        const categoriesToFetch: string[] =
          category === 'Activity'
            ? ['ACTIVITY']
            : category === 'Call'
              ? ['CALL', 'MEETING_SCHEDULER']
              : ['MEETING_SCHEDULER', 'CALL'];

        const results = await Promise.all(
          categoriesToFetch.map((code) => fetchActivitiesForCategory(code)),
        );

        const getItems = (code: string): Activity[] => {
          const index = categoriesToFetch.indexOf(code);
          return index === -1 ? [] : results[index];
        };

        const activityItems = getItems('ACTIVITY');
        const callItems = getItems('CALL');
        const meetingItems = getItems('MEETING_SCHEDULER');

        if (isCancelled) return;

        // Filter by any of the selected service categories
        const filterByServiceCategory = (list: Activity[]) =>
          list.filter((a) => {
            const activityCategory = getServiceCategoryForActivity(a.id);
            return selectedCategories.includes(activityCategory);
          });

        const matchingActivities = filterByServiceCategory(activityItems);
        if (activityItems.length > 0) {
          setActivityTotalCount(matchingActivities.length);
          setActivityPendingCount(matchingActivities.filter((a) => !a.done).length);
          setActivityCompletedCount(matchingActivities.filter((a) => a.done).length);
        }

        const matchingCalls = filterByServiceCategory(callItems);
        if (callItems.length > 0) {
          setCallAssignedCount(matchingCalls.length);
          setCallTakenCount(matchingCalls.filter((a) => a.done).length);
        }

        const matchingMeetings = filterByServiceCategory(meetingItems);
        if (meetingItems.length > 0) {
          setMeetingAssignedCount(matchingMeetings.length);
          setMeetingDoneCount(matchingMeetings.filter((a) => a.done).length);
        }
      } catch (error) {
        if (!isCancelled) {
          console.warn('Failed to recalculate service category counts', error);
        }
      }
    };

    void recalc();

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryFilter, filtersKey, getServiceCategoryForActivity, category]);

  // When service category filter is cleared, reload backend counts to include all categories again.
  // This ensures counts are recalculated when category filter is removed, respecting current org/user/date/done filters
  useEffect(() => {
    const selectedCategories = Array.isArray(selectedCategoryFilter) 
      ? selectedCategoryFilter 
      : (selectedCategoryFilter ? [selectedCategoryFilter] : []);
    
    if (selectedCategories.length === 0) {
      void loadCounts(filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCategoryFilter,
    filters.organizationId,
    filters.assignedUserId,
    filters.dateFrom,
    filters.dateTo,
    filters.done,
  ]);

  // For category managers, reload activities when category filter is first set to ensure
  // activities get the correct service category mapping from organizationCategoryLookup
  const categoryManagerCategorySetRef = useRef(false);
  useEffect(() => {
    const selectedCategories = Array.isArray(selectedCategoryFilter) 
      ? selectedCategoryFilter 
      : (selectedCategoryFilter ? [selectedCategoryFilter] : []);
    
    if (isCategoryManager && selectedCategories.length > 0 && organizationCategoryLookup && Object.keys(organizationCategoryLookup).length > 0 && !categoryManagerCategorySetRef.current) {
      categoryManagerCategorySetRef.current = true;
      // Reload activities once to ensure they get mapped to the correct service category
      loadActivities();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCategoryManager, selectedCategoryFilter, organizationCategoryLookup]);

  // Handle category and tab from URL parameter
  useEffect(() => {
    const categoryParam = searchParams.get('category');
    const activityId = searchParams.get('activityId');
    
    if (categoryParam) {
      const decodedCategory = decodeURIComponent(categoryParam);
      const validCategories: Array<'Activity' | 'Call' | 'Meeting scheduler'> = ['Activity', 'Call', 'Meeting scheduler'];
      if (validCategories.includes(decodedCategory as any)) {
        const newCategory = decodedCategory as 'Activity' | 'Call' | 'Meeting scheduler';
        if (category !== newCategory) {
          setCategory(newCategory);
        }
      }
    }
    
    // If activityId is present, switch to "All" tab to ensure activity is visible
    // This ensures the activity can be highlighted regardless of date filters
    if (activityId && tab !== 'All') {
      setTab('All');
    }
  }, [searchParams, category, tab]);

  useEffect(() => {
    // Use filtersRef to get the latest filters value, ensuring we always use current state
    const currentFilters = filtersRef.current;
    loadActivities(currentFilters);
    loadCounts(currentFilters); // Pass current filters to loadCounts so COMPLETED and PENDING reflect the selected tab's date range
    // Clear selections when filters or category change
    setSelectedActivities(new Set());
  }, [category, filtersKey, loadActivities, loadCounts]);

  // Sync selectedManagerFilter with filters.assignedUserId (not assignedUser string)
  // This ensures the dropdown shows the correct user when a user is selected
  // Check if modal should be opened from navigation state
  useEffect(() => {
    const state = location?.state as any;
    if (state?.openModal && !isAddOpen && !hasHandledOpenModal.current) {
      hasHandledOpenModal.current = true;
      setIsAddOpen(true);
      // Clear the state to prevent reopening on re-render
      requestAnimationFrame(() => {
        navigate(location.pathname, { replace: true, state: {} });
      });
    }
  }, [location?.pathname, location?.state, isAddOpen, navigate]);
  
  // Reset the ref when modal is closed and state is cleared
  useEffect(() => {
    if (!isAddOpen) {
      const state = location?.state as any;
      if (!state?.openModal && hasHandledOpenModal.current) {
        const timer = setTimeout(() => {
          hasHandledOpenModal.current = false;
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isAddOpen, location?.state]);

  useEffect(() => {
    if (isAdmin || isCategoryManager || isSales || isPresales) {
      // For ADMIN, CATEGORY_MANAGER, SALES, and PRESALES: handle arrays
      if (!filters.assignedUserId) {
        setSelectedManagerFilter([]);
      } else {
        const userIds = Array.isArray(filters.assignedUserId) 
          ? filters.assignedUserId 
          : [filters.assignedUserId];
        setSelectedManagerFilter(userIds);
      }
    } else {
      // For other roles: handle single value
    if (!filters.assignedUserId) {
      setSelectedManagerFilter('');
    } else {
        const userId = Array.isArray(filters.assignedUserId) 
          ? filters.assignedUserId[0] 
          : filters.assignedUserId;
        setSelectedManagerFilter(String(userId));
      }
    }
  }, [filters.assignedUserId, isAdmin, isCategoryManager, isSales, isPresales]);

  // Initialize multi-select arrays for ADMIN, CATEGORY_MANAGER, SALES, and PRESALES on mount
  useEffect(() => {
    if (isAdmin || isCategoryManager || isSales || isPresales) {
      if (!Array.isArray(selectedCategoryFilter)) {
        setSelectedCategoryFilter([]);
      }
      if (!Array.isArray(selectedOrganizationFilter)) {
        setSelectedOrganizationFilter([]);
      }
      if (!Array.isArray(selectedManagerFilter)) {
        setSelectedManagerFilter([]);
      }
    }
  }, [isAdmin, isCategoryManager, isSales, isPresales]); // Only run once on mount or when role changes

  // Click outside handlers for multi-select dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryMultiSelectRef.current && !categoryMultiSelectRef.current.contains(event.target as Node)) {
        setShowCategoryMultiSelect(false);
      }
      if (orgMultiSelectRef.current && !orgMultiSelectRef.current.contains(event.target as Node)) {
        setShowOrgMultiSelect(false);
      }
      if (userMultiSelectRef.current && !userMultiSelectRef.current.contains(event.target as Node)) {
        setShowUserMultiSelect(false);
      }
    };

    if (showCategoryMultiSelect || showOrgMultiSelect || showUserMultiSelect) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCategoryMultiSelect, showOrgMultiSelect, showUserMultiSelect]);

  // Helper function to format user names hierarchically (Sales - Presales)
  const getUserDisplayLabel = useCallback((user: User): string => {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    const baseLabel = fullName || user.email || `User #${user.id}`;
    
    const currentUserId = storedUser?.userId;
    
    // If this is the logged-in user, show "Name - me"
    if (currentUserId === user.id) {
      return `${baseLabel} - me`;
    }
    
    // For other users, just show their name
    return baseLabel;
  }, [storedUser?.userId]);

  // Filter categories, organizations, and users based on search query
  const filteredCategoriesForMultiSelect = useMemo(() => {
    if (!categorySearchQuery.trim()) return categoryFilterOptions;
    const query = categorySearchQuery.toLowerCase();
    return categoryFilterOptions.filter((opt) =>
      opt.label?.toLowerCase().includes(query) || opt.code?.toLowerCase().includes(query)
    );
  }, [categoryFilterOptions, categorySearchQuery]);

  const filteredOrganizationsForMultiSelect = useMemo(() => {
    if (!orgSearchQuery.trim()) return organizationOptions;
    const query = orgSearchQuery.toLowerCase();
    return organizationOptions.filter((org) =>
      org.name?.toLowerCase().includes(query)
    );
  }, [organizationOptions, orgSearchQuery]);

  const filteredUsersForMultiSelect = useMemo(() => {
    const currentUserId = storedUser?.userId;
    let filtered = managerOptions;
    
    // Filter by search query if provided
    if (userSearchQuery.trim()) {
      const query = userSearchQuery.toLowerCase();
      filtered = managerOptions.filter((user) => {
        const label = getUserDisplayLabel(user);
        return label.toLowerCase().includes(query);
      });
    }
    
    // Sort: logged-in user first, then others
    return [...filtered].sort((a, b) => {
      if (a.id === currentUserId) return -1; // Logged-in user first
      if (b.id === currentUserId) return 1;
      return 0; // Keep original order for others
    });
  }, [managerOptions, userSearchQuery, getUserDisplayLabel, storedUser?.userId]);

  // Handle scrolling to activity when activityId is in URL
  useEffect(() => {
    const activityId = searchParams.get('activityId');
    const categoryParam = searchParams.get('category');
    
    // Wait for category to be set if category param exists
    if (categoryParam) {
      const decodedCategory = decodeURIComponent(categoryParam);
      const validCategories: Array<'Activity' | 'Call' | 'Meeting scheduler'> = ['Activity', 'Call', 'Meeting scheduler'];
      if (validCategories.includes(decodedCategory as any)) {
        const expectedCategory = decodedCategory as 'Activity' | 'Call' | 'Meeting scheduler';
        // If category hasn't been set yet, wait for it
        if (category !== expectedCategory) {
          return; // Wait for category to be set
        }
      }
    }
    
    if (activityId && data?.content && !loading) {
      const id = Number(activityId);
      // Set highlighted activity ID in state to persist even if URL changes
      setHighlightedActivityId(id);
      
      // Check if activity exists in the data (it should be there if category matches)
      const activity = data.content.find(a => a.id === id);
      
      // Only proceed if activity exists in the data
      if (activity) {
        // Wait for DOM to update after category change and data load, then scroll
        const scrollToActivity = (): boolean => {
          const rowElement = activityRowRefs.current.get(id);
          if (rowElement) {
            // Use requestAnimationFrame to ensure DOM is fully rendered
            requestAnimationFrame(() => {
              // Scroll to the element with more aggressive scrolling
              // First, scroll the window to ensure the table is in view
              const windowHeight = window.innerHeight;
              const rowRect = rowElement.getBoundingClientRect();
              const rowTop = rowRect.top + window.scrollY;
              const rowCenter = rowTop + (rowRect.height / 2);
              const targetScrollY = rowCenter - (windowHeight / 2);
              
              // Scroll window to center the row
              window.scrollTo({
                top: Math.max(0, targetScrollY - 100), // Add some offset from top
                behavior: 'smooth'
              });
              
              // Also try scrolling the main content container if it exists
              const mainContent = document.querySelector('.main-content') as HTMLElement;
              if (mainContent && mainContent.scrollHeight > mainContent.clientHeight) {
                const containerRect = mainContent.getBoundingClientRect();
                const relativeTop = rowRect.top - containerRect.top + mainContent.scrollTop;
                const containerCenter = relativeTop + (rowRect.height / 2);
                const targetContainerScroll = containerCenter - (mainContent.clientHeight / 2);
                
                mainContent.scrollTo({
                  top: Math.max(0, targetContainerScroll),
                  behavior: 'smooth'
                });
              }
              
              // Also scroll the table container if it has its own scroll
              const tableContainer = rowElement.closest('.table-wrap') as HTMLElement;
              if (tableContainer && tableContainer.scrollHeight > tableContainer.clientHeight) {
                const containerRect = tableContainer.getBoundingClientRect();
                const relativeTop = rowRect.top - containerRect.top + tableContainer.scrollTop;
                const containerCenter = relativeTop + (rowRect.height / 2);
                const targetTableScroll = containerCenter - (tableContainer.clientHeight / 2);
                
                tableContainer.scrollTo({
                  top: Math.max(0, targetTableScroll),
                  behavior: 'smooth'
                });
              }
              
              // Final scroll using scrollIntoView as a fallback
              setTimeout(() => {
                rowElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
              }, 200);
              
              // Add a more visible highlight effect with animation
              rowElement.style.transition = 'background-color 0.3s ease, box-shadow 0.3s ease, border 0.3s ease';
              // Add a pulsing animation for better visibility
              rowElement.style.animation = 'highlightPulse 2s ease-in-out infinite';
            });
            return true;
          }
          return false;
        };

        // Try with multiple retry attempts - important for large lists
        // Use requestAnimationFrame for first attempt to ensure DOM is ready
        requestAnimationFrame(() => {
          if (!scrollToActivity()) {
            // Retry after a short delay
            setTimeout(() => {
              if (!scrollToActivity()) {
                // Retry after medium delay
                setTimeout(() => {
                  if (!scrollToActivity()) {
                    // Retry after longer delay (for very large lists)
                    setTimeout(() => {
                      if (!scrollToActivity()) {
                        // Final retry with even longer delay
                        setTimeout(() => {
                          if (!scrollToActivity()) {
                            // Last retry - sometimes DOM takes much longer with many entries
                            setTimeout(() => scrollToActivity(), 2000);
                          }
                        }, 1500);
                      }
                    }, 1000);
                  }
                }, 800);
              }
            }, 500);
          }
        });

        // Add click listener to clear highlight when user clicks anywhere on the page
        const handlePageClick = (e: Event) => {
          // Don't clear if clicking on the highlighted row itself or its children
          const rowElement = activityRowRefs.current.get(id);
          const target = e.target as Node;
          if (rowElement && target && rowElement.contains(target)) {
            return; // Keep highlight if clicking on the row itself
          }
          
          // Clear the highlight
          setHighlightedActivityId(null);
          if (rowElement) {
            // Remove animation
            rowElement.style.animation = '';
          }
          setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            newParams.delete('activityId');
            return newParams;
          });
          
          // Remove the event listener after clearing
          document.removeEventListener('click', handlePageClick, true);
        };

        // Add click listener to document after a short delay to avoid immediate clearing
        // This delay prevents the click that triggered navigation from immediately clearing the highlight
        const addListenerTimeout = setTimeout(() => {
          document.addEventListener('click', handlePageClick, true); // Use capture phase
        }, 100);

        // Cleanup function to remove event listener and timeout if component unmounts or effect re-runs
        return () => {
          clearTimeout(addListenerTimeout);
          document.removeEventListener('click', handlePageClick, true);
        };
      } else {
        // Activity not found in current data - might be filtered by tab or category hasn't loaded yet
        // If we have a category param, the category might still be switching or data might still be loading
        if (categoryParam) {
          const decodedCategory = decodeURIComponent(categoryParam);
          const validCategories: Array<'Activity' | 'Call' | 'Meeting scheduler'> = ['Activity', 'Call', 'Meeting scheduler'];
          if (validCategories.includes(decodedCategory as any)) {
            const expectedCategory = decodedCategory as 'Activity' | 'Call' | 'Meeting scheduler';
            // If category matches but activity not found, it might still be loading
            if (category === expectedCategory && loading) {
              // Data is still loading, wait for it
              return;
            }
          }
        }
        console.warn(`Activity ${id} not found in current data. Category: ${category}, Tab: ${tab}, Loading: ${loading}`);
      }
    } else if (!activityId && highlightedActivityId) {
      // Clear highlighted activity if URL param is removed
      setHighlightedActivityId(null);
    }
  }, [data, searchParams, setSearchParams, loading, category, tab, highlightedActivityId]);

  const handleTabSelection = (nextTab: TabOption) => {
    if (nextTab === 'Select period') {
      setIsDateRangeModalOpen(true);
    } else if (nextTab === 'Select Date') {
      setIsSingleDateModalOpen(true);
    } else {
      setTab(nextTab);
    }
    setIsTabDropdownOpen(false);
  };

  const handleCategoryFilterChange = (value: string) => {
    if (isAdmin) {
      // Multi-select for ADMIN
      const categoryCode = value.trim();
      if (categoryCode) {
        setSelectedCategoryFilter((prev) => {
          const current = Array.isArray(prev) ? prev : (prev ? [prev] : []);
          const newArray = current.includes(categoryCode)
            ? current.filter((cat) => cat !== categoryCode)
            : [...current, categoryCode];
          return newArray;
        });
      }
    } else {
      // Single select for other roles
      setSelectedCategoryFilter(value.trim());
    }
  };

  const handleCategoryMultiSelectToggle = (categoryCode: string) => {
    setSelectedCategoryFilter((prev) => {
      const current = Array.isArray(prev) ? prev : (prev ? [prev] : []);
      const newArray = current.includes(categoryCode)
        ? current.filter((cat) => cat !== categoryCode)
        : [...current, categoryCode];
      return newArray;
    });
  };

  const clearCategoryFilter = () => {
    setSelectedCategoryFilter([]);
  };

  const handleOrganizationFilterChange = (value: string) => {
    if (isAdmin || isCategoryManager || isSales || isPresales) {
      // Multi-select for ADMIN, CATEGORY_MANAGER, SALES, and PRESALES
      const orgId = Number(value);
      if (!Number.isNaN(orgId)) {
        setSelectedOrganizationFilter((prev) => {
          const current = Array.isArray(prev) ? prev : [];
          const newArray = current.includes(orgId)
            ? current.filter((id) => id !== orgId)
            : [...current, orgId];
          // Update filters
          setFilters((filtersPrev) => {
            const filtersNext: ActivityFilters = { ...filtersPrev, page: 0 };
            if (newArray.length > 0) {
              filtersNext.organizationId = newArray;
            } else {
              delete filtersNext.organizationId;
            }
            return filtersNext;
          });
          return newArray;
        });
      }
    } else {
      // Single select for other roles
    const trimmed = value.trim();
    setSelectedOrganizationFilter(trimmed);
    setFilters((prev) => {
      const next: ActivityFilters = { ...prev, page: 0 };
      if (trimmed) {
        const orgId = Number(trimmed);
        if (!Number.isNaN(orgId)) {
          next.organizationId = orgId;
        }
      } else {
        delete next.organizationId;
      }
        return next;
      });
    }
  };

  const handleOrganizationMultiSelectToggle = (orgId: number) => {
    setSelectedOrganizationFilter((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const newArray = current.includes(orgId)
        ? current.filter((id) => id !== orgId)
        : [...current, orgId];
      // Update filters
      setFilters((filtersPrev) => {
        const filtersNext: ActivityFilters = { ...filtersPrev, page: 0 };
        if (newArray.length > 0) {
          filtersNext.organizationId = newArray;
        } else {
          delete filtersNext.organizationId;
        }
        return filtersNext;
      });
      return newArray;
    });
  };

  const clearOrganizationFilter = () => {
    setSelectedOrganizationFilter([]);
    setFilters((prev) => {
      const next = { ...prev, page: 0 };
      delete next.organizationId;
      return next;
    });
  };

  const handleManagerFilterChange = (value: string) => {
    if (isAdmin || isCategoryManager || isSales || isPresales) {
      // Multi-select for ADMIN, CATEGORY_MANAGER, SALES, and PRESALES
      const userId = Number(value);
      if (!Number.isNaN(userId)) {
        setSelectedManagerFilter((prev) => {
          const current = Array.isArray(prev) ? prev : [];
          const newArray = current.includes(userId)
            ? current.filter((id) => id !== userId)
            : [...current, userId];
          // Update filters
          setFilters((filtersPrev) => {
            const filtersNext: ActivityFilters = { ...filtersPrev, page: 0 };
            if (newArray.length > 0) {
              filtersNext.assignedUserId = newArray;
            } else {
              delete filtersNext.assignedUserId;
            }
            // Only use assignedUserId, don't set assignedUser
            delete filtersNext.assignedUser;
            return filtersNext;
          });
          return newArray;
        });
      }
    } else {
      // Single select for other roles
    const normalizedValue = value.trim();
    setSelectedManagerFilter(normalizedValue);
    setFilters((prev) => {
      const next: ActivityFilters = { ...prev, page: 0 };
      if (normalizedValue) {
        const userId = Number(normalizedValue);
        if (!Number.isNaN(userId)) {
            // Backend now handles all scoping by assigned user
            // SALES users: backend returns activities assigned to them and their PRESALES team
            // CATEGORY_MANAGER users: backend returns activities assigned to them, their SALES reports, and PRESALES under those SALES
            // PRESALES users: backend returns activities assigned to them and their Sales manager
            // We just need to set assignedUserId and let the backend handle the filtering
              next.assignedUserId = userId;
            // Remove organizationId filter - backend handles scoping by assignment only
              delete next.organizationId;
            // Only use assignedUserId, don't set assignedUser
            delete next.assignedUser;
        }
      } else {
        delete next.assignedUserId;
        delete next.organizationId;
      }
        return next;
      });
    }
  };

  const handleUserMultiSelectToggle = (userId: number) => {
    setSelectedManagerFilter((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const newArray = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      // Update filters
      setFilters((filtersPrev) => {
        const filtersNext: ActivityFilters = { ...filtersPrev, page: 0 };
        if (newArray.length > 0) {
          filtersNext.assignedUserId = newArray;
        } else {
          delete filtersNext.assignedUserId;
        }
        // Only use assignedUserId, don't set assignedUser
        delete filtersNext.assignedUser;
        return filtersNext;
      });
      return newArray;
    });
  };

  const clearUserFilter = () => {
    setSelectedManagerFilter([]);
    setFilters((prev) => {
      const next = { ...prev, page: 0 };
      delete next.assignedUserId;
      delete next.assignedUser;
      return next;
    });
  };

  // Handle tab changes and update filters accordingly
  useEffect(() => {
    // Skip if tab is "Select period" or "Select Date" - these are handled by modals
    if (tab === 'Select period' || tab === 'Select Date') {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of current week (Sunday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // End of current week (Saturday)
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(weekStart.getDate() + 7); // Start of next week
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6); // End of next week

    // Preserve existing filters (organizationId, assignedUserId, assignedUser, category, etc.)
    // Only update date-related filters based on tab
    let newFilters: ActivityFilters = { 
      ...filters, 
      page: 0, 
      size: 25 
    };
    
    // Clear date filters and done status (they'll be set based on tab)
    delete newFilters.dateFrom;
    delete newFilters.dateTo;
    delete newFilters.done;

    if (tab === 'Today') {
      const todayStr = formatDateDDMMYYYY(today);
      newFilters.dateFrom = todayStr;
      newFilters.dateTo = todayStr;
    } else if (tab === 'Tomorrow') {
      const tomorrowStr = formatDateDDMMYYYY(tomorrow);
      newFilters.dateFrom = tomorrowStr;
      newFilters.dateTo = tomorrowStr;
    } else if (tab === 'This week') {
      const weekStartStr = formatDateDDMMYYYY(weekStart);
      const weekEndStr = formatDateDDMMYYYY(weekEnd);
      newFilters.dateFrom = weekStartStr;
      newFilters.dateTo = weekEndStr;
    } else if (tab === 'Next week') {
      const nextWeekStartStr = formatDateDDMMYYYY(nextWeekStart);
      const nextWeekEndStr = formatDateDDMMYYYY(nextWeekEnd);
      newFilters.dateFrom = nextWeekStartStr;
      newFilters.dateTo = nextWeekEndStr;
    } else if (tab === 'This month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const monthStartStr = formatDateDDMMYYYY(monthStart);
      const monthEndStr = formatDateDDMMYYYY(monthEnd);
      newFilters.dateFrom = monthStartStr;
      newFilters.dateTo = monthEndStr;
    } else if (tab === 'Prev month') {
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      const prevMonthStartStr = formatDateDDMMYYYY(prevMonthStart);
      const prevMonthEndStr = formatDateDDMMYYYY(prevMonthEnd);
      newFilters.dateFrom = prevMonthStartStr;
      newFilters.dateTo = prevMonthEndStr;
    } else if (tab === 'This year') {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const yearEnd = new Date(today.getFullYear(), 11, 31);
      const yearStartStr = formatDateDDMMYYYY(yearStart);
      const yearEndStr = formatDateDDMMYYYY(yearEnd);
      newFilters.dateFrom = yearStartStr;
      newFilters.dateTo = yearEndStr;
    } else if (tab === 'All') {
      // Clear date filters for "All", but preserve other filters
      newFilters = { 
        ...filters,
        page: 0, 
        size: 25 
      };
      delete newFilters.dateFrom;
      delete newFilters.dateTo;
      delete newFilters.done;
    } else if (tab === 'To‑do') {
      // To-do: not done activities, preserve other filters
      newFilters.done = false;
    }

    setFilters(newFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleSelectFilter = (filter: SavedFilterOption) => {
    if (filter.isSystem) {
      // Handle system filters
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

      let newFilters: ActivityFilters = { ...filters };
      
      if (filter.name.includes('today')) {
        newFilters.dateFrom = formatDateDDMMYYYY(today);
        newFilters.dateTo = formatDateDDMMYYYY(today);
      } else if (filter.name.includes('yesterday')) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        newFilters.dateFrom = formatDateDDMMYYYY(yesterday);
        newFilters.dateTo = formatDateDDMMYYYY(yesterday);
      } else if (filter.name.includes('this week')) {
        newFilters.dateFrom = formatDateDDMMYYYY(weekStart);
        newFilters.dateTo = formatDateDDMMYYYY(tomorrow);
      } else if (filter.name.includes('this month')) {
        newFilters.dateFrom = formatDateDDMMYYYY(monthStart);
        newFilters.dateTo = formatDateDDMMYYYY(tomorrow);
      } else if (filter.name.includes('last month')) {
        newFilters.dateFrom = formatDateDDMMYYYY(lastMonthStart);
        newFilters.dateTo = formatDateDDMMYYYY(lastMonthEnd);
      }

      setFilters(newFilters);
      setActiveFilterName(filter.name);
      setIsFilterDropdownOpen(false);
    } else {
      // Handle custom filters
      const normalizedConditions = filter.conditions.map<FilterCondition>((condition, index) => ({
        id: condition.id ?? `${filter.name}-${index}`,
        field: condition.field,
        operator: condition.operator,
        value: condition.value,
      }));
      setActiveCustomFilters(normalizedConditions);
      setActiveFilterName(filter.name);
      applyCustomFilters(normalizedConditions);
      setIsFilterDropdownOpen(false);
    }
  };

  const applyCustomFilters = (conditions: FilterCondition[]) => {
    const newFilters: ActivityFilters = { ...filters };
    
    conditions.forEach(condition => {
      if (condition.field === 'personId') {
        newFilters.personId = parseInt(condition.value);
      } else if (condition.field === 'assignedUser') {
        // Skip assignedUser - we only use assignedUserId
        // If needed, this could be mapped to assignedUserId by looking up the user
      } else if (condition.field === 'organization') {
        // Organization filtering: Backend can filter by organizationId if provided,
        // but activity visibility is now primarily based on assigned user (not organization ownership)
        // The organizationId filter can still be used to narrow down results further
        } else if (condition.field === 'category') {
          newFilters.category = getCategoryEnum(condition.value);
      } else if (condition.field === 'status') {
        newFilters.status = condition.value;
      } else if (condition.field === 'callType') {
        newFilters.callType = condition.value;
      } else if (condition.field === 'done') {
        newFilters.done = condition.value === 'true';
      } else if (condition.field === 'dateFrom') {
        newFilters.dateFrom = toBackendDateString(condition.value) ?? undefined;
      } else if (condition.field === 'dateTo') {
        newFilters.dateTo = toBackendDateString(condition.value) ?? undefined;
      }
    });

    setFilters(newFilters);
  };

  const handleSaveFilter = (conditions: FilterCondition[], filterName: string) => {
    const newFilter = { name: filterName, conditions };
    setSavedFilters([...savedFilters, newFilter]);
    setActiveFilterName(filterName);
    setActiveCustomFilters(conditions);
    applyCustomFilters(conditions);
  };

  const getColumnKey = (header: string): string => {
    const map: Record<string, string> = {
      'Checkbox': 'checkbox',
      'Done': 'done',
      'Subject': 'subject',
      'Type': 'category',
      'Deal': 'deal',
      'Instagram ID': 'instagramId',
      'Phone': 'phone',
      'Organization': 'organization',
      'Due date': 'dueDate',
      'Assigned user': 'assignedUser',
      'Priority': 'priority',
      'Status': 'status',
      'Notes': 'notes',
      'Call type': 'callType',
      'Schedule date': 'scheduleDate',
      'Schedule time': 'scheduleTime',
      'Schedule by': 'scheduleBy',
      'Duration': 'duration',
      'Attach image': 'attachment',
      'Category': 'categoryDisplay',
    };
    return map[header] || header.toLowerCase().replace(/\s+/g, '');
  };

  const handleColumnHeaderClick = (e: React.MouseEvent<HTMLTableCellElement>, columnName: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setColumnMenu({
      isOpen: true,
      columnName: getColumnKey(columnName),
      position: { top: rect.bottom + 4, left: rect.left },
    });
  };

  const handleSortAscending = () => {
    if (columnMenu) {
      const field = columnMenu.columnName;
      setSortConfig({ field, direction: 'asc' });
      setFilters(prev => ({ ...prev, sort: `${field},asc`, page: 0 }));
      setColumnMenu(null);
    }
  };

  const handleSortDescending = () => {
    if (columnMenu) {
      const field = columnMenu.columnName;
      setSortConfig({ field, direction: 'desc' });
      setFilters(prev => ({ ...prev, sort: `${field},desc`, page: 0 }));
      setColumnMenu(null);
    }
  };

  const handleHideColumn = () => {
    if (columnMenu) {
      const headerName = columnOrder.find(h => getColumnKey(h) === columnMenu.columnName);
      if (headerName) {
        setHiddenColumns(prev => new Set(prev).add(headerName));
      }
      setColumnMenu(null);
    }
  };

  const handleInsertRight = () => {
    if (columnMenu) {
      alert(`Insert column to right of "${columnMenu.columnName}" - to be implemented`);
      setColumnMenu(null);
    }
  };

  const handleInsertLeft = () => {
    if (columnMenu) {
      alert(`Insert column to left of "${columnMenu.columnName}" - to be implemented`);
      setColumnMenu(null);
    }
  };

  const handleAttachmentChange = (activityId: number, files?: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setAttachmentPreviews((prev) => ({
      ...prev,
      [activityId]: file.name,
    }));
  };

  const handleDurationChange = (activityId: number, value: string) => {
    setDurationEntries((prev) => ({
      ...prev,
      [activityId]: value,
    }));
  };

  const handlePendingAttachmentInput = (files?: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    // Validate file size (10MB = 10 * 1024 * 1024 bytes)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size must be less than 10MB');
      return;
    }
    
    setPendingAttachmentFile(file);
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setPendingAttachmentPreview(previewUrl);
  };

  const handlePendingDoneCancel = () => {
    // Clean up preview URL if it exists
    if (pendingAttachmentPreview && pendingAttachmentPreview.startsWith('blob:')) {
      URL.revokeObjectURL(pendingAttachmentPreview);
    }
    setPendingDoneActivity(null);
    setPendingDoneValue(false);
    setPendingDurationValue('');
    setPendingAttachmentFile(null);
    setPendingAttachmentPreview(null);
    setPendingUploading(false);
    setPendingDialogPosition(null);
  };

  const handleDeleteActivity = async (activityId: number) => {
    try {
      await activitiesApi.delete(activityId);
      setSelectedActivities((prev) => {
        if (!prev.has(activityId)) return prev;
        const next = new Set(prev);
        next.delete(activityId);
        return next;
      });
      loadActivities();
    } catch (error: any) {
      console.error('Failed to delete activity:', error);
      alert(`Failed to delete activity: ${error?.response?.data?.message || error?.message || 'Unknown error'}`);
    }
  };

  const completeToggleDone = async (id: number, value: boolean) => {
    try {
      await activitiesApi.markDone(id, value);
      setData((prev) =>
        prev
          ? {
              ...prev,
              content: prev.content.map((a) => (a.id === id ? { ...a, done: value } : a)),
            }
          : prev
      );
      loadCounts(filters);
    } catch (e) {
      console.error('Failed to toggle done', e);
    }
  };

  const handlePendingDoneConfirm = async () => {
    if (!pendingDoneActivity) return;
    const duration = pendingDurationValue.trim();
    if (!duration) {
      alert('Please enter a duration.');
      return;
    }
    if (!pendingAttachmentFile && !pendingDoneActivity.attachmentUrl) {
      alert('Please attach an image.');
      return;
    }
    const durationMinutes = parseDurationInputToMinutes(duration);
    if (durationMinutes === null || durationMinutes <= 0) {
      alert('Please enter a valid duration (e.g., 15 or 00:15:00).');
      return;
    }
    
    setPendingUploading(true);
    
    try {
      // Upload screenshot if a new file is selected
      let attachmentUrl = pendingDoneActivity.attachmentUrl;
      if (pendingAttachmentFile) {
        try {
          attachmentUrl = await activitiesApi.uploadScreenshot(pendingDoneActivity.id, pendingAttachmentFile);
        } catch (error: any) {
          console.error('Failed to upload screenshot:', error);
          alert(`Failed to upload screenshot: ${error?.message || 'Unknown error'}`);
          setPendingUploading(false);
          return;
        }
      }
      
      const existingStartMinutes = parseTimeToMinutes(pendingDoneActivity.startTime);
      const startMinutes = existingStartMinutes ?? 0;
      const endMinutes = startMinutes + durationMinutes;
      const startTimeFormatted =
        existingStartMinutes !== null && pendingDoneActivity.startTime
          ? pendingDoneActivity.startTime
          : formatMinutesToHHMM(startMinutes);
      const endTimeFormatted = formatMinutesToHHMM(endMinutes);
      
      const updatedActivity = await activitiesApi.update(pendingDoneActivity.id, {
        startTime: startTimeFormatted,
        endTime: endTimeFormatted,
      });
      if (updatedActivity) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                content: prev.content.map((a) =>
                  a.id === updatedActivity.id ? { ...a, ...updatedActivity, attachmentUrl } : a,
                ),
              }
            : prev,
        );
      }
      
      const durationDisplay = duration.includes(':')
        ? duration
        : formatMinutesToHHMM(durationMinutes);
      setDurationEntries((prev) => ({ ...prev, [pendingDoneActivity.id]: durationDisplay }));
      await completeToggleDone(pendingDoneActivity.id, pendingDoneValue);
      handlePendingDoneCancel();
    } catch (error: any) {
      console.error('Failed to save call duration:', error);
      alert(
        `Failed to save call duration: ${
          error?.response?.data?.message || error?.message || 'Unknown error'
        }`,
      );
      setPendingUploading(false);
    }
  };

  const handleRowClick = (activity: Activity) => {
    setEditingActivity(activity);
    setIsEditOpen(true);
  };

  const normalizeCategoryLabel = (cat?: string | null): 'Activity' | 'Call' | 'Meeting scheduler' => {
    if (!cat) return 'Activity';
    if (cat === 'CALL') return 'Call';
    if (cat === 'MEETING_SCHEDULER') return 'Meeting scheduler';
    return 'Activity';
  };

const handleEditSave = async (value: ActivityFormValues & { id?: number }) => {
  if (!value.id) return;
  try {
    const isoDateForDateTime = (() => {
      if (!value.date) return undefined;
      if (value.date.includes('-')) return value.date;
      if (value.date.includes('/')) {
        const parts = value.date.split('/');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
      return undefined;
    })();

    const activityData: Partial<Activity> = {
      subject: value.subject.trim(),
      date: value.date,
      dueDate: value.date,
      startTime: value.startTime || undefined,
      endTime: value.endTime || undefined,
      priority: value.priority ? value.priority.toUpperCase() : undefined,
      assignedUser: value.assignedUser || undefined,
      phone: value.phone || undefined,
      instagramId: value.instagramId || undefined,
      notes: value.notes || undefined,
      organization: value.organization || undefined,
      type: value.type,
      category: value.category,
      personId: value.personId,
      dealId: value.dealId,
      dealName: value.dealName?.trim() || undefined,
      dateTime: isoDateForDateTime ? `${isoDateForDateTime}T${value.startTime || '00:00'}:00` : undefined,
    };
    
    // Include organizationId if it's provided
    if (value.organizationId && value.organizationId > 0) {
      activityData.organizationId = value.organizationId;
    }
    // Include assignedUserId if it's provided
    if (value.assignedUserId && value.assignedUserId > 0) {
      activityData.assignedUserId = value.assignedUserId;
    }

    await activitiesApi.update(value.id, activityData);
    setIsEditOpen(false);
    setEditingActivity(null);
    loadActivities();
    if (value.serviceCategory) {
      updateServiceCategory(value.id, value.serviceCategory);
    }
  } catch (error: any) {
    console.error('Failed to update activity:', error);
    alert(`Failed to update activity: ${error?.response?.data?.message || error?.message || 'Unknown error'}`);
    }
  };

  const onDragStart = (col: string) => {
    setDraggingColumn(col);
  };

  const onDragOver = (e: React.DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
  };

  const onDrop = (targetCol: string) => {
    if (!draggingColumn || draggingColumn === targetCol) return;
    setColumnOrder(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(draggingColumn);
      const toIdx = next.indexOf(targetCol);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggingColumn);
      return next;
    });
    setDraggingColumn(null);
  };

  const toggleDone = async (activity: Activity, value: boolean) => {
    if (normalizeCategoryLabel(activity.category) === 'Call' && value) {
      setPendingDoneActivity(activity);
      setPendingDoneValue(value);
      setPendingDurationValue(durationEntries[activity.id] ?? '');
      setPendingAttachmentFile(null);
      // If activity already has an attachment URL, use it as preview
      setPendingAttachmentPreview(activity.attachmentUrl || null);
      setPendingDialogPosition(lastClickPosition || null);
      return;
    }
    await completeToggleDone(activity.id, value);
  };

  // Open screenshot viewer
  const openScreenshotViewer = useCallback((activity: Activity) => {
    if (activity.attachmentUrl) {
      setScreenshotViewerActivity(activity);
      setScreenshotViewerImageUrl(activity.attachmentUrl);
      setScreenshotReplacementFile(null);
      setScreenshotReplacementPreview(null);
    }
  }, []);

  // Close screenshot viewer
  const closeScreenshotViewer = useCallback(() => {
    // Clean up preview URL if it exists
    if (screenshotReplacementPreview && screenshotReplacementPreview.startsWith('blob:')) {
      URL.revokeObjectURL(screenshotReplacementPreview);
    }
    setScreenshotViewerActivity(null);
    setScreenshotViewerImageUrl(null);
    setScreenshotReplacementFile(null);
    setScreenshotReplacementPreview(null);
    setScreenshotReplacing(false);
  }, [screenshotReplacementPreview]);

  // Handle screenshot replacement file input
  const handleScreenshotReplacementInput = useCallback((files?: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    // Validate file size (10MB = 10 * 1024 * 1024 bytes)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size must be less than 10MB');
      return;
    }
    
    setScreenshotReplacementFile(file);
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setScreenshotReplacementPreview(previewUrl);
  }, []);

  // Handle screenshot replacement
  const handleScreenshotReplacement = useCallback(async () => {
    if (!screenshotViewerActivity || !screenshotReplacementFile) return;
    
    setScreenshotReplacing(true);
    
    try {
      const newImageUrl = await activitiesApi.uploadScreenshot(screenshotViewerActivity.id, screenshotReplacementFile);
      // Update the image URL
      setScreenshotViewerImageUrl(newImageUrl);
      // Clean up old preview
      if (screenshotReplacementPreview && screenshotReplacementPreview.startsWith('blob:')) {
        URL.revokeObjectURL(screenshotReplacementPreview);
      }
      setScreenshotReplacementFile(null);
      setScreenshotReplacementPreview(null);
      // Reload activities to get updated data
      loadActivities();
      alert('Screenshot replaced successfully!');
    } catch (error: any) {
      console.error('Failed to replace screenshot:', error);
      alert(`Failed to replace screenshot: ${error?.message || 'Unknown error'}`);
    } finally {
      setScreenshotReplacing(false);
    }
  }, [screenshotViewerActivity, screenshotReplacementFile, screenshotReplacementPreview]);

  const openRowMenu = (event: React.MouseEvent<HTMLButtonElement>, activity: Activity) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setRowMenu({
      activity,
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 4,
    });
  };

  const closeRowMenu = () => setRowMenu(null);

  const handleRowMenuMarkDone = async () => {
    if (!rowMenu) return;
    const { activity, x, y } = rowMenu;
    setRowMenu(null);
    setLastClickPosition({ top: y, left: x });
    await toggleDone(activity, !activity.done);
  };

  const handleRowMenuDelete = async () => {
    if (!rowMenu) return;
    const { activity } = rowMenu;
    setRowMenu(null);
    if (!confirm('Are you sure you want to delete this activity?')) {
      return;
    }
    await handleDeleteActivity(activity.id);
  };

  const parseDate = (s?: string) => {
    if (!s) return undefined;
    const p = s.includes('-') ? s.split('-') : s.split('/');
    let y: number, m: number, d: number;
    if (p.length === 3 && p[0].length === 2) { d = +p[0]; m = +p[1]-1; y = +p[2]; }
    else if (p.length === 3) { y = +p[0]; m = +p[1]-1; d = +p[2]; }
    else return undefined;
    const dt = new Date(y, m, d); dt.setHours(0,0,0,0); return dt;
  };

  const effectiveDate = (a: Activity) => parseDate((a.date ?? a.dueDate) || undefined);
  const today = new Date(); today.setHours(0,0,0,0);

  const statusClass = (a: Activity) => {
    const ed = effectiveDate(a);
    if (!ed) return 'text-black';
    if (ed.getTime() < today.getTime()) return 'text-red';
    if (ed.getTime() === today.getTime()) return 'text-green';
    return 'text-black';
  };

  const shouldShow = (a: Activity) => {
    // Backend now handles all activity scoping by assigned user:
    // - SALES users: Only see activities assigned to themselves and their PRESALES team
    // - CATEGORY_MANAGER users: Only see activities assigned to themselves, their SALES reports, and PRESALES under those SALES
    // - PRESALES users: Only see activities assigned to themselves and their Sales manager
    // Organization-based filtering is no longer used for activity visibility
    // We trust the backend to return only the activities the user should see

    // Service category filtering (PHOTOGRAPHY, MAKEUP, PLANNING_DECOR)
    // Note: This is separate from activity visibility scoping (which backend handles by assignment)
    // This filters activities by service category for display purposes
    const selectedCategories = Array.isArray(selectedCategoryFilter) 
      ? selectedCategoryFilter 
      : (selectedCategoryFilter ? [selectedCategoryFilter] : []);
    
    if (selectedCategories.length > 0) {
      const activityServiceCategory = getServiceCategoryForActivity(a.id);
      if (!selectedCategories.includes(activityServiceCategory)) {
    // For category managers, be more lenient: if activity belongs to their scoped organizations,
    // show it even if service category doesn't match exactly (backend already scoped it)
        if (isCategoryManager) {
          const activityOrgName = a.organization?.toLowerCase() || '';
          const belongsToScopedOrg = baseOrganizationOptions.some(
            (org) => org.name?.toLowerCase() === activityOrgName
          );
          if (!belongsToScopedOrg) {
            return false;
          }
          // If it belongs to scoped org, continue to show it (don't filter by service category)
        } else {
          // For admin and others, strictly filter by service category
          return false;
        }
      }
    }
    // organizationId / assignedUserId are now sent to backend;
    // we rely on backend scoping instead of client-side matching here.

    const ed = effectiveDate(a);
    
    // "All" tab shows everything
    if (tab === 'All') return true;
    
    // "To-do" tab shows all activities that are not done
    if (tab === 'To‑do') return !a.done;
    
    // For date-based tabs, we need the activity to have a date
    if (!ed) {
      // Activities without dates don't show in date-specific tabs
      if (tab === 'Today' || tab === 'Tomorrow' || tab === 'Overdue' || tab === 'This week' || tab === 'Next week' || tab === 'This month' || tab === 'Prev month' || tab === 'This year' || tab === 'Select period' || tab === 'Select Date') {
        return false;
      }
      return true;
    }
    
    // "Today" tab: only show activities with date = today
    if (tab === 'Today') {
      return ed.getTime() === today.getTime();
    }
    
    // "Tomorrow" tab: only show activities with date = tomorrow
    if (tab === 'Tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return ed.getTime() === tomorrow.getTime();
    }
    
    // "Overdue" tab: show activities with date < today (both done and not done)
    if (tab === 'Overdue') {
      return ed.getTime() < today.getTime();
    }
    
    // "This week" tab: show activities within this week (Sunday to Saturday)
    if (tab === 'This week') {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)
      weekEnd.setHours(23, 59, 59, 999);
      return ed.getTime() >= weekStart.getTime() && ed.getTime() <= weekEnd.getTime();
    }
    
    // "Next week" tab: show activities within next week
    if (tab === 'Next week') {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of current week
      const nextWeekStart = new Date(weekStart);
      nextWeekStart.setDate(weekStart.getDate() + 7); // Start of next week
      const nextWeekEnd = new Date(nextWeekStart);
      nextWeekEnd.setDate(nextWeekStart.getDate() + 6); // End of next week
      nextWeekEnd.setHours(23, 59, 59, 999);
      return ed.getTime() >= nextWeekStart.getTime() && ed.getTime() <= nextWeekEnd.getTime();
    }
    
    // "This month" tab: show activities within current month
    if (tab === 'This month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      return ed.getTime() >= monthStart.getTime() && ed.getTime() <= monthEnd.getTime();
    }
    
    // "Prev month" tab: show activities within previous month
    if (tab === 'Prev month') {
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      prevMonthStart.setHours(0, 0, 0, 0);
      const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      prevMonthEnd.setHours(23, 59, 59, 999);
      return ed.getTime() >= prevMonthStart.getTime() && ed.getTime() <= prevMonthEnd.getTime();
    }
    
    // "This year" tab: show activities within current year
    if (tab === 'This year') {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      yearStart.setHours(0, 0, 0, 0);
      const yearEnd = new Date(today.getFullYear(), 11, 31);
      yearEnd.setHours(23, 59, 59, 999);
      return ed.getTime() >= yearStart.getTime() && ed.getTime() <= yearEnd.getTime();
    }
    
    // "Select period" and "Select Date": rely on backend filtering
    // The backend filters by dateFrom/dateTo, so show all results from API
    if (tab === 'Select period' || tab === 'Select Date') {
      return true;
    }
    
    return true;
  };

  // Toggle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked && data?.content) {
      const allIds = new Set(data.content.filter(shouldShow).map(a => a.id));
      setSelectedActivities(allIds);
    } else {
      setSelectedActivities(new Set());
    }
  };

  // Toggle individual selection
  const handleToggleSelect = (id: number) => {
    setSelectedActivities(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Check if all visible items are selected
  const allSelected = data?.content ? 
    data.content.filter(shouldShow).length > 0 && 
    data.content.filter(shouldShow).every(a => selectedActivities.has(a.id)) : false;
  
  // Check if some items are selected (for indeterminate state)
  const someSelected = selectedActivities.size > 0 && !allSelected;

  const getCellValue = (a: Activity, columnName: string) => {
    const key = getColumnKey(columnName);
    switch (key) {
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={selectedActivities.has(a.id)}
            onChange={() => handleToggleSelect(a.id)}
            style={{ cursor: 'pointer' }}
          />
        );
      case 'done':
        return (
          <div
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setLastClickPosition({
                top: rect.top + window.scrollY + rect.height + 8,
                left: rect.left + window.scrollX,
              });
              toggleDone(a, !a.done);
            }}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: a.done ? 'none' : '2px solid #ccc',
              backgroundColor: a.done ? '#28a745' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              margin: '0 auto',
            }}
          >
            {a.done && (
              <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>✓</span>
            )}
          </div>
        );
      case 'subject':
        return (
          <span 
            className={statusClass(a)} 
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.subject}
          </span>
        );
      case 'category':
        // Prefer type field if present, fallback to category
        const typeDisplay = formatActivityTypeLabel(a.type || a.category);
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {typeDisplay}
          </span>
        );
      case 'categoryDisplay':
        return (
          <span
            className={statusClass(a)}
            style={{ textTransform: 'capitalize' }}
          >
            {(() => {
              const code = getServiceCategoryForActivity(a.id);
              return categoryLabelMap[code] || code;
            })()}
          </span>
        );
      case 'deal':
        const dealName = a.dealName || (a.dealId ? dealsMap.get(a.dealId) : null);
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {dealName || '-'}
          </span>
        );
      case 'instagramId':
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.instagramId || '-'}
          </span>
        );
      case 'phone':
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.phone || '-'}
          </span>
        );
      case 'organization':
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.organization || '-'}
          </span>
        );
      case 'dueDate':
        return (
          <span 
            className={statusClass(a)} 
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.dueDate || '-'}
          </span>
        );
      case 'assignedUser':
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.assignedUser || '-'}
          </span>
        );
      case 'priority':
        if (!a.priority) return '-';
        const priorityLower = a.priority.toLowerCase();
        let priorityClass = 'priority-medium'; // default
        if (priorityLower === 'low') {
          priorityClass = 'priority-low';
        } else if (priorityLower === 'high') {
          priorityClass = 'priority-high';
        }
        return (
          <span 
            className={`priority-badge ${priorityClass}`}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.priority}
          </span>
        );
      case 'status':
        return (
          <span 
            className={statusClass(a)} 
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.status || '-'}
          </span>
        );
      case 'notes':
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.notes || '-'}
          </span>
        );
      case 'callType':
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.callType || '-'}
          </span>
        );
      case 'scheduleDate':
        return (
          <span 
            className={statusClass(a)} 
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.date || '-'}
          </span>
        );
      case 'scheduleTime':
        return (
          <span 
            className={statusClass(a)} 
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.startTime || '-'}
          </span>
        );
      case 'scheduleBy':
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.scheduleBy || '-'}
          </span>
        );
      case 'duration':
        {
          const parseTime = (time?: string | null) => {
            if (!time) return null;
            const [h, m] = time.split(':');
            if (h === undefined || m === undefined) return null;
            const hours = Number(h);
            const minutes = Number(m);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
            return hours * 60 + minutes;
          };
          const startMinutes = parseTime(a.startTime);
          const endMinutes = parseTime(a.endTime);
          const value = durationEntries[a.id] ?? (startMinutes != null && endMinutes != null && endMinutes > startMinutes
            ? String(endMinutes - startMinutes)
            : '');
          return (
            <input
              type="text"
              placeholder="hh:mm:ss"
              value={value}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleDurationChange(a.id, e.target.value)}
              style={{ width: 90 }}
            />
          );
        }
      case 'attachment':
        // Show image thumbnail if attachmentUrl exists, otherwise show file input
        if (a.attachmentUrl) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  openScreenshotViewer(a);
                }}
                title="Click to view full image"
              >
                <img
                  src={a.attachmentUrl}
                  alt="Screenshot"
                  style={{
                    width: 40,
                    height: 40,
                    objectFit: 'cover',
                    borderRadius: 4,
                    border: '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                  onError={(e) => {
                    console.error('Failed to load image:', a.attachmentUrl);
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openScreenshotViewer(a);
                }}
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  color: '#2563eb',
                  background: 'transparent',
                  border: '1px solid #2563eb',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
                title="Edit/Replace image"
              >
                Edit
              </button>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <label
              style={{
                color: '#2563eb',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 13,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {attachmentPreviews[a.id] || 'Select image'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleAttachmentChange(a.id, e.target.files)}
              />
            </label>
          </div>
        );
      default:
        return '-';
    }
  };

  // Get the label for the first summary box based on the selected tab
  const applyCardFilter = (action: SummaryCardAction) => {
    const dateFilters = getDatePreservingFilters();
    switch (action) {
      case 'activityAll':
        setCategory('Activity');
        setFilters(dateFilters);
        break;
      case 'activityPending':
        setCategory('Activity');
        setFilters({ ...dateFilters, done: false });
        break;
      case 'activityCompleted':
        setCategory('Activity');
        setFilters({ ...dateFilters, done: true });
        break;
      case 'callAll':
        setCategory('Call');
        setFilters(dateFilters);
        break;
      case 'callDone':
        setCategory('Call');
        setFilters({ ...dateFilters, done: true });
        break;
      case 'meetingAll':
        setCategory('Meeting scheduler');
        setFilters(dateFilters);
        break;
      case 'meetingDone':
        setCategory('Meeting scheduler');
        setFilters({ ...dateFilters, done: true });
        break;
      case 'overdue':
        setTab('Overdue');
        break;
      default:
        break;
    }
  };

  const formatDurationDisplay = (minutes: number) => {
    if (!minutes || minutes === 0) return '0';
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (minutes >= 60) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  if (loading) return <div style={{ padding: 16 }}>Loading activities…</div>;
  if (error) return <div style={{ padding: 16, color: 'red' }}>{error}</div>;

  type SummaryCard = {
    value: string | number;
    label: string;
    action: SummaryCardAction;
    tone?: 'blue' | 'green' | 'yellow' | 'red';
  };

  const toneStyles: Record<
    NonNullable<SummaryCard['tone']>,
    { background: string; text: string }
  > = {
    blue: { background: '#E3F2FD', text: '#1D4ED8' },
    green: { background: '#E6F4EA', text: '#15803D' },
    yellow: { background: '#FEF7CD', text: '#B45309' },
    red: { background: '#FEE2E2', text: '#B91C1C' },
  };

  const summaryCards: SummaryCard[] =
    category === 'Activity'
      ? [
          { value: activityTotalCount, label: 'TOTAL ACTIVITIES', action: 'activityAll' as SummaryCardAction, tone: 'blue' },
          { value: activityPendingCount, label: 'PENDING', action: 'activityPending' as SummaryCardAction, tone: 'yellow' },
          { value: activityCompletedCount, label: 'COMPLETED', action: 'activityCompleted' as SummaryCardAction, tone: 'green' },
          { value: callAssignedCount, label: 'Total\nAssign\u00A0Call', action: 'callAll' as SummaryCardAction, tone: 'blue' },
          { value: meetingAssignedCount, label: 'Total\nMeeting\u00A0Scheduled', action: 'meetingAll' as SummaryCardAction, tone: 'blue' },
        ]
      : [
          { value: callAssignedCount, label: 'Total\nAssign\u00A0Call', action: 'callAll' as SummaryCardAction, tone: 'blue' },
          { value: callTakenCount, label: 'CALL TAKEN', action: 'callDone' as SummaryCardAction, tone: 'green' },
          { value: meetingAssignedCount, label: 'Total\nMeeting\u00A0Scheduled', action: 'meetingAll' as SummaryCardAction, tone: 'blue' },
          { value: meetingDoneCount, label: 'MEETING DONE', action: 'meetingDone' as SummaryCardAction, tone: 'green' },
          { value: formatDurationDisplay(totalCallDurationMinutes), label: 'Total\nCall\u00A0Duration', action: 'callAll' as SummaryCardAction, tone: 'yellow' },
          { value: overdueCount, label: 'OVERDUE', action: 'overdue' as SummaryCardAction, tone: 'red' },
        ];

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, position: 'relative' }}>
        <h2 style={{ margin: 0 }}>Activities</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button 
            className="btn" 
            onClick={() => setIsAddOpen(true)}
            style={{
              background: '#28a745',
              color: 'white',
              border: 'none',
              fontWeight: 600,
            }}
          >
            + Activity
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className="btn"
              onClick={() => setIsTabDropdownOpen(prev => !prev)}
              style={{ minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
            >
              <span>{tab}</span>
              <span style={{ fontSize: 12 }}>▾</span>
            </button>
            {isTabDropdownOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 990 }}
                  onClick={() => setIsTabDropdownOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    background: '#fff',
                    border: '1px solid #e0e0e0',
                    borderRadius: 6,
                    boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                    minWidth: 220,
                    zIndex: 1000,
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {tabOptions.map(option => (
                    <button
                      key={option}
                      onClick={() => handleTabSelection(option)}
                      className="btn"
                      style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        background: tab === option ? '#e3f2fd' : '#fff',
                        border: '1px solid transparent',
                        color: '#111',
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button 
              className="btn" 
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
            >
              Filters
            </button>
            {isFilterDropdownOpen && (
              <>
                <div 
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999,
                  }}
                  onClick={() => setIsFilterDropdownOpen(false)}
                />
                <FilterDropdown
                  savedFilters={[...systemFilters, ...savedFilters]}
                  activeFilterName={activeFilterName}
                  onSelectFilter={handleSelectFilter}
                  onAddNewFilter={() => {
                    setIsFilterDropdownOpen(false);
                    setIsFilterModalOpen(true);
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {activeCustomFilters.length > 0 && (
        <div style={{ marginBottom: 12, padding: 8, background: '#e3f2fd', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Active filter: {activeFilterName}</span>
          <button 
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}
            onClick={() => {
              setActiveCustomFilters([]);
              setActiveFilterName(null);
              setFilters({ page: 0, size: 25 });
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Summary Boxes */}
      <div className="summary-boxes-container">
        {summaryCards.map((card) => {
          const tone = card.tone ? toneStyles[card.tone] : null;
          return (
            <div
              key={card.label}
              className="summary-box"
              style={{
                flex: summaryCards.length > 4 ? '0 1 160px' : undefined,
                cursor: 'pointer',
                border: '1px solid transparent',
                backgroundColor: tone?.background ?? '#fff',
              }}
              onClick={() => applyCardFilter(card.action)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  applyCardFilter(card.action);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div
                className="summary-number"
                style={{ color: tone?.text ?? '#2563eb' }}
              >
                {String(card.value)}
        </div>
              <div
                className="summary-label"
                style={{ color: tone?.text ?? '#28a745', textAlign: 'center' }}
              >
                {card.label.includes('\n') ? (
                  <>
                    {card.label.split('\n').map((line, idx) => (
                      <div key={idx} style={{ whiteSpace: 'nowrap' }}>{line}</div>
                    ))}
                  </>
                ) : (
                  card.label
                )}
        </div>
        </div>
          );
        })}
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className={`btn ${category === 'Activity' ? 'active' : ''}`}
            onClick={() => setCategory('Activity')}
          >
            Activity
          </button>
          <button
            className={`btn ${category === 'Call' ? 'active' : ''}`}
            onClick={() => setCategory('Call')}
          >
            Call
          </button>
          <button
            className={`btn ${category === 'Meeting scheduler' ? 'active' : ''}`}
            onClick={() => setCategory('Meeting scheduler')}
          >
            Meeting scheduler
          </button>
        </div>
        <div className="toolbar-filters">
          {isAdmin && (
            <div className="set-target-multi" ref={categoryMultiSelectRef} style={{ minWidth: '200px' }}>
              <button
                type="button"
                className={`set-target-multi-trigger${Array.isArray(selectedCategoryFilter) && selectedCategoryFilter.length === 0 ? ' placeholder' : ''}`}
                onClick={() => setShowCategoryMultiSelect(!showCategoryMultiSelect)}
              >
                {Array.isArray(selectedCategoryFilter) && selectedCategoryFilter.length === 0 ? (
                  <span>All Categories</span>
                ) : (
                  <div className="set-target-multi-tags">
                    {Array.isArray(selectedCategoryFilter) ? selectedCategoryFilter.map((categoryCode) => {
                      const category = categoryFilterOptions.find((opt) => opt.code === categoryCode);
                      return category ? (
                        <span key={category.code} className="set-target-tag">
                          {category.label}
                          <span
                            className="set-target-tag-remove"
                            role="button"
                            tabIndex={0}
                            aria-label={`Remove ${category.label}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCategoryMultiSelectToggle(category.code);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                handleCategoryMultiSelectToggle(category.code);
                              }
                            }}
                          >
                            ×
                          </span>
                        </span>
                      ) : null;
                    }) : (
                      typeof selectedCategoryFilter === 'string' && selectedCategoryFilter ? (
                        <span className="set-target-tag">
                          {categoryFilterOptions.find((opt) => opt.code === selectedCategoryFilter)?.label || selectedCategoryFilter}
                        </span>
                      ) : null
                    )}
                  </div>
                )}
                <span className="set-target-multi-caret">▾</span>
              </button>
              {showCategoryMultiSelect && (
                <div className="set-target-multi-dropdown">
                  <div className="set-target-multi-search">
                    <input
                      type="text"
                      placeholder="Search categories"
                      value={categorySearchQuery}
                      onChange={(e) => setCategorySearchQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    className="set-target-multi-option special"
                    onClick={clearCategoryFilter}
                  >
                    All Categories
                    {Array.isArray(selectedCategoryFilter) && selectedCategoryFilter.length === 0 && (
                      <span className="set-target-check">✓</span>
                    )}
                  </button>
                  <div className="set-target-multi-options">
                    {filteredCategoriesForMultiSelect.map((opt) => {
                      const isSelected = Array.isArray(selectedCategoryFilter) && selectedCategoryFilter.includes(opt.code);
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          className={`set-target-multi-option${isSelected ? ' selected' : ''}`}
                          onClick={() => handleCategoryMultiSelectToggle(opt.code)}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <span className="set-target-check">✓</span>}
                        </button>
                      );
                    })}
                    {filteredCategoriesForMultiSelect.length === 0 && (
                      <div className="set-target-empty">No matches found.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {(isAdmin || isCategoryManager || isSales || isPresales) ? (
            // Multi-select for ADMIN, CATEGORY_MANAGER, SALES, and PRESALES
            <>
              <div className="set-target-multi" ref={orgMultiSelectRef} style={{ minWidth: '200px' }}>
                <button
                  type="button"
                  className={`set-target-multi-trigger${Array.isArray(selectedOrganizationFilter) && selectedOrganizationFilter.length === 0 ? ' placeholder' : ''}`}
                  onClick={() => setShowOrgMultiSelect(!showOrgMultiSelect)}
                >
                  {Array.isArray(selectedOrganizationFilter) && selectedOrganizationFilter.length === 0 ? (
                    <span>All Organizations</span>
                  ) : (
                    <div className="set-target-multi-tags">
                      {Array.isArray(selectedOrganizationFilter) ? selectedOrganizationFilter.map((orgId) => {
                        const org = organizationOptions.find((o) => o.id === orgId);
                        return org ? (
                          <span key={org.id} className="set-target-tag">
                            {org.name}
                            <span
                              className="set-target-tag-remove"
                              role="button"
                              tabIndex={0}
                              aria-label={`Remove ${org.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOrganizationMultiSelectToggle(org.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleOrganizationMultiSelectToggle(org.id);
                                }
                              }}
                            >
                              ×
                            </span>
                          </span>
                        ) : null;
                      }) : null}
                    </div>
                  )}
                  <span className="set-target-multi-caret">▾</span>
                </button>
                {showOrgMultiSelect && (
                  <div className="set-target-multi-dropdown">
                    <div className="set-target-multi-search">
                      <input
                        type="text"
                        placeholder="Search organizations"
                        value={orgSearchQuery}
                        onChange={(e) => setOrgSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      className="set-target-multi-option special"
                      onClick={clearOrganizationFilter}
                    >
                      All Organizations
                      {Array.isArray(selectedOrganizationFilter) && selectedOrganizationFilter.length === 0 && (
                        <span className="set-target-check">✓</span>
                      )}
                    </button>
                    <div className="set-target-multi-options">
                      {filteredOrganizationsForMultiSelect.map((org) => {
                        const isSelected = Array.isArray(selectedOrganizationFilter) && selectedOrganizationFilter.includes(org.id || 0);
                        return (
                          <button
                            key={org.id}
                            type="button"
                            className={`set-target-multi-option${isSelected ? ' selected' : ''}`}
                            onClick={() => handleOrganizationMultiSelectToggle(org.id || 0)}
                          >
                            <span>{org.name || `Organization #${org.id}`}</span>
                            {isSelected && <span className="set-target-check">✓</span>}
                          </button>
                        );
                      })}
                      {filteredOrganizationsForMultiSelect.length === 0 && (
                        <div className="set-target-empty">No matches found.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="set-target-multi" ref={userMultiSelectRef} style={{ minWidth: '200px' }}>
                <button
                  type="button"
                  className={`set-target-multi-trigger${Array.isArray(selectedManagerFilter) && selectedManagerFilter.length === 0 ? ' placeholder' : ''}`}
                  onClick={() => setShowUserMultiSelect(!showUserMultiSelect)}
                >
                  {Array.isArray(selectedManagerFilter) && selectedManagerFilter.length === 0 ? (
                    <span>All Users</span>
                  ) : (
                    <div className="set-target-multi-tags">
                      {Array.isArray(selectedManagerFilter) ? selectedManagerFilter.map((userId) => {
                        const user = managerOptions.find((u) => u.id === userId);
                        if (!user) return null;
                        const label = getUserDisplayLabel(user);
                        return (
                          <span key={user.id} className="set-target-tag">
                            {label}
                            <span
                              className="set-target-tag-remove"
                              role="button"
                              tabIndex={0}
                              aria-label={`Remove ${label}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleUserMultiSelectToggle(user.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleUserMultiSelectToggle(user.id);
                                }
                              }}
                            >
                              ×
                            </span>
                          </span>
                        );
                      }) : null}
                    </div>
                  )}
                  <span className="set-target-multi-caret">▾</span>
                </button>
                {showUserMultiSelect && (
                  <div className="set-target-multi-dropdown">
                    <div className="set-target-multi-search">
                      <input
                        type="text"
                        placeholder="Search users"
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      className="set-target-multi-option special"
                      onClick={clearUserFilter}
                    >
                      All Users
                      {Array.isArray(selectedManagerFilter) && selectedManagerFilter.length === 0 && (
                        <span className="set-target-check">✓</span>
                      )}
                    </button>
                    <div className="set-target-multi-options">
                      {filteredUsersForMultiSelect.map((user) => {
                        const isSelected = Array.isArray(selectedManagerFilter) && selectedManagerFilter.includes(user.id);
                        const label = getUserDisplayLabel(user);
                        return (
                          <button
                            key={user.id}
                            type="button"
                            className={`set-target-multi-option${isSelected ? ' selected' : ''}`}
                            onClick={() => handleUserMultiSelectToggle(user.id)}
                          >
                            <span>{label}</span>
                            {isSelected && <span className="set-target-check">✓</span>}
                          </button>
                        );
                      })}
                      {filteredUsersForMultiSelect.length === 0 && (
                        <div className="set-target-empty">No matches found.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            // Single select for other roles
            <>
          <select
            className="toolbar-select"
                value={typeof selectedOrganizationFilter === 'string' ? selectedOrganizationFilter : ''}
            onChange={(e) => handleOrganizationFilterChange(e.target.value)}
          >
            <option value="">All Organizations</option>
            {organizationOptions.map((org) => (
              <option key={org.id} value={String(org.id)}>
                {org.name || `Organization #${org.id}`}
              </option>
            ))}
          </select>
            <select
              className="toolbar-select"
                value={typeof selectedManagerFilter === 'string' ? selectedManagerFilter : ''}
              onChange={(e) => handleManagerFilterChange(e.target.value)}
            >
              <option value="">All Users</option>
              {managerOptions.map((manager) => {
                const label = getUserDisplayLabel(manager);
                return (
                  <option key={manager.id} value={String(manager.id)}>
                    {label}
                  </option>
                );
              })}
            </select>
            </>
          )}
        </div>
      </div>
      <div className="tabs">
        {primaryTabs.map((t) => (
          <span 
            key={t} 
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => handleTabSelection(t)}
          >
            {t}
          </span>
        ))}
      </div>
      {/* Bulk Edit Bar */}
      {selectedActivities.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          background: '#e3f2fd',
          borderRadius: '4px',
          marginBottom: '16px',
        }}>
          <span style={{ fontSize: '14px', color: '#1976d2', fontWeight: 500 }}>
            {selectedActivities.size} selected
          </span>
          <button
            onClick={() => setIsBulkEditOpen(true)}
            style={{
              padding: '8px 16px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Bulk edit
          </button>
          <button
            onClick={async () => {
              if (confirm(`Are you sure you want to delete ${selectedActivities.size} activity(ies)?`)) {
                try {
                  const ids = Array.from(selectedActivities);
                  await Promise.all(ids.map(id => activitiesApi.delete(id)));
                  setSelectedActivities(new Set());
                  loadActivities();
                } catch (error: any) {
                  console.error('Failed to delete activities:', error);
                  alert(`Failed to delete activities: ${error?.response?.data?.message || error?.message || 'Unknown error'}`);
                }
              }
            }}
            style={{
              padding: '8px 16px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Delete
          </button>
        </div>
      )}

      {/* Add keyframes animation for highlight pulsing */}
      <style>{`
        @keyframes highlightPulse {
          0%, 100% {
            box-shadow: 0 0 0 6px #1976d2, 0 8px 24px rgba(33, 150, 243, 0.6), inset 0 0 0 2px rgba(33, 150, 243, 0.3);
            background-color: #bbdefb;
          }
          50% {
            box-shadow: 0 0 0 10px #1976d2, 0 12px 32px rgba(33, 150, 243, 0.8), inset 0 0 0 2px rgba(33, 150, 243, 0.4);
            background-color: #90caf9;
          }
        }
      `}</style>
      <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {/* Checkbox column header */}
            <th
              className="col-checkbox"
              style={{ width: '40px', textAlign: 'center', padding: '10px 8px' }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someSelected;
                }}
                onChange={(e) => handleSelectAll(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
            </th>
            {columnOrder
              .filter(col => !hiddenColumns.has(col))
              .map((h) => (
                <th
                  key={h}
                  className={
                    h==='Done'?'col-done':
                h.includes('Subject')?'col-subject':
                h==='Deal'?'col-deal':
                h.includes('Instagram')?'col-id':
                h==='Phone'?'col-phone':
                h==='Organization'?'col-org':
                h.includes('Assigned')?'col-assignee':
                h.includes('date')?'col-date':
                h.includes('time')?'col-time':
                h==='Status'?'col-status':
                h==='Notes'?'col-notes':''
                  }
                  draggable
                  onDragStart={() => onDragStart(h)}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(h)}
                  onClick={(e) => handleColumnHeaderClick(e, h)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  {h}
                </th>
            ))}
            <th style={{ width: '48px' }}></th>
          </tr>
        </thead>
        <tbody>
          {data?.content?.filter(shouldShow).map((a) => {
            // Use state-based highlighting for persistence, fallback to URL param
            const activityIdFromUrl = searchParams.get('activityId');
            const isHighlighted = (highlightedActivityId === a.id) || (activityIdFromUrl && Number(activityIdFromUrl) === a.id);
            return (
            <tr 
              key={a.id} 
              ref={(el) => {
                if (el) {
                  activityRowRefs.current.set(a.id, el);
                } else {
                  activityRowRefs.current.delete(a.id);
                }
              }}
              onClick={() => handleRowClick(a)} 
              style={{ 
                cursor: 'pointer',
                backgroundColor: isHighlighted ? '#bbdefb' : 'transparent',
                transition: 'background-color 0.3s ease, box-shadow 0.3s ease, border 0.3s ease',
                boxShadow: isHighlighted ? '0 0 0 6px #1976d2, 0 8px 24px rgba(33, 150, 243, 0.6), inset 0 0 0 2px rgba(33, 150, 243, 0.3)' : 'none',
                outline: isHighlighted ? '4px solid #1976d2' : 'none',
                outlineOffset: isHighlighted ? '-4px' : '0',
                borderLeft: isHighlighted ? '8px solid #1976d2' : 'none',
                borderRight: isHighlighted ? '2px solid #1976d2' : 'none',
                position: isHighlighted ? 'relative' : 'static',
                zIndex: isHighlighted ? 100 : 'auto',
                transform: isHighlighted ? 'scale(1.01)' : 'scale(1)',
              }}
            >
              {/* Checkbox column cell */}
              <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                <input
                  type="checkbox"
                  checked={selectedActivities.has(a.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => handleToggleSelect(a.id)}
                  style={{ cursor: 'pointer' }}
                />
              </td>
              {columnOrder
                .filter(col => !hiddenColumns.has(col))
                .map((col) => (
                  <td key={col}>{getCellValue(a, col)}</td>
                ))}
              <td style={{ width: '48px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => openRowMenu(e, a)}
                  title="Row actions"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
                >
                  ⋯
                </button>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {rowMenu && (
        <div
          onClick={closeRowMenu}
          style={{ position: 'fixed', inset: 0, zIndex: 1300 }}
        >
          <div
            style={{
              position: 'absolute',
              top: rowMenu.y,
              left: rowMenu.x,
              background: '#fff',
              boxShadow: '0 8px 24px rgba(15,23,42,0.15)',
              borderRadius: 8,
              padding: '4px 0',
              minWidth: 160,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleRowMenuMarkDone}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              {rowMenu.activity.done ? 'Mark undone' : 'Mark as done'}
            </button>
            {rowMenu.activity.attachmentUrl && (
              <button
                onClick={() => {
                  openScreenshotViewer(rowMenu.activity);
                  setRowMenu(null);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#2563eb',
                }}
              >
                View Screenshot
              </button>
            )}
            <button
              onClick={handleRowMenuDelete}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#dc2626',
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {columnMenu && (
        <ColumnMenu
          isOpen={columnMenu.isOpen}
          columnName={columnMenu.columnName}
          currentSort={sortConfig || undefined}
          position={columnMenu.position}
          onClose={() => setColumnMenu(null)}
          onSortAscending={handleSortAscending}
          onSortDescending={handleSortDescending}
          onHideColumn={handleHideColumn}
          onInsertRight={handleInsertRight}
          onInsertLeft={handleInsertLeft}
        />
      )}

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onSave={handleSaveFilter}
        availableFields={availableFields}
        fieldOptions={fieldOptions}
      />

      <ActivityModal
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          hasHandledOpenModal.current = false;
          // Clear location state to prevent modal from reopening
          navigate(location.pathname, { replace: true, state: {} });
        }}
        initialCategory={category}
        initialServiceCategory={DEFAULT_CATEGORY_OPTIONS[0].code}
        userOptions={managerOptions}
        onSave={async (v) => {
          if (!v.subject || v.subject.trim() === '') {
            alert('Subject is required');
            return;
          }
          try {
            // If no date is provided, default to today's date in dd/MM/yyyy format (backend format)
            let activityDate = v.date;
            if (!activityDate) {
              activityDate = formatDateDDMMYYYY(new Date());
            } else if (activityDate.includes('-')) {
              // Convert yyyy-MM-dd to dd/MM/yyyy if needed
              const parts = activityDate.split('-');
              if (parts.length === 3) {
                activityDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
              }
            }

            const isoDateForDateTime = (() => {
              if (!v.date) return undefined;
              if (v.date.includes('-')) return v.date;
              if (v.date.includes('/')) {
                const parts = v.date.split('/');
                if (parts.length === 3) {
                  return `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
              }
              return undefined;
            })();

            const selectedType = v.type || v.category || (category === 'Activity' ? 'ACTIVITY' : getCategoryEnum(category));
            const parentCategory = mapActivityTypeToCategory(selectedType);

            const activityData: Partial<Activity> = {
              subject: v.subject.trim(),
              date: activityDate,
              dueDate: activityDate, // Set dueDate for filtering
              startTime: v.startTime || undefined,
              priority: v.priority ? v.priority.toUpperCase() : undefined,
              assignedUser: v.assignedUser || undefined,
              phone: v.phone || undefined,
              instagramId: v.instagramId || undefined,
              notes: v.notes || undefined,
              organization: v.organization || undefined,
              dealName: v.dealName?.trim() || undefined,
              // Use derived category and type
              category: parentCategory,
              type: selectedType || undefined,
              dateTime: isoDateForDateTime ? `${isoDateForDateTime}T${v.startTime || '00:00'}:00` : undefined,
            };
            
            // Only include personId if it's provided and > 0
            if (v.personId && v.personId > 0) {
              activityData.personId = v.personId;
            }
            if (v.dealId && v.dealId > 0) {
              activityData.dealId = v.dealId;
            }
            // Include organizationId if it's provided
            if (v.organizationId && v.organizationId > 0) {
              activityData.organizationId = v.organizationId;
            }
            // Include assignedUserId if it's provided
            if (v.assignedUserId && v.assignedUserId > 0) {
              activityData.assignedUserId = v.assignedUserId;
            }
            
            const created = await activitiesApi.create(activityData);
            if (created?.id && v.serviceCategory) {
              updateServiceCategory(created.id, v.serviceCategory);
            }
            // Reset to "All" tab to ensure new activity is visible
            setTab('All');
            // Clear category filter to show the newly created activity
            // The activity might have a different category than the page filter
            const newFilters: ActivityFilters = { 
              page: 0, 
              size: 25,
              category: undefined // Explicitly set to undefined to show all activities
            };
            setFilters(newFilters);
            // Load activities without category filter to show the new activity
            loadActivities(newFilters);
            loadCounts(newFilters);
            // Don't close modal here - let ActivityModal handle it after showing confirmation
            // setIsAddOpen(false);
          } catch (error: any) {
            console.error('Failed to create activity:', error);
            alert(`Failed to create activity: ${error?.response?.data?.message || error?.message || 'Unknown error'}`);
          }
        }}
      />

      {editingActivity && (
        <ActivityModal
          isOpen={isEditOpen}
          onClose={() => {
            setIsEditOpen(false);
            setEditingActivity(null);
          }}
          onSave={handleEditSave}
          initialCategory={normalizeCategoryLabel(editingActivity.category)}
          initialOrganization={editingActivity.organization || undefined}
          initialActivity={editingActivity}
          initialServiceCategory={serviceCategories[editingActivity.id] || DEFAULT_CATEGORY_OPTIONS[0].code}
          userOptions={managerOptions}
        />
      )}

      {pendingDoneActivity && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.2)',
              zIndex: 1499,
            }}
            onClick={handlePendingDoneCancel}
          />
          <div
            style={{
              position: 'fixed',
              top: pendingDialogPosition?.top ?? window.innerHeight / 2,
              left: pendingDialogPosition?.left ?? window.innerWidth / 2,
              transform:
                pendingDialogPosition ? 'translateY(0)' : 'translate(-50%, -50%)',
              background: '#fff',
              borderRadius: 12,
              width: 280,
              boxShadow: '0 20px 45px rgba(15,23,42,0.25)',
              zIndex: 1500,
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              background: '#e4e7ec', 
              padding: '12px 16px', 
              borderBottom: '1px solid #e5e7eb',
              margin: 0,
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Complete call activity</h3>
            </div>
            <div style={{ padding: 16 }}>
            <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, fontSize: '13px' }}>
              Please Enter Duration In Minutes
              <input
                type="text"
                value={pendingDurationValue}
                onChange={(e) => setPendingDurationValue(e.target.value)}
                placeholder="15"
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: '8px 10px',
                  border: '1px solid #f5d867',
                  borderRadius: 6,
                  fontSize: '13px',
                  background: '#fff9e6',
                }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 16, fontWeight: 500, fontSize: '13px' }}>
              Attach image
              <div style={{ marginTop: 4 }}>
                {pendingAttachmentPreview && (
                  <div style={{ marginBottom: 8, position: 'relative' }}>
                    <img
                      src={pendingAttachmentPreview}
                      alt="Screenshot preview"
                      style={{
                        width: '100%',
                        maxHeight: '150px',
                        objectFit: 'contain',
                        borderRadius: 6,
                        border: '1px solid #e5e7eb',
                      }}
                      onError={(e) => {
                        console.error('Failed to load image:', pendingAttachmentPreview);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <label
                  style={{
                    color: '#2563eb',
                    cursor: pendingUploading ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                    opacity: pendingUploading ? 0.6 : 1,
                    display: 'inline-block',
                  }}
                >
                  {pendingAttachmentFile ? pendingAttachmentFile.name : pendingAttachmentPreview ? 'Replace image' : 'Select image'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handlePendingAttachmentInput(e.target.files)}
                    disabled={pendingUploading}
                  />
                </label>
              </div>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={handlePendingDoneCancel}
                style={{
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  borderRadius: 6,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePendingDoneConfirm}
                disabled={pendingUploading}
                style={{
                  border: 'none',
                  background: pendingUploading ? '#9ca3af' : '#2563eb',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '6px 12px',
                  cursor: pendingUploading ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  opacity: pendingUploading ? 0.6 : 1,
                }}
              >
                {pendingUploading ? 'Uploading...' : 'Save'}
              </button>
            </div>
            </div>
          </div>
        </>
      )}

      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={isBulkEditOpen}
        onClose={() => {
          setIsBulkEditOpen(false);
          setSelectedActivities(new Set());
        }}
        onSave={async (updates) => {
          try {
            const ids = Array.from(selectedActivities);
            const updatePromises = ids.map(id => {
              const updateData: Partial<Activity> = {};
              
              // Convert updates to proper format
              if (updates.subject !== undefined) updateData.subject = updates.subject || undefined;
              if (updates.organization !== undefined) updateData.organization = updates.organization || undefined;
              if (updates.assignedUser !== undefined) updateData.assignedUser = updates.assignedUser || undefined;
              if (updates.priority !== undefined) updateData.priority = updates.priority || undefined;
              if (updates.notes !== undefined) updateData.notes = updates.notes || undefined;
              if (updates.date !== undefined) updateData.date = updates.date || undefined;
              
              return activitiesApi.update(id, updateData);
            });
            
            await Promise.all(updatePromises);
            setSelectedActivities(new Set());
            setIsBulkEditOpen(false);
            loadActivities();
            loadCounts(filters);
          } catch (error: any) {
            console.error('Failed to bulk update activities:', error);
            alert(`Failed to update activities: ${error?.response?.data?.message || error?.message || 'Unknown error'}`);
          }
        }}
        fields={[
          { field: 'subject', label: 'Subject', type: 'text' },
          { field: 'organization', label: 'Organization', type: 'text' },
          { field: 'assignedUser', label: 'Assigned User', type: 'text' },
          { field: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
          { field: 'date', label: 'Date', type: 'date' },
          { field: 'notes', label: 'Notes', type: 'text' },
        ]}
        selectedPersons={data?.content?.filter(a => selectedActivities.has(a.id)) || []}
      />

      {/* Date Range Picker Modal */}
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
            <div style={{ marginBottom: '20px' }}>
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
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => {
                  setIsDateRangeModalOpen(false);
                  setDateRange({ start: '', end: '' });
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
                Cancel
              </button>
              <button
                onClick={() => {
                  if (dateRange.start && dateRange.end) {
                    const backendStart = toBackendDateString(dateRange.start);
                    const backendEnd = toBackendDateString(dateRange.end);
                    setFilters(prev => ({
                      ...prev,
                      dateFrom: backendStart,
                      dateTo: backendEnd,
                      page: 0,
                    }));
                    setTab('Select period');
                    setIsDateRangeModalOpen(false);
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

      {/* Single Date Calendar Picker Modal */}
      {isSingleDateModalOpen && (
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
          onClick={() => setIsSingleDateModalOpen(false)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              padding: '24px',
              borderRadius: '8px',
              minWidth: '320px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Date Input Field */}
            <div style={{ 
              marginBottom: '16px', 
              display: 'flex', 
              alignItems: 'center', 
              border: '1px solid #ddd', 
              borderRadius: '4px', 
              padding: '8px 12px' 
            }}>
              <input
                type="text"
                value={selectedSingleDate ? (() => {
                  try {
                    const date = new Date(selectedSingleDate + 'T00:00:00');
                    return formatDateDDMMYYYY(date);
                  } catch {
                    return '';
                  }
                })() : ''}
                onChange={(e) => {
                  const parsed = parseDateDDMMYYYY(e.target.value);
                  if (parsed) {
                    setSelectedSingleDate(formatDateYYYYMMDD(parsed));
                    setCurrentCalendarMonth(parsed);
                  }
                }}
                placeholder="dd/mm/yyyy"
                style={{ 
                  border: 'none', 
                  outline: 'none', 
                  flexGrow: 1, 
                  fontSize: '14px',
                  width: '100%'
                }}
              />
              <span style={{ marginLeft: '8px', color: '#666', fontSize: '16px' }}>📅</span>
            </div>

            {/* Calendar Header */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <button
                  onClick={() => {
                    const prevMonth = new Date(currentCalendarMonth);
                    prevMonth.setMonth(prevMonth.getMonth() - 1);
                    setCurrentCalendarMonth(prevMonth);
                  }}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ▲
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '16px' }}>
                    {currentCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                  <span style={{ cursor: 'pointer', color: '#666' }}>▼</span>
                </div>
                <button
                  onClick={() => {
                    const nextMonth = new Date(currentCalendarMonth);
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    setCurrentCalendarMonth(nextMonth);
                  }}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ▼
                </button>
              </div>

              {/* Days of Week Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '4px' }}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                  <div key={idx} style={{ fontSize: '12px', fontWeight: 600, color: '#666', padding: '4px' }}>
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {getCalendarDays(currentCalendarMonth).map((day, idx) => {
                  const isCurrentMonth = day.getMonth() === currentCalendarMonth.getMonth();
                  const isSelected = selectedSingleDate && formatDateYYYYMMDD(day) === selectedSingleDate;
                  const isToday = formatDateYYYYMMDD(day) === formatDateYYYYMMDD(new Date());
                  
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedSingleDate(formatDateYYYYMMDD(day));
                      }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontSize: '13px',
                        backgroundColor: isSelected ? '#2563eb' : (isToday ? '#e3f2fd' : 'transparent'),
                        color: isSelected ? 'white' : (isCurrentMonth ? '#333' : '#ccc'),
                        fontWeight: isSelected ? 600 : (isToday ? 600 : 400),
                        border: isToday && !isSelected ? '1px solid #2563eb' : 'none',
                      }}
                    >
                      {day.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    setSelectedSingleDate('');
                    setFilters(prev => ({ ...prev, dateFrom: undefined, dateTo: undefined, page: 0 }));
                  }}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: '#2563eb',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const todayStr = formatDateYYYYMMDD(today);
                    setSelectedSingleDate(todayStr);
                    setCurrentCalendarMonth(today);
                  }}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: '#2563eb',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Today
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    setIsSingleDateModalOpen(false);
                    setSelectedSingleDate('');
                  }}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (selectedSingleDate) {
                      const backendDate = toBackendDateString(selectedSingleDate);
                      setFilters(prev => ({
                        ...prev,
                        dateFrom: backendDate,
                        dateTo: backendDate,
                        page: 0,
                      }));
                      setTab('Select Date');
                      setIsSingleDateModalOpen(false);
                    }
                  }}
                  disabled={!selectedSingleDate}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: !selectedSingleDate ? '#ccc' : '#2563eb',
                    color: 'white',
                    cursor: !selectedSingleDate ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Viewer Modal */}
      {screenshotViewerActivity && screenshotViewerImageUrl && createPortal(
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.7)',
              zIndex: 1599,
            }}
            onClick={closeScreenshotViewer}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#fff',
              borderRadius: 12,
              width: '90%',
              maxWidth: '800px',
              maxHeight: '90vh',
              boxShadow: '0 20px 45px rgba(15,23,42,0.25)',
              zIndex: 1600,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              background: '#e4e7ec', 
              padding: '12px 16px', 
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>
                Screenshot - {screenshotViewerActivity.subject}
              </h3>
              <button
                onClick={closeScreenshotViewer}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 5L5 15M5 5L15 15" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
              <div style={{ marginBottom: 16 }}>
                <img
                  src={screenshotReplacementPreview || screenshotViewerImageUrl}
                  alt="Screenshot"
                  style={{
                    width: '100%',
                    maxHeight: '60vh',
                    objectFit: 'contain',
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                  }}
                  onError={(e) => {
                    console.error('Failed to load image:', screenshotReplacementPreview || screenshotViewerImageUrl);
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                <label style={{ display: 'block', marginBottom: 10, fontWeight: 500, fontSize: '13px' }}>
                  Replace Screenshot
                  <div style={{ marginTop: 8 }}>
                    <label
                      style={{
                        color: '#2563eb',
                        cursor: screenshotReplacing ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                        opacity: screenshotReplacing ? 0.6 : 1,
                        display: 'inline-block',
                        padding: '8px 12px',
                        border: '1px solid #2563eb',
                        borderRadius: 6,
                        background: '#fff',
                      }}
                    >
                      {screenshotReplacementFile ? screenshotReplacementFile.name : 'Select new image'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => handleScreenshotReplacementInput(e.target.files)}
                        disabled={screenshotReplacing}
                      />
                    </label>
                  </div>
                </label>
                {screenshotReplacementFile && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => {
                        if (screenshotReplacementPreview && screenshotReplacementPreview.startsWith('blob:')) {
                          URL.revokeObjectURL(screenshotReplacementPreview);
                        }
                        setScreenshotReplacementFile(null);
                        setScreenshotReplacementPreview(null);
                      }}
                      style={{
                        border: '1px solid #d1d5db',
                        background: '#fff',
                        borderRadius: 6,
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleScreenshotReplacement}
                      disabled={screenshotReplacing}
                      style={{
                        border: 'none',
                        background: screenshotReplacing ? '#9ca3af' : '#2563eb',
                        color: '#fff',
                        borderRadius: 6,
                        padding: '6px 12px',
                        cursor: screenshotReplacing ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        opacity: screenshotReplacing ? 0.6 : 1,
                      }}
                    >
                      {screenshotReplacing ? 'Replacing...' : 'Replace'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
