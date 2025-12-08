import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { dealsApi } from '../services/deals';
import { personsApi } from '../services/api';
import { organizationsApi } from '../services/organizations';
import { pipelinesApi } from '../services/pipelines';
import { activitiesApi, type Activity } from '../services/activities';
import { usersApi } from '../services/users';
import { teamsApi } from '../services/teams';
import type { User } from '../types/user';
import type { Team } from '../types/team';
import { clearAuthSession, getStoredUser } from '../utils/authToken';
import { addToRecentlyViewed } from '../utils/recentlyViewed';
import type { Deal, DealCreateRequest, DealUpdateRequest, DealSource, DealSubSource } from '../types/deal';
import type { Person } from '../types/person';
import type { Organization } from '../types/organization';
import type { Pipeline } from '../types/pipeline';
import ActivityModal, { type ActivityFormValues } from '../components/ActivityModal';
import MarkAsLostModal from '../components/MarkAsLostModal';
import DealValueModal from '../components/DealValueModal';
import { getAllEventDates, normalizeEventDatesForRequest } from '../utils/dealDates';
import './DealDetail.css';

type ActiveTab = 'Activity' | 'Notes' | 'Meeting scheduler' | 'Call' | 'Email' | 'Send quote' | 'Send Contract' | 'Share Worklinks';

// Source and Sub-Source constants
const DEAL_SOURCE_OPTIONS: Array<{ value: DealSource; label: string }> = [
  { value: 'Direct', label: 'Direct' },
  { value: 'Divert', label: 'Divert' },
  { value: 'Reference', label: 'Reference' },
  { value: 'Planner', label: 'Planner' },
];

const DEAL_SUB_SOURCE_OPTIONS: Array<{ value: DealSubSource; label: string }> = [
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Whatsapp', label: 'Whatsapp' },
  { value: 'Landing Page', label: 'Landing Page' },
  { value: 'Email', label: 'Email' },
];

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
  const [persons, setPersons] = useState<Person[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageDurations, setStageDurations] = useState<Record<number, number>>({});
  const [_loadingStageDurations, setLoadingStageDurations] = useState(false);
  const [hoveredStageId, setHoveredStageId] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('Activity');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showMarkAsLostModal, setShowMarkAsLostModal] = useState(false);
  const [showDealValueModal, setShowDealValueModal] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [_focusedActivities, _setFocusedActivities] = useState<Set<number>>(new Set());
  const [expandAllFocus, setExpandAllFocus] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [pendingDoneActivity, setPendingDoneActivity] = useState<Activity | null>(null);
  const [pendingDoneValue, setPendingDoneValue] = useState(false);
  const [pendingDurationValue, setPendingDurationValue] = useState('');
  const [pendingAttachmentFile, setPendingAttachmentFile] = useState<File | null>(null);
  const [pendingAttachmentPreview, setPendingAttachmentPreview] = useState<string | null>(null);
  const [pendingUploading, setPendingUploading] = useState(false);
  const [pendingDialogPosition, setPendingDialogPosition] = useState<{ top: number; left: number } | null>(null);
  const [durationEntries, setDurationEntries] = useState<Record<number, string>>({});
  const [screenshotViewerActivity, setScreenshotViewerActivity] = useState<Activity | null>(null);
  const [screenshotViewerImageUrl, setScreenshotViewerImageUrl] = useState<string | null>(null);
  const [screenshotReplacementFile, setScreenshotReplacementFile] = useState<File | null>(null);
  const [screenshotReplacementPreview, setScreenshotReplacementPreview] = useState<string | null>(null);
  const [screenshotReplacing, setScreenshotReplacing] = useState(false);

  // Collapsible sections state
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [associationsExpanded, setAssociationsExpanded] = useState(true);
  const [eventInfoExpanded, setEventInfoExpanded] = useState(true);
  const [additionalInfoExpanded, setAdditionalInfoExpanded] = useState(true);
  const [overviewExpanded, setOverviewExpanded] = useState(true);
  const [_focusExpanded, _setFocusExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [eventDatePickerOpen, setEventDatePickerOpen] = useState(false);
  const [_eventDateCalendarMonth, _setEventDateCalendarMonth] = useState(new Date());
  const [isStageDropdownOpen, setIsStageDropdownOpen] = useState(false);
  const stageDropdownRef = useRef<HTMLDivElement>(null);
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const ownerDropdownRef = useRef<HTMLDivElement>(null);

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
    eventDates?: string[];
    commissionAmount?: string;
    probability?: number | null;
    expectedCloseDate?: string | null;
    source?: string;
    subSource?: string;
    ownerId?: number | null;
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
    eventDates: [],
    commissionAmount: '',
    probability: null,
    expectedCloseDate: null,
    source: '',
    subSource: '',
    ownerId: null,
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

  // Load stage durations for a deal
  const loadStageDurations = async (dealId: number) => {
    setLoadingStageDurations(true);
    try {
      const durations = await dealsApi.getStageDurations(dealId);
      setStageDurations(durations);
    } catch (error) {
      console.error('Failed to load stage durations:', error);
      // If API doesn't exist yet, use empty object (backend not implemented)
      setStageDurations({});
    } finally {
      setLoadingStageDurations(false);
    }
  };

  // Close stage dropdown and owner dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stageDropdownRef.current && !stageDropdownRef.current.contains(event.target as Node)) {
        setIsStageDropdownOpen(false);
      }
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(event.target as Node)) {
        setIsOwnerDropdownOpen(false);
        setOwnerSearchQuery('');
      }
    };

    if (isStageDropdownOpen || isOwnerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStageDropdownOpen, isOwnerDropdownOpen]);

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
        eventDates: [],
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
      const [orgs, pipelineData, personsData, usersData, teamsData] = await Promise.allSettled([
        organizationsApi.list(),
        pipelinesApi.list({ includeStages: true }),
        personsApi.list({ page: 0, size: 200, sort: 'name,asc' }),
        usersApi.list(),
        teamsApi.list(),
      ]);
      
      if (orgs.status === 'fulfilled') {
        setOrganizations(orgs.value);
      }
      if (pipelineData.status === 'fulfilled') {
        setPipelines(pipelineData.value);
      }
      if (personsData.status === 'fulfilled') {
        setPersons(personsData.value.content || []);
      }
      if (usersData.status === 'fulfilled') {
        // Filter users to only include SALES and PRESALES roles
        const salesAndPresalesUsers = usersData.value.filter(user => 
          user.role === 'SALES' || user.role === 'PRESALES'
        );
        setUsers(salesAndPresalesUsers);
      }
      if (teamsData.status === 'fulfilled') {
        setTeams(teamsData.value);
      }
    } catch (error) {
      console.error('Failed to load dropdown data:', error);
    }
  };

  const loadDealData = async (dealId: number) => {
    setLoading(true);
    try {
      const dealData = await dealsApi.get(dealId);
      setDeal(dealData);
      
      // Add to recently viewed
      addToRecentlyViewed({
        type: 'deal',
        id: dealData.id,
        title: dealData.name,
        subtitle: dealData.personId ? `Person ID: ${dealData.personId}` : 'No person',
        status: dealData.status,
        value: dealData.value || undefined,
      });
      
      console.log('Loaded deal data:', dealData);
      console.log('Deal source:', dealData.source);
      console.log('Deal subSource:', dealData.subSource);
      
      // Load stage durations
      await loadStageDurations(dealId);

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

      // Load organization owner if organizationId exists
      let defaultOwnerId: number | null = dealData.ownerId || null;
      if (dealData.organizationId && !defaultOwnerId) {
        try {
          const orgData = await organizationsApi.get(dealData.organizationId);
          if (orgData.owner?.id) {
            defaultOwnerId = orgData.owner.id;
          }
        } catch (error) {
          console.error('Failed to load organization data:', error);
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
        categoryId: typeof dealData.categoryId === 'number' ? dealData.categoryId : (typeof dealData.categoryId === 'string' ? Number(dealData.categoryId) || null : null),
        eventType: dealData.eventType || '',
        venue: dealData.venue || '',
        phoneNumber: dealData.phoneNumber || personPhone || '',
        email: dealData.email || personEmail || '',
        eventDate: dealData.eventDate ? formatDateForInput(dealData.eventDate) : '',
        eventDates: getAllEventDates(dealData),
        commissionAmount: dealData.commissionAmount?.toString() || '',
        source: dealData.source || '',
        subSource: dealData.subSource || '',
        ownerId: defaultOwnerId,
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
      minute: '2-digit',
      hour12: true
    });
  };

  const formatCurrency = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '₹0.00';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
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

  // Get activity color class based on date
  const getActivityColorClass = (activity: Activity): string => {
    const dateStr = activity.date || activity.dueDate;
    if (isToday(dateStr)) return 'deal-activity-today';
    if (isPast(dateStr)) return 'deal-activity-past';
    return 'deal-activity-future';
  };

  // Helper function to normalize category label
  const normalizeCategoryLabel = (cat?: string | null): 'Activity' | 'Call' | 'Meeting scheduler' => {
    if (!cat) return 'Activity';
    if (cat === 'CALL') return 'Call';
    if (cat === 'MEETING_SCHEDULER') return 'Meeting scheduler';
    return 'Activity';
  };

  // Helper function to parse time string to minutes
  const parseTimeToMinutes = (time?: string | null): number | null => {
    if (!time) return null;
    const [hoursStr, minutesStr] = time.split(':');
    const hours = Number(hoursStr);
    const minutes = Number(minutesStr);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  };

  // Helper function to parse duration input to minutes
  const parseDurationInputToMinutes = (value: string): number | null => {
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

  // Helper function to format minutes to HH:MM
  const formatMinutesToHHMM = (minutes: number): string => {
    const safeMinutes = Math.max(0, minutes);
    const hours = Math.floor(safeMinutes / 60);
    const remainingMinutes = safeMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
  };

  // Handle pending attachment input
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

  // Handle pending done cancel
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

  // Handle pending done confirm
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
      if (pendingAttachmentFile) {
        try {
          await activitiesApi.uploadScreenshot(pendingDoneActivity.id, pendingAttachmentFile);
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
      if (updatedActivity && id) {
        await loadActivities(Number(id));
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

  // Complete toggle done (without modal)
  const completeToggleDone = async (activityId: number, done: boolean) => {
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

  // Open screenshot viewer
  const openScreenshotViewer = (activity: Activity) => {
    if (activity.attachmentUrl) {
      setScreenshotViewerActivity(activity);
      setScreenshotViewerImageUrl(activity.attachmentUrl);
      setScreenshotReplacementFile(null);
      setScreenshotReplacementPreview(null);
    }
  };

  // Close screenshot viewer
  const closeScreenshotViewer = () => {
    // Clean up preview URL if it exists
    if (screenshotReplacementPreview && screenshotReplacementPreview.startsWith('blob:')) {
      URL.revokeObjectURL(screenshotReplacementPreview);
    }
    setScreenshotViewerActivity(null);
    setScreenshotViewerImageUrl(null);
    setScreenshotReplacementFile(null);
    setScreenshotReplacementPreview(null);
    setScreenshotReplacing(false);
  };

  // Handle screenshot replacement file input
  const handleScreenshotReplacementInput = (files?: FileList | null) => {
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
  };

  // Handle screenshot replacement
  const handleScreenshotReplacement = async () => {
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
      if (id) {
        await loadActivities(Number(id));
      }
      alert('Screenshot replaced successfully!');
    } catch (error: any) {
      console.error('Failed to replace screenshot:', error);
      alert(`Failed to replace screenshot: ${error?.message || 'Unknown error'}`);
    } finally {
      setScreenshotReplacing(false);
    }
  };

  // Mark activity as done and move to history (or undo and move back to focus)
  const markActivityDone = async (activityId: number, done: boolean, clickPosition?: { top: number; left: number }) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) {
      await completeToggleDone(activityId, done);
      return;
    }

    // Check if it's a call activity being marked as done
    const category = normalizeCategoryLabel(activity.category);
    if (category === 'Call' && done) {
      setPendingDoneActivity(activity);
      setPendingDoneValue(done);
      setPendingDurationValue(durationEntries[activity.id] ?? '');
      setPendingAttachmentFile(null);
      // If activity already has an attachment URL, use it as preview
      setPendingAttachmentPreview(activity.attachmentUrl || null);
      setPendingDialogPosition(clickPosition || null);
      setOpenMenuId(null); // Close menu when modal opens
      return;
    }
    
    await completeToggleDone(activityId, done);
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

  // Check if deal has incomplete activities (for Qualified stage validation)
  const checkIncompleteActivities = async (deal: Deal): Promise<boolean> => {
    if (!deal.pipelineId || !deal.stageId) return false;

    const pipeline = pipelines.find(p => p.id === deal.pipelineId);
    if (!pipeline) return false;

    // Check if deal is in "Qualified" stage
    const currentStage = pipeline.stages.find(s => s.id === deal.stageId);
    if (!currentStage) return false;

    const stageName = currentStage.name.toLowerCase().trim();
    const isQualified = stageName === 'qualified';
    
    // Only check for deals in Qualified stage
    if (!isQualified) return false;

    try {
      // Get all activities - we'll filter by dealId in the response
      const activitiesResponse = await activitiesApi.list({ page: 0, size: 1000 });
      const allActivities = activitiesResponse.content || [];
      // Filter activities for this deal
      const dealActivities = allActivities.filter(activity => activity.dealId === deal.id);

      // Check for the two required activities
      const requiredActivities = ['Make first call', 'Send Quotes'];
      const incompleteActivities = dealActivities.filter(activity => 
        requiredActivities.includes(activity.subject || '') && !activity.done
      );

      return incompleteActivities.length > 0;
    } catch (err) {
      console.error(`Failed to check activities for deal ${deal.id}:`, err);
      // If we can't check, allow the operation (fail open)
      return false;
    }
  };

  // Function to get team manager from pipeline
  const getTeamManagerFromPipeline = (pipeline: Pipeline): number | null => {
    if (!pipeline.teamId) return null;
    
    // Find the team in the teams list
    const team = teams.find(t => t.id === pipeline.teamId);
    if (!team || !team.manager) return null;
    
    return team.manager.id;
  };

  // Function to create activities when deal is moved to Qualified stage
  const createQualifiedStageActivities = async (deal: Deal) => {
    console.log(`[createQualifiedStageActivities] Called for deal ${deal.id}`);
    
    if (!deal.pipelineId) {
      console.warn(`[createQualifiedStageActivities] Deal ${deal.id} has no pipelineId, skipping activity creation`);
      return;
    }

    const pipeline = pipelines.find(p => p.id === deal.pipelineId);
    if (!pipeline) {
      console.warn(`[createQualifiedStageActivities] Pipeline ${deal.pipelineId} not found for deal ${deal.id}, skipping activity creation`);
      return;
    }

    // Get user for activity assignment (with fallbacks)
    let assignedUserName = 'Unassigned';
    let assignedUserId: number | null = null;
    
    // Helper function to fetch user by ID if not in local array
    const getUserById = async (userId: number): Promise<User | null> => {
      // First try local users array
      let user = users.find(u => u.id === userId);
      if (user) {
        return user;
      }
      
      // If not found, fetch all users and try again
      try {
        console.log(`[createQualifiedStageActivities] User ${userId} not in local array, fetching all users...`);
        const allUsers = await usersApi.list();
        user = allUsers.find(u => u.id === userId);
        if (user) {
          console.log(`[createQualifiedStageActivities] Found user ${userId} in API: ${user.firstName} ${user.lastName}`);
          return user;
        }
      } catch (err) {
        console.error(`[createQualifiedStageActivities] Failed to fetch user ${userId}:`, err);
      }
      
      return null;
    };
    
    // PRIMARY: Try to get team manager from pipeline's team
    const teamManagerId = getTeamManagerFromPipeline(pipeline);
    if (teamManagerId) {
      const assignedUser = await getUserById(teamManagerId);
      if (assignedUser) {
        // Construct full name from firstName and lastName
        const firstName = (assignedUser.firstName || '').trim();
        const lastName = (assignedUser.lastName || '').trim();
        assignedUserName = [firstName, lastName].filter(Boolean).join(' ') || assignedUser.email || 'Unassigned';
        assignedUserId = assignedUser.id;
        console.log(`[createQualifiedStageActivities] Assigned user for activities (team manager): ${assignedUserName} (ID: ${assignedUserId})`);
      } else {
        console.warn(`[createQualifiedStageActivities] Team manager user ${teamManagerId} not found`);
      }
    } else {
      console.warn(`[createQualifiedStageActivities] No team manager found for pipeline ${pipeline.id}`);
    }
    
    // FALLBACK 1: Try to use deal owner if team manager not found
    if (!assignedUserId && deal.ownerId) {
      const dealOwner = await getUserById(deal.ownerId);
      if (dealOwner) {
        const firstName = (dealOwner.firstName || '').trim();
        const lastName = (dealOwner.lastName || '').trim();
        assignedUserName = [firstName, lastName].filter(Boolean).join(' ') || dealOwner.email || 'Unassigned';
        assignedUserId = dealOwner.id;
        console.log(`[createQualifiedStageActivities] Assigned user for activities (deal owner fallback): ${assignedUserName} (ID: ${assignedUserId})`);
      } else {
        console.warn(`[createQualifiedStageActivities] Deal owner user ${deal.ownerId} not found`);
      }
    }
    
    // FALLBACK 2: Try to use organization owner if deal owner not found
    if (!assignedUserId && deal.organizationId) {
      const organization = organizations.find(o => o.id === deal.organizationId);
      if (organization && organization.owner && organization.owner.id) {
        const orgOwner = await getUserById(organization.owner.id);
        if (orgOwner) {
          const firstName = (orgOwner.firstName || '').trim();
          const lastName = (orgOwner.lastName || '').trim();
          assignedUserName = [firstName, lastName].filter(Boolean).join(' ') || orgOwner.email || 'Unassigned';
          assignedUserId = orgOwner.id;
          console.log(`[createQualifiedStageActivities] Assigned user for activities (organization owner fallback): ${assignedUserName} (ID: ${assignedUserId})`);
        } else {
          console.warn(`[createQualifiedStageActivities] Organization owner user ${organization.owner.id} not found`);
        }
      }
    }
    
    // If still no user assigned, log error
    if (!assignedUserId) {
      console.error(`[createQualifiedStageActivities] CRITICAL: Cannot assign activities for deal ${deal.id} - no team manager, deal owner, or organization owner found. Pipeline: ${pipeline.id}, Team: ${pipeline.teamId}, Deal Owner: ${deal.ownerId}, Organization: ${deal.organizationId}`);
    }

    // Get person and organization for activity details
    let person: Person | null = null;
    if (deal.personId) {
      person = persons.find(p => p.id === deal.personId) || null;
      if (!person || !person.phone) {
        console.log(`[createQualifiedStageActivities] Person not found in local array or missing phone, fetching from API...`);
        try {
          const personsResponse = await personsApi.list({ page: 0, size: 1000 });
          const allPersons = personsResponse.content || [];
          const foundPerson = allPersons.find(p => p.id === deal.personId);
          if (foundPerson) {
            person = foundPerson;
            console.log(`[createQualifiedStageActivities] Found person in API response:`, { id: person.id, name: person.name, phone: person.phone });
          } else {
            console.warn(`[createQualifiedStageActivities] Person ${deal.personId} not found in API response`);
          }
        } catch (err) {
          console.warn(`[createQualifiedStageActivities] Failed to fetch persons from API:`, err);
        }
      }
    }
    console.log(`[createQualifiedStageActivities] Person for deal ${deal.id}:`, person ? { id: person.id, name: person.name, phone: person.phone } : 'not found');
    const organization = organizations.find(o => o.id === deal.organizationId);
    console.log(`[createQualifiedStageActivities] Organization for deal ${deal.id}:`, organization ? { id: organization.id, name: organization.name } : 'not found');

    // Check if activities already exist
    let dealActivities: Activity[] = [];
    try {
      const activitiesResponse = await activitiesApi.list({ page: 0, size: 1000 });
      const allActivities = activitiesResponse.content || [];
      dealActivities = allActivities.filter(activity => activity.dealId === deal.id);
      const hasMakeFirstCall = dealActivities.some(a => a.subject === 'Make first call');
      const hasSendQuotes = dealActivities.some(a => a.subject === 'Send Quotes');
      
      if (hasMakeFirstCall && hasSendQuotes) {
        console.log(`[createQualifiedStageActivities] Activities already exist for deal ${deal.id}, skipping creation`);
        return;
      }
      console.log(`[createQualifiedStageActivities] Existing activities check: Make first call=${hasMakeFirstCall}, Send Quotes=${hasSendQuotes}`);
    } catch (checkErr) {
      console.warn(`[createQualifiedStageActivities] Failed to check existing activities, proceeding with creation:`, checkErr);
    }

    // Create activities only if person has a phone number
    if (person && person.phone && person.phone.trim() !== '') {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      const todayStr = `${day}/${month}/${year}`;

      // Create "Make first call" activity
      if (!dealActivities.some(a => a.subject === 'Make first call')) {
        console.log(`[createQualifiedStageActivities] Creating "Make first call" activity for deal ${deal.id}`);
        await activitiesApi.create({
          subject: 'Make first call',
          category: 'Call',
          dealId: deal.id,
          personId: deal.personId || null,
          organizationId: deal.organizationId || null,
          organization: organization?.name || null,
          assignedUser: assignedUserName,
          assignedUserId: assignedUserId || undefined,
          date: todayStr,
          dueDate: todayStr,
        });
      }

      // Create "Send Quotes" activity
      if (!dealActivities.some(a => a.subject === 'Send Quotes')) {
        console.log(`[createQualifiedStageActivities] Creating "Send Quotes" activity for deal ${deal.id}`);
        await activitiesApi.create({
          subject: 'Send Quotes',
          category: 'Activity',
          dealId: deal.id,
          personId: deal.personId || null,
          organizationId: deal.organizationId || null,
          organization: organization?.name || null,
          assignedUser: assignedUserName,
          assignedUserId: assignedUserId || undefined,
          date: todayStr,
          dueDate: todayStr,
        });
      }
    } else {
      console.warn(`[createQualifiedStageActivities] Person ${deal.personId} has no phone number, skipping activity creation`);
    }
  };

  // Handle stage update with validation
  const handleStageUpdate = async (dealId: number, stageId: number) => {
    if (!deal) {
      setErrorMessage('Deal not found');
      setShowErrorToast(true);
      setTimeout(() => {
        setShowErrorToast(false);
        setErrorMessage(null);
      }, 5000);
      return;
    }

    // Check if moving from Lead In stage - require contact number
    const pipeline = pipelines.find(p => p.id === deal.pipelineId);
    if (pipeline) {
      const currentStage = pipeline.stages.find(s => s.id === deal.stageId);
      const targetStage = pipeline.stages.find(s => s.id === stageId);
      
      if (currentStage && targetStage) {
        const currentStageName = currentStage.name.toLowerCase().trim();
        const isCurrentlyLeadIn = currentStageName === 'lead in' || currentStageName === 'leadin' || currentStageName === 'lead-in';
        
        // If currently in Lead In and trying to move forward to a different stage
        if (isCurrentlyLeadIn && currentStage.id !== targetStage.id) {
          const isMovingForward = targetStage.order > currentStage.order;
          
          // Only validate when moving forward (not backward)
          if (isMovingForward) {
            // Check if the associated person has a contact number
            if (deal.personId) {
              const personForCheck = persons.find(p => p.id === deal.personId) || person;
              const hasContactNumber = personForCheck && personForCheck.phone && personForCheck.phone.trim() !== '';
              
              if (!hasContactNumber) {
                const errorMessage = 'Please add the contact number for moving the deal to the next stage.';
                setErrorMessage(errorMessage);
                setShowErrorToast(true);
                setTimeout(() => {
                  setShowErrorToast(false);
                  setErrorMessage(null);
                }, 5000);
                return;
              }
            }
          }
        }
        
        const isCurrentlyQualified = currentStageName === 'qualified';
        
        // If currently in Qualified and trying to move to a different stage
        if (isCurrentlyQualified && currentStage.id !== targetStage.id) {
          // Check if moving forward (to a next stage)
          const isMovingForward = targetStage.order > currentStage.order;
          
          // Only validate when moving forward (not backward)
          if (isMovingForward) {
            // Check if deal has incomplete activities
            const hasIncompleteActivities = await checkIncompleteActivities(deal);
            
            // Check if deal has a value (value should be > 0)
            const hasDealValue = deal.value != null && deal.value > 0;
            
            // Build error messages based on what's missing
            const errorMessages: string[] = [];
            
            if (hasIncompleteActivities) {
              errorMessages.push('Please complete the assigned activities first to shift the deal to next stage.');
            }
            
            if (!hasDealValue) {
              errorMessages.push('Please add the deal value to move the deal to the next stage.');
            }
            
            // If there are any validation errors, show them
            if (errorMessages.length > 0) {
              const errorMessage = errorMessages.join(' ');
              setErrorMessage(errorMessage);
              setShowErrorToast(true);
              setTimeout(() => {
                setShowErrorToast(false);
                setErrorMessage(null);
              }, 5000);
              return;
            }
          } else {
            // Moving backward - only check activities
            const hasIncompleteActivities = await checkIncompleteActivities(deal);
            if (hasIncompleteActivities) {
              const errorMessage = "Can't go back to the previous stage, please finish your assigned activities to move to the next stage.";
              setErrorMessage(errorMessage);
              setShowErrorToast(true);
              setTimeout(() => {
                setShowErrorToast(false);
                setErrorMessage(null);
              }, 5000);
              return;
            }
          }
        }
      }
    }

    try {
      // Store the original stage before moving to check if we're moving back to Qualified
      const originalStage = pipeline?.stages.find(s => s.id === deal.stageId);
      const qualifiedStage = pipeline?.stages.find(s => {
        const sName = s.name.toLowerCase().trim();
        return sName === 'qualified';
      });
      
      const updatedDeal = await dealsApi.moveToStage(dealId, { stageId });
      setDeal(updatedDeal);
      setFormData(prev => ({
        ...prev,
        stageId: updatedDeal.stageId || null,
      }));
      
      // Reload stage durations after stage change
      await loadStageDurations(dealId);
      
      // Check if deal was moved to Qualified stage and create activities
      // Only create activities from frontend if deal was NOT created by bot
      if (updatedDeal.pipelineId && updatedDeal.stageId && updatedDeal.createdBy !== 'BOT') {
        const pipeline = pipelines.find(p => p.id === updatedDeal.pipelineId);
        if (pipeline) {
          const currentStage = pipeline.stages.find(s => s.id === updatedDeal.stageId);
          if (currentStage) {
            const stageName = currentStage.name.toLowerCase().trim();
            const isQualified = stageName === 'qualified';
            if (isQualified && qualifiedStage) {
              // Only create activities if we're NOT moving back from a later stage
              const isMovingBackToQualified = originalStage && originalStage.order > qualifiedStage.order;
              if (!isMovingBackToQualified) {
                await createQualifiedStageActivities(updatedDeal);
                // Reload activities after creating new ones
                if (id) {
                  await loadActivities(Number(id));
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to update stage.';
      setErrorMessage(message);
      setShowErrorToast(true);
      setTimeout(() => {
        setShowErrorToast(false);
        setErrorMessage(null);
      }, 5000);
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };
      // If source changes, clear subSource if source is not "Direct"
      if (field === 'source' && value !== 'Direct') {
        newData.subSource = '';
      }
      // If organization changes, update ownerId to organization's owner
      if (field === 'organizationId' && value) {
        const selectedOrg = organizations.find(org => org.id === value);
        if (selectedOrg?.owner?.id) {
          newData.ownerId = selectedOrg.owner.id;
        } else {
          newData.ownerId = null;
        }
      }
      return newData;
    });
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
        ...normalizeEventDatesForRequest(formData.eventDate || null, formData.eventDates || null),
        commissionAmount: formData.commissionAmount ? parseFloat(formData.commissionAmount) : null,
        source: formData.source ? (formData.source as DealSource) : null,
        subSource: formData.subSource ? (formData.subSource as DealSubSource) : null,
        ownerId: formData.ownerId || null,
      };

      console.log('Saving deal with payload:', payload);

      if (isNewDeal) {
        // Create new deal
        // Set createdBy to 'USER' when creating from frontend
        const createPayload: DealCreateRequest = {
          ...payload,
          createdBy: 'USER',
        };
        const createdDeal = await dealsApi.create(createPayload);
        console.log('Deal created successfully:', createdDeal);
        alert('Deal created successfully');
        // Navigate to deals page
        navigate('/deals');
      } else if (id) {
        // Helper function to parse deal value - if empty, return 0 (not null) to clear the deal value
        const parseDealValue = (value: string | null | undefined): number => {
          if (value === null || value === undefined || value.trim() === '') return 0;
          const parsed = parseFloat(value);
          return isNaN(parsed) ? 0 : parsed;
        };

        // Helper function to parse commission amount - if empty, return null (optional field)
        const parseCommissionAmount = (value: string | null | undefined): number | null => {
          if (value === null || value === undefined || value.trim() === '') return null;
          const parsed = parseFloat(value);
          return isNaN(parsed) ? null : parsed;
        };

        // Update existing deal - use DealUpdateRequest (all fields optional)
        const updatePayload: DealUpdateRequest = {
          name: formData.name.trim(),
          value: parseDealValue(formData.value),
          status: formData.status as any,
          personId: formData.personId || null,
          organizationId: formData.organizationId !== undefined && formData.organizationId !== null ? formData.organizationId : null,
          pipelineId: formData.pipelineId || null,
          stageId: formData.stageId || null,
          categoryId: formData.categoryId || null,
          eventType: toNullIfEmpty(formData.eventType),
          venue: toNullIfEmpty(formData.venue),
          phoneNumber: toNullIfEmpty(formData.phoneNumber),
          email: toNullIfEmpty(formData.email),
          ...normalizeEventDatesForRequest(formData.eventDate || null, formData.eventDates || null),
          commissionAmount: parseCommissionAmount(formData.commissionAmount),
          source: formData.source ? (formData.source as DealSource) : undefined,
          subSource: (formData.source === 'Direct' && formData.subSource) ? (formData.subSource as DealSubSource) : undefined,
          ownerId: formData.ownerId || null,
      };
        console.log('Updating deal ID:', id, 'with payload:', updatePayload);
        const updatedDeal = await dealsApi.update(Number(id), updatePayload);
        console.log('Deal updated successfully:', updatedDeal);
        
        // Update local state with the response from API to ensure UI reflects saved values
        setDeal(updatedDeal);
        
        // Update formData with the response to keep form in sync
        setFormData((prev) => ({
          ...prev,
          name: updatedDeal.name || prev.name,
          value: updatedDeal.value?.toString() || '0',
          status: updatedDeal.status || prev.status,
          personId: updatedDeal.personId || null,
          organizationId: updatedDeal.organizationId || null,
          pipelineId: updatedDeal.pipelineId || null,
          stageId: updatedDeal.stageId || null,
          categoryId: typeof updatedDeal.categoryId === 'number' ? updatedDeal.categoryId : (typeof updatedDeal.categoryId === 'string' ? Number(updatedDeal.categoryId) || null : null),
          eventType: updatedDeal.eventType || '',
          venue: updatedDeal.venue || '',
          phoneNumber: updatedDeal.phoneNumber || '',
          email: updatedDeal.email || '',
          eventDate: updatedDeal.eventDate ? formatDateForInput(updatedDeal.eventDate) : '',
          eventDates: getAllEventDates(updatedDeal),
          commissionAmount: updatedDeal.commissionAmount?.toString() || '',
          source: updatedDeal.source || '',
          subSource: updatedDeal.subSource || '',
        }));
        
        setShowSuccessToast(true);
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
        categoryId: typeof deal.categoryId === 'number' ? deal.categoryId : (typeof deal.categoryId === 'string' ? Number(deal.categoryId) || null : null),
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

  // Handle status update (WON/LOST/Reopen)
  const handleStatusUpdate = async (newStatus: 'WON' | 'LOST' | 'IN_PROGRESS') => {
    if (!id || isNewDeal || !deal) return;
    
    // If marking as LOST, show the modal to select a reason
    if (newStatus === 'LOST') {
      setShowMarkAsLostModal(true);
      return;
    }
    
    // Only validate when marking as WON (not when reopening)
    if (newStatus === 'WON') {
      // Note: We'll always show the modal to allow editing value, so no need to check hasDealValue here
      
      // Check if deal is in Qualified stage (only validate activities for deals in Qualified stage)
      const pipeline = pipelines.find(p => p.id === deal.pipelineId);
      let hasIncompleteActivities = false;
      
      if (pipeline) {
        const currentStage = pipeline.stages.find(s => s.id === deal.stageId);
        if (currentStage) {
          const currentStageName = currentStage.name.toLowerCase().trim();
          const isCurrentlyQualified = currentStageName === 'qualified';
          
          // Only validate activities if deal is in Qualified stage
          if (isCurrentlyQualified) {
            // Check if deal has incomplete activities
            hasIncompleteActivities = await checkIncompleteActivities(deal);
            
            if (hasIncompleteActivities) {
              const errorMessage = 'Please complete the assigned activities first to mark the deal as WON.';
              setErrorMessage(errorMessage);
              setShowErrorToast(true);
              // Auto-hide after 5 seconds
              setTimeout(() => {
                setShowErrorToast(false);
                setErrorMessage(null);
              }, 5000);
              return;
            }
          }
        }
      }
      
      // Always show modal when marking as WON to allow editing value and commission
      setShowDealValueModal(true);
      return;
    }
    
    try {
      const updatedDeal = await dealsApi.updateStatus(Number(id), { status: newStatus });
      setDeal(updatedDeal);
      setFormData((prev) => ({ ...prev, status: newStatus }));
      // Reload deal data to get latest state
      await loadDealData(Number(id));
    } catch (error: any) {
      console.error('Failed to update status:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to update status.';
      setErrorMessage(errorMessage);
      setShowErrorToast(true);
      setTimeout(() => {
        setShowErrorToast(false);
        setErrorMessage(null);
      }, 5000);
    }
  };

  const handleMarkAsLost = async (lostReason: string) => {
    if (!id || isNewDeal || !deal) return;
    
    // Check if deal is in Qualified stage (only validate for deals in Qualified stage)
    const pipeline = pipelines.find(p => p.id === deal.pipelineId);
    if (pipeline) {
      const currentStage = pipeline.stages.find(s => s.id === deal.stageId);
      if (currentStage) {
        const currentStageName = currentStage.name.toLowerCase().trim();
        const isCurrentlyQualified = currentStageName === 'qualified';
        
        // Only validate if deal is in Qualified stage
        if (isCurrentlyQualified) {
          // Check if deal has incomplete activities
          const hasIncompleteActivities = await checkIncompleteActivities(deal);
          
          // Check if deal has a value (value should be > 0) - only required if lost reason is "Budget"
          const hasDealValue = deal.value != null && deal.value > 0;
          const isBudgetReason = lostReason === 'Budget';
          
          // Build error messages based on what's missing
          const errorMessages: string[] = [];
          
          if (hasIncompleteActivities) {
            errorMessages.push('Please complete the assigned activities first to mark the deal as LOST.');
          }
          
          // Only check deal value if the lost reason is "Budget"
          if (isBudgetReason && !hasDealValue) {
            errorMessages.push('Please add the deal value to mark the deal as LOST.');
          }
          
          // If there are any validation errors, throw them
          if (errorMessages.length > 0) {
            throw new Error(errorMessages.join(' '));
          }
        }
      }
    }
    
    try {
      const updatedDeal = await dealsApi.updateStatus(Number(id), { status: 'LOST', lostReason });
      setDeal(updatedDeal);
      setFormData((prev) => ({ ...prev, status: 'LOST' }));
      // Reload deal data to get latest state
      await loadDealData(Number(id));
      setShowMarkAsLostModal(false);
    } catch (error: any) {
      console.error('Failed to mark deal as lost:', error);
      const errorMsg = error?.response?.data?.message || error?.message || 'Failed to mark deal as lost.';
      throw new Error(errorMsg);
    }
  };

  // Unused - kept for potential future use
  // const statusColors: Record<string, string> = {
  //   WON: '#10b981',
  //   LOST: '#ef4444',
  //   IN_PROGRESS: '#8b5cf6',
  // };

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
      {/* Toast Notification for Errors */}
      {showErrorToast && errorMessage && createPortal(
        <div className="deal-detail-toast-overlay" onClick={() => { setShowErrorToast(false); setErrorMessage(null); }}>
          <div className="deal-detail-toast" onClick={(e) => e.stopPropagation()}>
            <div className="deal-detail-toast-icon-wrapper">
              <svg className="deal-detail-toast-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L1 21H23L12 2Z" fill="#FCD34D" stroke="#F59E0B" strokeWidth="1.5"/>
                <path d="M12 9V13M12 17H12.01" stroke="#92400E" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="deal-detail-toast-content">
              <div className="deal-detail-toast-message">{errorMessage}</div>
            </div>
            <button 
              className="deal-detail-toast-close" 
              onClick={() => { setShowErrorToast(false); setErrorMessage(null); }}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notification for Success */}
      {showSuccessToast && createPortal(
        <div className="deal-detail-toast-overlay" onClick={() => setShowSuccessToast(false)}>
          <div className="deal-detail-toast deal-detail-toast-success" onClick={(e) => e.stopPropagation()}>
            <div className="deal-detail-toast-icon-wrapper">
              <svg className="deal-detail-toast-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17l-5-5" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="10" stroke="#10B981" strokeWidth="2" fill="none"/>
              </svg>
            </div>
            <div className="deal-detail-toast-content">
              <div className="deal-detail-toast-message">Deal updated successfully!</div>
            </div>
            <div className="deal-detail-toast-actions">
              <button 
                className="deal-detail-toast-ok-btn" 
                onClick={() => setShowSuccessToast(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
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
          {!isNewDeal && selectedStage && selectedPipeline && (
            <>
              {/* Stage Timeline - Similar to Kanban board */}
              <div className="deal-header-stage-timeline">
                {selectedPipeline.stages
                  ?.sort((a, b) => a.order - b.order)
                  .map((stage) => {
                    const days = stageDurations[stage.id] ?? 0;
                    const isCurrentStage = stage.id === formData.stageId;
                    // A stage is considered visited if:
                    // 1. It has a recorded duration > 0, OR
                    // 2. It's the current stage, OR
                    // 3. It comes before the current stage (deal must have passed through it)
                    const currentStageOrder = selectedPipeline.stages?.find(s => s.id === formData.stageId)?.order ?? -1;
                    const hasBeenInStage = days > 0 || isCurrentStage || (currentStageOrder > -1 && stage.order < currentStageOrder);
                    
                    return (
                      <div
                        key={stage.id}
                        className={`deal-header-stage-timeline-item ${isCurrentStage ? 'current' : ''} ${hasBeenInStage ? 'visited' : ''}`}
                        onMouseEnter={(e) => {
                          setHoveredStageId(stage.id);
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltipPosition({
                            top: rect.bottom + 8,
                            left: rect.left + rect.width / 2,
                          });
                        }}
                        onMouseLeave={() => {
                          setHoveredStageId(null);
                          setTooltipPosition(null);
                        }}
                        onClick={() => {
                          if (stage.id !== formData.stageId && deal && deal.id) {
                            void handleStageUpdate(deal.id, stage.id);
                          }
                        }}
                        style={{ cursor: stage.id !== formData.stageId ? 'pointer' : 'default' }}
                      >
                        <div className="deal-header-stage-timeline-days">
                          {hasBeenInStage ? `${days} day${days !== 1 ? 's' : ''}` : '0 days'}
                        </div>
                      </div>
                    );
                  })}
              </div>
              
              {/* Stage Selector Dropdown */}
              <div className="deal-header-stage-info" ref={stageDropdownRef}>
                <div 
                  className="deal-header-stage-display"
                  onClick={() => setIsStageDropdownOpen(!isStageDropdownOpen)}
                  style={{ cursor: 'pointer' }}
                  title="Click to change stage"
                >
              <span className="deal-header-pipeline-name">{selectedPipeline?.name || '—'}</span>
              <span className="deal-header-arrow">→</span>
              <span className="deal-header-stage-name">{selectedStage.name}</span>
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 12 12" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg" 
                    style={{ 
                      marginLeft: '6px',
                      transform: isStageDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s'
                    }}
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {isStageDropdownOpen && selectedPipeline && (
                  <div className="deal-header-stage-dropdown">
                    <div className="deal-header-stage-dropdown-title">Select Stage</div>
                    {selectedPipeline.stages
                      ?.sort((a, b) => a.order - b.order)
                      .map((stage) => (
                        <div
                          key={stage.id}
                          className={`deal-header-stage-dropdown-item ${stage.id === formData.stageId ? 'active' : ''}`}
                          onClick={async () => {
                            if (stage.id !== formData.stageId && deal && deal.id) {
                              setIsStageDropdownOpen(false);
                              await handleStageUpdate(deal.id, stage.id);
                            } else {
                              setIsStageDropdownOpen(false);
                            }
                          }}
                        >
                          {stage.name}
                        </div>
                      ))}
            </div>
                )}
              </div>
              
              {/* Tooltip for stage duration */}
              {hoveredStageId && tooltipPosition && selectedPipeline && createPortal(
                <div
                  className="deal-header-stage-tooltip"
                  style={{
                    position: 'fixed',
                    top: `${tooltipPosition.top}px`,
                    left: `${tooltipPosition.left}px`,
                    transform: 'translateX(-50%)',
                    zIndex: 10001,
                  }}
                >
                  <div className="deal-header-stage-tooltip-title">
                    {selectedPipeline.stages.find(s => s.id === hoveredStageId)?.name || 'Stage'}
                  </div>
                  <div className="deal-header-stage-tooltip-content">
                    {(() => {
                      const hoveredStage = selectedPipeline.stages?.find(s => s.id === hoveredStageId);
                      const currentStage = selectedPipeline.stages?.find(s => s.id === formData.stageId);
                      const currentStageOrder = currentStage?.order ?? -1;
                      const hoveredStageOrder = hoveredStage?.order ?? -1;
                      const days = stageDurations[hoveredStageId] ?? 0;
                      
                      // Check if deal has been in this stage
                      const hasBeenInStage = days > 0 || hoveredStageId === formData.stageId || (currentStageOrder > -1 && hoveredStageOrder < currentStageOrder);
                      
                      if (days > 0) {
                        return `This deal has been in this stage for ${days} day${days !== 1 ? 's' : ''}`;
                      } else if (hoveredStageId === formData.stageId) {
                        return 'This deal is currently in this stage';
                      } else if (hasBeenInStage) {
                        return 'This deal has been in this stage (duration not yet calculated)';
                      } else {
                        return 'This deal has not been in this stage yet';
                      }
                    })()}
                  </div>
                </div>,
                document.body
              )}
            </>
          )}
        </div>
        <div className="deal-header-right">
          {!isNewDeal && (
            <>
              {/* Owner Dropdown */}
              <div className="deal-owner-dropdown-wrapper" ref={ownerDropdownRef}>
              <button
                className="deal-owner-button"
                onClick={() => {
                  setIsOwnerDropdownOpen(!isOwnerDropdownOpen);
                  if (!isOwnerDropdownOpen) {
                    setOwnerSearchQuery('');
                  }
                }}
              >
                {(() => {
                  const selectedOwner = users.find(u => u.id === formData.ownerId);
                  if (selectedOwner) {
                    return (
                      <>
                        <div className="deal-owner-avatar">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 10C12.7614 10 15 7.76142 15 5C15 2.23858 12.7614 0 10 0C7.23858 0 5 2.23858 5 5C5 7.76142 7.23858 10 10 10Z" fill="currentColor"/>
                            <path d="M10 12C5.58172 12 2 14.6863 2 18C2 18.5523 2.44772 19 3 19H17C17.5523 19 18 18.5523 18 18C18 14.6863 14.4183 12 10 12Z" fill="currentColor"/>
                          </svg>
                        </div>
                        <div className="deal-owner-info">
                          <div className="deal-owner-name">
                            {selectedOwner.firstName} {selectedOwner.lastName}
                          </div>
                          <div className="deal-owner-role">Owner</div>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="deal-owner-arrow" style={{ transform: isOwnerDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </>
                    );
                  }
                  return (
                    <>
                      <div className="deal-owner-avatar">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M10 10C12.7614 10 15 7.76142 15 5C15 2.23858 12.7614 0 10 0C7.23858 0 5 2.23858 5 5C5 7.76142 7.23858 10 10 10Z" fill="currentColor"/>
                          <path d="M10 12C5.58172 12 2 14.6863 2 18C2 18.5523 2.44772 19 3 19H17C17.5523 19 18 18.5523 18 18C18 14.6863 14.4183 12 10 12Z" fill="currentColor"/>
                        </svg>
                      </div>
                      <div className="deal-owner-info">
                        <div className="deal-owner-name">Select Owner</div>
                        <div className="deal-owner-role">—</div>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="deal-owner-arrow" style={{ transform: isOwnerDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </>
                  );
                })()}
              </button>
              {isOwnerDropdownOpen && (
                <div className="deal-owner-dropdown">
                  <div className="deal-owner-dropdown-title">Transfer ownership</div>
                  <div className="deal-owner-dropdown-search">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>
                      <path d="M7 12C9.76142 12 12 9.76142 12 7C12 4.23858 9.76142 2 7 2C4.23858 2 2 4.23858 2 7C2 9.76142 4.23858 12 7 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search"
                      value={ownerSearchQuery}
                      onChange={(e) => setOwnerSearchQuery(e.target.value)}
                      className="deal-owner-search-input"
                      autoFocus
                    />
                  </div>
                  <div className="deal-owner-dropdown-list">
                    {users
                      .filter(user => {
                        if (!ownerSearchQuery.trim()) return true;
                        const searchLower = ownerSearchQuery.toLowerCase();
                        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
                        const email = (user.email || '').toLowerCase();
                        return fullName.includes(searchLower) || email.includes(searchLower);
                      })
                      .map(user => {
                        const currentUser = getStoredUser();
                        const isSelected = user.id === formData.ownerId;
                        const isCurrentUser = currentUser?.userId === user.id;
                        return (
                          <div
                            key={user.id}
                            className={`deal-owner-dropdown-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              handleFieldChange('ownerId', user.id);
                              setIsOwnerDropdownOpen(false);
                              setOwnerSearchQuery('');
                              // Auto-save the owner change
                              if (deal && deal.id) {
                                void handleSave();
                              }
                            }}
                          >
                            <div className="deal-owner-item-content">
                              <div className="deal-owner-item-name">
                                {user.firstName} {user.lastName}{isCurrentUser ? ' (You)' : ''}
                              </div>
                              {user.email && (
                                <div className="deal-owner-item-email">{user.email}</div>
                              )}
                            </div>
                            {isSelected && (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: '#3b82f6' }}>
                                <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              </div>
              <div className="deal-header-status-actions">
                {formData.status === 'IN_PROGRESS' && (
                  <>
                    <button
                      className="deal-status-btn deal-status-btn-won"
                      onClick={() => handleStatusUpdate('WON')}
                    >
                      WON
                    </button>
                    <button
                      className="deal-status-btn deal-status-btn-lost"
                      onClick={() => handleStatusUpdate('LOST')}
                    >
                      LOST
                    </button>
                  </>
                )}
                {(formData.status === 'WON' || formData.status === 'LOST') && (
                  <>
                    <span className={`deal-status-badge deal-status-badge-${formData.status.toLowerCase()}`}>
                      {formData.status}
                    </span>
                    <button
                      className="deal-status-btn deal-status-btn-reopen"
                      onClick={() => handleStatusUpdate('IN_PROGRESS')}
                    >
                      Reopen
                    </button>
                  </>
                )}
              </div>
            </>
          )}
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
                {/* Deal Value */}
                <div className="deal-field-row">
                  {editingField === 'value' ? (
                    <div className="deal-field-with-icon-input">
                      <span className="deal-field-icon">₹</span>
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
                      <span className="deal-field-icon">₹</span>
                      <span className="deal-field-text">{formatCurrency(parseFloat(formData.value || '0'))}</span>
                    </div>
                  )}
                </div>

                {/* Associated Person - Clickable */}
                <div className="deal-field-row">
                  {person ? (
                    <div 
                      className="deal-field-display" 
                      style={{ cursor: 'pointer', color: '#2563eb' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (formData.personId) {
                          navigate(`/persons/${formData.personId}`);
                        }
                      }}
                    >
                      <span className="deal-field-icon">👤</span>
                      <span className="deal-field-text" style={{ textDecoration: 'underline' }}>{person.name}</span>
                    </div>
                  ) : (
                    <div className="deal-field-display">
                      <span className="deal-field-icon">👤</span>
                      <span className="deal-field-text">—</span>
                    </div>
                  )}
                </div>

                {/* Set Deal Probability */}
                <div className="deal-field-row">
                  {editingField === 'probability' ? (
                    <div className="deal-field-with-icon-input">
                      <span className="deal-field-icon">⚖️</span>
                      <input
                        type="number"
                        className="deal-field-input"
                        min="0"
                        max="100"
                        value={formData.probability ?? ''}
                        onChange={(e) => handleFieldChange('probability', e.target.value ? Number(e.target.value) : null)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingField(null);
                          }
                        }}
                        autoFocus
                        placeholder="0-100"
                      />
                    </div>
                  ) : (
                    <div 
                      className="deal-field-display" 
                      onClick={() => setEditingField('probability')}
                      style={{ cursor: 'pointer', color: '#2563eb' }}
                    >
                      <span className="deal-field-icon">⚖️</span>
                      <span className="deal-field-text">
                        {formData.probability !== null && formData.probability !== undefined 
                          ? `${formData.probability}%` 
                          : 'Set deal probability'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Set Expected Close Date */}
                <div className="deal-field-row">
                  {editingField === 'expectedCloseDate' ? (
                    <div className="deal-field-with-icon-input">
                      <span className="deal-field-icon">📅</span>
                      <input
                        type="date"
                        className="deal-field-input"
                        value={formData.expectedCloseDate || ''}
                        onChange={(e) => handleFieldChange('expectedCloseDate', e.target.value || null)}
                        onBlur={() => setEditingField(null)}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div 
                      className="deal-field-display" 
                      onClick={() => setEditingField('expectedCloseDate')}
                      style={{ cursor: 'pointer', color: '#2563eb' }}
                    >
                      <span className="deal-field-icon">📅</span>
                      <span className="deal-field-text">
                        {formData.expectedCloseDate 
                          ? new Date(formData.expectedCloseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : 'Set expected close date'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Associate Organization - Clickable */}
                <div className="deal-field-row">
                  {selectedOrganization ? (
                    <div 
                      className="deal-field-display" 
                      style={{ cursor: 'pointer', color: '#2563eb' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/organizations');
                      }}
                    >
                      <span className="deal-field-icon">🏢</span>
                      <span className="deal-field-text" style={{ textDecoration: 'underline' }}>{selectedOrganization.name}</span>
                    </div>
                  ) : (
                    <div className="deal-field-display">
                      <span className="deal-field-icon">🏢</span>
                      <span className="deal-field-text">—</span>
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
                      onChange={async (e) => {
                        const newStageId = e.target.value ? Number(e.target.value) : null;
                        if (newStageId && deal && deal.id && newStageId !== deal.stageId) {
                          setEditingField(null);
                          await handleStageUpdate(deal.id, newStageId);
                        } else {
                          handleFieldChange('stageId', newStageId);
                          setEditingField(null);
                        }
                      }}
                      onBlur={() => setEditingField(null)}
                      autoFocus
                    >
                      <option value=""></option>
                      {selectedPipeline ? (selectedPipeline.stages || []).map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      )) : pipelines.flatMap((p) => p.stages || []).map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      ))}
                    </select>
                  ) : (
                      <span className="deal-field-text" onClick={() => setEditingField('stageId')} style={{ cursor: 'pointer' }}>
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
                  <span className="deal-field-label">Event Dates</span>
                  <div className="deal-date-input-container">
                    {editingField === 'eventDates' || eventDatePickerOpen ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                        {(formData.eventDates || []).map((date, index) => (
                          <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="date"
                          className="deal-field-input"
                              value={date || ''}
                              onChange={(e) => {
                                const newDates = [...(formData.eventDates || [])];
                                newDates[index] = e.target.value;
                                handleFieldChange('eventDates', newDates);
                              }}
                              style={{ flex: 1 }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newDates = [...(formData.eventDates || [])];
                                newDates.splice(index, 1);
                                handleFieldChange('eventDates', newDates);
                              }}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const newDates = [...(formData.eventDates || []), ''];
                            handleFieldChange('eventDates', newDates);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            alignSelf: 'flex-start'
                          }}
                        >
                          + Add Date
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingField(null);
                            setEventDatePickerOpen(false);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            alignSelf: 'flex-start'
                          }}
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {(formData.eventDates && formData.eventDates.length > 0) ? (
                          formData.eventDates.map((date, index) => (
                        <span 
                              key={index}
                          className="deal-field-text" 
                          onClick={() => {
                                setEditingField('eventDates');
                            setEventDatePickerOpen(true);
                          }}
                              style={{ cursor: 'pointer' }}
                            >
                              {date ? formatDateForDisplay(date) : 'No date'}
                            </span>
                          ))
                        ) : (
                          <span 
                            className="deal-field-text" 
                            onClick={() => {
                              setEditingField('eventDates');
                              setEventDatePickerOpen(true);
                            }}
                            style={{ cursor: 'pointer', color: '#9ca3af' }}
                          >
                            Click to add event dates
                        </span>
                        )}
                      </div>
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

          {/* Created By Section */}
          {!isNewDeal && deal && (
            <div className="deal-section">
              <div className="deal-section-header">
                <span className="deal-section-title">CREATED BY</span>
              </div>
              <div className="deal-section-content">
                <div className="deal-field-row">
                  <span className="deal-field-label">Created By</span>
                  <div className="deal-field-text">
                    {deal.createdBy === 'BOT' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>🤖</span>
                        <span>Instagram Bot</span>
                      </span>
                    ) : deal.createdBy === 'USER' && deal.createdByName ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>👤</span>
                        <span>{deal.createdByName}</span>
                      </span>
                    ) : deal.createdByUserId ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>👤</span>
                        <span>{users.find(u => u.id === deal.createdByUserId)?.firstName} {users.find(u => u.id === deal.createdByUserId)?.lastName}</span>
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
                {deal.createdAt && (
                  <div className="deal-field-row">
                    <span className="deal-field-label">Created At</span>
                    <span className="deal-field-text">
                      {new Date(deal.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

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
                  <span className="deal-field-label">Source</span>
                  {editingField === 'source' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                      <select
                        className="deal-field-input"
                        value={formData.source || ''}
                        onChange={(e) => handleFieldChange('source', e.target.value)}
                        onBlur={() => setEditingField(null)}
                        autoFocus
                      >
                        <option value="">Select Source</option>
                        {DEAL_SOURCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {formData.source === 'Direct' && (
                        <select
                          className="deal-field-input"
                          value={formData.subSource || ''}
                          onChange={(e) => handleFieldChange('subSource', e.target.value)}
                          onBlur={() => setEditingField(null)}
                        >
                          <option value="">Select Sub-Source (Optional)</option>
                          {DEAL_SUB_SOURCE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ) : (
                    <span className="deal-field-text" onClick={() => setEditingField('source')}>
                      {formData.source 
                        ? (formData.source === 'Direct' && formData.subSource 
                            ? `${formData.source} (${formData.subSource})` 
                            : formData.source)
                        : '—'}
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
                          onChange={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickPosition = {
                              top: rect.top + window.scrollY,
                              left: rect.left + window.scrollX,
                            };
                            markActivityDone(activity.id, e.target.checked, clickPosition);
                          }}
                        />
                      </div>
                      <div className="deal-activity-content" style={{ flex: 1 }}>
                        <div 
                          className="deal-activity-subject" 
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const activityCategory = normalizeCategoryLabel(activity.category);
                            navigate(`/activities?activityId=${activity.id}&category=${encodeURIComponent(activityCategory)}`);
                          }}
                        >
                          {activity.subject}
                          {activity.attachmentUrl && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openScreenshotViewer(activity);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                              title="View screenshot"
                            >
                              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14.25 3H3.75C2.92157 3 2.25 3.67157 2.25 4.5V13.5C2.25 14.3284 2.92157 15 3.75 15H14.25C15.0784 15 15.75 14.3284 15.75 13.5V4.5C15.75 3.67157 15.0784 3 14.25 3Z" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M6.75 7.5C7.57843 7.5 8.25 6.82843 8.25 6C8.25 5.17157 7.57843 4.5 6.75 4.5C5.92157 4.5 5.25 5.17157 5.25 6C5.25 6.82843 5.92157 7.5 6.75 7.5Z" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M15.75 10.5L12 7.5L3.75 13.5" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                        </div>
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
                                <span className="deal-activity-deal-icon">₹</span>
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
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clickPosition = {
                                  top: rect.top + window.scrollY,
                                  left: rect.left + window.scrollX,
                                };
                                markActivityDone(activity.id, !activity.done, clickPosition);
                              }}
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
                            onChange={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const clickPosition = {
                                top: rect.top + window.scrollY,
                                left: rect.left + window.scrollX,
                              };
                              markActivityDone(activity.id, e.target.checked, clickPosition);
                            }}
                          />
                        </div>
                        <div className="deal-history-content-wrapper">
                          <div className="deal-history-header-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {activity.done && <span className="deal-history-checkmark">✓</span>}
                            <span 
                              className="deal-history-subject" 
                              style={{ cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const activityCategory = normalizeCategoryLabel(activity.category);
                                navigate(`/activities?activityId=${activity.id}&category=${activityCategory}`);
                              }}
                            >
                              {activity.subject}
                            </span>
                            {activity.attachmentUrl && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openScreenshotViewer(activity);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  marginLeft: 'auto',
                                }}
                                title="View screenshot"
                              >
                                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M14.25 3H3.75C2.92157 3 2.25 3.67157 2.25 4.5V13.5C2.25 14.3284 2.92157 15 3.75 15H14.25C15.0784 15 15.75 14.3284 15.75 13.5V4.5C15.75 3.67157 15.0784 3 14.25 3Z" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M6.75 7.5C7.57843 7.5 8.25 6.82843 8.25 6C8.25 5.17157 7.57843 4.5 6.75 4.5C5.92157 4.5 5.25 5.17157 5.25 6C5.25 6.82843 5.92157 7.5 6.75 7.5Z" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M15.75 10.5L12 7.5L3.75 13.5" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            )}
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
                                  <span className="deal-history-deal-icon">₹</span>
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

      {/* Mark as Lost Modal */}
      {showMarkAsLostModal && (
        <MarkAsLostModal
          isOpen={true}
          onClose={() => setShowMarkAsLostModal(false)}
          onConfirm={handleMarkAsLost}
          dealName={deal?.name}
        />
      )}
      {showDealValueModal && deal && (
        <DealValueModal
          isOpen={true}
          onClose={() => setShowDealValueModal(false)}
          onConfirm={async (dealValue, commissionAmount, source, subSource) => {
            try {
              // Combine all updates into a single request
              const updatePayload: any = {
                status: 'WON',
                value: dealValue,
              };
              
              if (commissionAmount !== undefined && commissionAmount !== null) {
                updatePayload.commissionAmount = commissionAmount;
              }
              
              // Add source and subSource if provided
              if (source) {
                updatePayload.source = source;
                if (source === 'Direct' && subSource) {
                  updatePayload.subSource = subSource;
                } else {
                  // Clear subSource if source is not Direct
                  updatePayload.subSource = null;
                }
              }
              
              // Use the update endpoint which accepts all these fields including status
              const wonDeal = await dealsApi.update(Number(id), updatePayload);
              setDeal(wonDeal);
              setFormData((prev) => ({ 
                ...prev, 
                status: 'WON',
                value: dealValue.toString(),
                commissionAmount: commissionAmount?.toString() || wonDeal.commissionAmount?.toString() || '',
                source: source || wonDeal.source || '',
                subSource: (source === 'Direct' && subSource) ? subSource : '',
              }));
              
              setShowDealValueModal(false);
            } catch (error: any) {
              console.error('Failed to update deal value:', error);
              const errorMsg = error?.response?.data?.message || error?.message || 'Failed to update deal value.';
              setErrorMessage(errorMsg);
              setShowErrorToast(true);
              setTimeout(() => {
                setShowErrorToast(false);
                setErrorMessage(null);
              }, 5000);
              throw error;
            }
          }}
          dealName={deal.name}
          currentValue={deal.value}
          currentCommission={deal.commissionAmount}
          dealSource={deal.source || null}
          dealSubSource={deal.subSource || null}
        />
      )}

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
              assignedUserId: v.assignedUserId || undefined,
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

      {/* Pending Done Modal for Call Activities */}
      {pendingDoneActivity && createPortal(
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
        </>,
        document.body
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

