import { useEffect, useMemo, useState } from 'react';
import TeamModal from '../components/TeamModal';
import type { Team, TeamRequest, TeamUpdateRequest } from '../types/team';
import { teamsApi } from '../services/teams';
import { logoutAndRedirect } from '../utils/authToken';
import Loader from '../components/Loader';
import './Teams.css';

interface TeamsState {
  mode: 'create' | 'edit';
  team?: Team;
}

const formatUserName = (user?: Team['manager'] | null): string => {
  if (!user) return '—';
  if (user.displayName) return user.displayName;
  const parts = [user.firstName, user.lastName].filter(Boolean).join(' ');
  if (parts.trim().length > 0) return parts;
  if (user.email) return user.email;
  return `User ${user.id}`;
};

const formatMemberLabel = (member: Team['members'][number]): string => {
  if (member.displayName) return member.displayName;
  const parts = [member.firstName, member.lastName].filter(Boolean).join(' ');
  if (parts.trim().length > 0) return parts;
  if (member.email) return member.email;
  return `User ${member.id}`;
};

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<TeamsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  );

  const loadTeams = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await teamsApi.list();
      setTeams(data);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load teams.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTeams();
  }, []);

  const refreshTeams = async () => {
    setRefreshing(true);
    try {
      const data = await teamsApi.list();
      setTeams(data);
      setError(null);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to refresh teams.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleTeamSubmit = async (payload: TeamRequest | TeamUpdateRequest) => {
    if (!modalState) return;
    setSaving(true);
    try {
      if (modalState.mode === 'create') {
        await teamsApi.create(payload as TeamRequest);
      } else if (modalState.team) {
        await teamsApi.update(modalState.team.id, payload as TeamUpdateRequest);
      }
      await refreshTeams();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (team: Team) => {
    if (!window.confirm(`Delete team "${team.name}"?`)) return;
    try {
      await teamsApi.remove(team.id);
      await refreshTeams();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to delete team.';
      setError(message);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        logoutAndRedirect();
      }
    }
  };

  return (
    <div className="teams-page">
      <header className="teams-header">
        <div>
          <h1>Teams</h1>
          <p>Organize managers and presales members into collaborative teams.</p>
        </div>
        <div className="teams-actions">
          <button className="teams-action" onClick={() => setModalState({ mode: 'create' })}>
            + Team
          </button>
          <button className="teams-action" onClick={() => void refreshTeams()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className="teams-error">{error}</div>}

      {loading ? (
        <Loader message="Loading teams..." size="large" />
      ) : sortedTeams.length === 0 ? (
        <div className="teams-empty">
          <h2>No teams yet</h2>
          <p>Create your first team to assign managers and members.</p>
          <button className="teams-action" onClick={() => setModalState({ mode: 'create' })}>
            Create team
          </button>
        </div>
      ) : (
        <div className="teams-grid">
          {sortedTeams.map((team) => (
            <section key={team.id} className="team-card">
              <div className="team-card-header">
                <div>
                  <h2>{team.name}</h2>
                  <div className="team-card-meta">
                    <span>Manager: {formatUserName(team.manager)}</span>
                    <span>Members: {team.members?.length ?? 0}</span>
                  </div>
                </div>
                <div className="team-card-actions">
                  <button className="team-card-button" onClick={() => setModalState({ mode: 'edit', team })}>
                    Edit
                  </button>
                  <button className="team-card-button danger" onClick={() => void handleDelete(team)}>
                    Delete
                  </button>
                </div>
              </div>
              {team.members && team.members.length > 0 && (
                <ul className="team-member-list">
                  {team.members.map((member) => (
                    <li key={member.id} className="team-member-chip">
                      {formatMemberLabel(member)}
                    </li>
                  ))}
                </ul>
              )}
              <footer className="team-card-footer">
                <span>Created: {team.createdAt ? new Date(team.createdAt).toLocaleString() : '—'}</span>
                <span>Updated: {team.updatedAt ? new Date(team.updatedAt).toLocaleString() : '—'}</span>
              </footer>
            </section>
          ))}
        </div>
      )}

      {modalState && (
        <TeamModal
          isOpen
          mode={modalState.mode}
          team={modalState.mode === 'edit' ? modalState.team : undefined}
          onClose={() => setModalState(null)}
          onSubmit={handleTeamSubmit}
        />
      )}

      {saving && <div className="teams-saving-indicator">Processing…</div>}
    </div>
  );
}
