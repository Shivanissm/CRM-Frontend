import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activityRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [highlightedActivityId, setHighlightedActivityId] = useState<number | null>(null);
  
  const [data, setData] = useState<PageResponse<Activity> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<'Activity' | 'Call' | 'Meeting scheduler'>('Activity');
  const [tab, setTab] = useState<TabOption>('Today');
  const [filters, setFilters] = useState<ActivityFilters>({ page: 0, size: 25 });
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isTabDropdownOpen, setIsTabDropdownOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  type SavedFilterOption = DropdownSavedFilter<FilterCondition>;
  const [savedFilters, setSavedFilters] = useState<SavedFilterOption[]>([]);
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);
  const [activeCustomFilters, setActiveCustomFilters] = useState<FilterCondition[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
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
  const [managerOptions, setManagerOptions] = useState<User[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [selectedOrganizationFilter, setSelectedOrganizationFilter] = useState('');
  const [selectedManagerFilter, setSelectedManagerFilter] = useState('');
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
  const getServiceCategoryForActivity = (id: number) => serviceCategories[id] || defaultServiceCategoryCode;

  useEffect(() => {
    if (!data?.content) return;
    setServiceCategories((prev) => {
      let changed = false;
      const next = { ...prev };
      data.content?.forEach((activity) => {
        if (!next[activity.id]) {
          next[activity.id] = defaultServiceCategoryCode;
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
  }, [data, defaultServiceCategoryCode, SERVICE_CATEGORY_STORAGE_KEY]);

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
        setCategoryFilterOptions(DEFAULT_CATEGORY_OPTIONS);
        setOrganizationOptions(Array.isArray(orgs) ? orgs : []);
        setManagerOptions(Array.isArray(users) ? users : []);
      } catch (err) {
        console.error('Failed to load filter options', err);
      }
    };
    loadFilterOptions();
    return () => {
      isMounted = false;
    };
  }, []);

  const getDatePreservingFilters = () => {
    const next: ActivityFilters = { page: 0, size: 25 };
    if (filters.dateFrom) {
      next.dateFrom = filters.dateFrom;
    }
    if (filters.dateTo) {
      next.dateTo = filters.dateTo;
    }
    if (filters.assignedUser) {
      next.assignedUser = filters.assignedUser;
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
    return normalized;
  };

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

  const loadCallDuration = async (dateFilters: ActivityFilters) => {
    try {
      const pageSize = 200;
      let cumulativeMinutes = 0;
      let page = 0;
      let totalPages = 1;

      while (page < totalPages) {
        const response = await activitiesApi.list({
          ...dateFilters,
          category: 'CALL',
          page,
          size: pageSize,
        });

        response.content.forEach((activity) => {
          const startMinutes = parseTimeToMinutes(activity.startTime);
          const endMinutes = parseTimeToMinutes(activity.endTime);
          if (
            startMinutes !== null &&
            endMinutes !== null &&
            endMinutes >= startMinutes
          ) {
            cumulativeMinutes += endMinutes - startMinutes;
          }
        });

        totalPages = response.totalPages || 1;
        page += 1;
        if (!response.content.length) {
          break;
        }
      }

      setTotalCallDurationMinutes(cumulativeMinutes);
    } catch (error) {
      console.error('Failed to load total call duration:', error);
      setTotalCallDurationMinutes(0);
    }
  };

  const loadActivities = (customFilters?: ActivityFilters) => {
    setLoading(true);
      const filtersToUse = customFilters || filters;
      // Only apply page category if category is not already specified in filters
      // If category is explicitly undefined/null, don't apply any category filter
      const finalFilters = filtersToUse.hasOwnProperty('category') && filtersToUse.category === undefined
        ? filtersToUse
        : filtersToUse.category 
          ? filtersToUse 
          : { ...filtersToUse, category: getCategoryEnum(category) };
      const normalizedFilters: ActivityFilters = { ...finalFilters };
      if (normalizedFilters.dateFrom) {
        normalizedFilters.dateFrom = toBackendDateString(normalizedFilters.dateFrom);
      }
      if (normalizedFilters.dateTo) {
        normalizedFilters.dateTo = toBackendDateString(normalizedFilters.dateTo);
      }
      activitiesApi
        .list(normalizedFilters)
        .then(async (response) => {
          // Fetch deal names for activities that have dealId but no dealName
          const activitiesWithDealId = response.content.filter(a => a.dealId && !a.dealName);
          if (activitiesWithDealId.length > 0) {
            try {
              // Fetch all deals to get names
              const allDeals = await dealsApi.list();
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
              console.error('Failed to load deals for activity names:', err);
              return response;
            }
          }
          return response;
        })
        .then(setData)
      .catch((e) => setError(e?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  };

  const loadCounts = async (currentFilters?: ActivityFilters) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yesterdayFormatted = formatDateDDMMYYYY(yesterday);

      const dateOnlyFilters = normalizeDateFilters(currentFilters);

      const baseRequests: Promise<PageResponse<Activity>>[] = [
        activitiesApi.list({
          ...dateOnlyFilters,
          category: 'CALL',
          size: 1,
          page: 0,
        }),
        activitiesApi.list({
          ...dateOnlyFilters,
          category: 'CALL',
          done: true,
          size: 1,
          page: 0,
        }),
        activitiesApi.list({
          ...dateOnlyFilters,
          category: 'MEETING_SCHEDULER',
          size: 1,
          page: 0,
        }),
        activitiesApi.list({
          ...dateOnlyFilters,
          category: 'MEETING_SCHEDULER',
          done: true,
          size: 1,
          page: 0,
        }),
        activitiesApi.list({
          dateTo: yesterdayFormatted, 
          done: false, 
          category: getCategoryEnum(category),
          size: 1,
          page: 0,
        }),
      ];

      if (category === 'Activity') {
        const activityBaseFilters = {
          ...dateOnlyFilters,
          category: 'ACTIVITY',
          size: 1,
        page: 0,
      };
        baseRequests.push(
          activitiesApi.list(activityBaseFilters),
          activitiesApi.list({ ...activityBaseFilters, done: false }),
          activitiesApi.list({ ...activityBaseFilters, done: true }),
        );
      }

      const responses = await Promise.all(baseRequests);
      const [
        callAssignedResponse,
        callTakenResponse,
        meetingAssignedResponse,
        meetingDoneResponse,
        overdueResult,
        ...activityResponses
      ] = responses;

      setCallAssignedCount(callAssignedResponse.totalElements || 0);
      setCallTakenCount(callTakenResponse.totalElements || 0);
      setMeetingAssignedCount(meetingAssignedResponse.totalElements || 0);
      setMeetingDoneCount(meetingDoneResponse.totalElements || 0);
      setOverdueCount(overdueResult.totalElements || 0);

      if (category === 'Activity') {
        const [activityTotalResponse, activityPendingResponse, activityCompletedResponse] = activityResponses;
        setActivityTotalCount(activityTotalResponse?.totalElements || 0);
        setActivityPendingCount(activityPendingResponse?.totalElements || 0);
        setActivityCompletedCount(activityCompletedResponse?.totalElements || 0);
      } else {
        setActivityTotalCount(0);
        setActivityPendingCount(0);
        setActivityCompletedCount(0);
      }

      await loadCallDuration(dateOnlyFilters);
    } catch (error) {
      console.error('Failed to load activity counts:', error);
    }
  };

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
    loadActivities();
    loadCounts(filters); // Pass current filters to loadCounts so COMPLETED and PENDING reflect the selected tab's date range
    // Clear selections when filters or category change
    setSelectedActivities(new Set());
  }, [category, filters]);

  useEffect(() => {
    if (!filters.assignedUser) {
      setSelectedManagerFilter('');
    } else {
      setSelectedManagerFilter(filters.assignedUser.trim());
    }
  }, [filters.assignedUser]);

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

  const handleManagerFilterChange = (value: string) => {
    const normalizedValue = value.trim();
    setSelectedManagerFilter(normalizedValue);
    setFilters((prev) => {
      const next = { ...prev, page: 0 };
      if (normalizedValue) {
        return { ...next, assignedUser: normalizedValue };
      }
      const { assignedUser, ...rest } = next;
      return rest;
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

    let newFilters: ActivityFilters = { page: 0, size: 25 };

    if (tab === 'Today') {
      const todayStr = formatDateDDMMYYYY(today);
      newFilters.dateFrom = todayStr;
      newFilters.dateTo = todayStr;
    } else if (tab === 'Tomorrow') {
      const tomorrowStr = formatDateDDMMYYYY(tomorrow);
      newFilters.dateFrom = tomorrowStr;
      newFilters.dateTo = tomorrowStr;
    } else if (tab === 'Overdue') {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yesterdayStr = formatDateDDMMYYYY(yesterday);
      newFilters.dateTo = yesterdayStr;
      newFilters.done = false;
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
      // Clear date filters for "All"
      newFilters = { page: 0, size: 25 };
    } else if (tab === 'To‑do') {
      // To-do: not done activities
      newFilters.done = false;
    }

    setFilters(newFilters);
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
        newFilters.assignedUser = condition.value;
      } else if (condition.field === 'organization') {
        // Organization filtering is handled by backend, skip here
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
    if (selectedCategoryFilter && getServiceCategoryForActivity(a.id) !== selectedCategoryFilter) {
      return false;
    }
    if (selectedOrganizationFilter) {
      const orgName = (a.organization || '').trim().toLowerCase();
      if (orgName !== selectedOrganizationFilter.trim().toLowerCase()) {
        return false;
      }
    }

    if (selectedManagerFilter) {
      const assigned = (a.assignedUser || '').trim().toLowerCase();
      if (assigned !== selectedManagerFilter.trim().toLowerCase()) {
        return false;
      }
    }

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
    
    // "Overdue" tab: only show activities with date < today AND not done
    if (tab === 'Overdue') {
      return ed.getTime() < today.getTime() && !a.done;
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
        <button className={`btn ${category==='Activity' ? 'active' : ''}`} onClick={() => setCategory('Activity')}>Activity</button>
        <button className={`btn ${category==='Call' ? 'active' : ''}`} onClick={() => setCategory('Call')}>Call</button>
        <button className={`btn ${category==='Meeting scheduler' ? 'active' : ''}`} onClick={() => setCategory('Meeting scheduler')}>Meeting scheduler</button>
        </div>
        <div className="toolbar-filters">
          <select
            className="toolbar-select"
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value.trim())}
            title="Filters by service categories on the backend"
          >
            <option value="">All Categories</option>
            {categoryFilterOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            className="toolbar-select"
            value={selectedOrganizationFilter}
            onChange={(e) => setSelectedOrganizationFilter(e.target.value.trim())}
          >
            <option value="">All Organizations</option>
            {organizationOptions.map((org) => (
              <option key={org.id} value={(org.name || '').trim()}>
                {org.name || `Organization #${org.id}`}
              </option>
            ))}
          </select>
          <select
            className="toolbar-select"
            value={selectedManagerFilter}
            onChange={(e) => handleManagerFilterChange(e.target.value)}
          >
            <option value="">All Users</option>
            {managerOptions.map((manager) => {
              const fullName = `${manager.firstName || ''} ${manager.lastName || ''}`.trim();
              const label = fullName || manager.email || `User #${manager.id}`;
              const value = (manager.email || label).trim();
              return (
                <option key={manager.id} value={value}>
                  {label}
                </option>
              );
            })}
          </select>
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
        onClose={() => setIsAddOpen(false)}
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
