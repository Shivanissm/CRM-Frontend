import { useEffect, useState } from 'react';
import { activitiesApi, type Activity, type PageResponse, type ActivityFilters } from '../services/activities';
import FilterDropdown, { type SavedFilter as DropdownSavedFilter } from '../components/FilterDropdown';
import FilterModal, { type FilterCondition } from '../components/FilterModal';
import ActivityModal from '../components/ActivityModal';
import ColumnMenu from '../components/ColumnMenu';
import BulkEditModal from '../components/BulkEditModal';

export default function ActivitiesList() {
  const [data, setData] = useState<PageResponse<Activity> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<'Activity' | 'Call' | 'Meeting scheduler'>('Activity');
  const [tab, setTab] = useState<'All' | 'To‑do' | 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | 'Next week' | 'Select period' | 'Select Date'>('Today');
  const [filters, setFilters] = useState<ActivityFilters>({ page: 0, size: 25 });
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
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
  const [todayCount, setTodayCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

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
      return ['Done', 'Subject', 'Type', 'Deal', 'Instagram ID', 'Phone', 'Organization', 'Due date', 'Assigned user', 'Priority', 'Notes'];
    }
    if (category === 'Call') {
      return ['Done', 'Subject', 'Type', 'Deal', 'Instagram ID', 'Phone', 'Organization', 'Call type', 'Schedule date', 'Schedule time', 'Assigned user', 'Schedule by', 'Priority', 'Notes'];
    }
    return ['Done', 'Subject', 'Type', 'Deal', 'Instagram ID', 'Phone', 'Organization', 'Schedule date', 'Schedule time', 'Assigned user', 'Schedule by', 'Priority', 'Notes'];
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
        .then(setData)
      .catch((e) => setError(e?.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  };

  const loadCounts = async (currentFilters?: ActivityFilters) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayFormatted = formatDateDDMMYYYY(today);
      
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const yesterdayFormatted = formatDateDDMMYYYY(yesterday);

      // First box (TODAY/Tomorrow/etc): Show activities for the selected tab's date range
        // If currentFilters has date range, use it; otherwise default to actual today
        const firstBoxFilters: ActivityFilters = {
          category: getCategoryEnum(category),
          size: 1,
          page: 0,
      };
      
      if (currentFilters?.dateFrom && currentFilters?.dateTo) {
        firstBoxFilters.dateFrom = toBackendDateString(currentFilters.dateFrom);
        firstBoxFilters.dateTo = toBackendDateString(currentFilters.dateTo);
      } else {
        // Default to actual today if no date filters
        firstBoxFilters.dateFrom = todayFormatted;
        firstBoxFilters.dateTo = todayFormatted;
      }
      
      const todayResult = await activitiesApi.list(firstBoxFilters);
      setTodayCount(todayResult.totalElements);

      // OVERDUE: Always show actual overdue activities count (regardless of selected tab)
      const overdueResult = await activitiesApi.list({ 
          dateTo: yesterdayFormatted, 
          done: false, 
          category: getCategoryEnum(category),
          size: 1
      });
      setOverdueCount(overdueResult.totalElements);

        // COMPLETED: Show completed activities for the selected tab's date range
        const completedFilters: ActivityFilters = {
          category: getCategoryEnum(category),
          done: true,
          size: 1,
        page: 0,
      };
      
      // If currentFilters has date range, use it; otherwise show all completed
      if (currentFilters?.dateFrom && currentFilters?.dateTo) {
        completedFilters.dateFrom = toBackendDateString(currentFilters.dateFrom);
        completedFilters.dateTo = toBackendDateString(currentFilters.dateTo);
      }
      
      const completedResult = await activitiesApi.list(completedFilters);
      setCompletedCount(completedResult.totalElements);

        // PENDING: Show pending activities for the selected tab's date range
        const pendingFilters: ActivityFilters = {
          category: getCategoryEnum(category),
          done: false,
          size: 1,
        page: 0,
      };
      
      // If currentFilters has date range, use it; otherwise show all pending
      if (currentFilters?.dateFrom && currentFilters?.dateTo) {
        pendingFilters.dateFrom = toBackendDateString(currentFilters.dateFrom);
        pendingFilters.dateTo = toBackendDateString(currentFilters.dateTo);
      }
      
      const pendingResult = await activitiesApi.list(pendingFilters);
      setPendingCount(pendingResult.totalElements);
    } catch (error) {
      console.error('Failed to load activity counts:', error);
    }
  };

  useEffect(() => {
    loadActivities();
    loadCounts(filters); // Pass current filters to loadCounts so COMPLETED and PENDING reflect the selected tab's date range
    // Clear selections when filters or category change
    setSelectedActivities(new Set());
  }, [category, filters]);

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

  const toggleDone = async (id: number, value: boolean) => {
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
    const ed = effectiveDate(a);
    
    // "All" tab shows everything
    if (tab === 'All') return true;
    
    // "To-do" tab shows all activities that are not done
    if (tab === 'To‑do') return !a.done;
    
    // For date-based tabs, we need the activity to have a date
    if (!ed) {
      // Activities without dates don't show in date-specific tabs
      if (tab === 'Today' || tab === 'Tomorrow' || tab === 'Overdue' || tab === 'This week' || tab === 'Next week' || tab === 'Select period' || tab === 'Select Date') {
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
            onClick={() => toggleDone(a.id, !a.done)}
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
      case 'deal':
        return (
          <span 
            className={statusClass(a)}
            style={{ textDecoration: a.done ? 'line-through' : 'none' }}
          >
            {a.dealName || '-'}
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
      default:
        return '-';
    }
  };

  // Get the label for the first summary box based on the selected tab
  const getFirstBoxLabel = () => {
    if (tab === 'Tomorrow') return 'TOMORROW';
    if (tab === 'This week') return 'THIS WEEK';
    if (tab === 'Next week') return 'NEXT WEEK';
    if (tab === 'Select period') return 'SELECT PERIOD';
    if (tab === 'Select Date') return 'SELECT DATE';
    if (tab === 'All') return 'ALL';
    if (tab === 'To‑do') return 'TO-DO';
    if (tab === 'Overdue') return 'OVERDUE';
    return 'TODAY'; // Default to TODAY
  };

  if (loading) return <div style={{ padding: 16 }}>Loading activities…</div>;
  if (error) return <div style={{ padding: 16, color: 'red' }}>{error}</div>;

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
        <div className="summary-box">
          <div className="summary-number">{todayCount}</div>
          <div className="summary-label">{getFirstBoxLabel()}</div>
        </div>
        <div className="summary-box">
          <div className="summary-number">{overdueCount}</div>
          <div className="summary-label">OVERDUE</div>
        </div>
        <div className="summary-box">
          <div className="summary-number">{completedCount}</div>
          <div className="summary-label">COMPLETED</div>
        </div>
        <div className="summary-box">
          <div className="summary-number">{pendingCount}</div>
          <div className="summary-label">PENDING</div>
        </div>
      </div>

      <div className="toolbar">
        <button className={`btn ${category==='Activity' ? 'active' : ''}`} onClick={() => setCategory('Activity')}>Activity</button>
        <button className={`btn ${category==='Call' ? 'active' : ''}`} onClick={() => setCategory('Call')}>Call</button>
        <button className={`btn ${category==='Meeting scheduler' ? 'active' : ''}`} onClick={() => setCategory('Meeting scheduler')}>Meeting scheduler</button>
      </div>
      <div className="tabs">
        {(['All','To‑do','Overdue','Today','Tomorrow','This week','Next week','Select period','Select Date'] as const).map(t => (
          <span 
            key={t} 
            className={`tab ${tab===t?'active':''}`} 
            onClick={() => {
              if (t === 'Select period') {
                setIsDateRangeModalOpen(true);
              } else if (t === 'Select Date') {
                setIsSingleDateModalOpen(true);
              } else {
                setTab(t);
              }
            }}
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
          </tr>
        </thead>
        <tbody>
          {data?.content?.filter(shouldShow).map((a) => (
            <tr key={a.id}>
              {/* Checkbox column cell */}
              <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                <input
                  type="checkbox"
                  checked={selectedActivities.has(a.id)}
                  onChange={() => handleToggleSelect(a.id)}
                  style={{ cursor: 'pointer' }}
                />
              </td>
              {columnOrder
                .filter(col => !hiddenColumns.has(col))
                .map((col) => (
                  <td key={col}>{getCellValue(a, col)}</td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

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
              notes: v.notes || undefined,
              organization: v.organization || undefined,
              // Use derived category and type
              category: parentCategory,
              type: selectedType || undefined,
              dateTime: isoDateForDateTime ? `${isoDateForDateTime}T${v.startTime || '00:00'}:00` : undefined,
            };
            
            // Only include personId if it's provided and > 0
            if (v.personId && v.personId > 0) {
              activityData.personId = v.personId;
            }
            
            // Only include dealId if it's provided and > 0 (if backend supports it)
            // Note: dealId is not in Activity type, so we'll skip it if not needed
            
            const createdActivity = await activitiesApi.create(activityData);
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
            setIsAddOpen(false);
          } catch (error: any) {
            console.error('Failed to create activity:', error);
            alert(`Failed to create activity: ${error?.response?.data?.message || error?.message || 'Unknown error'}`);
          }
        }}
      />

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
    </div>
  );
}
