import { useEffect, useMemo, useState } from 'react';
import type { Person, PersonOwner, PersonLabelOption, PersonSourceOption, PersonRequest, FilterMeta } from '../types/person';
import { personsApi } from '../services/api';
import { organizationsApi } from '../services/organizations';
import type { Organization } from '../types/organization';
import { getStoredUser } from '../utils/authToken';
import './AddPersonModal.css';

interface AddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode?: 'create' | 'edit';
  person?: Person | null;
  filterMeta?: FilterMeta | null;
}

type PersonFormState = {
  name: string;
  organizationId: string;
  phone: string;
  email: string;
  instagramId: string;
  label: string;
  source: string;
  ownerId: string;
  leadDate: string;
};

const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

export default function AddPersonModal({
  isOpen,
  onClose,
  onSuccess,
  mode = 'create',
  person,
}: AddPersonModalProps) {
  const storedUser = useMemo(() => getStoredUser(), []);

  const [form, setForm] = useState<PersonFormState>({
    name: '',
    organizationId: '',
    phone: '',
    email: '',
    instagramId: '',
    label: '',
    source: '',
    ownerId: '',
    leadDate: todayIsoDate(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [owners, setOwners] = useState<PersonOwner[]>([]);
  const [labels, setLabels] = useState<PersonLabelOption[]>([]);
  const [sources, setSources] = useState<PersonSourceOption[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const loadOptions = async () => {
      try {
        const [orgs, ownerOptions, labelOptions, sourceOptions] = await Promise.all([
          organizationsApi.list(),
          personsApi.listOwners(),
          personsApi.listLabels(),
          personsApi.listSources(),
        ]);
        setOrganizations(orgs);
        setOwners(ownerOptions);
        setLabels(labelOptions);
        setSources(sourceOptions);
      } catch (err) {
        console.error('Failed to load person dropdown data', err);
      }
    };

    void loadOptions();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setForm({
      name: person?.name || '',
      organizationId: person?.organizationId ? String(person.organizationId) : '',
      phone: person?.phone || '',
      email: person?.email || '',
      instagramId: person?.instagramId || '',
      label: person?.label || '',
      source: person?.source || '',
      ownerId: person?.ownerId ? String(person.ownerId) : '',
      leadDate: person?.leadDate || todayIsoDate(),
    });
    setError(null);
    setSaving(false);
  }, [isOpen, person]);

  useEffect(() => {
    if (!isOpen || !!form.ownerId || !storedUser?.email) return;
    const defaultOwner = owners.find((owner) => owner.email === storedUser.email);
    if (defaultOwner) {
      setForm((prev) => ({ ...prev, ownerId: String(defaultOwner.id) }));
    }
  }, [isOpen, owners, storedUser, form.ownerId]);

  const handleChange = (field: keyof PersonFormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      const payload: PersonRequest = {
        name: form.name.trim(),
        organizationId: form.organizationId ? Number(form.organizationId) : undefined,
        ownerId: form.ownerId ? Number(form.ownerId) : undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        instagramId: form.instagramId.trim() || undefined,
        leadDate: form.leadDate || undefined,
        // Convert empty strings to undefined for enum fields - backend expects null/undefined, not empty string
        label: form.label && form.label.trim() ? form.label.trim() : undefined,
        source: form.source && form.source.trim() ? form.source.trim() : undefined,
      };

      if (mode === 'edit' && person?.id != null) {
        await personsApi.update(person.id, payload);
      } else {
        await personsApi.create(payload);
      }

      onClose();
      onSuccess();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to save person.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const ownerOptions = owners;

  if (!isOpen) return null;

  return (
    <div className="person-modal-overlay" onClick={onClose}>
      <div className="person-modal" onClick={event => event.stopPropagation()}>
        <header className="person-modal-header">
          <h2>{mode === 'edit' ? 'Edit person' : 'Add person'}</h2>
          <button className="person-modal-close" onClick={onClose} aria-label="Close person modal">
            ×
            </button>
        </header>

        <form className="person-form" onSubmit={handleSubmit}>
          <div className="person-field">
            <label htmlFor="person-name">Name</label>
                    <input
              id="person-name"
                      type="text"
              value={form.name}
              onChange={(event) => handleChange('name', event.target.value)}
              required
            />
            </div>

          <div className="person-field">
            <label htmlFor="person-organization">Organization</label>
                      <select
              id="person-organization"
              value={form.organizationId}
              onChange={(event) => handleChange('organizationId', event.target.value)}
            >
              <option value="">Select organization…</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>

          <div className="person-field-group">
            <div className="person-field">
              <label htmlFor="person-phone">Phone</label>
                      <input
                id="person-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => handleChange('phone', event.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
                      </div>
            <div className="person-field">
              <label htmlFor="person-email">Email</label>
                      <input
                id="person-email"
                type="email"
                value={form.email}
                onChange={(event) => handleChange('email', event.target.value)}
                placeholder="name@example.com"
              />
                      </div>
            </div>

          <div className="person-field-group">
            <div className="person-field">
              <label htmlFor="person-owner">Owner</label>
                <select
                id="person-owner"
                value={form.ownerId}
                onChange={(event) => handleChange('ownerId', event.target.value)}
              >
                <option value="">Select owner…</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id ?? owner.email} value={owner.id ?? ''}>{owner.displayName || owner.email}</option>
                    ))}
                  </select>
            </div>
            <div className="person-field">
              <label htmlFor="person-instagram">Instagram ID</label>
                  <input
                id="person-instagram"
                type="text"
                value={form.instagramId}
                onChange={(event) => handleChange('instagramId', event.target.value)}
                placeholder="@username"
                  />
                </div>
                </div>

          <div className="person-field-group">
            <div className="person-field">
              <label htmlFor="person-label">Labels</label>
                  <select
                id="person-label"
                value={form.label}
                onChange={(event) => handleChange('label', event.target.value)}
              >
                <option value="">Select label…</option>
                {labels.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                    ))}
                  </select>
                </div>
            <div className="person-field">
              <label htmlFor="person-source">Person Source</label>
                  <select
                id="person-source"
                value={form.source}
                onChange={(event) => handleChange('source', event.target.value)}
              >
                <option value="">Select source…</option>
                {sources.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                    ))}
                  </select>
                </div>
                </div>

          <div className="person-field">
            <label htmlFor="person-lead-date">Lead Date</label>
                  <input
              id="person-lead-date"
              type="date"
              value={form.leadDate}
              onChange={(event) => handleChange('leadDate', event.target.value)}
                  />
                </div>

          {error && <div className="person-error">{error}</div>}

          <footer className="person-modal-footer">
            <button type="button" className="person-cancel" onClick={onClose} disabled={saving}>
                  Cancel
                </button>
            <button type="submit" className="person-save" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
                </button>
          </footer>
        </form>
              </div>
    </div>
  );
}

