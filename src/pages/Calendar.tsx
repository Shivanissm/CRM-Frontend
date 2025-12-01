import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import './Calendar.css';
import { dealsApi } from '../services/deals';
import { organizationsApi } from '../services/organizations';
import { calendarApi } from '../services/calendar';
import type { Deal } from '../types/deal';
import type { Organization } from '../types/organization';
import type { VendorCalendarEvent } from '../types/calendar';
import { getAllEventDates } from '../utils/dealDates';

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildCalendarDays = (baseDate: Date) => {
  const firstOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const firstDayOfGrid = new Date(firstOfMonth);
  firstDayOfGrid.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstDayOfGrid);
    day.setDate(firstDayOfGrid.getDate() + index);
    return day;
  });
};

const formatIsoDateKey = (isoString: string | null | undefined) => {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isDateOnlyString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const formatDateDisplay = (
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' },
) => {
  if (!value) return null;
  const date = isDateOnlyString(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', options);
};

const formatTimeDisplay = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const capitalize = (value: string | null | undefined) => {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

interface CalendarDeal extends Deal {
  organization?: Organization | null;
  ownerLabel?: string;
}

interface CalendarVendorEventEntry extends VendorCalendarEvent {
  organization?: Organization | null;
  ownerLabel?: string;
}

type CalendarEntry =
  | {
      kind: 'deal';
      dateKey: string;
      sortKey: string;
      deal: CalendarDeal;
    }
  | {
      kind: 'vendor';
      dateKey: string;
      sortKey: string;
      vendorEvent: CalendarVendorEventEntry;
    };

type SelectedEntryKey =
  | {
      kind: 'deal';
      id: number;
    }
  | {
      kind: 'vendor';
      id: number;
    };

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [deals, setDeals] = useState<Deal[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [vendorEvents, setVendorEvents] = useState<VendorCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [organizationFilter, setOrganizationFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [calendarOnly, setCalendarOnly] = useState<boolean>(true);
  const [selectedEntryKey, setSelectedEntryKey] = useState<SelectedEntryKey | null>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const pointerStartYRef = useRef<number | null>(null);
  const isPointerDownRef = useRef(false);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dealData, organizationData, vendorEventData] = await Promise.all([
        dealsApi.list(),
        organizationsApi.listAccessibleForCurrentUser(),
        calendarApi.listVendorEvents(),
      ]);
      setDeals(dealData);
      setOrganizations(organizationData);
      setVendorEvents(vendorEventData);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load calendar data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const organizationsById = useMemo(() => {
    const map = new Map<number, Organization>();
    organizations.forEach((organization) => map.set(organization.id, organization));
    return map;
  }, [organizations]);

  const ownerOptions = useMemo(() => {
    const ownerMap = new Map<string, string>();
    organizations.forEach((organization) => {
      const owner = organization.owner;
      if (!owner?.id) return;
      const label =
        owner.displayName ||
        [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() ||
        owner.email ||
        `User ${owner.id}`;
      ownerMap.set(String(owner.id), label);
    });
    return Array.from(ownerMap.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [organizations]);

  const organizationOptions = useMemo(
    () =>
      organizations
        .map((organization) => ({ id: String(organization.id), label: organization.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [organizations],
  );

  const filteredDeals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return deals.filter((deal) => {
      const eventDates = getAllEventDates(deal);
      if (eventDates.length === 0) return false;
      if (deal.status !== 'WON') return false;

      const organization = deal.organizationId ? organizationsById.get(deal.organizationId) : null;
      if (!organization?.googleCalendarId) {
        return false;
      }

      if (organizationFilter !== 'all') {
        if (!organization || String(organization.id) !== organizationFilter) {
          return false;
        }
      }

      if (ownerFilter !== 'all') {
        const ownerId = organization?.owner?.id ? String(organization.owner.id) : null;
        if (ownerId !== ownerFilter) {
          return false;
        }
      }

      if (!query) return true;
      const haystacks = [
        deal.name ?? '',
        organization?.name ?? '',
        organization?.googleCalendarId ?? '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [calendarOnly, deals, organizationFilter, organizationsById, ownerFilter, search]);

  const dealGoogleEventIds = useMemo(() => {
    const ids = new Set<string>();
    filteredDeals.forEach((deal) => {
      // Legacy single event ID
      if (deal.googleCalendarEventId) {
        ids.add(deal.googleCalendarEventId);
      }
      // New multiple event IDs
      if (deal.googleCalendarEventIds) {
        Object.values(deal.googleCalendarEventIds).forEach((eventId) => {
          if (eventId) ids.add(eventId);
        });
      }
    });
    return ids;
  }, [filteredDeals]);

  const dealCalendarDateKeys = useMemo(() => {
    const keys = new Set<string>();
    filteredDeals.forEach((deal) => {
      if (!deal.organizationId) return;
      const eventDates = getAllEventDates(deal);
      eventDates.forEach((date) => {
        keys.add(`${deal.organizationId}:${date}`);
      });
    });
    return keys;
  }, [filteredDeals]);

  const filteredVendorEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    const deduped: VendorCalendarEvent[] = [];
    const seen = new Set<string>();
    vendorEvents.forEach((event) => {
      const organization = event.organizationId ? organizationsById.get(event.organizationId) : null;

      if (!organization?.googleCalendarId) {
        return;
      }

      if (organizationFilter !== 'all' && String(event.organizationId) !== organizationFilter) {
        return;
      }

      if (ownerFilter !== 'all') {
        const ownerId = organization?.owner?.id ? String(organization.owner.id) : null;
        if (ownerId !== ownerFilter) {
          return;
        }
      }

      if (event.googleEventId && dealGoogleEventIds.has(event.googleEventId)) {
        return;
      }

      const dateKey = formatIsoDateKey(event.startAt);
      if (dateKey && event.organizationId && dealCalendarDateKeys.has(`${event.organizationId}:${dateKey}`)) {
        return;
      }

      if (query) {
        const haystacks = [
          event.summary ?? '',
          event.description ?? '',
          event.googleEventId ?? '',
          organization?.name ?? event.organizationName ?? '',
          organization?.googleCalendarId ?? '',
        ];
        const matches = haystacks.some((value) => value.toLowerCase().includes(query));
        if (!matches) {
          return;
        }
      }

      const dedupeKey =
        event.googleEventId ||
        `${event.organizationId ?? 'none'}:${event.startAt ?? ''}:${event.summary ?? ''}`.toLowerCase();
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      deduped.push(event);
    });
    return deduped;
  }, [
    calendarOnly,
    dealCalendarDateKeys,
    dealGoogleEventIds,
    organizationFilter,
    organizationsById,
    ownerFilter,
    search,
    vendorEvents,
  ]);

  const selectedEntry = useMemo<CalendarEntry | null>(() => {
    if (!selectedEntryKey) return null;
    if (selectedEntryKey.kind === 'deal') {
      const deal = filteredDeals.find((item) => item.id === selectedEntryKey.id);
      if (!deal) return null;
      const eventDates = getAllEventDates(deal);
      if (eventDates.length === 0) return null;
      // Use first date for selected entry (or could be enhanced to track which specific date was selected)
      const firstDate = eventDates[0];
      const organization = deal.organizationId ? organizationsById.get(deal.organizationId) : null;
      const owner = organization?.owner;
      const ownerLabel =
        owner?.displayName ||
        [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim() ||
        owner?.email ||
        undefined;
      return {
        kind: 'deal',
        dateKey: firstDate,
        sortKey: firstDate,
        deal: {
          ...deal,
          organization,
          ownerLabel,
        },
      };
    }

    const vendorEvent = filteredVendorEvents.find((event) => event.id === selectedEntryKey.id);
    if (!vendorEvent) return null;
    const dateKey = formatIsoDateKey(vendorEvent.startAt);
    if (!dateKey) return null;
    const organization = vendorEvent.organizationId ? organizationsById.get(vendorEvent.organizationId) : null;
    const owner = organization?.owner;
    const ownerLabel =
      owner?.displayName ||
      [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim() ||
      owner?.email ||
      undefined;
    return {
      kind: 'vendor',
      dateKey,
      sortKey: vendorEvent.startAt || dateKey,
      vendorEvent: {
        ...vendorEvent,
        organization,
        ownerLabel,
      },
    };
  }, [filteredDeals, filteredVendorEvents, organizationsById, selectedEntryKey]);

  useEffect(() => {
    if (selectedEntryKey && !selectedEntry) {
      setSelectedEntryKey(null);
    }
  }, [selectedEntry, selectedEntryKey]);

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();

    filteredDeals.forEach((deal) => {
      const eventDates = getAllEventDates(deal);
      if (eventDates.length === 0) return;
      const organization = deal.organizationId ? organizationsById.get(deal.organizationId) : null;
      const owner = organization?.owner;
      const ownerLabel =
        owner?.displayName ||
        [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim() ||
        owner?.email ||
        undefined;
      const enriched: CalendarDeal = {
        ...deal,
        organization,
        ownerLabel,
      };
      // Create an entry for each date
      eventDates.forEach((date) => {
        const entry: CalendarEntry = {
          kind: 'deal',
          dateKey: date,
          sortKey: date,
          deal: enriched,
        };
        if (!map.has(entry.dateKey)) {
          map.set(entry.dateKey, []);
        }
        map.get(entry.dateKey)!.push(entry);
      });
    });

    filteredVendorEvents.forEach((event) => {
      const dateKey = formatIsoDateKey(event.startAt);
      if (!dateKey) return;
      const organization = event.organizationId ? organizationsById.get(event.organizationId) : null;
      const owner = organization?.owner;
      const ownerLabel =
        owner?.displayName ||
        [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim() ||
        owner?.email ||
        undefined;
      const entry: CalendarEntry = {
        kind: 'vendor',
        dateKey,
        sortKey: event.startAt || dateKey,
        vendorEvent: {
          ...event,
          organization,
          ownerLabel,
        },
      };
      if (!map.has(entry.dateKey)) {
        map.set(entry.dateKey, []);
      }
      map.get(entry.dateKey)!.push(entry);
    });

    map.forEach((list) =>
      list.sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === 'deal' ? -1 : 1;
        }
        const aLabel =
          a.kind === 'deal' ? a.deal.name || `Deal #${a.deal.id}` : a.vendorEvent.summary || 'Vendor event';
        const bLabel =
          b.kind === 'deal' ? b.deal.name || `Deal #${b.deal.id}` : b.vendorEvent.summary || 'Vendor event';
        return aLabel.localeCompare(bLabel);
      }),
    );

    return map;
  }, [filteredDeals, filteredVendorEvents, organizationsById]);

  const todayKey = formatDateKey(new Date());

  const upcomingEntries = useMemo(() => {
    const nowKey = todayKey;
    const dealEntries: CalendarEntry[] = [];
    filteredDeals.forEach((deal) => {
      const eventDates = getAllEventDates(deal);
      const organization = deal.organizationId ? organizationsById.get(deal.organizationId) : null;
      const owner = organization?.owner;
      const ownerLabel =
        owner?.displayName ||
        [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim() ||
        owner?.email ||
        undefined;
      const enriched: CalendarDeal = {
        ...deal,
        organization,
        ownerLabel,
      };
      // Create entries for all upcoming dates
      eventDates
        .filter((date) => date >= nowKey)
        .forEach((date) => {
          dealEntries.push({
            kind: 'deal',
            dateKey: date,
            sortKey: date,
            deal: enriched,
          } as CalendarEntry);
        });
    });

    const vendorEntries: CalendarEntry[] = filteredVendorEvents
      .map((event) => {
        const dateKey = formatIsoDateKey(event.startAt);
        return {
          dateKey,
          sortKey: event.startAt || dateKey || '',
          event,
        };
      })
      .filter((item): item is { dateKey: string; sortKey: string; event: VendorCalendarEvent } => {
        if (!item.dateKey) return false;
        return item.dateKey >= nowKey;
      })
      .map((item) => {
        const organization = item.event.organizationId ? organizationsById.get(item.event.organizationId) : null;
        const owner = organization?.owner;
        const ownerLabel =
          owner?.displayName ||
          [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim() ||
          owner?.email ||
          undefined;
        return {
          kind: 'vendor',
          dateKey: item.dateKey,
          sortKey: item.sortKey,
          vendorEvent: {
            ...item.event,
            organization,
            ownerLabel,
          },
        } as CalendarEntry;
      });

    return [...dealEntries, ...vendorEntries]
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(0, 8);
  }, [filteredDeals, filteredVendorEvents, organizationsById, todayKey]);

  const handleEntrySelect = (entry: CalendarEntry) => {
    if (entry.kind === 'deal') {
      setSelectedEntryKey({ kind: 'deal', id: entry.deal.id });
    } else {
      setSelectedEntryKey({ kind: 'vendor', id: entry.vendorEvent.id });
    }
  };

  const clearSelection = () => setSelectedEntryKey(null);

  const handlePrevMonth = () => {
    const prev = new Date(currentMonth);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentMonth(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + 1);
    setCurrentMonth(next);
  };

  const handleResetMonth = () => {
    setCurrentMonth(new Date());
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Only handle primary pointer (finger or main mouse button)
    if (event.button !== 0) return;
    isPointerDownRef.current = true;
    pointerStartXRef.current = event.clientX;
    pointerStartYRef.current = event.clientY;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current || pointerStartXRef.current == null || pointerStartYRef.current == null) return;
    const deltaX = event.clientX - pointerStartXRef.current;
    const deltaY = event.clientY - pointerStartYRef.current;
    // If gesture is mainly horizontal, prevent vertical scroll during the drag
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      event.preventDefault();
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current || pointerStartXRef.current == null || pointerStartYRef.current == null) {
      isPointerDownRef.current = false;
      pointerStartXRef.current = null;
      pointerStartYRef.current = null;
      return;
    }
    const deltaX = event.clientX - pointerStartXRef.current;
    const deltaY = event.clientY - pointerStartYRef.current;
    const threshold = 40;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        handlePrevMonth();
      } else {
        handleNextMonth();
      }
    }
    isPointerDownRef.current = false;
    pointerStartXRef.current = null;
    pointerStartYRef.current = null;
  };

  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <div>
          <h1>Calendar</h1>
          <p>Visualize deal event dates across teams and vendor calendars.</p>
        </div>
        <div className="calendar-header-actions">
          <div className="calendar-month-controls">
            <button onClick={handlePrevMonth} aria-label="Previous month">
              ‹
            </button>
            <div className="calendar-month-label">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <button onClick={handleNextMonth} aria-label="Next month">
              ›
            </button>
          </div>
          <button className="calendar-today-btn" onClick={handleResetMonth}>
            Today
          </button>
          <button className="calendar-refresh-btn" onClick={() => void loadData()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="calendar-filters">
        <input
          type="search"
          placeholder="Search deals, orgs, calendar email…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
          <option value="all">All organizations</option>
          {organizationOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
          <option value="all">All owners</option>
          {ownerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="calendar-toggle">
          <input
            type="checkbox"
            checked={calendarOnly}
            onChange={(event) => setCalendarOnly(event.target.checked)}
          />
          Show only organizations with Google Calendar
        </label>
      </section>

      {error && <div className="calendar-error">{error}</div>}

      <div className="calendar-layout">
        <div className="calendar-grid-wrapper">
          <div className="calendar-weekdays">
            {weekdayLabels.map((label) => (
              <div key={label} className="calendar-weekday">
                {label}
              </div>
            ))}
          </div>
          <div
            className="calendar-grid"
            style={{ touchAction: 'pan-y' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {calendarDays.map((day) => {
              const dateKey = formatDateKey(day);
              const dayEntries = entriesByDate.get(dateKey) ?? [];
              const displayEntries = dayEntries.slice(0, 3);
              return (
                <div
                  key={dateKey + day.getMonth()}
                  className={`calendar-day${
                    day.getMonth() === currentMonth.getMonth() ? '' : ' muted'
                  }${dateKey === todayKey ? ' today' : ''}`}
                >
                  <div className="calendar-day-label">
                    <span>{day.getDate()}</span>
                  </div>
                  <div className="calendar-day-events">
                    {displayEntries.map((entry) => {
                      const isSelected =
                        (entry.kind === 'deal' &&
                          selectedEntryKey?.kind === 'deal' &&
                          selectedEntryKey.id === entry.deal.id) ||
                        (entry.kind === 'vendor' &&
                          selectedEntryKey?.kind === 'vendor' &&
                          selectedEntryKey.id === entry.vendorEvent.id);
                      const baseProps = {
                        role: 'button' as const,
                        tabIndex: 0,
                        onClick: () => handleEntrySelect(entry),
                        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleEntrySelect(entry);
                          }
                        },
                        className: `calendar-event${entry.kind === 'vendor' ? ' vendor-event' : ''}${
                          entry.kind === 'deal' ? ` ${entry.deal.status?.toLowerCase() ?? ''}` : ''
                        }${isSelected ? ' selected' : ''}`,
                        'aria-pressed': isSelected,
                      };
                      if (entry.kind === 'deal') {
                        const allDates = getAllEventDates(entry.deal);
                        const hasMultipleDates = allDates.length > 1;
                        const currentDateIndex = allDates.indexOf(entry.dateKey);
                        return (
                          <div
                            key={`deal-${entry.deal.id}-${entry.dateKey}`}
                            {...baseProps}
                          >
                            <div className="calendar-event-name">
                              {entry.deal.name || `Deal #${entry.deal.id}`}
                              {hasMultipleDates && (
                                <span className="calendar-event-badge" style={{ 
                                  marginLeft: '6px',
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                  color: '#3b82f6'
                                }}>
                                  {allDates.length} dates
                                </span>
                              )}
                            </div>
                            <div className="calendar-event-meta">
                              {entry.deal.organization?.name ?? 'Unassigned'}
                              {entry.deal.ownerLabel ? ` · ${entry.deal.ownerLabel}` : ''}
                              {hasMultipleDates && (
                                <div style={{ 
                                  fontSize: '11px', 
                                  color: '#6b7280', 
                                  marginTop: '2px',
                                  fontStyle: 'italic'
                                }}>
                                  Date {currentDateIndex + 1} of {allDates.length}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <div
                          key={`vendor-${entry.vendorEvent.id}-${entry.dateKey}`}
                          {...baseProps}
                        >
                          <div className="calendar-event-name">
                            {entry.vendorEvent.summary || 'Vendor event'}
                            <span className="calendar-event-badge">Vendor</span>
                          </div>
                          <div className="calendar-event-meta">
                            {entry.vendorEvent.organization?.name ??
                              entry.vendorEvent.organizationName ??
                              'Vendor calendar'}
                            {entry.vendorEvent.ownerLabel ? ` · ${entry.vendorEvent.ownerLabel}` : ''}
                          </div>
                        </div>
                      );
                    })}
                    {dayEntries.length > 3 && (
                      <div className="calendar-event-more">+{dayEntries.length - 3} more</div>
                    )}
                    {dayEntries.length === 0 && <span className="calendar-empty-slot">No events</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="calendar-sidebar">
          <h2>Upcoming events</h2>
          {upcomingEntries.length === 0 ? (
            <div className="calendar-empty-state">
              <p>No upcoming events that match your filters.</p>
            </div>
          ) : (
            <ul className="calendar-upcoming-list">
              {upcomingEntries.map((entry) => {
                const isSelected =
                  (entry.kind === 'deal' &&
                    selectedEntryKey?.kind === 'deal' &&
                    selectedEntryKey.id === entry.deal.id) ||
                  (entry.kind === 'vendor' &&
                    selectedEntryKey?.kind === 'vendor' &&
                    selectedEntryKey.id === entry.vendorEvent.id);
                return entry.kind === 'deal' ? (
                  <li key={`upcoming-deal-${entry.deal.id}`}>
                    <button
                      type="button"
                      className={`calendar-upcoming-item${isSelected ? ' selected' : ''}`}
                      onClick={() => handleEntrySelect(entry)}
                      aria-pressed={isSelected}
                    >
                      <div className="calendar-upcoming-date">
                        {entry.dateKey
                          ? new Date(entry.dateKey).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </div>
                      <div className="calendar-upcoming-body">
                        <div className="calendar-upcoming-name">{entry.deal.name || `Deal #${entry.deal.id}`}</div>
                        <div className="calendar-upcoming-meta">
                          {entry.deal.organization?.name ?? '—'}
                          {entry.deal.ownerLabel ? ` · ${entry.deal.ownerLabel}` : ''}
                        </div>
                        {entry.deal.organization?.googleCalendarId && (
                          <div className="calendar-upcoming-calendar">
                            {entry.deal.organization.googleCalendarId}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                ) : (
                  <li key={`upcoming-vendor-${entry.vendorEvent.id}`}>
                    <button
                      type="button"
                      className={`calendar-upcoming-item${isSelected ? ' selected' : ''}`}
                      onClick={() => handleEntrySelect(entry)}
                      aria-pressed={isSelected}
                    >
                      <div className="calendar-upcoming-date">
                        {entry.dateKey
                          ? new Date(entry.vendorEvent.startAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </div>
                      <div className="calendar-upcoming-body">
                        <div className="calendar-upcoming-name">
                          {entry.vendorEvent.summary || 'Vendor event'}
                          <span className="calendar-event-badge">Vendor</span>
                        </div>
                        <div className="calendar-upcoming-meta">
                          {entry.vendorEvent.organization?.name ??
                            entry.vendorEvent.organizationName ??
                            'Vendor calendar'}
                          {entry.vendorEvent.ownerLabel ? ` · ${entry.vendorEvent.ownerLabel}` : ''}
                        </div>
                        <div className="calendar-upcoming-source">Synced from Google Calendar</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <section className="calendar-selected-panel">
            <div className="calendar-selected-header">
              <h3>Event details</h3>
              {selectedEntry && (
                <button type="button" className="calendar-selected-clear" onClick={clearSelection}>
                  Clear
                </button>
              )}
            </div>
            {!selectedEntry ? (
              <p className="calendar-selected-empty">Select an event to see more details.</p>
            ) : selectedEntry.kind === 'deal' ? (
              <div className="calendar-selected-body">
                <div className="calendar-selected-title">{selectedEntry.deal.name || `Deal #${selectedEntry.deal.id}`}</div>
                <ul className="calendar-selected-meta">
                  {(() => {
                    const allDates = getAllEventDates(selectedEntry.deal);
                    const hasMultipleDates = allDates.length > 1;
                    const dateDisplay = hasMultipleDates
                      ? allDates
                          .map((date) =>
                            formatDateDisplay(date, {
                              weekday: 'short',
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          )
                          .filter(Boolean)
                          .join(', ')
                      : selectedEntry.dateKey &&
                        formatDateDisplay(selectedEntry.dateKey, {
                          weekday: 'short',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        });
                    
                    return [
                      { label: 'Type', value: 'CRM deal' },
                      {
                        label: hasMultipleDates ? 'Dates' : 'Date',
                        value: dateDisplay,
                      },
                      { label: 'Organization', value: selectedEntry.deal.organization?.name ?? 'Unassigned' },
                      { label: 'Owner', value: selectedEntry.deal.ownerLabel },
                      {
                        label: 'Status',
                        value: capitalize(selectedEntry.deal.status),
                      },
                      { label: 'Event type', value: selectedEntry.deal.eventType },
                      { label: 'Venue', value: selectedEntry.deal.venue },
                      { label: 'Calendar', value: selectedEntry.deal.organization?.googleCalendarId },
                      { label: 'Google event ID', value: selectedEntry.deal.googleCalendarEventId },
                    ]
                      .filter((item) => item.value)
                      .map((item) => (
                        <li key={item.label}>
                          <span>{item.label}</span>
                          <span>{item.value}</span>
                        </li>
                      ));
                  })()}
                </ul>
              </div>
            ) : (
              <div className="calendar-selected-body">
                <div className="calendar-selected-title">
                  {selectedEntry.vendorEvent.summary || 'Vendor event'}
                  <span className="calendar-event-badge">Vendor</span>
                </div>
                <ul className="calendar-selected-meta">
                  {[
                    { label: 'Type', value: 'Google Calendar sync' },
                    {
                      label: 'Date',
                      value:
                        selectedEntry.vendorEvent.startAt &&
                        formatDateDisplay(selectedEntry.vendorEvent.startAt, {
                          weekday: 'short',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        }),
                    },
                    {
                      label: 'Time',
                      value: selectedEntry.vendorEvent.allDay
                        ? 'All day'
                        : `${formatTimeDisplay(selectedEntry.vendorEvent.startAt) ?? '—'} – ${
                            formatTimeDisplay(selectedEntry.vendorEvent.endAt) ?? '—'
                          }`,
                    },
                    {
                      label: 'Organization',
                      value:
                        selectedEntry.vendorEvent.organization?.name ??
                        selectedEntry.vendorEvent.organizationName ??
                        'Vendor calendar',
                    },
                    { label: 'Owner', value: selectedEntry.vendorEvent.ownerLabel },
                    { label: 'Calendar', value: selectedEntry.vendorEvent.organization?.googleCalendarId },
                    { label: 'Google event ID', value: selectedEntry.vendorEvent.googleEventId },
                    { label: 'Status', value: capitalize(selectedEntry.vendorEvent.status ?? undefined) },
                  ]
                    .filter((item) => item.value)
                    .map((item) => (
                      <li key={item.label}>
                        <span>{item.label}</span>
                        <span>{item.value}</span>
                      </li>
                    ))}
                </ul>
                {selectedEntry.vendorEvent.description && (
                  <div className="calendar-selected-description">{selectedEntry.vendorEvent.description}</div>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

