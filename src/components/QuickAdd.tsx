import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import './QuickAdd.css';

interface QuickAddOption {
  type: 'person' | 'deal' | 'organization' | 'activity' | 'pipeline' | 'user';
  label: string;
  icon: string;
  shortcut?: string;
  route?: string;
  action?: () => void;
}

const quickAddOptions: QuickAddOption[] = [
  { type: 'person', label: 'Person', icon: '👤', shortcut: 'P' },
  { type: 'deal', label: 'Deal', icon: '💼', shortcut: 'D' },
  { type: 'organization', label: 'Organization', icon: '🏢', shortcut: 'O' },
  { type: 'activity', label: 'Activity', icon: '📅', shortcut: 'A' },
  { type: 'pipeline', label: 'Pipeline', icon: '🛤️', shortcut: 'L' },
  { type: 'user', label: 'User', icon: '🧑‍💼', shortcut: 'U' },
];

interface QuickAddProps {
  onAddPerson?: () => void;
  onAddDeal?: () => void;
  onAddOrganization?: () => void;
  onAddActivity?: () => void;
  onAddPipeline?: () => void;
  onAddUser?: () => void;
}

export default function QuickAdd({ 
  onAddPerson,
  onAddDeal,
  onAddOrganization,
  onAddActivity,
  onAddPipeline,
  onAddUser,
}: QuickAddProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev < quickAddOptions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : quickAddOptions.length - 1));
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault();
          handleSelectOption(quickAddOptions[selectedIndex]);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsOpen(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex]);

  const handleSelectOption = (option: QuickAddOption) => {
    setIsOpen(false);
    setSelectedIndex(0);

    switch (option.type) {
      case 'person':
        if (onAddPerson) {
          onAddPerson();
        } else {
          navigate('/persons');
        }
        break;
      case 'deal':
        if (onAddDeal) {
          onAddDeal();
        } else {
          navigate('/deals');
        }
        break;
      case 'organization':
        if (onAddOrganization) {
          onAddOrganization();
        } else {
          navigate('/organizations');
        }
        break;
      case 'activity':
        if (onAddActivity) {
          onAddActivity();
        } else {
          navigate('/activities');
        }
        break;
      case 'pipeline':
        if (onAddPipeline) {
          onAddPipeline();
        } else {
          navigate('/pipelines');
        }
        break;
      case 'user':
        if (onAddUser) {
          onAddUser();
        } else {
          navigate('/users');
        }
        break;
    }
  };

  return (
    <>
      <div className="quick-add-container">
        <button
          ref={buttonRef}
          className="quick-add-button-circle"
          onClick={() => setIsOpen(!isOpen)}
          title="Quick add"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        {isOpen && createPortal(
          <div
            ref={dropdownRef}
            className="quick-add-dropdown"
            style={{
              position: 'fixed',
              top: buttonRef.current ? buttonRef.current.getBoundingClientRect().bottom + 8 : 0,
              left: buttonRef.current ? buttonRef.current.getBoundingClientRect().left : 0,
            }}
          >
            <div className="quick-add-header">
              <span className="quick-add-title">Quick add</span>
            </div>
            <div className="quick-add-options">
              {quickAddOptions.map((option, index) => (
                <div
                  key={option.type}
                  className={`quick-add-option ${selectedIndex === index ? 'selected' : ''}`}
                  onClick={() => handleSelectOption(option)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="quick-add-option-icon">{option.icon}</div>
                  <span className="quick-add-option-label">{option.label}</span>
                  {option.shortcut && (
                    <span className="quick-add-option-shortcut">{option.shortcut}</span>
                  )}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>
    </>
  );
}

