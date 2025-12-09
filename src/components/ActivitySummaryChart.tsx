import { useEffect, useMemo, useState } from 'react';
import { activitiesApi, type Activity, type ActivityFilters } from '../services/activities';
import { getStoredUser } from '../utils/authToken';

type ChartBucket = {
  key: string;
  label: string;
  total: number;
  done: number;
  pending: number;
};

type ViewMode = 'day' | 'month' | 'year';

const formatDateDDMMYYYY = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const parseActivityDate = (activity: Activity): Date | null => {
  const raw =
    activity.dateTime ||
    activity.date ||
    activity.dueDate ||
    activity.createdAt ||
    activity.updatedAt;

  if (!raw) return null;

  // Handle dd/MM/yyyy
  if (raw.includes('/')) {
    const [dd, mm, yyyy] = raw.split('/');
    const d = Number(dd);
    const m = Number(mm);
    const y = Number(yyyy);
    if (!Number.isNaN(d) && !Number.isNaN(m) && !Number.isNaN(y)) {
      return new Date(y, m - 1, d);
    }
  }

  // Fallback for ISO-like formats
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const createDayBuckets = (days: number): ChartBucket[] => {
  const result: ChartBucket[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = formatDateDDMMYYYY(d);
    const label = d.toLocaleDateString(undefined, {
      weekday: 'short',
    });
    result.push({
      key,
      label,
      total: 0,
      done: 0,
      pending: 0,
    });
  }
  return result;
};

const createMonthBuckets = (months: number): ChartBucket[] => {
  const result: ChartBucket[] = [];
  const today = new Date();
  today.setDate(1);
  today.setHours(0, 0, 0, 0);

  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setMonth(today.getMonth() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const key = `${year}-${month}`;
    const label = d.toLocaleDateString(undefined, { month: 'short' });
    result.push({
      key,
      label,
      total: 0,
      done: 0,
      pending: 0,
    });
  }
  return result;
};

const createYearBuckets = (years: number): ChartBucket[] => {
  const result: ChartBucket[] = [];
  const today = new Date();
  today.setMonth(0, 1);
  today.setHours(0, 0, 0, 0);

  for (let i = years - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setFullYear(today.getFullYear() - i);
    const year = d.getFullYear();
    const key = `${year}`;
    const label = `${year}`;
    result.push({
      key,
      label,
      total: 0,
      done: 0,
      pending: 0,
    });
  }
  return result;
};

const getBucketsForMode = (mode: ViewMode): ChartBucket[] => {
  if (mode === 'month') return createMonthBuckets(12);
  if (mode === 'year') return createYearBuckets(3);
  return createDayBuckets(7);
};

const getRangeForMode = (mode: ViewMode): { from: Date; to: Date } => {
  const to = new Date();
  to.setHours(0, 0, 0, 0);

  if (mode === 'day') {
    const from = new Date(to);
    from.setDate(to.getDate() - 6);
    return { from, to };
  }

  if (mode === 'month') {
    const from = new Date(to);
    from.setMonth(to.getMonth() - 11);
    from.setDate(1);
    return { from, to };
  }

  // year
  const from = new Date(to);
  from.setFullYear(to.getFullYear() - 2);
  from.setMonth(0, 1);
  return { from, to };
};

const getBucketKeyForDate = (mode: ViewMode, date: Date): string => {
  if (mode === 'day') {
    return formatDateDDMMYYYY(date);
  }
  if (mode === 'month') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
  const year = date.getFullYear();
  return `${year}`;
};

const getTitleForMode = (mode: ViewMode): string => {
  if (mode === 'month') return 'Activity pulse (last 12 months)';
  if (mode === 'year') return 'Activity pulse (last 3 years)';
  return 'Activity pulse (last 7 days)';
};

const getEmptyStateForMode = (mode: ViewMode): string => {
  if (mode === 'month') {
    return 'No activities in the last 12 months for you. Create tasks or follow‑ups to see data here.';
  }
  if (mode === 'year') {
    return 'No activities in the last 3 years for you. Create tasks or follow‑ups to see data here.';
  }
  return 'No activities in the last 7 days for you. Create a task or follow‑up to see data here.';
};

export default function ActivitySummaryChart() {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [buckets, setBuckets] = useState<ChartBucket[]>(() => getBucketsForMode('day'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const storedUser = getStoredUser();

    const { from, to } = getRangeForMode(viewMode);

    const filters: ActivityFilters = {
      dateFrom: formatDateDDMMYYYY(from),
      dateTo: formatDateDDMMYYYY(to),
      page: 0,
      size: 1000,
    };

    if (storedUser?.userId) {
      filters.assignedUserId = storedUser.userId;
    }

    setLoading(true);
    setError(null);

    activitiesApi
      .list(filters, { signal: controller.signal })
      .then((page) => {
        if (cancelled) return;

        const baseBuckets = getBucketsForMode(viewMode);
        const bucketMap = new Map<string, ChartBucket>();
        baseBuckets.forEach((b) => bucketMap.set(b.key, { ...b }));

        page.content.forEach((activity) => {
          const date = parseActivityDate(activity);
          if (!date) return;
          date.setHours(0, 0, 0, 0);

          const key = getBucketKeyForDate(viewMode, date);
          const bucket = bucketMap.get(key);
          if (!bucket) return;

          bucket.total += 1;
          if (activity.done) {
            bucket.done += 1;
          } else {
            bucket.pending += 1;
          }
        });

        setBuckets(Array.from(bucketMap.values()));
      })
      .catch((err) => {
        if (cancelled || err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        // eslint-disable-next-line no-console
        console.error('Failed to load activity summary for dashboard', err);
        setError('Unable to load activity summary right now.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [viewMode]);

  const maxValue = useMemo(
    () => buckets.reduce((max, b) => (b.total > max ? b.total : max), 0),
    [buckets],
  );

  return (
    <div className="activity-chart">
      <div className="activity-chart-header">
        <div>
          <h3>{getTitleForMode(viewMode)}</h3>
          <p>Quick view of your to‑dos and completed work.</p>
        </div>
        <div className="activity-chart-toggle" aria-label="Select activity summary range">
          <button
            type="button"
            className={viewMode === 'day' ? 'active' : ''}
            onClick={() => setViewMode('day')}
          >
            Day
          </button>
          <button
            type="button"
            className={viewMode === 'month' ? 'active' : ''}
            onClick={() => setViewMode('month')}
          >
            Month
          </button>
          <button
            type="button"
            className={viewMode === 'year' ? 'active' : ''}
            onClick={() => setViewMode('year')}
          >
            Year
          </button>
        </div>
      </div>

      {loading ? (
        <div className="activity-chart-empty">Loading activity summary…</div>
      ) : error ? (
        <div className="activity-chart-empty activity-chart-error">{error}</div>
      ) : maxValue === 0 ? (
        <div className="activity-chart-empty">{getEmptyStateForMode(viewMode)}</div>
      ) : (
        <>
          <div className="activity-chart-legend">
            <span className="legend-item">
              <span className="legend-dot legend-dot-total" />
              Total
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot-done" />
              Completed
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot-pending" />
              Pending
            </span>
          </div>
          <div className="activity-chart-bars">
            {buckets.map((bucket) => {
              const totalHeight = maxValue ? (bucket.total / maxValue) * 100 : 0;
              const doneHeight = bucket.total ? (bucket.done / bucket.total) * totalHeight : 0;
              const pendingHeight = totalHeight - doneHeight;

              return (
                <div key={bucket.key} className="activity-chart-bar">
                  <div className="activity-chart-bar-stack" aria-label={bucket.label}>
                    <div
                      className="activity-chart-bar-pending"
                      style={{ height: `${pendingHeight}%` }}
                    />
                    <div
                      className="activity-chart-bar-done"
                      style={{ height: `${doneHeight}%` }}
                    />
                  </div>
                  <div className="activity-chart-bar-label">
                    <span className="activity-chart-bar-day">{bucket.label}</span>
                    <span className="activity-chart-bar-count">{bucket.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
