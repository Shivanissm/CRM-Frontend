import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Team, TeamManagerOption, TeamMemberOption, TeamRequest, TeamUpdateRequest } from '../types/team';
import { teamsApi } from '../services/teams';
import './TeamModal.css';

interface TeamModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  team?: Team | null;
  onClose: () => void;
  onSubmit: (payload: TeamRequest | TeamUpdateRequest) => Promise<void>;
}

type TeamFormState = {
  name: string;
  managerId?: number | null;
  memberIds: number[];
  clearManager?: boolean;
};

const INITIAL_FORM: TeamFormState = {
  name: '',
  managerId: undefined,
  memberIds: [],
  clearManager: false,
};

const normaliseMemberIds = (ids: Array<number | undefined | null>): number[] => {
  const unique = new Set<number>();
  ids.forEach((id) => {
    if (typeof id === 'number' && Number.isFinite(id)) {
      unique.add(id);
    }
  });
  return Array.from(unique);
};

export default function TeamModal({ isOpen, mode, team, onClose, onSubmit }: TeamModalProps) {
  const [form, setForm] = useState<TeamFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managerOptions, setManagerOptions] = useState<TeamManagerOption[]>([]);
  const [memberOptions, setMemberOptions] = useState<TeamMemberOption[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const title = useMemo(
    () => (mode === 'create' ? 'Create team' : 'Edit team'),
    [mode],
  );

  useEffect(() => {
    if (!isOpen) {
      setForm(INITIAL_FORM);
      setSaving(false);
      setError(null);
      return;
    }

    if (team && mode === 'edit') {
      setForm({
        name: team.name ?? '',
        managerId: team.manager?.id ?? undefined,
        memberIds: normaliseMemberIds(team.members?.map((member) => member.id) ?? []),
        clearManager: false,
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [isOpen, team, mode]);

  useEffect(() => {
    if (!isOpen) return;

    setOptionsError(null);
    setManagersLoading(true);
    teamsApi
      .listManagers()
      .then((data) => setManagerOptions(data))
      .catch((err: any) => {
        console.error('Failed to load manager options', err);
        setOptionsError(err?.response?.data?.message || err?.message || 'Failed to load manager options.');
      })
      .finally(() => setManagersLoading(false));

    setMembersLoading(true);
    teamsApi
      .listMembers()
      .then((data) => {
        // When editing, ensure existing team members are included in options
        if (mode === 'edit' && team) {
          const byId = new Map<number, TeamMemberOption>();
          data.forEach((member) => {
            byId.set(member.id, member);
          });
          (team.members ?? []).forEach((member) => {
            if (!byId.has(member.id)) {
              byId.set(member.id, member);
            }
          });
          setMemberOptions(Array.from(byId.values()));
          return;
        }

        setMemberOptions(data);
      })
      .catch((err: any) => {
        console.error('Failed to load member options', err);
        setOptionsError(
          (prev) =>
            prev ??
            err?.response?.data?.message ??
            err?.message ??
            'Failed to load member options.',
        );
      })
      .finally(() => setMembersLoading(false));
  }, [isOpen, mode, team]);

  if (!isOpen) return null;

  const handleManagerChange = (value: string) => {
    if (!value) {
      setForm((prev) => ({
        ...prev,
        managerId: undefined,
        clearManager: mode === 'edit' ? true : false,
      }));
      return;
    }
    const numeric = Number(value);
    setForm((prev) => ({
      ...prev,
      managerId: Number.isNaN(numeric) ? undefined : numeric,
      clearManager: false,
    }));
  };

  const handleMemberToggle = (id: number) => {
    setForm((prev) => {
      const exists = prev.memberIds.includes(id);
      const nextMemberIds = exists
        ? prev.memberIds.filter((memberId) => memberId !== id)
        : [...prev.memberIds, id];
      return {
        ...prev,
        memberIds: nextMemberIds,
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError('Team name is required.');
      return;
    }

    const uniqueMemberIds = normaliseMemberIds(form.memberIds);

    const basePayload: TeamRequest = {
      name: trimmedName,
      managerId: form.managerId ?? undefined,
      memberIds: uniqueMemberIds,
    };

    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        await onSubmit(basePayload);
      } else {
        const updatePayload: TeamUpdateRequest = {
          ...basePayload,
          clearManager: form.clearManager && !basePayload.managerId ? true : undefined,
        };
        await onSubmit(updatePayload);
      }
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to save team.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="team-modal-overlay" onClick={onClose}>
      <div className="team-modal" onClick={(event) => event.stopPropagation()}>
        <header className="team-modal-header">
          <h2>{title}</h2>
          <button className="team-modal-close" onClick={onClose} aria-label="Close team modal">×</button>
        </header>
        <p className="team-modal-subtitle">
          {mode === 'create'
            ? 'Create a new team to group users around shared pipelines.'
            : 'Update team details, manager, and roster.'}
        </p>

        {(optionsError || error) && (
          <div className="team-modal-error">{error ?? optionsError}</div>
        )}

        <form className="team-modal-form" onSubmit={handleSubmit}>
          <label className="team-modal-label">
            Team name
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="North America Sales"
              className="team-modal-input"
              required
            />
          </label>

          <label className="team-modal-label">
            Manager
            <select
              value={form.managerId ?? ''}
              onChange={(event) => handleManagerChange(event.target.value)}
              className="team-modal-input"
              disabled={managersLoading}
            >
              <option value="">No manager</option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.displayName ??
                    ([manager.firstName, manager.lastName].filter(Boolean).join(' ') ||
                      manager.email ||
                      `User ${manager.id}`)}
                </option>
              ))}
            </select>
            {mode === 'edit' && form.clearManager && !form.managerId && (
              <span className="team-modal-hint">Current manager will be cleared.</span>
            )}
          </label>

          <fieldset className="team-modal-fieldset">
            <legend>Members</legend>
            {membersLoading ? (
              <div className="team-modal-hint">Loading members…</div>
            ) : memberOptions.length === 0 ? (
              <div className="team-modal-hint">No members available.</div>
            ) : (
              <div className="team-modal-members">
                {memberOptions.map((member) => {
                  const label =
                    member.displayName ??
                    ([member.firstName, member.lastName].filter(Boolean).join(' ') ||
                      member.email ||
                      `User ${member.id}`);
                  return (
                    <label key={member.id} className="team-modal-member">
                      <input
                        type="checkbox"
                        checked={form.memberIds.includes(member.id)}
                        onChange={() => handleMemberToggle(member.id)}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="team-modal-actions">
            <button type="button" className="team-modal-cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="team-modal-submit" disabled={saving}>
              {saving ? 'Saving…' : mode === 'create' ? 'Create team' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
