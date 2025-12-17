import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Map routes to page titles
const routeTitleMap: Record<string, string> = {
  '/login': 'Login - The Brideside',
  '/accept-invitation': 'Accept Invitation - The Brideside',
  '/reset-password': 'Reset Password - The Brideside',
  '/persons': 'Persons - The Brideside',
  '/activities': 'Activities - The Brideside',
  '/pipelines': 'Pipelines - The Brideside',
  '/teams': 'Teams - The Brideside',
  '/calendar': 'Calendar - The Brideside',
  '/organizations': 'Organizations - The Brideside',
  '/deals': 'Deals - The Brideside',
  '/users': 'Users - The Brideside',
  '/targets': 'Targets - The Brideside',
  '/dashboard/sales': 'Sales Dashboard - The Brideside',
  '/dashboard/category-manager': 'Category Manager Dashboard - The Brideside',
  '/dashboard/pre-sales': 'Pre-Sales Dashboard - The Brideside',
};

// Default title
const DEFAULT_TITLE = 'The Brideside';

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
      title = 'Person Details - The Brideside';
    } else if (pathname.startsWith('/deals/') && pathname !== '/deals') {
      title = 'Deal Details - The Brideside';
    } else if (pathname.startsWith('/targets/users/')) {
      title = 'Target User Details - The Brideside';
    } else {
      // Use exact match or default
      title = routeTitleMap[pathname] || DEFAULT_TITLE;
    }

    document.title = title;
  }, [location.pathname]);
}

