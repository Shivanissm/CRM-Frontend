import { useEffect, useState } from 'react';
import './ActivityModal.css';
import { activitiesApi } from '../services/activities';

export interface ActivityFormValues {
  subject: string;
  category?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  priority?: string;
  type?: string;
  assignedUser?: string;
  notes?: string;
  personName?: string;
  organization?: string;
  personId?: number;
  dealId?: number;
  dueDate?: string;
  dateTime?: string;
}

export default function ActivityModal({
  isOpen,
  onClose,
  onSave,
  initialOrganization,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: ActivityFormValues) => Promise<void> | void;
  initialOrganization?: string;
}) {
  const [values, setValues] = useState<ActivityFormValues>({ subject: '' });
  const [_categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);

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

  useEffect(() => {
    if (isOpen) {
      setValues({ subject: '', organization: initialOrganization || '' });
      void loadCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialOrganization]);

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
              value={values.type || values.category || ''}
              onChange={(e) => {
                const { value } = e.target;
                const parentCategory = mapActivityTypeToCategory(value) || undefined;
                setValues(prev => ({
                  ...prev,
                  type: value || undefined,
                  category: parentCategory,
                }));
              }}
            >
              <option value="">Activity type</option>
              <option value="FOLLOW_UP">Follow Up</option>
              <option value="SEND_QUOTES">Send Quotes</option>
              <option value="MEETING">Meeting</option>
              <option value="CALL">Call</option>
              <option value="TASK">Task</option>
              <option value="OTHER">Other</option>
              <option value="ACTIVITY">Activity</option>
              <option value="MEETING_SCHEDULER">Meeting Scheduler</option>
            </select>
            <select className="am-input" value={values.priority || ''} onChange={(e) => update('priority', e.target.value)}>
              <option value="">Priority</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            <select className="am-input" value={values.assignedUser || ''} onChange={(e) => update('assignedUser', e.target.value)}>
              <option value="">Assigned user</option>
            </select>
          </div>

          <textarea className="am-textarea" placeholder="Notes (not visible to event guests)" value={values.notes || ''} onChange={(e) => update('notes', e.target.value)} />

          <div className="am-meta">
            <div>
              <strong>Organization:</strong>{' '}
              <input
                className="am-input"
                style={{ width: 200 }}
                value={values.organization || ''}
                onChange={(e) => update('organization', e.target.value)}
                placeholder="Organization name"
              />
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

