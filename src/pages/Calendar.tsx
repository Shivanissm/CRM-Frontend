import { useEffect, useMemo, useState } from 'react';
import './Calendar.css';
import { dealsApi } from '../services/deals';
import { organizationsApi } from '../services/organizations';
import { calendarApi } from '../services/calendar';
import type { Deal } from '../types/deal';
import type { Organization } from '../types/organization';
import type { VendorCalendarEvent } from '../types/calendar';

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

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dealData, organizationData, vendorEventData] = await Promise.all([
        dealsApi.list(),
        organizationsApi.list(),
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
      if (!deal.eventDate) return false;
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
      if (deal.googleCalendarEventId) {
        ids.add(deal.googleCalendarEventId);
      }
    });
    return ids;
  }, [filteredDeals]);

  const dealCalendarDateKeys = useMemo(() => {
    const keys = new Set<string>();
    filteredDeals.forEach((deal) => {
      if (!deal.eventDate || !deal.organizationId) return;
      keys.add(`${deal.organizationId}:${deal.eventDate}`);
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

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();

    filteredDeals.forEach((deal) => {
      if (!deal.eventDate) return;
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
      const entry: CalendarEntry = {
        kind: 'deal',
        dateKey: deal.eventDate,
        sortKey: deal.eventDate,
        deal: enriched,
      };
      if (!map.has(entry.dateKey)) {
        map.set(entry.dateKey, []);
      }
      map.get(entry.dateKey)!.push(entry);
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
    const dealEntries: CalendarEntry[] = filteredDeals
      .filter((deal) => (deal.eventDate ?? '') >= nowKey)
      .map((deal) => {
        const organization = deal.organizationId ? organizationsById.get(deal.organizationId) : null;
        const owner = organization?.owner;
        const ownerLabel =
          owner?.displayName ||
          [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim() ||
          owner?.email ||
          undefined;
        return {
          kind: 'deal',
          dateKey: deal.eventDate ?? '',
          sortKey: deal.eventDate ?? '',
          deal: {
            ...deal,
            organization,
            ownerLabel,
          },
        } as CalendarEntry;
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
          <div className="calendar-grid">
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
                    {displayEntries.map((entry) =>
                      entry.kind === 'deal' ? (
                        <div
                          key={`deal-${entry.deal.id}-${entry.deal.eventDate}`}
                          className={`calendar-event ${entry.deal.status?.toLowerCase() ?? ''}`}
                        >
                          <div className="calendar-event-name">{entry.deal.name || `Deal #${entry.deal.id}`}</div>
                          <div className="calendar-event-meta">
                            {entry.deal.organization?.name ?? 'Unassigned'}
                            {entry.deal.ownerLabel ? ` · ${entry.deal.ownerLabel}` : ''}
                          </div>
                        </div>
                      ) : (
                        <div
                          key={`vendor-${entry.vendorEvent.id}-${entry.dateKey}`}
                          className="calendar-event vendor-event"
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
                      ),
                    )}
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
              {upcomingEntries.map((entry) =>
                entry.kind === 'deal' ? (
                  <li key={`upcoming-deal-${entry.deal.id}`}>
                    <div className="calendar-upcoming-date">
                      {entry.deal.eventDate
                        ? new Date(entry.deal.eventDate).toLocaleDateString('en-US', {
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
                  </li>
                ) : (
                  <li key={`upcoming-vendor-${entry.vendorEvent.id}`}>
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
                  </li>
                ),
              )}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

