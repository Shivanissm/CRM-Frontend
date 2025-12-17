import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './RoleDashboards.css';
import { activitiesApi, type Activity } from '../services/activities';
import { targetsApi } from '../services/targets';
import { dealsApi } from '../services/deals';
import { organizationsApi } from '../services/organizations';
import { pipelinesApi } from '../services/pipelines';
import { usersApi } from '../services/users';
import { teamsApi } from '../services/teams';
import { personsApi } from '../services/api';
import type { Organization } from '../types/organization';
import type { Deal } from '../types/deal';
import type { Pipeline } from '../types/pipeline';
import type { Person } from '../types/person';
import type { Team } from '../types/team';
import { getStoredUser } from '../utils/authToken';

type BarCategory = { key: string; label: string };
type Series = { key: string; label: string; color: string; values: Record<string, number> };

type PieSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
  // Optional per-organization breakdown for tooltips
  breakdown?: { orgLabel: string; count: number; percent: number }[];
};

type TimeRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom-month' | 'custom-quarter' | 'custom-range';

function TargetAchievedChart({
  target,
  achieved,
  onTitleClick,
}: {
  target: number;
  achieved: number;
  onTitleClick?: () => void;
}) {
  const [view, setView] = useState<'donut' | 'bar'>('donut');

  const categories: BarCategory[] = [
    { key: 'TARGET', label: 'Target' },
    { key: 'ACHIEVED', label: 'Achieved' },
  ];

  const series: Series[] = [
    {
      key: 'target',
      label: 'Target',
      // Coral Rose for target
      color: '#F3774D',
      values: { TARGET: target, ACHIEVED: 0 },
    },
    {
      key: 'achieved',
      label: 'Achieved',
      // Teal with dark‑greenish shade combo for achieved
      color: 'linear-gradient(180deg, #0F766E 0%, #166534 100%)',
      values: { TARGET: 0, ACHIEVED: achieved },
    },
  ];

  const totals = useMemo(
    () =>
      categories.map((cat) =>
        series.reduce((sum, item) => sum + (item.values[cat.key] ?? 0), 0),
      ),
    [categories, series],
  );

  const maxTotal = totals.length ? Math.max(...totals) : 0;
  const hasData = categories.length > 0 && series.length > 0;
  const ticks = useMemo(() => buildNiceTicks(maxTotal), [maxTotal]);
  const gridTicks = useMemo(() => ticks.filter((t) => t > 0), [ticks]);

  const safeTarget = Math.max(target, 0);
  const safeAchieved = Math.max(achieved, 0);
  const donutTotal = safeTarget + safeAchieved || 1;
  const achievedAngle = (safeAchieved / donutTotal) * 360;

  const achievedSliceColor = '#0F766E';
  const targetSliceColor = '#F3774D';

  const donutGradient =
    donutTotal > 0
      ? `conic-gradient(${achievedSliceColor} 0deg ${achievedAngle}deg, ${targetSliceColor} ${achievedAngle}deg 360deg)`
      : 'conic-gradient(#e2e8f0 0deg 360deg)';

  return (
    <section className="role-dashboard-card presales-analytics-card">
      <div className="analytics-card-header">
        <div>
          <h3
            onClick={onTitleClick}
            style={onTitleClick ? { cursor: 'pointer', userSelect: 'none' } : {}}
            title={onTitleClick ? 'Click to view details' : undefined}
          >
            Target vs achieved
          </h3>
        </div>
        <div className="analytics-card-controls">
          <div className="activity-chart-toggle">
            <button
              type="button"
              className={view === 'donut' ? 'active' : ''}
              onClick={() => setView('donut')}
            >
              Donut
            </button>
            <button
              type="button"
              className={view === 'bar' ? 'active' : ''}
              onClick={() => setView('bar')}
            >
              Bar graph
            </button>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="analytics-empty">No target data available for the selected range.</div>
      ) : (
        <>
          {view === 'donut' ? (
            <div className="target-donut-wrapper">
              <div className="target-donut-visual">
                <div className="target-donut-ring" style={{ backgroundImage: donutGradient }}>
                  <div className="target-donut-hole" />
                </div>
              </div>
              <div className="target-donut-legend">
                <div className="target-donut-legend-row">
                  <span className="target-donut-dot target-donut-dot-achieved" />
                  <span className="target-donut-legend-label">Achieved</span>
                  <span className="target-donut-legend-value">{formatCount(safeAchieved)}</span>
                </div>
                <div className="target-donut-legend-row">
                  <span className="target-donut-dot target-donut-dot-target" />
                  <span className="target-donut-legend-label">Target</span>
                  <span className="target-donut-legend-value">{formatCount(safeTarget)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="stacked-bars-wrapper">
              <div className="y-axis">
                <div className="y-axis-label">Amount</div>
                <div className="y-axis-ticks">
                  {ticks.map((tick) => {
                    const isZeroTick = tick === 0;
                    // Hide labels for 0 and 100
                    if (tick === 0 || tick === 100) {
                      return (
                        <div key={tick} className={`y-axis-tick${isZeroTick ? ' y-axis-tick-zero' : ''}`}>
                          <span aria-hidden="true" />
                        </div>
                      );
                    }
                    return (
                      <div key={tick} className={`y-axis-tick${isZeroTick ? ' y-axis-tick-zero' : ''}`}>
                        <span aria-hidden="true">{formatCount(tick)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="stacked-bars-area">
                <div className="stacked-bars-plot">
                  <div className="stacked-bars-grid">
                    {gridTicks.map((tick) => (
                      <div key={tick} className="stacked-bars-grid-line" />
                    ))}
                  </div>
                  <div className="stacked-bars">
                    {categories.map((cat, idx) => {
                      const totalForCat = totals[idx] || 0;
                      const totalHeight = maxTotal ? (totalForCat / maxTotal) * 100 : 0;
                      return (
                        <div key={cat.key} className="stacked-bar">
                          <div className="stacked-bar-stack" aria-label={cat.label}>
                            {series.map((item) => {
                              const value = item.values[cat.key] ?? 0;
                              const height = totalForCat ? (value / totalForCat) * totalHeight : 0;
                              return (
                                <div
                                  key={`${item.key}-${cat.key}`}
                                  className="stacked-bar-segment"
                                  style={{ height: `${height}%`, background: item.color }}
                                  title={`${item.label}: ${formatCount(value)}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="x-axis-row">
                    <div className="x-axis-line" />
                  </div>
                </div>
                <div className="stacked-bar-labels">
                  {categories.map((cat, idx) => {
                    const totalForCat = totals[idx] || 0;
                    return (
                      <div key={cat.key} className="stacked-bar-label">
                        <span className="stacked-bar-label-text">{cat.label}</span>
                        <span className="stacked-bar-count">{formatCount(totalForCat)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const chartPalette = ['#2563eb', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#0ea5e9', '#14b8a6', '#f97316'];

const parseActivityDate = (activity: Activity): Date | null => {
  const raw = activity.dateTime || activity.date || activity.dueDate || activity.createdAt || activity.updatedAt;
  if (!raw) return null;

  if (raw.includes('/')) {
    const [dd, mm, yyyy] = raw.split('/');
    const day = Number(dd);
    const month = Number(mm);
    const year = Number(yyyy);
    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
      return new Date(year, month - 1, day);
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseIsoDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWithinRange = (date: Date | null, start: Date, end: Date): boolean => {
  if (!date) return false;
  return date >= start && date <= end;
};

const getOrgKey = (id?: number | null, name?: string | null): string => {
  if (id) return String(id);
  return `org:${(name || 'Unassigned').trim().toLowerCase()}`;
};

const formatCount = (value: number): string => value.toLocaleString();

type ActivityProgressCounts = {
  total: number;
  completed: number;
  pending: number;
};

const buildNiceTicks = (maxValue: number): number[] => {
  if (!maxValue || maxValue <= 0) return [0, 100];
  const niceMax = Math.max(100, Math.ceil(maxValue / 100) * 100);
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax; v += 100) {
    ticks.push(v);
  }
  return ticks;
};

function StackedBarChart({
  title,
  subtitle,
  categories,
  series,
  xLabel,
  yLabel = 'Count',
  onTitleClick,
  legendItems,
  categoryColors,
  variant = 'stacked',
}: {
  title: string;
  subtitle?: string;
  categories: BarCategory[];
  series: Series[];
  xLabel?: string;
  yLabel?: string;
  onTitleClick?: () => void;
  legendItems?: { label: string; color: string }[];
  categoryColors?: Record<string, string>;
  // 'stacked' = segments on top of each other, 'grouped' = side‑by‑side bars
  variant?: 'stacked' | 'grouped';
}) {
  const totals = useMemo(
    () =>
      categories.map((cat) =>
        series.reduce((sum, item) => sum + (item.values[cat.key] ?? 0), 0),
      ),
    [categories, series],
  );

  const maxTotal = totals.length ? Math.max(...totals) : 0;
  // Always render when we have category+series definitions, even if all counts are zero.
  const hasData = categories.length > 0 && series.length > 0;
  const ticks = useMemo(() => buildNiceTicks(maxTotal), [maxTotal]);
  // Grid ticks (exclude baseline) rendered in ascending order; CSS reverses them.
  const gridTicks = useMemo(() => ticks.filter((t) => t > 0), [ticks]);

  // For grouped bars we need a max of individual series values
  const maxSingleValue = useMemo(() => {
    let max = 0;
    series.forEach((s) => {
      Object.values(s.values).forEach((v) => {
        const n = Number(v) || 0;
        if (n > max) max = n;
      });
    });
    return max;
  }, [series]);

  const [hoveredSegment, setHoveredSegment] = useState<{
    categoryKey: string;
    categoryLabel: string;
    total: number;
    breakdown: Array<{ orgLabel: string; count: number; percent: number }>;
  } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const barAreaRef = useRef<HTMLDivElement>(null);

  return (
    <section className="role-dashboard-card presales-analytics-card">
      <div className="analytics-card-header">
        <div>
          <h3 
            onClick={onTitleClick}
            style={onTitleClick ? { cursor: 'pointer', userSelect: 'none' } : {}}
            title={onTitleClick ? 'Click to view details' : undefined}
          >
            {title}
          </h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="analytics-card-controls">
          {legendItems && legendItems.length ? (
            <div className="stacked-bar-legend stacked-bar-legend--two-rows">
              <div className="stacked-bar-legend-row">
                {legendItems.slice(0, 2).map((item) => (
                  <div key={item.label} className="stacked-bar-legend-item">
                    <span className="stacked-bar-legend-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="stacked-bar-legend-row">
                {legendItems.slice(2).map((item) => (
                  <div key={item.label} className="stacked-bar-legend-item">
                    <span className="stacked-bar-legend-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!hasData ? (
        <div className="analytics-empty">No data available for the selected range.</div>
      ) : (
        <>
          <div className="stacked-bars-wrapper">
            <div className="y-axis">
              <div className="y-axis-label">{yLabel}</div>
              <div className="y-axis-ticks">
                {ticks.map((tick) => {
                  const isZeroTick = tick === 0;
                  return (
                    <div key={tick} className={`y-axis-tick${isZeroTick ? ' y-axis-tick-zero' : ''}`}>
                      <span aria-hidden="true" />
                  </div>
                  );
                })}
              </div>
            </div>
            <div className="stacked-bars-area" ref={barAreaRef} style={{ position: 'relative' }}>
              {hoveredSegment && tooltipPosition && (
                <div
                  className="pie-chart-slice-tooltip"
                  style={{
                    position: 'absolute',
                    left: `${tooltipPosition.x}px`,
                    top: `${tooltipPosition.y}px`,
                    transform: 'translate(-50%, -100%)',
                    marginTop: '-8px',
                    zIndex: 1000,
                  }}
                >
                  <div className="pie-chart-tooltip-title">{hoveredSegment.categoryLabel}</div>
                  {hoveredSegment.breakdown.map((b) => (
                    <div key={b.orgLabel} className="pie-chart-tooltip-row">
                      <span className="pie-chart-tooltip-label">{b.orgLabel}</span>
                      <span className="pie-chart-tooltip-value">
                        {b.count} ({b.percent}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="stacked-bars-plot">
                <div className="stacked-bars-grid">
                  {gridTicks.map((tick) => (
                    <div key={tick} className="stacked-bars-grid-line" />
                  ))}
                </div>
                <div className="stacked-bars">
                  {categories.map((cat, idx) => {
                    const totalForCat = totals[idx] || 0;
                    const totalHeight = maxTotal ? (totalForCat / maxTotal) * 100 : 0;
                    // Calculate organization breakdown for this category
                    const breakdown = series
                      .map((item) => ({
                        orgLabel: item.label,
                        count: item.values[cat.key] ?? 0,
                        color: item.color,
                      }))
                      .filter((b) => b.count > 0)
                      .map((b) => ({
                        ...b,
                        percent: totalForCat > 0 ? Math.round((b.count / totalForCat) * 100) : 0,
                      }))
                      .sort((a, b) => b.count - a.count);

                    const handleBarMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
                      if (totalForCat === 0 || breakdown.length === 0) return;
                      const rect = barAreaRef.current?.getBoundingClientRect();
                      if (rect) {
                        setHoveredSegment({
                          categoryKey: cat.key,
                          categoryLabel: cat.label,
                          total: totalForCat,
                          breakdown,
                        });
                        setTooltipPosition({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                        });
                      }
                    };

                    const handleBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
                      if (hoveredSegment && hoveredSegment.categoryKey === cat.key) {
                        const rect = barAreaRef.current?.getBoundingClientRect();
                        if (rect) {
                          setTooltipPosition({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                          });
                        }
                      }
                    };

                    const handleBarMouseLeave = () => {
                      if (hoveredSegment && hoveredSegment.categoryKey === cat.key) {
                        setHoveredSegment(null);
                        setTooltipPosition(null);
                      }
                    };

                    if (variant === 'grouped') {
                    return (
                        <div
                          key={cat.key}
                          className="stacked-bar"
                          onMouseEnter={handleBarMouseEnter}
                          onMouseMove={handleBarMouseMove}
                          onMouseLeave={handleBarMouseLeave}
                        >
                          <div className="stacked-bar-group-bars" aria-label={cat.label}>
                            {series.map((item) => {
                              const value = item.values[cat.key] ?? 0;
                              const height = maxSingleValue ? (value / maxSingleValue) * 100 : 0;
                              return (
                                <div
                                  key={`${item.key}-${cat.key}`}
                                  className="grouped-bar"
                                  style={{ height: `${height}%`, background: item.color }}
                                  title={`${item.label}: ${value}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={cat.key}
                        className="stacked-bar"
                        onMouseEnter={handleBarMouseEnter}
                        onMouseMove={handleBarMouseMove}
                        onMouseLeave={handleBarMouseLeave}
                      >
                        <div className="stacked-bar-stack" aria-label={cat.label}>
                          {series.map((item) => {
                            const value = item.values[cat.key] ?? 0;
                            const height = totalForCat ? (value / totalForCat) * totalHeight : 0;
                            const segmentColor =
                              categoryColors && series.length === 1
                                ? categoryColors[cat.key] || item.color
                                : item.color;
                            return (
                              <div
                                key={`${item.key}-${cat.key}`}
                                className="stacked-bar-segment"
                                style={{ height: `${height}%`, background: segmentColor }}
                                title={`${item.label}: ${value}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="x-axis-row">
                  <div className="x-axis-line" />
                </div>
              </div>
              <div className="stacked-bar-labels">
                {categories.map((cat, idx) => {
                  const totalForCat = totals[idx] || 0;
                  return (
                    <div key={cat.key} className="stacked-bar-label">
                      <span className="stacked-bar-label-text">{cat.label}</span>
                      <span className="stacked-bar-count">{formatCount(totalForCat)}</span>
                    </div>
                  );
                })}
              </div>
              {xLabel ? <div className="x-axis-label">{xLabel}</div> : null}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function PieChart({
  title,
  slices,
  onTitleClick,
}: {
  title: string;
  slices: PieSlice[];
  onTitleClick?: () => void;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const hasData = total > 0;
  const [_hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hoveredSlice, setHoveredSlice] = useState<PieSlice | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const pieRef = useRef<HTMLDivElement>(null);

  const gradient = useMemo(() => {
    if (!hasData) return 'conic-gradient(#e2e8f0 0deg 360deg)';
    let current = 0;
    const parts: string[] = [];
    slices.forEach((slice) => {
      const angle = (slice.value / total) * 360;
      const next = current + angle;
      parts.push(`${slice.color} ${current}deg ${next}deg`);
      current = next;
    });
    return `conic-gradient(${parts.join(', ')})`;
  }, [hasData, slices, total]);

  const handlePieMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pieRef.current || !hasData) return;
    
    const rect = pieRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;
    
    // Calculate angle from center (0° is at top, clockwise)
    let angle = Math.atan2(mouseY, mouseX) * (180 / Math.PI);
    angle = (angle + 90 + 360) % 360; // Adjust so 0° is at top
    
    // Calculate distance from center
    const distance = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
    const radius = rect.width / 2;
    
    // Only show tooltip if mouse is within the pie circle
    if (distance > radius) {
      setHoveredSlice(null);
      setTooltipPosition(null);
      return;
    }
    
    // Find which slice contains this angle
    let currentAngle = 0;
    for (const slice of slices) {
      const sliceAngle = (slice.value / total) * 360;
      const nextAngle = currentAngle + sliceAngle;
      
      if (angle >= currentAngle && angle < nextAngle) {
        setHoveredSlice(slice);
        setHoveredKey(slice.key);
        // Position tooltip near the slice
        setTooltipPosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        return;
      }
      currentAngle = nextAngle;
    }
    
    setHoveredSlice(null);
    setTooltipPosition(null);
  };

  const handlePieMouseLeave = () => {
    setHoveredSlice(null);
    setTooltipPosition(null);
  };

  return (
    <section className="role-dashboard-card presales-analytics-card">
      <div className="analytics-card-header">
        <div>
          <h3 
            onClick={onTitleClick}
            style={onTitleClick ? { cursor: 'pointer', userSelect: 'none' } : {}}
            title={onTitleClick ? 'Click to view details' : undefined}
          >
            {title}
          </h3>
        </div>
      </div>
      {!hasData ? (
        <div className="analytics-empty">No deals available for this period.</div>
      ) : (
        <div className="pie-chart-with-legend">
          <div
            ref={pieRef}
            className="pie-chart-visual"
            style={{ backgroundImage: gradient, position: 'relative' }}
            onMouseMove={handlePieMouseMove}
            onMouseLeave={handlePieMouseLeave}
          >
            {hoveredSlice && hoveredSlice.breakdown && hoveredSlice.breakdown.length > 0 && tooltipPosition && (
              <div
                className="pie-chart-slice-tooltip"
                style={{
                  position: 'absolute',
                  left: `${tooltipPosition.x}px`,
                  top: `${tooltipPosition.y}px`,
                  transform: 'translate(-50%, -100%)',
                  marginTop: '-8px',
                }}
              >
                <div className="pie-chart-tooltip-title">{hoveredSlice.label}</div>
                {hoveredSlice.breakdown.map((b) => (
                  <div key={b.orgLabel} className="pie-chart-tooltip-row">
                    <span className="pie-chart-tooltip-label">{b.orgLabel}</span>
                    <span className="pie-chart-tooltip-value">
                      {b.count} ({b.percent}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pie-chart-legend">
            {slices.map((slice) => {
              const percent = total ? Math.round((slice.value / total) * 100) : 0;
              return (
                <div
                  key={slice.key}
                  className="pie-legend-item"
                >
                  <div className="pie-legend-dot" style={{ background: slice.color }} />
                  <div className="pie-legend-content">
                    <div className="pie-legend-label">{slice.label}</div>
                    <div className="pie-legend-percent">{percent}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function DealDurationWidget({ 
  averageDuration, 
  onTotalDealValueClick,
  onTitleClick,
  dateRange,
  onDateRangeChange,
  totalDealValue,
  customRange,
  onCustomRangeChange,
}: { 
  averageDuration: number;
  onTotalDealValueClick: () => void;
  onTitleClick?: () => void;
  dateRange: 'month' | 'year' | 'custom';
  onDateRangeChange: (range: 'month' | 'year' | 'custom') => void;
  totalDealValue: number;
  customRange: { from: string; to: string };
  onCustomRangeChange: (from: string, to: string) => void;
}) {
  const storedUser = getStoredUser();
  const userName = storedUser?.firstName || storedUser?.email || 'User';
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const dateMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dateMenuRef.current && !dateMenuRef.current.contains(target)) {
        setDateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, []);

  const getDateRangeLabel = () => {
    if (dateRange === 'month') return 'THIS MONTH';
    if (dateRange === 'year') return 'THIS YEAR';
    if (dateRange === 'custom' && customRange.from && customRange.to) {
      return `${customRange.from} → ${customRange.to}`;
    }
    return 'DATE RANGE';
  };

  const formatDateForInput = (dateStr: string): string => {
    // Convert DD/MM/YYYY to YYYY-MM-DD for input
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [dd, mm, yyyy] = parts;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return '';
  };

  const formatDateForDisplay = (dateStr: string): string => {
    // Convert YYYY-MM-DD to DD/MM/YYYY for storage/display
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      return `${dd}/${mm}/${yyyy}`;
    }
    return dateStr;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  return (
    <section 
      className="role-dashboard-card presales-analytics-card deal-duration-widget"
    >
      <div className="analytics-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="deal-duration-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 2C5.58 2 2 5.58 2 10C2 14.42 5.58 18 10 18C14.42 18 18 14.42 18 10C18 5.58 14.42 2 10 2ZM10 16C6.69 16 4 13.31 4 10C4 6.69 6.69 4 10 4C13.31 4 16 6.69 16 10C16 13.31 13.31 16 10 16ZM10.5 6H9V11L13.25 13.15L14 11.92L10.5 10.25V6Z" fill="currentColor"/>
            </svg>
          </div>
          <h3 
            onClick={onTitleClick}
            style={onTitleClick ? { cursor: 'pointer', userSelect: 'none' } : {}}
            title={onTitleClick ? 'Click to view details' : undefined}
          >
            Deal duration
          </h3>
        </div>
        <div className="analytics-card-controls">
          <button className="analytics-icon-btn" type="button" aria-label="Edit">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.3333 2L14 4.66667L5.33333 13.3333H2.66667V10.6667L11.3333 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="analytics-icon-btn" type="button" aria-label="Move">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 3L3 5L5 7M11 3L13 5L11 7M5 13L3 11L5 9M11 13L13 11L11 9M7 3L9 3L9 13L7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="deal-duration-content">
        <div className="deal-duration-filters">
          <div className="deal-duration-date-filter" ref={dateMenuRef}>
            <button 
              className="deal-duration-filter-tag deal-duration-filter-tag-clickable"
              onClick={(e) => {
                e.stopPropagation();
                setDateMenuOpen(!dateMenuOpen);
              }}
            >
              {getDateRangeLabel()}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: '4px' }}>
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {dateMenuOpen && (
              <div className="deal-duration-date-menu">
                <button
                  type="button"
                  className={`deal-duration-date-option${dateRange === 'month' ? ' selected' : ''}`}
                  onClick={() => {
                    // Clearing custom range when switching preset
                    onCustomRangeChange('', '');
                    onDateRangeChange('month');
                    setDateMenuOpen(false);
                  }}
                >
                  This month
                </button>
                <button
                  type="button"
                  className={`deal-duration-date-option${dateRange === 'year' ? ' selected' : ''}`}
                  onClick={() => {
                    onCustomRangeChange('', '');
                    onDateRangeChange('year');
                    setDateMenuOpen(false);
                  }}
                >
                  This year
                </button>
                <button
                  type="button"
                  className={`deal-duration-date-option${dateRange === 'custom' ? ' selected' : ''}`}
                  onClick={() => {
                    onDateRangeChange('custom');
                    setDateMenuOpen(false);
                  }}
                >
                  Date range
                </button>
              </div>
            )}
            {dateRange === 'custom' && (
              <div className="deal-duration-custom-range-panel">
                <div className="deal-duration-custom-range-row">
                  <input
                    type="date"
                    value={customRange.from ? formatDateForInput(customRange.from) : ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value) {
                        onCustomRangeChange(formatDateForDisplay(value), customRange.to);
                      } else {
                        onCustomRangeChange('', customRange.to);
                      }
                    }}
                    className="deal-duration-date-input"
                  />
                  <span style={{ padding: '0 4px', fontSize: '0.75rem', color: '#6b7280' }}>to</span>
                  <input
                    type="date"
                    value={customRange.to ? formatDateForInput(customRange.to) : ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value) {
                        onCustomRangeChange(customRange.from, formatDateForDisplay(value));
                      } else {
                        onCustomRangeChange(customRange.from, '');
                      }
                    }}
                    className="deal-duration-date-input"
                  />
                </div>
              </div>
            )}
          </div>
          <button 
            className="deal-duration-filter-tag deal-duration-filter-tag-clickable"
            onClick={(e) => {
              e.stopPropagation();
              onTotalDealValueClick();
            }}
          >
            {totalDealValue > 0 ? `Total Deal Value ${formatCurrency(totalDealValue)}` : '(NO VALUE)'}
          </button>
          <button className="deal-duration-user-btn">{userName.toUpperCase()}</button>
        </div>
        <div className="deal-duration-value">
          <div className="deal-duration-change">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 2L10 6H7V10H5V6H2L6 2Z" fill="#ef4444"/>
            </svg>
            <span>0 days</span>
          </div>
          <div className="deal-duration-main">{averageDuration} days</div>
          <div className="deal-duration-label">Average duration (days)</div>
        </div>
      </div>
    </section>
  );
}

function TodayActivitiesWidget({
  calls,
  meetings,
  activities,
  progressColor,
  onTitleClick,
}: {
  calls: ActivityProgressCounts;
  meetings: ActivityProgressCounts;
  activities: ActivityProgressCounts;
  progressColor: string;
  onTitleClick?: () => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<'call' | 'meeting' | 'activity' | null>(null);

  const rows: { key: 'call' | 'meeting' | 'activity'; label: string; data: ActivityProgressCounts }[] = [
    { key: 'call', label: 'call', data: calls },
    { key: 'meeting', label: 'meeting', data: meetings },
    { key: 'activity', label: 'activity', data: activities },
  ];

  const badgeColors: Record<'call' | 'meeting' | 'activity', string> = {
    call: '#2FA4A9', // Muted Teal
    meeting: '#5B6EE1', // Soft Indigo
    activity: '#F2A65A', // Warm Amber
  };

  return (
    <section className="role-dashboard-card presales-analytics-card today-activities-widget">
      <div className="analytics-card-header">
        <div>
          <h3 
            onClick={onTitleClick}
            style={onTitleClick ? { cursor: 'pointer', userSelect: 'none' } : {}}
            title={onTitleClick ? 'Click to view details' : undefined}
          >
            Total Activities
          </h3>
        </div>
      </div>
      <div className="today-activities-list">
        {rows.map(({ key, label, data }) => {
          const { total, completed, pending } = data;
          const completionPct = total > 0 ? Math.min(100, Math.max(0, (completed / total) * 100)) : 0;

          return (
            <div
              key={key}
              className="today-activity-item"
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey((current) => (current === key ? null : current))}
            >
              <div className="today-activity-main">
                <span className="today-activity-label">{label}</span>
                <div className="today-activity-progress-row">
                  <div className="today-activity-progress-track">
                    <div
                      className="today-activity-progress-fill"
                      style={{
                        width: `${completionPct}%`,
                        background: progressColor,
                      }}
                    />
                  </div>
                </div>
        </div>
              <span
                className="today-activity-badge"
                style={{ backgroundColor: badgeColors[key] }}
              >
                {formatCount(completed)}
              </span>
              {hoveredKey === key && (
                <div className="pie-chart-slice-tooltip today-activity-tooltip">
                  <div className="pie-chart-tooltip-title">
                    {label.charAt(0).toUpperCase() + label.slice(1)} summary
                  </div>
                  <div className="pie-chart-tooltip-row">
                    <span className="pie-chart-tooltip-label">Total</span>
                    <span className="pie-chart-tooltip-value">{formatCount(total)}</span>
                  </div>
                  <div className="pie-chart-tooltip-row">
                    <span className="pie-chart-tooltip-label">Completed</span>
                    <span className="pie-chart-tooltip-value">{formatCount(completed)}</span>
                  </div>
                  <div className="pie-chart-tooltip-row">
                    <span className="pie-chart-tooltip-label">Pending</span>
                    <span className="pie-chart-tooltip-value">{formatCount(pending)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActivityTypeFunnel({
  title,
  rows,
  onTitleClick,
  legendItems,
}: {
  title: string;
  rows: {
    key: string;
    label: string;
    value: number;
    breakdown: { label: string; count: number; color: string }[];
  }[];
  onTitleClick?: () => void;
  legendItems?: { label: string; color: string }[];
}) {
  const max = useMemo(
    () => (rows.length ? Math.max(...rows.map((r) => r.value || 0)) : 0),
    [rows],
  );

  const palette = ['#0F766E', '#1E293B', '#3B82F6'];

  const hasData = rows.some((r) => r.value > 0);

  const [hoveredRow, setHoveredRow] = useState<{
    key: string;
    label: string;
    breakdown: { label: string; count: number; color: string; percent: number }[];
  } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const funnelRef = useRef<HTMLDivElement | null>(null);

  return (
    <section className="role-dashboard-card presales-analytics-card activity-type-funnel">
      <div className="analytics-card-header">
        <div>
          <h3
            onClick={onTitleClick}
            style={onTitleClick ? { cursor: 'pointer', userSelect: 'none' } : {}}
            title={onTitleClick ? 'Click to view details' : undefined}
          >
            {title}
          </h3>
        </div>
        <div className="analytics-card-controls">
          {legendItems && legendItems.length ? (
            <div className="stacked-bar-legend stacked-bar-legend--two-rows">
              <div className="stacked-bar-legend-row">
                {legendItems.slice(0, 2).map((item) => (
                  <div key={item.label} className="stacked-bar-legend-item">
                    <span className="stacked-bar-legend-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="stacked-bar-legend-row">
                {legendItems.slice(2).map((item) => (
                  <div key={item.label} className="stacked-bar-legend-item">
                    <span className="stacked-bar-legend-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {!hasData ? (
        <div className="analytics-empty">No activity data for the selected range.</div>
      ) : (
        <div
          className="activity-funnel-list-wrapper"
          ref={funnelRef}
          style={{ position: 'relative' }}
        >
          {hoveredRow && tooltipPosition && (
            <div
              className="pie-chart-slice-tooltip"
              style={{
                position: 'absolute',
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y}px`,
                transform: 'translate(-50%, -100%)',
                marginTop: '-8px',
                zIndex: 1000,
              }}
            >
              <div className="pie-chart-tooltip-title">{hoveredRow.label}</div>
              {hoveredRow.breakdown.map((b) => (
                <div key={b.label} className="pie-chart-tooltip-row">
                  <span className="pie-chart-tooltip-label">{b.label}</span>
                  <span className="pie-chart-tooltip-value">
                    {b.count} ({b.percent}%)
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="activity-funnel-list">
            {rows.map((row, index) => {
              let width = 0;
              if (max) {
                const pct = (row.value / max) * 100;
                // Ensure bars are wide enough to show labels.
                if (row.value === 0) {
                  width = 35;
                } else {
                  width = Math.max(35, pct);
                }
              } else {
                // When everything is zero, show medium-width bars.
                width = 60;
              }
              const fallbackColor = palette[index] ?? palette[palette.length - 1];

              let background = fallbackColor;
              const totalForRow = row.value || 0;
              if (row.breakdown && row.breakdown.length > 0 && totalForRow > 0) {
                let current = 0;
                const stops: string[] = [];
                row.breakdown.forEach((segment) => {
                  const segmentPct = (segment.count / totalForRow) * 100;
                  const next = current + segmentPct;
                  stops.push(
                    `${segment.color} ${current.toFixed(2)}% ${next.toFixed(2)}%`,
                  );
                  current = next;
                });
                background = `linear-gradient(90deg, ${stops.join(', ')})`;
              }

              const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
                if (!funnelRef.current || !row.breakdown || row.breakdown.length === 0 || !row.value) {
                  setHoveredRow(null);
                  setTooltipPosition(null);
                  return;
                }
                const rect = funnelRef.current.getBoundingClientRect();
                const breakdownWithPercent = row.breakdown.map((seg) => ({
                  ...seg,
                  percent: row.value ? Math.round((seg.count / row.value) * 100) : 0,
                }));
                setHoveredRow({
                  key: row.key,
                  label: row.label,
                  breakdown: breakdownWithPercent,
                });
                setTooltipPosition({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              };

              const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
                if (!funnelRef.current || !hoveredRow || hoveredRow.key !== row.key) return;
                const rect = funnelRef.current.getBoundingClientRect();
                setTooltipPosition({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              };

              const handleMouseLeave = () => {
                if (hoveredRow && hoveredRow.key === row.key) {
                  setHoveredRow(null);
                  setTooltipPosition(null);
                }
              };

              return (
                <div
                  key={row.key}
                  className="activity-funnel-row"
                  onMouseEnter={handleMouseEnter}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className="activity-funnel-bar-wrapper">
                    <div
                      className="activity-funnel-bar"
                      style={{
                        width: `${width}%`,
                        background,
                      }}
                    >
                      <span className="activity-funnel-bar-label">{row.label}</span>
                    </div>
                  </div>
                  <div className="activity-funnel-value">{formatCount(row.value)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default function PreSalesDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [targetAmount, setTargetAmount] = useState(0);
  const [, setTargetsByUser] = useState<Record<number, number>>({});

  const [deals, setDeals] = useState<Deal[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<number[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const user = getStoredUser();
      const key = `presalesDashboardOrgFilter:${user?.userId || 'anonymous'}`;
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const user = getStoredUser();
      const key = `presalesDashboardUserFilter:${user?.userId || 'anonymous'}`;
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [timeRange, setTimeRange] = useState<TimeRange>(() => {
    if (typeof window === 'undefined') return 'today';
    try {
      const user = getStoredUser();
      const key = `presalesDashboardDateFilter:${user?.userId || 'anonymous'}`;
      const raw = window.localStorage.getItem(key);
      if (!raw) return 'today';
      const parsed = JSON.parse(raw) as { timeRange?: TimeRange };
      return parsed.timeRange || 'today';
    } catch {
      return 'today';
    }
  });
  const [dealDurationModalOpen, setDealDurationModalOpen] = useState(false);
  const [dealDurationDateRange, setDealDurationDateRange] = useState<'month' | 'year' | 'custom'>('month');
  const [dealDurationCustomRange, setDealDurationCustomRange] = useState<{ from: string; to: string }>({
    from: '',
    to: '',
  });
  const [persons, setPersons] = useState<Person[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [quarterDropdownOpen, setQuarterDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const orgMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const dateMenuRef = useRef<HTMLDivElement | null>(null);
  const storedUser = getStoredUser();
  const displayName =
    [storedUser?.firstName, storedUser?.lastName].filter(Boolean).join(' ').trim() ||
    storedUser?.email ||
    'there';

  const dateFilterStorageKey = useMemo(
    () => `presalesDashboardDateFilter:${storedUser?.userId || 'anonymous'}`,
    [storedUser?.userId],
  );

  const orgFilterStorageKey = useMemo(
    () => `presalesDashboardOrgFilter:${storedUser?.userId || 'anonymous'}`,
    [storedUser?.userId],
  );

  const userFilterStorageKey = useMemo(
    () => `presalesDashboardUserFilter:${storedUser?.userId || 'anonymous'}`,
    [storedUser?.userId],
  );

  // Load previously selected date filter for this user (within the current login/session).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawDate = window.localStorage.getItem(dateFilterStorageKey);
      if (rawDate) {
        const parsed = JSON.parse(rawDate) as {
        timeRange?: TimeRange;
        selectedMonth?: number;
        selectedQuarter?: number;
        selectedYear?: number;
        customRange?: { from: string; to: string };
      };
        if (parsed.timeRange) {
          setTimeRange(parsed.timeRange);
        }
        if (typeof parsed.selectedMonth === 'number') {
          setSelectedMonth(parsed.selectedMonth);
        }
        if (typeof parsed.selectedQuarter === 'number') {
          setSelectedQuarter(parsed.selectedQuarter);
        }
        if (typeof parsed.selectedYear === 'number') {
          setSelectedYear(parsed.selectedYear);
        }
        if (parsed.customRange && parsed.customRange.from && parsed.customRange.to) {
          setCustomRange(parsed.customRange);
        }
      }

      const rawOrgs = window.localStorage.getItem(orgFilterStorageKey);
      if (rawOrgs) {
        const parsedOrgs = JSON.parse(rawOrgs) as number[];
        if (Array.isArray(parsedOrgs)) {
          setSelectedOrgIds(parsedOrgs);
        }
      }

      const rawUsers = window.localStorage.getItem(userFilterStorageKey);
      if (rawUsers) {
        const parsedUsers = JSON.parse(rawUsers) as number[];
        if (Array.isArray(parsedUsers)) {
          setSelectedUserIds(parsedUsers);
        }
      }
    } catch {
      // Ignore malformed stored value
    }
  }, [dateFilterStorageKey, orgFilterStorageKey, userFilterStorageKey]);

  useEffect(() => {
    const controller = new AbortController();
    const storedUser = getStoredUser();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          orgListPrimary,
          dealsList,
          activityList,
          pipelineList,
          teamsList,
          userList,
          targetSum,
        ] = await Promise.all([
          organizationsApi.listAccessibleForCurrentUser().catch(() => []),
          dealsApi.list().catch(() => []),
          activitiesApi.list(
            {
              page: 0,
              size: 1000,
            },
            { signal: controller.signal },
          ),
          pipelinesApi.list({ includeStages: true }).catch(() => []),
          teamsApi.list().catch(() => []),
          usersApi.list().catch(() => []),
          (async () => {
            try {
              const now = new Date();
              const month = now.getMonth() + 1;
              const year = now.getFullYear();

              // 1) Load raw targets for the month (used for team comparison widgets)
              const targets = await targetsApi.list({ month, year });
              setTargetsByUser(
                targets.reduce<Record<number, number>>((acc, t) => {
                  if (t.userId) acc[t.userId] = (acc[t.userId] || 0) + (t.targetAmount || 0);
                  return acc;
                }, {}),
              );

              // 2) For the logged‑in user, prefer the per‑user monthly
              //    aggregation from `getUserTargetDetail`, because the
              //    backend normalizes targets differently for pre‑sales
              //    (count of diverted WON deals) vs sales (amount).
              let userTargetFromDetail = 0;
              if (storedUser?.userId) {
                try {
                  const detail = await targetsApi.getUserTargetDetail(storedUser.userId, year);
                  const monthData = detail.monthlyData?.find((m) => m.month === month && m.year === year);
                  if (monthData && typeof monthData.target === 'number') {
                    userTargetFromDetail = monthData.target;
                  }
                } catch {
                  // If detail API fails, silently fall back to list‑based aggregation below.
                }
              }

              if (userTargetFromDetail) {
                return userTargetFromDetail;
              }

              // 3) Fallback: sum targets from the raw list
              if (storedUser?.userId) {
                const forUser = targets.filter((t) => t.userId === storedUser.userId);
                return forUser.reduce((sum, t) => sum + (t.targetAmount || 0), 0);
              }
              return targets.reduce((sum, t) => sum + (t.targetAmount || 0), 0);
            } catch (_err) {
              return 0;
            }
          })(),
        ]);

        // For pre-sales users: filter organizations to only those owned by their sales manager
        let orgList = orgListPrimary && orgListPrimary.length > 0 ? orgListPrimary : [];
        
        if (storedUser?.userId && userList && userList.length > 0) {
          const currentUser = userList.find((u: any) => u.id === storedUser.userId);
          if (currentUser) {
            const userRole = (currentUser.role || '').toUpperCase();
            const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
            const isPresales = presalesRoleCodes.includes(userRole);
            
            if (isPresales && currentUser.managerId) {
              // Pre-sales user: only show organizations owned by their sales manager
              const allOrgs = await organizationsApi.list().catch(() => []);
              orgList = allOrgs.filter((org) => org.owner && org.owner.id === currentUser.managerId);
            } else if (orgList.length === 0) {
              // Fallback: if accessible orgs is empty (role mismatch), try full list
              orgList = await organizationsApi.list().catch(() => []);
            }
          } else if (orgList.length === 0) {
            // Fallback: if accessible orgs is empty, try full list
            orgList = await organizationsApi.list().catch(() => []);
          }
        } else if (orgList.length === 0) {
          // Fallback: if accessible orgs is empty, try full list
          orgList = await organizationsApi.list().catch(() => []);
        }

        setOrganizations(orgList || []);
        setDeals(dealsList || []);
        setActivities(activityList.content || []);
        setTargetAmount(targetSum || 0);
        setPipelines(pipelineList || []);
        setTeams(teamsList || []);
        setAllUsers(userList || []);
        setUsers(
          (userList || []).map((u: any) => {
            const baseName =
              `${(u.firstName || '').trim()} ${(u.lastName || '').trim()}`.trim() || u.email || `User #${u.id}`;
            const name = storedUser?.userId === u.id ? `${baseName} - me` : baseName;
            return { id: u.id, name };
          }),
        );
      } catch (err: any) {
        if (controller.signal.aborted) return;
        // eslint-disable-next-line no-console
        console.error('Failed to load Pre-Sales dashboard data', err);
        setError('Unable to load dashboard right now. Please try again.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => controller.abort();
  }, []);

  // Persist the currently selected date filter for this user so it stays
  // the same while they are logged in. Logout logic should clear storage
  // so that a fresh login goes back to the default "Today".
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload = {
        timeRange,
        selectedMonth,
        selectedQuarter,
        selectedYear,
        customRange,
      };
      window.localStorage.setItem(dateFilterStorageKey, JSON.stringify(payload));

      window.localStorage.setItem(orgFilterStorageKey, JSON.stringify(selectedOrgIds));
      window.localStorage.setItem(userFilterStorageKey, JSON.stringify(selectedUserIds));
    } catch {
      // Ignore write errors (e.g. storage full or disabled)
    }
  }, [
    customRange,
    dateFilterStorageKey,
    orgFilterStorageKey,
    selectedMonth,
    selectedOrgIds,
    selectedQuarter,
    selectedUserIds,
    selectedYear,
    timeRange,
    userFilterStorageKey,
  ]);

  useEffect(() => {
    const fetchPersons = async () => {
      try {
        const personsPage = await personsApi.list({ page: 0, size: 1000 });
        setPersons(personsPage.content || []);
      } catch (err) {
        console.error('Failed to load persons', err);
      }
    };
    fetchPersons();
  }, []);

  const now = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Format date to DD/MM/YYYY for URL params
  const formatDateForUrl = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // Handler to navigate to ActivitiesList with current filters
  const handleActivityTypeClick = () => {
    const params = new URLSearchParams();
    
    // Add date range filters
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    
    // Add organization filters if any selected
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    }
    
    // Add user filters if any selected
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    
    // Navigate to activities page with filters
    navigate(`/activities?${params.toString()}`);
  };

  // Handler for Activity status - filter by completed/pending
  const handleActivityStatusClick = () => {
    const params = new URLSearchParams();
    
    // Add date range filters
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    
    // Add organization filters if any selected
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    }
    
    // Add user filters if any selected
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    
    // Note: done filter will be handled by ActivitiesList based on tab selection
    // We'll set tab to show both completed and pending
    navigate(`/activities?${params.toString()}`);
  };

  // Handler for Today Activities - filter by today's date
  const handleTodayActivitiesClick = () => {
    const params = new URLSearchParams();
    
    // Set to today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDateForUrl(today);
    params.set('dateFrom', todayStr);
    params.set('dateTo', todayStr);
    
    // Add organization filters if any selected
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    }
    
    // Add user filters if any selected
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    
    // Set tab to Today
    params.set('tab', 'Today');
    
    navigate(`/activities?${params.toString()}`);
  };

  const handleTargetVsAchievedClick = () => {
    const params = new URLSearchParams();
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));

    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    }

    if (selectedUserIds.length > 0) {
      params.set('userId', selectedUserIds.join(','));
    }

    navigate(`/targets?${params.toString()}`);
  };

  // Handler for Activity by stage - filter by deal stage
  const handleActivityByStageClick = () => {
    const params = new URLSearchParams();
    
    // Add date range filters
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    
    // Add organization filters if any selected
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    }
    
    // Add user filters if any selected
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    
    // Note: Stage filtering will need to be handled via custom filters in ActivitiesList
    navigate(`/activities?${params.toString()}`);
  };

  const rangeBounds = useMemo(() => {
    const today = now;

    if (timeRange === 'today') {
      const start = new Date(today);
      const end = new Date(today);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }

    if (timeRange === 'week') {
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
      const start = new Date(today);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6); // Sunday
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }

    if (timeRange === 'custom-month') {
      const start = new Date(selectedYear, selectedMonth, 1);
      const end = new Date(selectedYear, selectedMonth + 1, 0);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }

    if (timeRange === 'custom-quarter') {
      const startMonth = (selectedQuarter - 1) * 3;
      const start = new Date(selectedYear, startMonth, 1);
      const end = new Date(selectedYear, startMonth + 3, 0);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }

    if (timeRange === 'custom-range') {
      const from = customRange.from ? new Date(customRange.from) : today;
      const to = customRange.to ? new Date(customRange.to) : today;
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }

    if (timeRange === 'quarter') {
      const startMonth = Math.floor(today.getMonth() / 3) * 3;
      const start = new Date(today.getFullYear(), startMonth, 1);
      const end = new Date(today.getFullYear(), startMonth + 3, 0);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }

    if (timeRange === 'year') {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }

    // default month
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end };
  }, [customRange, now, selectedMonth, selectedQuarter, timeRange]);
  const rangeStart = rangeBounds.from;
  const rangeEnd = rangeBounds.to;

  const accessibleOrgSet = useMemo(() => new Set(organizations.map((o) => o.id)), [organizations]);
  const selectedOrgSet = useMemo(() => new Set(selectedOrgIds), [selectedOrgIds]);
  const selectedUserSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  // For pre-sales users: find accessible pipeline IDs based on:
  // 1. Teams managed by their sales manager or teams they are members of
  // 2. Pipelines linked to accessible organizations (owned by sales manager)
  const accessiblePipelineIds = useMemo(() => {
    const storedUser = getStoredUser();
    if (!storedUser?.userId || !allUsers.length || !pipelines.length) {
      return new Set<number>(); // Return empty set if data not ready
    }

    const currentUser = allUsers.find((u: any) => u.id === storedUser.userId);
    if (!currentUser) return new Set<number>();

    const userRole = (currentUser.role || '').toUpperCase();
    const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
    const isPresales = presalesRoleCodes.includes(userRole);

    if (!isPresales) {
      // Not a pre-sales user, return empty set (will show all deals if no restrictions)
      return new Set<number>();
    }

    const relevantPipelineIds: number[] = [];

    // Method 1: Find pipelines through teams
    if (teams.length > 0) {
      const relevantTeamIds = new Set<number>();

      // Find teams where the pre-sales user is a member
      const teamsAsMember = teams.filter((team) => 
        team.members.some((member) => member.id === currentUser.id)
      );
      teamsAsMember.forEach((team) => relevantTeamIds.add(team.id));

      // Also find teams where the sales manager (pre-sales user's manager) is the team manager
      if (currentUser.managerId) {
        const salesManagerId = currentUser.managerId;
        const teamsAsManager = teams.filter((team) => team.manager?.id === salesManagerId);
        teamsAsManager.forEach((team) => relevantTeamIds.add(team.id));
      }

      // Find pipelines linked to those teams
      pipelines
        .filter((pipeline) => pipeline.teamId && relevantTeamIds.has(pipeline.teamId))
        .forEach((pipeline) => relevantPipelineIds.push(pipeline.id));
    }

    // Method 2: Find pipelines linked to accessible organizations (owned by sales manager)
    if (currentUser.managerId && organizations.length > 0) {
      const salesManagerId = currentUser.managerId;
      const accessibleOrgIds = new Set(
        organizations
          .filter((org) => org.owner && org.owner.id === salesManagerId)
          .map((org) => org.id)
      );

      // Find pipelines linked to those organizations
      pipelines
        .filter((pipeline) => pipeline.organization?.id && accessibleOrgIds.has(pipeline.organization.id))
        .forEach((pipeline) => relevantPipelineIds.push(pipeline.id));
    }

    return new Set(relevantPipelineIds);
  }, [allUsers, teams, pipelines, organizations]);

  // Check if current user is pre-sales to determine filtering behavior
  const isPresalesUser = useMemo(() => {
    const storedUser = getStoredUser();
    if (!storedUser?.userId || !allUsers.length) return false;
    const currentUser = allUsers.find((u: any) => u.id === storedUser.userId);
    if (!currentUser) return false;
    const userRole = (currentUser.role || '').toUpperCase();
    const presalesRoleCodes = ['PRESALES', 'PRE_SALES', 'PRE-SALES'];
    return presalesRoleCodes.includes(userRole);
  }, [allUsers]);

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      const date = parseActivityDate(activity);
      const inRange = isWithinRange(date, rangeStart, rangeEnd);

      // For pre-sales users with accessible organizations: require organizationId and it must be in accessible set
      // If there are accessible organizations, exclude activities without organizationId
      const orgOk =
        accessibleOrgSet.size === 0
          ? true // No org restrictions, allow all
          : activity.organizationId
            ? accessibleOrgSet.has(activity.organizationId) // Must be in accessible set
            : false; // Exclude activities without organizationId when there are org restrictions

      const orgFilterOk =
        selectedOrgSet.size === 0 || (activity.organizationId ? selectedOrgSet.has(activity.organizationId) : false);
      const userFilterOk =
        selectedUserSet.size === 0 || (activity.assignedUserId ? selectedUserSet.has(activity.assignedUserId) : false);
      return inRange && orgOk && orgFilterOk && userFilterOk;
    });
  }, [accessibleOrgSet, activities, rangeStart, rangeEnd, selectedOrgSet, selectedUserSet]);

  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      const created = parseIsoDate(deal.createdAt);
      const inRange = isWithinRange(created, rangeStart, rangeEnd);

      // For pre-sales users: filter by pipeline ID or organization ID
      // If accessiblePipelineIds is empty:
      //   - For pre-sales users with accessible organizations, fall back to org-based access
      //   - For other users (or when no org restrictions), show all deals
      // Otherwise, include deals from accessible pipelines OR deals from accessible organizations (as fallback)
      let pipelineAllowed: boolean;
      if (accessiblePipelineIds.size === 0) {
        if (isPresalesUser && accessibleOrgSet.size > 0) {
          pipelineAllowed = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;
        } else {
          pipelineAllowed = true;
        }
      } else {
        // Check if deal's pipeline is in accessible pipelines
        const pipelineInAccessible = deal.pipelineId ? accessiblePipelineIds.has(deal.pipelineId) : false;

        // Fallback: if pipeline not found but deal belongs to accessible organization, allow it
        // This handles cases where pipeline might not be properly linked but organization is accessible
        const orgInAccessible = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;

        pipelineAllowed = pipelineInAccessible || (orgInAccessible && accessibleOrgSet.size > 0);
      }

      // Also check organization filter if selected (for additional filtering)
      const orgFilterOk =
        selectedOrgSet.size === 0 || (deal.organizationId ? selectedOrgSet.has(deal.organizationId) : false);

      return inRange && pipelineAllowed && orgFilterOk;
    });
  }, [accessiblePipelineIds, isPresalesUser, deals, rangeStart, rangeEnd, selectedOrgSet, accessibleOrgSet]);

  // For Target vs achieved, when the top date filter is set to "Today" or "This week"
  // we still want to evaluate ACHIEVED for the **full current month** (to match monthly targets).
  const targetChartRange = useMemo(() => {
    // Default: use the same range as the rest of the dashboard
    let from = rangeStart;
    let to = rangeEnd;

    if (timeRange === 'today' || timeRange === 'week') {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      monthStart.setHours(0, 0, 0, 0);
      monthEnd.setHours(23, 59, 59, 999);
      from = monthStart;
      to = monthEnd;
    }

    return { from, to };
  }, [rangeStart, rangeEnd, timeRange]);

  const targetChartDeals = useMemo(() => {
    return deals.filter((deal) => {
      const created = parseIsoDate(deal.createdAt);
      const inRange = isWithinRange(created, targetChartRange.from, targetChartRange.to);

      let pipelineAllowed: boolean;
      if (accessiblePipelineIds.size === 0) {
        if (isPresalesUser && accessibleOrgSet.size > 0) {
          pipelineAllowed = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;
        } else {
          pipelineAllowed = true;
        }
      } else {
        const pipelineInAccessible = deal.pipelineId ? accessiblePipelineIds.has(deal.pipelineId) : false;
        const orgInAccessible = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;
        pipelineAllowed = pipelineInAccessible || (orgInAccessible && accessibleOrgSet.size > 0);
      }

      const orgFilterOk =
        selectedOrgSet.size === 0 || (deal.organizationId ? selectedOrgSet.has(deal.organizationId) : false);

      return inRange && pipelineAllowed && orgFilterOk;
    });
  }, [
    deals,
    targetChartRange.from,
    targetChartRange.to,
    accessiblePipelineIds,
    isPresalesUser,
    accessibleOrgSet,
    selectedOrgSet,
  ]);

  const toggleSelection = (id: number, setter: React.Dispatch<React.SetStateAction<number[]>>) => {
    setter((prev: number[]) => (prev.includes(id) ? prev.filter((v: number) => v !== id) : [...prev, id]));
  };

  const orgLabel =
    selectedOrgIds.length === 0
      ? 'All Organizations'
      : organizations
          .filter((o) => selectedOrgSet.has(o.id))
          .map((o) => o.name || `Org #${o.id}`)
          .join(', ');

  const userLabel =
    selectedUserIds.length === 0
      ? 'All Users'
      : users
          .filter((u) => selectedUserSet.has(u.id))
          .map((u) => u.name)
          .join(', ');

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const handlePresetRange = (range: TimeRange) => {
    setTimeRange(range);
    setDateMenuOpen(false);
  };

  const applyCustomMonth = (month: number) => {
    setSelectedMonth(month);
    setTimeRange('custom-month');
    setMonthDropdownOpen(false);
  };

  const applyCustomQuarter = (quarter: number) => {
    setSelectedQuarter(quarter);
    setTimeRange('custom-quarter');
    setQuarterDropdownOpen(false);
  };

  const applyCustomYear = (year: number) => {
    setSelectedYear(year);
    setYearDropdownOpen(false);
    // If month or quarter is already selected, keep that selection and just update the year
    // The rangeBounds will automatically use the new year
  };

  const applyCustomRange = () => {
    if (!customRange.from || !customRange.to) return;
    setTimeRange('custom-range');
    setDateMenuOpen(false);
  };

  const dateLabel = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (timeRange === 'today') return 'Today';
    if (timeRange === 'week') return 'This week';
    if (timeRange === 'month') return 'This month';
    if (timeRange === 'quarter') return 'This quarter';
    if (timeRange === 'year') return 'This year';
    if (timeRange === 'custom-month') return `${monthNames[selectedMonth]} ${selectedYear}`;
    if (timeRange === 'custom-quarter') return `Q${selectedQuarter} ${selectedYear}`;
    if (timeRange === 'custom-range') {
      if (customRange.from && customRange.to) return `${customRange.from} → ${customRange.to}`;
      return 'Custom range';
    }
    return 'Date';
  }, [customRange.from, customRange.to, selectedMonth, selectedQuarter, selectedYear, timeRange]);

  const filteredOrgs = useMemo(() => {
    if (!orgSearch.trim()) return organizations;
    const q = orgSearch.toLowerCase();
    return organizations.filter((o) => (o.name || '').toLowerCase().includes(q));
  }, [organizations, orgSearch]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q));
  }, [users, userSearch]);

  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as Node;
      if (orgMenuRef.current && !orgMenuRef.current.contains(target)) {
        setOrgMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (dateMenuRef.current && !dateMenuRef.current.contains(target)) {
        setDateMenuOpen(false);
        setMonthDropdownOpen(false);
        setQuarterDropdownOpen(false);
        setYearDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, []);

  const orgEntries = useMemo(() => {
    const entries = new Map<string, string>();
    organizations.forEach((org) => entries.set(String(org.id), org.name || 'Untitled org'));
    filteredDeals.forEach((deal) => {
      const key = getOrgKey(deal.organizationId, undefined);
      if (!entries.has(key) && deal.organizationId) {
        entries.set(key, organizations.find((o) => o.id === deal.organizationId)?.name || 'Org');
      }
    });
    filteredActivities.forEach((activity) => {
      const key = getOrgKey(activity.organizationId, activity.organization);
      if (!entries.has(key)) {
        entries.set(key, activity.organization || 'Unassigned');
      }
    });
    if (entries.size === 0) {
      entries.set('org:unassigned', 'Unassigned');
    }
    return Array.from(entries.entries()).map(([key, label]) => ({ key, label }));
  }, [filteredActivities, filteredDeals, organizations]);

  const colorByOrg = useMemo(() => {
    const map = new Map<string, string>();
    orgEntries.forEach((entry, idx) => {
      // Custom palette for organizations (lighter to medium shades)
      const orgColors = [
        '#4FB6B2', // Org 1 - Teal (matches Instagram sub-source bar)
        '#E3B04B', // Org 2 - Amber
        '#5DA9E9', // Org 3 - Sky Blue
        '#8E6BBF', // Org 4 - Plum
        '#4CAF8A', // Org 5 - Mint Green
        '#6A7FDB', // Org 6 - Indigo
        '#F28C7D', // Org 7 - Coral
      ];
      map.set(entry.key, orgColors[idx] || chartPalette[idx % chartPalette.length]);
    });
    return map;
  }, [orgEntries]);

  const orgLegendItems = useMemo(
    () =>
      orgEntries.map((entry) => ({
        label: entry.label,
        color: colorByOrg.get(entry.key) || '#cbd5e1',
      })),
    [colorByOrg, orgEntries],
  );

  const todayActivityProgressColor = useMemo(() => {
    const keys =
      selectedOrgIds.length > 0
        ? selectedOrgIds.map((id) => String(id))
        : orgEntries.map((entry) => entry.key);

    const colors = keys
      .map((key) => colorByOrg.get(key))
      .filter((c): c is string => Boolean(c));

    if (colors.length === 0) {
      return '#2563eb';
    }

    if (colors.length === 1) {
      return colors[0];
    }

    const step = colors.length > 1 ? 100 / (colors.length - 1) : 100;
    const stops = colors.map((color, idx) => `${color} ${Math.round(idx * step)}%`);

    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, [colorByOrg, orgEntries, selectedOrgIds]);

  const activityCardCounts = useMemo(() => {
    // Helper classifiers – keep in sync with TodayActivitiesWidget logic
    const isCall = (a: Activity) => {
      const type = (a.type || '').toUpperCase();
      const category = (a.category || '').toUpperCase();
      return type === 'CALL' || category === 'CALL';
    };

    const isMeeting = (a: Activity) => {
      const type = (a.type || '').toUpperCase();
      const category = (a.category || '').toUpperCase();
      return (
        type === 'MEETING' ||
        type === 'MEETING_SCHEDULER' ||
        category === 'MEETING' ||
        category === 'MEETING SCHEDULER' ||
        category === 'MEETING_SCHEDULER'
      );
    };

    // Consider only generic activities (exclude calls and meetings)
    const genericActivities = filteredActivities.filter(
      (a) => !isCall(a) && !isMeeting(a),
    );
    const totalActivitiesOnly = genericActivities.length;
    const completedActivitiesOnly = genericActivities.filter((a) => a.done).length;
    const pendingActivitiesOnly = totalActivitiesOnly - completedActivitiesOnly;

    const calls = filteredActivities.filter(isCall).length;
    const meetings = filteredActivities.filter(isMeeting).length;
    const overdue = filteredActivities.filter((a) => {
      if (a.done) return false;
      const date = parseActivityDate(a);
      return date ? date < now : false;
    }).length;
    return {
      total: totalActivitiesOnly,
      pending: pendingActivitiesOnly,
      completed: completedActivitiesOnly,
      calls,
      meetings,
      overdue,
    };
  }, [filteredActivities, now]);

  const todayActivitiesCounts = useMemo(() => {
    // Use all activities in the current filter range so totals
    // line up with the top summary cards (Total / Pending / Completed).
    const scopedActivities = filteredActivities;

    const isCall = (a: Activity) => {
      const type = (a.type || '').toUpperCase();
      const category = (a.category || '').toUpperCase();
      return type === 'CALL' || category === 'CALL';
    };
    
    const isMeeting = (a: Activity) => {
      const type = (a.type || '').toUpperCase();
      const category = (a.category || '').toUpperCase();
      return (
        type === 'MEETING' ||
        type === 'MEETING_SCHEDULER' ||
        category === 'MEETING' ||
        category === 'MEETING SCHEDULER' ||
        category === 'MEETING_SCHEDULER'
      );
    };

    const isGenericActivity = (a: Activity) => {
      const type = (a.type || '').toUpperCase();
      const category = (a.category || '').toUpperCase();
      return (
        !type ||
        type === 'ACTIVITY' ||
        type === 'TASK' ||
        type === 'FOLLOW_UP' ||
        type === 'OTHER' ||
        category === 'ACTIVITY' ||
        (!category && !type)
      );
    };

    const buildCounts = (predicate: (a: Activity) => boolean): ActivityProgressCounts => {
      const total = scopedActivities.filter(predicate).length;
      const completed = scopedActivities.filter((a) => predicate(a) && a.done).length;
      const pending = total - completed;
      return { total, completed, pending };
    };

    return {
      calls: buildCounts(isCall),
      meetings: buildCounts(isMeeting),
      activities: buildCounts(isGenericActivity),
    };
  }, [filteredActivities]);

  const activityTypeCategories: BarCategory[] = [
    { key: 'ACTIVITY', label: 'Activity' },
    { key: 'CALL', label: 'Call' },
    { key: 'MEETING_SCHEDULER', label: 'Meeting' },
  ];

  type ActivityTypeFunnelRow = {
    key: string;
    label: string;
    value: number;
    breakdown: { label: string; count: number; color: string }[];
  };

  // Build Activity Type totals and rows we can use for both the funnel
  // visual and to sort the categories.
  const activityTypeFunnelRows: ActivityTypeFunnelRow[] = useMemo(() => {
    const perType: Record<
      string,
      { total: number; byOrg: Record<string, number> }
    > = {};

    activityTypeCategories.forEach((cat) => {
      perType[cat.key] = { total: 0, byOrg: {} };
    });

    filteredActivities.forEach((activity) => {
      const type = (activity.type || '').toUpperCase();
      const orgKey = getOrgKey(activity.organizationId, activity.organization);

      activityTypeCategories.forEach((cat) => {
        const bucket = perType[cat.key];
        if (!bucket) return;

        if (cat.key === 'ACTIVITY') {
          const isGenericActivity =
            !type || type === 'ACTIVITY' || type === 'TASK' || type === 'FOLLOW_UP' || type === 'OTHER';
          if (isGenericActivity) {
            bucket.total += 1;
            bucket.byOrg[orgKey] = (bucket.byOrg[orgKey] || 0) + 1;
          }
        } else if (cat.key === 'CALL') {
          if (type === 'CALL') {
            bucket.total += 1;
            bucket.byOrg[orgKey] = (bucket.byOrg[orgKey] || 0) + 1;
          }
        } else if (cat.key === 'MEETING_SCHEDULER') {
          if (type === 'MEETING' || type === 'MEETING_SCHEDULER') {
            bucket.total += 1;
            bucket.byOrg[orgKey] = (bucket.byOrg[orgKey] || 0) + 1;
          }
        }
      });
    });

    const rows: ActivityTypeFunnelRow[] = activityTypeCategories.map((cat) => {
      const bucket = perType[cat.key];
      const total = bucket?.total ?? 0;
      const breakdownEntries = bucket
        ? Object.entries(bucket.byOrg)
        : [];

      const breakdown = breakdownEntries
        .sort(([, aCount], [, bCount]) => bCount - aCount)
        .map(([orgKey, count]) => ({
          label:
            orgEntries.find((entry) => entry.key === orgKey)?.label ||
            'Unassigned',
          count,
          color: colorByOrg.get(orgKey) || '#cbd5e1',
        }));

      return {
        key: cat.key,
        label: cat.label,
        value: total,
        breakdown,
      };
    });

    return rows.sort((a, b) => b.value - a.value);
  }, [activityTypeCategories, filteredActivities, colorByOrg, orgEntries]);

  // If we need sorted categories elsewhere in future, they can be derived
  // from the funnel rows. Currently the funnel itself is the only consumer.

  const activityStatusCategories: BarCategory[] = [
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'PENDING', label: 'Pending' },
  ];

  const activityStageColors: Record<string, string> = {
    'Lead In': '#4FB6B2', // Soft Teal
    Qualified: '#6A7FDB', // Muted Indigo
    'Contact Made': '#F28C7D', // Warm Coral
    'Follow Up': '#E3B04B', // Dusty Amber
    'Meeting Schedule': '#5DA9E9', // Calm Sky Blue
    'Meeting Scheduled': '#5DA9E9',
    'Meeting Done': '#8E6BBF', // Elegant Plum
    Diversion: '#4CAF8A', // Rich Mint Green
  };

  const dealSourceColors: Record<string, string> = {
    Direct: '#6EE7B7', // lighter mint green
    Divert: '#64748B', // darker slate grey
    Planner: '#FACC6B', // soft yellow
    Reference: '#FCA5A5', // light red
  };

  const dealSubSourceColors: Record<string, string> = {
    // Soft purple/pink combo for Instagram
    Instagram: 'linear-gradient(135deg, #f9a8d4, #c4b5fd)',
    Whatsapp: '#25d366', // WhatsApp green
    'Landing Page': '#4b5563', // dark grey
    Email: '#ea4335', // Gmail red
  };

  const dealSourceCategories: BarCategory[] = useMemo(() => {
    const set = new Set<string>();
    filteredDeals.forEach((deal) => {
      if (deal.source) set.add(deal.source);
    });
    const base = ['Direct', 'Divert', 'Planner', 'Reference'];
    base.forEach((src) => set.add(src));
    return Array.from(set).map((source) => ({ key: source, label: source }));
  }, [filteredDeals]);

  const dealSubSourceCategories: BarCategory[] = useMemo(() => {
    // Always show all 4 sub-sources: Instagram, Whatsapp, Landing Page, Email
    const subSources = ['Instagram', 'Whatsapp', 'Landing Page', 'Email'];
    return subSources.map((sub) => ({ key: sub, label: sub }));
  }, []);

  const dealStageById = useMemo(() => {
    const stageMap = new Map<number, string>();
    pipelines.forEach((pipeline) => {
      pipeline.stages.forEach((stage) => stageMap.set(stage.id, stage.name));
    });
    return stageMap;
  }, [pipelines]);

  // Build deal stage map from all accessible deals (not just date-filtered)
  // This ensures activities can find their deal's stage even if the deal is outside the date range
  const dealStageByDealId = useMemo(() => {
    const map = new Map<number, string>();
    deals.forEach((deal) => {
      // Only include deals from accessible organizations
      const orgAllowed = accessibleOrgSet.size === 0 || (deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : true);
      if (orgAllowed && deal.stageId) {
        const stageName = dealStageById.get(deal.stageId);
        if (stageName) {
          map.set(deal.id, stageName);
        }
      }
    });
    return map;
  }, [dealStageById, deals, accessibleOrgSet]);

  const activityStageCategories: BarCategory[] = useMemo(() => {
    const stageMap = new Map<string, string>(); // normalized -> original

    // Normalize stage names to handle duplicates like "Meeting Schedule" vs "Meeting Scheduled"
    const normalizeStageName = (name: string): string => {
      const normalized = name.toLowerCase().trim();
      // Treat "meeting schedule" and "meeting scheduled" as the same
      if (normalized === 'meeting scheduled') {
        return 'meeting schedule';
      }
      return normalized;
    };

    // Include all stages from pipelines so every stage appears even if count is zero.
    pipelines.forEach((pipeline) => {
      pipeline.stages.forEach((stage) => {
        const normalized = normalizeStageName(stage.name);
        // Keep the first occurrence (prefer "Meeting Schedule" over "Meeting Scheduled")
        if (!stageMap.has(normalized)) {
          stageMap.set(normalized, stage.name);
        } else {
          // If we already have "Meeting Schedule", don't replace with "Meeting Scheduled"
          const existing = stageMap.get(normalized) || '';
          if (normalizeStageName(existing) === 'meeting schedule' && normalized === 'meeting schedule') {
            // Prefer "Meeting Schedule" over "Meeting Scheduled"
            if (stage.name.toLowerCase().trim() !== 'meeting scheduled') {
              stageMap.set(normalized, stage.name);
            }
          }
        }
      });
    });

    filteredActivities.forEach((activity) => {
      if (!activity.dealId) return;
      const stageName = dealStageByDealId.get(activity.dealId);
      if (stageName) {
        const normalized = normalizeStageName(stageName);
        if (!stageMap.has(normalized)) {
          stageMap.set(normalized, stageName);
        }
      }
    });

    if (stageMap.size === 0) {
      stageMap.set('unassigned', 'Unassigned');
    }
    return Array.from(stageMap.values()).map((name) => ({ key: name, label: name }));
  }, [dealStageByDealId, filteredActivities, pipelines]);

  const buildSeries = useMemo(() => {
    const getOrgLabel = (key: string): string =>
      orgEntries.find((entry) => entry.key === key)?.label || 'Unassigned';

    const activitySeries: Series[] = orgEntries.map((entry) => {
      const values: Record<string, number> = {};
      activityTypeCategories.forEach((cat) => {
        values[cat.key] = filteredActivities.filter((activity) => {
          const orgKey = getOrgKey(activity.organizationId, activity.organization);
          const type = (activity.type || '').toUpperCase();
          if (cat.key === 'ACTIVITY') {
            return orgKey === entry.key && (!type || type === 'ACTIVITY' || type === 'TASK' || type === 'FOLLOW_UP' || type === 'OTHER');
          }
          if (cat.key === 'CALL') return orgKey === entry.key && type === 'CALL';
          return orgKey === entry.key && (type === 'MEETING' || type === 'MEETING_SCHEDULER');
        }).length;
      });
      return { key: entry.key, label: getOrgLabel(entry.key), color: colorByOrg.get(entry.key) || '#2563eb', values };
    });

    const statusSeries: Series[] = orgEntries.map((entry) => {
      const values: Record<string, number> = { COMPLETED: 0, PENDING: 0 };
      filteredActivities.forEach((activity) => {
        const orgKey = getOrgKey(activity.organizationId, activity.organization);
        if (orgKey !== entry.key) return;
        if (activity.done) {
          values.COMPLETED += 1;
        } else {
          values.PENDING += 1;
        }
      });
      return { key: entry.key, label: getOrgLabel(entry.key), color: colorByOrg.get(entry.key) || '#2563eb', values };
    });

    const stageSeries: Series[] = orgEntries.map((entry) => {
      const values: Record<string, number> = {};
      activityStageCategories.forEach((cat) => {
        values[cat.key] = 0;
      });
      
      // Normalize stage names to match the normalization used in activityStageCategories
      const normalizeStageName = (name: string): string => {
        const normalized = name.toLowerCase().trim();
        if (normalized === 'meeting scheduled') {
          return 'meeting schedule';
        }
        return normalized;
      };
      
      // Create a map from normalized stage name to category key
      const normalizedToCategoryKey = new Map<string, string>();
      activityStageCategories.forEach((cat) => {
        const normalized = normalizeStageName(cat.key);
        normalizedToCategoryKey.set(normalized, cat.key);
      });
      
      filteredActivities.forEach((activity) => {
        const orgKey = getOrgKey(activity.organizationId, activity.organization);
        if (orgKey !== entry.key) return;
        const stageName = activity.dealId ? dealStageByDealId.get(activity.dealId) || 'Unassigned' : 'Unassigned';
        // Normalize the stage name and find the matching category key
        const normalized = normalizeStageName(stageName);
        const categoryKey = normalizedToCategoryKey.get(normalized) || stageName;
        values[categoryKey] = (values[categoryKey] || 0) + 1;
      });
      return { key: entry.key, label: getOrgLabel(entry.key), color: colorByOrg.get(entry.key) || '#2563eb', values };
    });

    const dealStatusSeries: Series[] = orgEntries.map((entry) => {
      const values: Record<string, number> = { IN_PROGRESS: 0, WON: 0, LOST: 0 };
      filteredDeals.forEach((deal) => {
        const orgKey = getOrgKey(deal.organizationId, undefined);
        if (orgKey !== entry.key) return;
        values[deal.status] = (values[deal.status] || 0) + 1;
      });
      return { key: entry.key, label: getOrgLabel(entry.key), color: colorByOrg.get(entry.key) || '#2563eb', values };
    });

    const dealSourceSeries: Series[] = orgEntries.map((entry) => {
      const values: Record<string, number> = {};
      dealSourceCategories.forEach((cat) => {
        values[cat.key] = 0;
      });
      filteredDeals.forEach((deal) => {
        const orgKey = getOrgKey(deal.organizationId, undefined);
        if (orgKey !== entry.key) return;
        const sourceKey = deal.source || 'Direct';
        values[sourceKey] = (values[sourceKey] || 0) + 1;
      });
      return { key: entry.key, label: getOrgLabel(entry.key), color: colorByOrg.get(entry.key) || '#2563eb', values };
    });

    const dealSubSourceSeries: Series[] = orgEntries.map((entry) => {
      const values: Record<string, number> = {};
      dealSubSourceCategories.forEach((cat) => {
        values[cat.key] = 0;
      });
      filteredDeals.forEach((deal) => {
        const orgKey = getOrgKey(deal.organizationId, undefined);
        if (orgKey !== entry.key) return;
        const subKey = deal.subSource || 'Not captured';
        values[subKey] = (values[subKey] || 0) + 1;
      });
      return { key: entry.key, label: getOrgLabel(entry.key), color: colorByOrg.get(entry.key) || '#2563eb', values };
    });

    return {
      activitySeries,
      statusSeries,
      stageSeries,
      dealStatusSeries,
      dealSourceSeries,
      dealSubSourceSeries,
    };
  }, [
    activityStageCategories,
    activityTypeCategories,
    colorByOrg,
    dealStageByDealId,
    dealSourceCategories,
    dealSubSourceCategories,
    filteredActivities,
    filteredDeals,
    orgEntries,
  ]);

  // Pre-sales peers: target vs achieved (won deals) comparison
  const lostReasonDeals = useMemo(() => {
    // For lost reason, ignore date range so we always show available lost data
    return deals.filter((deal) => {
      const orgAllowed =
        accessibleOrgSet.size === 0 || (deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : true);
      const orgFilterOk =
        selectedOrgSet.size === 0 || (deal.organizationId ? selectedOrgSet.has(deal.organizationId) : false);
      return orgAllowed && orgFilterOk;
    });
  }, [accessibleOrgSet, deals, selectedOrgSet]);

  const lostReasonSlices: PieSlice[] = useMemo(() => {
    const counts = new Map<string, number>();
    lostReasonDeals
      .filter((deal) => deal.status === 'LOST')
      .forEach((deal) => {
        const raw = (deal.lostReason || 'Not available').trim() || 'Not available';
        // Normalize to our defined buckets
        const reason = raw;
        counts.set(reason, (counts.get(reason) || 0) + 1);
      });
    if (counts.size === 0) return [];

    const colorByReason: Record<string, string> = {
      'Slot Not Open': '#6B8FA3', // Steel Blue
      'Not Interested': '#C97A7A', // Muted Rose
      'Date Postponed': '#A6A0C4', // Soft Lavender Grey
      'Not Available': '#8A9BA8', // Cool Slate
      Ghosted: '#9E9E9E', // Smoky Grey
      'Budget Issue': '#C9A44C', // Dusty Mustard
      'Booked Someone Else': '#B66A5E', // Muted Brick
    };

    return Array.from(counts.entries()).map(([reason, value]) => ({
      key: reason,
      label: reason,
      value,
      color: colorByReason[reason] || '#cbd5e1',
    }));
  }, [lostReasonDeals]);

  const dealStatusSlices: PieSlice[] = useMemo(() => {
    const statusDefs = [
      { key: 'IN_PROGRESS', label: 'Open', color: '#fef08a' }, // light yellow
      { key: 'WON', label: 'Won', color: '#22c55e' }, // light green
      { key: 'LOST', label: 'Lost', color: '#fecaca' }, // light red
    ];

    const counts = new Map<string, number>();
    const breakdownByStatus = new Map<
      string,
      { orgLabel: string; count: number }[]
    >();

    filteredDeals.forEach((deal) => {
      counts.set(deal.status, (counts.get(deal.status) || 0) + 1);
    });

    // Build per‑org breakdown from dealStatusSeries
    buildSeries.dealStatusSeries.forEach((series) => {
      statusDefs.forEach((status) => {
        const count = series.values[status.key] || 0;
        if (!count) return;
        const arr = breakdownByStatus.get(status.key) || [];
        arr.push({ orgLabel: series.label, count });
        breakdownByStatus.set(status.key, arr);
      });
    });

    const total = statusDefs.reduce((sum, s) => sum + (counts.get(s.key) || 0), 0);
    if (total === 0) return [];

    return statusDefs.map((s) => {
      const value = counts.get(s.key) || 0;
      const breakdownRaw = breakdownByStatus.get(s.key) || [];
      const breakdown = breakdownRaw.map((b) => ({
        orgLabel: b.orgLabel,
        count: b.count,
        percent: value ? Math.round((b.count / value) * 100) : 0,
      }));
      return {
      key: s.key,
      label: s.label,
        value,
        color: s.color,
        breakdown,
      };
    });
  }, [filteredDeals, buildSeries.dealStatusSeries]);

  const totalDeals = filteredDeals.length;
  const divertedDeals = filteredDeals.filter((deal) => deal.isDiverted || deal.source === 'Divert').length;
  // For pre‑sales target vs achieved:
  // - **Target** (from `sales_targets` / `targetsApi`) is the number of deals
  //   that *should* be WON from divert source in the selected month.
  // - **Achieved** must therefore be the *count* of deals that:
  //     - are WON, and
  //     - are diverted (either `isDiverted` flag or `source === 'Divert'`),
  //     - fall within the current date range + other filters used in `filteredDeals`.
  //
  // This keeps the donut + bar chart aligned with the DB semantics for pre‑sales
  // (count of diverted‑won deals), instead of using all deals.
  const achievedDeals = targetChartDeals.filter(
    (deal) => deal.status === 'WON' && (deal.isDiverted || deal.source === 'Divert'),
  ).length;

  // Date window for the dashboard Deal duration widget (THIS MONTH / THIS YEAR / CUSTOM DATE RANGE)
  const dealDurationWidgetRange = useMemo(() => {
    // If custom range is selected and both dates are set, use that
    if (dealDurationDateRange === 'custom' && dealDurationCustomRange.from && dealDurationCustomRange.to) {
      const parse = (value: string): Date | null => {
        const parts = value.split('/');
        if (parts.length !== 3) return null;
        const [dd, mm, yyyy] = parts.map(Number);
        if (Number.isNaN(dd) || Number.isNaN(mm) || Number.isNaN(yyyy)) return null;
        const d = new Date(yyyy, mm - 1, dd);
        d.setHours(0, 0, 0, 0);
        return d;
      };
      const from = parse(dealDurationCustomRange.from);
      const toRaw = parse(dealDurationCustomRange.to);
      if (from && toRaw) {
        const to = new Date(toRaw);
        to.setHours(23, 59, 59, 999);
        return { from, to };
      }
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let from: Date;
    let to: Date = new Date(now);
    to.setHours(23, 59, 59, 999);

    if (dealDurationDateRange === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      from.setHours(0, 0, 0, 0);
    } else {
      // 'year'
      from = new Date(now.getFullYear(), 0, 1);
      from.setHours(0, 0, 0, 0);
    }

    return { from, to };
  }, [dealDurationDateRange, dealDurationCustomRange]);

  // Filter deals for Deal Duration widget:
  // - Created within the widget's date window
  // - Respect pre‑sales access rules (pipelines / organizations), same as other deal filters
  const dealDurationFilteredDeals = useMemo(() => {
    const { from, to } = dealDurationWidgetRange;
    return deals.filter((deal) => {
      const created = parseIsoDate(deal.createdAt);
      const inRange = isWithinRange(created, from, to);
      if (!inRange) return false;

      // Re‑use pipeline/org access rules from filteredDeals
      let pipelineAllowed: boolean;
      if (accessiblePipelineIds.size === 0) {
        if (isPresalesUser && accessibleOrgSet.size > 0) {
          pipelineAllowed = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;
        } else {
          pipelineAllowed = true;
        }
      } else {
        const pipelineInAccessible = deal.pipelineId ? accessiblePipelineIds.has(deal.pipelineId) : false;
        const orgInAccessible = deal.organizationId ? accessibleOrgSet.has(deal.organizationId) : false;
        pipelineAllowed = pipelineInAccessible || (orgInAccessible && accessibleOrgSet.size > 0);
      }

      return pipelineAllowed;
    });
  }, [deals, dealDurationWidgetRange, accessiblePipelineIds, isPresalesUser, accessibleOrgSet]);

  // Calculate total deal value for ALL deals in the selected date range
  const totalDealValue = useMemo(() => {
    return dealDurationFilteredDeals
      .reduce((sum, deal) => sum + (deal.value || 0), 0);
  }, [dealDurationFilteredDeals]);

  // Calculate average deal duration – keep logic in sync with DealDurationReport:
  // - Uses the same date window as the widget filter (THIS WEEK / THIS MONTH / THIS YEAR)
  // - From deal creation (first stage) until it is WON / LOST (using updatedAt)
  // - For in‑progress deals, from creation until the end of the widget window (or today, whichever is earlier)
  // - Only computed when the widget window covers at least 7 days (one week)
  const averageDealDuration = useMemo(() => {
    if (!dealDurationFilteredDeals.length) return 0;

    const { from: startDate, to: endDate } = dealDurationWidgetRange;

    // Enforce a minimum window of 7 days for a meaningful average
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays < 7) return 0;

    const today = new Date();
    const effectiveRangeEnd = endDate < today ? endDate : today;

    const durations: number[] = [];

    dealDurationFilteredDeals.forEach((deal) => {
      const createdDate = parseIsoDate(deal.createdAt);
      if (!createdDate) return;

      let endDate: Date | null = null;

      if (deal.status === 'WON' || deal.status === 'LOST') {
        endDate = parseIsoDate(deal.updatedAt) || effectiveRangeEnd;
      } else {
        endDate = effectiveRangeEnd;
      }

      const durationMs = endDate.getTime() - createdDate.getTime();
        const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));
        if (durationDays >= 0) {
          durations.push(durationDays);
      }
    });

    if (durations.length === 0) return 0;
    const sum = durations.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / durations.length);
  }, [dealDurationFilteredDeals, dealDurationWidgetRange]);

  // Handler for Total Deals card - navigate to deals page with date filter
  const handleTotalDealsClick = () => {
    const params = new URLSearchParams();
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    }
    navigate(`/deals?${params.toString()}`);
  };

  // Map timeRange to Activities tab
  const getTabForTimeRange = (): string => {
    if (timeRange === 'today') return 'Today';
    if (timeRange === 'week') return 'This week';
    if (timeRange === 'month') return 'This month';
    if (timeRange === 'quarter') return 'This quarter';
    if (timeRange === 'year') return 'This year';
    if (timeRange === 'custom-range') return 'Select Date';
    return 'All';
  };

  // Handler for Total Activities card - navigate to activities page with date filter
  const handleTotalActivitiesClick = () => {
    const params = new URLSearchParams();
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    params.set('tab', getTabForTimeRange());
    
    // For pre-sales users: if no organizations selected, use accessible organizations
    // If organizations are selected, use those
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    } else if (isPresalesUser && accessibleOrgSet.size > 0) {
      // For pre-sales users, pass accessible organizations if none are selected
      const accessibleOrgIds = Array.from(accessibleOrgSet);
      params.set('organizationId', accessibleOrgIds.join(','));
    }
    
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    navigate(`/activities?${params.toString()}`);
  };

  // Handler for Pending card - navigate to activities page with pending filter
  const handlePendingClick = () => {
    const params = new URLSearchParams();
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    params.set('done', 'false');
    params.set('tab', getTabForTimeRange());
    
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    } else if (isPresalesUser && accessibleOrgSet.size > 0) {
      const accessibleOrgIds = Array.from(accessibleOrgSet);
      params.set('organizationId', accessibleOrgIds.join(','));
    }
    
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    navigate(`/activities?${params.toString()}`);
  };

  // Handler for Completed card - navigate to activities page with completed filter
  const handleCompletedClick = () => {
    const params = new URLSearchParams();
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    params.set('done', 'true');
    params.set('tab', getTabForTimeRange());
    
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    } else if (isPresalesUser && accessibleOrgSet.size > 0) {
      const accessibleOrgIds = Array.from(accessibleOrgSet);
      params.set('organizationId', accessibleOrgIds.join(','));
    }
    
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    navigate(`/activities?${params.toString()}`);
  };

  // Handler for Total Assign Call card - navigate to activities page with call filter
  const handleTotalCallClick = () => {
    const params = new URLSearchParams();
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    params.set('category', 'Call');
    params.set('tab', getTabForTimeRange());
    
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    } else if (isPresalesUser && accessibleOrgSet.size > 0) {
      const accessibleOrgIds = Array.from(accessibleOrgSet);
      params.set('organizationId', accessibleOrgIds.join(','));
    }
    
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    navigate(`/activities?${params.toString()}`);
  };

  // Handler for Total Meeting Scheduled card - navigate to activities page with meeting filter
  const handleTotalMeetingClick = () => {
    const params = new URLSearchParams();
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    params.set('category', 'Meeting scheduler');
    params.set('tab', getTabForTimeRange());
    
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    } else if (isPresalesUser && accessibleOrgSet.size > 0) {
      const accessibleOrgIds = Array.from(accessibleOrgSet);
      params.set('organizationId', accessibleOrgIds.join(','));
    }
    
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    navigate(`/activities?${params.toString()}`);
  };

  // Handler for Overdue card - navigate to activities page with overdue tab
  const handleOverdueClick = () => {
    const params = new URLSearchParams();
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    params.set('tab', 'Overdue');
    
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    } else if (isPresalesUser && accessibleOrgSet.size > 0) {
      const accessibleOrgIds = Array.from(accessibleOrgSet);
      params.set('organizationId', accessibleOrgIds.join(','));
    }
    
    if (selectedUserIds.length > 0) {
      params.set('assignedUserId', selectedUserIds.join(','));
    }
    navigate(`/activities?${params.toString()}`);
  };

  // Handler for Diverted Deals card - navigate to deals page with diverted filter
  const handleDivertedDealsClick = () => {
    const params = new URLSearchParams();
    params.set('dateFrom', formatDateForUrl(rangeStart));
    params.set('dateTo', formatDateForUrl(rangeEnd));
    params.set('source', 'Divert');
    if (selectedOrgIds.length > 0) {
      params.set('organizationId', selectedOrgIds.join(','));
    }
    navigate(`/deals?${params.toString()}`);
  };

  const summaryCards = [
    // Row 1
    { label: 'Total deals', value: totalDeals, tone: 'blue' as const, onClick: handleTotalDealsClick },
    { label: 'Total activities', value: activityCardCounts.total, tone: 'blue' as const, onClick: handleTotalActivitiesClick },
    { label: 'Pending', value: activityCardCounts.pending, tone: 'yellow' as const, onClick: handlePendingClick },
    { label: 'Completed', value: activityCardCounts.completed, tone: 'green' as const, onClick: handleCompletedClick },
    // Row 2
    { label: 'Total assign call', value: activityCardCounts.calls, tone: 'blue' as const, onClick: handleTotalCallClick },
    { label: 'Total meeting scheduled', value: activityCardCounts.meetings, tone: 'blue' as const, onClick: handleTotalMeetingClick },
    { label: 'Diverted deals', value: divertedDeals, tone: 'yellow' as const, onClick: handleDivertedDealsClick },
    { label: 'Overdue', value: activityCardCounts.overdue, tone: 'red' as const, onClick: handleOverdueClick },
  ];

  return (
    <div className="role-dashboard-page presales-dashboard-page">
      <header className="role-dashboard-header">
        <h1>{`Hey ${displayName}`}</h1>
        <p className="role-dashboard-subtitle">
          Hope you’re having a great day! Here’s a clear view of your ongoing work and what’s coming up next.
        </p>
      </header>

      <div className="presales-toolbar-row">
        <div className="presales-filters">
          <div className="filter-control" ref={orgMenuRef}>
            <button type="button" className="filter-pill" onClick={() => setOrgMenuOpen((v) => !v)}>
              {orgLabel || 'All Organizations'}
              <span className="caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {orgMenuOpen ? (
              <div className="filter-menu">
                <div className="filter-menu-header">
                  <span>All Organizations</span>
                  {selectedOrgIds.length > 0 ? (
                    <button type="button" onClick={() => setSelectedOrgIds([])}>
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="filter-menu-list">
                  <input
                    type="text"
                    className="filter-search"
                    placeholder="Search organizations"
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    className={`filter-option-btn${selectedOrgIds.length === 0 ? ' selected' : ''}`}
                    onClick={() => setSelectedOrgIds([])}
                  >
                    All Organizations
                  </button>
                  {filteredOrgs.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      className={`filter-option-btn${selectedOrgSet.has(org.id) ? ' selected' : ''}`}
                      onClick={() => toggleSelection(org.id, setSelectedOrgIds)}
                    >
                      {org.name || `Org #${org.id}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="filter-control" ref={userMenuRef}>
            <button type="button" className="filter-pill" onClick={() => setUserMenuOpen((v) => !v)}>
              {userLabel || 'All Users'}
              <span className="caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {userMenuOpen ? (
              <div className="filter-menu">
                <div className="filter-menu-header">
                  <span>All Users</span>
                  {selectedUserIds.length > 0 ? (
                    <button type="button" onClick={() => setSelectedUserIds([])}>
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="filter-menu-list">
                  <input
                    type="text"
                    className="filter-search"
                    placeholder="Search users"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    className={`filter-option-btn${selectedUserIds.length === 0 ? ' selected' : ''}`}
                    onClick={() => setSelectedUserIds([])}
                  >
                    All Users
                  </button>
                  {filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={`filter-option-btn${selectedUserSet.has(user.id) ? ' selected' : ''}`}
                      onClick={() => toggleSelection(user.id, setSelectedUserIds)}
                    >
                      {user.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="filter-control" ref={dateMenuRef}>
            <button type="button" className="filter-pill" onClick={() => setDateMenuOpen((v) => !v)}>
              {dateLabel}
              <span className="caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {dateMenuOpen ? (
              <div className="filter-menu">
                <div className="filter-menu-header">
                  <span>Date filters</span>
                  <button type="button" onClick={() => setDateMenuOpen(false)}>
                    Close
                  </button>
                </div>
                <div className="filter-menu-list">
                  <div className="filter-section">
                    <div className="filter-section-label">Presets</div>
                    <button
                      type="button"
                      className={`filter-option-btn${timeRange === 'today' ? ' selected' : ''}`}
                      onClick={() => handlePresetRange('today')}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className={`filter-option-btn${timeRange === 'week' ? ' selected' : ''}`}
                      onClick={() => handlePresetRange('week')}
                    >
                      This week
                    </button>
                    <button
                      type="button"
                      className={`filter-option-btn${timeRange === 'month' ? ' selected' : ''}`}
                      onClick={() => handlePresetRange('month')}
                    >
                      This month
                    </button>
                    <button
                      type="button"
                      className={`filter-option-btn${timeRange === 'quarter' ? ' selected' : ''}`}
                      onClick={() => handlePresetRange('quarter')}
                    >
                      This quarter
                    </button>
                    <button
                      type="button"
                      className={`filter-option-btn${timeRange === 'year' ? ' selected' : ''}`}
                      onClick={() => handlePresetRange('year')}
                    >
                      This year
                    </button>
                  </div>

                  <div className="filter-section">
                    <div className="filter-section-label">Custom selection</div>
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        className={`filter-option-btn${timeRange === 'custom-month' ? ' selected' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMonthDropdownOpen(!monthDropdownOpen);
                          setQuarterDropdownOpen(false);
                          setYearDropdownOpen(false);
                        }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
                      >
                        <span>
                          {timeRange === 'custom-month' 
                            ? `${monthNames[selectedMonth]} ${selectedYear}` 
                            : 'Select Month'}
                        </span>
                        <span style={{ fontSize: '10px' }}>▾</span>
                      </button>
                      {monthDropdownOpen && (
                        <div className="filter-menu" style={{ position: 'absolute', left: 0, top: '100%', marginTop: '4px', zIndex: 1000, minWidth: '150px' }}>
                          <div className="filter-menu-list">
                            {monthNames.map((m, idx) => (
                              <button
                                key={m}
                                type="button"
                                className={`filter-option-btn${
                                  timeRange === 'custom-month' && selectedMonth === idx ? ' selected' : ''
                                }`}
                                onClick={() => applyCustomMonth(idx)}
                              >
                                {m} {selectedYear}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ position: 'relative', marginTop: '4px' }}>
                      <button
                        type="button"
                        className={`filter-option-btn${timeRange === 'custom-quarter' ? ' selected' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuarterDropdownOpen(!quarterDropdownOpen);
                          setMonthDropdownOpen(false);
                          setYearDropdownOpen(false);
                        }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
                      >
                        <span>
                          {timeRange === 'custom-quarter' 
                            ? `Q${selectedQuarter} ${selectedYear}` 
                            : 'Select Quarter'}
                        </span>
                        <span style={{ fontSize: '10px' }}>▾</span>
                      </button>
                      {quarterDropdownOpen && (
                        <div className="filter-menu" style={{ position: 'absolute', left: 0, top: '100%', marginTop: '4px', zIndex: 1000, minWidth: '150px' }}>
                          <div className="filter-menu-list">
                            {[1, 2, 3, 4].map((q) => (
                              <button
                                key={q}
                                type="button"
                                className={`filter-option-btn${
                                  timeRange === 'custom-quarter' && selectedQuarter === q ? ' selected' : ''
                                }`}
                                onClick={() => applyCustomQuarter(q)}
                              >
                                Q{q} {selectedYear}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ position: 'relative', marginTop: '4px' }}>
                      <button
                        type="button"
                        className={`filter-option-btn${(selectedYear !== new Date().getFullYear() || timeRange === 'custom-month' || timeRange === 'custom-quarter') ? ' selected' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setYearDropdownOpen(!yearDropdownOpen);
                          setMonthDropdownOpen(false);
                          setQuarterDropdownOpen(false);
                        }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
                      >
                        <span>
                          {(selectedYear !== new Date().getFullYear() || timeRange === 'custom-month' || timeRange === 'custom-quarter')
                            ? `${selectedYear}` 
                            : 'Select Year'}
                        </span>
                        <span style={{ fontSize: '10px' }}>▾</span>
                      </button>
                      {yearDropdownOpen && (
                        <div className="filter-menu" style={{ position: 'absolute', left: 0, top: '100%', marginTop: '4px', zIndex: 1000, minWidth: '150px' }}>
                          <div className="filter-menu-list">
                            {Array.from({ length: 2030 - new Date().getFullYear() + 1 }, (_, i) => new Date().getFullYear() + i).map((year) => (
                              <button
                                key={year}
                                type="button"
                                className={`filter-option-btn${selectedYear === year ? ' selected' : ''}`}
                                onClick={() => applyCustomYear(year)}
                              >
                                {year}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="filter-section">
                    <div className="filter-section-label">Select period</div>
                    <div className="date-range-inputs">
                      <input
                        type="date"
                        value={customRange.from}
                        onChange={(e) => setCustomRange((prev) => ({ ...prev, from: e.target.value }))}
                      />
                      <span className="range-separator">to</span>
                      <input
                        type="date"
                        value={customRange.to}
                        onChange={(e) => setCustomRange((prev) => ({ ...prev, to: e.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      className="filter-option-btn apply"
                      onClick={applyCustomRange}
                      disabled={!customRange.from || !customRange.to}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="analytics-empty analytics-error">{error}</div>
      ) : (
        <>
          <div className="summary-boxes-container">
            {summaryCards.map((card) => {
              let backgroundColor = '#E9F1FF';
              let numberColor = '#4C6EF5';

              if (card.tone === 'yellow') {
                backgroundColor = '#FFF6D6';
                numberColor = '#DFAF2B';
              } else if (card.tone === 'red') {
                backgroundColor = '#FDE8E8';
                numberColor = '#E25555';
              } else if (card.tone === 'green') {
                backgroundColor = '#EAF7F0';
                numberColor = '#3FA97C';
              }

              return (
                <div
                  key={card.label}
                  className="summary-box"
                  style={{
                    backgroundColor,
                    cursor: 'pointer',
                  }}
                  onClick={card.onClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      card.onClick();
                    }
                  }}
                  title={`Click to view ${card.label.toLowerCase()}`}
                >
                  <div className="summary-number" style={{ color: numberColor }}>
                    {formatCount(card.value)}
                  </div>
                  <div className="summary-label">{card.label}</div>
                </div>
              );
            })}
          </div>

          {loading ? (
            <div className="analytics-empty">Loading dashboard…</div>
          ) : (
            <>
              {/* Row 1: Today activities + Target vs achieved */}
              <div
                className="presales-chart-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '16px',
                }}
              >
                <TodayActivitiesWidget
                  calls={todayActivitiesCounts.calls}
                  meetings={todayActivitiesCounts.meetings}
                  activities={todayActivitiesCounts.activities}
                  progressColor={todayActivityProgressColor}
                  onTitleClick={handleTodayActivitiesClick}
                />
                <TargetAchievedChart
                  target={targetAmount}
                  achieved={achievedDeals}
                  onTitleClick={handleTargetVsAchievedClick}
                />
              </div>

              {/* Row 2: Activity type + Activity status */}
              <div
                className="presales-chart-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '16px',
                }}
              >
                <div style={{ height: '100%' }}>
                  <StackedBarChart
                    title="Activity status"
                    categories={activityStatusCategories}
                    series={buildSeries.statusSeries}
                    legendItems={orgLegendItems}
                    onTitleClick={handleActivityStatusClick}
                  />
                </div>
                <div style={{ height: '100%' }}>
                  <ActivityTypeFunnel
                    title="Activity type"
                    rows={activityTypeFunnelRows}
                    legendItems={orgLegendItems}
                    onTitleClick={handleActivityTypeClick}
                  />
                </div>
              </div>

              <div
                className="presales-chart-grid"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}
              >
                <div className="chart-compact deal-source-chart">
                  <StackedBarChart
                    title="Deal source"
                    categories={dealSourceCategories}
                    series={buildSeries.dealSourceSeries}
                    legendItems={orgLegendItems}
                    categoryColors={dealSourceColors}
                    onTitleClick={() => {
                      const params = new URLSearchParams();
                      params.set('dateFrom', formatDateForUrl(rangeStart));
                      params.set('dateTo', formatDateForUrl(rangeEnd));
                      if (selectedOrgIds.length > 0) {
                        params.set('organizationId', selectedOrgIds.join(','));
                      }
                      navigate(`/reports/deal-source?${params.toString()}`);
                    }}
                  />
                </div>
                <div className="chart-compact">
                  <StackedBarChart
                    title="Deal sub-source"
                    categories={dealSubSourceCategories}
                    series={buildSeries.dealSubSourceSeries}
                    legendItems={orgLegendItems}
                    categoryColors={dealSubSourceColors}
                    onTitleClick={() => {
                      const params = new URLSearchParams();
                      params.set('dateFrom', formatDateForUrl(rangeStart));
                      params.set('dateTo', formatDateForUrl(rangeEnd));
                      if (selectedOrgIds.length > 0) {
                        params.set('organizationId', selectedOrgIds.join(','));
                      }
                      navigate(`/reports/deal-sub-source?${params.toString()}`);
                    }}
                  />
                </div>
                <PieChart
                  title="Deal status"
                  slices={dealStatusSlices}
                  onTitleClick={() => {
                    const params = new URLSearchParams();
                    params.set('dateFrom', formatDateForUrl(rangeStart));
                    params.set('dateTo', formatDateForUrl(rangeEnd));
                    if (selectedOrgIds.length > 0) {
                      params.set('organizationId', selectedOrgIds.join(','));
                    }
                    navigate(`/reports/deal-status?${params.toString()}`);
                  }}
                />
              </div>

              <div className="presales-chart-grid single-column">
                <StackedBarChart
                  title="Activity by stage"
                  categories={activityStageCategories}
                  series={buildSeries.stageSeries}
                  legendItems={orgLegendItems}
                  categoryColors={activityStageColors}
                  onTitleClick={handleActivityByStageClick}
                />
              </div>

              <div className="presales-chart-grid">
                <PieChart 
                  title="Deal lost by reason" 
                  slices={lostReasonSlices}
                  onTitleClick={() => {
                    const params = new URLSearchParams();
                    params.set('dateFrom', formatDateForUrl(rangeStart));
                    params.set('dateTo', formatDateForUrl(rangeEnd));
                    if (selectedOrgIds.length > 0) {
                      params.set('organizationId', selectedOrgIds.join(','));
                    }
                    navigate(`/reports/deal-lost-reason?${params.toString()}`);
                  }}
                />
                <DealDurationWidget 
                  averageDuration={averageDealDuration} 
                  onTitleClick={() => {
                    const params = new URLSearchParams();
                    const { from, to } = dealDurationWidgetRange;
                    params.set('dateFrom', formatDateForUrl(from));
                    params.set('dateTo', formatDateForUrl(to));
                    if (selectedOrgIds.length > 0) {
                      params.set('organizationId', selectedOrgIds.join(','));
                    }
                    navigate(`/reports/deal-duration?${params.toString()}`);
                  }}
                  onTotalDealValueClick={() => {
                    const params = new URLSearchParams();
                    const { from, to } = dealDurationWidgetRange;
                    params.set('dateFrom', formatDateForUrl(from));
                    params.set('dateTo', formatDateForUrl(to));
                    if (selectedOrgIds.length > 0) {
                      params.set('organizationId', selectedOrgIds.join(','));
                    }
                    navigate(`/reports/deal-duration?${params.toString()}`);
                  }}
                  dateRange={dealDurationDateRange}
                  onDateRangeChange={setDealDurationDateRange}
                  totalDealValue={totalDealValue}
                  customRange={dealDurationCustomRange}
                  onCustomRangeChange={(from, to) => setDealDurationCustomRange({ from, to })}
                />
      </div>
            </>
          )}
        </>
      )}

      {dealDurationModalOpen && (
        <DealDurationModal
          isOpen={dealDurationModalOpen}
          onClose={() => setDealDurationModalOpen(false)}
          deals={dealDurationFilteredDeals.filter((deal) => deal.status === 'WON' || deal.status === 'LOST')}
          organizations={organizations}
          persons={persons}
        />
      )}
    </div>
  );
}

function DealDurationModal({
  isOpen,
  onClose,
  deals,
  organizations,
  persons,
}: {
  isOpen: boolean;
  onClose: () => void;
  deals: Deal[];
  organizations: Organization[];
  persons: Person[];
}) {
  if (!isOpen) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  };


  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatStatus = (status: string) => {
    if (status === 'WON') return 'Won';
    if (status === 'LOST') return 'Lost';
    return status;
  };

  const getPersonInstagramId = (personId?: number | null): string => {
    if (!personId) return '-';
    const person = persons.find((p) => p.id === personId);
    return person?.instagramId || '-';
  };

  const getOrganizationName = (orgId?: number | null): string => {
    if (!orgId) return '-';
    const org = organizations.find((o) => o.id === orgId);
    return org?.name || '-';
  };

  return (
    <div className="deal-duration-modal-overlay" onClick={onClose}>
      <div className="deal-duration-modal" onClick={(e) => e.stopPropagation()}>
        <div className="deal-duration-modal-header">
          <h2>Deal Duration - Deals</h2>
          <button className="deal-duration-modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="deal-duration-modal-content">
          <table className="deal-duration-table">
            <thead>
              <tr>
                <th>Deal Name</th>
                <th>Deal Value</th>
                <th>Organization</th>
                <th>Source</th>
                <th>Instagram ID</th>
                <th>Wedding Date</th>
                <th>Wedding Venue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="deal-duration-table-empty">
                    No deals found
                  </td>
                </tr>
              ) : (
                deals.map((deal) => (
                  <tr key={deal.id}>
                    <td>{deal.name || '-'}</td>
                    <td>{formatCurrency(deal.value)}</td>
                    <td>{getOrganizationName(deal.organizationId)}</td>
                    <td>{deal.source || '-'}</td>
                    <td>{getPersonInstagramId(deal.personId)}</td>
                    <td>{formatDate(deal.eventDate)}</td>
                    <td>{deal.venue || '-'}</td>
                    <td>
                      <span className={`deal-status-badge deal-status-${deal.status.toLowerCase()}`}>
                        {formatStatus(deal.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}



