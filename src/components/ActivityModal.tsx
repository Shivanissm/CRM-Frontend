import { useEffect, useState } from 'react';
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
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: ActivityFormValues & { id?: number }) => Promise<void> | void;
  initialOrganization?: string;
  initialCategory?: 'Activity' | 'Call' | 'Meeting scheduler';
  initialActivity?: Activity | null;
  initialServiceCategory?: string;
  userOptions?: User[];
}) {
  const [values, setValues] = useState<ActivityFormValues>({ subject: '' });
  const [_categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [dealOptions, setDealOptions] = useState<Deal[]>([]);
  const [personOptions, setPersonOptions] = useState<Person[]>([]);
  const [organizationLookup, setOrganizationLookup] = useState<Record<number, string>>({});
  const [dealInput, setDealInput] = useState('');
  const [personInput, setPersonInput] = useState('');
  const [serviceCategory, setServiceCategory] = useState<string>(initialServiceCategory);

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

  useEffect(() => {
    if (isOpen) {
      const baseType = initialActivity?.type || deriveTypeFromCategory(initialCategory);
      const baseCategory =
        mapActivityTypeToCategory(initialActivity?.type || baseType) || 'ACTIVITY';
      setValues({
        subject: initialActivity?.subject || '',
        organization: initialActivity?.organization || initialOrganization || '',
        type: baseType,
        category: baseCategory,
        date: toInputDate(initialActivity?.date),
        startTime: initialActivity?.startTime || undefined,
        endTime: initialActivity?.endTime || undefined,
        priority: initialActivity?.priority || undefined,
        assignedUser: initialActivity?.assignedUser || undefined,
        phone: initialActivity?.phone || undefined,
        instagramId: initialActivity?.instagramId || undefined,
        notes: initialActivity?.notes || undefined,
        personId: initialActivity?.personId || undefined,
        dealId: initialActivity?.dealId || undefined,
        dealName: initialActivity?.dealName || undefined,
      });
      setDealInput(initialActivity?.dealName || '');
      if (initialActivity?.personId) {
        const person = personOptions.find((p) => p.id === initialActivity.personId);
        setPersonInput(person?.name || '');
      } else {
        setPersonInput('');
      }
      setServiceCategory(initialServiceCategory || 'PHOTOGRAPHY');
      void loadCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialOrganization, initialCategory, initialActivity, initialServiceCategory, personOptions, dealOptions]);

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
        const lookup: Record<number, string> = {};
        (organizations ?? []).forEach((org: Organization) => {
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

  if (!isOpen) return null;

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
    setValues({ subject: '' }); // Reset after save
    setDealInput('');
    setPersonInput('');
    setServiceCategory(initialServiceCategory || 'PHOTOGRAPHY');
  };

  return (
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
                </button>
              ))}
            </div>

            <label className="am-field">
              <span>Date</span>
              <input className="am-input" type="date" value={values.date || ''} onChange={(e) => update('date', e.target.value)} />
            </label>
            <label className="am-field">
              <span>Start time</span>
              <input className="am-input" type="time" value={values.startTime || ''} onChange={(e) => update('startTime', e.target.value)} />
            </label>
            <label className="am-field">
              <span>End time</span>
              <input className="am-input" type="time" value={values.endTime || ''} onChange={(e) => update('endTime', e.target.value)} />
            </label>

            <label className="am-field">
              <span>Activity type</span>
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
            </label>
            <label className="am-field">
              <span>Category</span>
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
            </label>
            <label className="am-field">
              <span>Priority</span>
              <select className="am-input" value={values.priority || ''} onChange={(e) => update('priority', e.target.value)}>
                <option value="">Select priority</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label className="am-field">
              <span>Assigned user</span>
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
            </label>
            <label className="am-field">
              <span>Phone</span>
              <input
                className="am-input"
                placeholder="Phone number"
                value={values.phone || ''}
                onChange={(e) => update('phone', e.target.value)}
              />
            </label>
            <label className="am-field">
              <span>Instagram ID</span>
              <input
                className="am-input"
                placeholder="Instagram ID"
                value={values.instagramId || ''}
                onChange={(e) => update('instagramId', e.target.value)}
              />
            </label>

            <label className="am-field full">
              <span>Notes (not visible to event guests)</span>
              <textarea className="am-textarea" value={values.notes || ''} onChange={(e) => update('notes', e.target.value)} />
            </label>

            <label className="am-field full">
              <span>Deal or Lead</span>
              <input
                className="am-input"
                placeholder="Deal name"
                value={dealInput}
                onChange={(e) => handleDealInputChange(e.target.value)}
              />
            </label>

            <label className="am-field full">
              <span>People</span>
              <input
                className="am-input"
                placeholder="Person name"
                value={personInput}
                onChange={(e) => handlePersonInputChange(e.target.value)}
              />
            </label>

            <label className="am-field full">
              <span>Organization</span>
              <input
                className="am-input"
                value={values.organization || ''}
                onChange={(e) => update('organization', e.target.value)}
                placeholder="Organization name"
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
  );
}

