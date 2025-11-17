import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { personsApi } from '../services/api';
import type { Person, PersonFilters, FilterMeta, PersonFilterCondition, SavedPersonFilter } from '../types/person';
import FilterModal, { FilterCondition } from '../components/FilterModal';
import FilterChip from '../components/FilterChip';
import FilterDropdown from '../components/FilterDropdown';
import PersonDropdown from '../components/PersonDropdown';
import ColumnMenu from '../components/ColumnMenu';
import BulkEditModal from '../components/BulkEditModal';
import AddPersonModal from '../components/AddPersonModal';
import { clearAuthSession } from '../utils/authToken';
import './PersonsList.css';

const formatDateForInput = (ddMMyyyy?: string): string => {
  if (!ddMMyyyy) return '';
  const parts = ddMMyyyy.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

const formatDateFromInput = (yyyyMMdd: string): string => {
  const [y, m, d] = yyyyMMdd.split('-');
  return `${d}/${m}/${y}`;
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

export default function PersonsList() {
  const navigate = useNavigate();
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PersonFilters>({ page: 0, size: 25 });
  const [filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedPersonFilter[]>([]);
  const [customFiltersLoading, setCustomFiltersLoading] = useState(false);
  const [activeCustomFilters, setActiveCustomFilters] = useState<PersonFilterCondition[]>([]);
  const [activeFilterName, setActiveFilterName] = useState<string | null>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
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
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [customizePos, setCustomizePos] = useState<{ x: number; y: number } | null>(null);
  const [tempHiddenColumns, setTempHiddenColumns] = useState<Set<string>>(new Set());
  const [rowMenu, setRowMenu] = useState<{ rowId: number; x: number; y: number } | null>(null);
  const [customizeSearch, setCustomizeSearch] = useState('');
  const [isAddCustomOpen, setIsAddCustomOpen] = useState(false);
  const [newField, setNewField] = useState<{ name: string; type: 'text' | 'date' | 'select' | '' }>({ name: '', type: '' });
  // Draggable column order (excludes the checkbox column)
  const defaultColumnsOrder = ['name','instagramId','source','phone','label','organization','manager','leadDate'];
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnsOrder);
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

  // Predefined system filters
  const systemFilters: Array<SavedPersonFilter & { isSystem: boolean }> = [
    { name: 'Person Lead Date today', conditions: [] as PersonFilterCondition[], isSystem: true },
    { name: 'Person Lead Date this week', conditions: [] as PersonFilterCondition[], isSystem: true },
    { name: 'Person Lead Date this month', conditions: [] as PersonFilterCondition[], isSystem: true },
    { name: 'Person Lead Date yesterday', conditions: [] as PersonFilterCondition[], isSystem: true },
    { name: 'Person created this month', conditions: [] as PersonFilterCondition[], isSystem: true },
    { name: 'Person created last month', conditions: [] as PersonFilterCondition[], isSystem: true },
  ];

  useEffect(() => {
    loadFilterMeta();
  }, []);

  const loadCustomFilters = async () => {
    setCustomFiltersLoading(true);
    try {
      const customFilters = await personsApi.listCustomFilters();
      setSavedFilters(customFilters);
    } catch (error) {
      console.error('Failed to load saved filters:', error);
    } finally {
      setCustomFiltersLoading(false);
    }
  };

  useEffect(() => {
    loadCustomFilters();
  }, []);

  useEffect(() => {
    console.log('Filters changed, loading persons...', filters);
    loadPersons();
  }, [filters]);

  // Note: Custom filters are applied when saved, they work alongside manual filters
  // Manual filters from dropdowns take precedence

  const loadFilterMeta = async () => {
    try {
      const meta = await personsApi.getFilters();
      setFilterMeta(meta);
    } catch (error) {
      console.error('Failed to load filter metadata:', error);
    }
  };

  const loadPersons = async () => {
    setLoading(true);
    try {
      console.log('Loading persons with filters:', filters);
      const response = await personsApi.list(filters);
      console.log('Persons API response:', {
        totalElements: response.totalElements,
        totalPages: response.totalPages,
        contentLength: response.content?.length || 0,
        firstPerson: response.content?.[0]?.name || 'none'
      });
      setPersons(response.content);
      setTotalPages(response.totalPages);
      setCurrentPage(response.number);
    } catch (error) {
      console.error('Failed to load persons:', error);
      if ((error as any)?.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login', { replace: true });
  };

  const handleFilterChange = (key: keyof PersonFilters, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined, page: 0 }));
    setCurrentPage(0);
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
    setCurrentPage(newPage);
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
          if (condition.operator === 'equals') customFilters.category = value;
          break;
        case 'organization':
          if (condition.operator === 'equals') customFilters.organization = value;
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
    setActiveFilterName(filterName);
    applyFilterConditions(payload);
    setSavedFilters(prev => {
      const others = prev.filter(filter => filter.name !== filterName);
      return [...others, { name: filterName, conditions: payload }];
    });

    void personsApi.saveCustomFilter(filterName, payload)
      .then(() => loadCustomFilters())
      .catch(error => {
        console.error('Failed to save custom filter:', error);
      });
  };

  const handleSelectFilter = (filter: SavedPersonFilter & { isSystem?: boolean }) => {
    const conditions = filter.conditions || [];
    setActiveFilterName(filter.name);
    setActiveCustomFilters(conditions);
    applyFilterConditions(conditions);
    setIsFilterDropdownOpen(false);
  };

  const handleRemoveCustomFilter = () => {
    setFilters(prev => {
      const next: PersonFilters = { ...prev };
      activeCustomFilters.forEach(condition => {
        const value = normalizeConditionValue(condition.field, condition.value);
        switch (condition.field) {
          case 'category':
            if (next.category === value) delete next.category;
            break;
          case 'organization':
            if (next.organization === value) delete next.organization;
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
    setActiveFilterName(null);
    // Don't clear manual filters, just remove custom filter chips
  };

  const handleDeleteFilter = (filterName: string) => {
    setSavedFilters(prev => prev.filter(filter => filter.name !== filterName));
    if (activeFilterName === filterName) {
      setActiveCustomFilters([]);
      setActiveFilterName(null);
    }
    void personsApi.deleteCustomFilter(filterName)
      .then(() => loadCustomFilters())
      .catch(error => {
        console.error('Failed to delete custom filter:', error);
      });
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
    label: filterMeta.labelOptions?.map(option => option.code) || [],
    source: filterMeta.sourceOptions?.map(option => option.code) || [],
    category: filterMeta.categories,
    organization: filterMeta.organizations,
    manager: filterMeta.managers,
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
      size: filters.size || 25
    };
    
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
      phone: 'Phone',
      category: 'Category',
      organization: 'Organization',
      manager: 'Manager',
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

  const handleDeleteRow = async (id: number) => {
    if (!confirm('Delete this person?')) return;
    try {
      await personsApi.delete(id);
      closeRowMenu();
      loadPersons();
    } catch (err) {
      alert('Failed to delete.');
    }
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
    { field: 'source', label: 'Person Source', type: 'select' as const, options: filterMeta.sourceOptions?.map(option => option.code) || [] },
  ] : [];

  return (
    <div className="persons-list-container">
      <header className="persons-header">
        <h1>Persons</h1>
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
          <div className="filter-button-container">
          <div 
            className="filter-button" 
            onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
          >
            <span className="filter-button-icon">🔽</span>
            <span>Filters</span>
            {customFiltersLoading && <span className="filter-loading" title="Refreshing filters">⏳</span>}
          </div>
          {isFilterDropdownOpen && (
            <>
              <div 
                className="filter-dropdown-overlay" 
                onClick={() => setIsFilterDropdownOpen(false)}
              />
              <FilterDropdown
                savedFilters={[...systemFilters, ...savedFilters]}
                activeFilterName={activeFilterName}
                onSelectFilter={(filter) => {
                  if (!filter.isSystem) {
                    handleSelectFilter(filter);
                  } else {
                    // Handle system filters (placeholder for now)
                    alert(`System filter "${filter.name}" - to be implemented`);
                  }
                }}
                onAddNewFilter={() => {
                  setIsFilterDropdownOpen(false);
                  setIsFilterModalOpen(true);
                }}
                onRemoveFilter={handleDeleteFilter}
              />
            </>
          )}
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
            if (confirm(`Delete ${selectedPersons.size} person(s)?`)) {
              personsApi.bulkDelete(Array.from(selectedPersons)).then(() => {
                setSelectedPersons(new Set());
                loadPersons();
              });
            }
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
            <div className="filter-group">
              <select
                value={filters.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                className="filter-select"
              >
                <option value="">All Categories</option>
                {filterMeta.categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <select
                value={filters.organization || ''}
                onChange={(e) => handleFilterChange('organization', e.target.value)}
                className="filter-select"
              >
                <option value="">All Organizations</option>
                {filterMeta.organizations.map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <select
                value={filters.manager || ''}
                onChange={(e) => handleFilterChange('manager', e.target.value)}
                className="filter-select"
              >
                <option value="">All Managers</option>
                {filterMeta.managers.map(mgr => (
                  <option key={mgr} value={mgr}>{mgr}</option>
                ))}
              </select>
            </div>

            {filterMeta.labelOptions && (
              <div className="filter-group">
                <select
                  value={filters.label || ''}
                  onChange={(e) => handleFilterChange('label', e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Labels</option>
                  {filterMeta.labelOptions.map(option => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}

            {filterMeta.sourceOptions && (
              <div className="filter-group">
                <select
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

        <div className="filter-group">
          <input
            type="date"
            placeholder="Date"
            value={formatDateForInput(filters.dateFrom)}
            onChange={(e) => {
              const date = e.target.value;
              handleFilterChange('dateFrom', date ? formatDateFromInput(date) : undefined);
            }}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <input
            type="text"
            placeholder="Search..."
            value={filters.q || ''}
            onChange={(e) => handleFilterChange('q', e.target.value)}
            className="search-input"
          />
        </div>

        <button onClick={() => loadPersons()} className="search-button">
          Search
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
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
              {persons.map(person => (
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
                              const val = (person as any)?.source || (person as any)?.email || '';
                              return val ? (
                                <span style={getSourceStyle(val)}>{val}</span>
                              ) : '-';
                            }
                            case 'phone': return person.phone || '-';
                            case 'category': return person.category || '-';
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
              ))}
            </tbody>
          </table>

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

          <div className="pagination">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 0}
            >
              Previous
            </button>
            <span>Page {currentPage + 1} of {totalPages}</span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
            >
              Next
            </button>
          </div>
        </>
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
        onClose={() => setIsAddPersonOpen(false)}
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
    </div>
  );
}

