import type { OrganizationCategory } from '../types/organization';
import type { TargetCategory } from '../types/target';

const normalizeCategoryCode = (code: string): string =>
  code.replace(/[\s-]/g, '_').toUpperCase();

export const FRONTEND_ORGANIZATION_CATEGORY_CODES = ['PHOTOGRAPHY', 'MAKEUP'] as const;

export const FRONTEND_CATEGORY_LABELS = ['Photography', 'Makeup'] as const;

export const FRONTEND_TARGET_CATEGORY: TargetCategory = 'PHOTOGRAPHY';

export const FRONTEND_TARGET_CATEGORIES: TargetCategory[] = ['PHOTOGRAPHY'];

const normalizeCategoryLabel = (label: string): string =>
  label.trim().toLowerCase().replace(/\s+/g, ' ');

const ALLOWED_CATEGORY_CODES = new Set(
  FRONTEND_ORGANIZATION_CATEGORY_CODES.map((code) => normalizeCategoryCode(code)),
);

const ALLOWED_CATEGORY_LABELS = new Set(
  FRONTEND_CATEGORY_LABELS.map((label) => normalizeCategoryLabel(label)),
);

export function isAllowedFrontendCategory(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  return (
    ALLOWED_CATEGORY_CODES.has(normalizeCategoryCode(trimmed)) ||
    ALLOWED_CATEGORY_LABELS.has(normalizeCategoryLabel(trimmed))
  );
}

export function filterFrontendCategoryStrings(categories: string[]): string[] {
  const unique = new Set<string>();

  categories.forEach((category) => {
    const trimmed = category.trim();
    if (isAllowedFrontendCategory(trimmed)) {
      unique.add(trimmed);
    }
  });

  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

export function filterFrontendCategoryOptionList<T extends { id: string; label: string }>(
  options: T[],
): T[] {
  return options.filter(
    (option) =>
      isAllowedFrontendCategory(option.id) || isAllowedFrontendCategory(option.label),
  );
}

export function filterOrganizationCategories(
  categories: OrganizationCategory[],
): OrganizationCategory[] {
  const allowed = new Set(
    FRONTEND_ORGANIZATION_CATEGORY_CODES.map((code) => normalizeCategoryCode(code)),
  );

  return categories.filter((category) => allowed.has(normalizeCategoryCode(category.code)));
}

export function filterTargetCategoryOptions<T extends { code: string }>(categories: T[]): T[] {
  const allowed = new Set(
    FRONTEND_TARGET_CATEGORIES.map((code) => normalizeCategoryCode(code)),
  );

  return categories.filter((category) => allowed.has(normalizeCategoryCode(category.code)));
}

export function isFrontendTargetCategory(category: string): boolean {
  return normalizeCategoryCode(category) === FRONTEND_TARGET_CATEGORY;
}
