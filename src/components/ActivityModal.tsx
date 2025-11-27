import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ActivityModal.css';
import { activitiesApi, type Activity } from '../services/activities';
import { dealsApi } from '../services/deals';
import { personsApi } from '../services/api';
import { organizationsApi } from '../services/organizations';
import type { Deal } from '../types/deal';
import type { Person } from '../types/person';
import type { Organization } from '../types/organization';
import type { User } from '../types/user';

const SERVICE_CATEGORY_OPTIONS = [
  { code: 'PHOTOGRAPHY', label: 'Photography' },
  { code: 'MAKEUP', label: 'Makeup' },
  { code: 'PLANNING_DECOR', label: 'Planning & Decor' },
];

export interface ActivityFormValues {
  subject: string;
  category?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  priority?: string;
  type?: string;
  assignedUser?: string;
  phone?: string;
  instagramId?: string;
  notes?: string;
  personName?: string;
  organization?: string;
  personId?: number;
  dealId?: number;
  dealName?: string;
  dueDate?: string;
  dateTime?: string;
  serviceCategory?: string;
}

type QuickSubjectOption = {
  key: string;
  label: string;
  type: string;
  icon: JSX.Element;
};

const QUICK_SUBJECT_OPTIONS: QuickSubjectOption[] = [
  { key: 'follow-up', label: 'Follow up', type: 'ACTIVITY', icon: (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="currentColor" d="M6 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1.447.894L12 18.118l5.553 2.776A1 1 0 0 0 19 20V4a1 1 0 0 0-1.447-.894L12 5.882 6.447 3.106A1 1 0 0 0 6 3Z"/></svg>
  )},
  { key: 'call', label: 'Call', type: 'CALL', icon: (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 .96-.26l3.2.8a1 1 0 0 1 .74.97V20a1 1 0 0 1-1 1C10.745 21 3 13.255 3 3a1 1 0 0 1 1-1h3.31a1 1 0 0 1 .97.74l.8 3.2a1 1 0 0 1-.26.96l-2.2 2.2Z"/></svg>
  )},
  { key: 'send-quote', label: 'Send Quote', type: 'ACTIVITY', icon: (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="currentColor" d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v14h12V5H6Zm2 3h8v2H8V8Zm0 4h8v2H8v-2Z"/></svg>
  )},
  { key: 'meeting', label: 'Meeting', type: 'MEETING', icon: (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="currentColor" d="M7 7a3 3 0 1 1 6 0v2a3 3 0 1 1-6 0V7Zm8 3a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm-2.5 3a4.5 4.5 0 0 1 4.5 4.5V19a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-1.5A4.5 4.5 0 0 1 12.5 13Zm4.2.023A5.5 5.5 0 0 1 22 18.5V19a1 1 0 0 1-1 1h-2v-1.5a6.5 6.5 0 0 0-3.279-5.477Z"/></svg>
  )},
  { key: 'contract', label: 'Contract Send', type: 'ACTIVITY', icon: (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="currentColor" d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 2H6v16h12V8h-4V4Zm-6 9h8v2H8v-2Zm0-4h8v2H8v-2Z"/></svg>
  )},
  { key: 'share-links', label: 'Share worklinks', type: 'ACTIVITY', icon: (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="currentColor" d="M14 7a3 3 0 0 1 5.995-.176L20 7v2a3 3 0 0 1-5.995.176L14 9V8h-2v8h2v-1a3 3 0 0 1 5.995-.176L20 15v2a3 3 0 0 1-5.995.176L14 17v-1h-4v1a3 3 0 0 1-5.995.176L4 17v-2a3 3 0 0 1 5.995-.176L10 15v1h4v-8h-4v1a3 3 0 0 1-5.995.176L4 9V7a3 3 0 0 1 5.995-.176L10 7v1h4V7Z"/></svg>
  )},
];

export default function ActivityModal({
  isOpen,
  onClose,
  onSave,
  initialOrganization,
  initialCategory = 'Activity',
  initialActivity,
  initialServiceCategory = 'PHOTOGRAPHY',
  userOptions = [],
  dealData,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: ActivityFormValues & { id?: number }) => Promise<void> | void;
  initialOrganization?: string;
  initialCategory?: 'Activity' | 'Call' | 'Meeting scheduler';
  initialActivity?: Activity | null;
  initialServiceCategory?: string;
  userOptions?: User[];
  dealData?: {
    dealName?: string;
    personName?: string;
    organization?: string;
    phone?: string;
    instagramId?: string;
    dealId?: number;
    personId?: number;
  };
}) {
  const [values, setValues] = useState<ActivityFormValues>({ subject: '' });
  const [_categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [dealOptions, setDealOptions] = useState<Deal[]>([]);
  const [personOptions, setPersonOptions] = useState<Person[]>([]);
  const [organizationLookup, setOrganizationLookup] = useState<Record<number, string>>({});
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filteredOrganizations, setFilteredOrganizations] = useState<Organization[]>([]);
  const [showOrgSuggestions, setShowOrgSuggestions] = useState(false);
  const [dealInput, setDealInput] = useState('');
  const [personInput, setPersonInput] = useState('');
  const [serviceCategory, setServiceCategory] = useState<string>(initialServiceCategory);
  const [showNotesInfo, setShowNotesInfo] = useState(false);
  const infoIconRef = useRef<HTMLButtonElement>(null);

  const getUserDisplayName = (user: User) => {
    const first = (user.firstName || '').trim();
    const last = (user.lastName || '').trim();
    const fullName = [first, last].filter(Boolean).join(' ');
    return fullName || user.email || `User ${user.id}`;
  };

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
    try {
      const data = await activitiesApi.listCategories();
      const normalized = (data ?? []).map((category) => ({
        id: category.code,
        label: category.label,
      }));
      console.debug('Loaded activity categories:', normalized);
      setCategories(normalized);
    } catch (err: any) {
      console.error('Failed to load categories:', err);
    } finally {
      setCategoryLoading(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const orgs = await organizationsApi.list();
      setOrganizations(orgs ?? []);
      setFilteredOrganizations(orgs ?? []);
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
      setOrganizations([]);
      setFilteredOrganizations([]);
    }
  };

  const deriveTypeFromCategory = (cat?: string) => {
    if (cat === 'Call') return 'CALL';
    if (cat === 'Meeting scheduler') return 'MEETING';
    return 'ACTIVITY';
  };

  const toInputDate = (value?: string | null) => {
    if (!value) return '';
    if (value.includes('/')) {
      const [d, m, y] = value.split('/');
      if (d && m && y) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return value;
  };

  const mapActivityTypeToCategory = (activityType?: string): string | undefined => {
    if (!activityType) return undefined;
    switch (activityType.toUpperCase()) {
      case 'CALL':
        return 'CALL';
      case 'MEETING':
      case 'MEETING_SCHEDULER':
        return 'MEETING_SCHEDULER';
      case 'FOLLOW_UP':
      case 'SEND_QUOTES':
      case 'TASK':
      case 'OTHER':
      case 'ACTIVITY':
      default:
        return 'ACTIVITY';
    }
  };

  useEffect(() => {
    if (isOpen) {
      const baseType = initialActivity?.type || deriveTypeFromCategory(initialCategory);
      const baseCategory =
        mapActivityTypeToCategory(initialActivity?.type || baseType) || 'ACTIVITY';
      
      // If dealData is provided (opened from deals), pre-fill with deal information
      const dealName = dealData?.dealName || initialActivity?.dealName || '';
      const personName = dealData?.personName || '';
      const organization = dealData?.organization || initialActivity?.organization || initialOrganization || '';
      const phone = dealData?.phone || initialActivity?.phone || undefined;
      const instagramId = dealData?.instagramId || initialActivity?.instagramId || undefined;
      const dealId = dealData?.dealId || initialActivity?.dealId || undefined;
      const personId = dealData?.personId || initialActivity?.personId || undefined;
      
      setValues({
        subject: initialActivity?.subject || '',
        organization: organization,
        type: baseType,
        category: baseCategory,
        date: toInputDate(initialActivity?.date),
        startTime: initialActivity?.startTime || undefined,
        endTime: initialActivity?.endTime || undefined,
        priority: initialActivity?.priority || undefined,
        assignedUser: initialActivity?.assignedUser || undefined,
        phone: phone,
        instagramId: instagramId,
        notes: initialActivity?.notes || undefined,
        personId: personId,
        dealId: dealId,
        dealName: dealName,
      });
      setDealInput(dealName);
      setPersonInput(personName);
      setServiceCategory(initialServiceCategory || 'PHOTOGRAPHY');
      void loadCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialOrganization, initialCategory, initialActivity, initialServiceCategory, personOptions, dealOptions, dealData]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadLinkedOptions = async () => {
      try {
        const [deals, personsResponse, organizations] = await Promise.all([
          dealsApi.list().catch(() => []),
          personsApi.list({ page: 0, size: 500 }).catch(() => ({ content: [] })),
          organizationsApi.list().catch(() => []),
        ]);
        if (cancelled) return;
        setDealOptions(deals ?? []);
        setPersonOptions(personsResponse?.content ?? []);
        const orgs = organizations ?? [];
        setOrganizations(orgs);
        setFilteredOrganizations(orgs);
        const lookup: Record<number, string> = {};
        orgs.forEach((org: Organization) => {
          if (org?.id) {
            lookup[org.id] = org.name;
          }
        });
        setOrganizationLookup(lookup);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load deal/person options for activities:', error);
        }
      }
    };
    loadLinkedOptions();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Close info popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (infoIconRef.current && !infoIconRef.current.contains(event.target as Node)) {
        setShowNotesInfo(false);
      }
    };

    if (showNotesInfo) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showNotesInfo]);

  if (!isOpen) return null;

  const toIsoDate = (dateStr?: string): string | undefined => {
    if (!dateStr) return undefined;
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    return dateStr;
  };

  const formatDateForBackend = (dateStr?: string): string | undefined => {
    if (!dateStr) return undefined;
    // Convert yyyy-MM-dd to dd/MM/yyyy for backend
    if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    return dateStr;
  };

  const handleDealInputChange = (value: string) => {
    const trimmed = value.trim();
    setDealInput(value);
    const matchingDeal = dealOptions.find(
      (d) => d.name?.toLowerCase() === trimmed.toLowerCase(),
    );
    setValues((prev) => {
      const next: ActivityFormValues = { ...prev };

      if (!trimmed) {
        next.dealId = undefined;
        next.dealName = undefined;
        next.personId = undefined;
        next.organization = '';
        next.phone = '';
        next.instagramId = '';
        setPersonInput('');
        return next;
      }

      if (!matchingDeal) {
        next.dealId = undefined;
        next.dealName = trimmed;
        next.personId = undefined;
        next.organization = '';
        next.phone = '';
        next.instagramId = '';
        setPersonInput('');
        return next;
      }

      if (matchingDeal.name) {
        setDealInput(matchingDeal.name);
      }

      next.dealId = matchingDeal.id || undefined;
      next.dealName = matchingDeal.name || trimmed;

      if (matchingDeal.personId) {
        next.personId = matchingDeal.personId;
        const relatedPerson = personOptions.find((p) => p.id === matchingDeal.personId);
        if (relatedPerson) {
          setPersonInput(relatedPerson.name || '');
          if (relatedPerson.organization || relatedPerson.organizationName) {
            next.organization = relatedPerson.organization || relatedPerson.organizationName || next.organization;
          }
          if (relatedPerson.phone) {
            next.phone = relatedPerson.phone;
          }
          if (relatedPerson.instagramId) {
            next.instagramId = relatedPerson.instagramId;
          }
        }
      } else {
        setPersonInput('');
        next.personId = undefined;
        next.phone = '';
        next.instagramId = '';
      }

      if (matchingDeal.organizationId) {
        const orgName = organizationLookup[matchingDeal.organizationId];
        if (orgName) {
          next.organization = orgName;
        }
      }

      return next;
    });
  };

  const handlePersonInputChange = (value: string) => {
    const trimmed = value.trim();
    setPersonInput(value);
    if (!trimmed) {
      setValues((prev) => ({ ...prev, personId: undefined, organization: '', phone: '', instagramId: '' }));
      return;
    }
    const person = personOptions.find(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (person?.name) {
      setPersonInput(person.name);
    }
    setValues((prev) => {
      const next: ActivityFormValues = { ...prev, personId: person?.id };
      if (person) {
        // If person found, set organization from person
        next.organization = person.organization || person.organizationName || '';
        next.phone = person.phone || next.phone;
        next.instagramId = person.instagramId || next.instagramId;
      } else {
        // If no person found, clear organization that was set from person
        next.organization = '';
        next.phone = '';
        next.instagramId = '';
      }
      return next;
    });
  };

  const handleSave = async () => {
    try {
      const isoDate = toIsoDate(values.date);
      const activityType = values.type || values.category;
      const parentCategory = mapActivityTypeToCategory(activityType);
      const formattedValues = {
        ...values,
        date: formatDateForBackend(values.date),
        dueDate: formatDateForBackend(values.date),
        dateTime: isoDate ? `${isoDate}T${values.startTime || '00:00'}:00` : undefined,
        // Convert priority to uppercase to match backend enum values
        priority: values.priority ? values.priority.toUpperCase() : undefined,
        type: activityType,
        category: parentCategory,
        serviceCategory,
        dealName: values.dealName?.trim() || undefined,
        phone: values.phone || undefined,
        instagramId: values.instagramId || undefined,
      };
      await onSave({ ...formattedValues, id: initialActivity?.id });
      // Show confirmation pop-up - don't reset form or close modal yet
      // The confirmation handler will handle closing
      setShowConfirmation(true);
    } catch (error) {
      console.error('Error saving activity:', error);
      // Don't show confirmation on error
    }
  };

  const handleConfirmationClose = () => {
    setShowConfirmation(false);
    // Reset form and close modal
    setValues({ subject: '' });
    setDealInput('');
    setPersonInput('');
    setServiceCategory(initialServiceCategory || 'PHOTOGRAPHY');
    onClose();
  };

  // Show confirmation pop-up even if modal is closed (but was just open)
  if (!isOpen && !showConfirmation) return null;

  const modalContent = isOpen ? (
    <div className="am-overlay" onClick={onClose}>
      <div className="am-modal" onClick={(e) => e.stopPropagation()}>
        <div className="am-header">
          <h2>Schedule activity</h2>
          <button className="am-close" onClick={onClose}>×</button>
        </div>

        <div className="am-content">
          <div className="am-grid">
            <label className="am-field full">
              <span>Subject</span>
              <input className="am-input" placeholder="Subject" value={values.subject} onChange={(e) => update('subject', e.target.value)} />
            </label>
            <div className="am-quick-subjects">
              {QUICK_SUBJECT_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`am-quick-btn ${values.subject === option.label ? 'active' : ''}`}
                  onClick={() => {
                    setValues(prev => ({
                      ...prev,
                      subject: option.label,
                      type: option.type,
                      category: option.type === 'CALL' ? 'CALL' : option.type === 'MEETING' ? 'MEETING_SCHEDULER' : 'ACTIVITY',
                    }));
                  }}
                  aria-label={option.label}
                >
                  <span className="am-quick-icon">{option.icon}</span>
                  <div className="am-quick-tooltip">{option.label}</div>
                </button>
              ))}
            </div>

            <label className="am-field">
              <span>Date</span>
              <input 
                className="am-input" 
                type="date" 
                value={values.date || ''} 
                onChange={(e) => update('date', e.target.value)}
                onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).showPicker?.();
                }}
                style={{ cursor: 'pointer' }}
              />
            </label>
            <label className="am-field">
              <span>Start time</span>
              <input 
                className="am-input" 
                type="time" 
                value={values.startTime || ''} 
                onChange={(e) => update('startTime', e.target.value)}
                onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).showPicker?.();
                }}
                style={{ cursor: 'pointer' }}
              />
            </label>
            <label className="am-field">
              <span>End time</span>
              <input 
                className="am-input" 
                type="time" 
                value={values.endTime || ''} 
                onChange={(e) => update('endTime', e.target.value)}
                onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).showPicker?.();
                }}
                style={{ cursor: 'pointer' }}
              />
            </label>

            <label className="am-field">
              <span>Activity type</span>
              <div style={{ position: 'relative' }}>
                <select
                  className="am-input"
                  value={values.type || 'ACTIVITY'}
                  onChange={(e) => {
                    const { value } = e.target;
                    setValues(prev => ({
                      ...prev,
                      type: value || 'ACTIVITY',
                      category: value === 'CALL' ? 'CALL' : value === 'MEETING' ? 'MEETING_SCHEDULER' : 'ACTIVITY',
                    }));
                  }}
                >
                  <option value="ACTIVITY">Activity</option>
                  <option value="CALL">Call</option>
                  <option value="MEETING">Meeting</option>
                </select>
                <div className="am-input-tooltip" data-tooltip={values.type === 'CALL' ? 'Call' : values.type === 'MEETING' ? 'Meeting' : 'Activity'}>
                  {values.type === 'CALL' ? 'Call' : values.type === 'MEETING' ? 'Meeting' : 'Activity'}
                </div>
              </div>
            </label>
            {!dealData && (
              <label className="am-field">
                <span>Category</span>
                <div style={{ position: 'relative' }}>
                  <select
                    className="am-input"
                    value={serviceCategory}
                    onChange={(e) => setServiceCategory(e.target.value)}
                  >
                    {SERVICE_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="am-input-tooltip" data-tooltip={SERVICE_CATEGORY_OPTIONS.find(opt => opt.code === serviceCategory)?.label || 'Category'}>
                    {SERVICE_CATEGORY_OPTIONS.find(opt => opt.code === serviceCategory)?.label || 'Category'}
                  </div>
                </div>
              </label>
            )}
            <label className="am-field">
              <span>Priority</span>
              <div style={{ position: 'relative' }}>
                <select 
                  className="am-input" 
                  value={values.priority || ''} 
                  onChange={(e) => update('priority', e.target.value)}
                >
                  <option value="">Select priority</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
                <div className="am-input-tooltip" data-tooltip={values.priority ? (values.priority === 'LOW' ? 'Low' : values.priority === 'MEDIUM' ? 'Medium' : values.priority === 'HIGH' ? 'High' : values.priority) : 'Select priority'}>
                  {values.priority ? (values.priority === 'LOW' ? 'Low' : values.priority === 'MEDIUM' ? 'Medium' : values.priority === 'HIGH' ? 'High' : values.priority) : 'Select priority'}
                </div>
              </div>
            </label>
            <label className="am-field">
              <span>Assigned user</span>
              <div style={{ position: 'relative' }}>
                <select
                  className="am-input"
                  value={values.assignedUser || ''}
                  onChange={(e) => update('assignedUser', e.target.value)}
                >
                  <option value="">All Users</option>
                  {userOptions.map((user) => {
                    const label = getUserDisplayName(user);
                    return (
                      <option key={user.id} value={label}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <div className="am-input-tooltip" data-tooltip={values.assignedUser || 'All Users'}>
                  {values.assignedUser || 'All Users'}
                </div>
              </div>
            </label>
            <label className="am-field">
              <span>Phone</span>
              <input
                className="am-input"
                placeholder="Phone number"
                value={values.phone || ''}
                onChange={(e) => update('phone', e.target.value)}
                disabled={!!dealData}
                readOnly={!!dealData}
              />
            </label>
            <label className="am-field">
              <span>Instagram ID</span>
              <input
                className="am-input"
                placeholder="Instagram ID"
                value={values.instagramId || ''}
                onChange={(e) => update('instagramId', e.target.value)}
                disabled={!!dealData}
                readOnly={!!dealData}
              />
            </label>

            <label className="am-field full">
              <span className="am-label-with-info">
                Notes (not visible to event guests)
                <button
                  type="button"
                  ref={infoIconRef}
                  className="am-info-icon"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowNotesInfo(!showNotesInfo);
                  }}
                  aria-label="Information about notes"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                  {showNotesInfo && (
                    <div className="am-info-popup">
                      Notes added here are not visible to event guests. This is for internal team use only.
                    </div>
                  )}
                </button>
              </span>
              <textarea className="am-textarea" value={values.notes || ''} onChange={(e) => update('notes', e.target.value)} />
            </label>

            <label className="am-field full">
              <span>Deal or Lead</span>
              <input
                className="am-input"
                placeholder="Deal name"
                value={dealInput}
                onChange={(e) => handleDealInputChange(e.target.value)}
                disabled={!!dealData}
                readOnly={!!dealData}
              />
            </label>

            <label className="am-field full">
              <span>People</span>
              <input
                className="am-input"
                placeholder="Person name"
                value={personInput}
                onChange={(e) => handlePersonInputChange(e.target.value)}
                disabled={!!dealData}
                readOnly={!!dealData}
              />
            </label>

            <label className="am-field full">
              <span>Organization</span>
              <input
                className="am-input"
                value={values.organization || ''}
                onChange={(e) => update('organization', e.target.value)}
                placeholder="Organization name"
                disabled={!!dealData}
                readOnly={!!dealData}
              />
            </label>
          </div>
        </div>

        <div className="am-footer">
          <button className="am-btn" onClick={onClose}>Cancel</button>
          <button className="am-btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {modalContent && createPortal(modalContent, document.body)}
      {showConfirmation && createPortal(
        <div className="am-confirmation-overlay" onClick={handleConfirmationClose}>
          <div className="am-confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="am-confirmation-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#10b981" opacity="0.1"/>
                <path d="M9 12l2 2 4-4" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="10" stroke="#10b981" strokeWidth="2"/>
              </svg>
            </div>
            <h3 className="am-confirmation-title">Activity Scheduled Successfully!</h3>
            <p className="am-confirmation-message">Your activity has been scheduled and saved.</p>
            <button className="am-confirmation-button" onClick={handleConfirmationClose}>
              OK
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

