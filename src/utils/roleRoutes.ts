export const resolveRoleDashboardRoute = (role?: string | null): string | null => {
  if (!role) return null;
  switch (role.toUpperCase()) {
    case 'SALES':
      return '/dashboard/sales';
    case 'CATEGORY_MANAGER':
      return '/dashboard/category-manager';
    case 'PRESALES':
    case 'PRE_SALES':
    case 'PRE-SALES':
      return '/dashboard/pre-sales';
    default:
      return null;
  }
};


