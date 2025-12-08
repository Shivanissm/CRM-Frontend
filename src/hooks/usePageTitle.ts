import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Map routes to page titles
const routeTitleMap: Record<string, string> = {
  '/login': 'Login - TBSCRM',
  '/accept-invitation': 'Accept Invitation - TBSCRM',
  '/reset-password': 'Reset Password - TBSCRM',
  '/persons': 'Persons - TBSCRM',
  '/activities': 'Activities - TBSCRM',
  '/pipelines': 'Pipelines - TBSCRM',
  '/teams': 'Teams - TBSCRM',
  '/calendar': 'Calendar - TBSCRM',
  '/organizations': 'Organizations - TBSCRM',
  '/deals': 'Deals - TBSCRM',
  '/users': 'Users - TBSCRM',
  '/targets': 'Targets - TBSCRM',
  '/dashboard/sales': 'Sales Dashboard - TBSCRM',
  '/dashboard/category-manager': 'Category Manager Dashboard - TBSCRM',
  '/dashboard/pre-sales': 'Pre-Sales Dashboard - TBSCRM',
};

// Default title
const DEFAULT_TITLE = 'TBSCRM';

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
      title = 'Person Details - TBSCRM';
    } else if (pathname.startsWith('/deals/') && pathname !== '/deals') {
      title = 'Deal Details - TBSCRM';
    } else if (pathname.startsWith('/targets/users/')) {
      title = 'Target User Details - TBSCRM';
    } else {
      // Use exact match or default
      title = routeTitleMap[pathname] || DEFAULT_TITLE;
    }

    document.title = title;
  }, [location.pathname]);
}

