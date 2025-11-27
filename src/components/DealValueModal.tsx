import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './DealValueModal.css';
import type { DealSource, DealSubSource } from '../types/deal';

// Source and Sub-Source constants
const DEAL_SOURCE_OPTIONS: Array<{ value: DealSource; label: string }> = [
  { value: 'Direct', label: 'Direct' },
  { value: 'Divert', label: 'Divert' },
  { value: 'Reference', label: 'Reference' },
  { value: 'Planner', label: 'Planner' },
];

const DEAL_SUB_SOURCE_OPTIONS: Array<{ value: DealSubSource; label: string }> = [
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Whatsapp', label: 'Whatsapp' },
  { value: 'Landing Page', label: 'Landing Page' },
  { value: 'Email', label: 'Email' },
];

// Format number in Indian format (thousands, lakhs, crores)
const formatIndianCurrency = (value: number | string): string => {
  if (value === '' || value === null || value === undefined) return '';
  const numValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(numValue)) return '';
  
  // Use Indian locale for proper formatting
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(numValue);
};

// Parse formatted Indian currency string to number
const parseIndianCurrency = (value: string): string => {
  // Remove all commas and return the numeric string
  return value.replace(/,/g, '');
};

interface DealValueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dealValue: number, commissionAmount?: number, source?: DealSource, subSource?: DealSubSource) => Promise<void>;
  dealName?: string;
  currentValue?: number;
  currentCommission?: number | null;
  dealSource?: DealSource | null;
  dealSubSource?: DealSubSource | null;
}

export default function DealValueModal({
  isOpen,
  onClose,
  onConfirm,
  dealName,
  currentValue,
  currentCommission,
  dealSource,
  dealSubSource,
}: DealValueModalProps) {
  const [dealValue, setDealValue] = useState<string>('');
  const [commissionAmount, setCommissionAmount] = useState<string>('');
  const [dealValueDisplay, setDealValueDisplay] = useState<string>('');
  const [commissionDisplay, setCommissionDisplay] = useState<string>('');
  const [dealValueFocused, setDealValueFocused] = useState<boolean>(false);
  const [commissionFocused, setCommissionFocused] = useState<boolean>(false);
  const [source, setSource] = useState<DealSource | ''>('');
  const [subSource, setSubSource] = useState<DealSubSource | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCommissionManuallyEdited, setIsCommissionManuallyEdited] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Calculate commission based on source when deal value or source changes
  // Only auto-calculate if commission has not been manually edited
  useEffect(() => {
    // Skip auto-calculation if user is currently editing the commission field
    if (commissionFocused) {
      return;
    }
    
    // Skip auto-calculation if user has manually edited the commission
    if (isCommissionManuallyEdited) {
      return;
    }
    
    if (isOpen && dealValue && !isNaN(parseFloat(parseIndianCurrency(dealValue)))) {
      const value = parseFloat(parseIndianCurrency(dealValue));
      if (value > 0) {
        // Determine commission rate based on source (use current source state, fallback to prop)
        const currentSource = source || dealSource;
        
        // Only auto-calculate if source is set
        if (currentSource) {
          let commissionRate = 0.10; // Default 10% for Direct, Reference, Planner
          if (currentSource === 'Divert') {
            commissionRate = 0.15; // 15% for Divert
          }
          
          // Calculate the actual commission amount (not percentage)
          // e.g., if deal value is 100000 and rate is 0.10, commission = 10000 (not 10)
          const calculatedCommission = value * commissionRate;
          const commissionStr = calculatedCommission.toFixed(2);
          
          // Auto-update the commission amount
          setCommissionAmount(commissionStr);
          setCommissionDisplay(formatIndianCurrency(commissionStr));
        } else {
          // If no source is selected, clear commission
          setCommissionAmount('');
          setCommissionDisplay('');
        }
      } else {
        setCommissionAmount('');
        setCommissionDisplay('');
      }
    } else if (isOpen && (!dealValue || dealValue.trim() === '')) {
      // If deal value is empty, clear commission
      setCommissionAmount('');
      setCommissionDisplay('');
    }
  }, [dealValue, source, dealSource, isOpen, commissionFocused, isCommissionManuallyEdited]);

  useEffect(() => {
    if (isOpen) {
      // Set initial value if provided
      const initialValue = currentValue && currentValue > 0 ? currentValue.toString() : '';
      setDealValue(initialValue);
      setDealValueDisplay(formatIndianCurrency(initialValue));
      
      // Set initial source and subSource
      setSource(dealSource || '');
      setSubSource(dealSubSource || '');
      
      // Reset the manual edit flag on modal open - allow auto-calculation to work
      // The commission will be auto-calculated by the other useEffect if deal value and source are available
      setIsCommissionManuallyEdited(false);
      
      // Set initial commission if provided, but allow it to be recalculated if source/value changes
      if (currentCommission && currentCommission > 0) {
        const commissionStr = currentCommission.toString();
        setCommissionAmount(commissionStr);
        setCommissionDisplay(formatIndianCurrency(commissionStr));
      } else {
        setCommissionAmount('');
        setCommissionDisplay('');
      }
      setError(null);
      setDealValueFocused(false);
      setCommissionFocused(false);
      // Focus input after modal opens
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    } else {
      // Reset when modal closes
      setIsCommissionManuallyEdited(false);
    }
  }, [isOpen, currentValue, currentCommission, dealSource, dealSubSource]);

  const handleSubmit = async () => {
    const trimmedValue = parseIndianCurrency(dealValue.trim());
    
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

    // Parse commission amount if provided
    // IMPORTANT: Ensure we're sending the actual amount value (e.g., 10000), NOT the percentage (e.g., 10)
    // The commissionAmount state should contain the actual currency amount, not the percentage
    const trimmedCommission = parseIndianCurrency(commissionAmount.trim());
    let parsedCommission: number | undefined = undefined;
    
    if (trimmedCommission && trimmedCommission !== '') {
      const commissionNum = Number(trimmedCommission);
      if (!isNaN(commissionNum) && commissionNum >= 0) {
        // The commission should be the actual rupee/currency amount, not a percentage
        // For example: if deal value is 100,000 and commission rate is 10%, the commission amount should be 10,000
        // We're sending the actual calculated/edited amount, not the percentage rate
        parsedCommission = commissionNum;
        
        // Validation: If the commission seems suspiciously small (like a percentage), warn the user
        // But don't block submission - let the backend handle validation
        const currentSource = source || dealSource;
        if (currentSource && commissionNum > 0 && commissionNum < numericValue * 0.01) {
          // Commission is less than 1% of deal value - might be a mistake, but allow it
          console.warn('Commission amount seems unusually low compared to deal value');
        }
      }
    }

    // Get source and subSource (only include subSource if source is Direct)
    const finalSource = source || undefined;
    const finalSubSource = (source === 'Direct' && subSource) ? subSource : undefined;

    setSaving(true);
    setError(null);

    try {
      await onConfirm(numericValue, parsedCommission, finalSource as DealSource | undefined, finalSubSource);
      // Reset state on success
      setDealValue('');
      setCommissionAmount('');
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
    setCommissionAmount('');
    setDealValueDisplay('');
    setCommissionDisplay('');
    setSource('');
    setSubSource('');
    setIsCommissionManuallyEdited(false);
    setError(null);
    onClose();
  };

  const handleSourceChange = (newSource: DealSource | '') => {
    setSource(newSource);
    // Clear subSource if source is not Direct
    if (newSource !== 'Direct') {
      setSubSource('');
    }
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
          <h2>Mark Deal as WON</h2>
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
            {currentValue && currentValue > 0 
              ? 'Please review and update the deal value, commission, and source to mark this deal as WON:'
              : 'Please enter the deal value, commission, and source to mark this deal as WON:'}
          </p>

          <div className="deal-value-input-group">
            <label htmlFor="source-input" className="deal-value-label">
              Deal Source
            </label>
            <select
              id="source-input"
              className="deal-value-input"
              value={source}
              onChange={(e) => handleSourceChange(e.target.value as DealSource | '')}
              disabled={saving}
            >
              <option value="">Select Source</option>
              {DEAL_SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {source === 'Direct' && (
            <div className="deal-value-input-group">
              <label htmlFor="sub-source-input" className="deal-value-label">
                Sub-Source
              </label>
              <select
                id="sub-source-input"
                className="deal-value-input"
                value={subSource}
                onChange={(e) => setSubSource(e.target.value as DealSubSource | '')}
                disabled={saving}
              >
                <option value="">Select Sub-Source (Optional)</option>
                {DEAL_SUB_SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="deal-value-input-group">
            <label htmlFor="deal-value-input" className="deal-value-label">
              Deal Value (₹) *
            </label>
            <input
              ref={inputRef}
              id="deal-value-input"
              type="text"
              className="deal-value-input"
              value={dealValueFocused ? dealValue : dealValueDisplay}
              onChange={(e) => {
                const rawValue = parseIndianCurrency(e.target.value);
                setDealValue(rawValue);
                if (!dealValueFocused) {
                  setDealValueDisplay(formatIndianCurrency(rawValue));
                }
                setError(null);
              }}
              onFocus={() => {
                setDealValueFocused(true);
                setDealValueDisplay(dealValue);
              }}
              onBlur={() => {
                setDealValueFocused(false);
                setDealValueDisplay(formatIndianCurrency(dealValue));
              }}
              onKeyDown={handleKeyDown}
              placeholder="Enter amount"
              disabled={saving}
              autoFocus
            />
            {error && (
              <p className="deal-value-error">{error}</p>
            )}
          </div>

          <div className="deal-value-input-group">
            <label htmlFor="commission-input" className="deal-value-label">
              Commission Amount (₹)
            </label>
            <input
              id="commission-input"
              type="text"
              className="deal-value-input"
              value={commissionFocused ? commissionAmount : commissionDisplay}
              onChange={(e) => {
                const rawValue = parseIndianCurrency(e.target.value);
                setCommissionAmount(rawValue);
                setIsCommissionManuallyEdited(true); // Mark as manually edited when user types
                if (!commissionFocused) {
                  setCommissionDisplay(formatIndianCurrency(rawValue));
                }
                setError(null);
              }}
              onFocus={() => {
                setCommissionFocused(true);
                setCommissionDisplay(commissionAmount);
              }}
              onBlur={() => {
                setCommissionFocused(false);
                setCommissionDisplay(formatIndianCurrency(commissionAmount));
              }}
              placeholder="Auto-calculated"
              disabled={saving}
            />
            {dealValue && !isNaN(parseFloat(parseIndianCurrency(dealValue))) && (
              <small style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                Default: {(source || dealSource) === 'Divert' ? '15%' : '10%'} of deal value (₹{formatIndianCurrency((parseFloat(parseIndianCurrency(dealValue)) * ((source || dealSource) === 'Divert' ? 0.15 : 0.10)).toFixed(2))})
              </small>
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

