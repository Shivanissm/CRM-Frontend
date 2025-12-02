import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './SetTargetModal.css';
import type { CategoryOption, PeriodType, TargetCategory } from '../types/target';
import type { User } from '../types/user';
import type { Organization } from '../types/organization';
import { usersApi } from '../services/users';
import { organizationsApi } from '../services/organizations';
import { targetsApi } from '../services/targets';
import { pipelinesApi } from '../services/pipelines';
import { teamsApi } from '../services/teams';
import type { Pipeline } from '../types/pipeline';
import type { Team } from '../types/team';

type AssigneeType = 'SALES' | 'PRE_SALES';
type MetricType = 'VALUE' | 'COUNT';
type AmountUnit = 'INR' | 'USD';

interface SetTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  categories: CategoryOption[];
  defaultCategory?: TargetCategory;
  defaultUserId?: number;
  /**
   * Optional default assignee type. When opening the modal from the
   * Pre-Sales tab we pass PRE_SALES so the form is tailored to pre-sales.
   */
  defaultAssigneeType?: AssigneeType;
}

const DEFAULT_PERIOD: PeriodType = 'MONTHLY';

const PERIOD_OPTIONS: { label: string; value: PeriodType }[] = [
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Quarterly', value: 'QUARTERLY' },
  { label: 'Half-yearly', value: 'HALF_YEARLY' },
  { label: 'Yearly', value: 'YEARLY' },
];

const ASSIGNEE_OPTIONS: { label: string; value: AssigneeType }[] = [
  { label: 'Sales', value: 'SALES' },
  { label: 'Pre Sales', value: 'PRE_SALES' },
];

const AMOUNT_UNITS: { label: string; value: AmountUnit }[] = [
  { label: 'INR', value: 'INR' },
  { label: 'USD', value: 'USD' },
];

const normalizeRole = (role?: string | null): string => (role || '').replace(/-/g, '_').toUpperCase();

const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function SetTargetModal({
  isOpen,
  onClose,
  onCreated,
  categories,
  defaultCategory,
  defaultUserId,
  defaultAssigneeType,
}: SetTargetModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<TargetCategory | ''>('');
  const [assigneeType, setAssigneeType] = useState<AssigneeType>('SALES');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [periodType, setPeriodType] = useState<PeriodType>(DEFAULT_PERIOD);
  const [startDate, setStartDate] = useState<string>(() => formatDateInput(new Date()));
  const [endDate, setEndDate] = useState<string>('');
  const [metricType, setMetricType] = useState<MetricType>('COUNT');
  const [amountUnit, setAmountUnit] = useState<AmountUnit>('INR');
  const [amountInput, setAmountInput] = useState<string>('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]); // Store all orgs
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<number[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showOrgDropdown, setShowOrgDropdown] = useState<boolean>(false);
  const [orgSearch, setOrgSearch] = useState<string>('');
  const orgDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    Promise.all([
      usersApi.list().catch(() => []),
      organizationsApi.list().catch(() => []),
      pipelinesApi.list().catch(() => []),
      teamsApi.list().catch(() => []),
    ])
      .then(([usersResponse, orgs, pipelinesResponse, teamsResponse]) => {
        setUsers(usersResponse ?? []);
        setAllOrganizations(orgs ?? []);
        // Don't set organizations here - let the filtering effect handle it
        // This ensures only valid organizations are shown
        setPipelines(pipelinesResponse ?? []);
        setTeams(teamsResponse ?? []);
        if (defaultCategory && categories.some((cat) => cat.code === defaultCategory)) {
          setSelectedCategory(defaultCategory);
        } else if (categories.length > 0) {
          setSelectedCategory((prev) => prev || categories[0].code);
        }
      })
      .catch(() => {
        setError('Failed to load dropdown data. Please try again.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, categories, defaultCategory]);

  // When the modal opens, align the assignee type with the context (Sales / Pre-Sales tab)
  useEffect(() => {
    if (!isOpen) return;
    setAssigneeType(defaultAssigneeType ?? 'SALES');
  }, [isOpen, defaultAssigneeType]);

  // For Pre-Sales, always track targets as COUNT (number of diverted deals)
  useEffect(() => {
    if (assigneeType === 'PRE_SALES') {
      setMetricType('COUNT');
    }
  }, [assigneeType]);

  useEffect(() => {
    if (!isOpen) return;
    setAmountInput('');
    setSelectedOrganizationIds([]);
    setOrgSearch('');
    setShowOrgDropdown(false);
    if (defaultUserId) {
      setSelectedUserId(defaultUserId.toString());
    } else {
      setSelectedUserId('');
    }
  }, [isOpen, defaultUserId]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedOrganizationIds([]);
  }, [isOpen, selectedCategory, assigneeType]);

  // Clear selected organizations when user changes
  useEffect(() => {
    setSelectedOrganizationIds([]);
  }, [selectedUserId]);

  useEffect(() => {
    if (!showOrgDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(event.target as Node)) {
        setShowOrgDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOrgDropdown]);

  // Filter users based on assign type, team membership, and (when possible) pipelines for the selected category
  const filteredUsers = useMemo(() => {
    let userList: User[] = [];

    if (assigneeType === 'PRE_SALES') {
      // Support both "PRE_SALES" and "PRESALES" style role values from backend
      userList = users.filter((user) => {
        const role = normalizeRole(user.role);
        return role === 'PRE_SALES' || role === 'PRESALES';
      });
    } else {
      userList = users.filter((user) => normalizeRole(user.role) === 'SALES');
    }

    // If we have team information, further refine the list; otherwise fall back to role only.
    if (teams.length > 0) {
      if (assigneeType === 'SALES') {
        const managerIds = new Set(
          teams.map((team) => team.manager?.id).filter((id): id is number => id !== undefined && id !== null)
        );
        userList = userList.filter((user) => managerIds.has(user.id));
      } else {
        // Pre Sales: show users who are team members
        const memberIds = new Set(
          teams.flatMap((team) => team.members.map((member) => member.id))
        );
        // If there are no members defined, keep all pre-sales users; otherwise restrict.
        if (memberIds.size > 0) {
          userList = userList.filter((user) => memberIds.has(user.id));
        }
      }
    }

    // Keep a copy of the base list (role + team) so we can fall back if category filter removes everyone
    const baseUserList = [...userList];

    // Further narrow users to only those whose teams have pipelines in the selected category
    if (selectedCategory && pipelines.length && teams.length) {
      const normalizeCategoryForComparison = (cat: string): string =>
        cat
          .toUpperCase()
          .replace(/_/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const selectedCategoryNormalized = normalizeCategoryForComparison(selectedCategory);

      const teamIdsForCategory = new Set(
        pipelines
          .filter((pipeline) => {
            if (!pipeline.category || !pipeline.teamId) return false;
            const pipelineCategoryNormalized = normalizeCategoryForComparison(pipeline.category);
            return pipelineCategoryNormalized === selectedCategoryNormalized;
          })
          .map((pipeline) => pipeline.teamId!) // non-null after filter
      );

      if (teamIdsForCategory.size > 0) {
        let narrowed: User[] = [...userList];

        if (assigneeType === 'SALES') {
          // Keep sales users who manage teams that have pipelines in this category
          narrowed = userList.filter((user) =>
            teams.some(
              (team) =>
                team.manager?.id === user.id &&
                team.id !== undefined &&
                teamIdsForCategory.has(team.id)
            )
          );
        } else {
          // Keep pre-sales users who are members of teams that have pipelines in this category
          narrowed = userList.filter((user) =>
            teams.some(
              (team) =>
                team.id !== undefined &&
                teamIdsForCategory.has(team.id) &&
                team.members.some((member) => member.id === user.id)
            )
          );
        }

        // If category-based narrowing removed all users (due to incomplete team/pipeline wiring),
        // fall back to the base list so admins can still select pre-sales users.
        if (narrowed.length > 0) {
          userList = narrowed;
        } else {
          userList = baseUserList;
        }
      }
    }

    return userList.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
  }, [users, assigneeType, teams, pipelines, selectedCategory]);

  // Filter organizations based on user and their pipeline associations
  // Only show organizations that are connected to the selected team manager through pipelines
  useEffect(() => {
    // If no user or category is selected, show no organizations (both are required)
    if (!selectedUserId || !selectedCategory || !allOrganizations.length) {
      setOrganizations([]);
      setSelectedOrganizationIds([]);
      return;
    }

    const userId = Number(selectedUserId);
    if (Number.isNaN(userId)) {
      setOrganizations([]);
      setSelectedOrganizationIds([]);
      return;
    }

    // Find teams where the user is manager (for Sales) or member (for Pre Sales)
    const relevantTeams = teams.filter((team) => {
      if (assigneeType === 'SALES') {
        return team.manager?.id === userId;
      } else {
        // Pre Sales
        return team.members.some((member) => member.id === userId);
      }
    });

    const relevantTeamIds = new Set(relevantTeams.map((team) => team.id));

    // If no relevant teams found, show no organizations
    if (relevantTeamIds.size === 0) {
      setOrganizations([]);
      setSelectedOrganizationIds([]);
      return;
    }

    // Normalize category for comparison
    const normalizeCategoryForComparison = (cat: string): string => {
      return cat
        .toUpperCase()
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const selectedCategoryNormalized = normalizeCategoryForComparison(selectedCategory);

    // Filter pipelines by:
    // 1. Team is in relevant teams (teams where user is manager/member)
    // 2. Organization exists
    // 3. Category matches selected category
    const relevantPipelines = pipelines.filter((pipeline) => {
      if (!pipeline.category) return false;
      const pipelineCategoryNormalized = normalizeCategoryForComparison(pipeline.category);
      const categoryMatch = pipelineCategoryNormalized === selectedCategoryNormalized;
      const teamMatch = pipeline.teamId && relevantTeamIds.has(pipeline.teamId);
      const hasOrganization = pipeline.organization?.id !== undefined && pipeline.organization?.id !== null;
      return categoryMatch && teamMatch && hasOrganization;
    });

    // Get unique organization IDs from relevant pipelines
    const relevantOrgIds = new Set(
      relevantPipelines
        .map((p) => p.organization?.id)
        .filter((id): id is number => id !== undefined && id !== null)
    );

    // Filter organizations to only those connected through pipelines
    const filtered = allOrganizations.filter((org) => relevantOrgIds.has(org.id));

    setOrganizations(filtered);

    // Clear selected organizations that are no longer in the filtered list
    setSelectedOrganizationIds((prev) => prev.filter((id) => relevantOrgIds.has(id)));
  }, [selectedCategory, selectedUserId, assigneeType, pipelines, teams, allOrganizations]);

  const filteredOrganizations = useMemo(() => {
    if (!orgSearch.trim()) return organizations;
    const term = orgSearch.trim().toLowerCase();
    return organizations.filter((org) => org.name?.toLowerCase().includes(term));
  }, [organizations, orgSearch]);

  const selectedOrganizations = useMemo(
    () => organizations.filter((org) => selectedOrganizationIds.includes(org.id)),
    [organizations, selectedOrganizationIds],
  );

  const toggleOrganization = (orgId: number) => {
    setSelectedOrganizationIds((prev) => {
      if (prev.includes(orgId)) {
        return prev.filter((id) => id !== orgId);
      }
      return [...prev, orgId];
    });
  };

  const clearOrganizations = () => {
    setSelectedOrganizationIds([]);
    setShowOrgDropdown(false);
  };

  const convertAmount = (): number => {
    const numeric = Number(amountInput);
    if (!Number.isFinite(numeric)) return 0;
    return numeric;
  };

  if (!isOpen) {
    return null;
  }

  const derivePeriodFields = (date: string) => {
    if (!date) {
      throw new Error('Please select a start date');
    }
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Invalid start date');
    }
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    const payload: {
      year: number;
      month?: number;
      monthStart?: number; // Backend expects month_start for MONTHLY period type
      quarter?: number;
      halfYear?: number;
    } = { year };

    switch (periodType) {
      case 'MONTHLY':
        payload.month = month;
        payload.monthStart = month; // Backend requires month_start field
        break;
      case 'QUARTERLY': {
        const quarter = Math.floor((month - 1) / 3) + 1;
        payload.quarter = quarter;
        payload.month = (quarter - 1) * 3 + 1;
        payload.monthStart = (quarter - 1) * 3 + 1; // First month of quarter
        break;
      }
      case 'HALF_YEARLY': {
        const half = month <= 6 ? 1 : 2;
        payload.halfYear = half;
        payload.month = half === 1 ? 1 : 7;
        payload.monthStart = half === 1 ? 1 : 7; // First month of half year
        break;
      }
      case 'YEARLY':
      default:
        payload.monthStart = 1; // Default to January for yearly
        break;
    }
    return payload;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!selectedCategory) {
      setError('Please select a category.');
      return;
    }
    if (!selectedUserId) {
      setError('Please select a user.');
      return;
    }
    if (!amountInput || Number(amountInput) <= 0) {
      setError('Enter a positive target value.');
      return;
    }

    let periodFields;
    try {
      periodFields = derivePeriodFields(startDate);
    } catch (err: any) {
      setError(err?.message || 'Please provide a valid start date.');
      return;
    }

    // Validate that all selected organizations are valid for the selected user
    const validOrgIds = new Set(organizations.map((org) => org.id));
    const invalidOrgIds = selectedOrganizationIds.filter((id) => !validOrgIds.has(id));
    if (invalidOrgIds.length > 0) {
      const invalidOrgs = allOrganizations.filter((org) => invalidOrgIds.includes(org.id));
      const invalidNames = invalidOrgs.map((org) => org.name).join(', ');
      setError(
        `The following organizations are not connected to the selected user through pipelines: ${invalidNames}. Please remove them and try again.`
      );
      return;
    }

    const targetAmount = convertAmount();
    setSubmitting(true);
    try {
      await targetsApi.create({
        userId: Number(selectedUserId),
        category: selectedCategory,
        periodType,
        ...periodFields,
        organizationIds: selectedOrganizationIds,
        targetAmount,
      });
      await onCreated();
      onClose();
    } catch (err: any) {
      let message = 'Failed to create target. Please try again.';
      
      if (err?.response?.data) {
        // Try different possible error message formats
        message = 
          err.response.data.message ||
          err.response.data.error ||
          (typeof err.response.data === 'string' ? err.response.data : message);
      } else if (err?.message) {
        message = err.message;
      }
      
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="set-target-modal-overlay">
      <div className="set-target-modal">
        <div className="set-target-modal-header">
          <h2>Set Target</h2>
          <button type="button" className="set-target-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>
        <form className="set-target-form" onSubmit={handleSubmit}>
          {error && <div className="set-target-error">{error}</div>}
          <div className="set-target-grid">
            <label className="set-target-field">
              <span>Category</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as TargetCategory)}
                disabled={loading}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.code} value={cat.code}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-target-field">
              <span>Assign</span>
              <select
                value={assigneeType}
                onChange={(e) => setAssigneeType(e.target.value as AssigneeType)}
                disabled={loading}
              >
                {ASSIGNEE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-target-field">
              <span>User</span>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={filteredUsers.length === 0}
              >
                <option value="">Select user</option>
                {filteredUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}
                  </option>
                ))}
              </select>
              {filteredUsers.length === 0 && (
                <small className="set-target-hint">No users found for this role.</small>
              )}
            </label>
          <label className="set-target-field">
            <span>Pipeline / Organization</span>
            <div className="set-target-multi" ref={orgDropdownRef}>
              <button
                type="button"
                className={`set-target-multi-trigger${selectedOrganizations.length === 0 ? ' placeholder' : ''}`}
                onClick={() => setShowOrgDropdown((open) => !open)}
                disabled={!selectedUserId || organizations.length === 0}
              >
                {selectedOrganizations.length === 0 && <span>All organizations</span>}
                {selectedOrganizations.length > 0 && (
                  <div className="set-target-multi-tags">
                    {selectedOrganizations.map((org) => (
                      <span key={org.id} className="set-target-tag">
                        {org.name}
                        <span
                          className="set-target-tag-remove"
                          role="button"
                          tabIndex={0}
                          aria-label={`Remove ${org.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleOrganization(org.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleOrganization(org.id);
                            }
                          }}
                        >
                          ×
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                <span className="set-target-multi-caret">▾</span>
              </button>
              {showOrgDropdown && (
                <div className="set-target-multi-dropdown">
                  <div className="set-target-multi-search">
                    <input
                      type="text"
                      placeholder="Search pipelines/organizations"
                      value={orgSearch}
                      onChange={(e) => setOrgSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <button type="button" className="set-target-multi-option special" onClick={clearOrganizations}>
                    All organizations
                    {selectedOrganizationIds.length === 0 && <span className="set-target-check">✓</span>}
                  </button>
                  <div className="set-target-multi-options">
                    {filteredOrganizations.map((org) => {
                      const isSelected = selectedOrganizationIds.includes(org.id);
                      return (
                        <button
                          key={org.id}
                          type="button"
                          className={`set-target-multi-option${isSelected ? ' selected' : ''}`}
                          onClick={() => toggleOrganization(org.id)}
                        >
                          <span>{org.name}</span>
                          {isSelected && <span className="set-target-check">✓</span>}
                        </button>
                      );
                    })}
                    {filteredOrganizations.length === 0 && (
                      <div className="set-target-empty">No matches found.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <small className="set-target-hint">
              {!selectedUserId
                ? 'Please select a user first to see connected organizations'
                : organizations.length === 0
                ? 'No organizations found connected to this user through pipelines'
                : 'Select multiple pipelines/organizations connected to the selected user'}
            </small>
          </label>
            <label className="set-target-field">
              <span>Frequency</span>
              <select value={periodType} onChange={(e) => setPeriodType(e.target.value as PeriodType)}>
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="set-target-field set-target-duration">
              <span>Duration</span>
              <div className="set-target-duration-inputs">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                <span className="set-target-duration-sep">-</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="set-target-field set-target-metric">
              <span>Tracking metric</span>
              {assigneeType === 'PRE_SALES' ? (
                <div className="set-target-metric-options">
                  <span className="set-target-metric-label">
                    Count (number of diverted deals)
                  </span>
                </div>
              ) : (
                <div className="set-target-metric-options">
                  <label>
                    <input
                      type="radio"
                      name="metric-type"
                      value="VALUE"
                      checked={metricType === 'VALUE'}
                      onChange={() => setMetricType('VALUE')}
                    />
                    Value
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="metric-type"
                      value="COUNT"
                      checked={metricType === 'COUNT'}
                      onChange={() => setMetricType('COUNT')}
                    />
                    Count
                  </label>
                </div>
              )}
            </div>
            <div className="set-target-field set-target-amount">
              <span>
                {metricType === 'VALUE'
                  ? 'Value'
                  : assigneeType === 'PRE_SALES'
                  ? 'Count (diverted deals)'
                  : 'Count'}
              </span>
              <div className="set-target-amount-row">
                {metricType === 'VALUE' && assigneeType !== 'PRE_SALES' && (
                  <select value={amountUnit} onChange={(e) => setAmountUnit(e.target.value as AmountUnit)}>
                    {AMOUNT_UNITS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Insert value"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="set-target-actions">
            <button type="button" className="set-target-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="set-target-save" disabled={submitting || loading}>
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

