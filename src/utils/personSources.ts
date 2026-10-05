export interface SourceOption {
  code: string;
  label: string;
}

const normalize = (value?: string | null): string => (value || '').trim().toLowerCase();

export const isTbsSource = (option: { code?: string; label?: string } | string): boolean => {
  if (typeof option === 'string') {
    return normalize(option) === 'tbs';
  }
  return normalize(option.code) === 'tbs' || normalize(option.label) === 'tbs';
};

export const withoutTbsSources = <T extends { code?: string; label?: string }>(options: T[] = []): T[] =>
  options.filter((option) => !isTbsSource(option));

export const isDirectGroupSource = (source?: string | null): boolean => {
  const value = normalize(source);
  return value === 'direct' || value === 'reference' || value === 'planner';
};

export const isDivertSource = (source?: string | null): boolean =>
  normalize(source).startsWith('divert');

const VISIBLE_LEAD_CATEGORIES = new Set(['photography', 'makeup', 'bts']);

export const isVisibleLeadCategory = (name?: string | null): boolean =>
  VISIBLE_LEAD_CATEGORIES.has(normalize(name));

export const visibleLeadCategories = <T extends { name?: string | null }>(options: T[] = []): T[] =>
  options.filter((option) => isVisibleLeadCategory(option.name));
