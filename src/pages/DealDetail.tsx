import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { dealsApi } from '../services/deals';
import { personsApi } from '../services/api';
import { organizationsApi } from '../services/organizations';
import { pipelinesApi } from '../services/pipelines';
import { activitiesApi, type Activity } from '../services/activities';
import { clearAuthSession } from '../utils/authToken';
import type { Deal, DealCreateRequest } from '../types/deal';
import type { Person } from '../types/person';
import type { Organization } from '../types/organization';
import type { Pipeline, Stage } from '../types/pipeline';
import ActivityModal, { type ActivityFormValues } from '../components/ActivityModal';
import './DealDetail.css';

type ActiveTab = 'Activity' | 'Notes' | 'Meeting scheduler' | 'Call' | 'Email' | 'Send quote' | 'Send Contract' | 'Share Worklinks';

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNewDeal = id === 'new';
  const personIdFromQuery = searchParams.get('personId');
  const [deal, setDeal] = useState<Deal | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('Activity');
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [focusedActivities, setFocusedActivities] = useState<Set<number>>(new Set());
  const [expandAllFocus, setExpandAllFocus] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  // Collapsible sections state
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [associationsExpanded, setAssociationsExpanded] = useState(true);
  const [eventInfoExpanded, setEventInfoExpanded] = useState(true);
  const [additionalInfoExpanded, setAdditionalInfoExpanded] = useState(true);
  const [overviewExpanded, setOverviewExpanded] = useState(true);
  const [focusExpanded, setFocusExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [eventDatePickerOpen, setEventDatePickerOpen] = useState(false);
  const [eventDateCalendarMonth, setEventDateCalendarMonth] = useState(new Date());

  // Form state
  const [formData, setFormData] = useState<{
    name: string;
    value: string;
    status: string;
    personId?: number | null;
    organizationId?: number | null;
    pipelineId?: number | null;
    stageId?: number | null;
    categoryId?: number | null;
    eventType?: string;
    venue?: string;
    phoneNumber?: string;
    email?: string;
    eventDate?: string;
    commissionAmount?: string;
  }>({
    name: '',
    value: '',
    status: 'IN_PROGRESS',
    personId: null,
    organizationId: null,
    pipelineId: null,
    stageId: null,
    categoryId: null,
    eventType: '',
    venue: '',
    phoneNumber: '',
    email: '',
    eventDate: '',
    commissionAmount: '',
  });

  useEffect(() => {
    if (isNewDeal) {
      // Handle new deal creation mode
      setLoading(true);
      loadPersonDataForNewDeal();
    } else if (id) {
      // Handle existing deal
      loadDealData(Number(id));
    }
  }, [id, isNewDeal, personIdFromQuery]);

  useEffect(() => {
    loadDropdownData();
  }, []);

  // Load person data when creating new deal from person
  const loadPersonDataForNewDeal = async () => {
    if (!personIdFromQuery) {
      // No person data to load, just set loading to false
      setLoading(false);
      return;
    }

    try {
      const personId = Number(personIdFromQuery);
      const personData = await personsApi.get(personId);
      setPerson(personData);

      // Pre-fill form with person data
      // IMPORTANT: Deal organization is separate from person organization
      // Do NOT use person's organizationId - let user choose deal's organization independently
      setFormData({
        name: personData.name || '',
        value: '0',
        status: 'IN_PROGRESS',
        personId: personId,
        organizationId: null, // Deal organization is independent - start with null, not person's organization
        pipelineId: null,
        stageId: null,
        categoryId: null,
        eventType: '',
        venue: '',
        phoneNumber: personData.phone || '',
        email: personData.email || '',
        eventDate: '',
        commissionAmount: '',
      });
      setLoading(false);
    } catch (error) {
      console.error('Failed to load person data:', error);
      if ((error as any)?.response?.status === 401) {
        clearAuthSession();
        navigate('/login', { replace: true });
      }
      setLoading(false);
    }
  };

  const loadDropdownData = async () => {
    try {
      const [orgs, pipelineData] = await Promise.all([
        organizationsApi.list(),
        pipelinesApi.list({ includeStages: true }),
      ]);
      setOrganizations(orgs);
      setPipelines(pipelineData);
    } catch (error) {
      console.error('Failed to load dropdown data:', error);
    }
  };

  const loadDealData = async (dealId: number) => {
    setLoading(true);
    try {
      const dealData = await dealsApi.get(dealId);
      setDeal(dealData);

      // Load person data if personId exists
      let personEmail = '';
      let personPhone = '';
      if (dealData.personId) {
        try {
          const personData = await personsApi.get(dealData.personId);
          setPerson(personData);
          personEmail = personData.email || '';
          personPhone = personData.phone || '';
        } catch (error) {
          console.error('Failed to load person data:', error);
        }
      }

      // Pre-fill form with deal data
      // Always use the deal's organizationId, not the person's organizationId
      setFormData({
        name: dealData.name || '',
        value: dealData.value?.toString() || '0',
        status: dealData.status || 'IN_PROGRESS',
        personId: dealData.personId || null,
        organizationId: dealData.organizationId || null, // Use deal's organizationId, not person's
        pipelineId: dealData.pipelineId || null,
        stageId: dealData.stageId || null,
        categoryId: dealData.categoryId || null,
        eventType: dealData.eventType || '',
        venue: dealData.venue || '',
        phoneNumber: dealData.phoneNumber || personPhone || '',
        email: dealData.email || personEmail || '',
        eventDate: dealData.eventDate ? formatDateForInput(dealData.eventDate) : '',
        commissionAmount: dealData.commissionAmount?.toString() || '',
      });
    } catch (error) {
      console.error('Failed to load deal:', error);
      if ((error as any)?.response?.status === 401) {
        clearAuthSession();
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDateForInput = (dateStr: string): string => {
    if (dateStr.includes('/')) {
      const [d, m, y] = dateStr.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return dateStr.split('T')[0];
  };

  const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTimeForDisplay = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateDDMMYYYY = (date: Date): string => {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  const formatCurrency = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  // Calculate deal age in days
  const calculateDealAge = (createdAt: string): number => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Format deal age
  const formatDealAge = (days: number): string => {
    if (days < 1) return '< 1 day';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  // Calculate inactive days (when deal stays in any stage more than one day)
  // This means if the deal hasn't been updated in more than 1 day, it's inactive
  const calculateInactiveDays = (updatedAt: string | null | undefined, createdAt: string): number => {
    const lastUpdate = updatedAt ? new Date(updatedAt) : new Date(createdAt);
    const now = new Date();
    const diffTime = now.getTime() - lastUpdate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    // Only count as inactive if more than 1 day
    return diffDays > 1 ? diffDays - 1 : 0;
  };

  // Calculate average time to Won (placeholder - would ideally come from backend)
  const getAvgTimeToWon = (): number => {
    // This is a placeholder. In a real app, this would be calculated from all won deals
    // For now, return a default value
    return 28; // days
  };

  // Load activities for this deal only
  const loadActivities = async (dealId: number) => {
    setLoadingActivities(true);
    try {
      const response = await activitiesApi.list({ page: 0, size: 100 });
      // Filter to ensure only activities for this specific deal are shown
      const dealActivities = (response.content || []).filter(
        (activity) => activity.dealId === dealId
      );
      setActivities(dealActivities);
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoadingActivities(false);
    }
  };

  // Don't load activities for new deals
  useEffect(() => {
    if (!isNewDeal && id) {
      loadActivities(Number(id));
    }
  }, [id, isNewDeal]);

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
    const dateStr = activity.date || activity.dueDate;
    if (isToday(dateStr)) return 'deal-activity-today';
    if (isPast(dateStr)) return 'deal-activity-past';
    return 'deal-activity-future';
  };

  // Mark activity as done and move to history (or undo and move back to focus)
  const markActivityDone = async (activityId: number, done: boolean) => {
    try {
      await activitiesApi.markDone(activityId, done);
      // Reload activities to get updated status
      if (id) {
        await loadActivities(Number(id));
      }
      // When marking as done, it will automatically move to History
      // When marking as undone, it will automatically move to Focus
      // The getFocusActivities and getHistoryActivities functions handle this based on done status
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

  // Toggle focus on activity (for manual focus toggle, not done status)
  const toggleFocus = (activityId: number) => {
    setFocusedActivities((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(activityId)) {
        newSet.delete(activityId);
      } else {
        newSet.add(activityId);
      }
      return newSet;
    });
  };

  // Get activities for Focus section (only activities that are NOT done)
  const getFocusActivities = (): Activity[] => {
    return activities.filter((activity) => {
      // Only show activities that are NOT done
      // These are future activities or activities that haven't been completed yet
      return !activity.done;
    });
  };

  // Get activities for History section (only activities that ARE done, sorted by date)
  const getHistoryActivities = (): Activity[] => {
    return activities
      .filter((activity) => activity.done) // Only show done activities
      .sort((a, b) => {
        const dateA = new Date(a.date || a.dueDate || a.createdAt || '');
        const dateB = new Date(b.date || b.dueDate || b.createdAt || '');
        return dateB.getTime() - dateA.getTime();
      });
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Deal name is required');
      return;
    }

    setSaving(true);
    try {
      // Helper function to convert empty strings to null
      const toNullIfEmpty = (value: string | null | undefined): string | null => {
        if (value === null || value === undefined) return null;
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
      };

      const payload: DealCreateRequest = {
        name: formData.name.trim(),
        value: formData.value ? parseFloat(formData.value) : 0,
        status: formData.status as any,
        personId: formData.personId || null,
        // IMPORTANT: Deal organization is completely separate from person organization
        // Send the deal's organizationId (which may be null, or a specific organization)
        // Never use person's organizationId as fallback
        organizationId: formData.organizationId !== undefined && formData.organizationId !== null ? formData.organizationId : null,
        pipelineId: formData.pipelineId || null,
        stageId: formData.stageId || null,
        categoryId: formData.categoryId || null,
        eventType: toNullIfEmpty(formData.eventType),
        venue: toNullIfEmpty(formData.venue),
        phoneNumber: toNullIfEmpty(formData.phoneNumber),
        email: toNullIfEmpty(formData.email),
        eventDate: toNullIfEmpty(formData.eventDate),
        commissionAmount: formData.commissionAmount ? parseFloat(formData.commissionAmount) : null,
      };

      console.log('Saving deal with payload:', payload);

      if (isNewDeal) {
        // Create new deal
        const createdDeal = await dealsApi.create(payload);
        console.log('Deal created successfully:', createdDeal);
        alert('Deal created successfully');
        // Navigate to deals page
        navigate('/deals');
      } else if (id) {
        // Update existing deal
        console.log('Updating deal ID:', id, 'with payload:', payload);
        const updatedDeal = await dealsApi.update(Number(id), payload);
        console.log('Deal updated successfully:', updatedDeal);
        // Reload deal data to reflect changes
        await loadDealData(Number(id));
        alert('Deal updated successfully');
      }
    } catch (error: any) {
      console.error('Failed to save deal:', error);
      // Show more detailed error message
      const errorMessage = error?.response?.data?.message 
        || error?.message 
        || 'Failed to save deal. Please check the console for details.';
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (isNewDeal) {
      // Navigate back to persons page if coming from person, otherwise to deals page
      if (personIdFromQuery) {
        navigate(`/persons/${personIdFromQuery}`);
      } else {
        navigate('/deals');
      }
    } else if (deal) {
      // Reset form to original deal data
      setFormData({
        name: deal.name || '',
        value: deal.value?.toString() || '0',
        status: deal.status || 'IN_PROGRESS',
        personId: deal.personId || null,
        organizationId: deal.organizationId || null,
        pipelineId: deal.pipelineId || null,
        stageId: deal.stageId || null,
        categoryId: deal.categoryId || null,
        eventType: deal.eventType || '',
        venue: deal.venue || '',
        phoneNumber: deal.phoneNumber || '',
        email: deal.email || person?.email || '',
        eventDate: deal.eventDate ? formatDateForInput(deal.eventDate) : '',
        commissionAmount: deal.commissionAmount?.toString() || '',
      });
    }
    setEditingField(null);
  };

  const selectedOrganization = useMemo(() => {
    // CRITICAL: Always use the deal's organizationId, NEVER the person's organizationId
    // Deal organization and person organization are completely separate
    // formData.organizationId comes from dealData.organizationId, NOT from personData.organizationId
    if (!formData.organizationId || formData.organizationId === null) return null;
    
    // Find the organization by the deal's organizationId
    const org = organizations.find((org) => org.id === formData.organizationId);
    
    // If organization not found, return null (don't fallback to person's organization)
    return org || null;
  }, [formData.organizationId, organizations]);

  const selectedPipeline = useMemo(() => {
    if (!formData.pipelineId) return null;
    return pipelines.find((p) => p.id === formData.pipelineId) || null;
  }, [formData.pipelineId, pipelines]);

  const selectedStage = useMemo(() => {
    if (!formData.stageId || !selectedPipeline) return null;
    return selectedPipeline.stages?.find((s) => s.id === formData.stageId) || null;
  }, [formData.stageId, selectedPipeline]);

  const categoryOptions = useMemo(() => {
    return [
      { id: 1, name: 'Photography' },
      { id: 2, name: 'Makeup' },
      { id: 3, name: 'Planning & Decor' },
    ];
  }, []);

  const selectedCategory = useMemo(() => {
    if (!formData.categoryId) return null;
    return categoryOptions.find((cat) => cat.id === formData.categoryId) || null;
  }, [formData.categoryId, categoryOptions]);

  const statusColors: Record<string, string> = {
    WON: '#10b981',
    LOST: '#ef4444',
    IN_PROGRESS: '#8b5cf6',
  };

  if (loading) {
    return (
      <div className="deal-detail-container">
        <div className="deal-detail-loading">Loading...</div>
      </div>
    );
  }

  if (!isNewDeal && !deal) {
    return (
      <div className="deal-detail-container">
        <div className="deal-detail-error">Deal not found</div>
      </div>
    );
  }

  return (
    <div className="deal-detail-container">
      {/* Top Header Bar - Full Width */}
      <div className="deal-detail-header-bar">
        <div className="deal-header-left">
          <input
            type="text"
            className="deal-header-name-input"
            value={formData.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            placeholder="Deal Name"
          />
        </div>
        <div className="deal-header-right">
          <button className="deal-close-button" onClick={() => {
            if (isNewDeal && personIdFromQuery) {
              navigate(`/persons/${personIdFromQuery}`);
            } else {
              navigate('/deals');
            }
          }}>
            ×
          </button>
        </div>
      </div>

      {/* Main Content - Two Halves */}
      <div className="deal-detail-main">
        {/* Left Sidebar */}
        <div className="deal-detail-left">
          {/* Summary Section */}
          <div className="deal-section">
            <div className="deal-section-header" onClick={() => setSummaryExpanded(!summaryExpanded)}>
              <span className="deal-section-title">
                {summaryExpanded ? '▼' : '▶'} Summary
              </span>
            </div>
            {summaryExpanded && (
              <div className="deal-section-content">
                <div className="deal-field-row">
                  {editingField === 'name' ? (
                    <div className="deal-field-with-icon-input">
                      <span className="deal-field-icon">👤</span>
                    <input
                      type="text"
                      className="deal-field-input"
                      value={formData.name}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                    </div>
                  ) : (
                    <div className="deal-field-display" onClick={() => setEditingField('name')}>
                      <span className="deal-field-icon">👤</span>
                      <span className="deal-field-text">{formData.name || ''}</span>
                    </div>
                  )}
                </div>
                <div className="deal-field-row">
                  {editingField === 'value' ? (
                    <div className="deal-field-with-icon-input">
                      <span className="deal-field-icon">$</span>
                    <input
                      type="number"
                      className="deal-field-input"
                      value={formData.value}
                      onChange={(e) => handleFieldChange('value', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                    </div>
                  ) : (
                    <div className="deal-field-display" onClick={() => setEditingField('value')}>
                      <span className="deal-field-icon">$</span>
                      <span className="deal-field-text">{formatCurrency(parseFloat(formData.value || '0'))}</span>
                    </div>
                  )}
                </div>
                <div className="deal-field-row">
                  {editingField === 'status' ? (
                    <div className="deal-field-with-icon-input">
                      <span className="deal-field-icon">🏷️</span>
                    <select
                      className="deal-field-input"
                      value={formData.status}
                      onChange={(e) => handleFieldChange('status', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      autoFocus
                    >
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="WON">Won</option>
                      <option value="LOST">Lost</option>
                    </select>
                    </div>
                  ) : (
                    <div className="deal-field-display" onClick={() => setEditingField('status')}>
                      <span className="deal-field-icon">🏷️</span>
                      <span 
                        className="deal-field-text" 
                        style={{ 
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '4px',
                          backgroundColor: statusColors[formData.status] || '#6b7280',
                          color: 'white',
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        {formData.status.replace('_', ' ')}
                      </span>
                    </div>
                  )}
                </div>
                      <div className="deal-field-row">
                  {editingField === 'email' ? (
                    <div className="deal-field-with-icon-input">
                          <span className="deal-field-icon">✉️</span>
                      <input
                        type="email"
                        className="deal-field-input"
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
                        </div>
                  ) : (
                    <div className="deal-field-display" onClick={() => setEditingField('email')}>
                      <span className="deal-field-icon">✉️</span>
                      <span className="deal-field-text">{formData.email || person?.email || ''}</span>
                      </div>
                    )}
                </div>
                      <div className="deal-field-row">
                  {editingField === 'phoneNumber' ? (
                      <div className="deal-field-with-icon-input">
                          <span className="deal-field-icon">📞</span>
                      <input
                        type="text"
                        className="deal-field-input"
                        value={formData.phoneNumber || ''}
                        onChange={(e) => handleFieldChange('phoneNumber', e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingField(null);
                          }
                        }}
                        autoFocus
                        style={{ pointerEvents: 'auto', userSelect: 'text' }}
                      />
                        </div>
                  ) : (
                    <div className="deal-field-display" onClick={() => setEditingField('phoneNumber')}>
                      <span className="deal-field-icon">📞</span>
                      <span className="deal-field-text">{formData.phoneNumber || person?.phone || ''}</span>
                      </div>
                )}
                </div>
              </div>
            )}
          </div>

          {/* Associations Section */}
          <div className="deal-section">
            <div className="deal-section-header" onClick={() => setAssociationsExpanded(!associationsExpanded)}>
              <span className="deal-section-title">
                {associationsExpanded ? '▼' : '▶'} ASSOCIATIONS
              </span>
            </div>
            {associationsExpanded && (
              <div className="deal-section-content">
                <div className="deal-field-row">
                  <span className="deal-field-label">Client</span>
                  <div className="deal-field-text">
                    {person ? person.name : (formData.personId ? `Person ID: ${formData.personId}` : '')}
                  </div>
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">Organization</span>
                  {editingField === 'organizationId' ? (
                    <select
                      className="deal-field-input"
                      value={formData.organizationId || ''}
                      onChange={(e) => handleFieldChange('organizationId', e.target.value ? Number(e.target.value) : null)}
                      onBlur={() => setEditingField(null)}
                      autoFocus
                    >
                      <option value=""></option>
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  ) : (
                      <span className="deal-field-text" onClick={() => setEditingField('organizationId')}>
                      {selectedOrganization ? selectedOrganization.name : (formData.organizationId === null ? '' : '—')}
                      </span>
                  )}
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">Pipeline</span>
                  {editingField === 'pipelineId' ? (
                    <select
                      className="deal-field-input"
                      value={formData.pipelineId || ''}
                      onChange={(e) => handleFieldChange('pipelineId', e.target.value ? Number(e.target.value) : null)}
                      onBlur={() => setEditingField(null)}
                      autoFocus
                    >
                      <option value=""></option>
                      {pipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
                      ))}
                    </select>
                  ) : (
                      <span className="deal-field-text" onClick={() => setEditingField('pipelineId')}>
                      {selectedPipeline ? selectedPipeline.name : ''}
                      </span>
                  )}
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">Stage</span>
                  {editingField === 'stageId' ? (
                    <select
                      className="deal-field-input"
                      value={formData.stageId || ''}
                      onChange={(e) => handleFieldChange('stageId', e.target.value ? Number(e.target.value) : null)}
                      onBlur={() => setEditingField(null)}
                      autoFocus
                    >
                      <option value=""></option>
                      {pipelines.flatMap((p) => p.stages || []).map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      ))}
                    </select>
                  ) : (
                      <span className="deal-field-text" onClick={() => setEditingField('stageId')}>
                      {selectedStage ? selectedStage.name : ''}
                      </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Event Information Section */}
          <div className="deal-section">
            <div className="deal-section-header" onClick={() => setEventInfoExpanded(!eventInfoExpanded)}>
              <span className="deal-section-title">
                {eventInfoExpanded ? '▼' : '▶'} EVENT INFORMATION
              </span>
            </div>
            {eventInfoExpanded && (
              <div className="deal-section-content">
                <div className="deal-field-row">
                  <span className="deal-field-label">Venue</span>
                  {editingField === 'venue' ? (
                    <input
                      type="text"
                      className="deal-field-input"
                      value={formData.venue || ''}
                      onChange={(e) => handleFieldChange('venue', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                      <span className="deal-field-text" onClick={() => setEditingField('venue')}>
                      {formData.venue || ''}
                      </span>
                  )}
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">Event Date</span>
                  <div className="deal-date-input-container">
                    {editingField === 'eventDate' || eventDatePickerOpen ? (
                      <>
                        <input
                          type="date"
                          className="deal-field-input"
                          value={formData.eventDate || ''}
                          onChange={(e) => handleFieldChange('eventDate', e.target.value)}
                          onBlur={() => {
                            setEditingField(null);
                            setEventDatePickerOpen(false);
                          }}
                          autoFocus
                        />
                      </>
                    ) : (
                        <span 
                          className="deal-field-text" 
                          onClick={() => {
                            setEditingField('eventDate');
                            setEventDatePickerOpen(true);
                          }}
                        >
                        {formData.eventDate ? formatDateForDisplay(formData.eventDate) : ''}
                        </span>
                    )}
                  </div>
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">Event Type</span>
                  {editingField === 'eventType' ? (
                    <input
                      type="text"
                      className="deal-field-input"
                      value={formData.eventType || ''}
                      onChange={(e) => handleFieldChange('eventType', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                      <span className="deal-field-text" onClick={() => setEditingField('eventType')}>
                      {formData.eventType || ''}
                      </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Additional Information Section */}
          <div className="deal-section">
            <div className="deal-section-header" onClick={() => setAdditionalInfoExpanded(!additionalInfoExpanded)}>
              <span className="deal-section-title">
                {additionalInfoExpanded ? '▼' : '▶'} ADDITIONAL INFORMATION
              </span>
            </div>
            {additionalInfoExpanded && (
              <div className="deal-section-content">
                <div className="deal-field-row">
                  <span className="deal-field-label">Phone</span>
                  <input
                    type="text"
                    className="deal-field-input"
                    value={formData.phoneNumber || ''}
                    onChange={(e) => handleFieldChange('phoneNumber', e.target.value)}
                    placeholder={person?.phone || 'Enter phone number'}
                    style={{ pointerEvents: 'auto', userSelect: 'text', cursor: 'text' }}
                  />
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">Commission</span>
                  {editingField === 'commissionAmount' ? (
                    <input
                      type="number"
                      className="deal-field-input"
                      value={formData.commissionAmount || ''}
                      onChange={(e) => handleFieldChange('commissionAmount', e.target.value)}
                      onBlur={() => setEditingField(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingField(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                      <span className="deal-field-text" onClick={() => setEditingField('commissionAmount')}>
                      {formData.commissionAmount ? formatCurrency(parseFloat(formData.commissionAmount)) : ''}
                      </span>
                  )}
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">Created</span>
                  <div className="deal-field-text">
                    {deal ? formatDateForDisplay(deal.createdAt) : ''}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Overview Section */}
          {!isNewDeal && (
          <div className="deal-section">
            <div className="deal-section-header" onClick={() => setOverviewExpanded(!overviewExpanded)}>
              <span className="deal-section-title">
                {overviewExpanded ? '▼' : '▶'} Overview
              </span>
              <button 
                className="deal-refresh-icon" 
                onClick={(e) => {
                  e.stopPropagation();
                  if (id && !isNewDeal) {
                    loadDealData(Number(id));
                  }
                }}
                title="Refresh"
              >
                🔄
              </button>
            </div>
            {overviewExpanded && deal && (
              <div className="deal-section-content">
                <div className="deal-field-row">
                  <span className="deal-field-label">Deal age</span>
                  <div className="deal-field-value-container">
                    <span className="deal-field-value">{formatDealAge(calculateDealAge(deal.createdAt))}</span>
                    <div className="deal-progress-bar">
                      <div 
                        className="deal-progress-fill" 
                        style={{ 
                          width: `${Math.min((calculateDealAge(deal.createdAt) / getAvgTimeToWon()) * 100, 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">
                    Avg time to Won
                    <span className="deal-info-icon" title="Average time taken for deals to reach Won status">ℹ️</span>
                  </span>
                  <span className="deal-field-value">{getAvgTimeToWon()} days</span>
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">
                    Inactive (days)
                    <span className="deal-info-icon" title="Days since last update (more than 1 day)">ℹ️</span>
                  </span>
                  <span className="deal-field-value">{calculateInactiveDays(deal.updatedAt, deal.createdAt)}</span>
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">Created</span>
                  <span className="deal-field-value">{formatDateTimeForDisplay(deal.createdAt)}</span>
                </div>
                <div className="deal-field-row">
                  <span className="deal-field-label">Updated</span>
                  <span className="deal-field-value">
                    {deal.updatedAt ? formatDateTimeForDisplay(deal.updatedAt) : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {/* Right Main Content */}
        <div className="deal-detail-right">
          {/* Tabs */}
          <div className="deal-tabs">
            {(['Activity', 'Notes', 'Meeting scheduler', 'Call', 'Email', 'Send quote', 'Send Contract', 'Share Worklinks'] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                className={`deal-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Activity Input Area */}
          <div className="deal-activity-input-area">
            <div 
              className="deal-activity-placeholder"
              onClick={() => setIsActivityModalOpen(true)}
            >
              Click here to add an activity...
            </div>
          </div>

          {/* Focus Section */}
          <div className="deal-focus-section">
            <div className="deal-focus-header">
              <span className="deal-focus-title">Focus ✓</span>
              <label className="deal-expand-checkbox">
                <input 
                  type="checkbox" 
                  checked={expandAllFocus}
                  onChange={(e) => setExpandAllFocus(e.target.checked)}
                />
                Expand all items
              </label>
            </div>
            <div className="deal-focus-content">
              {loadingActivities ? (
                <div>Loading activities...</div>
              ) : getFocusActivities().length === 0 ? (
                <div>No focus items yet. Scheduled activities, pinned notes, email drafts and scheduled emails will appear here.</div>
              ) : (
                <div className="deal-activity-list">
                  {getFocusActivities().map((activity) => (
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
                          {/* Date: when activity was created */}
                          <span className="deal-activity-date">
                            {formatActivityDate(activity.createdAt || activity.date || activity.dueDate)}
                          </span>
                          {/* Person name: from the person who created the deal */}
                          {person?.name && (
                            <>
                              <span className="deal-activity-separator">·</span>
                              <span className="deal-activity-person">
                                <span className="deal-activity-person-icon">👤</span>
                                {person.name}
                              </span>
                            </>
                          )}
                          {/* Deal name: the deal itself */}
                          {deal?.name && (
                            <>
                              <span className="deal-activity-separator">·</span>
                              <span className="deal-activity-deal">
                                <span className="deal-activity-deal-icon">$</span>
                                {deal.name}
                              </span>
                            </>
                          )}
                          {/* Organization: from the deal's organization */}
                          {selectedOrganization?.name && (
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
                                {selectedOrganization.name}
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
                  ))}
                </div>
              )}
            </div>
            <button 
              className="deal-schedule-button"
              onClick={() => setIsActivityModalOpen(true)}
            >
              + Schedule an activity
            </button>
          </div>

          {/* History Section */}
          <div className="deal-history-section">
            <div className="deal-history-header" onClick={() => setHistoryExpanded(!historyExpanded)}>
              <span className="deal-history-title">
                {historyExpanded ? '▼' : '▶'} History
              </span>
            </div>
            {historyExpanded && (
              <div className="deal-history-content">
                {loadingActivities ? (
                  <div>Loading history...</div>
                ) : getHistoryActivities().length === 0 ? (
                  <div>No history yet.</div>
                ) : (
                  <div className="deal-history-list">
                    {getHistoryActivities().map((activity) => (
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
                            {/* Date: when activity was created */}
                            <span className="deal-history-date">
                              {formatActivityDate(activity.createdAt || activity.date || activity.dueDate)}
                            </span>
                            {/* Person name: from the person who created the deal */}
                            {person?.name && (
                              <>
                                <span className="deal-history-separator">·</span>
                                <span className="deal-history-person">
                                  <span className="deal-history-person-icon">👤</span>
                                  {person.name}
                                </span>
                              </>
                            )}
                            {/* Deal name: the deal itself */}
                            {deal?.name && (
                              <>
                                <span className="deal-history-separator">·</span>
                                <span className="deal-history-deal">
                                  <span className="deal-history-deal-icon">$</span>
                                  {deal.name}
                                </span>
                              </>
                            )}
                            {/* Organization: from the deal's organization */}
                            {selectedOrganization?.name && (
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
                                  {selectedOrganization.name}
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
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="deal-detail-footer">
        <button className="deal-cancel-button" onClick={handleCancel} disabled={saving}>
          Cancel
        </button>
        <button className="deal-save-button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Activity Modal */}
      <ActivityModal
        isOpen={isActivityModalOpen}
        onClose={() => setIsActivityModalOpen(false)}
        initialOrganization={selectedOrganization?.name || ''}
        onSave={async (v: ActivityFormValues) => {
          if (!v.subject || v.subject.trim() === '') {
            alert('Subject is required');
            return;
          }
          try {
            // If no date is provided, default to today's date in dd/MM/yyyy format (backend format)
            let activityDate = v.date;
            if (!activityDate) {
              const today = new Date();
              const dd = String(today.getDate()).padStart(2, '0');
              const mm = String(today.getMonth() + 1).padStart(2, '0');
              const yyyy = today.getFullYear();
              activityDate = `${dd}/${mm}/${yyyy}`;
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

            const selectedType = v.type || v.category || 'ACTIVITY';
            const parentCategory = (() => {
              switch ((selectedType || '').toUpperCase()) {
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
            })();

            const activityData: Partial<ActivityFormValues> = {
              subject: v.subject.trim(),
              date: activityDate,
              dueDate: activityDate, // Set dueDate for filtering (same format)
              startTime: v.startTime || undefined,
              endTime: v.endTime || undefined,
              priority: v.priority ? v.priority.toUpperCase() : undefined,
              assignedUser: v.assignedUser || undefined,
              notes: v.notes || undefined,
              organization: v.organization || undefined,
              personId: v.personId || undefined,
              dealId: id ? Number(id) : undefined,
              // Use category from form if provided, otherwise default to ACTIVITY
              category: parentCategory,
              type: selectedType,
              dateTime: isoDateForDateTime ? `${isoDateForDateTime}T${v.startTime || '00:00'}:00` : undefined,
            };
            
            await activitiesApi.create(activityData as any);
            setIsActivityModalOpen(false);
            if (id && !isNewDeal) {
              await loadActivities(Number(id));
            }
            alert('Activity created successfully');
          } catch (error) {
            console.error('Failed to create activity:', error);
            alert('Failed to create activity');
          }
        }}
      />
    </div>
  );
}

