import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { clearAuthSession, getStoredUser } from '../utils/authToken';
import './AppLayout.css';
import { resolveRoleDashboardRoute } from '../utils/roleRoutes';
import QuickAdd from './QuickAdd';
import { dealsApi } from '../services/deals';
import { personsApi } from '../services/api';
import { organizationsApi } from '../services/organizations';
import { activitiesApi } from '../services/activities';
import { addToRecentlyViewed } from '../utils/recentlyViewed';

interface NavItem {
  label: string;
  to: string;
  icon?: string;
}

const baseNavItems: NavItem[] = [
  { label: 'Persons', to: '/persons' , icon: '👥' },
  { label: 'Deals', to: '/deals', icon: '💼' },
  { label: 'Calendar', to: '/calendar', icon: '📅' },
  { label: 'Teams', to: '/teams', icon: '🤝' },
  { label: 'Activities', to: '/activities', icon: '🗓️' },
  { label: 'Organizations', to: '/organizations', icon: '🏢' },
  { label: 'Users', to: '/users', icon: '🧑‍💼' },
  { label: 'Targets', to: '/targets', icon: '🎯' },
];

interface SearchResult {
  type: 'deal' | 'person' | 'organization' | 'activity';
  id: number;
  title: string;
  subtitle?: string;
  status?: string;
  value?: number;
}

export default function AppLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const dashboardRoute = resolveRoleDashboardRoute(user?.role);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const resultsDropdownRef = useRef<HTMLDivElement>(null);

  const navItems = useMemo(() => {
    if (!dashboardRoute) return baseNavItems;
    return [
      { label: 'Dashboard', to: dashboardRoute, icon: '📊' },
      ...baseNavItems,
    ];
  }, [dashboardRoute]);

  // Perform search - optimized with parallel requests
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    setShowResults(true);
    try {
      const searchLower = query.toLowerCase().trim();
      const allResults: SearchResult[] = [];

      // Execute all searches in parallel for faster response
      const [dealsResult, personsResult, organizationsResult, activitiesResult] = await Promise.allSettled([
        // Search deals
        dealsApi.list().then(deals => 
          deals
            .filter(deal => deal.name.toLowerCase().includes(searchLower))
            .slice(0, 5)
            .map(deal => ({
              type: 'deal' as const,
              id: deal.id,
              title: deal.name,
              subtitle: deal.personId ? `Person ID: ${deal.personId}` : 'No person',
              status: deal.status,
              value: deal.value || undefined,
            }))
        ),
        // Search persons
        personsApi.list({ page: 0, size: 50, q: query }).then(personsResponse => 
          (personsResponse.content || [])
            .slice(0, 5)
            .map(person => ({
              type: 'person' as const,
              id: person.id,
              title: person.name,
              subtitle: person.organization || person.email || person.phone || undefined,
            }))
        ),
        // Search organizations
        organizationsApi.list().then(organizations => 
          organizations
            .filter(org => org.name.toLowerCase().includes(searchLower))
            .slice(0, 5)
            .map(org => ({
              type: 'organization' as const,
              id: org.id,
              title: org.name,
              subtitle: org.category || undefined,
            }))
        ),
        // Search activities
        activitiesApi.list({ page: 0, size: 50 }).then(activitiesResponse => {
          const activities = activitiesResponse.content || [];
          return activities
            .filter(activity => 
              activity.subject?.toLowerCase().includes(searchLower) ||
              activity.assignedUser?.toLowerCase().includes(searchLower) ||
              activity.dealName?.toLowerCase().includes(searchLower)
            )
            .slice(0, 5)
            .map(activity => ({
              type: 'activity' as const,
              id: activity.id,
              title: activity.subject || 'Untitled Activity',
              subtitle: `${activity.assignedUser || 'Unassigned'} · ${activity.dealName || 'No deal'}`,
              status: activity.done ? 'Done' : 'Pending',
            }));
        }),
      ]);

      // Collect results from all settled promises
      if (dealsResult.status === 'fulfilled') {
        allResults.push(...dealsResult.value);
      }
      if (personsResult.status === 'fulfilled') {
        allResults.push(...personsResult.value);
      }
      if (organizationsResult.status === 'fulfilled') {
        allResults.push(...organizationsResult.value);
      }
      if (activitiesResult.status === 'fulfilled') {
        allResults.push(...activitiesResult.value);
      }

      setSearchResults(allResults);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search - reduced delay for faster response
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setShowResults(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch(searchQuery);
    }, 150); // Reduced from 300ms to 150ms for faster response

    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSearch]);

  // Handle result selection
  const handleSelectResult = useCallback((result: SearchResult) => {
    // Add to recently viewed
    addToRecentlyViewed({
      type: result.type,
      id: result.id,
      title: result.title,
      subtitle: result.subtitle,
      status: result.status,
      value: result.value,
    });

    // Navigate to the result
    let path = '';
    switch (result.type) {
      case 'deal':
        path = `/deals/${result.id}`;
        break;
      case 'person':
        path = `/persons/${result.id}`;
        break;
      case 'organization':
        path = `/organizations`;
        break;
      case 'activity':
        path = `/activities?activityId=${result.id}`;
        break;
    }

    if (path) {
      navigate(path);
      setSearchQuery('');
      setSearchResults([]);
      setShowResults(false);
      setSelectedIndex(-1);
    }
  }, [navigate]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const maxIndex = searchResults.length - 1;
      setSelectedIndex(prev => (prev < maxIndex ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && searchResults[selectedIndex]) {
      e.preventDefault();
      handleSelectResult(searchResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setSearchResults([]);
      setShowResults(false);
      setSelectedIndex(-1);
      searchInputRef.current?.blur();
    }
  };

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        searchWrapperRef.current && 
        !searchWrapperRef.current.contains(target) &&
        resultsDropdownRef.current &&
        !resultsDropdownRef.current.contains(target)
      ) {
        setShowResults(false);
      }
    };

    if (showResults) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showResults]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Keyboard shortcut: Cmd/Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="app-shell-sidebar">
        <div 
          className="app-shell-brand" 
          onClick={() => navigate('/deals')}
        >
          <span className="app-shell-logo">CRM</span>
          <span className="app-shell-title">Brideside</span>
        </div>
        <nav className="app-shell-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/persons'}
              className={({ isActive }) =>
                `app-shell-link${isActive ? ' active' : ''}`
              }
            >
              {item.icon && <span className="app-shell-link-icon">{item.icon}</span>}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="app-shell-footer">
          {user && (
            <div className="app-shell-user">
              <div className="app-shell-avatar">
                {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="app-shell-user-details">
                <div className="app-shell-user-name">
                  {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'User'}
                </div>
                <div className="app-shell-user-role">{user.role ?? 'Member'}</div>
              </div>
            </div>
          )}
          <button className="app-shell-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>
      <main className="app-shell-content">
        <div className="app-shell-header">
          <div className="app-shell-search-wrapper" ref={searchWrapperRef}>
            <div className="app-shell-search-input">
              <svg className="app-shell-search-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="app-shell-search-input-field"
                placeholder="Search Brideside"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (searchResults.length > 0 || searchQuery.trim()) {
                    setShowResults(true);
                  }
                }}
              />
              {searchQuery && (
                <button
                  className="app-shell-search-clear"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setShowResults(false);
                    setSelectedIndex(-1);
                    searchInputRef.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {showResults && (searchResults.length > 0 || isSearching) && createPortal(
              <div 
                ref={resultsDropdownRef}
                className="app-shell-search-results"
                style={{
                  position: 'fixed',
                  top: searchWrapperRef.current ? searchWrapperRef.current.getBoundingClientRect().bottom + 8 : 0,
                  left: searchWrapperRef.current ? searchWrapperRef.current.getBoundingClientRect().left : 0,
                  width: searchWrapperRef.current ? searchWrapperRef.current.offsetWidth : 'auto',
                }}
              >
                {isSearching && (
                  <div className="app-shell-search-loading">
                    <div className="app-shell-search-spinner"></div>
                    <span>Searching...</span>
                  </div>
                )}
                {!isSearching && searchResults.length === 0 && searchQuery.trim() && (
                  <div className="app-shell-search-empty">
                    <span>No results found for &quot;{searchQuery}&quot;</span>
                  </div>
                )}
                {!isSearching && searchResults.length > 0 && (
                  <div className="app-shell-search-results-list" ref={resultsRef}>
                    {searchResults.map((result, index) => (
                      <div
                        key={`${result.type}-${result.id}`}
                        className={`app-shell-search-result-item ${selectedIndex === index ? 'selected' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSelectResult(result);
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div className="app-shell-search-result-icon">
                          {result.type === 'deal' && '$'}
                          {result.type === 'person' && '👤'}
                          {result.type === 'organization' && '🏢'}
                          {result.type === 'activity' && '📅'}
                        </div>
                        <div className="app-shell-search-result-content">
                          <div className="app-shell-search-result-title">{result.title}</div>
                          {result.subtitle && (
                            <div className="app-shell-search-result-subtitle">{result.subtitle}</div>
                          )}
                        </div>
                        {result.status && (
                          <div className={`app-shell-search-result-status ${result.status.toLowerCase()}`}>
                            {result.status}
                          </div>
                        )}
                        {result.value !== undefined && (
                          <div className="app-shell-search-result-value">
                            ₹{result.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>,
              document.body
            )}
            <div className="app-shell-header-actions">
              <QuickAdd
              onAddPerson={() => navigate('/persons', { state: { openModal: true } })}
              onAddDeal={() => navigate('/deals', { state: { openModal: true } })}
              onAddOrganization={() => navigate('/organizations', { state: { openModal: true } })}
              onAddActivity={() => navigate('/activities', { state: { openModal: true } })}
              onAddPipeline={() => navigate('/pipelines', { state: { openModal: true } })}
              onAddUser={() => navigate('/users', { state: { openModal: true } })}
              />
            </div>
          </div>
        </div>
        <div className="app-shell-scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}


