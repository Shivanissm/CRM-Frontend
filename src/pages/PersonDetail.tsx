import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { personsApi } from '../services/api';
import { organizationsApi } from '../services/organizations';
import { dealsApi } from '../services/deals';
import { activitiesApi, type Activity } from '../services/activities';
import { clearAuthSession } from '../utils/authToken';
import type { PersonSummary, PersonRequest, PersonOwner, PersonLabelOption, PersonSourceOption, FilterMeta } from '../types/person';
import type { Organization } from '../types/organization';
import type { Deal } from '../types/deal';
import ActivityModal, { type ActivityFormValues } from '../components/ActivityModal';
import './PersonDetail.css';

type ActiveTab = 'Activity' | 'Notes' | 'Meeting scheduler' | 'Call' | 'Email' | 'Send quote' | 'Send Contract' | 'Share Worklinks';

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PersonSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('Activity');
  const [filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [owners, setOwners] = useState<PersonOwner[]>([]);
  const [labels, setLabels] = useState<PersonLabelOption[]>([]);
  const [sources, setSources] = useState<PersonSourceOption[]>([]);

  // Collapsible sections state
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [weddingDetailsExpanded, setWeddingDetailsExpanded] = useState(true);
  const [organizationExpanded, setOrganizationExpanded] = useState(true);
  const [dealsExpanded, setDealsExpanded] = useState(false);
  const [focusExpanded, setFocusExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [weddingDetailsMenuOpen, setWeddingDetailsMenuOpen] = useState(false);
  const [showOnlyFilledFields, setShowOnlyFilledFields] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [weddingDatePickerOpen, setWeddingDatePickerOpen] = useState(false);
  const [leadDatePickerOpen, setLeadDatePickerOpen] = useState(false);
  const [weddingDateCalendarMonth, setWeddingDateCalendarMonth] = useState(new Date());
  const [leadDateCalendarMonth, setLeadDateCalendarMonth] = useState(new Date());
  const [labelsDropdownOpen, setLabelsDropdownOpen] = useState(false);
  const [orgLabelsDropdownOpen, setOrgLabelsDropdownOpen] = useState(false);
  const [newLabelModalOpen, setNewLabelModalOpen] = useState(false);
  const [labelSearchQuery, setLabelSearchQuery] = useState('');
  const [orgLabelSearchQuery, setOrgLabelSearchQuery] = useState('');
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#FFC107');
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);

  // Form state
  const [formData, setFormData] = useState<PersonRequest & { 
    firstName?: string;
    lastName?: string;
    weddingDate?: string;
    weddingVenue?: string;
    weddingItinerary?: string;
    organizationAddress?: string;
  }>({
    name: '',
    phone: '',
    email: '',
    instagramId: '',
    label: '',
    source: '',
    leadDate: '',
    firstName: '',
    lastName: '',
    weddingDate: '',
    weddingVenue: '',
    weddingItinerary: '',
    organizationAddress: '',
  });

  useEffect(() => {
    if (id) {
      loadPersonData(Number(id));
      loadActivities(Number(id));
      loadPersonDeals(Number(id));
    }
  }, [id]);

  useEffect(() => {
    loadDropdownData();
  }, []);

  const loadDropdownData = async () => {
    try {
      const [meta, orgs, ownerOptions, labelOptions, sourceOptions] = await Promise.all([
        personsApi.getFilters(),
        organizationsApi.list(),
        personsApi.listOwners(),
        personsApi.listLabels(),
        personsApi.listSources(),
      ]);
      setFilterMeta(meta);
      setOrganizations(orgs);
      setOwners(ownerOptions);
      setLabels(labelOptions);
      setSources(sourceOptions);
    } catch (error) {
      console.error('Failed to load dropdown data:', error);
    }
  };

  const loadPersonData = async (personId: number) => {
    setLoading(true);
    try {
      const data = await personsApi.getSummary(personId);
      setSummary(data);
      const person = data.person;
      
      // Extract first name from full name
      const nameParts = (person.name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Pre-fill form with person data
      setFormData({
        name: person.name || '',
        phone: person.phone || '',
        email: person.email || '',
        instagramId: person.instagramId || '',
        label: person.label || '',
        source: person.source || '',
        leadDate: person.leadDate ? formatDateForInput(person.leadDate) : '',
        organizationId: person.organizationId || undefined,
        ownerId: person.ownerId || undefined,
        firstName: firstName,
        lastName: lastName,
        weddingDate: '', // Would come from extended person data if available
        weddingVenue: '', // Would come from extended person data if available
        weddingItinerary: '', // Would come from extended person data if available
        organizationAddress: '',
      });
    } catch (error) {
      console.error('Failed to load person summary:', error);
      if ((error as any)?.response?.status === 401) {
        clearAuthSession();
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDateForInput = (dateStr: string): string => {
    // Convert dd/MM/yyyy or yyyy-MM-dd to yyyy-MM-dd
    if (dateStr.includes('/')) {
      const [d, m, y] = dateStr.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return dateStr;
  };

  const formatDateForDisplay = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
      let date: Date;
      if (dateStr.includes('/')) {
        const [d, m, y] = dateStr.split('/');
        date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      } else if (dateStr.includes('-')) {
        date = new Date(dateStr);
      } else {
        return dateStr;
      }
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatDateDDMMYYYY = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatDateYYYYMMDD = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Load all deals for this person
  const loadPersonDeals = async (personId: number) => {
    try {
      const response = await dealsApi.list({ personId, page: 0, size: 100 });
      setDeals(response.content || []);
    } catch (error) {
      console.error('Failed to load person deals:', error);
    }
  };

  // Load activities for this person (from all their deals)
  const loadActivities = async (personId: number) => {
    setLoadingActivities(true);
    try {
      const response = await activitiesApi.list({ personId, page: 0, size: 1000 });
      // Filter to ensure only activities for this person are shown
      const personActivities = (response.content || []).filter(
        (activity) => activity.personId === personId
      );
      setActivities(personActivities);
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoadingActivities(false);
    }
  };

  // Parse date string (handles dd/MM/yyyy and ISO formats)
  const parseActivityDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    
    // Try parsing dd/MM/yyyy format
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const [dd, mm, yyyy] = parts.map(Number);
        const date = new Date(yyyy, mm - 1, dd);
        if (!isNaN(date.getTime())) return date;
      }
    }
    
    // Try ISO format
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
    
    return null;
  };

  // Format date for display
  const formatActivityDate = (dateStr: string | null | undefined): string => {
    const date = parseActivityDate(dateStr);
    if (!date) return dateStr || '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Check if activity is today
  const isToday = (dateStr: string | null | undefined): boolean => {
    const date = parseActivityDate(dateStr);
    if (!date) return false;
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Check if activity is in the past
  const isPast = (dateStr: string | null | undefined): boolean => {
    const date = parseActivityDate(dateStr);
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Check if activity is in the future
  const isFuture = (dateStr: string | null | undefined): boolean => {
    const date = parseActivityDate(dateStr);
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date > today;
  };

  // Get activity color class based on date
  const getActivityColorClass = (activity: Activity): string => {
    const dateStr = activity.createdAt || activity.date || activity.dueDate;
    if (isToday(dateStr)) return 'deal-activity-today';
    if (isPast(dateStr)) return 'deal-activity-past';
    return 'deal-activity-future';
  };

  // Get focus activities (not done)
  const getFocusActivities = useMemo(() => {
    return activities.filter((activity) => !activity.done);
  }, [activities]);

  // Get history activities (done)
  const getHistoryActivities = useMemo(() => {
    return activities.filter((activity) => activity.done);
  }, [activities]);

  // Mark activity as done and move to history (or undo and move back to focus)
  const markActivityDone = async (activityId: number, done: boolean) => {
    try {
      await activitiesApi.markDone(activityId, done);
      // Reload activities to get updated status
      if (id) {
        await loadActivities(Number(id));
      }
      setOpenMenuId(null); // Close menu after action
    } catch (error) {
      console.error('Failed to update activity:', error);
      alert('Failed to update activity');
    }
  };

  // Delete activity
  const handleDeleteActivity = async (activityId: number) => {
    if (!confirm('Are you sure you want to delete this activity?')) {
      return;
    }
    try {
      await activitiesApi.delete(activityId);
      // Reload activities after deletion
      if (id) {
        await loadActivities(Number(id));
      }
      setOpenMenuId(null); // Close menu after deletion
    } catch (error) {
      console.error('Failed to delete activity:', error);
      alert('Failed to delete activity');
    }
  };

  // Handle menu click
  const handleMenuClick = (e: React.MouseEvent, activityId: number) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === activityId ? null : activityId);
  };

  // Close menu when clicking outside
  useEffect(() => {
    if (openMenuId === null) return;
    
    const handleClickOutside = () => {
      setOpenMenuId(null);
    };
    
    // Use setTimeout to avoid immediate closure when clicking the menu button
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openMenuId]);

  // Handle activity creation
  const handleCreateActivity = async (values: ActivityFormValues) => {
    try {
      const activityData: any = {
        subject: values.subject || '',
        description: values.description || '',
        category: values.category || 'ACTIVITY',
        type: values.type || null,
        priority: values.priority ? values.priority.toUpperCase() : null,
        personId: id ? Number(id) : null,
        dealId: values.dealId || null,
        organizationId: values.organizationId || null,
        assignedUserId: values.assignedUser ? Number(values.assignedUser) : null,
        date: values.date || null,
        dueDate: values.date || null,
      };

      await activitiesApi.create(activityData);
      setIsActivityModalOpen(false);
      
      // Reload activities
      if (id) {
        await loadActivities(Number(id));
      }
    } catch (error) {
      console.error('Failed to create activity:', error);
      alert('Failed to create activity');
    }
  };

  const parseDateDDMMYYYY = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    // Try DD/MM/YYYY format first
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const [dd, mm, yyyy] = parts.map(Number);
        return new Date(yyyy, mm - 1, dd);
      }
    }
    // Try YYYY-MM-DD format (ISO)
    if (dateStr.includes('-')) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return null;
  };

  const getDateForDisplay = (dateStr?: string): string => {
    if (!dateStr) return '';
    const date = parseDateDDMMYYYY(dateStr);
    if (!date) return dateStr;
    return formatDateDDMMYYYY(date);
  };

  const getCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    const days = [];
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(year, month - 1, prevMonthLastDay - i));
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push(new Date(year, month + 1, i));
    }
    return days;
  };

  const isFieldFilled = (value: string | undefined): boolean => {
    return !!value && value.trim() !== '';
  };

  const shouldShowField = (value: string | undefined): boolean => {
    if (!showOnlyFilledFields) return true; // Show all fields
    return isFieldFilled(value); // Show only filled fields
  };

  const handleFieldChange = (field: keyof typeof formData, value: string | number | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!id || !formData.name.trim()) {
      alert('Name is required');
      return;
    }

    setSaving(true);
    try {
      const payload: PersonRequest = {
        name: formData.name.trim(),
        organizationId: formData.organizationId,
        ownerId: formData.ownerId,
        phone: formData.phone?.trim() || undefined,
        email: formData.email?.trim() || undefined,
        instagramId: formData.instagramId?.trim() || undefined,
        leadDate: formData.leadDate || undefined,
        label: formData.label || undefined,
        source: formData.source || undefined,
      };

      await personsApi.update(Number(id), payload);
      // Reload data after save
      await loadPersonData(Number(id));
      alert('Person updated successfully!');
    } catch (error: any) {
      console.error('Failed to save person:', error);
      alert(`Failed to save: ${error?.response?.data?.message || error?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (id) {
      loadPersonData(Number(id));
    }
  };

  if (loading) {
    return <div className="person-detail-loading">Loading...</div>;
  }

  if (!summary) {
    return <div className="person-detail-error">Person not found</div>;
  }

  const { person, dealsCount } = summary;
  const selectedOrganization = organizations.find(org => org.id === formData.organizationId);

  const labelColors = [
    '#2196F3', // Blue
    '#4CAF50', // Mint green
    '#FFC107', // Yellow
    '#F44336', // Red
    '#9C27B0', // Purple
    '#9E9E9E', // Light gray
    '#795548', // Brown
    '#FF9800', // Orange
    '#424242', // Dark gray
    '#E91E63', // Pink
  ];

  // Color mapping for labels (you can extend this based on label codes)
  const getLabelColor = (labelCode: string): string => {
    const colorMap: Record<string, string> = {
      'CUSTOMER': '#4CAF50',      // Mint green
      'HOT_LEAD': '#F44336',      // Red
      'WARM_LEAD': '#FFC107',     // Yellow
      'COLD_LEAD': '#2196F3',     // Blue
      'NO_RESPONSE': '#9C27B0',   // Purple
      'PLANNER': '#FF9800',       // Orange (different from yellow)
      'WEDDING': '#9E9E9E',       // Light gray
      'PRE_WEDDING': '#E91E63',   // Pink
    };
    return colorMap[labelCode] || '#1976d2';
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    
    try {
      // Create new label via API
      const newLabel: PersonLabelOption = {
        code: newLabelName.toUpperCase().replace(/\s+/g, '_'),
        label: newLabelName,
      };
      
      // Add to labels list (you may need to call an API endpoint to create the label)
      // Note: The API might need to be updated to support creating labels with colors
      setLabels([...labels, newLabel]);
      setNewLabelName('');
      setNewLabelColor('#FFC107');
      setNewLabelModalOpen(false);
      
      // Optionally select the newly created label
      handleFieldChange('label', newLabel.code);
    } catch (error) {
      console.error('Failed to create label:', error);
      alert('Failed to create label');
    }
  };


  // Navigate to deal creation page with person data
  const handleCreateDeal = () => {
    if (!id || !summary?.person) {
      alert('Person information not available');
      return;
    }

    // Navigate to deal creation page with personId as query parameter
    navigate(`/deals/new?personId=${id}`);
  };

  return (
    <div className="person-detail-container">
      {/* Top Header Bar - Full Width */}
      <div className="person-detail-header-bar">
        <div className="person-header-left">
          <div className="person-header-icon">👤</div>
          <input
            type="text"
            className="person-header-name-input"
            value={formData.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            placeholder="Full Name"
          />
        </div>
        <div className="person-header-right">
          <div className="person-deal-button-container">
            <button 
              className="person-deal-button"
              onClick={handleCreateDeal}
              disabled={!id || !summary?.person}
              title="Convert this person to a deal"
            >
              + Deal
              <span>▼</span>
            </button>
          </div>
          <button className="person-close-button" onClick={() => navigate('/persons')}>
            ×
          </button>
        </div>
      </div>

      {/* Main Content - Two Halves */}
      <div className="person-detail-main">
        {/* Left Sidebar */}
        <div className="person-detail-left">

        {/* Summary Section */}
        <div className="person-section">
          <div className="person-section-header" onClick={() => setSummaryExpanded(!summaryExpanded)}>
            <span className="person-section-title">
              {summaryExpanded ? '▼' : '▶'} Summary
            </span>
          </div>
          {summaryExpanded && (
            <div className="person-section-content">
              <div className="person-field-row">
                <div className="person-labels-container">
                  <button 
                    className="person-add-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLabelsDropdownOpen(!labelsDropdownOpen);
                    }}
                  >
                    <span>🏷️</span> Add labels
                  </button>
                  {labelsDropdownOpen && (
                    <>
                      <div 
                        className="person-labels-overlay"
                        onClick={() => setLabelsDropdownOpen(false)}
                      />
                      <div className="person-labels-dropdown">
                        <div className="person-labels-search">
                          <span className="person-labels-search-icon">🔍</span>
                          <input
                            type="text"
                            placeholder="Search for labels"
                            value={labelSearchQuery}
                            onChange={(e) => setLabelSearchQuery(e.target.value)}
                            className="person-labels-search-input"
                          />
                        </div>
                        <div className="person-labels-list">
                          {[
                            { code: 'CUSTOMER', label: 'CUSTOMER', color: '#4CAF50' },
                            { code: 'HOT_LEAD', label: 'HOT LEAD', color: '#F44336' },
                            { code: 'WARM_LEAD', label: 'WARM LEAD', color: '#FFC107' },
                            { code: 'COLD_LEAD', label: 'COLD LEAD', color: '#2196F3' },
                            { code: 'NO_RESPONSE', label: 'NO RESPONSE', color: '#9C27B0' },
                            { code: 'PLANNER', label: 'PLANNER', color: '#FF9800' },
                            { code: 'WEDDING', label: 'WEDDING', color: '#9E9E9E' },
                            { code: 'PRE_WEDDING', label: 'PRE WEDDING', color: '#E91E63' },
                          ]
                            .filter(label => 
                              label.label.toLowerCase().includes(labelSearchQuery.toLowerCase())
                            )
                            .map((label) => (
                              <div
                                key={label.code}
                                className="person-label-item"
                                style={{ backgroundColor: label.color }}
                                onClick={() => {
                                  handleFieldChange('label', label.code);
                                  setLabelsDropdownOpen(false);
                                  setLabelSearchQuery('');
                                }}
                              >
                                {label.label}
                              </div>
                            ))}
                        </div>
                        <button
                          className="person-add-label-button"
                          onClick={() => {
                            setLabelsDropdownOpen(false);
                            setNewLabelModalOpen(true);
                          }}
                        >
                          <span>+</span> Add label
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="person-field-row">
                {editingField === 'email' ? (
                  <input
                    type="email"
                    className="person-field-input"
                    value={formData.email || ''}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setEditingField(null);
                      }
                    }}
                    autoFocus
                  />
                ) : formData.email ? (
                  <div className="person-field-display">
                    <span className="person-field-icon">✉️</span>
                    <span className="person-field-value">{formData.email}</span>
                  </div>
                ) : (
                  <button 
                    className="person-add-button"
                    onClick={() => setEditingField('email')}
                  >
                    <span>✉️</span> Add email
                  </button>
                )}
              </div>
              <div className="person-field-row">
                {editingField === 'phone' ? (
                  <input
                    type="tel"
                    className="person-field-input"
                    value={formData.phone || ''}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setEditingField(null);
                      }
                    }}
                    autoFocus
                  />
                ) : formData.phone ? (
                  <div className="person-field-display">
                    <span className="person-field-icon">📞</span>
                    <span className="person-field-value">{formData.phone}</span>
                  </div>
                ) : (
                  <button 
                    className="person-add-button"
                    onClick={() => setEditingField('phone')}
                  >
                    <span>📞</span> Add phone
                  </button>
                )}
              </div>
              <div className="person-field-row">
                {editingField === 'summaryOrganization' ? (
                  <select
                    className="person-field-input"
                    value={formData.organizationId || ''}
                    onChange={(e) => handleFieldChange('organizationId', e.target.value ? Number(e.target.value) : undefined)}
                    onBlur={() => setEditingField(null)}
                    autoFocus
                  >
                    <option value=""></option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                ) : selectedOrganization ? (
                  <div className="person-field-display">
                    <span className="person-field-icon">+</span>
                    <span className="person-field-value">{selectedOrganization.name}</span>
                  </div>
                ) : (
                  <button 
                    className="person-add-button"
                    onClick={() => setEditingField('summaryOrganization')}
                  >
                    <span>+</span> Organization
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Wedding Details Section */}
        <div className="person-section">
          <div className="person-section-header">
            <span 
              className="person-section-title"
              onClick={() => setWeddingDetailsExpanded(!weddingDetailsExpanded)}
            >
              {weddingDetailsExpanded ? '▼' : '▶'} Wedding Details
            </span>
            <div className="person-section-actions">
              <div className="person-section-menu-container">
                <span 
                  className="person-section-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setWeddingDetailsMenuOpen(!weddingDetailsMenuOpen);
                  }}
                >
                  ☰
                </span>
                {weddingDetailsMenuOpen && (
                  <>
                    <div 
                      className="person-section-menu-overlay"
                      onClick={() => setWeddingDetailsMenuOpen(false)}
                    />
                    <div className="person-section-menu">
                      <div 
                        className="person-section-menu-item"
                        onClick={() => {
                          setShowOnlyFilledFields(false);
                          setWeddingDetailsMenuOpen(false);
                        }}
                        title="Show all fields"
                      >
                        Show all fields
                      </div>
                      <div 
                        className="person-section-menu-item"
                        onClick={() => {
                          setShowOnlyFilledFields(true);
                          setWeddingDetailsMenuOpen(false);
                        }}
                        title="Show only filled fields"
                      >
                        Show only filled fields
                      </div>
                    </div>
                  </>
                )}
            </div>
              <span className="person-section-icon">✏️</span>
              <span className="person-section-icon">⋯</span>
            </div>
          </div>
          {weddingDetailsExpanded && (
            <div className="person-section-content">
              {(shouldShowField(formData.firstName) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">First name</label>
                  {editingField === 'firstName' ? (
                    <input
                      type="text"
                      className="person-field-input"
                      value={formData.firstName || ''}
                      onChange={(e) => handleFieldChange('firstName', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      className="person-field-value person-field-clickable"
                      onClick={() => setEditingField('firstName')}
                    >
                      {formData.firstName || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.weddingDate) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Wedding Date only</label>
                  <div className="person-field-with-edit">
                    {editingField === 'weddingDate' || weddingDatePickerOpen ? (
                      <div className="person-date-input-container">
                        <input
                          type="text"
                          className="person-field-input"
                          placeholder=""
                          value={getDateForDisplay(formData.weddingDate)}
                          onChange={(e) => {
                            const parsed = parseDateDDMMYYYY(e.target.value);
                            if (parsed) {
                              handleFieldChange('weddingDate', formatDateYYYYMMDD(parsed));
                              setWeddingDateCalendarMonth(parsed);
                            }
                          }}
                          onFocus={() => setWeddingDatePickerOpen(true)}
                          autoFocus
                        />
                        <span className="person-edit-icon">✏️</span>
                        {weddingDatePickerOpen && (
                          <>
                            <div 
                              className="person-date-picker-overlay"
                              onClick={() => {
                                setWeddingDatePickerOpen(false);
                                setEditingField(null);
                              }}
                            />
                            <div className="person-date-picker">
                              <div className="person-date-picker-header">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const prev = new Date(weddingDateCalendarMonth);
                                    prev.setMonth(prev.getMonth() - 1);
                                    setWeddingDateCalendarMonth(prev);
                                  }}
                                  className="person-date-picker-nav"
                                >
                                  ▲
                                </button>
                                <div className="person-date-picker-month">
                                  {weddingDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                  <span className="person-date-picker-dropdown">▼</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = new Date(weddingDateCalendarMonth);
                                    next.setMonth(next.getMonth() + 1);
                                    setWeddingDateCalendarMonth(next);
                                  }}
                                  className="person-date-picker-nav"
                                >
                                  ▼
                                </button>
                              </div>
                              <div className="person-date-picker-weekdays">
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                  <div key={idx} className="person-date-picker-weekday">{day}</div>
                                ))}
                              </div>
                              <div className="person-date-picker-days">
                                {getCalendarDays(weddingDateCalendarMonth).map((day, idx) => {
                                  const isCurrentMonth = day.getMonth() === weddingDateCalendarMonth.getMonth();
                                  const isSelected = formData.weddingDate && formatDateYYYYMMDD(day) === formData.weddingDate;
                                  const isToday = formatDateYYYYMMDD(day) === formatDateYYYYMMDD(new Date());
                                  return (
                                    <div
                                      key={idx}
                                      className={`person-date-picker-day ${isCurrentMonth ? '' : 'other-month'} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                                      onClick={() => {
                                        handleFieldChange('weddingDate', formatDateYYYYMMDD(day));
                                        setWeddingDatePickerOpen(false);
                                        setEditingField(null);
                                      }}
                                    >
                                      {day.getDate()}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="person-date-picker-footer">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleFieldChange('weddingDate', undefined);
                                    setWeddingDatePickerOpen(false);
                                    setEditingField(null);
                                  }}
                                  className="person-date-picker-clear"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const today = new Date();
                                    handleFieldChange('weddingDate', formatDateYYYYMMDD(today));
                                    setWeddingDateCalendarMonth(today);
                                    setWeddingDatePickerOpen(false);
                                    setEditingField(null);
                                  }}
                                  className="person-date-picker-today"
                                >
                                  Today
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <span 
                        className="person-field-value person-field-clickable"
                        onClick={() => {
                          setEditingField('weddingDate');
                          setWeddingDatePickerOpen(true);
                          if (formData.weddingDate) {
                            const date = parseDateDDMMYYYY(formData.weddingDate);
                            if (date) {
                              setWeddingDateCalendarMonth(date);
                            }
                          }
                        }}
                      >
                        {getDateForDisplay(formData.weddingDate) || ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {(shouldShowField(formData.weddingVenue) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Wedding Venue</label>
                  {editingField === 'weddingVenue' ? (
                    <input
                      type="text"
                      className="person-field-input"
                      value={formData.weddingVenue || ''}
                      onChange={(e) => handleFieldChange('weddingVenue', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      className="person-field-value person-field-clickable"
                      onClick={() => setEditingField('weddingVenue')}
                    >
                      {formData.weddingVenue || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.lastName) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Last name</label>
                  {editingField === 'lastName' ? (
                    <input
                      type="text"
                      className="person-field-input"
                      value={formData.lastName || ''}
                      onChange={(e) => handleFieldChange('lastName', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      className="person-field-value person-field-clickable"
                      onClick={() => setEditingField('lastName')}
                    >
                      {formData.lastName || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.weddingItinerary) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Wedding Itinerary</label>
                  {editingField === 'weddingItinerary' ? (
                    <input
                      type="text"
                      className="person-field-input"
                      value={formData.weddingItinerary || ''}
                      onChange={(e) => handleFieldChange('weddingItinerary', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      className="person-field-value person-field-clickable"
                      onClick={() => setEditingField('weddingItinerary')}
                    >
                      {formData.weddingItinerary || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.instagramId) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Instagram ID</label>
                  {editingField === 'instagramId' ? (
                    <input
                      type="text"
                      className="person-field-input"
                      value={formData.instagramId || ''}
                      onChange={(e) => handleFieldChange('instagramId', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      className="person-field-value person-field-clickable"
                      onClick={() => setEditingField('instagramId')}
                    >
                      {formData.instagramId || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.source) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Person Source</label>
                  {editingField === 'source' ? (
                    <select
                      className="person-field-input"
                      value={formData.source || ''}
                      onChange={(e) => handleFieldChange('source', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      autoFocus
                    >
                      <option value=""></option>
                      {sources.map((option) => (
                        <option key={option.code} value={option.code}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span 
                      className="person-field-value person-field-clickable"
                      onClick={() => setEditingField('source')}
                    >
                      {formData.source ? (
                        <span className="person-source-badge">{sources.find(s => s.code === formData.source)?.label || formData.source}</span>
                      ) : (
                        ''
                      )}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.leadDate) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Lead Date</label>
                  {editingField === 'leadDate' || leadDatePickerOpen ? (
                    <div className="person-date-input-container">
                      <input
                        type="text"
                        className="person-field-input"
                        placeholder="dd/mm/yyyy"
                        value={getDateForDisplay(formData.leadDate)}
                        onChange={(e) => {
                          const parsed = parseDateDDMMYYYY(e.target.value);
                          if (parsed) {
                            handleFieldChange('leadDate', formatDateYYYYMMDD(parsed));
                            setLeadDateCalendarMonth(parsed);
                          }
                        }}
                        onFocus={() => setLeadDatePickerOpen(true)}
                        autoFocus
                      />
                      {leadDatePickerOpen && (
                        <>
                          <div 
                            className="person-date-picker-overlay"
                            onClick={() => {
                              setLeadDatePickerOpen(false);
                              setEditingField(null);
                            }}
                          />
                          <div className="person-date-picker">
                            <div className="person-date-picker-header">
                              <button
                                type="button"
                                onClick={() => {
                                  const prev = new Date(leadDateCalendarMonth);
                                  prev.setMonth(prev.getMonth() - 1);
                                  setLeadDateCalendarMonth(prev);
                                }}
                                className="person-date-picker-nav"
                              >
                                ▲
                              </button>
                              <div className="person-date-picker-month">
                                {leadDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                <span className="person-date-picker-dropdown">▼</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = new Date(leadDateCalendarMonth);
                                  next.setMonth(next.getMonth() + 1);
                                  setLeadDateCalendarMonth(next);
                                }}
                                className="person-date-picker-nav"
                              >
                                ▼
                              </button>
                            </div>
                            <div className="person-date-picker-weekdays">
                              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                <div key={idx} className="person-date-picker-weekday">{day}</div>
                              ))}
                            </div>
                            <div className="person-date-picker-days">
                              {getCalendarDays(leadDateCalendarMonth).map((day, idx) => {
                                const isCurrentMonth = day.getMonth() === leadDateCalendarMonth.getMonth();
                                const isSelected = formData.leadDate && formatDateYYYYMMDD(day) === formData.leadDate;
                                const isToday = formatDateYYYYMMDD(day) === formatDateYYYYMMDD(new Date());
                                return (
                                  <div
                                    key={idx}
                                    className={`person-date-picker-day ${isCurrentMonth ? '' : 'other-month'} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                                    onClick={() => {
                                      handleFieldChange('leadDate', formatDateYYYYMMDD(day));
                                      setLeadDatePickerOpen(false);
                                      setEditingField(null);
                                    }}
                                  >
                                    {day.getDate()}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="person-date-picker-footer">
                              <button
                                type="button"
                                onClick={() => {
                                  handleFieldChange('leadDate', undefined);
                                  setLeadDatePickerOpen(false);
                                  setEditingField(null);
                                }}
                                className="person-date-picker-clear"
                              >
                                Clear
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const today = new Date();
                                  handleFieldChange('leadDate', formatDateYYYYMMDD(today));
                                  setLeadDateCalendarMonth(today);
                                  setLeadDatePickerOpen(false);
                                  setEditingField(null);
                                }}
                                className="person-date-picker-today"
                              >
                                Today
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <span 
                      className="person-field-value person-field-clickable"
                      onClick={() => {
                        setEditingField('leadDate');
                        setLeadDatePickerOpen(true);
                        if (formData.leadDate) {
                          const date = parseDateDDMMYYYY(formData.leadDate);
                          if (date) {
                            setLeadDateCalendarMonth(date);
                          }
                        }
                      }}
                    >
                      {getDateForDisplay(formData.leadDate) || ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
            </div>

        {/* Organization Section */}
        <div className="person-section">
          <div className="person-section-header" onClick={() => setOrganizationExpanded(!organizationExpanded)}>
            <span className="person-section-title">
              {organizationExpanded ? '▼' : '▶'} Organization
            </span>
            <div className="person-section-actions">
              <span className="person-section-icon">☰</span>
              <span className="person-section-icon">✏️</span>
              <span className="person-section-icon">⋯</span>
            </div>
          </div>
          {organizationExpanded && (
            <div className="person-section-content">
              <div className="person-field-row">
                <span className="person-field-icon">🏢</span>
                <select
                  className="person-field-input"
                  value={formData.organizationId || ''}
                  onChange={(e) => handleFieldChange('organizationId', e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">Select organization...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
            </div>
              <div className="person-field-row">
                <label className="person-field-label">Address</label>
                <input
                  type="text"
                  className="person-field-input"
                  value={formData.organizationAddress || ''}
                  onChange={(e) => handleFieldChange('organizationAddress', e.target.value)}
                  placeholder="Address"
                />
            </div>
              <div className="person-field-row">
                <label className="person-field-label">Labels</label>
                <div className="person-labels-container">
                  {editingField === 'orgLabel' || orgLabelsDropdownOpen ? (
                    <div className="person-field-input person-label-select" style={{ borderColor: orgLabelsDropdownOpen ? '#4caf50' : '#ddd' }}>
                      {formData.label ? (
                        <span className="person-label-badge" style={{ backgroundColor: getLabelColor(formData.label) }}>
                          {labels.find(l => l.code === formData.label)?.label || formData.label}
                        </span>
                      ) : (
                        <span className="person-label-placeholder">Select label...</span>
                      )}
                      <span className="person-label-chevron">▼</span>
                    </div>
                  ) : (
                    <div 
                      className="person-field-input person-label-select person-field-clickable"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOrgLabelsDropdownOpen(true);
                      }}
                    >
                      {formData.label ? (
                        <span className="person-label-badge" style={{ backgroundColor: getLabelColor(formData.label) }}>
                          {labels.find(l => l.code === formData.label)?.label || formData.label}
                        </span>
                      ) : (
                        <span className="person-label-placeholder">Select label...</span>
                      )}
                      <span className="person-label-chevron">▼</span>
                    </div>
                  )}
                  {orgLabelsDropdownOpen && (
                    <>
                      <div 
                        className="person-labels-overlay"
                        onClick={() => setOrgLabelsDropdownOpen(false)}
                      />
                      <div className="person-labels-dropdown">
                        <div className="person-labels-search">
                          <span className="person-labels-search-icon">🔍</span>
                          <input
                            type="text"
                            placeholder="Search for labels"
                            value={orgLabelSearchQuery}
                            onChange={(e) => setOrgLabelSearchQuery(e.target.value)}
                            className="person-labels-search-input"
                          />
                        </div>
                        <div className="person-labels-list">
                          {[
                            { code: 'CUSTOMER', label: 'CUSTOMER', color: '#4CAF50' },
                            { code: 'HOT_LEAD', label: 'HOT LEAD', color: '#F44336' },
                            { code: 'WARM_LEAD', label: 'WARM LEAD', color: '#FFC107' },
                            { code: 'COLD_LEAD', label: 'COLD LEAD', color: '#2196F3' },
                            { code: 'NO_RESPONSE', label: 'NO RESPONSE', color: '#9C27B0' },
                            { code: 'PLANNER', label: 'PLANNER', color: '#FF9800' },
                            { code: 'WEDDING', label: 'WEDDING', color: '#9E9E9E' },
                            { code: 'PRE_WEDDING', label: 'PRE WEDDING', color: '#E91E63' },
                          ]
                            .filter(label => 
                              label.label.toLowerCase().includes(orgLabelSearchQuery.toLowerCase())
                            )
                            .map((label) => (
                              <div
                                key={label.code}
                                className="person-label-item"
                                style={{ backgroundColor: label.color }}
                                onClick={() => {
                                  handleFieldChange('label', label.code);
                                  setOrgLabelsDropdownOpen(false);
                                  setOrgLabelSearchQuery('');
                                }}
                              >
                                {label.label}
                              </div>
                            ))}
                        </div>
                        <button
                          className="person-add-label-button"
                          onClick={() => {
                            setOrgLabelsDropdownOpen(false);
                            setNewLabelModalOpen(true);
                          }}
                        >
                          <span>+</span> Add label
                        </button>
                      </div>
                    </>
                  )}
                </div>
            </div>
            </div>
          )}
          </div>

        {/* Deals Section */}
        <div className="person-section">
          <div className="person-section-header" onClick={() => setDealsExpanded(!dealsExpanded)}>
            <span className="person-section-title">
              {dealsExpanded ? '▼' : '▶'} Deals
            </span>
          </div>
          {dealsExpanded && (
            <div className="person-section-content">
              <div className="deals-overview">
                <div className="deals-item">
                  <span>Overview</span>
                </div>
                <div className="deals-item">
                  <span>Top activities</span>
                  <span className="deals-value">- 0 0%</span>
                </div>
                <div className="deals-item">
                  <span>Most active users</span>
                  <span className="deals-value">- 0 0%</span>
                </div>
            </div>
            </div>
          )}
        </div>
        </div>

        {/* Right Main Content */}
        <div className="person-detail-right">
          {/* Tabs */}
        <div className="person-tabs">
          {(['Activity', 'Notes', 'Meeting scheduler', 'Call', 'Email', 'Send quote', 'Send Contract', 'Share Worklinks'] as ActiveTab[]).map(tab => (
            <button
              key={tab}
              className={`person-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Activity Input Area */}
        <div className="person-activity-input-area">
          <div 
            className="person-activity-placeholder"
            onClick={() => setIsActivityModalOpen(true)}
          >
            Click here to add an activity...
          </div>
        </div>

        {/* Focus Section */}
        <div className="person-focus-section">
          <div className="person-focus-header">
            <span className="person-focus-title">Focus ✓</span>
            <label className="person-expand-checkbox">
              <input type="checkbox" />
              Expand all items
            </label>
          </div>
          <div className="person-focus-content">
            {loadingActivities ? (
              <div>Loading activities...</div>
            ) : getFocusActivities.length === 0 ? (
              <div>No focus items yet. Scheduled activities, pinned notes, email drafts and scheduled emails will appear here.</div>
            ) : (
              <div className="deal-activity-list">
                {getFocusActivities.map((activity) => {
                  const activityDeal = deals.find(d => d.id === activity.dealId);
                  const activityOrg = activityDeal?.organizationId 
                    ? organizations.find(o => o.id === activityDeal.organizationId)
                    : null;
                  
                  return (
                    <div key={activity.id} className={`deal-activity-item ${getActivityColorClass(activity)}`}>
                      <div className="deal-activity-checkbox">
                        <input
                          type="checkbox"
                          checked={activity.done}
                          onChange={(e) => markActivityDone(activity.id, e.target.checked)}
                        />
                      </div>
                      <div className="deal-activity-content">
                        <div className="deal-activity-subject">{activity.subject}</div>
                        <div className="deal-activity-meta">
                          <span className="deal-activity-date">
                            {formatActivityDate(activity.createdAt || activity.date || activity.dueDate)}
                          </span>
                          {summary?.person?.name && (
                            <>
                              <span className="deal-activity-separator">·</span>
                              <span className="deal-activity-person">
                                <span className="deal-activity-person-icon">👤</span>
                                {summary.person.name}
                              </span>
                            </>
                          )}
                          {activityDeal?.name && (
                            <>
                              <span className="deal-activity-separator">·</span>
                              <span className="deal-activity-deal">
                                <span className="deal-activity-deal-icon">$</span>
                                {activityDeal.name}
                              </span>
                            </>
                          )}
                          {activityOrg?.name && (
                            <>
                              <span className="deal-activity-separator">·</span>
                              <span className="deal-activity-org">
                                <span className="deal-activity-org-icon">
                                  <span className="icon-org-buildings">
                                    <span className="icon-building-left">
                                      <span className="icon-window"></span>
                                      <span className="icon-window"></span>
                                      <span className="icon-window"></span>
                                      <span className="icon-window"></span>
                                    </span>
                                    <span className="icon-building-right">
                                      <span className="icon-line"></span>
                                      <span className="icon-line"></span>
                                      <span className="icon-line"></span>
                                    </span>
                                  </span>
                                </span>
                                {activityOrg.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="deal-activity-menu-container">
                        <div 
                          className="deal-activity-menu" 
                          onClick={(e) => handleMenuClick(e, activity.id)}
                        >
                          ⋯
                        </div>
                        {openMenuId === activity.id && (
                          <div className="deal-activity-menu-dropdown">
                            <div 
                              className="deal-activity-menu-item"
                              onClick={() => markActivityDone(activity.id, !activity.done)}
                            >
                              {activity.done ? 'Mark as undone' : 'Mark as done'}
                            </div>
                            <div 
                              className="deal-activity-menu-item"
                              onClick={() => handleDeleteActivity(activity.id)}
                            >
                              Delete
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button 
            className="person-schedule-button"
            onClick={() => setIsActivityModalOpen(true)}
          >
            + Schedule an activity
          </button>
        </div>

        {/* History Section */}
        <div className="person-history-section">
          <div className="person-history-header" onClick={() => setHistoryExpanded(!historyExpanded)}>
            <span className="person-history-title">
              {historyExpanded ? '▼' : '▶'} History
            </span>
          </div>
          {historyExpanded && (
            <div className="person-history-content">
              {loadingActivities ? (
                <div>Loading history...</div>
              ) : getHistoryActivities.length === 0 ? (
                <div>No history yet.</div>
              ) : (
                <div className="deal-history-list">
                  {getHistoryActivities.map((activity) => {
                    const activityDeal = deals.find(d => d.id === activity.dealId);
                    const activityOrg = activityDeal?.organizationId 
                      ? organizations.find(o => o.id === activityDeal.organizationId)
                      : null;
                    
                    return (
                      <div key={activity.id} className={`deal-history-item ${getActivityColorClass(activity)}`}>
                        <div className="deal-history-timeline">
                          <div className="deal-history-dot"></div>
                        </div>
                        <div className="deal-history-checkbox">
                          <input
                            type="checkbox"
                            checked={activity.done}
                            onChange={(e) => markActivityDone(activity.id, e.target.checked)}
                          />
                        </div>
                        <div className="deal-history-content-wrapper">
                          <div className="deal-history-header-row">
                            {activity.done && <span className="deal-history-checkmark">✓</span>}
                            <span className="deal-history-subject">{activity.subject}</span>
                          </div>
                          <div className="deal-history-meta">
                            <span className="deal-history-date">
                              {formatActivityDate(activity.createdAt || activity.date || activity.dueDate)}
                            </span>
                            {summary?.person?.name && (
                              <>
                                <span className="deal-history-separator">·</span>
                                <span className="deal-history-person">
                                  <span className="deal-history-person-icon">👤</span>
                                  {summary.person.name}
                                </span>
                              </>
                            )}
                            {activityDeal?.name && (
                              <>
                                <span className="deal-history-separator">·</span>
                                <span className="deal-history-deal">
                                  <span className="deal-history-deal-icon">$</span>
                                  {activityDeal.name}
                                </span>
                              </>
                            )}
                            {activityOrg?.name && (
                              <>
                                <span className="deal-history-separator">·</span>
                                <span className="deal-history-org">
                                  <span className="deal-history-org-icon">
                                    <span className="icon-org-buildings">
                                      <span className="icon-building-left">
                                        <span className="icon-window"></span>
                                        <span className="icon-window"></span>
                                        <span className="icon-window"></span>
                                        <span className="icon-window"></span>
                                      </span>
                                      <span className="icon-building-right">
                                        <span className="icon-line"></span>
                                        <span className="icon-line"></span>
                                        <span className="icon-line"></span>
                                      </span>
                                    </span>
                                  </span>
                                  {activityOrg.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="deal-history-menu-container">
                          <div 
                            className="deal-history-menu" 
                            onClick={(e) => handleMenuClick(e, activity.id)}
                          >
                            ⋯
                          </div>
                          {openMenuId === activity.id && (
                            <div className="deal-history-menu-dropdown">
                              <div 
                                className="deal-history-menu-item"
                                onClick={() => markActivityDone(activity.id, !activity.done)}
                              >
                                {activity.done ? 'Mark as undone' : 'Mark as done'}
                              </div>
                              <div 
                                className="deal-history-menu-item"
                                onClick={() => handleDeleteActivity(activity.id)}
                              >
                                Delete
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="person-detail-footer">
        <button className="person-cancel-button" onClick={handleCancel} disabled={saving}>
          Cancel
        </button>
        <button className="person-save-button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* New Label Modal */}
      {newLabelModalOpen && (
        <>
          <div 
            className="person-modal-overlay"
            onClick={() => {
              setNewLabelModalOpen(false);
              setNewLabelName('');
              setNewLabelColor('#FFC107');
            }}
          />
          <div className="person-new-label-modal">
            <h2 className="person-modal-title">New label</h2>
            
            <div className="person-modal-field">
              <label className="person-modal-label">Label name</label>
              <input
                type="text"
                className="person-modal-input"
                placeholder="Label name"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="person-modal-field">
              <label className="person-modal-label">Label color</label>
              <div className="person-color-picker">
                {labelColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`person-color-option ${newLabelColor === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewLabelColor(color)}
                  >
                    {newLabelColor === color && <span className="person-color-checkmark">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="person-modal-footer">
              <button
                className="person-modal-cancel"
                onClick={() => {
                  setNewLabelModalOpen(false);
                  setNewLabelName('');
                  setNewLabelColor('#FFC107');
                }}
              >
                Cancel
              </button>
              <button
                className="person-modal-save"
                onClick={handleCreateLabel}
                disabled={!newLabelName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}


      {/* Activity Modal */}
      <ActivityModal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        onSave={handleCreateActivity}
        initialDealId={deals.length > 0 ? deals[0].id : undefined}
        initialPersonId={id ? Number(id) : undefined}
        initialOrganizationId={summary?.person?.organizationId || undefined}
      />
    </div>
  );
}
