import { useEffect, useMemo, useState } from 'react';
import OrganizationModal from '../components/OrganizationModal';
import { organizationsApi } from '../services/organizations';
import type { Organization, OrganizationCategory, OrganizationOwner, OrganizationRequest } from '../types/organization';
import './Organizations.css';
import { clearAuthSession } from '../utils/authToken';

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; organization: Organization };

export default function Organizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [owners, setOwners] = useState<OrganizationOwner[]>([]);
  const [categories, setCategories] = useState<OrganizationCategory[]>([]);

  const filteredOrganizations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return organizations;
    return organizations.filter((org) => {
      const category = org.category ?? '';
      return (
        org.name.toLowerCase().includes(term) ||
        category.toLowerCase().includes(term)
      );
    });
  }, [organizations, search]);

  useEffect(() => {
    void loadOrganizations();
    void loadOwners();
    void loadCategories();
  }, []);

  const handleAuthRedirect = () => {
    clearAuthSession();
    window.location.href = '/login';
  };

  const loadOwners = async () => {
    try {
      const data = await organizationsApi.listOwners();
      setOwners(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      console.warn('Failed to load organization owners', err);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await organizationsApi.listCategories();
      setCategories(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      console.warn('Failed to load organization categories', err);
    }
  };

  const loadOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await organizationsApi.list();
      setOrganizations(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      const message = err?.response?.data?.message || err?.message || 'Failed to load organizations.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const refreshOrganizations = async () => {
    setRefreshing(true);
    try {
      const data = await organizationsApi.list();
      setOrganizations(data);
      setError(null);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      const message = err?.response?.data?.message || err?.message || 'Failed to refresh organizations.';
      setError(message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleModalSubmit = async (payload: OrganizationRequest) => {
    if (!modalState) return;
    try {
      if (modalState.mode === 'create') {
        await organizationsApi.create(payload);
      } else {
        setBusyId(modalState.organization.id);
        await organizationsApi.update(modalState.organization.id, payload);
      }
      await refreshOrganizations();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (organization: Organization) => {
    if (!window.confirm(`Delete organization “${organization.name}”?`)) return;
    setBusyId(organization.id);
    try {
      await organizationsApi.remove(organization.id);
      await refreshOrganizations();
    } catch (err: any) {
      if (err?.response?.status === 401) {
        handleAuthRedirect();
        return;
      }
      const message = err?.response?.data?.message || err?.message || 'Failed to delete organization.';
      setError(message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="organizations-page">
      <header className="organizations-header">
        <div>
          <h1>Organizations</h1>
          <p>Manage the company records that power dropdowns and ownership flows across CRM.</p>
        </div>
        <div className="organizations-header-actions">
          <div className="organizations-search">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search organizations…"
            />
          </div>
          <button className="organizations-add" onClick={() => setModalState({ mode: 'create' })}>
            + Organization
          </button>
          <button
            className="organizations-refresh"
            onClick={() => void refreshOrganizations()}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className="organizations-error">{error}</div>}

      {loading ? (
        <div className="organizations-loading">Loading organizations…</div>
      ) : filteredOrganizations.length === 0 ? (
        <div className="organizations-empty">
          <div className="organizations-empty-card">
            <h2>No organizations yet</h2>
            <p>Use the “+ Organization” button to create your first record.</p>
          </div>
        </div>
      ) : (
        <table className="organizations-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>ID</th>
              <th>Name</th>
              <th style={{ width: '200px' }}>Category</th>
              <th style={{ width: '180px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrganizations.map((organization) => {
              const isBusy = busyId === organization.id;
              return (
                <tr key={organization.id}>
                  <td>{organization.id}</td>
                  <td>{organization.name}</td>
                  <td>{organization.category ?? '—'}</td>
                  <td>
                    <div className="organizations-row-actions">
                      <button
                        className="organizations-row-btn"
                        onClick={() => setModalState({ mode: 'edit', organization })}
                        disabled={isBusy}
                      >
                        Edit
                      </button>
                      <button
                        className="organizations-row-btn danger"
                        onClick={() => void handleDelete(organization)}
                        disabled={isBusy}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {modalState && (
        <OrganizationModal
          isOpen
          mode={modalState.mode}
          organization={modalState.mode === 'edit' ? modalState.organization : undefined}
          onClose={() => setModalState(null)}
          onSubmit={handleModalSubmit}
          owners={owners}
          categories={categories}
        />
      )}
    </div>
  );
}


