import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './DealValueModal.css';

interface DealValueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dealValue: number) => Promise<void>;
  dealName?: string;
  currentValue?: number;
}

export default function DealValueModal({
  isOpen,
  onClose,
  onConfirm,
  dealName,
  currentValue,
}: DealValueModalProps) {
  const [dealValue, setDealValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Set initial value if provided
      setDealValue(currentValue && currentValue > 0 ? currentValue.toString() : '');
      setError(null);
      // Focus input after modal opens
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, currentValue]);

  const handleSubmit = async () => {
    const trimmedValue = dealValue.trim();
    
    if (!trimmedValue) {
      setError('Please enter a deal value');
      return;
    }

    const numericValue = Number(trimmedValue);
    
    if (isNaN(numericValue)) {
      setError('Please enter a valid number');
      return;
    }

    if (numericValue <= 0) {
      setError('Deal value must be greater than 0');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onConfirm(numericValue);
      // Reset state on success
      setDealValue('');
      onClose();
    } catch (err: any) {
      console.error('Failed to update deal value:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to update deal value. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return;
    setDealValue('');
    setError(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !saving) {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="deal-value-overlay" onClick={handleClose}>
      <div className="deal-value-modal" onClick={(e) => e.stopPropagation()}>
        <div className="deal-value-header">
          <h2>Enter Deal Value</h2>
          <button 
            className="deal-value-close" 
            onClick={handleClose} 
            aria-label="Close" 
            disabled={saving}
          >
            ×
          </button>
        </div>

        <div className="deal-value-content">
          {dealName && (
            <p className="deal-value-deal-name">Deal: {dealName}</p>
          )}
          <p className="deal-value-description">
            Please enter the deal value to mark this deal as WON:
          </p>

          <div className="deal-value-input-group">
            <label htmlFor="deal-value-input" className="deal-value-label">
              Deal Value (₹)
            </label>
            <input
              ref={inputRef}
              id="deal-value-input"
              type="number"
              className="deal-value-input"
              value={dealValue}
              onChange={(e) => {
                setDealValue(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Enter amount"
              min="0"
              step="0.01"
              disabled={saving}
              autoFocus
            />
            {error && (
              <p className="deal-value-error">{error}</p>
            )}
          </div>
        </div>

        <div className="deal-value-footer">
          <button
            className="deal-value-cancel"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="deal-value-submit"
            onClick={handleSubmit}
            disabled={saving || !dealValue.trim()}
          >
            {saving ? 'Saving...' : 'Save & Mark as WON'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

