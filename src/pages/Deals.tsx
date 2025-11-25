import { useState, useEffect, useMemo, useRef, useCallback, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import './Deals.css';
import { dealsApi, type DealSortField, type SortDirection } from '../services/deals';
import type { Deal, DealStatus, DealSource, DealSubSource } from '../types/deal';
import type { OrganizationCategory } from '../types/organization';
import { organizationsApi } from '../services/organizations';
import type { Organization } from '../types/organization';
import { pipelinesApi } from '../services/pipelines';
import type { Pipeline, Stage } from '../types/pipeline';
import { personsApi } from '../services/api';
import type { Person, PersonOwner } from '../types/person';
import ActivityModal, { type ActivityFormValues } from '../components/ActivityModal';
import { activitiesApi } from '../services/activities';
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
    // Default to current month
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today);
    monthEnd.setHours(23, 59, 59, 999);
    return {
      start: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-${String(monthStart.getDate()).padStart(2, '0')}`,
      end: `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`,
    };
  });
  const [selectedDateRangeOption, setSelectedDateRangeOption] = useState<string>('This month');
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
  const [openDropdownDealId, setOpenDropdownDealId] = useState<number | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityDealId, setActivityDealId] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDivertModalOpen, setIsDivertModalOpen] = useState(false);
  const [divertDealId, setDivertDealId] = useState<number | null>(null);
  const [markAsLostDealId, setMarkAsLostDealId] = useState<number | null>(null);
  const [showPersonSuggestions, setShowPersonSuggestions] = useState(false);
  const [filteredPersons, setFilteredPersons] = useState<Person[]>([]);
  const personInputRef = useRef<HTMLInputElement>(null);
  const personSuggestionsRef = useRef<HTMLDivElement>(null);
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
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load deals.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortDirection]);

  // Initial load
  useEffect(() => {
    loadDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-open modal if coming from Person page
  useEffect(() => {
    const personNameFromState = (location.state as any)?.personName;
    const shouldOpenModal = (location.state as any)?.openModal;
    
    if (shouldOpenModal && personNameFromState) {
      let initialData = { ...initialFormState, personName: personNameFromState };
      
      // Auto-select the first pipeline (or RSP if available) if no pipeline is selected
      if (!initialData.pipelineId && pipelines.length > 0) {
        // Try to find RSP pipeline first
        const rspPipeline = pipelines.find(p => p.name.toLowerCase() === 'rsp');
        if (rspPipeline) {
          initialData.pipelineId = String(rspPipeline.id);
        } else {
          // Otherwise, select the first pipeline
          initialData.pipelineId = String(pipelines[0].id);
        }
      }
      
      setFormData(initialData);
      setIsModalOpen(true);
      // Clear the state after using it
      window.history.replaceState({}, document.title);
    }
  }, [location.state, pipelines]);

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
    if (!deal.pipelineId) return;

    const pipeline = pipelines.find(p => p.id === deal.pipelineId);
    if (!pipeline) return;

    // Get team manager from pipeline
    const teamManagerId = getTeamManagerFromPipeline(pipeline);
    if (!teamManagerId) {
      console.warn(`No team manager found for pipeline ${pipeline.id}`);
      return;
    }

    // Find the team manager user to get their display name for assignedUser
    const teamManager = users.find(u => u.id === teamManagerId);
    if (!teamManager) {
      console.warn(`Team manager user ${teamManagerId} not found`);
      return;
    }

    // Get user display name (first name + last name, fallback to email)
    const getUserDisplayName = (user: User) => {
      const first = (user.firstName || '').trim();
      const last = (user.lastName || '').trim();
      const fullName = [first, last].filter(Boolean).join(' ');
      return fullName || user.email || `User ${user.id}`;
    };
    const assignedUserName = getUserDisplayName(teamManager);

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get person details for the activities
    const person = persons.find(p => p.id === deal.personId);
    const organization = organizations.find(o => o.id === deal.organizationId);

    try {
      // Create "Make the 1st call" activity
      await activitiesApi.create({
        subject: 'Make the 1st call',
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

      // Create "Send the quote" activity
      await activitiesApi.create({
        subject: 'Send the quote',
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

      console.log(`Created activities for deal ${deal.id} in Qualified stage`);
    } catch (err) {
      console.error(`Failed to create activities for deal ${deal.id}:`, err);
    }
  }, [pipelines, teams, persons, organizations, users, getTeamManagerFromPipeline]);

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
      const requiredActivities = ['Make the 1st call', 'Send the quote'];
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
    if (!deals.length || !persons.length || !pipelines.length || loading) return;
    if (processingMovesRef.current) return; // Prevent concurrent executions

    processingMovesRef.current = true;
    let needsReload = false;

    try {
      for (const person of persons) {
        // Only process persons that have a phone number
        if (!person.phone || person.phone.trim().length === 0) continue;

        // Find all deals for this person that are in "Lead In" stage
        const personDeals = deals.filter(deal => deal.personId === person.id);
        
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
                const updatedDeal = await dealsApi.moveToStage(deal.id, { stageId: qualifiedStage.id });
                needsReload = true;
                
                // Create activities for the deal in Qualified stage
                await createQualifiedStageActivities(updatedDeal);
              } catch (err) {
                console.error(`Failed to move deal ${deal.id} to Qualified stage:`, err);
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
  }, [deals, persons, pipelines, loading, loadDeals]);

  // Monitor persons array for changes and trigger deal movement
  useEffect(() => {
    if (!deals.length || !persons.length || !pipelines.length || loading) return;
    
    // Create a hash of person IDs and phone numbers to detect changes
    const personsHash = persons.map(p => `${p.id}:${p.phone || ''}`).join('|');
    
    // Only check if persons have actually changed
    if (personsHash === lastPersonsHashRef.current) return;
    lastPersonsHashRef.current = personsHash;

    // Debounce the check with a shorter delay for faster response
    const timeoutId = setTimeout(() => {
      void checkAndMoveDeals();
    }, 100); // Reduced to 100ms for faster response

    return () => clearTimeout(timeoutId);
  }, [persons, deals, pipelines, loading, checkAndMoveDeals]);

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

  // Helper function to format date as YYYY-MM-DD
  const formatDateYYYYMMDD = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    return deals.filter((deal) => {
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
  }, [deals, filterStatus, filterOrganization, filterCategory, filterManager, searchQuery, persons, dateRange]);


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

    return grouped;
  }, [filteredDeals, selectedPipelineId, pipelineStages]);

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
    
    // Auto-select the first pipeline (or RSP if available) if no pipeline is selected
    if (!initialData.pipelineId && pipelines.length > 0) {
      // Try to find RSP pipeline first
      const rspPipeline = pipelines.find(p => p.name.toLowerCase() === 'rsp');
      if (rspPipeline) {
        initialData.pipelineId = String(rspPipeline.id);
      } else {
        // Otherwise, select the first pipeline
        initialData.pipelineId = String(pipelines[0].id);
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
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]: value,
      };
      
      // If pipeline changes, clear the stageId since stages are pipeline-specific
      if (name === 'pipelineId') {
        newData.stageId = '';
      }
      
      // If source changes, clear subSource if source is not "Direct"
      if (name === 'source') {
        if (value !== 'Direct') {
          newData.subSource = '';
        }
      }
      
      // If personName is being changed, filter persons for autocomplete
      if (name === 'personName') {
        if (value.trim().length > 0) {
          const filtered = persons.filter(p =>
            p.name.toLowerCase().includes(value.toLowerCase())
          );
          setFilteredPersons(filtered);
          setShowPersonSuggestions(filtered.length > 0);
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

    // Try to find person by name if personName is provided, or create a new person
    let personId: number | undefined = undefined;
    let personHasPhone = false;
    if (formData.personName.trim()) {
      const foundPerson = persons.find(
        (p) => p.name.toLowerCase().trim() === formData.personName.toLowerCase().trim()
      );
      if (foundPerson) {
        personId = foundPerson.id;
        // Fetch the latest person data to ensure we have the most up-to-date phone number
        try {
          const latestPerson = await personsApi.get(foundPerson.id);
          personHasPhone = !!(latestPerson.phone && latestPerson.phone.trim().length > 0);
          console.log(`Fetched latest person data for ${foundPerson.name}: phone=${latestPerson.phone}, personHasPhone=${personHasPhone}`);
        } catch (err) {
          // If fetching fails, fall back to cached data
          console.warn('Failed to fetch latest person data, using cached data:', err);
          personHasPhone = !!(foundPerson.phone && foundPerson.phone.trim().length > 0);
          console.log(`Using cached person data for ${foundPerson.name}: phone=${foundPerson.phone}, personHasPhone=${personHasPhone}`);
        }
      } else {
        // Person doesn't exist, create a new one
        try {
          const newPerson = await personsApi.create({
            name: formData.personName.trim(),
          });
          personId = newPerson.id;
          personHasPhone = !!(newPerson.phone && newPerson.phone.trim().length > 0);
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
    if (personId && formData.pipelineId) {
      const selectedPipeline = pipelines.find(p => p.id === Number(formData.pipelineId));
      if (selectedPipeline) {
        // Find stages by name (case-insensitive, flexible matching)
        const leadInStage = selectedPipeline.stages.find(s => {
          const stageName = s.name.toLowerCase().trim();
          return stageName === 'lead in' || stageName === 'leadin' || stageName === 'lead-in';
        });
        const qualifiedStage = selectedPipeline.stages.find(s => {
          const stageName = s.name.toLowerCase().trim();
          return stageName === 'qualified';
        });
        
        // ALWAYS auto-assign stage based on phone number
        // If person has phone, use Qualified stage; otherwise use Lead In stage
        if (personHasPhone && qualifiedStage) {
          stageId = qualifiedStage.id;
          console.log(`Person has phone (${personHasPhone}), setting stage to Qualified (${qualifiedStage.id})`);
        } else if (!personHasPhone && leadInStage) {
          stageId = leadInStage.id;
          console.log(`Person has no phone, setting stage to Lead In (${leadInStage.id})`);
        } else {
          // Fallback: use manually selected stage if available, or first stage
          if (formData.stageId) {
            stageId = Number(formData.stageId);
            console.log(`Using manually selected stage: ${stageId}`);
          } else if (selectedPipeline.stages.length > 0) {
            // Use first stage as fallback
            stageId = selectedPipeline.stages[0].id;
            console.log(`Using first stage as fallback: ${stageId}`);
          }
        }
      }
    } else if (formData.stageId) {
      // If no person or pipeline, use manually selected stage
      stageId = Number(formData.stageId);
    }

    const payload: any = {
      name: formData.name.trim(),
      status: formData.status,
      personId: personId,
      pipelineId: formData.pipelineId ? Number(formData.pipelineId) : undefined,
      stageId: stageId,
      organizationId: organizationId,
      categoryId: resolvedCategory,
      label: formData.label ? formData.label : undefined,
      source: formData.source ? (formData.source as DealSource) : undefined,
      subSource: (formData.source === 'Direct' && formData.subSource) ? (formData.subSource as DealSubSource) : undefined,
      referencedDealId: formData.referencedDealId ? Number(formData.referencedDealId) : undefined,
      eventType: formData.eventType ? formData.eventType : undefined,
      venue: formData.venue ? formData.venue : undefined,
      eventDate: formData.eventDate ? formData.eventDate : undefined,
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
        const message = err?.response?.data?.message || err?.message || 'Failed to delete deal.';
        failures.push({ id, message });
      }
    }
    setBulkDeleteLoading(false);
    if (failures.length > 0) {
      setBulkDeleteError(
        failures.length === ids.length
          ? failures[0]?.message ?? 'Failed to delete selected deals.'
          : `Deleted ${ids.length - failures.length} deals, but ${failures.length} failed.`,
      );
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
      const message = err?.response?.data?.message || err?.message || 'Failed to delete deal.';
      setDetailError(message);
      if (viewMode !== 'pipeline') {
        window.alert(message);
      }
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
                                    className="kanban-card-action-btn"
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
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
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
                                    className="kanban-card-action-btn"
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
                                      }
                                    }}
                                    aria-label="Deal actions"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
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
                  <label className="form-label">Contact Person</label>
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
                      disabled={isSubmitting}
                      placeholder="Enter contact person name"
                    />
                    {showPersonSuggestions && filteredPersons.length > 0 && (
                      <div
                        ref={personSuggestionsRef}
                        className="form-person-suggestions"
                      >
                        {filteredPersons.slice(0, 10).map((person) => (
                          <div
                            key={person.id}
                            className="form-person-suggestion-item"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, personName: person.name }));
                              setShowPersonSuggestions(false);
                            }}
                          >
                            {person.name}
                          </div>
                        ))}
                        {filteredPersons.length > 10 && (
                          <div className="form-person-suggestion-item" style={{ color: '#64748b', fontStyle: 'italic', cursor: 'default' }}>
                            +{filteredPersons.length - 10} more...
                          </div>
                        )}
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
                  <label className="form-label">Deal Source</label>
                  <select
                    name="source"
                    className="form-input"
                    value={formData.source}
                    onChange={handleInputChange}
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
                    <label className="form-label">Sub-Source</label>
                    <select
                      name="subSource"
                      className="form-input"
                      value={formData.subSource}
                      onChange={handleInputChange}
                      disabled={isSubmitting}
                    >
                      <option value="">Select Sub-Source (Optional)</option>
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
                <div className="form-group">
                  <label className="form-label">Event Date</label>
                  <input
                    type="date"
                    name="eventDate"
                    className="form-input"
                    value={formData.eventDate}
                    onChange={handleInputChange}
                    disabled={isSubmitting}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      // Open calendar when clicking anywhere on the input
                      if (!isSubmitting) {
                        (e.target as HTMLInputElement).showPicker?.();
                      }
                    }}
                  />
                  <span className="calendar-sync-hint subtle">
                    Use YYYY-MM-DD so Google Calendar can mirror this deal’s event.
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
        }}
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
        })() : undefined}
        onSave={async (values: ActivityFormValues) => {
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
              dealId: activityDealId || undefined,
              personId: values.personId,
              dueDate: values.dueDate,
              dateTime: values.dateTime,
            };
            await activitiesApi.create(activityData);
            // Don't close modal here - let ActivityModal handle it after showing confirmation
            // setIsActivityModalOpen(false);
            // setActivityDealId(null);
          } catch (err: any) {
            console.error('Failed to create activity:', err);
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
    </div>
  );
};

export default Deals;
