import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { personsApi } from '../services/api';
import type { Person, PersonFilters, FilterMeta, PersonFilterCondition } from '../types/person';
import FilterModal, { FilterCondition } from '../components/FilterModal';
import FilterChip from '../components/FilterChip';
import PersonDropdown from '../components/PersonDropdown';
import ColumnMenu from '../components/ColumnMenu';
import BulkEditModal from '../components/BulkEditModal';
import AddPersonModal from '../components/AddPersonModal';
import { clearAuthSession } from '../utils/authToken';
import './PersonsList.css';

const formatDateFromInput = (yyyyMMdd: string): string => {
  const [y, m, d] = yyyyMMdd.split('-');
  return `${d}/${m}/${y}`;
};

// Helper function to format date as YYYY-MM-DD
const formatDateYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Calculate days difference between today and the provided date
const calculateDaysAway = (dateValue?: string | null): number | null => {
  if (!dateValue) return null;

  let targetDate: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
    targetDate = new Date(dateValue);
  } else if (dateValue.includes('/')) {
    const parts = dateValue.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      targetDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    }
  } else {
    const parsed = new Date(dateValue);
    if (!Number.isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  if (!targetDate || Number.isNaN(targetDate.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
};

// Format days away text
const formatDaysAway = (days: number): string => {
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days away`;
};

const FILTERS_STORAGE_KEY = 'persons-list-filters';

// Helper function to load filters from localStorage
const loadFiltersFromStorage = (): PersonFilters => {
  try {
    const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure page is reset to 0 on load (don't persist page number)
      return { ...parsed, page: 0 };
    }
  } catch (error) {
    console.error('Failed to load filters from localStorage:', error);
  }
  return { page: 0, size: 10 };
};

// Helper function to save filters to localStorage
const saveFiltersToStorage = (filters: PersonFilters) => {
  try {
    // Don't save page number to localStorage (always start at page 0 on refresh)
    const { page, ...filtersToSave } = filters;
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filtersToSave));
  } catch (error) {
    console.error('Failed to save filters to localStorage:', error);
  }
};

export default function PersonsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [filters, setFilters] = useState<PersonFilters>(loadFiltersFromStorage());
  const hasLoadedOnce = useRef(false);
  const hasHandledOpenModal = useRef(false);
  const previousPathnameRef = useRef<string>(location.pathname);
  const [filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeCustomFilters, setActiveCustomFilters] = useState<PersonFilterCondition[]>([]);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState<boolean>(false);
  const [deletedPersonsCount, setDeletedPersonsCount] = useState<number>(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<boolean>(false);
  const [isPersonDropdownOpen, setIsPersonDropdownOpen] = useState(false);
  const [columnMenu, setColumnMenu] = useState<{
    isOpen: boolean;
    columnName: string;
    position: { top: number; left: number };
  } | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedPersons, setSelectedPersons] = useState<Set<number>>(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  // Multi-select dropdown states
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isOrganizationDropdownOpen, setIsOrganizationDropdownOpen] = useState(false);
  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);
  const [isLabelDropdownOpen, setIsLabelDropdownOpen] = useState(false);
  // Tooltip states for multi-select
  const [tooltipContent, setTooltipContent] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  // Date range filter states
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    // Load from localStorage or default to "Last 7 days"
    try {
      const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.leadFrom && parsed.leadTo) {
          // Convert DD/MM/YYYY to YYYY-MM-DD
          const convertToYYYYMMDD = (ddmmyyyy: string): string => {
            const parts = ddmmyyyy.split('/');
            if (parts.length === 3) {
              const [d, m, y] = parts;
              return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            return '';
          };
          return {
            start: convertToYYYYMMDD(parsed.leadFrom),
            end: convertToYYYYMMDD(parsed.leadTo),
          };
        }
      }
    } catch (error) {
      console.error('Failed to load date range from localStorage:', error);
    }
    // Default to "Last 7 days"
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);
    return {
      start: formatDateYYYYMMDD(startDate),
      end: formatDateYYYYMMDD(endDate),
    };
  });
  const [selectedDateRangeOption, setSelectedDateRangeOption] = useState<string>(() => {
    // Check if localStorage has a saved date range, otherwise default to "Last 7 days"
    try {
      const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.leadFrom && parsed.leadTo) {
          // If there's a saved date range, don't set a preset option
          return '';
        }
      }
    } catch (error) {
      console.error('Failed to load date range option from localStorage:', error);
    }
    // Default to "Last 7 days"
    return 'Last 7 days';
  });
  const [isDateRangeDropdownOpen, setIsDateRangeDropdownOpen] = useState(false);
  const [isDateRangeModalOpen, setIsDateRangeModalOpen] = useState(false);
  const dateRangeDropdownRef = useRef<HTMLDivElement>(null);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [customizePos, setCustomizePos] = useState<{ x: number; y: number } | null>(null);
  const [tempHiddenColumns, setTempHiddenColumns] = useState<Set<string>>(new Set());
  const [rowMenu, setRowMenu] = useState<{ rowId: number; x: number; y: number } | null>(null);
  const [customizeSearch, setCustomizeSearch] = useState('');
  const [isAddCustomOpen, setIsAddCustomOpen] = useState(false);
  const [newField, setNewField] = useState<{ name: string; type: 'text' | 'date' | 'select' | '' }>({ name: '', type: '' });
  // Draggable column order (excludes the checkbox column)
  const defaultColumnsOrder = ['name','instagramId','source','subSource','email','phone','label','category','organization','manager','leadDate'];
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnsOrder);
  
  // Ensure category is always in columnOrder (in case user customized columns before category was added)
  useEffect(() => {
    if (!columnOrder.includes('category')) {
      const labelIndex = columnOrder.indexOf('label');
      if (labelIndex >= 0) {
        const newOrder = [...columnOrder];
        newOrder.splice(labelIndex + 1, 0, 'category');
        setColumnOrder(newOrder);
      } else {
        setColumnOrder([...columnOrder, 'category']);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

  const normalizeConditionValue = (field: string, value: string): string => {
    if (!value) return value;
    const needsDateFormat = ['leadDate', 'dateFrom', 'dateTo', 'createdDate'].includes(field);
    if (needsDateFormat && value.includes('-')) {
      return formatDateFromInput(value);
    }
    return value;
  };

  const toBackendConditions = (conditions: FilterCondition[]): PersonFilterCondition[] =>
    conditions
      .filter(condition => condition.field && condition.value)
      .map(condition => ({
        field: condition.field,
        operator: condition.operator,
        value: normalizeConditionValue(condition.field, condition.value),
      }));

  const operatorLabels: Record<string, string> = {
    equals: 'is',
    contains: 'contains',
    startsWith: 'starts with',
    notEquals: 'is not',
    after: 'after',
    before: 'before',
    between: 'between',
  };

  const getOperatorLabel = (operator: string): string => operatorLabels[operator] || operator;


  const loadFilterMeta = async () => {
    try {
      const meta = await personsApi.getFilters();
      setFilterMeta(meta);
    } catch (error) {
      console.error('Failed to load filter metadata:', error);
    }
  };

  const isLoadingRef = useRef(false);
  
  const loadPersons = useCallback(async (filtersToUse?: PersonFilters) => {
    // Prevent multiple simultaneous loads using ref
    if (isLoadingRef.current) {
      console.log('Already loading, skipping...');
      return;
    }
    
    isLoadingRef.current = true;
    
    // Use the provided filters or fall back to current filters state
    const activeFilters = filtersToUse || filters;
    
    // Use loading state only for initial load, reloading for subsequent loads
    if (!hasLoadedOnce.current) {
    setLoading(true);
    } else {
      setReloading(true);
    }
    try {
      console.log('Loading persons with filters:', activeFilters);
      const response = await personsApi.list(activeFilters);
      console.log('Persons API response:', {
        page: response.number,
        totalElements: response.totalElements,
        totalPages: response.totalPages,
        contentLength: response.content?.length || 0,
        firstPerson: response.content?.[0]?.name || 'none',
        requestedPage: activeFilters.page
      });
      // Only update if we got valid data
      if (response && response.content) {
      setPersons(response.content);
      setTotalPages(response.totalPages);
      setTotalElements(response.totalElements || 0);
      // Use the page from response, but ensure it matches what we requested
      const responsePage = response.number ?? activeFilters.page ?? 0;
      setCurrentPage(responsePage);
        hasLoadedOnce.current = true;
      } else {
        console.warn('Invalid response from API:', response);
      }
    } catch (error: any) {
      console.error('Failed to load persons:', error);
      // Don't clear existing data on error - keep what we have
      // Only clear if it's the first load
      if (!hasLoadedOnce.current) {
        setPersons([]);
      }
      if (error?.response?.status === 401) {
        clearAuthSession();
        navigate('/login', { replace: true });
      }
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
      setReloading(false);
    }
  }, [filters, navigate]);


  useEffect(() => {
    loadFilterMeta();
  }, []);

  // Reset filters when component mounts if localStorage was cleared (navigated back from another page)
  // This runs on mount to check if we should reset filters
  useEffect(() => {
    // Check if we're on the persons page and localStorage is empty
    // This indicates we navigated back from another page (localStorage was cleared)
    const currentPath = location.pathname;
    if (currentPath === '/persons' || currentPath === '/persons/') {
      try {
        const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (!stored) {
          // localStorage is empty, explicitly reset all filters to default
          // This happens when navigating back from another page
          const defaultFilters: PersonFilters = { 
            page: 0, 
            size: filters.size || 10 
          };
          // Explicitly clear all filter properties to ensure UI updates
          console.log('Resetting filters - localStorage is empty (navigated back from another page)');
          // Force a complete reset by setting filters to a new object
          setFilters(defaultFilters);
          setCurrentPage(0);
        }
        // If localStorage has filters, they were already loaded in useState initialization
        // This means it's a page reload, so keep the filters
      } catch (error) {
        console.error('Failed to check/reset filters on mount:', error);
      }
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if modal should be opened from navigation state
  useEffect(() => {
    const state = location.state as any;
    const shouldOpen = state?.openModal === true;
    
    // Only open if we have openModal in state, modal is not already open, and we haven't handled it yet
    if (shouldOpen && !isAddPersonOpen && !hasHandledOpenModal.current) {
      hasHandledOpenModal.current = true;
      setIsAddPersonOpen(true);
      // Clear the state immediately using requestAnimationFrame to ensure it happens after state update
      requestAnimationFrame(() => {
        navigate(location.pathname, { replace: true, state: {} });
      });
    }
  }, [location.pathname, location.state, isAddPersonOpen, navigate]);
  
  // Reset the ref when modal is closed and state is cleared
  useEffect(() => {
    if (!isAddPersonOpen) {
      const state = location.state as any;
      if (!state?.openModal && hasHandledOpenModal.current) {
        // Small delay to ensure state is fully cleared
        const timer = setTimeout(() => {
          hasHandledOpenModal.current = false;
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isAddPersonOpen, location.state]);

  // Save filters to localStorage whenever they change (except page changes)
  useEffect(() => {
    // Only save if we've loaded data at least once (to avoid saving on initial mount)
    // This ensures we don't save empty/default filters on first render
    if (hasLoadedOnce.current) {
      saveFiltersToStorage(filters);
    }
  }, [filters]);

  // Clear filters from localStorage when navigating away from Persons page
  useEffect(() => {
    const currentPath = location.pathname;
    const previousPath = previousPathnameRef.current;
    
    // If we were on the persons page and now we're on a different page, clear filters
    if ((previousPath === '/persons' || previousPath === '/persons/') && 
        currentPath !== '/persons' && currentPath !== '/persons/') {
      try {
        localStorage.removeItem(FILTERS_STORAGE_KEY);
        console.log('Cleared filters from localStorage - navigated away from Persons page');
    } catch (error) {
        console.error('Failed to clear filters from localStorage:', error);
      }
    }
    
    // Update the ref for next comparison
    previousPathnameRef.current = currentPath;
  }, [location.pathname]);

  // Clear localStorage on component unmount (when navigating away)
  // This ensures filters are cleared even if the pathname change detection doesn't fire
  useEffect(() => {
    return () => {
      // Cleanup: clear localStorage when component unmounts
      // This happens when navigating away from the Persons page
      try {
        localStorage.removeItem(FILTERS_STORAGE_KEY);
        console.log('Cleared filters from localStorage - component unmounting (navigating away)');
    } catch (error) {
        console.error('Failed to clear filters from localStorage on unmount:', error);
      }
    };
  }, []);


  useEffect(() => {
    console.log('Filters changed, loading persons...', filters);
    const abortController = new AbortController();
    // Explicitly pass filters to ensure we use the latest value
    loadPersons(filters);
    return () => {
      abortController.abort();
    };
  }, [filters, loadPersons]);

  // Close multi-select dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.multi-select-wrapper')) {
        setIsCategoryDropdownOpen(false);
        setIsOrganizationDropdownOpen(false);
        setIsManagerDropdownOpen(false);
        setIsLabelDropdownOpen(false);
      }
      // Close date range dropdown if clicking outside
      if (dateRangeDropdownRef.current && !dateRangeDropdownRef.current.contains(target)) {
        setIsDateRangeDropdownOpen(false);
      }
    };

    if (isCategoryDropdownOpen || isOrganizationDropdownOpen || isManagerDropdownOpen || isLabelDropdownOpen || isDateRangeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isCategoryDropdownOpen, isOrganizationDropdownOpen, isManagerDropdownOpen, isLabelDropdownOpen, isDateRangeDropdownOpen]);

  // Close other dropdowns when opening a new one
  const handleCategoryDropdownToggle = () => {
    setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
    setIsOrganizationDropdownOpen(false);
    setIsManagerDropdownOpen(false);
    setIsLabelDropdownOpen(false);
  };

  const handleOrganizationDropdownToggle = () => {
    setIsOrganizationDropdownOpen(!isOrganizationDropdownOpen);
    setIsCategoryDropdownOpen(false);
    setIsManagerDropdownOpen(false);
    setIsLabelDropdownOpen(false);
  };

  const handleManagerDropdownToggle = () => {
    setIsManagerDropdownOpen(!isManagerDropdownOpen);
    setIsCategoryDropdownOpen(false);
    setIsOrganizationDropdownOpen(false);
    setIsLabelDropdownOpen(false);
  };

  const handleLabelDropdownToggle = () => {
    setIsLabelDropdownOpen(!isLabelDropdownOpen);
    setIsCategoryDropdownOpen(false);
    setIsOrganizationDropdownOpen(false);
    setIsManagerDropdownOpen(false);
  };

  // Helper function to format display text (first item + "...")
  const formatMultiSelectDisplay = (selectedNames: string[]): string => {
    if (selectedNames.length === 0) return '';
    if (selectedNames.length === 1) return selectedNames[0];
    return `${selectedNames[0]}...`;
  };

  // Handle tooltip show/hide
  const handleTooltipShow = (event: React.MouseEvent, content: string) => {
    if (!content) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPosition({ x: rect.left, y: rect.bottom + 8 });
    setTooltipContent(content);
  };

  const handleTooltipHide = () => {
    setTooltipContent(null);
    setTooltipPosition(null);
  };

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
      case 'last7Days':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 7);
        setDateRange({
          start: formatDateYYYYMMDD(startDate),
          end: formatDateYYYYMMDD(endDate),
        });
        setSelectedDateRangeOption('Last 7 days');
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

  // Sync dateRange with filters.leadFrom and leadTo
  useEffect(() => {
    if (dateRange.start && dateRange.end) {
      // Convert YYYY-MM-DD to DD/MM/YYYY format for filters
      const startFormatted = formatDateFromInput(dateRange.start);
      const endFormatted = formatDateFromInput(dateRange.end);
      setFilters(prev => ({
        ...prev,
        leadFrom: startFormatted,
        leadTo: endFormatted,
        page: 0,
      }));
      setCurrentPage(0);
    } else {
      // Clear date filters if dateRange is empty
      setFilters(prev => {
        const next = { ...prev };
        delete next.leadFrom;
        delete next.leadTo;
        return { ...next, page: 0 };
      });
      setCurrentPage(0);
    }
  }, [dateRange]);

  // Note: Custom filters are applied when saved, they work alongside manual filters
  // Manual filters from dropdowns take precedence

  // Helper function to get filtered managers based on selected category and organization
  const getFilteredManagers = useCallback(() => {
    if (!filterMeta?.ownerOptions) return [];
    
    const selectedCategoryIds = Array.isArray(filters.categoryId) 
      ? filters.categoryId 
      : filters.categoryId ? [filters.categoryId] : [];
    const selectedOrgIds = Array.isArray(filters.organizationId) 
      ? filters.organizationId 
      : filters.organizationId ? [filters.organizationId] : [];

    // If no category or organization selected, return all managers
    if (selectedCategoryIds.length === 0 && selectedOrgIds.length === 0) {
      return filterMeta.ownerOptions;
    }

    // Filter organizations based on selected category
    let filteredOrgs = filterMeta.organizationOptions || [];
    if (selectedCategoryIds.length > 0) {
      const selectedCategories = filterMeta.categoryOptions?.filter(cat => 
        selectedCategoryIds.includes(cat.id)
      ) || [];
      const categoryNames = selectedCategories.map(cat => cat.name?.toLowerCase().trim());
      
      filteredOrgs = filteredOrgs.filter(org => {
        if (!org.category) return false;
        return categoryNames.includes(org.category.toLowerCase().trim());
      });
    }

    // If specific organizations are selected, filter to only those
    if (selectedOrgIds.length > 0) {
      filteredOrgs = filteredOrgs.filter(org => selectedOrgIds.includes(org.id));
    }

    // Get unique owner IDs from filtered organizations
    const ownerIds = new Set<number>();
    filteredOrgs.forEach(org => {
      if (org.ownerId) {
        ownerIds.add(org.ownerId);
      }
    });

    // If we have owner IDs, filter managers to only those owners
    if (ownerIds.size > 0) {
      return filterMeta.ownerOptions.filter(owner => ownerIds.has(owner.id));
    }

    // If no owner IDs found, return all managers
    return filterMeta.ownerOptions;
  }, [filterMeta, filters.categoryId, filters.organizationId]);

  const handleMultiSelectChange = (
    key: 'categoryId' | 'organizationId' | 'ownerId' | 'label',
    value: number | string,
    checked: boolean
  ) => {
    setFilters(prev => {
      const next: PersonFilters = { ...prev };
      const currentValue = next[key];
      const currentArray = Array.isArray(currentValue) 
        ? currentValue 
        : currentValue ? [currentValue] : [];

      if (checked) {
        // Add to array if not already present
        if (!currentArray.includes(value)) {
          next[key] = [...currentArray, value] as any;
        }
      } else {
        // Remove from array
        const newArray = currentArray.filter(item => item !== value);
        next[key] = newArray.length > 0 ? (newArray as any) : undefined;
      }

      // Special handling for category: clear organization if it doesn't match
      if (key === 'categoryId' && next.organizationId) {
        const selectedCategoryIds = Array.isArray(next.categoryId) 
          ? next.categoryId 
          : next.categoryId ? [next.categoryId] : [];
        const selectedCategories = filterMeta?.categoryOptions?.filter(cat => 
          selectedCategoryIds.includes(cat.id)
        ) || [];
        const categoryNames = selectedCategories.map(cat => cat.name?.toLowerCase().trim());

        const currentOrgIds = Array.isArray(next.organizationId) 
          ? next.organizationId 
          : [next.organizationId];
        
        const validOrgIds = currentOrgIds.filter(orgId => {
          const org = filterMeta?.organizationOptions?.find(o => o.id === orgId);
          if (!org || !org.category) return false;
          return categoryNames.includes(org.category.toLowerCase().trim());
        });

        if (validOrgIds.length !== currentOrgIds.length) {
          next.organizationId = validOrgIds.length > 0 ? validOrgIds : undefined;
        }
      }

      // Special handling for organization: clear manager if it doesn't match
      if (key === 'organizationId' && next.ownerId) {
        // This will be handled by the filtered managers list
        // For now, we keep the ownerId and let the UI filter the options
      }

      return { ...next, page: 0 };
    });
    setCurrentPage(0);
  };

  const handleFilterChange = (key: keyof PersonFilters, value: string | undefined) => {
    setFilters(prev => {
      const next: PersonFilters = { ...prev };
      // Special handling for category: convert category name to categoryId
      if (key === 'category' && value) {
        const categoryOption = filterMeta?.categoryOptions?.find(cat => cat.name === value);
        if (categoryOption) {
          // When category changes, check if current organization matches the new category
          if (next.organizationId) {
            const currentOrg = filterMeta?.organizationOptions?.find(org => org.id === next.organizationId);
            if (currentOrg && currentOrg.category !== categoryOption.name) {
              // Clear organization filter if it doesn't match the new category
              delete next.organizationId;
              delete next.organization;
            }
          }
          next.categoryId = categoryOption.id;
          delete next.category; // Remove legacy category field
        } else {
          // Fallback: if category ID not found, use legacy category string
          (next as any).category = value;
          delete next.categoryId;
        }
      } else if (key === 'category' && !value) {
        // Clear both categoryId and legacy category
        delete next.categoryId;
        delete (next as any).category;
      } else if (key === 'organization' && value) {
        // Special handling for organization: convert organization name to organizationId
        const organizationOption = filterMeta?.organizationOptions?.find(org => org.name === value);
        if (organizationOption) {
          next.organizationId = organizationOption.id;
          delete next.organization; // Remove legacy organization field
        } else {
          // Fallback: if organization ID not found, use legacy organization string
          (next as any).organization = value;
          delete next.organizationId;
        }
      } else if (key === 'organization' && !value) {
        // Clear both organizationId and legacy organization
        delete next.organizationId;
        delete (next as any).organization;
      } else {
        (next as any)[key] = value || undefined;
      }
      return { ...next, page: 0 };
    });
    setCurrentPage(0);
  };

  const handlePageChange = (newPage: number) => {
    // Update both currentPage and filters.page
    setCurrentPage(newPage);
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  const handlePersonClick = (id: number) => {
    navigate(`/persons/${id}`);
  };

  const handleEditPerson = (id: number) => {
    const found = persons.find(x => x.id === id) || null;
    setEditPerson(found);
    setIsAddPersonOpen(true);
  };

  const applyFilterConditions = (conditions: PersonFilterCondition[]) => {
    const customFilters: Partial<PersonFilters> = {};
    conditions.forEach(condition => {
      if (!condition.field || !condition.value) return;
      const value = normalizeConditionValue(condition.field, condition.value);
      switch (condition.field) {
        case 'category':
          if (condition.operator === 'equals') {
            // Find category ID from category name
            const categoryOption = filterMeta?.categoryOptions?.find(cat => cat.name === value);
            if (categoryOption) {
              customFilters.categoryId = categoryOption.id;
            } else {
              // Fallback to legacy category string if ID not found
              customFilters.category = value;
            }
          }
          break;
        case 'organization':
          if (condition.operator === 'equals') {
            // Try to find organization ID from name
            const orgOption = filterMeta?.organizationOptions?.find(org => org.name === value);
            if (orgOption) {
              customFilters.organizationId = orgOption.id;
            } else {
              customFilters.organization = value; // Fallback to name
            }
          }
          break;
        case 'manager':
          if (condition.operator === 'equals') customFilters.manager = value;
          break;
        case 'label':
          if (condition.operator === 'equals') customFilters.label = value;
          break;
        case 'source':
          if (condition.operator === 'equals') customFilters.source = value;
          break;
        case 'leadDate':
          if (condition.operator === 'equals') {
            customFilters.leadFrom = value;
            customFilters.leadTo = value;
          }
          break;
        case 'dateFrom':
          customFilters.dateFrom = value;
          break;
        case 'dateTo':
          customFilters.dateTo = value;
          break;
        case 'name':
        case 'instagramId':
        case 'phone':
          if (condition.operator === 'contains') {
            customFilters.q = value;
          }
          break;
        case 'q':
          customFilters.q = value;
          break;
      }
    });
    setFilters(prev => ({ ...prev, ...customFilters, page: 0 }));
    setCurrentPage(0);
  };

  const handleSaveFilter = (conditions: FilterCondition[], filterName: string) => {
    const payload = toBackendConditions(conditions);
    if (payload.length === 0) return;

    setActiveCustomFilters(payload);
    applyFilterConditions(payload);

    void personsApi.saveCustomFilter(filterName, payload)
      .catch(error => {
        console.error('Failed to save custom filter:', error);
      });
  };


  const handleRemoveCustomFilter = () => {
    setFilters(prev => {
      const next: PersonFilters = { ...prev };
      activeCustomFilters.forEach(condition => {
        const value = normalizeConditionValue(condition.field, condition.value);
        switch (condition.field) {
          case 'category':
            // Remove both categoryId and legacy category
            const categoryOption = filterMeta?.categoryOptions?.find(cat => cat.name === value);
            if (categoryOption && next.categoryId === categoryOption.id) {
              delete next.categoryId;
            }
            if (next.category === value) delete next.category;
            break;
          case 'organization':
            if (next.organization === value || next.organizationId) {
              delete next.organization;
              delete next.organizationId;
            }
            break;
          case 'manager':
            if (next.manager === value) delete next.manager;
            break;
          case 'label':
            if (next.label === value) delete next.label;
            break;
          case 'source':
            if (next.source === value) delete next.source;
            break;
          case 'leadDate':
            if (next.leadFrom === value) delete next.leadFrom;
            if (next.leadTo === value) delete next.leadTo;
            break;
          case 'dateFrom':
            if (next.dateFrom === value) delete next.dateFrom;
            break;
          case 'dateTo':
            if (next.dateTo === value) delete next.dateTo;
            break;
          case 'name':
          case 'instagramId':
          case 'phone':
          case 'q':
            if (next.q === value) delete next.q;
            break;
        }
      });
      return { ...next, page: 0 };
    });
    setCurrentPage(0);
    setActiveCustomFilters([]);
    // Don't clear manual filters, just remove custom filter chips
  };


  const availableFilterFields = filterMeta ? [
    { value: 'name', label: 'Name', type: 'text' as const },
    { value: 'label', label: 'Label', type: 'select' as const },
    { value: 'source', label: 'Source', type: 'select' as const },
    { value: 'category', label: 'Category', type: 'select' as const },
    { value: 'organization', label: 'Organization', type: 'select' as const },
    { value: 'manager', label: 'Owner', type: 'select' as const },
    { value: 'leadDate', label: 'Lead Date', type: 'date' as const },
    { value: 'phone', label: 'Phone', type: 'text' as const },
    { value: 'instagramId', label: 'Instagram ID', type: 'text' as const },
  ] : [];

  const fieldOptions: Record<string, string[]> = filterMeta ? {
    label: Array.isArray(filterMeta.labelOptions) ? filterMeta.labelOptions.map(option => option.code) : [],
    source: Array.isArray(filterMeta.sourceOptions) ? filterMeta.sourceOptions.map(option => option.code) : [],
    category: Array.isArray(filterMeta.categories) ? filterMeta.categories : [],
    organization: Array.isArray(filterMeta.organizations) ? filterMeta.organizations : [],
    manager: Array.isArray(filterMeta.managers) ? filterMeta.managers : [],
  } : {};

  const handleAddPerson = () => {
    setEditPerson(null);
    setIsAddPersonOpen(true);
  };

  const handlePersonAdded = async () => {
    console.log('handlePersonAdded called - refreshing list...');
    
    // Clear all filters to ensure new person is visible
    // Reset to first page to show the new person
    const resetFilters = { 
      page: 0,
      size: filters.size || 10
    };
    
    // Clear localStorage when resetting filters after adding a person
    try {
      localStorage.removeItem(FILTERS_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear filters from localStorage:', error);
    }
    
    // Wait a bit for backend to process, then reset filters
    // This will trigger useEffect to reload the list
    setTimeout(() => {
      console.log('Resetting filters to:', resetFilters);
      setFilters(resetFilters);
      setCurrentPage(0);
    }, 500);
  };

  const handlePersonDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPersonDropdownOpen(!isPersonDropdownOpen);
  };

  const handleImportData = () => {
    setIsPersonDropdownOpen(false);
    // TODO: Open import data modal
    alert('Import data functionality - to be implemented');
  };

  const handleSyncContacts = () => {
    setIsPersonDropdownOpen(false);
    // TODO: Sync contacts functionality
    alert('Sync contacts functionality - to be implemented');
  };

  const handleColumnHeaderClick = (e: React.MouseEvent, columnName: string) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setColumnMenu({
      isOpen: true,
      columnName,
      position: {
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      },
    });
  };

  const handleSortAscending = () => {
    if (columnMenu) {
      setSortConfig({ field: columnMenu.columnName, direction: 'asc' });
      setFilters(prev => ({ ...prev, sort: `${columnMenu.columnName},asc`, page: 0 }));
      setColumnMenu(null);
    }
  };

  const handleSortDescending = () => {
    if (columnMenu) {
      setSortConfig({ field: columnMenu.columnName, direction: 'desc' });
      setFilters(prev => ({ ...prev, sort: `${columnMenu.columnName},desc`, page: 0 }));
      setColumnMenu(null);
    }
  };

  const handleHideColumn = () => {
    if (columnMenu) {
      setHiddenColumns(prev => new Set(prev).add(columnMenu.columnName));
      setColumnMenu(null);
    }
  };

  const handleInsertRight = () => {
    if (columnMenu) {
      // TODO: Implement insert column to right
      alert(`Insert column to right of "${columnMenu.columnName}" - to be implemented`);
      setColumnMenu(null);
    }
  };

  const handleInsertLeft = () => {
    if (columnMenu) {
      // TODO: Implement insert column to left
      alert(`Insert column to left of "${columnMenu.columnName}" - to be implemented`);
      setColumnMenu(null);
    }
  };

  // ----- Drag & drop reorder handlers -----
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

  const getColumnDisplayName = (column: string): string => {
    const columnMap: Record<string, string> = {
      name: 'Name',
      instagramId: 'Instagram ID',
      source: 'Source',
      subSource: 'Sub Source',
      email: 'Email',
      phone: 'Phone',
      category: 'Category',
      organization: 'Organization',
      manager: 'Owner',
      label: 'Label',
      leadDate: 'Lead Date',
    };
    return columnMap[column] || column;
  };

  // Styling for Source pill
  const getSourceStyle = (source?: string | null): React.CSSProperties => {
    const s = (source || '').toLowerCase();
    // base pill styles
    const base: React.CSSProperties = {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      border: '1px solid transparent',
    };
    switch (s) {
      case 'instagram':
        return { ...base, background: '#fde2ea', color: '#c13584', borderColor: '#f5b1cc' }; // Instagram
      case 'whatsapp/call':
      case 'whatsapp':
        return { ...base, background: '#e6f8ed', color: '#25D366', borderColor: '#bfeecf' }; // WhatsApp
      case 'reference':
        return { ...base, background: '#efe7fb', color: '#6f42c1', borderColor: '#dac8f4' }; // Purple
      case 'tbs':
        return { ...base, background: '#e7f1ff', color: '#0d6efd', borderColor: '#c9dfff' }; // Brand blue
      case 'planner':
      case 'direct':
        return { ...base, background: '#fff0e0', color: '#ff8c00', borderColor: '#ffd4a8' }; // Orange
      case 'divert':
        return { ...base, background: '#ffe3e3', color: '#c92a2a', borderColor: '#ffc9c9' }; // Red theme
      case 'mail':
      case 'email':
        return { ...base, background: '#e9f7f9', color: '#0aa2c0', borderColor: '#c6edf3' }; // Teal
      case 'website':
        return { ...base, background: '#eef0f2', color: '#495057', borderColor: '#d9dde1' }; // Gray
      default:
        return { ...base, background: '#f1f3f5', color: '#495057', borderColor: '#e9ecef' };
    }
  };

  // Styling for Label pill - same colors as summary labels in PersonDetail
  const getLabelStyle = (label?: string | null): React.CSSProperties => {
    const l = (label || '').toUpperCase();
    // base pill styles (same as source)
    const base: React.CSSProperties = {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      border: '1px solid transparent',
    };
    
    // Color mapping matching PersonDetail.tsx getLabelColor function
    const colorMap: Record<string, { bg: string; text: string; border: string }> = {
      'CUSTOMER': { bg: '#e8f5e9', text: '#4CAF50', border: '#c8e6c9' },      // Mint green
      'HOT_LEAD': { bg: '#ffebee', text: '#F44336', border: '#ffcdd2' },      // Red
      'WARM_LEAD': { bg: '#fffde7', text: '#FFC107', border: '#fff9c4' },     // Yellow
      'COLD_LEAD': { bg: '#e3f2fd', text: '#2196F3', border: '#bbdefb' },     // Blue
      'NO_RESPONSE': { bg: '#f3e5f5', text: '#9C27B0', border: '#e1bee7' },   // Purple
      'PLANNER': { bg: '#fff3e0', text: '#FF9800', border: '#ffe0b2' },       // Orange
      'WEDDING': { bg: '#f5f5f5', text: '#9E9E9E', border: '#e0e0e0' },       // Light gray
      'PRE_WEDDING': { bg: '#fce4ec', text: '#E91E63', border: '#f8bbd0' },    // Pink
      'BRIDAL_MAKEUP': { bg: '#fce4ec', text: '#E91E63', border: '#f8bbd0' }, // Pink (similar to pre-wedding)
      'PARTY_MAKEUP': { bg: '#fff3e0', text: '#FF9800', border: '#ffe0b2' },   // Orange
      'ENGAGEMENT': { bg: '#e1f5fe', text: '#00BCD4', border: '#b2ebf2' },     // Cyan
      'RECEPTION': { bg: '#f3e5f5', text: '#9C27B0', border: '#e1bee7' },      // Purple
      'OTHER': { bg: '#f5f5f5', text: '#757575', border: '#e0e0e0' },          // Gray
    };

    const mapped = colorMap[l];
    if (mapped) {
      return { ...base, background: mapped.bg, color: mapped.text, borderColor: mapped.border };
    }
    
    // Default style for unknown labels
    return { ...base, background: '#f1f3f5', color: '#495057', borderColor: '#e9ecef' };
  };

  const getSortField = (): string | null => {
    if (!filters.sort) return null;
    return filters.sort.split(',')[0];
  };

  const getSortDirection = (): 'asc' | 'desc' | null => {
    if (!filters.sort) return null;
    const parts = filters.sort.split(',');
    return (parts[1] as 'asc' | 'desc') || null;
  };

  const openRowMenu = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setRowMenu({ rowId: id, x: e.clientX, y: e.clientY });
  };

  const closeRowMenu = () => setRowMenu(null);

  const handleDeleteRow = (id: number) => {
    setPendingDeleteId(id);
    setPendingBulkDelete(false);
    setShowDeleteConfirm(true);
      closeRowMenu();
  };

  const confirmDelete = async () => {
    // Close confirmation modal first
    setShowDeleteConfirm(false);
    const deleteId = pendingDeleteId;
    const isBulk = pendingBulkDelete;
    setPendingDeleteId(null);
    setPendingBulkDelete(false);

    if (isBulk) {
      // Handle bulk delete
      if (!selectedPersons.size) {
        return;
      }
      try {
        const idsToDelete = Array.from(selectedPersons);
        const count = selectedPersons.size;
        await personsApi.bulkDelete(idsToDelete);
        setSelectedPersons(new Set());
        // Show success confirmation
        setDeletedPersonsCount(count);
        setShowDeleteSuccess(true);
        // Reload persons after successful deletion
        await loadPersons();
      } catch (err: any) {
        console.error('Failed to delete persons:', err);
        const errorMessage = err?.response?.data?.message || err?.message || 'Failed to delete persons.';
        alert(`Failed to delete: ${errorMessage}`);
      }
    } else if (deleteId) {
      // Handle single delete
      try {
        await personsApi.delete(deleteId);
        // Remove from selected persons if it was selected
        setSelectedPersons(prev => {
          const next = new Set(prev);
          next.delete(deleteId);
          return next;
        });
        // Show success confirmation
        setDeletedPersonsCount(1);
        setShowDeleteSuccess(true);
        // Reload persons - if we're on a page that becomes empty, the backend should handle pagination
        await loadPersons();
      } catch (err: any) {
        console.error('Failed to delete person:', err);
        const errorMessage = err?.response?.data?.message || err?.message || 'Failed to delete person.';
        alert(`Failed to delete: ${errorMessage}`);
      }
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPendingDeleteId(null);
    setPendingBulkDelete(false);
  };

  const handleEditRow = (id: number) => {
    closeRowMenu();
    handleEditPerson(id);
  };

  const openCustomize = (e?: React.MouseEvent) => {
    setTempHiddenColumns(new Set(hiddenColumns));
    setCustomizeSearch('');
    if (e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setCustomizePos({ x: rect.right + window.scrollX - 360, y: rect.bottom + window.scrollY + 8 });
    } else {
      setCustomizePos({ x: window.innerWidth - 380, y: 120 });
    }
    setIsCustomizeOpen(true);
  };

  const toggleTempColumn = (col: string) => {
    setTempHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  };

  const saveCustomize = () => {
    setHiddenColumns(new Set(tempHiddenColumns));
    setIsCustomizeOpen(false);
  };

  const addCustomField = () => {
    setIsAddCustomOpen(true);
    setNewField({ name: '', type: '' });
  };

  const saveCustomField = () => {
    const key = newField.name.trim().replace(/\s+/g, '_');
    if (!key) { alert('Enter field name'); return; }
    if (columnOrder.includes(key)) { alert('Field already exists'); return; }
    setColumnOrder(prev => [...prev, key]);
    setHiddenColumns(prev => new Set(prev));
    setIsAddCustomOpen(false);
  };

  const handleSelectPerson = (id: number, checked: boolean) => {
    setSelectedPersons(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPersons(new Set(persons.map(p => p.id)));
    } else {
      setSelectedPersons(new Set());
    }
  };

  const handleBulkEdit = async (updates: Record<string, string | null>) => {
    const ids = Array.from(selectedPersons);
    if (ids.length === 0) return;

    try {
      await Promise.all(
        ids.map(id => personsApi.update(id, updates))
      );
      setSelectedPersons(new Set());
      setIsBulkEditOpen(false);
      loadPersons();
    } catch (error) {
      console.error('Bulk update failed:', error);
      alert('Failed to update persons. Please try again.');
    }
  };

  const bulkEditFields = filterMeta ? [
    { field: 'name', label: 'Name', type: 'text' as const },
    { field: 'organization', label: 'Organization', type: 'select' as const, options: filterMeta.organizations },
    { field: 'manager', label: 'Manager', type: 'select' as const, options: filterMeta.managers },
    { field: 'category', label: 'Category', type: 'select' as const, options: filterMeta.categories },
    { field: 'label', label: 'Label', type: 'select' as const, options: filterMeta.labelOptions?.map(option => option.code) || [] },
    { field: 'instagramId', label: 'Instagram ID', type: 'text' as const },
    { field: 'phone', label: 'Phone', type: 'text' as const },
    { field: 'source', label: 'Person Source', type: 'select' as const, options: Array.isArray(filterMeta.sourceOptions) ? filterMeta.sourceOptions.map(option => option.code) : [] },
  ] : [];

  return (
    <div className="persons-list-container">
      <header className="persons-header">
        <div>
        <h1>Persons</h1>
          {totalElements > 0 && (
            <p className="persons-count">{totalElements} {totalElements === 1 ? 'person' : 'persons'}</p>
          )}
        </div>
        <div className="header-actions">
          <div className="person-button-container">
            <div className="person-button">
              <button className="person-button-main" onClick={handleAddPerson}>
                <span className="person-plus-icon">+</span>
                <span className="person-text">Person</span>
              </button>
              <div className="person-button-divider"></div>
              <button className="person-button-arrow" onClick={handlePersonDropdown}>
                <span className="person-arrow">▼</span>
              </button>
            </div>
            <PersonDropdown
              isOpen={isPersonDropdownOpen}
              onClose={() => setIsPersonDropdownOpen(false)}
              onImportData={handleImportData}
              onSyncContacts={handleSyncContacts}
            />
          </div>
        </div>
      </header>

      {selectedPersons.size > 0 && (
        <div className="bulk-edit-bar">
          <span className="selected-count">{selectedPersons.size} selected</span>
          <button className="bulk-edit-button" onClick={() => setIsBulkEditOpen(true)}>
            Bulk edit
          </button>
          <button className="bulk-delete-button" onClick={() => {
            if (!selectedPersons.size) {
              alert('Please select at least one person to delete.');
              return;
            }
            setPendingDeleteId(null);
            setPendingBulkDelete(true);
            setShowDeleteConfirm(true);
          }}>
            Delete
          </button>
        </div>
      )}

      {activeCustomFilters.length > 0 && (
        <div className="active-filters-section">
          {activeCustomFilters.map((condition, idx) => {
            const field = availableFilterFields.find(f => f.value === condition.field);
            const normalizedValue = normalizeConditionValue(condition.field, condition.value);
            const labelParts = [
              field?.label || condition.field,
              getOperatorLabel(condition.operator),
              normalizedValue,
            ].filter(Boolean);
            const label = labelParts.join(' ');
            return (
              <FilterChip
                key={idx}
                label={label}
                onRemove={handleRemoveCustomFilter}
              />
            );
          })}
        </div>
      )}

      <div className="filters-section">
        {filterMeta && (
          <>
            {/* Category Multi-Select */}
            <div className="filter-group">
              <label htmlFor="category-filter">Category</label>
              <div className="multi-select-wrapper">
                <div 
                  className="multi-select-trigger"
                  onClick={handleCategoryDropdownToggle}
                  onMouseEnter={(e) => {
                    const selectedIds = Array.isArray(filters.categoryId) 
                      ? filters.categoryId 
                      : filters.categoryId ? [filters.categoryId] : [];
                    if (selectedIds.length === 0) return;
                    const selectedNames = selectedIds
                      .map(id => filterMeta?.categoryOptions?.find(cat => cat.id === id)?.name)
                      .filter(Boolean) as string[];
                    if (selectedNames.length > 1) {
                      handleTooltipShow(e, selectedNames.join(', '));
                    }
                  }}
                  onMouseLeave={handleTooltipHide}
                >
                  <span className="multi-select-value">
                    {(() => {
                      const selectedIds = Array.isArray(filters.categoryId) 
                        ? filters.categoryId 
                        : filters.categoryId ? [filters.categoryId] : [];
                      if (selectedIds.length === 0) return 'All Categories';
                      const selectedNames = selectedIds
                        .map(id => filterMeta?.categoryOptions?.find(cat => cat.id === id)?.name)
                        .filter(Boolean) as string[];
                      if (selectedNames.length === 0) return 'All Categories';
                      return formatMultiSelectDisplay(selectedNames);
                    })()}
                  </span>
                  <span className="multi-select-arrow">▼</span>
                </div>
                {isCategoryDropdownOpen && (
                  <>
                    <div 
                      className="multi-select-overlay"
                      onClick={() => setIsCategoryDropdownOpen(false)}
                    />
                    <div className="multi-select-dropdown">
                      {filterMeta?.categoryOptions?.map(cat => {
                        const selectedIds = Array.isArray(filters.categoryId) 
                          ? filters.categoryId 
                          : filters.categoryId ? [filters.categoryId] : [];
                        const isChecked = selectedIds.includes(cat.id);
                        return (
                          <label key={cat.id} className="multi-select-option">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                handleMultiSelectChange('categoryId', cat.id, e.target.checked);
                              }}
                            />
                            <span>{cat.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Organization Multi-Select */}
            <div className="filter-group">
              <label htmlFor="organization-filter">Organization</label>
              <div className="multi-select-wrapper">
                <div 
                  className="multi-select-trigger"
                  onClick={handleOrganizationDropdownToggle}
                  onMouseEnter={(e) => {
                    const selectedIds = Array.isArray(filters.organizationId) 
                      ? filters.organizationId 
                      : filters.organizationId ? [filters.organizationId] : [];
                    if (selectedIds.length === 0) return;
                    const selectedNames = selectedIds
                      .map(id => filterMeta?.organizationOptions?.find(org => org.id === id)?.name)
                      .filter(Boolean) as string[];
                    if (selectedNames.length > 1) {
                      handleTooltipShow(e, selectedNames.join(', '));
                    }
                  }}
                  onMouseLeave={handleTooltipHide}
                >
                  <span className="multi-select-value">
                    {(() => {
                      const selectedIds = Array.isArray(filters.organizationId) 
                        ? filters.organizationId 
                        : filters.organizationId ? [filters.organizationId] : [];
                      if (selectedIds.length === 0) return 'All Organizations';
                      const selectedNames = selectedIds
                        .map(id => filterMeta?.organizationOptions?.find(org => org.id === id)?.name)
                        .filter(Boolean) as string[];
                      if (selectedNames.length === 0) return 'All Organizations';
                      return formatMultiSelectDisplay(selectedNames);
                    })()}
                  </span>
                  <span className="multi-select-arrow">▼</span>
                </div>
                {isOrganizationDropdownOpen && (
                  <>
                    <div 
                      className="multi-select-overlay"
                      onClick={() => setIsOrganizationDropdownOpen(false)}
                    />
                    <div className="multi-select-dropdown">
                      {(() => {
                        // Filter organizations based on selected category
                        let filteredOrgs = filterMeta?.organizationOptions || [];
                        const selectedCategoryIds = Array.isArray(filters.categoryId) 
                          ? filters.categoryId 
                          : filters.categoryId ? [filters.categoryId] : [];
                        if (selectedCategoryIds.length > 0) {
                          const selectedCategories = filterMeta?.categoryOptions?.filter(cat => 
                            selectedCategoryIds.includes(cat.id)
                          ) || [];
                          const categoryNames = selectedCategories.map(cat => cat.name?.toLowerCase().trim());
                          filteredOrgs = filteredOrgs.filter(org => {
                            if (!org.category) return false;
                            return categoryNames.includes(org.category.toLowerCase().trim());
                          });
                        }
                        return filteredOrgs.map(org => {
                          const selectedIds = Array.isArray(filters.organizationId) 
                            ? filters.organizationId 
                            : filters.organizationId ? [filters.organizationId] : [];
                          const isChecked = selectedIds.includes(org.id);
                          return (
                            <label key={org.id} className="multi-select-option">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  handleMultiSelectChange('organizationId', org.id, e.target.checked);
                                }}
                              />
                              <span>{org.name}</span>
                            </label>
                          );
                        });
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Manager Multi-Select */}
            <div className="filter-group">
              <label htmlFor="manager-filter">Owner</label>
              <div className="multi-select-wrapper">
                <div 
                  className="multi-select-trigger"
                  onClick={handleManagerDropdownToggle}
                  onMouseEnter={(e) => {
                    const selectedIds = Array.isArray(filters.ownerId) 
                      ? filters.ownerId 
                      : filters.ownerId ? [filters.ownerId] : [];
                    if (selectedIds.length === 0) return;
                    const selectedNames = selectedIds
                      .map(id => filterMeta?.ownerOptions?.find(owner => owner.id === id)?.displayName || 
                                 filterMeta?.ownerOptions?.find(owner => owner.id === id)?.email)
                      .filter(Boolean) as string[];
                    if (selectedNames.length > 1) {
                      handleTooltipShow(e, selectedNames.join(', '));
                    }
                  }}
                  onMouseLeave={handleTooltipHide}
                >
                  <span className="multi-select-value">
                    {(() => {
                      const selectedIds = Array.isArray(filters.ownerId) 
                        ? filters.ownerId 
                        : filters.ownerId ? [filters.ownerId] : [];
                      if (selectedIds.length === 0) return 'All Users';
                      const selectedNames = selectedIds
                        .map(id => filterMeta?.ownerOptions?.find(owner => owner.id === id)?.displayName ||
                                   filterMeta?.ownerOptions?.find(owner => owner.id === id)?.email)
                        .filter(Boolean) as string[];
                      if (selectedNames.length === 0) return 'All Users';
                      return formatMultiSelectDisplay(selectedNames);
                    })()}
                  </span>
                  <span className="multi-select-arrow">▼</span>
                </div>
                {isManagerDropdownOpen && (
                  <>
                    <div 
                      className="multi-select-overlay"
                      onClick={() => setIsManagerDropdownOpen(false)}
                    />
                    <div className="multi-select-dropdown">
                      {getFilteredManagers().map(owner => {
                        const selectedIds = Array.isArray(filters.ownerId) 
                          ? filters.ownerId 
                          : filters.ownerId ? [filters.ownerId] : [];
                        const isChecked = selectedIds.includes(owner.id);
                        return (
                          <label key={owner.id} className="multi-select-option">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                handleMultiSelectChange('ownerId', owner.id, e.target.checked);
                              }}
                            />
                            <span>{owner.displayName || owner.email}</span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {filterMeta.labelOptions && (
              <div className="filter-group">
                <label htmlFor="label-filter">Label</label>
                <div className="multi-select-wrapper">
                  <div 
                    className="multi-select-trigger"
                    onClick={handleLabelDropdownToggle}
                    onMouseEnter={(e) => {
                      const selectedLabels = Array.isArray(filters.label) 
                        ? filters.label 
                        : filters.label ? [filters.label] : [];
                      if (selectedLabels.length === 0) return;
                      const selectedNames = selectedLabels
                        .map(code => filterMeta?.labelOptions?.find(opt => opt.code === code)?.label)
                        .filter(Boolean) as string[];
                      if (selectedNames.length > 1) {
                        handleTooltipShow(e, selectedNames.join(', '));
                      }
                    }}
                    onMouseLeave={handleTooltipHide}
                  >
                    <span className="multi-select-value">
                      {(() => {
                        const selectedLabels = Array.isArray(filters.label) 
                          ? filters.label 
                          : filters.label ? [filters.label] : [];
                        if (selectedLabels.length === 0) return 'All Labels';
                        const selectedNames = selectedLabels
                          .map(code => filterMeta?.labelOptions?.find(opt => opt.code === code)?.label)
                          .filter(Boolean) as string[];
                        if (selectedNames.length === 0) return 'All Labels';
                        return formatMultiSelectDisplay(selectedNames);
                      })()}
                    </span>
                    <span className="multi-select-arrow">▼</span>
                  </div>
                  {isLabelDropdownOpen && (
                    <>
                      <div 
                        className="multi-select-overlay"
                        onClick={() => setIsLabelDropdownOpen(false)}
                      />
                      <div className="multi-select-dropdown">
                        {filterMeta.labelOptions.map(option => {
                          const selectedLabels = Array.isArray(filters.label) 
                            ? filters.label 
                            : filters.label ? [filters.label] : [];
                          const isChecked = selectedLabels.includes(option.code);
                          return (
                            <label key={option.code} className="multi-select-option">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  handleMultiSelectChange('label', option.code, e.target.checked);
                                }}
                              />
                              <span>{option.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {filterMeta.sourceOptions && Array.isArray(filterMeta.sourceOptions) && filterMeta.sourceOptions.length > 0 && (
              <div className="filter-group">
                <label htmlFor="source-filter">Source</label>
                <select
                  id="source-filter"
                  value={filters.source || ''}
                  onChange={(e) => handleFilterChange('source', e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Sources</option>
                  {filterMeta.sourceOptions.map(option => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {/* Date Range Filter */}
        <div className="filter-group">
          <label htmlFor="date-range-filter">Date Range</label>
          <div style={{ position: 'relative' }} ref={dateRangeDropdownRef}>
            <button 
              className="filter-select"
              onClick={() => setIsDateRangeDropdownOpen(!isDateRangeDropdownOpen)}
              style={{
                padding: '10px 14px',
                border: '1.5px solid #e2e8f0',
                borderRadius: '8px',
                background: '#ffffff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '180px',
                justifyContent: 'space-between',
                width: '100%',
                fontFamily: 'inherit',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <span>{getDateRangeDisplayText()}</span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>▾</span>
            </button>
            {isDateRangeDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  backgroundColor: '#fff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
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
                    color: '#0f172a',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
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
                    color: '#0f172a',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
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
                    color: '#0f172a',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
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
                    color: '#0f172a',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
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
                    color: '#0f172a',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
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
                    color: '#0f172a',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Last month
                </button>
                <button
                  onClick={() => handleDateRangeOption('last7Days')}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#0f172a',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Last 7 days
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
                    color: '#0f172a',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
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
                    color: '#0f172a',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Select date range
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="filter-group">
          <label htmlFor="search-input">Search</label>
          <input
            id="search-input"
            type="text"
            placeholder="Search..."
            value={filters.q || ''}
            onChange={(e) => handleFilterChange('q', e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group" style={{ alignSelf: 'flex-end' }}>
          <label style={{ visibility: 'hidden' }}>Action</label>
        <button onClick={() => loadPersons()} className="search-button">
          Search
        </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div style={{ position: 'relative' }}>
          {reloading && (
            <div className="table-reloading-overlay">
              <div className="table-reloading-spinner">Loading...</div>
            </div>
          )}
          <div className="table-wrapper">
          <table className="persons-table">
            <thead>
              <tr>
                <th className="checkbox-header">
                  <input
                    type="checkbox"
                    checked={persons.length > 0 && selectedPersons.size === persons.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                {columnOrder
                  .filter(c => !hiddenColumns.has(c))
                  .map(col => (
                  <th
                      key={col}
                    className="sortable-header"
                      draggable
                      onDragStart={() => onDragStart(col)}
                      onDragOver={onDragOver}
                      onDrop={() => onDrop(col)}
                      onClick={(e) => handleColumnHeaderClick(e, col)}
                    >
                      {getColumnDisplayName(col)}
                      {getSortField() === col && (
                      <span className="sort-indicator">
                        {getSortDirection() === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                  ))}
                <th style={{ width: 48 }}>
                  <button
                    onClick={(e) => openCustomize(e)}
                    title="Customize columns"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    ⚙️
                  </button>
                  </th>
              </tr>
            </thead>
            <tbody>
              {persons.length === 0 ? (
                <tr>
                  <td colSpan={columnOrder.filter(c => !hiddenColumns.has(c)).length + 2} className="empty-state-cell">
                    <div className="empty-state">
                      <h3>No persons found</h3>
                      <p>Try adjusting your filters or search criteria to find what you're looking for.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                persons.map(person => (
                <tr
                  key={person.id}
                  className={`person-row ${selectedPersons.has(person.id) ? 'selected' : ''}`}
                >
                  <td className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedPersons.has(person.id)}
                      onChange={(e) => handleSelectPerson(person.id, e.target.checked)}
                    />
                  </td>
                  {columnOrder
                    .filter(c => !hiddenColumns.has(c))
                    .map(col => (
                      <td key={col} onClick={() => handlePersonClick(person.id)}>
                        {(() => {
                          switch (col) {
                            case 'name': return person.name || 'undefined';
                            case 'instagramId': return person.instagramId || '-';
                            case 'source': {
                                const val = (person as any)?.source || '';
                              return val ? (
                                <span style={getSourceStyle(val)}>{val}</span>
                              ) : '-';
                            }
                              case 'subSource': {
                                const val = (person as any)?.subSource || '';
                                return val || '-';
                              }
                              case 'email': return person.email || '-';
                            case 'phone': return person.phone || '-';
                              case 'category': return person.categoryName || person.category || '-';
                            case 'organization': return person.organization || '-';
                            case 'manager': return person.manager || '-';
                            case 'label': {
                              const val = person.label || '';
                              if (!val) return '-';
                              // Try to find the display label from filterMeta
                              const labelOption = filterMeta?.labelOptions?.find(opt => opt.code === val);
                              const displayText = labelOption?.label || val.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                              return (
                                <span style={getLabelStyle(val)}>{displayText}</span>
                              );
                            }
                            case 'leadDate': {
                              const leadDate = person.leadDate || person.createdDate;
                              if (!leadDate) {
                                return '-';
                              }
                              const daysAway = calculateDaysAway(leadDate);
                              if (daysAway === null) {
                                return leadDate;
                              }
                              const daysText = formatDaysAway(daysAway);
                              const dateColor = '#333'; // match default table text color
                              const daysColor = '#8b4513'; // Reddish-brown color for days away
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ fontSize: '14px', color: dateColor, fontWeight: '500' }}>{leadDate}</span>
                                  <span style={{ fontSize: '14px', color: daysColor }}>{daysText}</span>
                                </div>
                              );
                            }
                            default: return '-';
                          }
                        })()}
                      </td>
                    ))}
                  <td style={{ width: 48 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => openRowMenu(e, person.id)}
                      title="Row actions"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          {rowMenu && (
            <div
              onClick={closeRowMenu}
              style={{ position: 'fixed', inset: 0 }}
            >
              <div
                style={{ position: 'absolute', top: rowMenu.y, left: rowMenu.x, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', borderRadius: 6 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                  onClick={() => handleEditRow(rowMenu.rowId)}
                >
                  Edit
                </div>
                <div
                  style={{ padding: '8px 12px', cursor: 'pointer' }}
                  onClick={() => handleDeleteRow(rowMenu.rowId)}
                >
                  Delete
                </div>
              </div>
            </div>
          )}

          {totalElements > 0 && (
          <div className="pagination">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 0}
                aria-label="Previous page"
            >
                ← Previous
            </button>
              <span>Page {currentPage + 1} of {totalPages || 1}</span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
                aria-label="Next page"
            >
                Next →
            </button>
          </div>
          )}
        </div>
      )}

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onSave={handleSaveFilter}
        availableFields={availableFilterFields}
        fieldOptions={fieldOptions}
      />

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

      <BulkEditModal
        isOpen={isBulkEditOpen}
        onClose={() => setIsBulkEditOpen(false)}
        onSave={handleBulkEdit}
        fields={bulkEditFields}
        selectedPersons={persons.filter(p => selectedPersons.has(p.id))}
      />

      <AddPersonModal
        isOpen={isAddPersonOpen}
        onClose={() => {
          setIsAddPersonOpen(false);
          // Clear location state using navigate to properly update React Router's location state
          // This will trigger the useEffect to reset hasHandledOpenModal.current
          navigate(location.pathname, { replace: true, state: {} });
        }}
        onSuccess={handlePersonAdded}
        filterMeta={filterMeta || undefined}
        mode={editPerson ? 'edit' : 'create'}
        person={editPerson}
      />

      {isCustomizeOpen && (
        <div onClick={() => setIsCustomizeOpen(false)} style={{ position: 'fixed', inset: 0 }}>
          <div className="customize-modal" onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: (customizePos?.y || 100), left: (customizePos?.x || (window.innerWidth - 380)), width: 360, background: '#fff', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: 12 }}>
            <div className="customize-header">
              <h3>Customize columns</h3>
            </div>
            <div className="customize-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <input
                  type="text"
                  value={customizeSearch}
                  onChange={e => setCustomizeSearch(e.target.value)}
                  placeholder="Search..."
                  style={{ width: '65%', padding: '6px 8px' }}
                />
                <button onClick={addCustomField} style={{ background: '#007bff', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}>+ Custom field</button>
              </div>
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#666', margin: '8px 0' }}>VISIBLE</div>
                {columnOrder
                  .filter(col => !tempHiddenColumns.has(col))
                  .filter(col => getColumnDisplayName(col).toLowerCase().includes(customizeSearch.toLowerCase()))
                  .map(col => (
                    <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                      <input
                        type="checkbox"
                        checked={!tempHiddenColumns.has(col)}
                        onChange={() => toggleTempColumn(col)}
                      />
                      <span>{getColumnDisplayName(col)}</span>
                    </label>
                  ))}

                <div style={{ fontWeight: 600, fontSize: 12, color: '#666', margin: '12px 0 8px' }}>NOT VISIBLE</div>
                {columnOrder
                  .filter(col => tempHiddenColumns.has(col))
                  .filter(col => getColumnDisplayName(col).toLowerCase().includes(customizeSearch.toLowerCase()))
                  .map(col => (
                    <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                      <input
                        type="checkbox"
                        checked={!tempHiddenColumns.has(col)}
                        onChange={() => toggleTempColumn(col)}
                      />
                      <span>{getColumnDisplayName(col)}</span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="customize-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setIsCustomizeOpen(false)} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}>Cancel</button>
              <button onClick={saveCustomize} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {isAddCustomOpen && (
        <div onClick={() => setIsAddCustomOpen(false)} style={{ position: 'fixed', inset: 0 }}>
          <div className="customize-modal" onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: (customizePos?.y || 120) + 20, left: (customizePos?.x || (window.innerWidth - 380)), width: 360, background: '#fff', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', padding: 12 }}>
            <div className="customize-header">
              <h3>Add person field</h3>
            </div>
            <div className="customize-body" style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Field name (required)</span>
                <input
                  type="text"
                  value={newField.name}
                  onChange={e => setNewField(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter field name"
                  style={{ padding: '6px 8px' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Field type (required)</span>
                <select
                  value={newField.type}
                  onChange={e => setNewField(prev => ({ ...prev, type: e.target.value as any }))}
                  style={{ padding: '6px 8px' }}
                >
                  <option value="">Select type</option>
                  <option value="text">Text</option>
                  <option value="date">Date</option>
                  <option value="select">Single option</option>
                </select>
              </label>
            </div>
            <div className="customize-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setIsAddCustomOpen(false)} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4 }}>Cancel</button>
              <button onClick={saveCustomField} disabled={!newField.name || !newField.type} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, opacity: (!newField.name || !newField.type) ? 0.6 : 1 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            animation: 'fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              cancelDelete();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              cancelDelete();
            }
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              width: '100%',
              maxWidth: '480px',
              overflow: 'hidden',
              animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <h2
                  id="delete-confirm-title"
                  style={{
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: 600,
                    color: '#ffffff',
                    lineHeight: '1.2'
                  }}
                >
                  Confirm Deletion
                </h2>
              </div>
              <button
                onClick={cancelDelete}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  lineHeight: 1,
                  opacity: 0.8,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '16px',
                  color: '#374151',
                  lineHeight: '1.5'
                }}
              >
                {pendingBulkDelete ? (
                  <>
                    The selected <strong>{selectedPersons.size} person(s)</strong> will be deleted permanently. Do you want to continue?
                  </>
                ) : (
                  <>
                    This person will be deleted permanently. Do you want to continue?
                  </>
                )}
              </p>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                background: '#f9fafb'
              }}
            >
              <button
                onClick={cancelDelete}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#ffffff',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Success Confirmation Modal */}
      {showDeleteSuccess && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-success-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            animation: 'fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteSuccess(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowDeleteSuccess(false);
            }
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              width: '100%',
              maxWidth: '480px',
              overflow: 'hidden',
              animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h2
                  id="delete-success-title"
                  style={{
                    margin: 0,
                    fontSize: '20px',
                    fontWeight: 600,
                    color: '#ffffff',
                    lineHeight: '1.2'
                  }}
                >
                  Person Deleted Successfully!
                </h2>
              </div>
              <button
                onClick={() => setShowDeleteSuccess(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  lineHeight: 1,
                  opacity: 0.8,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '16px',
                  color: '#374151',
                  lineHeight: '1.5'
                }}
              >
                {deletedPersonsCount === 1 ? (
                  <>
                    Person has been deleted successfully!
                  </>
                ) : (
                  <>
                    <strong>{deletedPersonsCount} person(s)</strong> have been deleted successfully!
                  </>
                )}
              </p>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                background: '#f9fafb'
              }}
            >
              <button
                onClick={() => setShowDeleteSuccess(false)}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#ffffff',
                  backgroundColor: '#10b981',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Multi-Select Tooltip */}
      {tooltipContent && tooltipPosition && createPortal(
        <div
          className="multi-select-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            zIndex: 10000,
            pointerEvents: 'none'
          }}
        >
          {tooltipContent}
        </div>,
        document.body
      )}

      {/* Custom Date Range Modal */}
      {isDateRangeModalOpen && createPortal(
        <div
          onClick={() => setIsDateRangeModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#fff',
              padding: '24px',
              borderRadius: '8px',
              minWidth: '400px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
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
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
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
                  backgroundColor: (!dateRange.start || !dateRange.end) ? '#ccc' : '#10b981',
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
        </div>,
        document.body
      )}
    </div>
  );
}

