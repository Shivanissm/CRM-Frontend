import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Person, PersonOwner, PersonLabelOption, PersonRequest, FilterMeta, PersonCategory } from '../types/person';
import { personsApi } from '../services/api';
import { organizationsApi } from '../services/organizations';
import { dealsApi } from '../services/deals';
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
  initialName?: string; // Pre-fill name when creating from deal form
}

type PersonFormState = {
  name: string;
  organizationId: string;
  phone: string;
  email: string;
  instagramId: string;
  label: string;
  category: string;
  source: string;
  subSource: string;
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
  initialName,
}: AddPersonModalProps) {
  const storedUser = useMemo(() => getStoredUser(), []);

  const [form, setForm] = useState<PersonFormState>({
    name: '',
    organizationId: '',
    phone: '',
    email: '',
    instagramId: '',
    label: '',
    category: '',
    source: '',
    subSource: '',
    ownerId: '',
    leadDate: todayIsoDate(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessConfirmation, setShowSuccessConfirmation] = useState<boolean>(false);
  const [createdPersonName, setCreatedPersonName] = useState<string>('');

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [owners, setOwners] = useState<PersonOwner[]>([]);
  const [labels, setLabels] = useState<PersonLabelOption[]>([]);
  const [categories, setCategories] = useState<PersonCategory[]>([]);
  const [sources, setSources] = useState<Array<{ code: string; label: string }>>([]);
  const [subSources, setSubSources] = useState<Array<{ code: string; label: string }>>([]);

  useEffect(() => {
    if (!isOpen) return;

    const loadOptions = async () => {
      try {
        const [orgs, ownerOptions, labelOptions, categoryOptions, sourceOptions, subSourceOptions] = await Promise.all([
          organizationsApi.list(),
          personsApi.listOwners(),
          personsApi.listLabels(),
          personsApi.listCategories().catch((err) => {
            console.error('Failed to load categories from API:', err);
            return [];
          }),
          dealsApi.listSources().catch((err) => {
            console.error('Failed to load deal sources from API, using fallback:', err);
            // Fallback to hardcoded deal sources if API fails
            return [
              { code: 'Direct', label: 'Direct' },
              { code: 'Divert', label: 'Divert' },
              { code: 'Reference', label: 'Reference' },
              { code: 'Planner', label: 'Planner' },
            ];
          }),
          dealsApi.listSubSources().catch((err) => {
            console.error('Failed to load deal sub sources from API, using fallback:', err);
            // Fallback to hardcoded deal sub sources if API fails
            return [
              { code: 'Instagram', label: 'Instagram' },
              { code: 'Whatsapp', label: 'Whatsapp' },
              { code: 'Landing Page', label: 'Landing Page' },
              { code: 'Email', label: 'Email' },
            ];
          }),
        ]);
        setOrganizations(orgs);
        setOwners(ownerOptions);
        setLabels(labelOptions);
        // Show all categories from backend
        setCategories(categoryOptions);
        setSources(sourceOptions);
        setSubSources(subSourceOptions);
        console.log('Loaded deal sources:', sourceOptions);
        console.log('Loaded deal sub sources:', subSourceOptions);
      } catch (err) {
        console.error('Failed to load person dropdown data', err);
      }
    };

    void loadOptions();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setShowSuccessConfirmation(false);
      setCreatedPersonName('');
      return;
    }

    setForm({
      name: person?.name || initialName || '',
      organizationId: person?.organizationId ? String(person.organizationId) : '',
      phone: person?.phone || '',
      email: person?.email || '',
      instagramId: person?.instagramId || '',
      label: person?.label || '',
      category: person?.categoryId ? String(person.categoryId) : '',
      source: person?.source || '',
      subSource: (person as any)?.subSource || '',
      ownerId: person?.ownerId ? String(person.ownerId) : '',
      leadDate: person?.leadDate || todayIsoDate(),
    });
    setError(null);
    setSaving(false);
  }, [isOpen, person, initialName]);

  // Auto-select owner when organization is selected
  useEffect(() => {
    if (!isOpen || !form.organizationId || !organizations.length) return;
    
    const selectedOrg = organizations.find(org => org.id === Number(form.organizationId));
    if (selectedOrg?.owner?.id) {
      const ownerId = selectedOrg.owner.id;
      // Check if the owner exists in the owners list
      const ownerExists = owners.some(owner => owner.id === ownerId);
      if (ownerExists) {
        setForm((prev) => ({ ...prev, ownerId: String(ownerId) }));
      }
    }
  }, [isOpen, form.organizationId, organizations, owners]);

  // Auto-select category when organization is selected
  useEffect(() => {
    if (!isOpen || !form.organizationId || !organizations.length || !categories.length) return;
    // Only auto-select if category is not already set (to avoid overwriting user selection)
    if (form.category) return;
    
    const selectedOrg = organizations.find(org => org.id === Number(form.organizationId));
    if (selectedOrg?.category) {
      // Find matching category by name (case-insensitive)
      const matchingCategory = categories.find(cat => 
        cat.name?.toLowerCase().trim() === selectedOrg.category?.toLowerCase().trim()
      );
      if (matchingCategory) {
        setForm((prev) => ({ ...prev, category: String(matchingCategory.id) }));
      }
    }
  }, [isOpen, form.organizationId, form.category, organizations, categories]);

  // Auto-select default owner (logged-in user) if no owner is set and no organization is selected
  useEffect(() => {
    if (!isOpen || !!form.ownerId || !storedUser?.email || form.organizationId) return;
    const defaultOwner = owners.find((owner) => owner.email === storedUser.email);
    if (defaultOwner) {
      setForm((prev) => ({ ...prev, ownerId: String(defaultOwner.id) }));
    }
  }, [isOpen, owners, storedUser, form.ownerId, form.organizationId]);

  const handleChange = (field: keyof PersonFormState, value: string) => {
    setForm(prev => {
      // If source is changing and it's not "Direct", clear subSource
      if (field === 'source' && value !== 'Direct') {
        return { ...prev, [field]: value, subSource: '' };
      }
      // If organization is changing, clear category to allow auto-selection
      if (field === 'organizationId') {
        return { ...prev, [field]: value, category: '' };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!form.source || !form.source.trim()) {
      setError('Source is required.');
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
        categoryId: form.category && form.category.trim() ? Number(form.category) : undefined,
        source: form.source && form.source.trim() ? form.source.trim() : undefined,
        subSource: form.subSource && form.subSource.trim() ? form.subSource.trim() : undefined,
      };

      if (mode === 'edit' && person?.id != null) {
        await personsApi.update(person.id, payload);
        onClose();
        onSuccess();
      } else {
        const createdPerson = await personsApi.create(payload);
        // Show success confirmation for new person creation
        setCreatedPersonName(createdPerson.name);
        setShowSuccessConfirmation(true);
        // Don't close modal yet, wait for user to close the success confirmation
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to save person.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const ownerOptions = owners;

  if (!isOpen) return null;

  return createPortal(
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
              <label htmlFor="person-category">Category</label>
                  <select
                id="person-category"
                value={form.category}
                onChange={(event) => handleChange('category', event.target.value)}
              >
                <option value="">Select category…</option>
                {categories.map((option) => (
                  <option key={option.id} value={String(option.id)}>{option.name}</option>
                    ))}
                  </select>
                </div>
            <div className="person-field">
              <label htmlFor="person-source">Person Source <span style={{ color: 'red' }}>*</span></label>
                  <select
                id="person-source"
                value={form.source}
                onChange={(event) => handleChange('source', event.target.value)}
                required
              >
                <option value="">Select source…</option>
                {sources.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                    ))}
                  </select>
                </div>
            {form.source === 'Direct' && (
              <div className="person-field">
                <label htmlFor="person-sub-source">Person Sub Source</label>
                    <select
                  id="person-sub-source"
                  value={form.subSource}
                  onChange={(event) => handleChange('subSource', event.target.value)}
                >
                  <option value="">Select sub source…</option>
                  {subSources.map((option) => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                      ))}
                    </select>
                  </div>
            )}
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

      {/* Success Confirmation Modal */}
      {showSuccessConfirmation && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="success-confirmation-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100001,
            animation: 'fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            padding: '20px'
          }}
          onClick={() => {
            setShowSuccessConfirmation(false);
            onClose();
            onSuccess();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setShowSuccessConfirmation(false);
              onClose();
              onSuccess();
            }
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              width: '100%',
              maxWidth: '480px',
              overflow: 'hidden',
              animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #C94D78 0%, #B52F58 100%)',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.2)',
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
                  Person Created Successfully!
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowSuccessConfirmation(false);
                  onClose();
                  onSuccess();
                }}
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
                Person <strong>"{createdPersonName}"</strong> has been created successfully!
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
                onClick={() => {
                  setShowSuccessConfirmation(false);
                  onClose();
                  onSuccess();
                }}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#ffffff',
                  backgroundColor: '#C94D78',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#B52F58'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C94D78'}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  );
}

