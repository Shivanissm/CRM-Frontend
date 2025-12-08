import { usePageTitle } from '../hooks/usePageTitle';

/**
 * Component that updates the page title based on the current route
 * Place this inside BrowserRouter to track route changes
 */
export default function PageTitle() {
  usePageTitle();
  return null; // This component doesn't render anything
}

