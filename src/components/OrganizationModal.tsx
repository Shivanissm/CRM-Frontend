import { FormEvent, useEffect, useMemo, useState } from 'react';
import type {
  Organization,
  OrganizationOwner,
  OrganizationRequest,
  OrganizationCategory,
} from '../types/organization';
import './OrganizationModal.css';

interface OrganizationModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  organization?: Organization | null;
  onClose: () => void;
  onSubmit: (payload: OrganizationRequest) => Promise<void>;
  owners: OrganizationOwner[];
  categories: OrganizationCategory[];
}

export default function OrganizationModal({
  isOpen,
  mode,
  organization,
  onClose,
  onSubmit,
  owners,
  categories,
}: OrganizationModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [ownerId, setOwnerId] = useState<string>('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerOptions = useMemo(() => owners ?? [], [owners]);
  const categoryOptions = useMemo(() => categories ?? [], [categories]);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setCategory('');
      setOwnerId('');
      setAddress('');
      setSaving(false);
      setError(null);
      return;
    }
    if (mode === 'edit' && organization) {
      setName(organization.name ?? '');
      setCategory(organization.category ?? '');
      setOwnerId(organization.owner?.id ? String(organization.owner.id) : '');
      setAddress(organization.address ?? '');
    } else {
      setName('');
      setCategory('');
      setOwnerId('');
      setAddress('');
    }
    setError(null);
  }, [isOpen, mode, organization]);

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Organization name is required.');
      return;
    }
    if (trimmed.length > 255) {
      setError('Organization name must be 255 characters or fewer.');
      return;
    }
    const trimmedAddress = address.trim();
    if (trimmedAddress.length > 500) {
      setError('Address must be 500 characters or fewer.');
      return;
    }
    if (!category) {
      setError('Category is required.');
      return;
    }

    const ownerIdValue = ownerId ? Number(ownerId) : undefined;
    if (ownerIdValue !== undefined && (Number.isNaN(ownerIdValue) || ownerIdValue <= 0)) {
      setError('Owner must be a valid user.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: OrganizationRequest = {
        name: trimmed,
        category,
        ownerId: ownerIdValue,
        address: trimmedAddress || undefined,
      };
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to save organization.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="organization-modal-overlay" onClick={onClose}>
      <div className="organization-modal" onClick={(event) => event.stopPropagation()}>
        <header className="organization-modal-header">
          <h2>{mode === 'create' ? 'Create organization' : 'Edit organization'}</h2>
          <button className="organization-modal-close" onClick={onClose} aria-label="Close organization modal">×</button>
        </header>
        <p className="organization-modal-subtitle">
          {mode === 'create'
            ? 'Add a new organization that can be assigned across pipelines, persons, and deals.'
            : 'Update the organization name.'}
        </p>
        <form className="organization-modal-form" onSubmit={handleSubmit}>
          <label className="organization-modal-label">
            Organization name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Brideside Chicago"
              className="organization-modal-input"
              maxLength={255}
              required
            />
          </label>

          <label className="organization-modal-label">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="organization-modal-input"
              required
              disabled={categoryOptions.length === 0}
            >
              <option value="">Select category</option>
              {categoryOptions.length === 0 ? (
                <option value="" disabled>
                  No categories available
                </option>
              ) : (
                categoryOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label ?? option.code}
                  </option>
                ))
              )}
            </select>
            {categoryOptions.length === 0 && (
              <span className="organization-modal-hint">
                Categories are loading. Close and reopen once data is available.
              </span>
            )}
          </label>

          <label className="organization-modal-label">
            Owner (optional)
            <select
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
              className="organization-modal-input"
            >
              <option value="">No owner</option>
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.displayName ?? ((`${owner.firstName ?? ''} ${owner.lastName ?? ''}`).trim() || owner.email)}
                </option>
              ))}
            </select>
            <span className="organization-modal-hint">Only SALES or CATEGORY_MANAGER roles are available.</span>
          </label>

          <label className="organization-modal-label">
            Address (optional)
            <textarea
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="123 Lake Shore Dr, Chicago, IL"
              className="organization-modal-textarea"
              rows={3}
              maxLength={500}
            />
          </label>

          {error && <div className="organization-modal-error">{error}</div>}

          <div className="organization-modal-actions">
            <button type="button" className="organization-modal-cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="organization-modal-submit" disabled={saving}>
              {saving ? 'Saving…' : mode === 'create' ? 'Create organization' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


