import { useState, useEffect, useMemo, useRef, useCallback, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import './Deals.css';
import { dealsApi, type DealSortField, type SortDirection } from '../services/deals';
import type { Deal, DealStatus, DealSource, DealSubSource } from '../types/deal';
import { normalizeEventDatesForRequest } from '../utils/dealDates';
import type { OrganizationCategory } from '../types/organization';
import { organizationsApi } from '../services/organizations';
import type { Organization } from '../types/organization';
import { pipelinesApi } from '../services/pipelines';
import type { Pipeline, Stage } from '../types/pipeline';
import { personsApi } from '../services/api';
import type { Person, PersonOwner } from '../types/person';
import ActivityModal, { type ActivityFormValues } from '../components/ActivityModal';
import AddPersonModal from '../components/AddPersonModal';
import { activitiesApi, type Activity } from '../services/activities';
import DivertDealModal from '../components/DivertDealModal';
import MarkAsLostModal from '../components/MarkAsLostModal';
import DealValueModal from '../components/DealValueModal';
import PipelineModal from '../components/PipelineModal';
import ReorderPipelinesModal from '../components/ReorderPipelinesModal';
import type { PipelineRequest, PipelineUpdateRequest } from '../types/pipeline';
import { usersApi } from '../services/users';
import type { User } from '../types/user';
import { teamsApi } from '../services/teams';
import type { Team } from '../types/team';

// Helper function to format date as YYYY-MM-DD
const formatDateYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type DealFilterStatus = 'all' | DealStatus;

interface DealFormState {
  name: string;
  value: string;
  status: DealStatus;
  personName: string; // Changed from personId to personName for input field
  personId: string; // Keep for internal use when person is found
  pipelineId: string;
  stageId: string;
  organizationId: string;
  categoryId: string;
  label: string;
  source: string;
  subSource: string;
  eventType: string;
  venue: string;
  eventDate: string;
  eventDates: string[];
  referencedDealId: string; // For diverted deals
}

const initialFormState: DealFormState = {
  name: '',
  value: '',
  status: 'IN_PROGRESS',
  personName: '',
  personId: '',
  pipelineId: '',
  stageId: '',
  organizationId: '',
  categoryId: '',
  label: '',
  source: '',
  subSource: '',
  eventType: '',
  venue: '',
  eventDate: '',
  eventDates: [],
  referencedDealId: '',
};

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

// Unused - kept for potential future use
// const statusColors: Record<DealStatus, string> = {
//   WON: '#10b981',
//   LOST: '#ef4444',
//   IN_PROGRESS: '#8b5cf6',
// };

const Deals = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [managers, setManagers] = useState<PersonOwner[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [activitiesByDealId, setActivitiesByDealId] = useState<Map<number, Activity[]>>(new Map());
  const [filterStatus, setFilterStatus] = useState<DealFilterStatus>(() => {
    const saved = localStorage.getItem('dealsFilterStatus');
    // Default to 'IN_PROGRESS' (Open Deals) if nothing is saved or if 'all' is saved
    if (!saved || saved === 'all') {
      return 'IN_PROGRESS';
    }
    return (saved as DealFilterStatus);
  });
  const [filterOrganization, _setFilterOrganization] = useState<number | null>(() => {
    const saved = localStorage.getItem('dealsFilterOrganization');
    return saved ? Number(saved) : null;
  });
  const [filterCategory, setFilterCategory] = useState<string | null>(() => {
    const saved = localStorage.getItem('dealsFilterCategory');
    return saved || null;
  });
  const [filterManager, setFilterManager] = useState<number | null>(() => {
    const saved = localStorage.getItem('dealsFilterManager');
    return saved ? Number(saved) : null;
  });
  const [searchQuery, _setSearchQuery] = useState<string>('');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [showSuccessConfirmation, setShowSuccessConfirmation] = useState<boolean>(false);
  const [createdDealName, setCreatedDealName] = useState<string>('');
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline');
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(() => {
    const saved = localStorage.getItem('selectedPipelineId');
    return saved ? Number(saved) : null;
  });
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState<boolean>(false);
  const [isPipelineDropdownOpen, setIsPipelineDropdownOpen] = useState<boolean>(false);
  const [pipelineSearchQuery, setPipelineSearchQuery] = useState<string>('');
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState<boolean>(false);
  const [isReorderPipelinesModalOpen, setIsReorderPipelinesModalOpen] = useState<boolean>(false);
  const [dealValueModalDealId, setDealValueModalDealId] = useState<number | null>(null);
  const pipelineSearchInputRef = useRef<HTMLInputElement>(null);
  const [sortField, setSortField] = useState<DealSortField>(() => {
    const saved = localStorage.getItem('dealsSortField');
    return (saved as DealSortField) || 'nextActivity';
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    const saved = localStorage.getItem('dealsSortDirection');
    return (saved as SortDirection) || 'asc';
  });
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState<boolean>(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [isDateRangeModalOpen, setIsDateRangeModalOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
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
  const [selectedDateRangeOption, setSelectedDateRangeOption] = useState<string>('Last 7 days');
  const [isDateRangeDropdownOpen, setIsDateRangeDropdownOpen] = useState(false);
  const dateRangeDropdownRef = useRef<HTMLDivElement>(null);

  // Handler for creating a new pipeline
  const handleCreatePipeline = useCallback(async (payload: PipelineRequest | PipelineUpdateRequest) => {
    try {
      await pipelinesApi.create(payload as PipelineRequest);
      // Reload pipelines
      const pipelineData = await pipelinesApi.list({ includeStages: true });
      setPipelines(pipelineData);
      setIsPipelineModalOpen(false);
      // Navigate to pipelines page to see the created pipeline details
      navigate('/pipelines');
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to create pipeline.';
      setError(message);
      throw err;
    }
  }, [navigate]);

  // Handler for reordering pipelines - open modal
  const handleReorderPipelines = useCallback(() => {
    setIsPipelineDropdownOpen(false);
    setIsReorderPipelinesModalOpen(true);
  }, []);

  // Handler for successful pipeline reorder
  const handlePipelinesReordered = useCallback(() => {
    // The order is stored in localStorage, so we just need to trigger a re-render
    // by updating the pipelines state (even with the same data, it will reorder)
    setPipelines([...pipelines]);
  }, [pipelines]);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState<boolean>(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState<boolean>(false);
  const infoIconRef = useRef<HTMLSpanElement>(null);
  const viewDropdownRef = useRef<HTMLDivElement>(null);
  const pipelineDropdownRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState<DealFormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<{ dealId: number; type: 'status' | 'stage' } | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedDealIds, setSelectedDealIds] = useState<Set<number>>(new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoriesFetched, setCategoriesFetched] = useState(false);
  const [_hoveredDealId, setHoveredDealId] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; organizationName: string | null; personName: string | null } | null>(null);
  const [hoveredButtonDealId, setHoveredButtonDealId] = useState<number | null>(null);
  const [buttonTooltipPosition, setButtonTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [openDropdownDealId, setOpenDropdownDealId] = useState<number | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityDealId, setActivityDealId] = useState<number | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDivertModalOpen, setIsDivertModalOpen] = useState(false);
  const [divertDealId, setDivertDealId] = useState<number | null>(null);
  const [markAsLostDealId, setMarkAsLostDealId] = useState<number | null>(null);
  const [showPersonSuggestions, setShowPersonSuggestions] = useState(false);
  const [filteredPersons, setFilteredPersons] = useState<Person[]>([]);
  const personInputRef = useRef<HTMLInputElement>(null);
  const personSuggestionsRef = useRef<HTMLDivElement>(null);
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState<string>('');
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
  const venueInputRef = useRef<HTMLInputElement>(null);
  const [venueSuggestions, setVenueSuggestions] = useState<Array<{ formatted: string; name: string }>>([]);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const venueSuggestionsRef = useRef<HTMLDivElement>(null);
  const [draggedDealId, setDraggedDealId] = useState<number | null>(null);
  const [isDragOverDeleteZone, setIsDragOverDeleteZone] = useState(false);
  const [isDragOverWonZone, setIsDragOverWonZone] = useState(false);
  const [isDragOverLostZone, setIsDragOverLostZone] = useState(false);
  const kanbanBoardRef = useRef<HTMLDivElement>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const autoScrollAnimationRef = useRef<number | null>(null);
  const [deleteConfirmDeal, setDeleteConfirmDeal] = useState<Deal | null>(null);
  const deleteModalJustOpened = useRef(false);
  const deleteModalRef = useRef<HTMLDivElement>(null);

  // Debug: Check if modal should render
  useEffect(() => {
    if (deleteConfirmDeal) {
      console.log('Delete confirm deal is set:', deleteConfirmDeal);
      setTimeout(() => {
        const modal = document.querySelector('[data-delete-modal]');
        console.log('Modal element found:', modal);
        if (modal) {
          const styles = window.getComputedStyle(modal);
          console.log('Modal display:', styles.display);
          console.log('Modal visibility:', styles.visibility);
          console.log('Modal opacity:', styles.opacity);
          console.log('Modal z-index:', styles.zIndex);
        }
      }, 200);
    }
  }, [deleteConfirmDeal]);

  // Focus management for delete modal
  useEffect(() => {
    if (deleteConfirmDeal && deleteModalRef.current) {
      // Focus the cancel button initially (first focusable element)
      const cancelButton = deleteModalRef.current.querySelector('button[type="button"]:not([disabled])') as HTMLButtonElement;
      if (cancelButton) {
        setTimeout(() => cancelButton.focus(), 100);
      }

      // Handle focus trapping
      const handleTabKey = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        
        const focusableElements = deleteModalRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) as NodeListOf<HTMLElement>;
        
        if (!focusableElements || focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      };

      deleteModalRef.current.addEventListener('keydown', handleTabKey);
      return () => {
        deleteModalRef.current?.removeEventListener('keydown', handleTabKey);
      };
    }
  }, [deleteConfirmDeal]);

  const loadActivities = useCallback(async () => {
    try {
      const activitiesResponse = await activitiesApi.list({ page: 0, size: 10000 });
      const allActivities = activitiesResponse.content || [];
      
      // Group activities by dealId
      const grouped = new Map<number, Activity[]>();
      allActivities.forEach(activity => {
        if (activity.dealId) {
          const existing = grouped.get(activity.dealId) || [];
          grouped.set(activity.dealId, [...existing, activity]);
        }
      });
      
      setActivitiesByDealId(grouped);
    } catch (err) {
      console.error('Failed to load activities:', err);
    }
  }, []);

  // Helper function to normalize category label
  const normalizeCategoryLabel = useCallback((cat?: string | null): 'Activity' | 'Call' | 'Meeting scheduler' => {
    if (!cat) return 'Activity';
    if (cat === 'CALL') return 'Call';
    if (cat === 'MEETING_SCHEDULER') return 'Meeting scheduler';
    return 'Activity';
  }, []);

  // Helper function to parse time string to minutes
  const parseTimeToMinutes = useCallback((time?: string | null): number | null => {
    if (!time) return null;
    const [hoursStr, minutesStr] = time.split(':');
    const hours = Number(hoursStr);
    const minutes = Number(minutesStr);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }, []);

  // Helper function to parse duration input to minutes
  const parseDurationInputToMinutes = useCallback((value: string): number | null => {
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
  }, []);

  // Helper function to format minutes to HH:MM
  const formatMinutesToHHMM = useCallback((minutes: number): string => {
    const safeMinutes = Math.max(0, minutes);
    const hours = Math.floor(safeMinutes / 60);
    const remainingMinutes = safeMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
  }, []);

  // Handle pending attachment input
  const handlePendingAttachmentInput = useCallback((files?: FileList | null) => {
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
  }, []);

  // Handle pending done cancel
  const handlePendingDoneCancel = useCallback(() => {
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
  }, [pendingAttachmentPreview]);

  // Complete toggle done (without modal)
  const completeToggleDone = useCallback(async (id: number, value: boolean) => {
    try {
      await activitiesApi.markDone(id, value);
      await loadActivities();
    } catch (e) {
      console.error('Failed to toggle done', e);
    }
  }, []);

  // Handle pending done confirm
  const handlePendingDoneConfirm = useCallback(async () => {
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
      if (updatedActivity) {
        await loadActivities();
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
  }, [pendingDoneActivity, pendingDurationValue, pendingAttachmentFile, pendingDoneValue, parseDurationInputToMinutes, parseTimeToMinutes, formatMinutesToHHMM, completeToggleDone, handlePendingDoneCancel, loadActivities]);

  // Toggle done with call activity check
  const toggleDone = useCallback(async (activity: Activity, value: boolean, clickPosition?: { top: number; left: number }) => {
    // Check if it's a call activity being marked as done
    const category = normalizeCategoryLabel(activity.category);
    if (category === 'Call' && value) {
      setPendingDoneActivity(activity);
      setPendingDoneValue(value);
      setPendingDurationValue(durationEntries[activity.id] ?? '');
      setPendingAttachmentFile(null);
      // If activity already has an attachment URL, use it as preview
      setPendingAttachmentPreview(activity.attachmentUrl || null);
      setPendingDialogPosition(clickPosition || null);
      return;
    }
    await completeToggleDone(activity.id, value);
  }, [normalizeCategoryLabel, durationEntries, completeToggleDone]);

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
      await loadActivities();
      alert('Screenshot replaced successfully!');
    } catch (error: any) {
      console.error('Failed to replace screenshot:', error);
      alert(`Failed to replace screenshot: ${error?.message || 'Unknown error'}`);
    } finally {
      setScreenshotReplacing(false);
    }
  }, [screenshotViewerActivity, screenshotReplacementFile, screenshotReplacementPreview, loadActivities]);

  // Check if a deal should show the warning icon (no activities or all completed)
  const shouldShowWarningIcon = useCallback((dealId: number): boolean => {
    const dealActivities = activitiesByDealId.get(dealId) || [];
    
    // If no activities, show warning
    if (dealActivities.length === 0) {
      return true;
    }
    
    // If all activities are completed, show warning
    const allCompleted = dealActivities.every(activity => activity.done === true);
    return allCompleted;
  }, [activitiesByDealId]);

  // Get the top scheduled activity for a deal (prioritize overdue, then today, then future)
  const getTopScheduledActivity = useCallback((dealId: number): Activity | null => {
    const dealActivities = activitiesByDealId.get(dealId) || [];
    
    // Filter out completed activities
    const undoneActivities = dealActivities.filter(activity => !activity.done);
    
    if (undoneActivities.length === 0) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sort activities by date and priority: overdue first, then today, then future
    const sortedActivities = undoneActivities
      .map(activity => {
        // Try to get the date from various fields
        let activityDateStr = null;
        
        if (activity.dateTime) {
          activityDateStr = activity.dateTime.split('T')[0];
        } else {
          activityDateStr = activity.date || activity.dueDate || null;
        }
        
        if (!activityDateStr) {
          return { activity, date: null, timestamp: Infinity };
        }

        // Parse date
        let year: number, month: number, day: number;
        const isoFormat = activityDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoFormat) {
          year = parseInt(isoFormat[1], 10);
          month = parseInt(isoFormat[2], 10) - 1;
          day = parseInt(isoFormat[3], 10);
        } else if (activityDateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          const parts = activityDateStr.split('/');
          day = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
          year = parseInt(parts[2], 10);
        } else {
          const date = new Date(activityDateStr);
          if (isNaN(date.getTime())) {
            return { activity, date: null, timestamp: Infinity };
          }
          year = date.getFullYear();
          month = date.getMonth();
          day = date.getDate();
        }
        
        const activityDate = new Date(year, month, day);
        activityDate.setHours(0, 0, 0, 0);
        
        // Calculate priority: overdue (0), today (1), future (2)
        let priority = 2;
        if (activityDate.getTime() < today.getTime()) {
          priority = 0; // Overdue
        } else if (activityDate.getTime() === today.getTime()) {
          priority = 1; // Today
        }
        
        return { activity, date: activityDate, timestamp: activityDate.getTime(), priority };
      })
      .filter(item => item.date !== null)
      .sort((a, b) => {
        // First sort by priority (overdue first, then today, then future)
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // Then sort by date (earliest first)
        return a.timestamp - b.timestamp;
      });

    return sortedActivities.length > 0 ? sortedActivities[0].activity : null;
  }, [activitiesByDealId]);

  // Format activity date for display
  const formatActivityDate = useCallback((activity: Activity): string => {
    let activityDateStr = null;
    
    if (activity.dateTime) {
      activityDateStr = activity.dateTime.split('T')[0];
    } else {
      activityDateStr = activity.date || activity.dueDate || null;
    }
    
    if (!activityDateStr) {
      return '';
    }

    // Parse and format date
    let year: number, month: number, day: number;
    const isoFormat = activityDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoFormat) {
      year = parseInt(isoFormat[1], 10);
      month = parseInt(isoFormat[2], 10) - 1;
      day = parseInt(isoFormat[3], 10);
    } else if (activityDateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const parts = activityDateStr.split('/');
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    } else {
      const date = new Date(activityDateStr);
      if (isNaN(date.getTime())) {
        return activityDateStr;
      }
      year = date.getFullYear();
      month = date.getMonth();
      day = date.getDate();
    }
    
    const activityDate = new Date(year, month, day);
    activityDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Format as "Today" if it's today
    if (activityDate.getTime() === today.getTime()) {
      return 'Today';
    }
    
    // Format as "Tomorrow" if it's tomorrow, otherwise format as "DD MMM" or "DD MMM YYYY"
    if (activityDate.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    }
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayStr = day.toString();
    const monthStr = months[month];
    const yearStr = year.toString();
    
    // If same year, don't show year
    if (year === today.getFullYear()) {
      return `${dayStr} ${monthStr}`;
    }
    
    return `${dayStr} ${monthStr} ${yearStr}`;
  }, []);

  // Check if a deal has overdue activities (undone activities from previous dates)
  const hasOverdueActivities = useCallback((dealId: number): boolean => {
    const dealActivities = activitiesByDealId.get(dealId) || [];
    
    // Filter out completed activities
    const undoneActivities = dealActivities.filter(activity => !activity.done);
    
    if (undoneActivities.length === 0) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if any undone activity is from a previous date (overdue)
    return undoneActivities.some(activity => {
      let activityDateStr = null;
      
      if (activity.dateTime) {
        activityDateStr = activity.dateTime.split('T')[0];
      } else {
        activityDateStr = activity.date || activity.dueDate || null;
      }
      
      if (!activityDateStr) {
        return false;
      }

      // Parse date
      let year: number, month: number, day: number;
      const isoFormat = activityDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoFormat) {
        year = parseInt(isoFormat[1], 10);
        month = parseInt(isoFormat[2], 10) - 1;
        day = parseInt(isoFormat[3], 10);
      } else if (activityDateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const parts = activityDateStr.split('/');
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      } else {
        const date = new Date(activityDateStr);
        if (isNaN(date.getTime())) {
          return false;
        }
        year = date.getFullYear();
        month = date.getMonth();
        day = date.getDate();
      }
      
      const activityDate = new Date(year, month, day);
      activityDate.setHours(0, 0, 0, 0);
      
      // Return true if the activity date is before today (overdue)
      return activityDate.getTime() < today.getTime();
    });
  }, [activitiesByDealId]);

  // Check if a deal has activities scheduled for today
  const hasTodayActivities = useCallback((dealId: number): boolean => {
    const dealActivities = activitiesByDealId.get(dealId) || [];
    
    // Filter out completed activities
    const undoneActivities = dealActivities.filter(activity => !activity.done);
    
    if (undoneActivities.length === 0) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if any undone activity is scheduled for today
    return undoneActivities.some(activity => {
      let activityDateStr = null;
      
      if (activity.dateTime) {
        activityDateStr = activity.dateTime.split('T')[0];
      } else {
        activityDateStr = activity.date || activity.dueDate || null;
      }
      
      if (!activityDateStr) {
        return false;
      }

      // Parse date
      let year: number, month: number, day: number;
      const isoFormat = activityDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoFormat) {
        year = parseInt(isoFormat[1], 10);
        month = parseInt(isoFormat[2], 10) - 1;
        day = parseInt(isoFormat[3], 10);
      } else if (activityDateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const parts = activityDateStr.split('/');
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      } else {
        const date = new Date(activityDateStr);
        if (isNaN(date.getTime())) {
          return false;
        }
        year = date.getFullYear();
        month = date.getMonth();
        day = date.getDate();
      }
      
      const activityDate = new Date(year, month, day);
      activityDate.setHours(0, 0, 0, 0);
      
      // Return true if the activity date is today
      return activityDate.getTime() === today.getTime();
    });
  }, [activitiesByDealId]);

  // Check if a deal has ONLY future activities (all undone activities are in the future, not today or past)
  const hasFutureActivities = useCallback((dealId: number): boolean => {
    const dealActivities = activitiesByDealId.get(dealId) || [];
    
    // Filter out completed activities - explicitly check for done === true
    const undoneActivities = dealActivities.filter(activity => !activity.done);
    
    // If no undone activities, return false
    if (undoneActivities.length === 0) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check that ALL undone activities are in the future (not today or past)
    return undoneActivities.every(activity => {
      // Try to get the date from various fields - prioritize dateTime (ISO format)
      let activityDateStr = null;
      
      // First try dateTime (ISO format: YYYY-MM-DDTHH:mm:ss)
      if (activity.dateTime) {
        activityDateStr = activity.dateTime.split('T')[0]; // Extract YYYY-MM-DD part
      }
      
      // If no dateTime, try date or dueDate
      if (!activityDateStr) {
        activityDateStr = activity.date || activity.dueDate || null;
      }
      
      if (!activityDateStr) {
        return false; // If no date, don't consider it as future
      }

      let year: number, month: number, day: number;
      
      // Check if it's YYYY-MM-DD format (ISO or standard)
      const isoFormat = activityDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoFormat) {
        year = parseInt(isoFormat[1], 10);
        month = parseInt(isoFormat[2], 10) - 1; // Month is 0-indexed
        day = parseInt(isoFormat[3], 10);
      } 
      // Check if it's DD/MM/YYYY format
      else if (activityDateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const parts = activityDateStr.split('/');
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
        year = parseInt(parts[2], 10);
      }
      // Check if it's MM/DD/YYYY format (US format)
      else if (activityDateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const parts = activityDateStr.split('/');
        month = parseInt(parts[0], 10) - 1; // Month is 0-indexed
        day = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
      }
      // Fallback to Date constructor
      else {
        const date = new Date(activityDateStr);
        if (isNaN(date.getTime())) {
          return false;
        }
        date.setHours(0, 0, 0, 0);
        return date.getTime() > today.getTime();
      }
      
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return false; // Invalid date parts
      }
      
      const activityDate = new Date(year, month, day);
      activityDate.setHours(0, 0, 0, 0);
      
      // Return true only if the activity date is strictly in the future (after today)
      return activityDate.getTime() > today.getTime();
    });
  }, [activitiesByDealId]);

  const loadDeals = useCallback(async (preserveDealId?: number | null) => {
    setLoading(true);
    try {
      // Always load all deals for kanban board view with sorting
      const data = await dealsApi.list({
        sort: sortField,
        direction: sortDirection,
      });
      setDeals(data);
      setSelectedDealIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set<number>();
        data.forEach((deal) => {
          if (prev.has(deal.id)) {
            next.add(deal.id);
          }
        });
        return next;
      });
      if (preserveDealId) {
        const match = data.find((deal) => deal.id === preserveDealId) ?? null;
        setSelectedDeal(match);
      } else if (!preserveDealId) {
        setSelectedDeal((prev) => {
          if (!prev) {
            return null;
          }
          const match = data.find((deal) => deal.id === prev.id) ?? null;
          return match;
        });
      }
      setError(null);
      // Load activities after deals are loaded
      await loadActivities();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load deals.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortDirection, loadActivities]);

  // Initial load
  useEffect(() => {
    loadDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasHandledOpenModal = useRef(false);
  
  // Auto-open modal if coming from QuickAdd or Person page
  useEffect(() => {
    // Don't open modal if it's already open, if we're submitting, or if we just showed success confirmation
    if (isModalOpen || isSubmitting || showSuccessConfirmation) return;
    
    const state = location.state as any;
    const personNameFromState = state?.personName;
    const shouldOpenModal = state?.openModal === true;
    
    // Only proceed if we have openModal in state and haven't handled it yet
    if (shouldOpenModal && !hasHandledOpenModal.current) {
      hasHandledOpenModal.current = true;
      let initialData = { ...initialFormState };
      if (personNameFromState) {
        initialData.personName = personNameFromState;
      }
      
      // Auto-select pipeline, organization, and category based on selectedPipelineId
      if (selectedPipelineId) {
        const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
        if (selectedPipeline) {
          initialData.pipelineId = String(selectedPipeline.id);
          // Auto-select the organization from the selected pipeline
          if (selectedPipeline.organization?.id) {
            initialData.organizationId = String(selectedPipeline.organization.id);
          }
          // Auto-select the category from the selected pipeline
          if (selectedPipeline.category && categoryOptions.length > 0) {
            // Find matching category by comparing pipeline category with category label or id
            const matchingCategory = categoryOptions.find(cat => 
              cat.label === selectedPipeline.category || cat.id === selectedPipeline.category
            );
            if (matchingCategory) {
              initialData.categoryId = matchingCategory.id;
            }
          }
          // Auto-select the first stage of the pipeline
          if (selectedPipeline.stages && selectedPipeline.stages.length > 0) {
            const firstStage = selectedPipeline.stages.sort((a, b) => a.order - b.order)[0];
            initialData.stageId = String(firstStage.id);
          }
        }
      } else if (!initialData.pipelineId && pipelines.length > 0) {
      // Auto-select the first pipeline (or RSP if available) if no pipeline is selected
        // Try to find RSP pipeline first
        const rspPipeline = pipelines.find(p => p.name.toLowerCase() === 'rsp');
        if (rspPipeline) {
          initialData.pipelineId = String(rspPipeline.id);
          // Auto-select the organization from RSP pipeline
          if (rspPipeline.organization?.id) {
            initialData.organizationId = String(rspPipeline.organization.id);
          }
          // Auto-select the category from RSP pipeline
          if (rspPipeline.category && categoryOptions.length > 0) {
            const matchingCategory = categoryOptions.find(cat => 
              cat.label === rspPipeline.category || cat.id === rspPipeline.category
            );
            if (matchingCategory) {
              initialData.categoryId = matchingCategory.id;
            }
          }
        } else {
          // Otherwise, select the first pipeline
          initialData.pipelineId = String(pipelines[0].id);
          // Auto-select the organization from the first pipeline
          if (pipelines[0].organization?.id) {
            initialData.organizationId = String(pipelines[0].organization.id);
          }
          // Auto-select the category from the first pipeline
          if (pipelines[0].category && categoryOptions.length > 0) {
            const matchingCategory = categoryOptions.find(cat => 
              cat.label === pipelines[0].category || cat.id === pipelines[0].category
            );
            if (matchingCategory) {
              initialData.categoryId = matchingCategory.id;
            }
          }
        }
      }
      
      setFormData(initialData);
      setIsModalOpen(true);
      // Clear the state after using it using navigate to properly update React Router's location state
      requestAnimationFrame(() => {
        navigate(location.pathname, { replace: true, state: {} });
      });
    }
  }, [location.pathname, location.state, pipelines, categoryOptions, isModalOpen, isSubmitting, selectedPipelineId, showSuccessConfirmation, navigate]);
  
  // Reset the ref when modal is closed and state is cleared
  useEffect(() => {
    if (!isModalOpen) {
      const state = location.state as any;
      if (!state?.openModal && hasHandledOpenModal.current) {
        const timer = setTimeout(() => {
          hasHandledOpenModal.current = false;
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isModalOpen, location.state]);

  const fetchCategories = async (force = false) => {
    if (categoryLoading) return;
    if (!force && categoriesFetched) return;
    setCategoryLoading(true);
    setCategoryError(null);
    try {
      const categories = await organizationsApi.listCategories();
      const normalized: Array<{ id: string; label: string }> = [];
      categories.forEach((category: OrganizationCategory) => {
        const code = String(category.code ?? '').trim();
        if (code.length === 0) {
          return;
        }
        const label = category.label ?? code;
        if (!normalized.some((option) => option.id === code)) {
          normalized.push({ id: code, label });
        }
      });

      if (normalized.length > 0) {
        setCategoryOptions(normalized);
        setCategoriesFetched(true);
      } else if (force) {
        setCategoryOptions([]);
        setCategoriesFetched(false);
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load categories.';
      setCategoryError(message);
    } finally {
      setCategoryLoading(false);
    }
  };

  useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        const [orgs, pipelineData] = await Promise.all([
          organizationsApi.list(),
          pipelinesApi.list({ includeStages: true }),
        ]);
        setOrganizations(orgs);
        setPipelines(pipelineData);
        // Validate that the saved pipeline ID still exists
        if (selectedPipelineId !== null) {
          const pipelineExists = pipelineData.some(p => p.id === selectedPipelineId);
          if (!pipelineExists) {
            // If saved pipeline no longer exists, clear the selection
            setSelectedPipelineId(null);
            localStorage.removeItem('selectedPipelineId');
          }
        }
        // Auto-select first pipeline if none is selected
        if (selectedPipelineId === null && pipelineData.length > 0) {
          // Try to find RSP pipeline first
          const rspPipeline = pipelineData.find(p => p.name.toLowerCase() === 'rsp');
          const pipelineToSelect = rspPipeline || pipelineData[0];
          if (pipelineToSelect) {
            setSelectedPipelineId(pipelineToSelect.id);
            localStorage.setItem('selectedPipelineId', String(pipelineToSelect.id));
          }
        }
      } catch (err) {
        console.error('Failed to load organizations or pipelines', err);
      }

      try {
        const personsPage = await personsApi.list({ page: 0, size: 200, sort: 'name,asc' });
        setPersons(personsPage.content ?? []);
      } catch (err) {
        console.error('Failed to load persons', err);
      }

      try {
        const managersData = await personsApi.listOwners();
        setManagers(managersData);
      } catch (err) {
        console.error('Failed to load managers', err);
      }

      try {
        const allUsers = await usersApi.list();
        // Filter users to only include SALES and PRESALES roles
        const salesAndPresalesUsers = allUsers.filter(user => 
          user.role === 'SALES' || user.role === 'PRESALES'
        );
        setUsers(salesAndPresalesUsers);
      } catch (err) {
        console.error('Failed to load users', err);
      }

      try {
        const teamsData = await teamsApi.list();
        setTeams(teamsData);
      } catch (err) {
        console.error('Failed to load teams', err);
      }
    };

    fetchReferenceData();
    void fetchCategories(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Function to get team manager from pipeline
  const getTeamManagerFromPipeline = useCallback((pipeline: Pipeline): number | null => {
    if (!pipeline.teamId) return null;
    
    // Find the team in the teams list
    const team = teams.find(t => t.id === pipeline.teamId);
    if (!team || !team.manager) return null;
    
    return team.manager.id;
  }, [teams]);

  // Function to create activities when deal is moved to Qualified stage
  const createQualifiedStageActivities = useCallback(async (deal: Deal) => {
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

    // Get team manager from pipeline
    const teamManagerId = getTeamManagerFromPipeline(pipeline);
    let assignedUserName = 'Unassigned';

    if (teamManagerId) {
    // Find the team manager user to get their display name for assignedUser
    const teamManager = users.find(u => u.id === teamManagerId);
      if (teamManager) {
    // Get user display name (first name + last name, fallback to email)
    const getUserDisplayName = (user: User) => {
      const first = (user.firstName || '').trim();
      const last = (user.lastName || '').trim();
      const fullName = [first, last].filter(Boolean).join(' ');
      return fullName || user.email || `User ${user.id}`;
    };
        assignedUserName = getUserDisplayName(teamManager);
        console.log(`[createQualifiedStageActivities] Assigned user for activities: ${assignedUserName}`);
      } else {
        console.warn(`[createQualifiedStageActivities] Team manager user ${teamManagerId} not found in users array, using 'Unassigned'`);
        // Continue with 'Unassigned' instead of returning
      }
    } else {
      console.warn(`[createQualifiedStageActivities] No team manager found for pipeline ${pipeline.id}, using 'Unassigned'`);
      // Continue with 'Unassigned' instead of returning
    }


    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get person details for the activities
    // Try to find person in local array first
    let person = persons.find(p => p.id === deal.personId);
    
    // If person not found or missing phone, try to fetch all persons in a single call
    if ((!person || !person.phone) && deal.personId) {
      console.log(`[createQualifiedStageActivities] Person not found in local array or missing phone, fetching from API...`);
      try {
        // Fetch all persons in a single call instead of individual call
        const personsPage = await personsApi.list({ page: 0, size: 1000, sort: 'name,asc' });
        const allPersons = personsPage.content || [];
        person = allPersons.find(p => p.id === deal.personId);
        if (person) {
          console.log(`[createQualifiedStageActivities] Found person in API response:`, { id: person.id, name: person.name, phone: person.phone });
          // Update local persons state for future use
          setPersons(prev => {
            const existing = prev.find(p => p.id === person!.id);
            if (!existing) {
              return [...prev, person!];
            }
            return prev.map(p => p.id === person!.id ? person! : p);
          });
        } else {
          console.warn(`[createQualifiedStageActivities] Person ${deal.personId} not found in API response`);
        }
      } catch (err) {
        console.warn(`[createQualifiedStageActivities] Failed to fetch persons from API:`, err);
        // Continue with person from local array or null
      }
    }
    
    const organization = organizations.find(o => o.id === deal.organizationId);

    console.log(`[createQualifiedStageActivities] Person for deal ${deal.id}:`, person ? { id: person.id, name: person.name, phone: person.phone } : 'not found');
    console.log(`[createQualifiedStageActivities] Organization for deal ${deal.id}:`, organization ? { id: organization.id, name: organization.name } : 'not found');

    // Check if activities already exist to avoid duplicates
    let existingActivities: Activity[] = [];
    try {
      const existingActivitiesResponse = await activitiesApi.list({ page: 0, size: 1000 });
      existingActivities = (existingActivitiesResponse.content || []).filter((a: Activity) => a.dealId === deal.id);
      const hasMakeFirstCall = existingActivities.some((a: Activity) => a.subject === 'Make first call' && a.dealId === deal.id);
      const hasSendQuotes = existingActivities.some((a: Activity) => a.subject === 'Send Quotes' && a.dealId === deal.id);
      
      if (hasMakeFirstCall && hasSendQuotes) {
        console.log(`[createQualifiedStageActivities] Activities already exist for deal ${deal.id}, skipping creation`);
        return;
      }
      
      console.log(`[createQualifiedStageActivities] Existing activities check: Make first call=${hasMakeFirstCall}, Send Quotes=${hasSendQuotes}`);
    } catch (checkErr) {
      console.warn(`[createQualifiedStageActivities] Failed to check existing activities, proceeding with creation:`, checkErr);
    }

    try {
      // Create "Make first call" activity
      if (!existingActivities.some((a: Activity) => a.subject === 'Make first call' && a.dealId === deal.id)) {
        console.log(`[createQualifiedStageActivities] Creating "Make first call" activity for deal ${deal.id}`);
        const callActivity = await activitiesApi.create({
        subject: 'Make first call',
        type: 'CALL',
        category: 'CALL',
        priority: 'MEDIUM',
        assignedUser: assignedUserName,
        date: todayStr,
        dueDate: todayStr,
        personId: deal.personId || null,
        dealId: deal.id,
        organization: organization?.name || null,
        phone: person?.phone || null,
        instagramId: person?.instagramId || null,
      });
        console.log(`[createQualifiedStageActivities] ✓ Created "Make first call" activity:`, callActivity);
      } else {
        console.log(`[createQualifiedStageActivities] "Make first call" activity already exists for deal ${deal.id}, skipping`);
      }

      // Create "Send Quotes" activity
      if (!existingActivities.some((a: Activity) => a.subject === 'Send Quotes' && a.dealId === deal.id)) {
        console.log(`[createQualifiedStageActivities] Creating "Send Quotes" activity for deal ${deal.id}`);
        const quoteActivity = await activitiesApi.create({
        subject: 'Send Quotes',
        type: 'ACTIVITY',
        category: 'ACTIVITY',
        priority: 'MEDIUM',
        assignedUser: assignedUserName,
        date: todayStr,
        dueDate: todayStr,
        personId: deal.personId || null,
        dealId: deal.id,
        organization: organization?.name || null,
        phone: person?.phone || null,
        instagramId: person?.instagramId || null,
      });
        console.log(`[createQualifiedStageActivities] ✓ Created "Send Quotes" activity:`, quoteActivity);
      } else {
        console.log(`[createQualifiedStageActivities] "Send Quotes" activity already exists for deal ${deal.id}, skipping`);
      }

      console.log(`[createQualifiedStageActivities] ✓✓✓ Successfully processed activities for deal ${deal.id} in Qualified stage`);
      // Reload activities to update the warning icon
      await loadActivities();
    } catch (err: any) {
      console.error(`[createQualifiedStageActivities] ❌ Failed to create activities for deal ${deal.id}:`, err);
      console.error('[createQualifiedStageActivities] Error response:', err?.response?.data);
      console.error('[createQualifiedStageActivities] Error message:', err?.message);
    }
  }, [pipelines, teams, persons, organizations, users, getTeamManagerFromPipeline, loadActivities]);

  // Function to check if a deal has incomplete required activities
  const checkIncompleteActivities = useCallback(async (deal: Deal): Promise<boolean> => {
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
  }, [pipelines]);

  // Monitor person updates and move deals from "Lead In" to "Qualified" when phone is added
  const processingMovesRef = useRef(false);
  const lastPersonsHashRef = useRef<string>('');
  
  // Function to check and move deals
  const checkAndMoveDeals = useCallback(async () => {
    if (!deals.length || !pipelines.length || loading) return;
    if (processingMovesRef.current) return; // Prevent concurrent executions

    processingMovesRef.current = true;
    let needsReload = false;

    try {
      // Get unique person IDs from deals
      const personIds = new Set<number>();
      deals.forEach(deal => {
        if (deal.personId) {
          personIds.add(deal.personId);
        }
      });

      // Use local persons data first, only fetch from API if we're missing person data
      const personMap = new Map<number, Person>();
      if (personIds.size > 0) {
        // First, try to use local persons data
        for (const personId of personIds) {
          const localPerson = persons.find(p => p.id === personId);
          if (localPerson) {
            personMap.set(personId, localPerson);
          }
        }
        
        // Only fetch from API if we're missing any persons
        const missingPersonIds = Array.from(personIds).filter(id => !personMap.has(id));
        if (missingPersonIds.length > 0) {
          try {
            console.log(`[checkAndMoveDeals] Missing ${missingPersonIds.length} persons in local data, fetching from API...`);
            // Fetch all persons in a single API call
            const personsPage = await personsApi.list({ page: 0, size: 1000, sort: 'name,asc' });
            const allPersons = personsPage.content || [];
            
            // Add missing persons to the map
            allPersons.forEach(person => {
              if (missingPersonIds.includes(person.id)) {
                personMap.set(person.id, person);
                console.log(`[checkAndMoveDeals] Found person ${person.id}:`, { name: person.name, phone: person.phone });
              }
            });
            
            // Update local persons state with newly fetched persons
            setPersons(prev => {
              const updated = [...prev];
              allPersons.forEach(person => {
                if (missingPersonIds.includes(person.id)) {
                  const existingIndex = updated.findIndex(p => p.id === person.id);
                  if (existingIndex >= 0) {
                    updated[existingIndex] = person;
                  } else {
                    updated.push(person);
                  }
                }
              });
              return updated;
            });
          } catch (err) {
            console.warn(`[checkAndMoveDeals] Failed to fetch persons from API, using local data:`, err);
            // Fall back to local person data for missing persons
            for (const personId of missingPersonIds) {
              if (!personMap.has(personId)) {
                const localPerson = persons.find(p => p.id === personId);
                if (localPerson) {
                  personMap.set(personId, localPerson);
                }
              }
            }
          }
        } else {
          // All persons found in local data, no API call needed
          console.log(`[checkAndMoveDeals] All ${personIds.size} persons found in local data, skipping API call`);
        }
      }

      // Process each person that has a phone number
      for (const [personId, person] of personMap.entries()) {
        // Only process persons that have a phone number
        if (!person.phone || person.phone.trim().length === 0) {
          console.log(`[checkAndMoveDeals] Person ${personId} (${person.name}) has no phone, skipping`);
          continue;
        }

        // Find all deals for this person that are in "Lead In" stage
        const personDeals = deals.filter(deal => deal.personId === personId);
        console.log(`[checkAndMoveDeals] Person ${personId} (${person.name}) has ${personDeals.length} deals`);
        
        for (const deal of personDeals) {
          if (!deal.pipelineId || !deal.stageId) continue;

          const pipeline = pipelines.find(p => p.id === deal.pipelineId);
          if (!pipeline) continue;

          // Find the current stage
          const currentStage = pipeline.stages.find(s => s.id === deal.stageId);
          if (!currentStage) continue;

          // Check if deal is in "Lead In" stage
          const stageName = currentStage.name.toLowerCase().trim();
          const isLeadIn = stageName === 'lead in' || stageName === 'leadin' || stageName === 'lead-in';
          
          if (isLeadIn) {
            // Find "Qualified" stage in the same pipeline
            const qualifiedStage = pipeline.stages.find(s => {
              const sName = s.name.toLowerCase().trim();
              return sName === 'qualified';
            });

            if (qualifiedStage && qualifiedStage.id !== deal.stageId) {
              try {
                // Move deal to "Qualified" stage
                console.log(`[checkAndMoveDeals] Moving deal ${deal.id} from Lead In to Qualified stage`);
                const updatedDeal = await dealsApi.moveToStage(deal.id, { stageId: qualifiedStage.id });
                needsReload = true;
                
                console.log(`[checkAndMoveDeals] Deal ${deal.id} moved to Qualified stage, creating activities...`);
                // Create activities for the deal in Qualified stage
                try {
                await createQualifiedStageActivities(updatedDeal);
                  console.log(`[checkAndMoveDeals] Activities creation completed for deal ${deal.id}`);
                } catch (activityErr: any) {
                  console.error(`[checkAndMoveDeals] Failed to create activities for deal ${deal.id}:`, activityErr);
                  console.error('[checkAndMoveDeals] Activity error details:', activityErr?.response?.data || activityErr?.message);
                  // Don't throw - we still want the deal to be moved even if activities fail
                }
              } catch (err: any) {
                console.error(`[checkAndMoveDeals] Failed to move deal ${deal.id} to Qualified stage:`, err);
                console.error('[checkAndMoveDeals] Error details:', err?.response?.data || err?.message);
              }
            }
          }
        }
      }

      // Reload deals only if we made changes
      if (needsReload) {
        await loadDeals();
      }
    } finally {
      processingMovesRef.current = false;
    }
  }, [deals, persons, pipelines, loading, loadDeals, createQualifiedStageActivities]);

  // Monitor deals and persons for changes and trigger deal movement
  // Since we fetch person data from API in checkAndMoveDeals, we can trigger on deals changes too
  useEffect(() => {
    if (!deals.length || !pipelines.length || loading) return;
    
    // Create a hash of deal IDs and stage IDs to detect changes
    const dealsHash = deals.map(d => `${d.id}:${d.stageId || ''}:${d.personId || ''}`).join('|');
    
    // Also check persons hash if persons array is available
    const personsHash = persons.length > 0 
      ? persons.map(p => `${p.id}:${p.phone || ''}`).join('|')
      : '';
    const combinedHash = `${dealsHash}|${personsHash}`;
    
    // Only check if deals or persons have actually changed
    if (combinedHash === lastPersonsHashRef.current) return;
    lastPersonsHashRef.current = combinedHash;

    // Debounce the check with a shorter delay for faster response
    const timeoutId = setTimeout(() => {
      console.log('[useEffect] Triggering checkAndMoveDeals due to deals/persons change');
      void checkAndMoveDeals();
    }, 500); // Increased to 500ms to allow for API calls to complete

    return () => clearTimeout(timeoutId);
  }, [persons, deals, pipelines, loading, checkAndMoveDeals]);

  // Periodically check for deal movements (in case person was updated in another tab/page)
  // This ensures we catch updates even if the persons array hasn't changed locally
  useEffect(() => {
    if (!deals.length || !pipelines.length || loading) return;
    
    // Check immediately when deals/pipelines are loaded
    console.log('[Periodic check] Initial checkAndMoveDeals on deals/pipelines load');
    void checkAndMoveDeals();
    
    // Then check every 30 seconds if there are deals that might need to be moved (reduced frequency)
    const intervalId = setInterval(() => {
      console.log('[Periodic check] Running periodic checkAndMoveDeals');
      void checkAndMoveDeals();
    }, 30000); // Check every 30 seconds instead of 5 seconds

    return () => clearInterval(intervalId);
  }, [deals.length, pipelines.length, loading, checkAndMoveDeals]);

  // Refresh persons when window becomes active (in case person was updated in another tab/page)
  useEffect(() => {
    const handleFocus = async () => {
      try {
        const personsPage = await personsApi.list({ page: 0, size: 200, sort: 'name,asc' });
        setPersons(personsPage.content ?? []);
      } catch (err) {
        console.error('Failed to refresh persons on focus:', err);
      }
    };

    // Listen for custom event when a person is updated
    const handlePersonUpdated = async () => {
      try {
        console.log('Person updated event received, refreshing persons and deals...');
        // Reload both persons and deals to ensure we have the latest data
        const [personsPage, dealsData] = await Promise.all([
          personsApi.list({ page: 0, size: 200, sort: 'name,asc' }),
          dealsApi.list()
        ]);
        
        setPersons(personsPage.content ?? []);
        setDeals(dealsData);
        
        // Wait a bit for state to update, then check and move deals immediately
        setTimeout(() => {
          void checkAndMoveDeals();
        }, 200);
      } catch (err) {
        console.error('Failed to refresh persons after update:', err);
      }
    };

    // Listen for storage events (for cross-tab communication)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'personUpdated') {
        void handlePersonUpdated();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('personUpdated', handlePersonUpdated);
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('personUpdated', handlePersonUpdated);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [checkAndMoveDeals]);

  // Reload deals when sort changes
  useEffect(() => {
    // Skip initial render (handled by initial load effect)
    if (loading && deals.length === 0) return;
    void loadDeals();
  }, [sortField, sortDirection, loadDeals]);

  // Focus search input when pipeline dropdown opens
  useEffect(() => {
    if (isPipelineDropdownOpen && pipelineSearchInputRef.current) {
      setTimeout(() => {
        pipelineSearchInputRef.current?.focus();
      }, 0);
    } else {
      setPipelineSearchQuery('');
    }
  }, [isPipelineDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(event.target as Node)) {
        setIsViewDropdownOpen(false);
      }
      if (pipelineDropdownRef.current && !pipelineDropdownRef.current.contains(event.target as Node)) {
        setIsPipelineDropdownOpen(false);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
      if (infoIconRef.current && !infoIconRef.current.contains(event.target as Node)) {
        setIsSummaryOpen(false);
      }
    };
    if (isViewDropdownOpen || isPipelineDropdownOpen || isFilterDropdownOpen || isSummaryOpen) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
    return undefined;
  }, [isViewDropdownOpen, isPipelineDropdownOpen, isFilterDropdownOpen, isSummaryOpen, isSortDropdownOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (openDropdownDealId !== null) {
        const target = event.target as HTMLElement;
        if (!target.closest('.kanban-card-action-btn') && !target.closest('.kanban-card-dropdown')) {
          setOpenDropdownDealId(null);
          setDropdownPosition(null);
        }
      }
    };

    if (openDropdownDealId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [openDropdownDealId]);

  // Close person suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      const target = event.target as Node;
      if (
        personInputRef.current &&
        personSuggestionsRef.current &&
        !personInputRef.current.contains(target) &&
        !personSuggestionsRef.current.contains(target)
      ) {
        setShowPersonSuggestions(false);
      }
    };

    if (showPersonSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showPersonSuggestions]);

  // Fetch venue suggestions from Geoapify API
  const fetchVenueSuggestions = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setVenueSuggestions([]);
      setShowVenueSuggestions(false);
      return;
    }

    try {
      const apiKey = '12bcf754be46487f9baf6c60c86a0358';
      const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&apiKey=${apiKey}&type=amenity&limit=10&bias=countrycode:in`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.features && Array.isArray(data.features)) {
        const suggestions = data.features.map((feature: any) => ({
          formatted: feature.properties.formatted || feature.properties.name || '',
          name: feature.properties.name || '',
          placeId: feature.properties.place_id || '',
        }));
        setVenueSuggestions(suggestions);
        setShowVenueSuggestions(suggestions.length > 0);
      } else {
        setVenueSuggestions([]);
        setShowVenueSuggestions(false);
      }
    } catch (error) {
      console.error('Error fetching venue suggestions:', error);
      setVenueSuggestions([]);
      setShowVenueSuggestions(false);
    }
  }, []);

  // Debounce function for venue search
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle venue input change
  const handleVenueInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData((prev) => ({
      ...prev,
      venue: value,
    }));

    // Clear previous timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Debounce API calls
    debounceTimeoutRef.current = setTimeout(() => {
      void fetchVenueSuggestions(value);
    }, 300);
  }, [fetchVenueSuggestions]);

  // Close venue suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      const target = event.target as Node;
      if (
        venueInputRef.current &&
        venueSuggestionsRef.current &&
        !venueInputRef.current.contains(target) &&
        !venueSuggestionsRef.current.contains(target)
      ) {
        setShowVenueSuggestions(false);
      }
    };

    if (showVenueSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showVenueSuggestions]);

  // Adjust dropdown position after render to ensure it's fully visible
  useEffect(() => {
    if (openDropdownDealId !== null && dropdownPosition && dropdownRef.current) {
      const dropdown = dropdownRef.current;
      const rect = dropdown.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 16;
      
      let newTop = dropdownPosition.top;
      let newLeft = dropdownPosition.left;
      let needsUpdate = false;
      
      // Check if dropdown goes off bottom
      if (rect.bottom > viewportHeight - margin) {
        newTop = viewportHeight - rect.height - margin;
        needsUpdate = true;
      }
      
      // Check if dropdown goes off top
      if (rect.top < margin) {
        newTop = margin;
        needsUpdate = true;
      }
      
      // Only adjust horizontal position if it would go off screen
      // But try to keep it on the right side if possible
      if (rect.right > viewportWidth - margin) {
        // Try to keep it on right, just adjust the left position
        newLeft = viewportWidth - rect.width - margin;
        needsUpdate = true;
      }
      
      // Check if dropdown goes off left - but only if it's not intentionally on the right
      if (rect.left < margin) {
        newLeft = margin;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        setDropdownPosition({ top: newTop, left: newLeft });
      }
    }
  }, [openDropdownDealId, dropdownPosition]);

  // Auto-scroll kanban board when dragging near edges
  useEffect(() => {
    if (!draggedDealId || !dragPosition || !kanbanBoardRef.current) {
      // Cancel any existing animation frame
      if (autoScrollAnimationRef.current !== null) {
        cancelAnimationFrame(autoScrollAnimationRef.current);
        autoScrollAnimationRef.current = null;
      }
      return;
    }

    const board = kanbanBoardRef.current;
    const scrollThreshold = 120; // Distance from edge to trigger scroll (in pixels)
    const maxScrollSpeed = 25; // Maximum pixels to scroll per frame
    const minScrollSpeed = 3; // Minimum pixels to scroll per frame

    const performAutoScroll = () => {
      if (!board || !dragPosition) {
        autoScrollAnimationRef.current = null;
        return;
      }

      const rect = board.getBoundingClientRect();
      const mouseX = dragPosition.x;
      const mouseY = dragPosition.y;

      // Check if mouse is within board bounds
      if (mouseX < rect.left || mouseX > rect.right || mouseY < rect.top || mouseY > rect.bottom) {
        autoScrollAnimationRef.current = requestAnimationFrame(performAutoScroll);
        return;
      }

      const distanceFromLeft = mouseX - rect.left;
      const distanceFromRight = rect.right - mouseX;
      const distanceFromTop = mouseY - rect.top;
      const distanceFromBottom = rect.bottom - mouseY;

      let scrollX = 0;
      let scrollY = 0;

      // Horizontal scrolling with variable speed based on proximity to edge
      if (distanceFromLeft < scrollThreshold) {
        // Closer to edge = faster scroll (inverse relationship)
        const proximity = 1 - (distanceFromLeft / scrollThreshold);
        scrollX = -(minScrollSpeed + (maxScrollSpeed - minScrollSpeed) * proximity);
      } else if (distanceFromRight < scrollThreshold) {
        const proximity = 1 - (distanceFromRight / scrollThreshold);
        scrollX = minScrollSpeed + (maxScrollSpeed - minScrollSpeed) * proximity;
      }

      // Vertical scrolling with variable speed (for column content if needed)
      if (distanceFromTop < scrollThreshold) {
        const proximity = 1 - (distanceFromTop / scrollThreshold);
        scrollY = -(minScrollSpeed + (maxScrollSpeed - minScrollSpeed) * proximity);
      } else if (distanceFromBottom < scrollThreshold) {
        const proximity = 1 - (distanceFromBottom / scrollThreshold);
        scrollY = minScrollSpeed + (maxScrollSpeed - minScrollSpeed) * proximity;
      }

      // Apply scrolling smoothly
      if (scrollX !== 0) {
        board.scrollLeft += scrollX;
      }
      if (scrollY !== 0) {
        board.scrollTop += scrollY;
      }

      // Continue animation loop
      autoScrollAnimationRef.current = requestAnimationFrame(performAutoScroll);
    };

    // Start auto-scroll animation
    autoScrollAnimationRef.current = requestAnimationFrame(performAutoScroll);

    return () => {
      if (autoScrollAnimationRef.current !== null) {
        cancelAnimationFrame(autoScrollAnimationRef.current);
        autoScrollAnimationRef.current = null;
      }
    };
  }, [draggedDealId, dragPosition]);

  // Track drag position globally
  useEffect(() => {
    if (!draggedDealId) {
      setDragPosition(null);
      return;
    }

    const handleDrag = (e: DragEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    };

    document.addEventListener('dragover', handleDrag);
    return () => {
      document.removeEventListener('dragover', handleDrag);
    };
  }, [draggedDealId]);

  // Sort options configuration
  const sortOptions: Array<{ value: DealSortField; label: string }> = [
    { value: 'nextActivity', label: 'Next activity' },
    { value: 'name', label: 'Deal title' },
    { value: 'value', label: 'Deal value' },
    { value: 'personName', label: 'Linked person' },
    { value: 'organizationName', label: 'Linked organization' },
    { value: 'eventDate', label: 'Expected close date' },
    { value: 'createdAt', label: 'Deal created' },
    { value: 'updatedAt', label: 'Deal update time' },
    { value: 'completedActivitiesCount', label: 'Done activities' },
    { value: 'pendingActivitiesCount', label: 'Activities to do' },
    { value: 'productsCount', label: 'Number of products' },
    { value: 'ownerName', label: 'Owner name' },
  ];

  const getSortFieldLabel = (field: DealSortField): string => {
    const option = sortOptions.find(opt => opt.value === field);
    return option?.label || 'Next activity';
  };

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(value || 0);
  }, []);

  const formatDate = useCallback((dateString?: string | null) => {
    if (!dateString) {
      return '—';
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const formatDateTime = useCallback((dateString?: string | null) => {
    if (!dateString) {
      return '—';
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const organizationsById = useMemo(() => {
    const map = new Map<number, Organization>();
    organizations.forEach((org) => map.set(org.id, org));
    // Add TBS as a static organization option
    // Using a high ID (999999) to avoid conflicts with real organization IDs
    map.set(999999, { id: 999999, name: 'TBS' } as Organization);
    return map;
  }, [organizations]);

  // Combined organizations list including TBS
  const allOrganizations = useMemo(() => {
    const tbsOrg: Organization = { id: 999999, name: 'TBS' } as Organization;
    return [tbsOrg, ...organizations];
  }, [organizations]);

  const selectedOrganizationForForm = formData.organizationId
    ? organizationsById.get(Number(formData.organizationId)) ?? null
    : null;
  const selectedOrgCalendarEmail = selectedOrganizationForForm?.googleCalendarId?.trim() || '';
  const hasCalendarSyncForForm = Boolean(selectedOrgCalendarEmail);

  const personsById = useMemo(() => {
    const map = new Map<number, Person>();
    persons.forEach((person) => map.set(person.id, person));
    return map;
  }, [persons]);

  const pipelinesById = useMemo(() => {
    const map = new Map<number, Pipeline>();
    pipelines.forEach((pipeline) => map.set(pipeline.id, pipeline));
    return map;
  }, [pipelines]);

  // State for available pipelines when creating a diverted deal
  const [availablePipelinesForDivert, setAvailablePipelinesForDivert] = useState<Pipeline[]>([]);
  const [loadingAvailablePipelines, setLoadingAvailablePipelines] = useState(false);

  // Combined pipelines list - filtered based on whether it's a diverted deal
  const allPipelines = useMemo(() => {
    // If creating a diverted deal (label = DIVERT) and referencedDealId is set, use filtered pipelines
    if (formData.label === 'DIVERT' && formData.referencedDealId) {
      return availablePipelinesForDivert;
    }
    // Otherwise, return all pipelines
    return pipelines;
  }, [pipelines, formData.label, formData.referencedDealId, availablePipelinesForDivert]);

  // Load available pipelines when creating a diverted deal
  useEffect(() => {
    if (formData.label === 'DIVERT' && formData.referencedDealId) {
      const referencedDealIdNum = Number(formData.referencedDealId);
      if (!isNaN(referencedDealIdNum)) {
        setLoadingAvailablePipelines(true);
        dealsApi.getAvailablePipelines(referencedDealIdNum)
          .then((availablePipelines) => {
            setAvailablePipelinesForDivert(availablePipelines);
          })
          .catch((err) => {
            console.error('Failed to load available pipelines:', err);
            setAvailablePipelinesForDivert([]);
          })
          .finally(() => {
            setLoadingAvailablePipelines(false);
          });
      }
    } else {
      setAvailablePipelinesForDivert([]);
    }
  }, [formData.label, formData.referencedDealId]);

  const categoryLabelById = useMemo(() => {
    const map = new Map<string, string>();
    categoryOptions.forEach((option) => map.set(option.id, option.label));
    return map;
  }, [categoryOptions]);

  // Filter managers based on selected category
  const filteredManagers = useMemo(() => {
    if (!filterCategory) {
      return managers;
    }
    // Get the category label for comparison
    const categoryLabel = categoryLabelById.get(String(filterCategory));
    if (!categoryLabel) {
      console.warn('Category label not found for filterCategory:', filterCategory);
      return managers;
    }
    
    // Find managers who have deals with the selected category
    const managerIds = new Set<number>();
    let matchedDealsCount = 0;
    
    deals.forEach((deal) => {
      // Check if deal category matches (either from deal.categoryId or from pipeline.category)
      let categoryMatches = false;
      
      // First check if deal has categoryId that matches
      if (deal.categoryId != null && String(deal.categoryId) === filterCategory) {
        categoryMatches = true;
      } else if (deal.pipelineId) {
        // If not, check if the deal's pipeline has the matching category
        const pipeline = pipelines.find(p => p.id === deal.pipelineId);
        if (pipeline?.category === categoryLabel) {
          categoryMatches = true;
        }
      }
      
      if (categoryMatches) {
        matchedDealsCount++;
        if (deal.personId) {
          const person = persons.find(p => p.id === deal.personId);
          if (person?.ownerId) {
            managerIds.add(person.ownerId);
          }
        }
      }
    });
    
    console.log('Filtered Managers Debug:', {
      filterCategory,
      categoryLabel,
      totalDeals: deals.length,
      matchedDealsCount,
      managerIdsFound: Array.from(managerIds),
      totalManagers: managers.length,
      filteredManagersCount: managerIds.size
    });
    
    return managers.filter(manager => managerIds.has(manager.id));
  }, [managers, deals, persons, filterCategory, categoryLabelById, pipelines]);

  // Get custom pipeline order from localStorage
  const getOrderedPipelines = useCallback((pipelineList: Pipeline[]): Pipeline[] => {
    try {
      const savedOrder = localStorage.getItem('pipelineOrder');
      if (savedOrder) {
        const orderedIds = JSON.parse(savedOrder) as number[];
        // Create a map for quick lookup
        const pipelineMap = new Map(pipelineList.map(p => [p.id, p]));
        // Reorder based on saved order, then append any pipelines not in the saved order
        const ordered: Pipeline[] = [];
        const unordered: Pipeline[] = [];
        
        orderedIds.forEach(id => {
          const pipeline = pipelineMap.get(id);
          if (pipeline) {
            ordered.push(pipeline);
            pipelineMap.delete(id);
          }
        });
        
        // Add any pipelines not in the saved order
        pipelineMap.forEach(pipeline => unordered.push(pipeline));
        
        return [...ordered, ...unordered];
      }
    } catch (err) {
      console.error('Failed to parse pipeline order from localStorage:', err);
    }
    return pipelineList;
  }, []);

  // Filter pipelines based on selected category and manager, and search query
  const filteredPipelines = useMemo(() => {
    // First apply custom order
    let result = getOrderedPipelines(pipelines);
    
    // Filter by search query if provided
    if (pipelineSearchQuery.trim()) {
      const query = pipelineSearchQuery.toLowerCase().trim();
      result = result.filter(pipeline => 
        pipeline.name?.toLowerCase().includes(query)
      );
    }
    
    // Filter by category if selected
    if (filterCategory) {
      const categoryLabel = categoryLabelById.get(String(filterCategory));
      if (categoryLabel) {
        result = result.filter(pipeline => pipeline.category === categoryLabel);
      }
    }
    
    // Further filter by manager if selected
    if (filterManager) {
      // Find pipeline IDs that have deals with the selected manager and category
      const pipelineIds = new Set<number>();
      const categoryLabel = filterCategory ? categoryLabelById.get(String(filterCategory)) : null;
      
      deals.forEach((deal) => {
        if (deal.pipelineId) {
          // Check if deal matches category filter (either from deal.categoryId or pipeline.category)
          let categoryMatch = true;
          if (filterCategory && categoryLabel) {
            categoryMatch = false;
            // Check if deal has categoryId that matches
            if (deal.categoryId != null && String(deal.categoryId) === filterCategory) {
              categoryMatch = true;
            } else {
              // Check if the deal's pipeline has the matching category
              const pipeline = pipelines.find(p => p.id === deal.pipelineId);
              if (pipeline?.category === categoryLabel) {
                categoryMatch = true;
              }
            }
          }
          
          // Check if deal matches manager filter
          const managerMatch = (() => {
            if (!deal.personId) return false;
            const person = persons.find(p => p.id === deal.personId);
            return person?.ownerId === filterManager;
          })();
          
          if (categoryMatch && managerMatch) {
            pipelineIds.add(deal.pipelineId);
          }
        }
      });
      result = result.filter(pipeline => pipelineIds.has(pipeline.id));
    }
    
    return result;
  }, [pipelines, deals, persons, filterCategory, filterManager, categoryLabelById, pipelineSearchQuery, getOrderedPipelines]);

  // Reset manager filter if selected manager is not in filtered list when category changes
  // Only validate after data is loaded (managers array has items)
  useEffect(() => {
    if (!loading && managers.length > 0 && filterCategory && filterManager) {
      const isManagerValid = filteredManagers.some(m => m.id === filterManager);
      if (!isManagerValid) {
        setFilterManager(null);
      }
    }
  }, [loading, managers.length, filterCategory, filteredManagers, filterManager]);

  // Reset pipeline filter if selected pipeline is not in filtered list when category or manager changes
  // Only validate after all data is loaded (pipelines, deals, and persons arrays have items)
  useEffect(() => {
    // Only validate if we have all the necessary data loaded
    if (!loading && pipelines.length > 0 && deals.length > 0 && persons.length > 0 && selectedPipelineId) {
      // First check if the pipeline exists in all pipelines (not just filtered)
      const pipelineExists = pipelines.some(p => p.id === selectedPipelineId);
      if (!pipelineExists) {
        // Pipeline doesn't exist at all, clear it
        setSelectedPipelineId(null);
        localStorage.removeItem('selectedPipelineId');
        return;
      }
      
      // If filters are active, check if pipeline is in filtered list
      // If no filters are active, the pipeline is valid
      if (filterCategory || filterManager) {
        const isPipelineValid = filteredPipelines.some(p => p.id === selectedPipelineId);
        if (!isPipelineValid) {
          // Pipeline exists but doesn't match current filters - clear it
          setSelectedPipelineId(null);
          localStorage.removeItem('selectedPipelineId');
        }
      }
    }
  }, [loading, pipelines.length, deals.length, persons.length, filterCategory, filterManager, filteredPipelines, selectedPipelineId]);

  // Auto-select first pipeline if none is selected
  // Only auto-select after all data is loaded and no saved selection exists
  useEffect(() => {
    if (!loading && pipelines.length > 0 && deals.length > 0 && persons.length > 0 && selectedPipelineId === null && filteredPipelines.length > 0) {
      const firstPipeline = filteredPipelines[0];
      if (firstPipeline?.id) {
        setSelectedPipelineId(firstPipeline.id);
        localStorage.setItem('selectedPipelineId', firstPipeline.id.toString());
      }
    }
  }, [loading, pipelines.length, deals.length, persons.length, selectedPipelineId, filteredPipelines]);

  // Save selectedPipelineId to localStorage whenever it changes
  useEffect(() => {
    if (selectedPipelineId !== null) {
      localStorage.setItem('selectedPipelineId', selectedPipelineId.toString());
    } else {
      localStorage.removeItem('selectedPipelineId');
    }
  }, [selectedPipelineId]);

  // Save filterStatus to localStorage
  useEffect(() => {
    localStorage.setItem('dealsFilterStatus', filterStatus);
  }, [filterStatus]);

  // Save filterCategory to localStorage
  useEffect(() => {
    if (filterCategory) {
      localStorage.setItem('dealsFilterCategory', filterCategory);
    } else {
      localStorage.removeItem('dealsFilterCategory');
    }
  }, [filterCategory]);

  // Save filterManager to localStorage
  useEffect(() => {
    if (filterManager) {
      localStorage.setItem('dealsFilterManager', filterManager.toString());
    } else {
      localStorage.removeItem('dealsFilterManager');
    }
  }, [filterManager]);

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

  const filteredDeals = useMemo(() => {
    const result = deals.filter((deal) => {
      // Filter by status
      const statusMatch = filterStatus === 'all' || deal.status === filterStatus;
      
      const organizationMatch = filterOrganization === null || deal.organizationId === filterOrganization;
      // Check category match - either from deal.categoryId or pipeline.category
      let categoryMatch = filterCategory === null;
      if (filterCategory !== null) {
        const categoryLabel = categoryLabelById.get(String(filterCategory));
        // Check if deal has categoryId that matches
        if (deal.categoryId != null && String(deal.categoryId) === filterCategory) {
          categoryMatch = true;
        } else if (deal.pipelineId && categoryLabel) {
          // Check if the deal's pipeline has the matching category
          const pipeline = pipelines.find(p => p.id === deal.pipelineId);
          if (pipeline?.category === categoryLabel) {
            categoryMatch = true;
          }
        }
      }
      
      // Filter by manager: check if the deal's person has the selected manager (ownerId)
      const managerMatch = filterManager === null || (() => {
        if (!deal.personId) return false;
        const person = persons.find(p => p.id === deal.personId);
        return person?.ownerId === filterManager;
      })();
      
      // Filter by date range
      let dateMatch = true;
      if (dateRange.start && dateRange.end) {
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999); // Include the entire end date
        const dealDate = new Date(deal.createdAt);
        dateMatch = dealDate >= startDate && dealDate <= endDate;
      }
      
      const query = searchQuery.trim().toLowerCase();
      const searchMatch =
        query.length === 0 ||
        (deal.name && deal.name.toLowerCase().includes(query)) ||
        (deal.venue && deal.venue.toLowerCase().includes(query));
      return statusMatch && organizationMatch && categoryMatch && managerMatch && dateMatch && searchMatch;
    });
    
    // Debug logging to identify which filter is excluding deals
    if (result.length === 0 && deals.length > 0) {
      console.log('FilteredDeals Debug - All deals filtered out:', {
        totalDeals: deals.length,
        filterStatus,
        filterOrganization,
        filterCategory,
        filterManager,
        dateRange,
        searchQuery,
        sampleDeal: {
          id: deals[0].id,
          status: deals[0].status,
          organizationId: deals[0].organizationId,
          categoryId: deals[0].categoryId,
          pipelineId: deals[0].pipelineId,
          createdAt: deals[0].createdAt,
          name: deals[0].name
        }
      });
    }
    
    return result;
  }, [deals, filterStatus, filterOrganization, filterCategory, filterManager, searchQuery, persons, dateRange, categoryLabelById, pipelines]);


  // Get selected pipeline
  const selectedPipeline = useMemo(() => {
    if (!selectedPipelineId) return null;
    return pipelines.find(p => p.id === selectedPipelineId) || null;
  }, [pipelines, selectedPipelineId]);

  // Count deals in selected pipeline and status
  const dealsInSelectedPipeline = useMemo(() => {
    if (!selectedPipelineId) return 0;
    return deals.filter(deal => {
      const pipelineMatch = deal.pipelineId === selectedPipelineId;
      const statusMatch = filterStatus === 'all' || deal.status === filterStatus;
      return pipelineMatch && statusMatch;
    }).length;
  }, [deals, selectedPipelineId, filterStatus]);

  // Calculate financial summary for selected pipeline and status
  const financialSummary = useMemo(() => {
    if (!selectedPipelineId) return { totalValue: 0, weightedValue: 0, dealCount: 0 };
    
    const relevantDeals = deals.filter(deal => {
      const pipelineMatch = deal.pipelineId === selectedPipelineId;
      const statusMatch = filterStatus === 'all' || deal.status === filterStatus;
      return pipelineMatch && statusMatch;
    });

    // Create a map of stageId -> probability for quick lookup
    const stageProbabilityMap = new Map<number, number>();
    if (selectedPipeline) {
      selectedPipeline.stages?.forEach(stage => {
        if (stage.id && stage.probability != null) {
          stageProbabilityMap.set(stage.id, stage.probability);
        }
      });
    }

    const totalValue = relevantDeals.reduce((sum, deal) => sum + (deal.value || 0), 0);
    const weightedValue = relevantDeals.reduce((sum, deal) => {
      const dealValue = deal.value || 0;
      
      // Get probability: first from deal, then from stage, default to 100% if not set
      let probability = (deal as any).probability;
      if (probability == null && deal.stageId) {
        probability = stageProbabilityMap.get(deal.stageId) ?? null;
      }
      // If probability is still not set, default to 100% (fully certain)
      if (probability == null) {
        probability = 100;
      }

      // Calculate weighted value: deal_value × (probability / 100)
      return sum + (dealValue * probability / 100);
    }, 0);
    const dealCount = relevantDeals.length;

    return { totalValue, weightedValue, dealCount };
  }, [deals, selectedPipelineId, filterStatus, selectedPipeline]);

  // Get stages for selected pipeline, sorted by order
  const pipelineStages = useMemo(() => {
    if (!selectedPipeline) return [];
    const stages = selectedPipeline.stages || [];
    return stages
      .filter(stage => stage.active !== false)
      .sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [selectedPipeline]);

  // Group deals by stage for the selected pipeline
  const dealsByStage = useMemo(() => {
    const grouped = new Map<number | 'unassigned', Deal[]>();
    
    // Initialize all stages with empty arrays
    pipelineStages.forEach(stage => {
      grouped.set(stage.id, []);
    });
    
    // Add unassigned column
    grouped.set('unassigned', []);

    // Group filtered deals by their stageId
    filteredDeals.forEach(deal => {
      // Only include deals that belong to the selected pipeline
      if (deal.pipelineId === selectedPipelineId) {
        if (deal.stageId) {
          const stageId = typeof deal.stageId === 'number' ? deal.stageId : Number(deal.stageId);
          if (grouped.has(stageId)) {
            grouped.get(stageId)!.push(deal);
          } else {
            // Stage not found in pipeline, add to unassigned
            grouped.get('unassigned')!.push(deal);
          }
        } else {
          // No stage assigned, add to unassigned
          grouped.get('unassigned')!.push(deal);
        }
      }
    });

    // Debug logging
    console.log('DealsByStage Debug:', {
      selectedPipelineId,
      filteredDealsCount: filteredDeals.length,
      totalDeals: deals.length,
      dealsInPipeline: filteredDeals.filter(d => d.pipelineId === selectedPipelineId).length,
      dealsByStageCount: Array.from(grouped.entries()).map(([stageId, deals]) => ({ stageId, count: deals.length })),
      sampleDeal: filteredDeals[0] ? {
        id: filteredDeals[0].id,
        pipelineId: filteredDeals[0].pipelineId,
        stageId: filteredDeals[0].stageId,
        name: filteredDeals[0].name
      } : null,
      filters: {
        filterStatus,
        filterOrganization,
        filterCategory,
        filterManager,
        dateRange,
        searchQuery
      },
      sampleAllDeal: deals[0] ? {
        id: deals[0].id,
        pipelineId: deals[0].pipelineId,
        stageId: deals[0].stageId,
        status: deals[0].status,
        name: deals[0].name
      } : null
    });

    return grouped;
  }, [filteredDeals, selectedPipelineId, pipelineStages, deals]);

  // Calculate totals for each stage
  const stageTotals = useMemo(() => {
    const totals = new Map<number | 'unassigned', { total: number; count: number }>();
    pipelineStages.forEach(stage => {
      const stageDeals = dealsByStage.get(stage.id) || [];
      totals.set(stage.id, {
        total: stageDeals.reduce((sum, deal) => sum + (deal.value || 0), 0),
        count: stageDeals.length,
      });
    });
    // Add unassigned totals
    const unassignedDeals = dealsByStage.get('unassigned') || [];
    totals.set('unassigned', {
      total: unassignedDeals.reduce((sum, deal) => sum + (deal.value || 0), 0),
      count: unassignedDeals.length,
    });
    return totals;
  }, [dealsByStage, pipelineStages]);

  // Get all stages from all pipelines (for form dropdown)

  const stageOptionsForForm = useMemo(() => {
    // If no pipeline is selected, return empty array
    if (!formData.pipelineId || formData.pipelineId === '') {
      return [];
    }
    
    // Get stages from the selected pipeline
    const selectedPipelineId = Number(formData.pipelineId);
    
    // Check if conversion was successful
    if (isNaN(selectedPipelineId)) {
      return [];
    }
    
    // Try to find pipeline in pipelinesById first, then in allPipelines
    let selectedPipeline = pipelinesById.get(selectedPipelineId);
    
    // If not found in pipelinesById, try allPipelines (for diverted deals)
    if (!selectedPipeline) {
      selectedPipeline = allPipelines.find(p => p.id === selectedPipelineId);
    }
    
    if (!selectedPipeline) {
      return [];
    }
    
    // Check if stages exist and are loaded
    if (!selectedPipeline.stages || selectedPipeline.stages.length === 0) {
      return [];
    }
    
    // Return stages from the selected pipeline, sorted by order
    return [...selectedPipeline.stages].sort((a, b) => a.order - b.order);
  }, [formData.pipelineId, pipelinesById, allPipelines]);

  const handleOpenModal = () => {
    // Check if person name was passed from Person page
    const personNameFromState = (location.state as any)?.personName;
    let initialData = personNameFromState 
      ? { ...initialFormState, personName: personNameFromState }
      : initialFormState;
    
    // Auto-select pipeline, organization, and category based on selectedPipelineId
    if (selectedPipelineId) {
      const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
      if (selectedPipeline) {
        initialData.pipelineId = String(selectedPipeline.id);
        // Auto-select the organization from the selected pipeline
        if (selectedPipeline.organization?.id) {
          initialData.organizationId = String(selectedPipeline.organization.id);
        }
        // Auto-select the category from the selected pipeline
        if (selectedPipeline.category && categoryOptions.length > 0) {
          // Find matching category by comparing pipeline category with category label or id
          const matchingCategory = categoryOptions.find(cat => 
            cat.label === selectedPipeline.category || cat.id === selectedPipeline.category
          );
          if (matchingCategory) {
            initialData.categoryId = matchingCategory.id;
          }
        }
        // Auto-select the first stage of the pipeline
        if (selectedPipeline.stages && selectedPipeline.stages.length > 0) {
          const firstStage = selectedPipeline.stages.sort((a, b) => a.order - b.order)[0];
          initialData.stageId = String(firstStage.id);
        }
      }
    } else if (!initialData.pipelineId && pipelines.length > 0) {
    // Auto-select the first pipeline (or RSP if available) if no pipeline is selected
      // Try to find RSP pipeline first
      const rspPipeline = pipelines.find(p => p.name.toLowerCase() === 'rsp');
      if (rspPipeline) {
        initialData.pipelineId = String(rspPipeline.id);
        // Auto-select the organization from RSP pipeline
        if (rspPipeline.organization?.id) {
          initialData.organizationId = String(rspPipeline.organization.id);
        }
        // Auto-select the category from RSP pipeline
        if (rspPipeline.category && categoryOptions.length > 0) {
          const matchingCategory = categoryOptions.find(cat => 
            cat.label === rspPipeline.category || cat.id === rspPipeline.category
          );
          if (matchingCategory) {
            initialData.categoryId = matchingCategory.id;
          }
        }
      } else {
        // Otherwise, select the first pipeline
        initialData.pipelineId = String(pipelines[0].id);
        // Auto-select the organization from the first pipeline
        if (pipelines[0].organization?.id) {
          initialData.organizationId = String(pipelines[0].organization.id);
        }
        // Auto-select the category from the first pipeline
        if (pipelines[0].category && categoryOptions.length > 0) {
          const matchingCategory = categoryOptions.find(cat => 
            cat.label === pipelines[0].category || cat.id === pipelines[0].category
          );
          if (matchingCategory) {
            initialData.categoryId = matchingCategory.id;
          }
        }
      }
    }
    
    setFormData(initialData);
    setModalError(null);
    setDetailError(null);
    setIsModalOpen(true);
    
    // Clear the state after using it
    if (personNameFromState) {
      window.history.replaceState({}, document.title);
    }
  };

  const handleCloseModal = () => {
    if (isSubmitting) {
      return;
    }
    setIsModalOpen(false);
    setDetailError(null);
    setFormData(initialFormState);
    hasHandledOpenModal.current = false;
    // Clear location state to prevent modal from reopening
    navigate(location.pathname, { replace: true, state: {} });
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]: value,
      };
      
      // If organization changes, auto-select the associated pipeline and category
      if (name === 'organizationId' && value) {
        const organizationId = Number(value);
        // Find pipeline associated with this organization
        const associatedPipeline = allPipelines.find(pipeline => 
          pipeline.organization?.id === organizationId
        );
        if (associatedPipeline) {
          newData.pipelineId = String(associatedPipeline.id);
          // Auto-select the first stage of the pipeline
          if (associatedPipeline.stages && associatedPipeline.stages.length > 0) {
            const firstStage = associatedPipeline.stages.sort((a, b) => a.order - b.order)[0];
            newData.stageId = String(firstStage.id);
          } else {
        newData.stageId = '';
          }
        }
        
        // Auto-select category based on organization's category
        const selectedOrg = organizationsById.get(organizationId);
        if (selectedOrg?.category && categoryOptions.length > 0) {
          // Find matching category by comparing organization category with category label or code
          const matchingCategory = categoryOptions.find(cat => 
            cat.label === selectedOrg.category || cat.id === selectedOrg.category
          );
          if (matchingCategory) {
            newData.categoryId = matchingCategory.id;
          }
        }
      }
      
      // If pipeline changes, auto-select the first stage of the new pipeline
      if (name === 'pipelineId' && value) {
        const pipelineId = Number(value);
        const selectedPipeline = allPipelines.find(p => p.id === pipelineId);
        if (selectedPipeline && selectedPipeline.stages && selectedPipeline.stages.length > 0) {
          const firstStage = selectedPipeline.stages.sort((a, b) => a.order - b.order)[0];
          newData.stageId = String(firstStage.id);
        } else {
          newData.stageId = '';
        }
      }
      
      // If source changes, clear subSource if source is not "Direct"
      if (name === 'source') {
        if (value !== 'Direct') {
          newData.subSource = '';
        }
      }
      
      // If personName is being changed, filter persons for autocomplete
      // Search by name, phone, instagramId, or email (exact or partial match)
      if (name === 'personName') {
        if (value.trim().length > 0) {
          const searchValue = value.toLowerCase().trim();
          const filtered = persons.filter(p => {
            const nameMatch = p.name.toLowerCase().includes(searchValue);
            const phoneMatch = p.phone?.toLowerCase().includes(searchValue) || p.phone?.replace(/\s+/g, '').includes(searchValue.replace(/\s+/g, ''));
            const instagramMatch = p.instagramId?.toLowerCase().includes(searchValue);
            const emailMatch = p.email?.toLowerCase().includes(searchValue);
            return nameMatch || phoneMatch || instagramMatch || emailMatch;
          });
          setFilteredPersons(filtered);
          setShowPersonSuggestions(true); // Always show suggestions to allow "Create new person" option
        } else {
          setFilteredPersons([]);
          setShowPersonSuggestions(false);
        }
      }
      
      return newData;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formData.name.trim()) {
      setModalError('Deal name is required.');
      return;
    }

    // Validate that contact person is provided
    if (!formData.personName.trim()) {
      setModalError('Contact person is required.');
      return;
    }

    // Validate that deal source is provided
    if (!formData.source.trim()) {
      setModalError('Deal source is required.');
      return;
    }

    // Validate that deal sub-source is provided if source is "Direct"
    if (formData.source === 'Direct' && !formData.subSource.trim()) {
      setModalError('Deal sub-source is required when source is Direct.');
      return;
    }

    // Try to find person by name if personName is provided, or create a new person
    let personId: number | undefined = undefined;
    let personHasPhone = false;
    if (formData.personName.trim()) {
      const searchName = formData.personName.toLowerCase().trim();
      console.log(`Looking for person with name: "${formData.personName}" (normalized: "${searchName}")`);
      console.log(`Available persons (${persons.length}):`, persons.map(p => ({ id: p.id, name: p.name, phone: p.phone })));
      
      const foundPerson = persons.find(
        (p) => p.name.toLowerCase().trim() === searchName
      );
      
      if (foundPerson) {
        personId = foundPerson.id;
        console.log(`✓ Found person: ID=${foundPerson.id}, Name="${foundPerson.name}", Phone="${foundPerson.phone}"`);
        
        // Use cached person data from the persons array (already loaded and refreshed)
        personHasPhone = !!(foundPerson.phone && foundPerson.phone.trim().length > 0);
        console.log(`✓ Using cached person data for "${foundPerson.name}": phone="${foundPerson.phone}", personHasPhone=${personHasPhone}`);
      } else {
        console.log(`✗ Person not found in cache, will create new person`);
        // Person doesn't exist, create a new one
        try {
          const newPerson = await personsApi.create({
            name: formData.personName.trim(),
          });
          personId = newPerson.id;
          personHasPhone = !!(newPerson.phone && newPerson.phone.trim().length > 0);
          console.log(`✓ Created new person: ID=${newPerson.id}, Name="${newPerson.name}", Phone="${newPerson.phone}", personHasPhone=${personHasPhone}`);
          // Reload persons list to include the new person
          const personsPage = await personsApi.list({ page: 0, size: 200, sort: 'name,asc' });
          setPersons(personsPage.content ?? []);
        } catch (err: any) {
          const message = err?.response?.data?.message || err?.message || 'Failed to create person.';
          setModalError(message);
          setIsSubmitting(false);
          return;
        }
      }
    } else {
      console.log('No person name provided, skipping person lookup');
    }

    const trimmedCategory = formData.categoryId?.trim();
    let resolvedCategory: number | string | undefined;
    if (trimmedCategory && trimmedCategory.length > 0) {
      const numericVal = Number(trimmedCategory);
      if (!Number.isNaN(numericVal) && trimmedCategory === String(numericVal)) {
        resolvedCategory = numericVal;
      } else {
        resolvedCategory = trimmedCategory;
      }
    }

    // For diverted deals, use the pipeline's organization instead of the form's organizationId
    let organizationId = formData.organizationId ? Number(formData.organizationId) : undefined;
    if (formData.label === 'DIVERT' && formData.pipelineId) {
      const selectedPipeline = pipelines.find(p => p.id === Number(formData.pipelineId));
      if (selectedPipeline?.organization?.id) {
        organizationId = selectedPipeline.organization.id;
      }
    }

    // Determine stage based on person's phone number - ALWAYS set based on phone, not manual selection
    let stageId: number | undefined = undefined;
    
    console.log(`=== Stage Assignment Logic ===`);
    console.log(`Person ID: ${personId}, Person Has Phone: ${personHasPhone}, Pipeline ID: ${formData.pipelineId}, Manual Stage ID: ${formData.stageId}`);
    
    if (personId && formData.pipelineId) {
      const selectedPipeline = pipelines.find(p => p.id === Number(formData.pipelineId));
      if (selectedPipeline) {
        console.log(`Pipeline found: "${selectedPipeline.name}" with ${selectedPipeline.stages.length} stages`);
        console.log(`Pipeline stages:`, selectedPipeline.stages.map(s => ({ id: s.id, name: s.name })));
        
        // Find stages by name (case-insensitive, flexible matching)
        const leadInStage = selectedPipeline.stages.find(s => {
          const stageName = s.name.toLowerCase().trim();
          return stageName === 'lead in' || stageName === 'leadin' || stageName === 'lead-in';
        });
        const qualifiedStage = selectedPipeline.stages.find(s => {
          const stageName = s.name.toLowerCase().trim();
          return stageName === 'qualified';
        });
        
        console.log(`Lead In Stage: ${leadInStage ? `Found (ID: ${leadInStage.id}, Name: "${leadInStage.name}")` : 'NOT FOUND'}`);
        console.log(`Qualified Stage: ${qualifiedStage ? `Found (ID: ${qualifiedStage.id}, Name: "${qualifiedStage.name}")` : 'NOT FOUND'}`);
        
        // ALWAYS auto-assign stage based on phone number - PRIORITY OVER MANUAL SELECTION
        // If person has phone, use Qualified stage; otherwise use Lead In stage
        if (personHasPhone) {
          if (qualifiedStage) {
          stageId = qualifiedStage.id;
            console.log(`✓✓✓ Person has phone (${personHasPhone}), FORCING stage to Qualified (ID: ${qualifiedStage.id}, Name: "${qualifiedStage.name}")`);
          } else {
            console.error(`❌ Person has phone but Qualified stage not found in pipeline "${selectedPipeline.name}"!`);
            console.error(`Available stages: ${selectedPipeline.stages.map(s => s.name).join(', ')}`);
            // If qualified stage not found but person has phone, still try to use lead in or fallback
            if (leadInStage) {
          stageId = leadInStage.id;
              console.warn(`⚠ Using Lead In stage as fallback: ${leadInStage.id}`);
            } else if (formData.stageId) {
              stageId = Number(formData.stageId);
              console.warn(`⚠ Using manually selected stage as fallback: ${stageId}`);
            } else if (selectedPipeline.stages.length > 0) {
              stageId = selectedPipeline.stages[0].id;
              console.warn(`⚠ Using first stage as fallback: ${stageId}`);
            }
          }
        } else {
          if (leadInStage) {
            stageId = leadInStage.id;
            console.log(`✓ Person has no phone, setting stage to Lead In (ID: ${leadInStage.id}, Name: "${leadInStage.name}")`);
          } else {
            console.warn(`⚠ Person has no phone but Lead In stage not found in pipeline. Available stages: ${selectedPipeline.stages.map(s => s.name).join(', ')}`);
          // Fallback: use manually selected stage if available, or first stage
          if (formData.stageId) {
            stageId = Number(formData.stageId);
            console.log(`Using manually selected stage: ${stageId}`);
          } else if (selectedPipeline.stages.length > 0) {
            stageId = selectedPipeline.stages[0].id;
            console.log(`Using first stage as fallback: ${stageId}`);
          }
        }
      }
      } else {
        console.error(`❌ Pipeline ${formData.pipelineId} not found in pipelines list!`);
        console.log(`Available pipelines:`, pipelines.map(p => ({ id: p.id, name: p.name })));
        // Fallback to manual stage if pipeline not found
        if (formData.stageId) {
      stageId = Number(formData.stageId);
          console.log(`Using manually selected stage as fallback: ${stageId}`);
        }
      }
    } else {
      if (!personId) {
        console.log(`No person ID, cannot auto-assign stage based on phone`);
      }
      if (!formData.pipelineId) {
        console.log(`No pipeline ID, cannot auto-assign stage based on phone`);
      }
      // If no person or pipeline, use manually selected stage or first stage of pipeline
      if (formData.stageId) {
        stageId = Number(formData.stageId);
        console.log(`Using manually selected stage: ${stageId}`);
      } else if (formData.pipelineId) {
        // If no manual stage selected but pipeline is selected, use first stage
        const selectedPipeline = pipelines.find(p => p.id === Number(formData.pipelineId));
        if (selectedPipeline && selectedPipeline.stages && selectedPipeline.stages.length > 0) {
          const firstStage = selectedPipeline.stages.sort((a, b) => a.order - b.order)[0];
          stageId = firstStage.id;
          console.log(`No manual stage selected, using first stage of pipeline: ${stageId} (${firstStage.name})`);
        }
      }
    }
    
    console.log(`=== Final Stage ID: ${stageId} ===`);

    // Log the final payload to verify stageId is set correctly
    console.log(`=== Creating Deal Payload ===`);
    console.log(`Name: ${formData.name.trim()}`);
    console.log(`Person ID: ${personId}`);
    console.log(`Pipeline ID: ${formData.pipelineId ? Number(formData.pipelineId) : undefined}`);
    console.log(`Stage ID: ${stageId} ${stageId ? '(AUTO-ASSIGNED)' : '(NOT SET!)'}`);
    console.log(`Organization ID: ${organizationId}`);

    const payload: any = {
      name: formData.name.trim(),
      status: formData.status,
      personId: personId,
      pipelineId: formData.pipelineId ? Number(formData.pipelineId) : undefined,
      stageId: stageId, // This should be set based on phone number
      organizationId: organizationId,
      categoryId: resolvedCategory,
      label: formData.label ? formData.label : undefined,
      source: formData.source ? (formData.source as DealSource) : undefined,
      subSource: (formData.source === 'Direct' && formData.subSource) ? (formData.subSource as DealSubSource) : undefined,
      referencedDealId: formData.referencedDealId ? Number(formData.referencedDealId) : undefined,
      eventType: formData.eventType ? formData.eventType : undefined,
      venue: formData.venue ? formData.venue : undefined,
      ...normalizeEventDatesForRequest(
        formData.eventDate || null,
        formData.eventDates && formData.eventDates.length > 0 
          ? formData.eventDates.filter(date => date && date.trim() !== '')
          : null
      ),
    };

    // For diverted deals, omit the value field - backend automatically sets it to 0
    // For other deals, include value if provided
    if (formData.label !== 'DIVERT' && formData.value) {
      payload.value = Number(formData.value);
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      const createdDeal = await dealsApi.create(payload);
      await loadDeals(createdDeal.id);
      
      // Check if deal was created in Qualified stage and create activities
      if (createdDeal.pipelineId && createdDeal.stageId) {
        const pipeline = pipelines.find(p => p.id === createdDeal.pipelineId);
        if (pipeline) {
          const currentStage = pipeline.stages.find(s => s.id === createdDeal.stageId);
          if (currentStage) {
            const stageName = currentStage.name.toLowerCase().trim();
            const isQualified = stageName === 'qualified';
            if (isQualified) {
              await createQualifiedStageActivities(createdDeal);
            }
          }
        }
      }
      
      setIsModalOpen(false);
      setFormData(initialFormState);
      setSelectedDeal(createdDeal);
      hasHandledOpenModal.current = false;
      // Clear location state to prevent modal from reopening
      navigate(location.pathname, { replace: true, state: {} });
      // Show success confirmation pop-up
      setCreatedDealName(createdDeal.name);
      setShowSuccessConfirmation(true);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to create deal.';
      setModalError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusUpdate = async (dealId: number, nextStatus: DealStatus) => {
    // Find the deal
    const deal = deals.find(d => d.id === dealId);
    if (!deal) {
      setError('Deal not found');
      return;
    }

    // If marking as LOST, show the modal to select a reason
    if (nextStatus === 'LOST') {
      setMarkAsLostDealId(dealId);
      return;
    }

    // Validate when marking as WON
    if (nextStatus === 'WON') {
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
            setError(errorMessage);
            setShowErrorToast(true);
            // Auto-hide after 5 seconds
            setTimeout(() => {
              setShowErrorToast(false);
              setError(null);
            }, 5000);
            return;
          }
        }
      }
      }
      
      // Always show modal when marking as WON to allow editing value and commission
      setDealValueModalDealId(dealId);
      return;
    }

    setActionInFlight({ dealId, type: 'status' });
    try {
      const updatedDeal = await dealsApi.updateStatus(dealId, { status: nextStatus });
      setDeals((prev) => prev.map((deal) => (deal.id === dealId ? updatedDeal : deal)));
      setSelectedDeal((prev) => (prev && prev.id === dealId ? updatedDeal : prev));
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to update status.';
      setError(message);
    } finally {
      setActionInFlight(null);
    }
  };

  const handleDealValueUpdate = async (dealId: number, dealValue: number, commissionAmount?: number, source?: DealSource, subSource?: DealSubSource) => {
    // Update status with value, commission, and source
    setActionInFlight({ dealId, type: 'status' });
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
      const wonDeal = await dealsApi.update(dealId, updatePayload);
      setDeals((prev) => prev.map((deal) => (deal.id === dealId ? wonDeal : deal)));
      setSelectedDeal((prev) => (prev && prev.id === dealId ? wonDeal : prev));
      
      setDealValueModalDealId(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to update deal value.';
      setError(message);
      throw err;
    } finally {
      setActionInFlight(null);
    }
  };

  const handleMarkAsLost = async (dealId: number, lostReason: string) => {
    // Find the deal
    const deal = deals.find(d => d.id === dealId);
    if (!deal) {
      throw new Error('Deal not found');
    }

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

    setActionInFlight({ dealId, type: 'status' });
    try {
      const updatedDeal = await dealsApi.updateStatus(dealId, { status: 'LOST', lostReason });
      setDeals((prev) => prev.map((deal) => (deal.id === dealId ? updatedDeal : deal)));
      setSelectedDeal((prev) => (prev && prev.id === dealId ? updatedDeal : prev));
      setMarkAsLostDealId(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to mark deal as lost.';
      throw new Error(message);
    } finally {
      setActionInFlight(null);
    }
  };

  const handleStageUpdate = async (dealId: number, stageId: number) => {
    // Find the deal
    const deal = deals.find(d => d.id === dealId);
    if (!deal) {
      setError('Deal not found');
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
              const person = persons.find(p => p.id === deal.personId);
              const hasContactNumber = person && person.phone && person.phone.trim() !== '';
              
              if (!hasContactNumber) {
                const errorMessage = 'Please add the contact number for moving the deal to the next stage.';
                setError(errorMessage);
                setShowErrorToast(true);
                // Auto-hide after 5 seconds
                setTimeout(() => {
                  setShowErrorToast(false);
                  setError(null);
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
              setError(errorMessage);
              setShowErrorToast(true);
              // Auto-hide after 5 seconds
              setTimeout(() => {
                setShowErrorToast(false);
                setError(null);
              }, 5000);
              return;
            }
          } else {
            // Moving backward - only check activities
            const hasIncompleteActivities = await checkIncompleteActivities(deal);
            if (hasIncompleteActivities) {
              const errorMessage = "Can't go back to the previous stage, please finish your assigned activities to move to the next stage.";
              setError(errorMessage);
              setShowErrorToast(true);
              // Auto-hide after 5 seconds
              setTimeout(() => {
                setShowErrorToast(false);
                setError(null);
              }, 5000);
              return;
            }
          }
        }
      }
    }

    setActionInFlight({ dealId, type: 'stage' });
    try {
      // Store the original stage before moving to check if we're moving back to Qualified
      const originalStage = pipeline?.stages.find(s => s.id === deal.stageId);
      const qualifiedStage = pipeline?.stages.find(s => {
        const sName = s.name.toLowerCase().trim();
        return sName === 'qualified';
      });
      
      const updatedDeal = await dealsApi.moveToStage(dealId, { stageId });
      setDeals((prev) => prev.map((deal) => (deal.id === dealId ? updatedDeal : deal)));
      setSelectedDeal((prev) => (prev && prev.id === dealId ? updatedDeal : prev));
      
      // Check if deal was moved to Qualified stage and create activities
      // Only create activities if:
      // 1. The deal was NOT previously in a stage after Qualified (i.e., not moving back)
      // 2. This means: original stage order should be <= qualified stage order (or original stage is null/undefined)
      if (updatedDeal.pipelineId && updatedDeal.stageId) {
        const pipeline = pipelines.find(p => p.id === updatedDeal.pipelineId);
        if (pipeline) {
          const currentStage = pipeline.stages.find(s => s.id === updatedDeal.stageId);
          if (currentStage) {
            const stageName = currentStage.name.toLowerCase().trim();
            const isQualified = stageName === 'qualified';
            if (isQualified && qualifiedStage) {
              // Only create activities if we're NOT moving back from a later stage
              // If originalStage exists and its order is greater than qualified stage order, skip activity creation
              const isMovingBackToQualified = originalStage && originalStage.order > qualifiedStage.order;
              if (!isMovingBackToQualified) {
                await createQualifiedStageActivities(updatedDeal);
              }
            }
          }
        }
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to update stage.';
      setError(message);
    } finally {
      setActionInFlight(null);
    }
  };

  const isLoadingAction = (dealId: number, type: 'status' | 'stage') =>
    actionInFlight?.dealId === dealId && actionInFlight?.type === type;

  const toggleDealSelection = (dealId: number, checked: boolean) => {
    setBulkDeleteError(null);
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(dealId);
      } else {
        next.delete(dealId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setBulkDeleteError(null);
    setSelectedDealIds(new Set());
  };
  const hasSelection = selectedDealIds.size > 0;
  const allFilteredSelected = filteredDeals.length > 0 && filteredDeals.every((deal) => selectedDealIds.has(deal.id));

  const selectAllFiltered = useCallback(() => {
    if (filteredDeals.length === 0) return;
    setBulkDeleteError(null);
    setSelectedDealIds(new Set(filteredDeals.map((deal) => deal.id)));
  }, [filteredDeals]);

  const handleBulkDelete = async () => {
    if (!hasSelection || bulkDeleteLoading) return;
    const ids = Array.from(selectedDealIds);
    const confirmed = window.confirm(
      `Delete ${ids.length} selected deal${ids.length > 1 ? 's' : ''}? This action cannot be undone.`,
    );
    if (!confirmed) return;
    setBulkDeleteLoading(true);
    setBulkDeleteError(null);
    const failures: Array<{ id: number; message: string }> = [];
    for (const id of ids) {
      try {
        await dealsApi.remove(id);
        setDeals((prev) => prev.filter((deal) => deal.id !== id));
        setSelectedDeal((prev) => (prev && prev.id === id ? null : prev));
      } catch (err: any) {
        // Log error for debugging
        console.error(`Failed to delete deal ${id}:`, err);
        // Handle backend error response format: { success: false, message: "...", data: null }
        const errorResponse = err?.response?.data;
        const message = errorResponse?.message || err?.message || 'Failed to delete deal.';
        failures.push({ id, message });
      }
    }
    setBulkDeleteLoading(false);
    if (failures.length > 0) {
      const errorMessage = failures.length === ids.length
          ? failures[0]?.message ?? 'Failed to delete selected deals.'
        : failures.length === 1
          ? failures[0]?.message
          : `Deleted ${ids.length - failures.length} deals, but ${failures.length} failed: ${failures.map(f => f.message).join('; ')}`;
      setBulkDeleteError(errorMessage);
      // Show alert for bulk delete errors
      window.alert(errorMessage);
    } else {
      setBulkDeleteError(null);
    }
    clearSelection();
  };

  useEffect(() => {
    if (selectedDealIds.size === 0) return;
    setBulkDeleteError(null);
    setSelectedDealIds(new Set());
  }, [filterStatus, filterOrganization, filterCategory, filterManager]);

  const handleDeleteDeal = async (dealOrId: Deal | number, skipConfirmation = false) => {
    const deal = typeof dealOrId === 'number' ? deals.find(d => d.id === dealOrId) : dealOrId;
    if (!deal) return;
    if (!skipConfirmation) {
      const label = deal.name?.trim().length ? `"${deal.name.trim()}"` : `Deal #${deal.id}`;
      const confirmed = window.confirm(`Delete ${label}? This action cannot be undone.`);
      if (!confirmed) return;
    }
  if (bulkDeleteLoading) return;
    setDeleteLoadingId(deal.id);
    setDetailError(null);
    try {
      await dealsApi.remove(deal.id);
      setDeals((prev) => prev.filter((item) => item.id !== deal.id));
      setSelectedDeal((prev) => (prev && prev.id === deal.id ? null : prev));
    setSelectedDealIds((prev) => {
      if (!prev.has(deal.id)) return prev;
      const next = new Set(prev);
      next.delete(deal.id);
      return next;
    });
    } catch (err: any) {
      console.error('Failed to delete deal:', err);
      // Handle backend error response format: { success: false, message: "...", data: null }
      const errorResponse = err?.response?.data;
      const message = errorResponse?.message || err?.message || 'Failed to delete deal.';
      setDetailError(message);
      // Always show alert for delete errors so user knows what went wrong
        window.alert(message);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const selectedDealPipeline = selectedDeal?.pipelineId
    ? pipelinesById.get(selectedDeal.pipelineId) ?? null
    : null;
  const selectedDealStages: Stage[] = selectedDealPipeline?.stages ?? [];
  const selectedDealCalendarEmail = selectedDeal?.organizationId
    ? organizationsById.get(selectedDeal.organizationId)?.googleCalendarId ?? null
    : null;

  if (loading) {
    return (
      <div className="deals-page">
        <div className="deals-loading">Loading deals...</div>
      </div>
    );
  }

    return (
      <div className="deals-page">
      {/* Toast Notification for Errors */}
      {showErrorToast && error && createPortal(
        <div className="deals-toast-overlay" onClick={() => { setShowErrorToast(false); setError(null); }}>
          <div className="deals-toast" onClick={(e) => e.stopPropagation()}>
            <div className="deals-toast-icon-wrapper">
              <svg className="deals-toast-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L1 21H23L12 2Z" fill="#FCD34D" stroke="#F59E0B" strokeWidth="1.5"/>
                <path d="M12 9V13M12 17H12.01" stroke="#92400E" strokeWidth="2" strokeLinecap="round"/>
              </svg>
      </div>
            <div className="deals-toast-content">
              <div className="deals-toast-message">{error}</div>
            </div>
            <button 
              className="deals-toast-close" 
              onClick={() => { setShowErrorToast(false); setError(null); }}
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
      <h1 className="deals-page-title">Deals</h1>
      <div className="deals-header">
        <div className="deals-header-top">
          <div className="deals-header-left">
            <div className="deals-view-buttons">
              <button
                className={`deals-view-icon-btn ${viewMode === 'pipeline' ? 'active' : ''}`}
                onClick={() => setViewMode('pipeline')}
                title="Pipeline view"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="2" y="2" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="10" y="2" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="2" y="10" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="10" y="10" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
              </button>
              <button
                className={`deals-view-icon-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="deals-add-button-container">
              <button className="deals-add-btn" onClick={handleOpenModal}>
                + Deal
              </button>
            </div>
          </div>
          <div className="deals-header-right">
            {selectedPipelineId && (
              <div className="deals-total-count">
                {dealsInSelectedPipeline} {dealsInSelectedPipeline === 1 ? 'deal' : 'deals'}
                <span 
                  ref={infoIconRef}
                  className={`deals-info-icon ${isSummaryOpen ? 'summary-open' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                    if (viewMode === 'pipeline') {
                      setIsSummaryOpen(!isSummaryOpen);
                    }
                  }}
                  title={viewMode === 'pipeline' ? 'View summary' : 'Total deals in selected pipeline and status'}
                  style={{ cursor: viewMode === 'pipeline' ? 'pointer' : 'help' }}
                >
                  ℹ️
                  {viewMode === 'pipeline' && isSummaryOpen && (
                    <div className="deals-summary-card">
                      <div className="deals-summary-section">
                        <div className="deals-summary-label">Total:</div>
                        <div className="deals-summary-values">
                          <span className="deals-summary-value">{formatCurrency(financialSummary.totalValue)}</span>
                          <span className="deals-summary-weighted">
                            <span className="deals-summary-icon">⚖️</span>
                            {formatCurrency(financialSummary.weightedValue)}
                          </span>
                          <span className="deals-summary-count">{financialSummary.dealCount} deals</span>
                        </div>
                      </div>
                    </div>
                  )}
                </span>
                </div>
            )}
            {viewMode === 'pipeline' && (
              <>
                <div className="deals-pipeline-selector" ref={pipelineDropdownRef}>
                  <button 
                    className="deals-pipeline-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPipelineDropdownOpen(!isPipelineDropdownOpen);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                      <rect x="2" y="2" width="5" height="5" rx="0.5" fill="currentColor"/>
                      <rect x="9" y="2" width="5" height="5" rx="0.5" fill="currentColor"/>
                      <rect x="2" y="9" width="5" height="5" rx="0.5" fill="currentColor"/>
                      <rect x="9" y="9" width="5" height="5" rx="0.5" fill="currentColor"/>
                    </svg>
                    {selectedPipeline?.name || 'Select Pipeline'}
                    <span style={{ marginLeft: '6px' }}>▾</span>
                  </button>
                  {isPipelineDropdownOpen && (
                    <div className="deals-pipeline-dropdown">
                      {/* Search input */}
                      <div className="deals-pipeline-search-container">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="deals-pipeline-search-icon">
                          <path d="M6.41667 11.0833C8.99405 11.0833 11.0833 8.99405 11.0833 6.41667C11.0833 3.83929 8.99405 1.75 6.41667 1.75C3.83929 1.75 1.75 3.83929 1.75 6.41667C1.75 8.99405 3.83929 11.0833 6.41667 11.0833Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12.25 12.25L9.71252 9.71252" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <input
                          ref={pipelineSearchInputRef}
                          type="text"
                          className="deals-pipeline-search-input"
                          placeholder="Search for pipelines"
                          value={pipelineSearchQuery}
                          onChange={(e) => setPipelineSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setIsPipelineDropdownOpen(false);
                            }
                          }}
                        />
                      </div>
                      
                      {/* Pipeline list */}
                      <div className="deals-pipeline-list">
                      {filteredPipelines.length === 0 ? (
                        <div className="deals-pipeline-option" style={{ cursor: 'default', opacity: 0.6 }}>
                            {pipelineSearchQuery.trim() ? 'No pipelines found' : 'No pipelines match the selected filters'}
                        </div>
                      ) : (
                        filteredPipelines.map((pipeline) => (
                        <button
                          key={pipeline.id}
                          className={`deals-pipeline-option ${selectedPipelineId === pipeline.id ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPipelineId(pipeline.id);
                            if (pipeline.id !== null) {
                              localStorage.setItem('selectedPipelineId', pipeline.id.toString());
                            }
                            setIsPipelineDropdownOpen(false);
                                setPipelineSearchQuery('');
                          }}
                        >
                              <span className="deals-pipeline-option-name">{pipeline.name}</span>
                              {selectedPipelineId === pipeline.id && (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="deals-pipeline-checkmark">
                                  <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                        </button>
                        ))
                      )}
                      </div>

                      {/* Divider */}
                      <div className="deals-pipeline-divider"></div>

                      {/* Actions */}
                      <div className="deals-pipeline-actions">
                        <button
                          className="deals-pipeline-action-option"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsPipelineDropdownOpen(false);
                            setPipelineSearchQuery('');
                            navigate('/pipelines');
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="deals-pipeline-action-icon">
                            <path d="M2 4H14M2 8H14M2 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>Manage pipelines</span>
                        </button>
                        <button
                          className="deals-pipeline-action-option"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReorderPipelines();
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="deals-pipeline-action-icon">
                            <path d="M4 6H12M4 10H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          <span>Reorder pipelines</span>
                        </button>
                      </div>

                      {/* Divider */}
                      <div className="deals-pipeline-divider"></div>

                      {/* New pipeline option */}
                      <button
                        className="deals-pipeline-new-option"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsPipelineModalOpen(true);
                          setIsPipelineDropdownOpen(false);
                          setPipelineSearchQuery('');
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="deals-pipeline-plus-icon">
                          <path d="M8 3.33334V12.6667M3.33334 8H12.6667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <span>New pipeline</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="deals-filter-button-container" ref={filterDropdownRef}>
              <button 
                className="deals-filter-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFilterDropdownOpen(!isFilterDropdownOpen);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                  <path d="M2 4H14M4 8H12M6 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Filter
                <span style={{ marginLeft: '6px' }}>▾</span>
              </button>
              {isFilterDropdownOpen && (
                <div className="deals-filter-dropdown">
                  <button
                    className={`deals-filter-option ${filterStatus === 'all' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterStatus('all');
                      setIsFilterDropdownOpen(false);
                    }}
                  >
                    All
                  </button>
                  <button
                    className={`deals-filter-option ${filterStatus === 'IN_PROGRESS' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterStatus('IN_PROGRESS');
                      setIsFilterDropdownOpen(false);
                    }}
                  >
                    Open deals
                  </button>
                  <button
                    className={`deals-filter-option ${filterStatus === 'WON' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterStatus('WON');
                      setIsFilterDropdownOpen(false);
                    }}
                  >
                    Won
                  </button>
                  <button
                    className={`deals-filter-option ${filterStatus === 'LOST' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterStatus('LOST');
                      setIsFilterDropdownOpen(false);
                    }}
                  >
                    Lost
                  </button>
                </div>
              )}
            </div>
            {viewMode === 'list' && hasSelection && (
              <>
                <button
                  className="deals-delete-selected-btn"
                  onClick={() => void handleBulkDelete()}
                  disabled={!hasSelection || bulkDeleteLoading}
                >
                  {bulkDeleteLoading ? 'Deleting…' : 'Delete selected'}
                </button>
                <button
                  className="deals-select-all-btn"
                  onClick={selectAllFiltered}
                  disabled={filteredDeals.length === 0 || allFilteredSelected || bulkDeleteLoading}
                >
                  Select all
                </button>
                <button
                  className="deals-clear-selection-btn"
                  onClick={clearSelection}
                  disabled={bulkDeleteLoading}
                >
                  Clear selection
                </button>
                <span className="deals-selection-count">{selectedDealIds.size} selected</span>
              </>
            )}
          </div>
        </div>
        <div className="deals-header-bottom">
          <div style={{ position: 'relative' }} ref={dateRangeDropdownRef}>
            <button 
              className="filter-select"
              onClick={() => setIsDateRangeDropdownOpen(!isDateRangeDropdownOpen)}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '180px',
                justifyContent: 'space-between',
              }}
            >
              <span>{getDateRangeDisplayText()}</span>
              <span style={{ fontSize: '10px' }}>▾</span>
            </button>
            {isDateRangeDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  backgroundColor: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
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
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
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
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
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
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
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
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
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
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
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
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
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
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
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
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
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
                    color: '#374151',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  Select date range
                </button>
              </div>
            )}
          </div>
          <select
            className="filter-select"
            value={filterCategory ?? ''}
            onChange={(event) => {
              const { value } = event.target;
              if (value === '') {
                setFilterCategory(null);
                return;
              }
              setFilterCategory(value);
            }}
          >
            <option value="">All Categories</option>
            {categoryOptions.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={filterManager ?? ''}
            onChange={(event) => setFilterManager(event.target.value === '' ? null : Number(event.target.value))}
          >
            <option value="">All Manager</option>
            {filteredManagers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.displayName || manager.email}
              </option>
            ))}
          </select>
          <div className="deals-sort-container" ref={sortDropdownRef}>
            <button
              className="deals-sort-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                setSortDirection(newDirection);
                localStorage.setItem('dealsSortDirection', newDirection);
              }}
              aria-label={sortDirection === 'asc' ? 'Sort ascending - Click to change to descending' : 'Sort descending - Click to change to ascending'}
              onMouseEnter={(e) => {
                const button = e.currentTarget;
                const rect = button.getBoundingClientRect();
                const tooltip = document.querySelector('.deals-sort-tooltip') as HTMLElement;
                if (tooltip) {
                  const tooltipText = sortDirection === 'asc' ? 'Ascending order - Click to sort descending' : 'Descending order - Click to sort ascending';
                  tooltip.textContent = tooltipText;
                  tooltip.style.display = 'block';
                  // Force reflow to get accurate dimensions
                  void tooltip.offsetWidth;
                  const tooltipHeight = tooltip.offsetHeight;
                  const left = rect.left + rect.width / 2;
                  const top = rect.top - tooltipHeight - 10;
                  
                  tooltip.style.left = `${left}px`;
                  tooltip.style.top = `${Math.max(10, top)}px`;
                  tooltip.classList.add('show');
                }
              }}
              onMouseLeave={() => {
                const tooltip = document.querySelector('.deals-sort-tooltip') as HTMLElement;
                if (tooltip) {
                  tooltip.classList.remove('show');
                  setTimeout(() => {
                    if (!tooltip.classList.contains('show')) {
                      tooltip.style.display = 'none';
                    }
                  }, 200);
                }
              }}
            >
              {sortDirection === 'asc' ? (
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 12L3 7H7V3H9V7H13L8 12Z" fill="currentColor"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 4L13 9H9V13H7V9H3L8 4Z" fill="currentColor"/>
                </svg>
              )}
            </button>
            <span className="deals-sort-label">Sort by:</span>
            <button 
              className="deals-sort-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsSortDropdownOpen(!isSortDropdownOpen);
              }}
            >
              {getSortFieldLabel(sortField)}
              <span style={{ marginLeft: '6px' }}>▾</span>
            </button>
            {isSortDropdownOpen && (
              <div className="deals-sort-dropdown">
                <div className="deals-sort-dropdown-title">SORT BY</div>
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`deals-sort-option ${sortField === option.value ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSortField(option.value);
                      localStorage.setItem('dealsSortField', option.value);
                      setIsSortDropdownOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {sortField === option.value && (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="deals-sort-checkmark">
                        <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {bulkDeleteError && <div className="deals-inline-error">{bulkDeleteError}</div>}

      <div className="deals-content">
        {bulkDeleteLoading && (
          <div className="deals-loading-overlay" role="status" aria-live="polite">
            <div className="deals-loading-spinner" />
            <span>Deleting selected deals…</span>
          </div>
        )}
        {viewMode === 'pipeline' ? (
          <>
            {/* Status Zones - appear when dragging a deal */}
            {draggedDealId && (
              <>
                {/* Delete Zone - Leftmost */}
                <div
                  className={`kanban-delete-zone ${isDragOverDeleteZone ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragPosition({ x: e.clientX, y: e.clientY });
                    setIsDragOverDeleteZone(true);
                    setIsDragOverWonZone(false);
                    setIsDragOverLostZone(false);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setIsDragOverDeleteZone(false);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOverDeleteZone(false);
                    // Get the deal ID from the dataTransfer or state
                    const dealIdFromData = e.dataTransfer.getData('text/plain');
                    const dealId = dealIdFromData ? Number(dealIdFromData) : draggedDealId;
                    
                    if (dealId) {
                      const deal = deals.find(d => d.id === dealId);
                      if (deal) {
                        // Clear dragged state first
                        setDraggedDealId(null);
                        setDragPosition(null);
                        // Set flag to prevent immediate closing
                        deleteModalJustOpened.current = true;
                        // Use setTimeout to ensure all drag events are complete before showing modal
                        setTimeout(() => {
                          setDeleteConfirmDeal(deal);
                          // Reset flag after modal is shown
                          setTimeout(() => {
                            deleteModalJustOpened.current = false;
                          }, 100);
                        }, 50);
                      }
                    }
                  }}
                >
                  <div className="kanban-delete-zone-content">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p className="kanban-delete-zone-text">Delete</p>
                  </div>
                </div>

                {/* WON Zone - Middle - Only show if dragged deal is not already WON */}
                {(() => {
                  const draggedDeal = draggedDealId ? deals.find(d => d.id === draggedDealId) : null;
                  const isDraggedDealWon = draggedDeal?.status === 'WON';
                  return !isDraggedDealWon ? (
                <div
                  className={`kanban-status-zone kanban-won-zone ${isDragOverWonZone ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragPosition({ x: e.clientX, y: e.clientY });
                    setIsDragOverWonZone(true);
                    setIsDragOverDeleteZone(false);
                    setIsDragOverLostZone(false);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setIsDragOverWonZone(false);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverWonZone(false);
                    if (draggedDealId) {
                      const deal = deals.find(d => d.id === draggedDealId);
                      if (deal && deal.status !== 'WON') {
                        void handleStatusUpdate(draggedDealId, 'WON');
                      }
                    }
                    setDraggedDealId(null);
                    setDragPosition(null);
                  }}
                >
                  <div className="kanban-status-zone-content">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p className="kanban-status-zone-text">Mark as WON</p>
                  </div>
                </div>
                  ) : null;
                })()}

                {/* LOST Zone - Rightmost - Only show if dragged deal is not already LOST */}
                {(() => {
                  const draggedDeal = draggedDealId ? deals.find(d => d.id === draggedDealId) : null;
                  const isDraggedDealLost = draggedDeal?.status === 'LOST';
                  return !isDraggedDealLost ? (
                <div
                  className={`kanban-status-zone kanban-lost-zone ${isDragOverLostZone ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragPosition({ x: e.clientX, y: e.clientY });
                    setIsDragOverLostZone(true);
                    setIsDragOverDeleteZone(false);
                    setIsDragOverWonZone(false);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setIsDragOverLostZone(false);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverLostZone(false);
                    if (draggedDealId) {
                      const deal = deals.find(d => d.id === draggedDealId);
                      if (deal && deal.status !== 'LOST') {
                        void handleStatusUpdate(draggedDealId, 'LOST');
                      }
                    }
                    setDraggedDealId(null);
                    setDragPosition(null);
                  }}
                >
                  <div className="kanban-status-zone-content">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p className="kanban-status-zone-text">Mark as LOST</p>
                  </div>
                </div>
                  ) : null;
                })()}
              </>
            )}
            <div className="deals-kanban-board" ref={kanbanBoardRef}>
            {!selectedPipelineId ? (
              <div className="kanban-empty-state">
                <p>Please select a pipeline to view deals</p>
              </div>
            ) : pipelineStages.length === 0 ? (
              <div className="kanban-empty-state">
                <p>No stages found in the selected pipeline</p>
              </div>
            ) : (
              <>
                {pipelineStages.map((stage) => {
                  const stageDeals = dealsByStage.get(stage.id) || [];
                  const totals = stageTotals.get(stage.id) || { total: 0, count: 0 };
                  const isDiversionStage = stage.name?.toLowerCase() === 'diversion';
                  return (
                    <div key={stage.id} className={`kanban-column ${isDiversionStage ? 'diversion-stage' : ''}`}>
                      <div className="kanban-column-header">
                        <h3 className="kanban-column-title">{stage.name}</h3>
                        <div className="kanban-column-summary">
                          {formatCurrency(totals.total)} • {totals.count} deals
                        </div>
                      </div>
                      <div 
                        className="kanban-column-content"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (draggedDealId) {
                            setDragPosition({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const dealId = e.dataTransfer.getData('text/plain');
                          if (dealId && draggedDealId) {
                            const deal = deals.find(d => d.id === Number(dealId));
                            if (deal && deal.stageId !== stage.id) {
                              void handleStageUpdate(Number(dealId), stage.id);
                            }
                          }
                          setDraggedDealId(null);
                          setIsDragOverDeleteZone(false);
                          setIsDragOverWonZone(false);
                          setIsDragOverLostZone(false);
                        }}
                      >
                        {stageDeals.length === 0 ? (
                          <div className="kanban-empty">No deals</div>
                        ) : (
                          stageDeals.map((deal) => {
                            const personName = deal.personId
                              ? personsById.get(deal.personId)?.name ?? `Person ${deal.personId}`
                              : null;
                            const organizationName = deal.organizationId
                              ? organizationsById.get(deal.organizationId)?.name ?? `Organization ${deal.organizationId}`
                              : null;
                            const rspLabel = organizationName && personName ? `${organizationName}, ${personName}` : organizationName || personName;
                            return (
                <div
                  key={deal.id}
                                className={`kanban-card ${selectedDeal?.id === deal.id ? 'selected' : ''} ${openDropdownDealId === deal.id ? 'dropdown-open' : ''} ${draggedDealId === deal.id ? 'dragging' : ''} ${deal.status === 'WON' ? 'status-won' : ''} ${deal.status === 'LOST' ? 'status-lost' : ''}`}
                                draggable
                                onDragStart={(e) => {
                                  setDraggedDealId(deal.id);
                                  setDragPosition({ x: e.clientX, y: e.clientY });
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', deal.id.toString());
                                  // Add a slight delay to allow drag image to be set
                                  setTimeout(() => {
                                    if (e.dataTransfer) {
                                      e.dataTransfer.effectAllowed = 'move';
                                    }
                                  }, 0);
                                }}
                                onDrag={(e) => {
                                  setDragPosition({ x: e.clientX, y: e.clientY });
                                }}
                                onDragEnd={() => {
                                  setDraggedDealId(null);
                                  setDragPosition(null);
                                  setIsDragOverDeleteZone(false);
                                  setIsDragOverWonZone(false);
                                  setIsDragOverLostZone(false);
                                }}
                                onClick={(e) => {
                                  // Don't navigate if clicking on the action button or dropdown
                                  if ((e.target as HTMLElement).closest('.kanban-card-action-btn, .kanban-card-dropdown')) {
                                    return;
                                  }
                                  navigate(`/deals/${deal.id}`);
                                }}
                              >
                                <div className="kanban-card-header">
                                  <div className="kanban-card-content">
                                    <div className="kanban-card-name">{deal.name || `Deal #${deal.id}`}</div>
                                    <div className="kanban-card-status-row">
                                      {rspLabel && (
                                        <div 
                                          className="kanban-card-rsp"
                                          onMouseEnter={(e: MouseEvent<HTMLDivElement>) => {
                                            if (organizationName || personName) {
                                              setHoveredDealId(deal.id);
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              // Position tooltip above the RSP section, centered horizontally
                                              setTooltipPosition({
                                                top: rect.top,
                                                left: rect.left + rect.width / 2,
                                                organizationName,
                                                personName,
                                              });
                                            }
                                          }}
                                          onMouseLeave={() => {
                                            setHoveredDealId(null);
                                            setTooltipPosition(null);
                                          }}
                                        >
                                          {rspLabel}
                                        </div>
                                      )}
                                      {(deal.status === 'WON' || deal.status === 'LOST') && (
                                        <span className={`kanban-card-status-badge status-${deal.status.toLowerCase()}`}>
                                          {deal.status}
                                        </span>
                                      )}
                                    </div>
                                    {deal.createdAt && (
                                      <div className="kanban-card-date">
                                        {formatDateTime(deal.createdAt)}
                                      </div>
                                    )}
                                    <div className="kanban-card-value">{formatCurrency(deal.value || 0)}</div>
                  </div>
                                  <button
                                    className={`kanban-card-action-btn ${shouldShowWarningIcon(deal.id) ? 'has-warning-icon' : ''} ${hasOverdueActivities(deal.id) ? 'has-overdue-activities' : hasTodayActivities(deal.id) ? 'has-today-activities' : ''}`}
                                    title=""
                                    onMouseEnter={(e) => {
                                      if (shouldShowWarningIcon(deal.id) || hasOverdueActivities(deal.id) || hasTodayActivities(deal.id) || hasFutureActivities(deal.id)) {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setHoveredButtonDealId(deal.id);
                                        setButtonTooltipPosition({
                                          top: rect.top - 35,
                                          left: rect.left + rect.width / 2,
                                        });
                                      }
                                    }}
                                    onMouseLeave={() => {
                                      setHoveredButtonDealId(null);
                                      setButtonTooltipPosition(null);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (openDropdownDealId === deal.id) {
                                        setOpenDropdownDealId(null);
                                        setDropdownPosition(null);
                                      } else {
                                        const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        const dropdownWidth = 200;
                                        const dropdownHeight = 100;
                                        const viewportMargin = 8;
                                        
                                        let left = buttonRect.right + 8;
                                        let top = buttonRect.top;
                                        
                                        // Adjust if dropdown would go off right edge
                                        if (left + dropdownWidth > window.innerWidth - viewportMargin) {
                                          left = buttonRect.left - dropdownWidth - 8;
                                        }
                                        
                                        // Adjust if dropdown would go off bottom edge
                                        if (top + dropdownHeight > window.innerHeight - viewportMargin) {
                                          top = window.innerHeight - dropdownHeight - viewportMargin;
                                        }
                                        
                                        // Ensure dropdown doesn't go off top
                                        if (top < viewportMargin) {
                                          top = viewportMargin;
                                        }
                                        
                                        setDropdownPosition({
                                          top,
                                          left,
                                        });
                                        setOpenDropdownDealId(deal.id);
                                      }
                                    }}
                                    aria-label="Deal actions"
                                  >
                                    {shouldShowWarningIcon(deal.id) ? (
                                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                                        <circle cx="10" cy="10" r="9" fill="#FEF3C7" stroke="#FCD34D" strokeWidth="1.5"/>
                                        <text x="10" y="14" textAnchor="middle" fill="#F59E0B" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif">!</text>
                                      </svg>
                                    ) : hasOverdueActivities(deal.id) ? (
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    ) : (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    )}
                                  </button>
                                </div>
                      </div>
                            );
                          })
                        )}
                  </div>
                      </div>
                  );
                })}
                {/* Unassigned deals column */}
                {(() => {
                  const unassignedDeals = dealsByStage.get('unassigned') || [];
                  const unassignedTotals = stageTotals.get('unassigned') || { total: 0, count: 0 };
                  if (unassignedDeals.length > 0) {
                    return (
                      <div className="kanban-column">
                        <div className="kanban-column-header">
                          <h3 className="kanban-column-title">Unassigned</h3>
                          <div className="kanban-column-summary">
                            {formatCurrency(unassignedTotals.total)} • {unassignedTotals.count} deals
                      </div>
                      </div>
                        <div 
                          className="kanban-column-content"
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (draggedDealId) {
                              setDragPosition({ x: e.clientX, y: e.clientY });
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const dealId = e.dataTransfer.getData('text/plain');
                            if (dealId && draggedDealId) {
                              // For unassigned, we need to set stageId to null or handle differently
                              // This depends on your backend API - you may need to handle this case
                              const deal = deals.find(d => d.id === Number(dealId));
                              if (deal && deal.stageId) {
                                // If your API supports removing stage assignment, call that here
                                // For now, we'll just clear the drag state
                              }
                            }
                            setDraggedDealId(null);
                            setIsDragOverDeleteZone(false);
                            setIsDragOverWonZone(false);
                            setIsDragOverLostZone(false);
                          }}
                        >
                          {unassignedDeals.map((deal) => {
                            const personName = deal.personId
                              ? personsById.get(deal.personId)?.name ?? `Person ${deal.personId}`
                              : null;
                            const organizationName = deal.organizationId
                              ? organizationsById.get(deal.organizationId)?.name ?? `Organization ${deal.organizationId}`
                              : null;
                            const rspLabel = organizationName && personName ? `${organizationName}, ${personName}` : organizationName || personName;
                            return (
                              <div
                                key={deal.id}
                                className={`kanban-card ${selectedDeal?.id === deal.id ? 'selected' : ''} ${openDropdownDealId === deal.id ? 'dropdown-open' : ''} ${draggedDealId === deal.id ? 'dragging' : ''} ${deal.status === 'WON' ? 'status-won' : ''} ${deal.status === 'LOST' ? 'status-lost' : ''}`}
                                draggable
                                onDragStart={(e) => {
                                  setDraggedDealId(deal.id);
                                  setDragPosition({ x: e.clientX, y: e.clientY });
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', deal.id.toString());
                                  setTimeout(() => {
                                    if (e.dataTransfer) {
                                      e.dataTransfer.effectAllowed = 'move';
                                    }
                                  }, 0);
                                }}
                                onDrag={(e) => {
                                  setDragPosition({ x: e.clientX, y: e.clientY });
                                }}
                                onDragEnd={() => {
                                  setDraggedDealId(null);
                                  setDragPosition(null);
                                  setIsDragOverDeleteZone(false);
                                  setIsDragOverWonZone(false);
                                  setIsDragOverLostZone(false);
                                }}
                                onClick={(e) => {
                                  // Don't navigate if clicking on the action button or dropdown
                                  if ((e.target as HTMLElement).closest('.kanban-card-action-btn, .kanban-card-dropdown')) {
                                    return;
                                  }
                                  navigate(`/deals/${deal.id}`);
                                }}
                              >
                                <div className="kanban-card-header">
                                  <div className="kanban-card-content">
                                    <div className="kanban-card-name">{deal.name || `Deal #${deal.id}`}</div>
                                    <div className="kanban-card-status-row">
                                      {rspLabel && (
                                        <div 
                                          className="kanban-card-rsp"
                                          onMouseEnter={(e: MouseEvent<HTMLDivElement>) => {
                                            if (organizationName || personName) {
                                              setHoveredDealId(deal.id);
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              // Position tooltip above the RSP section, centered horizontally
                                              setTooltipPosition({
                                                top: rect.top,
                                                left: rect.left + rect.width / 2,
                                                organizationName,
                                                personName,
                                              });
                                            }
                                          }}
                                          onMouseLeave={() => {
                                            setHoveredDealId(null);
                                            setTooltipPosition(null);
                                          }}
                                        >
                                          {rspLabel}
                                        </div>
                                      )}
                                      {(deal.status === 'WON' || deal.status === 'LOST') && (
                                        <span className={`kanban-card-status-badge status-${deal.status.toLowerCase()}`}>
                                          {deal.status}
                                        </span>
                                      )}
                                    </div>
                                    {deal.createdAt && (
                                      <div className="kanban-card-date">
                                        {formatDateTime(deal.createdAt)}
                                      </div>
                                    )}
                                    <div className="kanban-card-value">{formatCurrency(deal.value || 0)}</div>
                  </div>
                                  <button
                                    className={`kanban-card-action-btn ${shouldShowWarningIcon(deal.id) ? 'has-warning-icon' : ''} ${hasOverdueActivities(deal.id) ? 'has-overdue-activities' : hasTodayActivities(deal.id) ? 'has-today-activities' : ''}`}
                                    title=""
                                    onMouseEnter={(e) => {
                                      if (shouldShowWarningIcon(deal.id) || hasOverdueActivities(deal.id) || hasTodayActivities(deal.id) || hasFutureActivities(deal.id)) {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setHoveredButtonDealId(deal.id);
                                        setButtonTooltipPosition({
                                          top: rect.top - 35,
                                          left: rect.left + rect.width / 2,
                                        });
                                      }
                                    }}
                                    onMouseLeave={() => {
                                      setHoveredButtonDealId(null);
                                      setButtonTooltipPosition(null);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const buttonRect = e.currentTarget.getBoundingClientRect();
                                      if (openDropdownDealId === deal.id) {
                                        setOpenDropdownDealId(null);
                                        setDropdownPosition(null);
                                      } else {
                                        setOpenDropdownDealId(deal.id);
                                        // Position dropdown to the RIGHT of the deal card button
                                        const dropdownWidth = 200;
                                        const dropdownHeight = 104; // 2 items @ 48px each + 8px padding
                                        const margin = 8; // Space between button and dropdown
                                        const viewportMargin = 16;
                                        
                                        // ALWAYS position to the right of the button first
                                        let left = buttonRect.right + margin;
                                        let top = buttonRect.top;
                                        
                                        // Only move to left if absolutely necessary (would go off right edge)
                                        const wouldGoOffRight = left + dropdownWidth > window.innerWidth - viewportMargin;
                                        const wouldGoOffLeft = buttonRect.left - dropdownWidth - margin < viewportMargin;
                                        
                                        // If it would go off right AND there's space on the left, move to left
                                        if (wouldGoOffRight && !wouldGoOffLeft) {
                                          left = buttonRect.left - dropdownWidth - margin;
                                        }
                                        // If it would go off right AND left, keep it on right but adjust
                                        else if (wouldGoOffRight && wouldGoOffLeft) {
                                          left = window.innerWidth - dropdownWidth - viewportMargin;
                                        }
                                        
                                        // Ensure dropdown doesn't go off bottom
                                        if (top + dropdownHeight > window.innerHeight - viewportMargin) {
                                          top = window.innerHeight - dropdownHeight - viewportMargin;
                                        }
                                        
                                        // Ensure dropdown doesn't go off top
                                        if (top < viewportMargin) {
                                          top = viewportMargin;
                                        }
                                        
                                        setDropdownPosition({
                                          top,
                                          left,
                                        });
                                        setOpenDropdownDealId(deal.id);
                                      }
                                    }}
                                    aria-label="Deal actions"
                                  >
                                    {shouldShowWarningIcon(deal.id) ? (
                                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                                        <circle cx="10" cy="10" r="9" fill="#FEF3C7" stroke="#FCD34D" strokeWidth="1.5"/>
                                        <text x="10" y="14" textAnchor="middle" fill="#F59E0B" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif">!</text>
                                      </svg>
                                    ) : hasOverdueActivities(deal.id) ? (
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    ) : (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </>
                  )}
            </div>
          </>
        ) : null}

        {viewMode === 'list' && (
          <div className="sheet-view">
            <table className="deals-sheet-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="deals-sheet-select-all"
                      checked={allFilteredSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          selectAllFiltered();
                        } else {
                          clearSelection();
                        }
                      }}
                      aria-label="Select all deals"
                    />
                  </th>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Client</th>
                  <th>Organization</th>
                  <th>Category</th>
                  <th>Venue</th>
                  <th>Event Date</th>
                  <th>Event Type</th>
                  <th>Phone</th>
                  <th>Created</th>
                  <th>Calendar</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredDeals.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="deals-empty-cell">
                      No deals found
                    </td>
                  </tr>
                ) : (
                  filteredDeals.map((deal) => {
                    const isSelected = selectedDealIds.has(deal.id);
                    const orgName = deal.organizationId
                      ? organizationsById.get(deal.organizationId)?.name ?? `Organization ${deal.organizationId}`
                      : '—';
                    const orgCalendarEmail = deal.organizationId
                      ? organizationsById.get(deal.organizationId)?.googleCalendarId ?? null
                      : null;
                    const isCalendarSynced = Boolean(deal.googleCalendarEventId);
                    const personName = deal.personId
                      ? personsById.get(deal.personId)?.name ?? `Person ${deal.personId}`
                      : '—';
                    const categoryLabel =
                      deal.categoryId != null
                        ? categoryLabelById.get(String(deal.categoryId)) ??
                          `Category ${deal.categoryId}`
                        : '—';
                    return (
                      <tr key={deal.id}>
                        <td>
                          <input
                            type="checkbox"
                            className="deals-sheet-checkbox"
                            checked={isSelected}
                            onChange={(event) => toggleDealSelection(deal.id, event.target.checked)}
                            aria-label={`Select ${deal.name || `Deal ${deal.id}`}`}
                          />
                        </td>
                        <td>{deal.name || `Deal #${deal.id}`}</td>
                        <td>{formatCurrency(deal.value)}</td>
                        <td>{deal.status}</td>
                        <td>{personName}</td>
                        <td>{orgName}</td>
                        <td>{categoryLabel}</td>
                        <td>{deal.venue || '—'}</td>
                        <td>{formatDate(deal.eventDate)}</td>
                        <td>{deal.eventType || '—'}</td>
                        <td>{deal.phoneNumber || '—'}</td>
                        <td>{formatDate(deal.createdAt)}</td>
                      <td>
                        {orgCalendarEmail || isCalendarSynced ? (
                          <span className={`calendar-sync-pill ${isCalendarSynced ? 'active' : ''}`}>
                            {isCalendarSynced ? 'Synced' : 'Enabled'}
                          </span>
                        ) : (
                          <span className="calendar-sync-pill muted">Off</span>
                        )}
                      </td>
                        <td>
                          <button
                            className="deals-table-delete"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteDeal(deal);
                            }}
                            disabled={deleteLoadingId === deal.id || bulkDeleteLoading}
                          >
                            {deleteLoadingId === deal.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedDeal && viewMode === 'pipeline' && (
          <div className="deal-detail-panel">
            <div className="deal-detail-header">
              <h3 className="deal-detail-title">Deal Details</h3>
              <div className="deal-detail-actions">
                {detailError && <div className="deal-detail-error">{detailError}</div>}
                <button
                  className="deal-detail-delete"
                  onClick={() => {
                    if (selectedDeal) {
                      void handleDeleteDeal(selectedDeal);
                    }
                  }}
                  disabled={deleteLoadingId === selectedDeal.id}
                >
                  {deleteLoadingId === selectedDeal.id ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  className="deal-detail-close"
                  onClick={() => {
                    setSelectedDeal(null);
                    setDetailError(null);
                  }}
                >
                ×
              </button>
              </div>
            </div>

            <div className="deal-detail-content">
              <div className="deal-detail-section">
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Name:</span>
                  <span className="deal-detail-value">{selectedDeal.name || `Deal #${selectedDeal.id}`}</span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Value:</span>
                  <span className="deal-detail-value">{formatCurrency(selectedDeal.value)}</span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Status:</span>
                  <span className={`deal-detail-status-badge status-${selectedDeal.status.toLowerCase()}`}>
                    {selectedDeal.status === 'IN_PROGRESS' ? 'Open deals' : selectedDeal.status}
                  </span>
                </div>
                <div className="deal-detail-status-actions">
                  {selectedDeal.status === 'IN_PROGRESS' && (
                    <>
                      <button
                        className="deal-detail-status-btn deal-detail-status-btn-won"
                        onClick={() => handleStatusUpdate(selectedDeal.id, 'WON')}
                        disabled={isLoadingAction(selectedDeal.id, 'status')}
                      >
                        Mark as WON
                      </button>
                      <button
                        className="deal-detail-status-btn deal-detail-status-btn-lost"
                        onClick={() => handleStatusUpdate(selectedDeal.id, 'LOST')}
                        disabled={isLoadingAction(selectedDeal.id, 'status')}
                      >
                        Mark as LOST
                      </button>
                    </>
                  )}
                  {(selectedDeal.status === 'WON' || selectedDeal.status === 'LOST') && (
                    <button
                      className="deal-detail-status-btn deal-detail-status-btn-reopen"
                      onClick={() => handleStatusUpdate(selectedDeal.id, 'IN_PROGRESS')}
                      disabled={isLoadingAction(selectedDeal.id, 'status')}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>

              <div className="deal-detail-section">
                <h4 className="deal-detail-section-title">Associations</h4>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Client:</span>
                  <span className="deal-detail-value">
                    {selectedDeal.personId
                      ? personsById.get(selectedDeal.personId)?.name ?? `Person ${selectedDeal.personId}`
                      : '—'}
                  </span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Organization:</span>
                  <span className="deal-detail-value">
                    {selectedDeal.organizationId
                      ? organizationsById.get(selectedDeal.organizationId)?.name ??
                        `Organization ${selectedDeal.organizationId}`
                      : '—'}
                  </span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Pipeline:</span>
                  <span className="deal-detail-value">
                    {selectedDealPipeline ? selectedDealPipeline.name : '—'}
                  </span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Stage:</span>
                  {selectedDealPipeline ? (
                    <select
                      className="deal-detail-select"
                      value={selectedDeal.stageId ?? ''}
                      onChange={(event) =>
                        handleStageUpdate(selectedDeal.id, Number(event.target.value))
                      }
                      disabled={isLoadingAction(selectedDeal.id, 'stage')}
                    >
                      <option value="" disabled>
                        Select stage
                      </option>
                      {selectedDealStages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="deal-detail-value">—</span>
                  )}
                </div>
              </div>

              <div className="deal-detail-section">
                <h4 className="deal-detail-section-title">Event Information</h4>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Venue:</span>
                  <span className="deal-detail-value">{selectedDeal.venue || '—'}</span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Event Date:</span>
                  <span className="deal-detail-value">{formatDate(selectedDeal.eventDate)}</span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Event Type:</span>
                  <span className="deal-detail-value">{selectedDeal.eventType || '—'}</span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Calendar:</span>
                  <span className="deal-detail-value">
                    {selectedDeal.googleCalendarEventId ? (
                      <>
                        Synced{' '}
                        <span className="calendar-sync-meta">
                          {selectedDeal.googleCalendarEventId}
                        </span>
                      </>
                    ) : selectedDealCalendarEmail ? (
                      `Enabled via ${selectedDealCalendarEmail}`
                    ) : (
                      'Off'
                    )}
                  </span>
                </div>
              </div>

              <div className="deal-detail-section">
                <h4 className="deal-detail-section-title">Additional Information</h4>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Phone:</span>
                  <span className="deal-detail-value">{selectedDeal.phoneNumber || '—'}</span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Commission:</span>
                  <span className="deal-detail-value">
                    {selectedDeal.commissionAmount != null
                      ? formatCurrency(selectedDeal.commissionAmount)
                      : '—'}
                  </span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Created:</span>
                  <span className="deal-detail-value">{formatDate(selectedDeal.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Deal</h3>
              <button className="modal-close" onClick={handleCloseModal} disabled={isSubmitting}>
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Deal Name *</label>
                <input
                  type="text"
                  name="name"
                  className="form-input"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Deal Value</label>
                  <input
                    type="number"
                    name="value"
                    className="form-input"
                    value={formData.value}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Status *</label>
                  <select
                    name="status"
                    className="form-input"
                    value={formData.status}
                    onChange={handleInputChange}
                    required
                    disabled={isSubmitting}
                  >
                    <option value="IN_PROGRESS">Open deals</option>
                    <option value="WON">Won</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Contact Person <span style={{ color: '#ef4444' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={personInputRef}
                      type="text"
                      name="personName"
                      className="form-input"
                      value={formData.personName}
                      onChange={handleInputChange}
                      onFocus={() => {
                        if (formData.personName && filteredPersons.length > 0) {
                          setShowPersonSuggestions(true);
                        }
                      }}
                      required
                      disabled={isSubmitting}
                      placeholder="Enter contact person name"
                    />
                    {showPersonSuggestions && formData.personName.trim().length > 0 && (
                      <div
                        ref={personSuggestionsRef}
                        className="form-person-suggestions"
                      >
                        {filteredPersons.length > 0 && (
                          <>
                            {filteredPersons.slice(0, 10).map((person) => (
                              <div
                                key={person.id}
                                className="form-person-suggestion-item"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, personName: person.name, personId: String(person.id) }));
                                  setShowPersonSuggestions(false);
                                }}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ fontWeight: 500 }}>{person.name}</span>
                                  {(person.phone || person.instagramId || person.email) && (
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                                      {[person.phone, person.instagramId, person.email].filter(Boolean).join(' • ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                            {filteredPersons.length > 10 && (
                              <div className="form-person-suggestion-item" style={{ color: '#64748b', fontStyle: 'italic', cursor: 'default' }}>
                                +{filteredPersons.length - 10} more...
                              </div>
                            )}
                          </>
                        )}
                        {/* Show "Create new person" option if entered value doesn't exactly match any person's name */}
                        {(() => {
                          const enteredValue = formData.personName.trim().toLowerCase();
                          const exactNameMatch = persons.some(p => p.name.toLowerCase().trim() === enteredValue);
                          // Show "Create new person" if no exact name match
                          if (!exactNameMatch && enteredValue.length > 0) {
                            return (
                              <div
                                className="form-person-suggestion-item"
                                style={{
                                  borderTop: filteredPersons.length > 0 ? '1px solid #e5e7eb' : 'none',
                                  paddingTop: filteredPersons.length > 0 ? '8px' : '0',
                                  marginTop: filteredPersons.length > 0 ? '4px' : '0',
                                  color: '#2563eb',
                                  fontWeight: 500,
                                  cursor: 'pointer'
                                }}
                                onClick={() => {
                                  setNewPersonName(formData.personName.trim());
                                  setIsAddPersonModalOpen(true);
                                  setShowPersonSuggestions(false);
                                }}
                              >
                                + Create new person: &quot;{formData.personName.trim()}&quot;
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Organization</label>
                  <select
                    name="organizationId"
                    className="form-input"
                    value={formData.organizationId}
                    onChange={handleInputChange}
                    disabled={isSubmitting}
                  >
                    <option value="">Select Organization</option>
                    {allOrganizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                        {org.googleCalendarId ? ' • Calendar' : ''}
                      </option>
                    ))}
                  </select>
                  <div className={`calendar-sync-hint ${hasCalendarSyncForForm ? 'active' : ''}`}>
                    {selectedOrganizationForForm ? (
                      hasCalendarSyncForForm ? (
                        <>
                          Calendar sync on — events will post to{' '}
                          <strong>{selectedOrgCalendarEmail}</strong>.
                        </>
                      ) : (
                        'This organization lacks a calendar email, so events stay inside the CRM.'
                      )
                    ) : (
                      'Select an organization to see whether calendar sync is enabled.'
                    )}
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Pipeline</label>
                  <select
                    name="pipelineId"
                    className="form-input"
                    value={formData.pipelineId}
                    onChange={handleInputChange}
                    disabled={isSubmitting || loadingAvailablePipelines}
                  >
                    {loadingAvailablePipelines ? (
                      <option value="" disabled>
                        Loading pipelines...
                      </option>
                    ) : allPipelines.length === 0 && formData.label === 'DIVERT' && formData.referencedDealId ? (
                      <option value="" disabled>
                        No available pipelines (deal already diverted to all pipelines)
                      </option>
                    ) : (
                      <>
                        <option value="">Select Pipeline</option>
                        {allPipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Stage</label>
                  <select
                    name="stageId"
                    className="form-input"
                    value={formData.stageId}
                    onChange={handleInputChange}
                    disabled={isSubmitting || !formData.pipelineId}
                    title={!formData.pipelineId ? 'Please select a pipeline first' : ''}
                  >
                    <option value="">
                      {!formData.pipelineId ? 'Select Pipeline First' : 'Select Stage'}
                    </option>
                    {stageOptionsForForm.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                  {!formData.pipelineId && (
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#ef4444', 
                      marginTop: '4px',
                      fontStyle: 'italic'
                    }}>
                      Please select a pipeline first
                    </div>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    name="categoryId"
                    className="form-input"
                    value={formData.categoryId}
                    onChange={handleInputChange}
                  disabled={isSubmitting || categoryLoading}
                  onFocus={() => {
                    void fetchCategories();
                  }}
                  >
                    <option value="">Select Category</option>
                    {categoryLoading ? (
                      <option value="" disabled>
                        Loading categories...
                      </option>
                  ) : categoryOptions.length === 0 ? (
                      <option value="" disabled>
                        No categories available
                      </option>
                    ) : (
                    categoryOptions.map((cat) => (
                        <option key={cat.id} value={String(cat.id)}>
                          {cat.label}
                        </option>
                      ))
                    )}
                  </select>
                  {categoryError && <span className="form-hint error">{categoryError}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Label</label>
                  <select
                    name="label"
                    className="form-input"
                    value={formData.label}
                    onChange={handleInputChange}
                    disabled={isSubmitting}
                  >
                    <option value="">Select Label</option>
                    <option value="DIRECT">DIRECT</option>
                    <option value="DIVERT">DIVERT</option>
                    <option value="DESTINATION">DESTINATION</option>
                    <option value="PARTY MAKEUP">PARTY MAKEUP</option>
                    <option value="PRE WEDDING">PRE WEDDING</option>
                  </select>
                </div>
              </div>

              {formData.label === 'DIVERT' && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Referenced Deal ID *</label>
                    <input
                      type="number"
                      name="referencedDealId"
                      className="form-input"
                      value={formData.referencedDealId}
                      onChange={handleInputChange}
                      disabled={isSubmitting}
                      placeholder="Enter the original deal ID"
                    />
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#64748b', 
                      marginTop: '4px',
                      fontStyle: 'italic'
                    }}>
                      Required when creating a diverted deal
                    </div>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Deal Source <span style={{ color: '#ef4444' }}>*</span></label>
                  <select
                    name="source"
                    className="form-input"
                    value={formData.source}
                    onChange={handleInputChange}
                    required
                    disabled={isSubmitting}
                  >
                    <option value="">Select Source</option>
                    {DEAL_SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {formData.source === 'Direct' && (
                  <div className="form-group">
                    <label className="form-label">Sub-Source <span style={{ color: '#ef4444' }}>*</span></label>
                    <select
                      name="subSource"
                      className="form-input"
                      value={formData.subSource}
                      onChange={handleInputChange}
                      required={formData.source === 'Direct'}
                      disabled={isSubmitting}
                    >
                      <option value="">Select Sub-Source</option>
                      {DEAL_SUB_SOURCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Venue</label>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={venueInputRef}
                    type="text"
                    name="venue"
                    className="form-input"
                    value={formData.venue}
                    onChange={handleVenueInputChange}
                    onFocus={() => {
                      if (formData.venue && venueSuggestions.length > 0) {
                        setShowVenueSuggestions(true);
                      }
                    }}
                    disabled={isSubmitting}
                    placeholder="Search for a venue..."
                    autoComplete="off"
                    id="venue-autocomplete-input"
                  />
                  {showVenueSuggestions && venueSuggestions.length > 0 && (
                    <div
                      ref={venueSuggestionsRef}
                      className="form-venue-suggestions"
                    >
                      {venueSuggestions.map((suggestion, index) => (
                        <div
                          key={index}
                          className="form-venue-suggestion-item"
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              venue: suggestion.formatted || suggestion.name,
                            }));
                            setShowVenueSuggestions(false);
                          }}
                        >
                          {suggestion.formatted || suggestion.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ width: '100%' }}>
                  <label className="form-label">Event Dates</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {((formData.eventDates && formData.eventDates.length > 0) ? formData.eventDates : ['']).map((date, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="date"
                          className="form-input"
                          value={date || ''}
                          onChange={(e) => {
                            const newDates = [...(formData.eventDates || [])];
                            newDates[index] = e.target.value;
                            setFormData((prev) => ({ ...prev, eventDates: newDates }));
                          }}
                          disabled={isSubmitting}
                          style={{ cursor: 'pointer', flex: 1 }}
                          onClick={(e) => {
                            if (!isSubmitting) {
                              (e.target as HTMLInputElement).showPicker?.();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newDates = [...(formData.eventDates || [])];
                            newDates.splice(index, 1);
                            setFormData((prev) => ({ ...prev, eventDates: newDates }));
                          }}
                          disabled={isSubmitting}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            opacity: isSubmitting ? 0.5 : 1
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
                        setFormData((prev) => ({ ...prev, eventDates: newDates }));
                      }}
                      disabled={isSubmitting}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        alignSelf: 'flex-start',
                        opacity: isSubmitting ? 0.5 : 1
                      }}
                    >
                      + Add Date
                    </button>
                  </div>
                  <span className="calendar-sync-hint subtle">
                    Use YYYY-MM-DD format. Google Calendar will create separate events for each date.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Event Type</label>
                  <input
                    type="text"
                    name="eventType"
                    className="form-input"
                    value={formData.eventType}
                    onChange={handleInputChange}
                    placeholder="Wedding photography, Bridal makeup or photography, makeup"
                    disabled={isSubmitting}
                  />
                </div>
              </div>


              {modalError && <div className="modal-error">{modalError}</div>}

              <div className="modal-actions">
                <button type="button" className="modal-btn-cancel" onClick={handleCloseModal} disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="modal-btn-submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating…' : 'Create Deal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Organization/Person Tooltip Portal */}
      {tooltipPosition && (tooltipPosition.organizationName || tooltipPosition.personName) && createPortal(
        <div
          className="kanban-card-rsp-tooltip"
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            zIndex: 10001,
            marginTop: '-8px',
          }}
        >
          {tooltipPosition.organizationName && (
            <div className="kanban-card-rsp-tooltip-item">
              <span className="kanban-card-rsp-tooltip-icon">$</span>
              <span>Linked organization: {tooltipPosition.organizationName}</span>
            </div>
          )}
          {tooltipPosition.personName && (
            <div className="kanban-card-rsp-tooltip-item">
              <span className="kanban-card-rsp-tooltip-icon">$</span>
              <span>Linked person: {tooltipPosition.personName}</span>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Button Tooltip Portal */}
      {hoveredButtonDealId !== null && buttonTooltipPosition && (shouldShowWarningIcon(hoveredButtonDealId) || hasOverdueActivities(hoveredButtonDealId) || hasTodayActivities(hoveredButtonDealId) || hasFutureActivities(hoveredButtonDealId)) && createPortal(
        <div
          className="kanban-card-button-tooltip"
          style={{
            position: 'fixed',
            top: `${buttonTooltipPosition.top}px`,
            left: `${buttonTooltipPosition.left}px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 10001,
          }}
        >
          {shouldShowWarningIcon(hoveredButtonDealId) ? 'no activity is scheduled for this deal' : hasOverdueActivities(hoveredButtonDealId) ? 'View Overdue activity' : hasTodayActivities(hoveredButtonDealId) ? 'View activities scheduled for today' : 'View upcoming activity'}
        </div>,
        document.body
      )}

      {/* Dropdown Portal */}
      {openDropdownDealId !== null && dropdownPosition && createPortal(
        <>
          <div
            className="kanban-dropdown-overlay"
            onClick={() => {
              setOpenDropdownDealId(null);
              setDropdownPosition(null);
            }}
          />
          <div
            ref={dropdownRef}
            className="kanban-card-dropdown"
            style={{
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {openDropdownDealId !== null && (() => {
              const topActivity = getTopScheduledActivity(openDropdownDealId);
              const showWarning = shouldShowWarningIcon(openDropdownDealId);
              
              return (
                <>
                  {showWarning && (
                    <>
                      <div className="kanban-card-dropdown-message">
                        <div className="kanban-card-dropdown-message-text">
                          You have no activities scheduled for this deal
                        </div>
                      </div>
                      <div className="kanban-card-dropdown-divider"></div>
                    </>
                  )}
                  {topActivity && (
                    <>
                      <div 
                        className="kanban-card-dropdown-activity"
                        onClick={(e) => {
                          e.stopPropagation();
                          const activityCategory = normalizeCategoryLabel(topActivity.category);
                          navigate(`/activities?activityId=${topActivity.id}&category=${encodeURIComponent(activityCategory)}`);
                          setOpenDropdownDealId(null);
                          setDropdownPosition(null);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="kanban-card-dropdown-activity-header">
                          <div
                            className="kanban-card-dropdown-activity-checkbox"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const clickPosition = {
                                top: rect.top + window.scrollY,
                                left: rect.left + window.scrollX,
                              };
                              await toggleDone(topActivity, !topActivity.done, clickPosition);
                              // Keep dropdown open after marking as done (unless modal opens)
                            }}
                          >
                            {topActivity.done ? (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="8" cy="8" r="7" fill="#10B981" stroke="#10B981" strokeWidth="1.5"/>
                                <path d="M5 8L7 10L11 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="8" cy="8" r="7" stroke="#9CA3AF" strokeWidth="1.5" fill="none"/>
                              </svg>
                            )}
                          </div>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                            <path d="M3 2V14M3 2L8 5L13 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="currentColor"/>
                          </svg>
                          <div className="kanban-card-dropdown-activity-content">
                            <div className="kanban-card-dropdown-activity-subject">{topActivity.subject}</div>
                            <div className="kanban-card-dropdown-activity-meta">
                              {formatActivityDate(topActivity)} {topActivity.assignedUser ? `· ${topActivity.assignedUser}` : ''}
                            </div>
                          </div>
                          {topActivity.attachmentUrl && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openScreenshotViewer(topActivity);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginLeft: '8px',
                                flexShrink: 0,
                              }}
                              title="View screenshot"
                            >
                              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14.25 3H3.75C2.92157 3 2.25 3.67157 2.25 4.5V13.5C2.25 14.3284 2.92157 15 3.75 15H14.25C15.0784 15 15.75 14.3284 15.75 13.5V4.5C15.75 3.67157 15.0784 3 14.25 3Z" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M6.75 7.5C7.57843 7.5 8.25 6.82843 8.25 6C8.25 5.17157 7.57843 4.5 6.75 4.5C5.92157 4.5 5.25 5.17157 5.25 6C5.25 6.82843 5.92157 7.5 6.75 7.5Z" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M15.75 10.5L12 7.5L3.75 13.5" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="kanban-card-dropdown-divider"></div>
                    </>
                  )}
            <button
              className="kanban-card-dropdown-item"
              onClick={() => {
                const dealId = openDropdownDealId;
                setActivityDealId(dealId);
                setIsActivityModalOpen(true);
                setOpenDropdownDealId(null);
                setDropdownPosition(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2V14M2 8H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              </svg>
              Schedule an Activity
            </button>
                </>
              );
            })()}
            <button
              className="kanban-card-dropdown-item"
              onClick={() => {
                if (openDropdownDealId) {
                  setDivertDealId(openDropdownDealId);
                  setIsDivertModalOpen(true);
                }
                setOpenDropdownDealId(null);
                setDropdownPosition(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 4L10 8L6 12M10 4L14 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Divert the deal
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Activity Modal */}
      <ActivityModal
        isOpen={isActivityModalOpen}
        onClose={() => {
          setIsActivityModalOpen(false);
          setActivityDealId(null);
          setEditingActivity(null);
        }}
        initialActivity={editingActivity}
        userOptions={users}
        dealData={activityDealId ? (() => {
          const deal = deals.find(d => d.id === activityDealId);
          if (!deal) return undefined;
          const person = deal.personId ? persons.find(p => p.id === deal.personId) : null;
          const organization = deal.organizationId ? organizationsById.get(deal.organizationId) : null;
          return {
            dealId: deal.id,
            dealName: deal.name || undefined,
            personId: deal.personId || undefined,
            personName: person?.name || undefined,
            organization: organization?.name || undefined,
            phone: person?.phone || undefined,
            instagramId: person?.instagramId || undefined,
          };
        })() : editingActivity ? (() => {
          const deal = deals.find(d => d.id === editingActivity.dealId);
          if (!deal) return undefined;
          const person = deal.personId ? persons.find(p => p.id === deal.personId) : null;
          const organization = deal.organizationId ? organizationsById.get(deal.organizationId) : null;
          return {
            dealId: deal.id,
            dealName: deal.name || undefined,
            personId: deal.personId || undefined,
            personName: person?.name || undefined,
            organization: organization?.name || undefined,
            phone: person?.phone || undefined,
            instagramId: person?.instagramId || undefined,
          };
        })() : undefined}
        onSave={async (values: ActivityFormValues & { id?: number }) => {
          try {
            const activityData = {
              subject: values.subject || '',
              category: values.category,
              date: values.date,
              startTime: values.startTime,
              endTime: values.endTime,
              priority: values.priority,
              type: values.type,
              assignedUser: values.assignedUser,
              notes: values.notes,
              dealId: activityDealId || editingActivity?.dealId || undefined,
              personId: values.personId,
              dueDate: values.dueDate,
              dateTime: values.dateTime,
            };
            
            if (values.id && editingActivity) {
              // Update existing activity
              await activitiesApi.update(values.id, activityData);
            } else {
              // Create new activity
            await activitiesApi.create(activityData);
            }
            
            // Reload activities to update the warning icon
            await loadActivities();
            // Don't close modal here - let ActivityModal handle it after showing confirmation
            // setIsActivityModalOpen(false);
            // setActivityDealId(null);
            // setEditingActivity(null);
          } catch (err: any) {
            console.error('Failed to save activity:', err);
            throw err;
          }
        }}
      />

      {/* Divert Deal Modal */}
      {markAsLostDealId && (
        <MarkAsLostModal
          isOpen={true}
          onClose={() => setMarkAsLostDealId(null)}
          onConfirm={(lostReason) => handleMarkAsLost(markAsLostDealId, lostReason)}
          dealName={deals.find(d => d.id === markAsLostDealId)?.name}
        />
      )}
      {dealValueModalDealId && (() => {
        const deal = deals.find(d => d.id === dealValueModalDealId);
        return (
          <DealValueModal
            isOpen={true}
            onClose={() => setDealValueModalDealId(null)}
            onConfirm={(dealValue, commissionAmount, source, subSource) => handleDealValueUpdate(dealValueModalDealId, dealValue, commissionAmount, source, subSource)}
            dealName={deal?.name}
            currentValue={deal?.value}
            currentCommission={deal?.commissionAmount}
            dealSource={deal?.source || null}
            dealSubSource={deal?.subSource || null}
          />
        );
      })()}
      {isPipelineModalOpen && (
        <PipelineModal
          isOpen={true}
          mode="create"
          onClose={() => setIsPipelineModalOpen(false)}
          onSubmit={handleCreatePipeline}
          categoryOptions={Array.from(categoryLabelById.values())}
        />
      )}

      {isReorderPipelinesModalOpen && (
        <ReorderPipelinesModal
          isOpen={true}
          pipelines={pipelines}
          onClose={() => setIsReorderPipelinesModalOpen(false)}
          onSuccess={handlePipelinesReordered}
        />
      )}

      {/* Global tooltip for sort direction - rendered via portal */}
      {createPortal(
        <div className="deals-sort-tooltip">
          {sortDirection === 'asc' ? 'Ascending order - Click to sort descending' : 'Descending order - Click to sort ascending'}
        </div>,
        document.body
      )}

      {/* Date Range Modal */}
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
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
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

      {divertDealId && (
        <DivertDealModal
          isOpen={isDivertModalOpen}
          onClose={() => {
            setIsDivertModalOpen(false);
            setDivertDealId(null);
          }}
          dealId={divertDealId}
          currentPipelineId={selectedPipelineId}
          onSuccess={() => {
            // Reload deals after successful diversion
            void loadDeals();
          }}
        />
      )}

      {/* Add Person Modal */}
      {isAddPersonModalOpen && (
        <AddPersonModal
          isOpen={isAddPersonModalOpen}
          initialName={newPersonName}
          onClose={() => {
            setIsAddPersonModalOpen(false);
            setNewPersonName('');
          }}
          onSuccess={async () => {
            // Reload persons list to include the new person
            try {
              const personsPage = await personsApi.list({ page: 0, size: 200, sort: 'name,asc' });
              setPersons(personsPage.content ?? []);
              // Find the newly created person by name
              const newPerson = personsPage.content?.find(p => p.name === newPersonName);
              if (newPerson) {
                // Update the personName in formData with the created person's name and ID
                setFormData(prev => ({ ...prev, personName: newPerson.name, personId: String(newPerson.id) }));
              }
              setIsAddPersonModalOpen(false);
              setNewPersonName('');
            } catch (err: any) {
              console.error('Failed to reload persons:', err);
            }
          }}
          mode="create"
          person={newPersonName ? { name: newPersonName, id: 0, organizationId: null, ownerId: null, createdAt: '', updatedAt: '' } as Person : null}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmDeal && createPortal(
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-deal-title"
          aria-describedby="delete-deal-description"
          className="delete-modal-overlay fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100000] p-5"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            padding: '20px'
          }}
          onClick={(e) => {
            // Only close if clicking directly on the overlay, not on child elements
            // And not immediately after opening
            if (e.target === e.currentTarget && !deleteModalJustOpened.current) {
              setDeleteConfirmDeal(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !deleteModalJustOpened.current) {
              setDeleteConfirmDeal(null);
            }
          }}
        >
          <div 
            ref={deleteModalRef}
            className="delete-modal-content bg-white rounded-xl shadow-[0_20px_25px_-5px_rgba(0,0,0,0.2),0_10px_10px_-5px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)] max-w-[420px] w-full flex flex-col border border-gray-200/50"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              maxWidth: '420px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid rgba(229, 231, 235, 0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !deleteModalJustOpened.current) {
                setDeleteConfirmDeal(null);
              }
            }}
          >
            {/* Header */}
            <div 
              className="px-4 pt-4 pb-3 border-b border-gray-200"
              style={{
                padding: '16px 16px 12px 16px',
                borderBottom: '1px solid #e5e7eb'
              }}
            >
              <div 
                className="flex items-start gap-3"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
              >
                <div 
                  className="w-8 h-8 rounded-md bg-red-100 flex items-center justify-center flex-shrink-0"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    backgroundColor: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <svg 
                    className="w-4 h-4 text-red-600" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                    aria-hidden="true"
                    style={{ width: '16px', height: '16px', color: '#dc2626' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div 
                  className="flex-1 min-w-0"
                  style={{ flex: '1 1 0%', minWidth: 0 }}
                >
                  <h2 
                    id="delete-deal-title"
                    className="text-lg font-bold text-gray-900 mb-0.5"
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: '#111827',
                      marginBottom: '4px',
                      margin: 0,
                      paddingBottom: '4px'
                    }}
                  >
                    Delete Deal
              </h2>
                  <p 
                    className="text-xs text-gray-500"
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      margin: 0
                    }}
                  >
                    This action is permanent
                  </p>
                </div>
              <button 
                  type="button"
                  className="w-7 h-7 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex items-center justify-center transition-colors duration-150 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                onClick={() => setDeleteConfirmDeal(null)}
                  aria-label="Close dialog"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.color = '#4b5563';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#9ca3af';
                  }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" style={{ width: '16px', height: '16px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
              </button>
              </div>
            </div>

            {/* Body */}
            <div 
              className="px-4 py-4 bg-white"
              style={{
                padding: '16px',
                backgroundColor: '#ffffff'
              }}
            >
              <p 
                id="delete-deal-description"
                className="text-sm text-gray-700 mb-4 leading-relaxed"
                style={{
                  fontSize: '14px',
                  color: '#374151',
                  marginBottom: '16px',
                  lineHeight: '1.5',
                  margin: '0 0 16px 0'
                }}
              >
                Are you sure you want to delete{' '}
                <span 
                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold text-xs border border-amber-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                    fontWeight: 600,
                    fontSize: '12px',
                    border: '1px solid #fde68a',
                    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)'
                  }}
                >
                  {deleteConfirmDeal.name?.trim().length 
                    ? `"${deleteConfirmDeal.name.trim()}"` 
                    : `Deal #${deleteConfirmDeal.id}`}
                </span>
              </p>

              {/* Warning Strip */}
              <div 
                className="bg-red-50 border-l-4 border-red-500 rounded-r-md p-3"
                style={{
                  backgroundColor: '#fef2f2',
                  borderLeft: '4px solid #ef4444',
                  borderRadius: '0 6px 6px 0',
                  padding: '12px'
                }}
              >
                <div 
                  className="flex items-start gap-2.5"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                  }}
                >
                  <div 
                    className="flex-shrink-0 mt-0.5"
                    style={{
                      flexShrink: 0,
                      marginTop: '2px'
                    }}
                  >
                    <svg 
                      className="w-4 h-4 text-red-600" 
                      fill="currentColor" 
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                      style={{ width: '16px', height: '16px', color: '#dc2626' }}
                    >
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div 
                    className="flex-1 min-w-0"
                    style={{ flex: '1 1 0%', minWidth: 0 }}
                  >
                    <p 
                      className="text-xs font-bold text-red-900 mb-0.5"
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#991b1b',
                        marginBottom: '4px',
                        margin: '0 0 4px 0'
                      }}
                    >
                      This action cannot be undone.
                    </p>
                    <p 
                      className="text-xs text-red-700 leading-relaxed"
                      style={{
                        fontSize: '12px',
                        color: '#b91c1c',
                        lineHeight: '1.5',
                        margin: 0
                      }}
                    >
                      The deal and all associated data will be permanently removed.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div 
              className="px-4 py-3 border-t border-gray-200 bg-gray-50/50 flex justify-end gap-2"
              style={{
                padding: '12px 16px',
                borderTop: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px'
              }}
            >
              <button
                type="button"
                className="px-3 py-1.5 rounded-md font-semibold text-xs text-gray-700 bg-transparent hover:bg-gray-100 border border-transparent hover:border-gray-300 transition-all duration-150 min-w-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#374151',
                  backgroundColor: '#ffffff',
                  border: '1px solid #d1d5db',
                  minWidth: '80px',
                  cursor: 'pointer',
                  display: 'inline-block',
                  textAlign: 'center'
                }}
                onClick={() => setDeleteConfirmDeal(null)}
                disabled={deleteLoadingId === deleteConfirmDeal.id}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.borderColor = '#9ca3af';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-md font-semibold text-xs text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-sm hover:shadow-md transition-all duration-150 min-w-[80px] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#ffffff',
                  background: 'linear-gradient(to right, #dc2626, #b91c1c)',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                  minWidth: '80px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  border: 'none'
                }}
                onClick={() => {
                  void handleDeleteDeal(deleteConfirmDeal, true);
                  setDeleteConfirmDeal(null);
                }}
                disabled={deleteLoadingId === deleteConfirmDeal.id}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.background = 'linear-gradient(to right, #b91c1c, #991b1b)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.background = 'linear-gradient(to right, #dc2626, #b91c1c)';
                    e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }
                }}
              >
                {deleteLoadingId === deleteConfirmDeal.id ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true" style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }}>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }}></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" style={{ opacity: 0.75 }}></path>
                    </svg>
                    <span>Deleting...</span>
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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

      {/* Success Confirmation Modal */}
      {showSuccessConfirmation && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="success-confirmation-title"
          className="success-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100001,
            padding: '20px'
          }}
          onClick={() => setShowSuccessConfirmation(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowSuccessConfirmation(false);
            }
          }}
        >
          <div
            className="success-modal-content"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              maxWidth: '420px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid rgba(229, 231, 235, 0.5)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowSuccessConfirmation(false);
              }
            }}
          >
            {/* Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                padding: '20px 24px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
                    id="success-confirmation-title"
                    style={{
                      margin: 0,
                      fontSize: '20px',
                      fontWeight: 600,
                      color: '#ffffff',
                      lineHeight: '1.2'
                    }}
                  >
                    Deal Created Successfully!
                  </h2>
                </div>
                <button
                  onClick={() => setShowSuccessConfirmation(false)}
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
                Deal <strong>"{createdDealName}"</strong> has been created successfully!
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
                onClick={() => setShowSuccessConfirmation(false)}
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
    </div>
  );
};

export default Deals;
