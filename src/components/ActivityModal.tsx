import { useEffect, useState } from 'react';
import './ActivityModal.css';
import { activitiesApi } from '../services/activities';
import { usersApi } from '../services/users';
import { organizationsApi } from '../services/organizations';

export interface ActivityFormValues {
  subject: string;
  category?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  priority?: string;
  assignedUser?: string;
  notes?: string;
  personName?: string;
  organization?: string;
  personId?: number;
  dealId?: number;
  dateTime?: string;
}

export default function ActivityModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: ActivityFormValues) => Promise<void> | void;
}) {
  const [values, setValues] = useState<ActivityFormValues>({ subject: '' });
  const [categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [users, setUsers] = useState<Array<{ id: number; label: string }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Array<{ id: number; label: string }>>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState<string | null>(null);

  const update = (k: keyof ActivityFormValues, v: string | number) => {
    if (k === 'personId') {
      setValues({ ...values, [k]: typeof v === 'number' ? v : (v === '' ? undefined : parseInt(v as string, 10)) });
    } else if (k === 'dealId') {
      setValues({ ...values, [k]: typeof v === 'number' ? v : (v === '' ? undefined : parseInt(v as string, 10)) });
    } else {
      setValues({ ...values, [k]: v as string });
    }
  };

  const loadCategories = async () => {
    if (categoryLoading) return;
    setCategoryLoading(true);
    setCategoryError(null);
    try {
      const data = await activitiesApi.listCategories();
      const normalized = (data ?? []).map((category) => ({
        id: category.code,
        label: category.label,
      }));
      console.debug('Loaded activity categories:', normalized);
      setCategories(normalized);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load categories.';
      setCategoryError(message);
    } finally {
      setCategoryLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    setValues({ subject: '' });
    void loadCategories();

    if (!usersLoading && users.length === 0) {
      setUsersLoading(true);
      setUsersError(null);
      usersApi
        .list()
        .then((response) => {
          const normalized = (response ?? []).map((user) => ({
            id: user.id,
            label:
              user.firstName && user.lastName
                ? `${user.firstName} ${user.lastName}`
                : user.email ?? String(user.id),
          }));
          setUsers(normalized);
        })
        .catch((err: any) => {
          const message = err?.response?.data?.message || err?.message || 'Failed to load users.';
          setUsersError(message);
        })
        .finally(() => {
          setUsersLoading(false);
        });
    }

    if (!organizationsLoading && organizations.length === 0) {
      setOrganizationsLoading(true);
      setOrganizationsError(null);
      organizationsApi
        .list()
        .then((response) => {
          const normalized = (response ?? []).map((organization) => ({
            id: organization.id,
            label: organization.name?.trim().length ? organization.name.trim() : `Organization #${organization.id}`,
          }));
          setOrganizations(normalized);
        })
        .catch((err: any) => {
          const message = err?.response?.data?.message || err?.message || 'Failed to load organizations.';
          setOrganizationsError(message);
        })
        .finally(() => {
          setOrganizationsLoading(false);
        });
    }
  }, [isOpen, usersLoading, users.length, organizationsLoading, organizations.length]);

  if (!isOpen) return null;

  const formatDateForBackend = (dateStr?: string): string | undefined => {
    if (!dateStr) return undefined;
    // Convert yyyy-MM-dd to dd/MM/yyyy
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handleSave = async () => {
    const formattedValues = {
      ...values,
      date: formatDateForBackend(values.date),
      dateTime: values.date ? `${values.date}T${values.startTime || '00:00'}:00` : new Date().toISOString(),
    };
    await onSave(formattedValues);
    setValues({ subject: '' }); // Reset after save
  };

  return (
    <div className="am-overlay" onClick={onClose}>
      <div className="am-modal" onClick={(e) => e.stopPropagation()}>
        <div className="am-header">
          <h2>Schedule activity</h2>
          <button className="am-close" onClick={onClose}>×</button>
        </div>

        <div className="am-content">
          <input className="am-input" placeholder="Subject" value={values.subject} onChange={(e) => update('subject', e.target.value)} />

          <div className="am-row">
            <input className="am-input" type="date" value={values.date || ''} onChange={(e) => update('date', e.target.value)} />
            <input className="am-input" type="time" value={values.startTime || ''} onChange={(e) => update('startTime', e.target.value)} />
            <input className="am-input" type="time" value={values.endTime || ''} onChange={(e) => update('endTime', e.target.value)} />
          </div>

          <div className="am-row">
          <select
            className="am-input"
            value={values.category || ''}
            onChange={(e) => update('category', e.target.value)}
            disabled={categoryLoading}
            onFocus={() => {
              if (categories.length === 0 && !categoryLoading) {
                void loadCategories();
              }
            }}
          >
            <option value="">Activity type</option>
            {categoryLoading ? (
              <option value="" disabled>
                Loading categories…
              </option>
            ) : categories.length === 0 ? (
              <option value="" disabled>
                {categoryError ?? 'No categories available'}
              </option>
            ) : (
              categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))
            )}
          </select>
            <select className="am-input" value={values.priority || ''} onChange={(e) => update('priority', e.target.value)}>
              <option value="">Priority</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <select
              className="am-input"
              value={values.assignedUser || ''}
              onChange={(e) => update('assignedUser', e.target.value)}
              disabled={usersLoading}
            >
              <option value="">Assigned user</option>
              {usersLoading ? (
                <option value="" disabled>
                  Loading users…
                </option>
              ) : users.length === 0 ? (
                <option value="" disabled>
                  {usersError ?? 'No users available'}
                </option>
              ) : (
                users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.label}
                  </option>
                ))
              )}
            </select>
          </div>

          <textarea className="am-textarea" placeholder="Notes (not visible to event guests)" value={values.notes || ''} onChange={(e) => update('notes', e.target.value)} />

          <div className="am-meta">
            <div>
              <strong>Organization:</strong>{' '}
              <select
                className="am-input"
                style={{ width: 200 }}
                value={values.organization || ''}
                onChange={(e) => update('organization', e.target.value)}
                disabled={organizationsLoading}
              >
                <option value="">Select organization</option>
                {organizationsLoading ? (
                  <option value="" disabled>
                    Loading organizations…
                  </option>
                ) : organizations.length === 0 ? (
                  <option value="" disabled>
                    {organizationsError ?? 'No organizations available'}
                  </option>
                ) : (
                  organizations.map((organization) => (
                    <option key={organization.id} value={organization.label}>
                      {organization.label}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        <div className="am-footer">
          <button className="am-btn" onClick={onClose}>Cancel</button>
          <button className="am-btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

