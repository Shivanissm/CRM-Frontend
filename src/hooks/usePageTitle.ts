import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Map routes to page titles
const routeTitleMap: Record<string, string> = {
  '/login': 'Login - Houseofbarqat',
  '/accept-invitation': 'Accept Invitation - Houseofbarqat',
  '/reset-password': 'Reset Password - Houseofbarqat',
  '/persons': 'Persons - Houseofbarqat',
  '/activities': 'Activities - Houseofbarqat',
  '/pipelines': 'Pipelines - Houseofbarqat',
  '/teams': 'Teams - Houseofbarqat',
  '/calendar': 'Calendar - Houseofbarqat',
  '/organizations': 'Organizations - Houseofbarqat',
  '/deals': 'Deals - Houseofbarqat',
  '/users': 'Users - Houseofbarqat',
  '/targets': 'Targets - Houseofbarqat',
  '/dashboard/sales': 'Sales Dashboard - Houseofbarqat',
  '/dashboard/category-manager': 'Category Manager Dashboard - Houseofbarqat',
  '/dashboard/pre-sales': 'Pre-Sales Dashboard - Houseofbarqat',
};

// Default title
const DEFAULT_TITLE = 'Houseofbarqat';

/**
 * Hook to set page title based on current route
 */
export function usePageTitle() {
  const location = useLocation();

  useEffect(() => {
    // Get the base path (without query params or hash)
    const pathname = location.pathname;

    // Check for dynamic routes (e.g., /persons/:id, /deals/:id)
    let title: string | undefined;

    if (pathname.startsWith('/persons/') && pathname !== '/persons') {
      title = 'Person Details - Houseofbarqat';
    } else if (pathname.startsWith('/deals/') && pathname !== '/deals') {
      title = 'Deal Details - Houseofbarqat';
    } else if (pathname.startsWith('/targets/users/')) {
      title = 'Target User Details - Houseofbarqat';
    } else {
      // Use exact match or default
      title = routeTitleMap[pathname] || DEFAULT_TITLE;
    }

    document.title = title;
  }, [location.pathname]);
}

