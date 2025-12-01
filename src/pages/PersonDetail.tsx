import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { personsApi } from '../services/api';
import { organizationsApi } from '../services/organizations';
import { dealsApi } from '../services/deals';
import { activitiesApi, type Activity } from '../services/activities';
import { clearAuthSession } from '../utils/authToken';
import { addToRecentlyViewed } from '../utils/recentlyViewed';
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
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [_filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [_owners, setOwners] = useState<PersonOwner[]>([]);
  const [labels, setLabels] = useState<PersonLabelOption[]>([]);
  const [sources, setSources] = useState<PersonSourceOption[]>([]);

  // Collapsible sections state
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [weddingDetailsExpanded, setWeddingDetailsExpanded] = useState(true);
  const [organizationExpanded, setOrganizationExpanded] = useState(true);
  const [dealsExpanded, setDealsExpanded] = useState(false);
  const [_focusExpanded, _setFocusExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [weddingDetailsMenuOpen, setWeddingDetailsMenuOpen] = useState(false);
  const [showOnlyFilledFields, setShowOnlyFilledFields] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null); // Keep for date pickers
  const [_weddingDatePickerOpen, _setWeddingDatePickerOpen] = useState(false);
  const [leadDatePickerOpen, setLeadDatePickerOpen] = useState(false);
  const [_weddingDateCalendarMonth, _setWeddingDateCalendarMonth] = useState(new Date());
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
      const [meta, orgs, ownerOptions, labelOptions, sourceOptions] = await Promise.allSettled([
        personsApi.getFilters(),
        organizationsApi.list(),
        personsApi.listOwners(),
        personsApi.listLabels(),
        dealsApi.listSources(),
      ]);
      
      // Handle each result individually to prevent one failure from breaking everything
      if (meta.status === 'fulfilled') {
        setFilterMeta(meta.value);
      } else {
        console.error('Failed to load filter meta:', meta.reason);
      }
      
      if (orgs.status === 'fulfilled') {
        setOrganizations(orgs.value);
      } else {
        console.error('Failed to load organizations:', orgs.reason);
        setOrganizations([]);
      }
      
      if (ownerOptions.status === 'fulfilled') {
        setOwners(ownerOptions.value);
      } else {
        console.error('Failed to load owners:', ownerOptions.reason);
      }
      
      if (labelOptions.status === 'fulfilled') {
        setLabels(labelOptions.value);
      } else {
        console.error('Failed to load labels:', labelOptions.reason);
        setLabels([]);
      }
      
      if (sourceOptions.status === 'fulfilled') {
        // Convert deal sources format to person source format if needed
        const sourcesArray = sourceOptions.value || [];
        const formattedSources = Array.isArray(sourcesArray) 
          ? sourcesArray.map((s: any) => ({
              code: typeof s === 'string' ? s : s.code || s.value,
              label: typeof s === 'string' ? s : s.label || s.code || s.value,
            }))
          : [];
        setSources(formattedSources);
      } else {
        console.error('Failed to load sources:', sourceOptions.reason);
        setSources([]);
      }
    } catch (error) {
      console.error('Failed to load dropdown data:', error);
      // Set empty arrays to prevent crashes
      setOrganizations([]);
      setLabels([]);
      setSources([]);
    }
  };

  const loadPersonData = async (personId: number) => {
    setLoading(true);
    try {
      const data = await personsApi.getSummary(personId);
      setSummary(data);
      const person = data.person;
      
      // Add to recently viewed
      addToRecentlyViewed({
        type: 'person',
        id: person.id,
        title: person.name,
        subtitle: person.organization || person.email || person.phone || undefined,
      });
      
      // Extract first name from full name
      const nameParts = (person.name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Pre-fill form with person data
      // Handle null values explicitly - if backend returns null, set to empty string in form
      setFormData({
        name: person.name || '',
        phone: person.phone ?? '', // Use nullish coalescing to handle null explicitly
        email: person.email ?? '',
        instagramId: person.instagramId ?? '',
        label: person.label ?? '',
        source: person.source ?? '',
        leadDate: person.leadDate ? formatDateForInput(person.leadDate) : '',
        organizationId: person.organizationId ?? undefined,
        ownerId: person.ownerId ?? undefined,
        firstName: firstName,
        lastName: lastName,
        weddingDate: '', // Would come from extended person data if available
        weddingVenue: '', // Would come from extended person data if available
        weddingItinerary: '', // Would come from extended person data if available
        organizationAddress: '',
      });
    } catch (error: any) {
      console.error('Failed to load person summary:', error);
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        clearAuthSession();
        navigate('/login', { replace: true });
        return;
      }
      // Set error state but don't crash the component
      setSummary(null);
      // Show error message to user
      alert(`Failed to load person: ${error?.response?.data?.message || error?.message || 'Unknown error'}`);
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
      const allDeals = await dealsApi.list();
      const personDeals = allDeals.filter(deal => deal.personId === personId);
      setDeals(personDeals);
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
        category: values.category || 'ACTIVITY',
        type: values.type || null,
        priority: values.priority ? values.priority.toUpperCase() : null,
        personId: id ? Number(id) : null,
        dealId: values.dealId || null,
        organization: values.organization || null,
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

  const getDateForDisplay = (dateStr?: string | null): string => {
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

  const isFieldFilled = (value: string | null | undefined): boolean => {
    return !!value && value.trim() !== '';
  };

  const shouldShowField = (value: string | null | undefined): boolean => {
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
      // Helper to process field: if empty string, send empty string to clear the field
      // Some backends may require empty string instead of null to clear fields
      const processField = (value: string | undefined | null): string | undefined => {
        if (value === undefined) return undefined; // Field not in formData, don't include
        const trimmed = (value || '').trim();
        // Send empty string for clearing - backend should interpret this as clear
        // If backend doesn't accept empty string, it may need to be handled on backend side
        return trimmed === '' ? '' : trimmed;
      };
      
      // Helper for enum fields: convert empty strings to null (backend expects null/undefined, not empty string)
      const processEnumField = (value: string | undefined | null): string | null | undefined => {
        if (value === undefined) return undefined;
        const trimmed = (value || '').trim();
        return trimmed === '' ? null : trimmed; // Enum fields: send null to clear, not undefined
      };

      // Build payload - always include phone, email, instagramId, leadDate if they exist in formData
      // This ensures we can clear them by sending null
      const payload: PersonRequest = {
        name: formData.name.trim(),
        organizationId: formData.organizationId,
        ownerId: formData.ownerId,
      };

      // Always include phone field when editing - this allows us to clear it by sending empty string
      // The phone field should always exist in formData when editing a person
      const phoneValue = processField(formData.phone);
      if (phoneValue !== undefined) {
        payload.phone = phoneValue; // This will be empty string if cleared, or the trimmed value
        console.log(`Phone field in formData: "${formData.phone}", processed value:`, phoneValue, 'Type:', typeof phoneValue);
      } else {
        console.warn('Phone field is undefined in formData - this should not happen when editing');
      }
      
      // Same for other fields
      if (formData.hasOwnProperty('email')) {
        const emailValue = processField(formData.email);
        if (emailValue !== undefined) {
          payload.email = emailValue;
        }
      }
      
      if (formData.hasOwnProperty('instagramId')) {
        const instagramValue = processField(formData.instagramId);
        if (instagramValue !== undefined) {
          payload.instagramId = instagramValue;
        }
      }
      
      if (formData.hasOwnProperty('leadDate')) {
        const leadDateValue = processField(formData.leadDate);
        if (leadDateValue !== undefined) {
          payload.leadDate = leadDateValue;
        }
      }
      
      // Enum fields
      if (formData.hasOwnProperty('label')) {
        const labelValue = processEnumField(formData.label);
        if (labelValue !== undefined) {
          payload.label = labelValue;
        }
      }
      
      if (formData.hasOwnProperty('source')) {
        const sourceValue = processEnumField(formData.source);
        if (sourceValue !== undefined) {
          payload.source = sourceValue;
        }
      }

      // Log payload for debugging
      console.log('=== SAVE DEBUG ===');
      console.log('FormData phone value:', formData.phone, 'Type:', typeof formData.phone);
      console.log('Full payload:', JSON.stringify(payload, null, 2));
      console.log('Phone in payload:', payload.phone, 'Type:', typeof payload.phone, 'Is null?', payload.phone === null);
      console.log('==================');
      
      const updatedPerson = await personsApi.update(Number(id), payload);
      
      // Log response for debugging
      console.log('=== RESPONSE DEBUG ===');
      console.log('Updated person response:', updatedPerson);
      console.log('Phone value in response:', updatedPerson?.phone, 'Type:', typeof updatedPerson?.phone);
      console.log('======================');
      
      // Update form data immediately with the response to reflect cleared values
      // This ensures the UI reflects the cleared value even if reload shows old data
      if (updatedPerson) {
        setFormData(prev => ({
          ...prev,
          phone: updatedPerson.phone ?? '',
          email: updatedPerson.email ?? '',
          instagramId: updatedPerson.instagramId ?? '',
          label: updatedPerson.label ?? '',
          source: updatedPerson.source ?? '',
          leadDate: updatedPerson.leadDate ? formatDateForInput(updatedPerson.leadDate) : '',
        }));
        
        // Also update summary to reflect the changes immediately
        setSummary(prev => prev ? {
          ...prev,
          person: {
            ...prev.person,
            phone: updatedPerson.phone ?? null,
            email: updatedPerson.email ?? null,
            instagramId: updatedPerson.instagramId ?? null,
            label: updatedPerson.label ?? null,
            source: updatedPerson.source ?? null,
            leadDate: updatedPerson.leadDate ?? null,
          }
        } : null);
      }
      
      // Reload data after save to ensure consistency (with a small delay to ensure backend has processed)
      setTimeout(async () => {
        await loadPersonData(Number(id));
      }, 100);
      
      // Notify other pages (like Deals) that a person was updated
      // This triggers a refresh of persons list in Deals.tsx
      window.dispatchEvent(new CustomEvent('personUpdated', { detail: { personId: Number(id) } }));
      
      // Also set a flag in localStorage to trigger refresh in other tabs/pages
      localStorage.setItem('personUpdated', Date.now().toString());
      
      setShowSuccessToast(true);
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

  const { person: _person } = summary;
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

    // Navigate to deals page with state to open modal and pre-fill person name
    navigate('/deals', {
      state: {
        openModal: true,
        personName: summary.person.name,
      },
    });
  };

  // Early return if no ID
  if (!id) {
    return (
      <div className="person-detail-container">
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p>No person ID provided</p>
          <button onClick={() => navigate('/persons')}>Go back to Persons</button>
        </div>
      </div>
    );
  }

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

      {/* Toast Notification for Success */}
      {showSuccessToast && createPortal(
        <div className="person-detail-toast-overlay" onClick={() => setShowSuccessToast(false)}>
          <div className="person-detail-toast person-detail-toast-success" onClick={(e) => e.stopPropagation()}>
            <div className="person-detail-toast-icon-wrapper">
              <svg className="person-detail-toast-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17l-5-5" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="10" stroke="#10B981" strokeWidth="2" fill="none"/>
              </svg>
            </div>
            <div className="person-detail-toast-content">
              <div className="person-detail-toast-message">Person updated successfully!</div>
            </div>
            <div className="person-detail-toast-actions">
              <button 
                className="person-detail-toast-ok-btn" 
                onClick={() => setShowSuccessToast(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Main Content - Two Halves */}
      <div className="person-detail-main">
        {/* Left Sidebar */}
        <div className="person-detail-left">

        {/* Summary Section */}
        <div className="person-section">
          <div className="person-section-header">
            <span 
              className="person-section-title"
              onClick={() => setSummaryExpanded(!summaryExpanded)}
            >
              {summaryExpanded ? '▼' : '▶'} Summary
            </span>
            <div className="person-section-actions">
              {editingSection !== 'summary' ? (
                <button
                  type="button"
                  className="person-section-edit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingSection('summary');
                  }}
                  title="Edit summary section"
                >
                  ✏️ Edit
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="person-section-save-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSection(null);
                      void handleSave();
                    }}
                    title="Save changes"
                  >
                    ✓ Save
                  </button>
                  <button
                    type="button"
                    className="person-section-cancel-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSection(null);
                      handleCancel();
                    }}
                    title="Cancel editing"
                  >
                    ✕ Cancel
                  </button>
                </div>
              )}
            </div>
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
                {editingSection === 'summary' ? (
                  <input
                    type="email"
                    className="person-field-input"
                    value={formData.email || ''}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    placeholder="Email"
                  />
                ) : formData.email ? (
                  <div className="person-field-display">
                    <span className="person-field-icon">✉️</span>
                    <span className="person-field-value">{formData.email}</span>
                  </div>
                ) : (
                  <div className="person-field-display">
                    <span className="person-field-icon">✉️</span>
                    <span className="person-field-placeholder">No email</span>
                  </div>
                )}
              </div>
              <div className="person-field-row">
                {editingSection === 'summary' ? (
                  <input
                    type="tel"
                    className="person-field-input"
                    value={formData.phone || ''}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    placeholder="Phone number"
                  />
                ) : formData.phone ? (
                  <div className="person-field-display">
                    <span className="person-field-icon">📞</span>
                    <span className="person-field-value">{formData.phone}</span>
                  </div>
                ) : (
                  <div className="person-field-display">
                    <span className="person-field-icon">📞</span>
                    <span className="person-field-placeholder">No phone</span>
                  </div>
                )}
              </div>
              <div className="person-field-row">
                {selectedOrganization ? (
                  <div className="person-field-display">
                    <span className="person-field-icon">+</span>
                    <span className="person-field-value">{selectedOrganization.name}</span>
                  </div>
                ) : (
                  <div className="person-field-display">
                    <span className="person-field-icon">+</span>
                    <span className="person-field-placeholder">No organization</span>
                  </div>
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
              {editingSection !== 'weddingDetails' ? (
                <button
                  type="button"
                  className="person-section-edit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingSection('weddingDetails');
                  }}
                  title="Edit wedding details"
                >
                  ✏️ Edit
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="person-section-save-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSection(null);
                      void handleSave();
                    }}
                    title="Save changes"
                  >
                    ✓ Save
                  </button>
                  <button
                    type="button"
                    className="person-section-cancel-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSection(null);
                      handleCancel();
                    }}
                    title="Cancel editing"
                  >
                    ✕ Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
          {weddingDetailsExpanded && (
            <div className="person-section-content">
              {(shouldShowField(formData.firstName) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">First name</label>
                  {editingSection === 'weddingDetails' ? (
                    <input
                      type="text"
                      className="person-field-input"
                      value={formData.firstName || ''}
                      onChange={(e) => handleFieldChange('firstName', e.target.value)}
                      placeholder="First name"
                    />
                  ) : (
                    <span className="person-field-value">
                      {formData.firstName || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.weddingDate) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Wedding Date only</label>
                  {editingSection === 'weddingDetails' ? (
                    <input
                      type="date"
                      className="person-field-input"
                      value={formData.weddingDate ? (() => {
                        const parsed = parseDateDDMMYYYY(formData.weddingDate);
                        return parsed ? formatDateYYYYMMDD(parsed) : '';
                      })() : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          const date = new Date(e.target.value);
                          handleFieldChange('weddingDate', formatDateYYYYMMDD(date));
                        } else {
                          handleFieldChange('weddingDate', undefined);
                        }
                      }}
                      placeholder="Wedding date"
                    />
                  ) : (
                    <span className="person-field-value">
                      {getDateForDisplay(formData.weddingDate) || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.weddingVenue) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Wedding Venue</label>
                  {editingSection === 'weddingDetails' ? (
                    <input
                      type="text"
                      className="person-field-input"
                      value={formData.weddingVenue || ''}
                      onChange={(e) => handleFieldChange('weddingVenue', e.target.value)}
                      placeholder="Wedding venue"
                    />
                  ) : (
                    <span className="person-field-value">
                      {formData.weddingVenue || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.lastName) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Last name</label>
                  {editingSection === 'weddingDetails' ? (
                    <input
                      type="text"
                      className="person-field-input"
                      value={formData.lastName || ''}
                      onChange={(e) => handleFieldChange('lastName', e.target.value)}
                      placeholder="Last name"
                    />
                  ) : (
                    <span className="person-field-value">
                      {formData.lastName || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.weddingItinerary) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Wedding Itinerary</label>
                  {editingSection === 'weddingDetails' ? (
                    <input
                      type="text"
                      className="person-field-input"
                      value={formData.weddingItinerary || ''}
                      onChange={(e) => handleFieldChange('weddingItinerary', e.target.value)}
                      placeholder="Wedding itinerary"
                    />
                  ) : (
                    <span className="person-field-value">
                      {formData.weddingItinerary || ''}
                    </span>
                  )}
                </div>
              )}
              {(shouldShowField(formData.instagramId) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Instagram ID</label>
                  <div className="person-field-input-wrapper">
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
                      <>
                        <span className="person-field-value">
                          {formData.instagramId || ''}
                        </span>
                        <button
                          type="button"
                          className="person-field-edit-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingField('instagramId');
                          }}
                          title="Edit Instagram ID"
                        >
                          ✏️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {(shouldShowField(formData.source) || !showOnlyFilledFields) && (
                <div className="person-field-row">
                  <label className="person-field-label">Person Source</label>
                  {editingSection === 'weddingDetails' ? (
                    <select
                      className="person-field-input"
                      value={formData.source || ''}
                      onChange={(e) => handleFieldChange('source', e.target.value)}
                    >
                      <option value="">Select Source</option>
                      {sources.map((option) => (
                        <option key={option.code} value={option.code}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="person-field-value">
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
                  {editingSection === 'weddingDetails' && (editingField === 'leadDate' || leadDatePickerOpen) ? (
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
                  ) : editingSection === 'weddingDetails' ? (
                    <input
                      type="date"
                      className="person-field-input"
                      value={formData.leadDate ? formatDateYYYYMMDD(parseDateDDMMYYYY(formData.leadDate) || new Date()) : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          const date = new Date(e.target.value);
                          handleFieldChange('leadDate', formatDateYYYYMMDD(date));
                        } else {
                          handleFieldChange('leadDate', undefined);
                        }
                      }}
                      placeholder="Lead date"
                    />
                  ) : (
                    <span className="person-field-value">
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
          </div>
          {organizationExpanded && (
            <div className="person-section-content">
              <div className="person-field-row">
                <span className="person-field-icon">🏢</span>
                <span className="person-field-value">
                  {selectedOrganization?.name || 'No organization'}
                </span>
            </div>
              <div className="person-field-row">
                <label className="person-field-label">Address</label>
                <span className="person-field-value">
                  {formData.organizationAddress || ''}
                </span>
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
                                <span className="deal-activity-deal-icon">₹</span>
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
                                  <span className="deal-history-deal-icon">₹</span>
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
        initialOrganization={summary?.person?.organization || undefined}
      />
    </div>
  );
}
