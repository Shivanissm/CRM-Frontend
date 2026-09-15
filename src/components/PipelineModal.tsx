import { FormEvent, useEffect, useMemo, useState } from 'react';
import { filterFrontendCategoryStrings } from '../constants/categories';
import type { Pipeline, PipelineRequest, PipelineUpdateRequest } from '../types/pipeline';
import type { Organization } from '../types/organization';
import type { Team } from '../types/team';
import { organizationsApi } from '../services/organizations';
import { teamsApi } from '../services/teams';
import { pipelinesApi } from '../services/pipelines';
import './PipelineModal.css';

interface PipelineModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  pipeline?: Pipeline | null;
  onClose: () => void;
  onSubmit: (payload: PipelineRequest | PipelineUpdateRequest) => Promise<void>;
  categoryOptions?: string[];
}

type PipelineFormState = {
  name: string;
  category?: string | null;
  teamId?: number | null;
  organizationId?: number | null;
  deleted?: boolean;
};

const INITIAL_FORM: PipelineFormState = {
  name: '',
  category: '',
  teamId: undefined,
  organizationId: undefined,
  deleted: false,
};

const normaliseCategory = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === 'object') {
    const source = value as {
      name?: unknown;
      category?: unknown;
      label?: unknown;
      code?: unknown;
      value?: unknown;
    };
    const candidates: Array<unknown> = [
      source.label,
      source.name,
      source.category,
      source.value,
      source.code,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }
  return null;
};

export default function PipelineModal({
  isOpen,
  mode,
  pipeline,
  onClose,
  onSubmit,
  categoryOptions = [],
}: PipelineModalProps) {
  const [form, setForm] = useState<PipelineFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const title = useMemo(
    () => (mode === 'create' ? 'Create pipeline' : 'Edit pipeline'),
    [mode],
  );

  const applyAllowedCategories = (items: string[]) =>
    filterFrontendCategoryStrings(
      items
        .map((item) => normaliseCategory(item))
        .filter((item): item is string => Boolean(item)),
    );

  useEffect(() => {
    if (categoryOptions.length === 0) return;
    setCategories((prev) => {
      const unique = new Set<string>(prev);
      applyAllowedCategories(categoryOptions).forEach((item) => unique.add(item));
      return Array.from(unique).sort((a, b) => a.localeCompare(b));
    });
  }, [categoryOptions]);

  useEffect(() => {
    if (!isOpen) {
      setForm(INITIAL_FORM);
      setSaving(false);
      setError(null);
      return;
    }

    if (pipeline && mode === 'edit') {
      setForm({
        name: pipeline.name ?? '',
        category: pipeline.category ?? '',
        teamId: pipeline.team?.id ?? pipeline.teamId ?? undefined,
        organizationId: pipeline.organization?.id ?? undefined,
        deleted: pipeline.isDeleted ?? false,
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [isOpen, pipeline, mode]);

  useEffect(() => {
    if (!isOpen) return;
    setOrganizationsLoading(true);
    setOrgError(null);
    organizationsApi
      .list()
      .then((data) => setOrganizations(data))
      .catch((err: any) => {
        console.error('Failed to load organizations for pipeline modal', err);
        setOrgError(err?.response?.data?.message || err?.message || 'Failed to load organizations.');
      })
      .finally(() => setOrganizationsLoading(false));

    setTeamsLoading(true);
    setTeamError(null);
    teamsApi
      .list()
      .then((data) => setTeams(data))
      .catch((err: any) => {
        console.error('Failed to load teams for pipeline modal', err);
        setTeamError(err?.response?.data?.message || err?.message || 'Failed to load teams.');
      })
      .finally(() => setTeamsLoading(false));

    setCategoriesLoading(true);
    setCategoryError(null);
    pipelinesApi
      .listCategories()
      .then((data) => {
        setCategories(
          applyAllowedCategories([...categoryOptions, ...data]).sort((a, b) => a.localeCompare(b)),
        );
      })
      .catch((err: any) => {
        console.error('Failed to load pipeline categories', err);
        setCategoryError(err?.response?.data?.message || err?.message || 'Failed to load categories.');
        // fallback to prop options if fetch fails
        setCategories((prev) => {
          if (prev.length > 0) return prev;
          return applyAllowedCategories(categoryOptions);
        });
      })
      .finally(() => setCategoriesLoading(false));
  }, [isOpen, categoryOptions]);

  if (!isOpen) return null;

  const handleChange = <K extends keyof PipelineFormState>(key: K, value: PipelineFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Pipeline name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        category: form.category?.trim() || undefined,
        teamId: form.teamId ?? undefined,
        organizationId: form.organizationId ?? undefined,
        ...(mode === 'edit' ? { deleted: form.deleted ?? false } : {}),
      });
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to save pipeline.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pipeline-modal-overlay" onClick={onClose}>
      <div className="pipeline-modal" onClick={(event) => event.stopPropagation()}>
        <header className="pipeline-modal-header">
          <h2>{title}</h2>
          <button className="pipeline-modal-close" onClick={onClose} aria-label="Close pipeline modal">×</button>
        </header>
        <p className="pipeline-modal-subtitle">
          {mode === 'create'
            ? 'Set up a pipeline to organize deals across stages.'
            : 'Update pipeline details and associations.'}
        </p>

        <form className="pipeline-modal-form" onSubmit={handleSubmit}>
          <label className="pipeline-modal-label">
            Pipeline name
            <input
              type="text"
              value={form.name}
              onChange={(event) => handleChange('name', event.target.value)}
              placeholder="Enterprise pipeline"
              className="pipeline-modal-input"
              required
            />
          </label>

          <label className="pipeline-modal-label">
            Category
            <input
              type="text"
              value={form.category ?? ''}
              onChange={(event) => handleChange('category', event.target.value)}
              placeholder="Photography"
              className="pipeline-modal-input"
              list={categories.length > 0 ? 'pipeline-category-options' : undefined}
              disabled={categoriesLoading && categories.length === 0}
            />
            {categoryError && <span className="pipeline-modal-hint error">{categoryError}</span>}
            {categories.length > 0 && (
              <>
                <datalist id="pipeline-category-options">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
                <div className="pipeline-modal-category-select">
                  <span className="pipeline-modal-hint">Pick from existing categories</span>
                  <div className="pipeline-modal-category-chip-row">
                    {categories.map((category) => {
                      const active = (form.category ?? '').trim() === category;
                      return (
                        <button
                          key={category}
                          type="button"
                          className={`pipeline-modal-category-chip${active ? ' active' : ''}`}
                          onClick={() => handleChange('category', category)}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </label>

          <label className="pipeline-modal-label">
            Team
            <select
              value={form.teamId ?? ''}
              onChange={(event) => {
                const raw = event.target.value.trim();
                handleChange('teamId', raw ? Number(raw) : undefined);
              }}
              className="pipeline-modal-input"
              disabled={teamsLoading}
            >
              <option value="">No team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            {teamError && <span className="pipeline-modal-hint error">{teamError}</span>}
          </label>

  <label className="pipeline-modal-label">
            Organization
            <select
              value={form.organizationId ?? ''}
              onChange={(event) => {
                const raw = event.target.value.trim();
                handleChange('organizationId', raw ? Number(raw) : undefined);
              }}
              className="pipeline-modal-input"
              disabled={organizationsLoading}
            >
              <option value="">No organization</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            {orgError && <span className="pipeline-modal-hint error">{orgError}</span>}
          </label>

          {mode === 'edit' && (
            <div className="pipeline-modal-checkbox-group">
              <label className="pipeline-modal-checkbox">
                <input
                  type="checkbox"
                  checked={form.deleted ?? false}
                  onChange={(event) => handleChange('deleted', event.target.checked)}
                />
                <span>{form.deleted ? 'Archived pipeline (will be hidden from lists)' : 'Pipeline is active'}</span>
              </label>
            </div>
          )}

          {error && <div className="pipeline-modal-error">{error}</div>}

          <div className="pipeline-modal-actions">
            <button type="button" className="pipeline-modal-cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="pipeline-modal-submit" disabled={saving}>
              {saving ? 'Saving…' : mode === 'create' ? 'Create pipeline' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

