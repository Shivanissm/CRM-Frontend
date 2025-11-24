import { useState } from 'react';
import { createPortal } from 'react-dom';
import './MarkAsLostModal.css';

interface MarkAsLostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (lostReason: string) => Promise<void>;
  dealName?: string;
}

const LOST_REASONS = [
  'Slot not opened',
  'Not Interested',
  'Date postponed',
  'Not Available',
  'Ghosted',
  'Budget',
  'Booked Someone else',
] as const;

export default function MarkAsLostModal({
  isOpen,
  onClose,
  onConfirm,
  dealName,
}: MarkAsLostModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!selectedReason) {
      setError('Please select a reason');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onConfirm(selectedReason);
      // Reset state on success
      setSelectedReason('');
      onClose();
    } catch (err: any) {
      console.error('Failed to mark deal as lost:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to mark deal as lost. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return;
    setSelectedReason('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="mark-as-lost-overlay" onClick={handleClose}>
      <div className="mark-as-lost-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mark-as-lost-header">
          <h2>Mark Deal as Lost</h2>
          <button className="mark-as-lost-close" onClick={handleClose} aria-label="Close" disabled={saving}>
            ×
          </button>
        </div>

        <div className="mark-as-lost-content">
          {dealName && (
            <p className="mark-as-lost-deal-name">Deal: {dealName}</p>
          )}
          <p className="mark-as-lost-description">
            Please select a reason for marking this deal as lost:
          </p>

          <div className="mark-as-lost-reasons">
            {LOST_REASONS.map((reason) => (
              <label 
                key={reason} 
                className={`mark-as-lost-reason-item ${selectedReason === reason ? 'mark-as-lost-reason-item-selected' : ''} ${saving ? 'mark-as-lost-reason-item-disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="lostReason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={(e) => {
                    setSelectedReason(e.target.value);
                    setError(null);
                  }}
                  disabled={saving}
                />
                <span className="mark-as-lost-reason-label">{reason}</span>
              </label>
            ))}
          </div>

          {error && <div className="mark-as-lost-error">{error}</div>}
        </div>

        <div className="mark-as-lost-actions">
          <button
            type="button"
            className="mark-as-lost-btn-cancel"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="mark-as-lost-btn-confirm"
            onClick={handleSubmit}
            disabled={saving || !selectedReason}
          >
            {saving ? 'Marking...' : 'Mark as Lost'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

