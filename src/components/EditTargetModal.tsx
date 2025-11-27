import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './SetTargetModal.css';
import type {
  CategoryOption,
  PeriodType,
  TargetCategory,
  TargetResponse,
} from '../types/target';
import type { Organization } from '../types/organization';
import type { Pipeline } from '../types/pipeline';
import type { Team } from '../types/team';
import { targetsApi } from '../services/targets';
import { organizationsApi } from '../services/organizations';
import { pipelinesApi } from '../services/pipelines';
import { teamsApi } from '../services/teams';

type AssigneeType = 'SALES' | 'PRE_SALES';

interface EditTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
  target: TargetResponse;
  categories: CategoryOption[];
}

export default function EditTargetModal({
  isOpen,
  onClose,
  onUpdated,
  target,
  categories,
}: EditTargetModalProps) {
  const [targetAmount, setTargetAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>('MONTHLY');
  const [periodYear, setPeriodYear] = useState<number>(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState<number | ''>('');
  const [periodQuarter, setPeriodQuarter] = useState<number | ''>('');
  const [periodHalf, setPeriodHalf] = useState<number | ''>('');
  const [availableOrganizations, setAvailableOrganizations] = useState<Organization[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<number[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement | null>(null);
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const derivedAssigneeType = useMemo<AssigneeType>(() => {
    const explicit = (target as any)?.assigneeType as AssigneeType | undefined;
    if (explicit === 'SALES' || explicit === 'PRE_SALES') {
      return explicit;
    }
    const managesAnyTeam = teams.some((team) => team.manager?.id === target?.userId);
    return managesAnyTeam ? 'SALES' : 'PRE_SALES';
  }, [target, teams]);

  useEffect(() => {
    if (isOpen && target) {
      setTargetAmount(target.targetAmount.toString());
      setError(null);
      initializePeriodFromTarget(target);
      setSelectedOrgIds(target.organizationIds ?? []);
    }
  }, [isOpen, target]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadDropdownData = async () => {
      try {
        const [orgs, pipelineList, teamList] = await Promise.all([
          organizationsApi.list().catch(() => []),
          pipelinesApi.list().catch(() => []),
          teamsApi.list().catch(() => []),
        ]);
        if (cancelled) return;
        setAllOrganizations(orgs ?? []);
        setPipelines(pipelineList ?? []);
        setTeams(teamList ?? []);
      } catch (err) {
        console.warn('Failed to load dropdown data for edit target modal', err);
      }
    };

    loadDropdownData();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!target) return;

    const ensureTargetOrganizations = (orgs: Organization[]): Organization[] => {
      const merged = new Map<number, Organization>();
      orgs.forEach((org) => {
        if (org.id !== undefined && org.id !== null) {
          merged.set(org.id, org);
        }
      });
      (target.organizations ?? []).forEach((org) => {
        if (org.id !== undefined && org.id !== null) {
          merged.set(org.id, {
            id: org.id,
            name: org.name,
            category: org.category ?? null,
          });
        }
      });
      return Array.from(merged.values());
    };

    const normalizeCategoryForComparison = (cat: string): string => {
      return cat
        .toUpperCase()
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const deriveOrganizations = (): Organization[] => {
      if (!target || !allOrganizations.length || !pipelines.length || !teams.length) {
        return ensureTargetOrganizations(target?.organizations?.map((org) => ({
          id: org.id,
          name: org.name,
          category: org.category ?? null,
        })) ?? []);
      }

      const userId = target.userId;
      const relevantTeams = teams.filter((team) => {
        if (derivedAssigneeType === 'SALES') {
          return team.manager?.id === userId;
        }
        return team.members?.some((member) => member.id === userId);
      });
      if (!relevantTeams.length) {
        return ensureTargetOrganizations([]);
      }

      const relevantTeamIds = new Set(relevantTeams.map((team) => team.id));
      const selectedCategoryNormalized = normalizeCategoryForComparison(target.category);

      const relevantPipelines = pipelines.filter((pipeline) => {
        if (!pipeline.category || !pipeline.organization?.id) return false;
        const pipelineCategoryNormalized = normalizeCategoryForComparison(pipeline.category);
        const teamMatch = pipeline.teamId && relevantTeamIds.has(pipeline.teamId);
        return teamMatch && pipelineCategoryNormalized === selectedCategoryNormalized;
      });

      const relevantOrgIds = new Set<number>();
      relevantPipelines.forEach((pipeline) => {
        if (typeof pipeline.organization?.id === 'number') {
          relevantOrgIds.add(pipeline.organization.id);
        }
      });

      const filtered = allOrganizations.filter((org) => relevantOrgIds.has(org.id));

      // Include organizations coming from pipelines even if they are not in the master list yet
      relevantPipelines.forEach((pipeline) => {
        const org = pipeline.organization;
        if (org?.id && !filtered.some((existing) => existing.id === org.id)) {
          filtered.push({
            id: org.id,
            name: org.name,
            category: null,
          });
        }
      });

      return ensureTargetOrganizations(filtered);
    };

    const derived = deriveOrganizations();
    setAvailableOrganizations(derived);
  }, [target, allOrganizations, pipelines, teams, derivedAssigneeType]);

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

  const filteredOrganizations = useMemo(() => {
    if (!orgSearch.trim()) return availableOrganizations;
    const term = orgSearch.trim().toLowerCase();
    return availableOrganizations.filter((org) => org.name?.toLowerCase().includes(term));
  }, [availableOrganizations, orgSearch]);

  const selectedOrganizations = useMemo(
    () => availableOrganizations.filter((org) => selectedOrgIds.includes(org.id)),
    [availableOrganizations, selectedOrgIds],
  );

  const toggleOrganization = (orgId: number) => {
    setSelectedOrgIds((prev) => {
      if (prev.includes(orgId)) {
        return prev.filter((id) => id !== orgId);
      }
      return [...prev, orgId];
    });
  };

  const clearOrganizations = () => {
    setSelectedOrgIds([]);
    setShowOrgDropdown(false);
  };

  const initializePeriodFromTarget = (data: TargetResponse) => {
    if (!data) return;
    if (data.quarter) {
      setPeriodType('QUARTERLY');
      setPeriodQuarter(data.quarter);
      setPeriodMonth('');
      setPeriodHalf('');
    } else if (data.halfYear) {
      setPeriodType('HALF_YEARLY');
      setPeriodHalf(data.halfYear);
      setPeriodMonth('');
      setPeriodQuarter('');
    } else if (data.month !== undefined && data.month !== null) {
      setPeriodType('MONTHLY');
      setPeriodMonth(data.month);
      setPeriodQuarter('');
      setPeriodHalf('');
    } else {
      setPeriodType('YEARLY');
      setPeriodMonth('');
      setPeriodQuarter('');
      setPeriodHalf('');
    }
    setPeriodYear(data.year);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const buildPeriodPayload = () => {
    const payload: {
      year: number;
      month?: number;
      monthStart?: number;
      quarter?: number;
      halfYear?: number;
    } = {
      year: periodYear,
    };

    switch (periodType) {
      case 'MONTHLY':
        if (typeof periodMonth !== 'number') {
          throw new Error('Select a valid month for the target period.');
        }
        payload.month = periodMonth;
        payload.monthStart = periodMonth;
        break;
      case 'QUARTERLY':
        if (typeof periodQuarter !== 'number') {
          throw new Error('Select a quarter for the target period.');
        }
        payload.quarter = periodQuarter;
        payload.month = (periodQuarter - 1) * 3 + 1;
        payload.monthStart = payload.month;
        break;
      case 'HALF_YEARLY':
        if (typeof periodHalf !== 'number') {
          throw new Error('Select a half-year for the target period.');
        }
        payload.halfYear = periodHalf;
        payload.month = periodHalf === 1 ? 1 : 7;
        payload.monthStart = payload.month;
        break;
      case 'YEARLY':
      default:
        payload.monthStart = 1;
        break;
    }

    return payload;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const numericAmount = Number(targetAmount);
    if (!targetAmount || isNaN(numericAmount) || numericAmount <= 0) {
      setError('Enter a positive target value.');
      return;
    }

    let periodFields;
    try {
      periodFields = buildPeriodPayload();
    } catch (err: any) {
      setError(err?.message || 'Select a valid time period.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        userId: target.userId,
        category: target.category,
        periodType,
        targetAmount: numericAmount,
        organizationIds: selectedOrgIds,
        ...periodFields,
      };

      await targetsApi.update(target.id, payload);
      await onUpdated();
      onClose();
    } catch (err: any) {
      let message = 'Failed to update target. Please try again.';
      
      if (err?.response?.data) {
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

  if (!isOpen) {
    return null;
  }

  const getCategoryLabel = (category: TargetCategory): string => {
    const categoryOption = categories.find((cat) => cat.code === category);
    return categoryOption?.label || category;
  };

  return createPortal(
    <div className="set-target-modal-overlay">
      <div className="set-target-modal">
        <div className="set-target-modal-header">
          <h2>Edit Target</h2>
          <button type="button" className="set-target-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>
        <form className="set-target-form" onSubmit={handleSubmit}>
          {error && <div className="set-target-error">{error}</div>}
          
          <div className="set-target-grid">
            <div className="set-target-field">
              <span>User</span>
              <div className="set-target-readonly">{target.userName}</div>
            </div>
            
            <div className="set-target-field">
              <span>Category</span>
              <div className="set-target-readonly">{getCategoryLabel(target.category)}</div>
            </div>
            
            <div className="set-target-field">
              <span>Period Type</span>
              <select
                value={periodType}
                onChange={(e) => {
                  const nextType = e.target.value as PeriodType;
                  setPeriodType(nextType);
                  if (nextType === 'MONTHLY' && typeof periodMonth !== 'number') {
                    setPeriodMonth(1);
                  }
                  if (nextType === 'QUARTERLY' && typeof periodQuarter !== 'number') {
                    setPeriodQuarter(1);
                  }
                  if (nextType === 'HALF_YEARLY' && typeof periodHalf !== 'number') {
                    setPeriodHalf(1);
                  }
                }}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="HALF_YEARLY">Half-yearly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            
            <div className="set-target-field">
              <span>Year</span>
              <input
                type="number"
                value={periodYear}
                onChange={(e) => setPeriodYear(Number(e.target.value))}
                min={2000}
                max={2100}
              />
            </div>

            {periodType === 'MONTHLY' && (
              <div className="set-target-field">
                <span>Month</span>
                <select
                  value={periodMonth === '' ? '' : periodMonth}
                  onChange={(e) => setPeriodMonth(Number(e.target.value))}
                >
                  <option value="" disabled>
                    Select month
                  </option>
                  {[
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December',
                  ].map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {periodType === 'QUARTERLY' && (
              <div className="set-target-field">
                <span>Quarter</span>
                <select
                  value={periodQuarter === '' ? '' : periodQuarter}
                  onChange={(e) => setPeriodQuarter(Number(e.target.value))}
                >
                  <option value="" disabled>
                    Select quarter
                  </option>
                  <option value={1}>Q1 (Jan - Mar)</option>
                  <option value={2}>Q2 (Apr - Jun)</option>
                  <option value={3}>Q3 (Jul - Sep)</option>
                  <option value={4}>Q4 (Oct - Dec)</option>
                </select>
              </div>
            )}

            {periodType === 'HALF_YEARLY' && (
              <div className="set-target-field">
                <span>Half-year</span>
                <select
                  value={periodHalf === '' ? '' : periodHalf}
                  onChange={(e) => setPeriodHalf(Number(e.target.value))}
                >
                  <option value="" disabled>
                    Select half-year
                  </option>
                  <option value={1}>H1 (Jan - Jun)</option>
                  <option value={2}>H2 (Jul - Dec)</option>
                </select>
              </div>
            )}

            <label className="set-target-field">
              <span>Organizations</span>
              <div className="set-target-multi" ref={orgDropdownRef}>
                <button
                  type="button"
                  className={`set-target-multi-trigger${selectedOrganizations.length === 0 ? ' placeholder' : ''}`}
                  onClick={() => setShowOrgDropdown((open) => !open)}
                  disabled={availableOrganizations.length === 0}
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
                        placeholder="Search organizations"
                        value={orgSearch}
                        onChange={(e) => setOrgSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <button type="button" className="set-target-multi-option special" onClick={clearOrganizations}>
                      All organizations
                      {selectedOrgIds.length === 0 && <span className="set-target-check">✓</span>}
                    </button>
                    <div className="set-target-multi-options">
                      {filteredOrganizations.map((org) => {
                        const isSelected = selectedOrgIds.includes(org.id);
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
                {availableOrganizations.length === 0
                  ? 'No organizations found for this user'
                  : 'Select multiple organizations connected to this user'}
              </small>
            </label>
            
            <div className="set-target-field set-target-amount">
              <span>Target Amount</span>
              <div className="set-target-amount-row">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter target amount"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <small className="set-target-hint">
                Current target: {formatCurrency(target.targetAmount)}
              </small>
            </div>
          </div>
          
          <div className="set-target-actions">
            <button type="button" className="set-target-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="set-target-save" disabled={submitting}>
              {submitting ? 'Updating...' : 'Update Target'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

