import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { dealsApi } from '../services/deals';
import { personsApi } from '../services/api';
import { organizationsApi } from '../services/organizations';
import { activitiesApi } from '../services/activities';
import './GlobalSearch.css';

const SEARCH_HISTORY_KEY = 'crm_search_history';
const RECENTLY_VIEWED_KEY = 'crm_recently_viewed';
const MAX_HISTORY_ITEMS = 10;
const MAX_RECENT_ITEMS = 10;

interface SearchResult {
  type: 'deal' | 'person' | 'organization' | 'activity';
  id: number;
  title: string;
  subtitle?: string;
  status?: string;
  value?: number;
  category?: string; // For search history categorization
}

interface SearchHistoryItem {
  keyword: string;
  category?: string; // e.g., "Organizations", "All categories"
  searchedAt: number;
}

interface RecentlyViewedItem {
  type: 'deal' | 'person' | 'organization' | 'activity';
  id: number;
  title: string;
  subtitle?: string;
  status?: string;
  value?: number;
  viewedAt: number;
}

interface GlobalSearchProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function GlobalSearch({ isOpen: controlledIsOpen, onClose }: GlobalSearchProps = {}) {
  const navigate = useNavigate();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = useCallback((value: boolean) => {
    if (controlledIsOpen !== undefined && onClose) {
      if (!value) onClose();
    } else {
      setInternalIsOpen(value);
    }
  }, [controlledIsOpen, onClose]);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Load search history and recently viewed from localStorage
  useEffect(() => {
    try {
      const history = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (history) {
        const parsed = JSON.parse(history);
        // Handle both old format (string[]) and new format (SearchHistoryItem[])
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === 'string') {
            // Migrate old format to new format
            const migrated: SearchHistoryItem[] = parsed.map((keyword: string) => ({
              keyword,
              searchedAt: Date.now(),
            }));
            setSearchHistory(migrated);
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(migrated));
          } else {
            setSearchHistory(parsed);
          }
        }
      }
      const recent = localStorage.getItem(RECENTLY_VIEWED_KEY);
      if (recent) {
        setRecentlyViewed(JSON.parse(recent));
      }
    } catch (err) {
      console.error('Failed to load search history:', err);
    }
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard shortcut if not already controlled externally
      if (controlledIsOpen === undefined) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          setIsOpen(true);
        }
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearchQuery('');
        setResults([]);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen, controlledIsOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Perform search
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const searchLower = query.toLowerCase().trim();
      const allResults: SearchResult[] = [];

      // Search deals
      try {
        const deals = await dealsApi.list();
        const dealResults = deals
          .filter(deal => 
            deal.name.toLowerCase().includes(searchLower)
          )
          .slice(0, 5)
          .map(deal => ({
            type: 'deal' as const,
            id: deal.id,
            title: deal.name,
            subtitle: deal.personId ? `Person ID: ${deal.personId}` : 'No person',
            status: deal.status,
            value: deal.value || undefined,
          }));
        allResults.push(...dealResults);
      } catch (err) {
        console.error('Failed to search deals:', err);
      }

      // Search persons
      try {
        const personsResponse = await personsApi.list({ page: 0, size: 100, q: query });
        const personResults = (personsResponse.content || [])
          .slice(0, 5)
          .map(person => ({
            type: 'person' as const,
            id: person.id,
            title: person.name,
            subtitle: person.organization || person.email || person.phone || undefined,
          }));
        allResults.push(...personResults);
      } catch (err) {
        console.error('Failed to search persons:', err);
      }

      // Search organizations
      try {
        const organizations = await organizationsApi.list();
        const orgResults = organizations
          .filter(org => org.name.toLowerCase().includes(searchLower))
          .slice(0, 5)
          .map(org => ({
            type: 'organization' as const,
            id: org.id,
            title: org.name,
            subtitle: org.category || undefined,
          }));
        allResults.push(...orgResults);
      } catch (err) {
        console.error('Failed to search organizations:', err);
      }

      // Search activities
      try {
        const activitiesResponse = await activitiesApi.list({ page: 0, size: 100 });
        const activities = activitiesResponse.content || [];
        const activityResults = activities
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
        allResults.push(...activityResults);
      } catch (err) {
        console.error('Failed to search activities:', err);
      }

      setResults(allResults);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, isOpen, performSearch]);

  // Add to search history after results are set
  useEffect(() => {
    if (!searchQuery.trim() || results.length === 0) return;

    const types = new Set(results.map(r => r.type));
    let category: string | undefined;
    if (types.size === 1) {
      const type = Array.from(types)[0];
      category = type === 'organization' ? 'Organizations' : 
                 type === 'person' ? 'Persons' :
                 type === 'deal' ? 'Deals' :
                 type === 'activity' ? 'Activities' : undefined;
    } else {
      category = 'All categories';
    }
    
    if (category) {
      const historyItem: SearchHistoryItem = {
        keyword: searchQuery.trim(),
        category,
        searchedAt: Date.now(),
      };
      setSearchHistory(prev => {
        const existing = prev.filter(h => h.keyword !== searchQuery.trim());
        const updated = [historyItem, ...existing].slice(0, MAX_HISTORY_ITEMS);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
        return updated;
      });
    }
  }, [results, searchQuery]);

  // Handle result selection
  const handleSelectResult = useCallback((result: SearchResult) => {
    // Add to recently viewed
    const recentItem: RecentlyViewedItem = {
      ...result,
      viewedAt: Date.now(),
    };
    const newRecent = [
      recentItem,
      ...recentlyViewed.filter(r => !(r.type === result.type && r.id === result.id))
    ].slice(0, MAX_RECENT_ITEMS);
    setRecentlyViewed(newRecent);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(newRecent));

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
      setIsOpen(false);
      setSearchQuery('');
      setResults([]);
      setSelectedIndex(-1);
    }
  }, [searchQuery, searchHistory, recentlyViewed, navigate]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const maxIndex = results.length - 1;
      setSelectedIndex(prev => (prev < maxIndex ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleSelectResult(results[selectedIndex]);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const displayItems = searchQuery.trim() ? results : [];
  const showHistory = !searchQuery.trim() && searchHistory.length > 0;
  const showRecent = !searchQuery.trim() && recentlyViewed.length > 0;

  return createPortal(
    <div className="global-search-overlay" onClick={() => setIsOpen(false)}>
      <div className="global-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="global-search-header">
          <div className="global-search-input-wrapper">
            <svg className="global-search-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="global-search-input"
              placeholder="Search Pipedrive"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(-1);
              }}
              onKeyDown={handleKeyDown}
            />
            {searchQuery && (
              <button
                className="global-search-clear"
                onClick={() => {
                  setSearchQuery('');
                  setResults([]);
                  setSelectedIndex(-1);
                  inputRef.current?.focus();
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="global-search-content">
          {isSearching && (
            <div className="global-search-loading">
              <div className="global-search-spinner"></div>
              <span>Searching...</span>
            </div>
          )}

          {!isSearching && searchQuery.trim() && displayItems.length === 0 && (
            <div className="global-search-empty">
              <span>No results found for &quot;{searchQuery}&quot;</span>
            </div>
          )}

          {!isSearching && displayItems.length > 0 && (
            <div className="global-search-results" ref={resultsRef}>
              {displayItems.map((result, index) => (
                <div
                  key={`${result.type}-${result.id}`}
                  className={`global-search-result-item ${selectedIndex === index ? 'selected' : ''}`}
                  onClick={() => handleSelectResult(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="global-search-result-icon">
                    {result.type === 'deal' && '$'}
                    {result.type === 'person' && '👤'}
                    {result.type === 'organization' && '🏢'}
                    {result.type === 'activity' && '📅'}
                  </div>
                  <div className="global-search-result-content">
                    <div className="global-search-result-title">{result.title}</div>
                    {result.subtitle && (
                      <div className="global-search-result-subtitle">{result.subtitle}</div>
                    )}
                  </div>
                  {result.status && (
                    <div className={`global-search-result-status ${result.status.toLowerCase()}`}>
                      {result.status}
                    </div>
                  )}
                  {result.value !== undefined && (
                    <div className="global-search-result-value">
                      ₹{result.value.toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isSearching && !searchQuery.trim() && (
            <>
              {showHistory && (
                <div className="global-search-section">
                  <div className="global-search-section-title">Recent keywords</div>
                  <div className="global-search-history">
                    {searchHistory.map((item, index) => (
                      <div
                        key={index}
                        className="global-search-history-item"
                        onClick={() => {
                          setSearchQuery(item.keyword);
                          inputRef.current?.focus();
                        }}
                      >
                        <svg className="global-search-icon" width="16" height="16" viewBox="0 0 20 20" fill="none">
                          <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                          <span style={{ fontWeight: 500 }}>&quot;{item.keyword}&quot;</span>
                          {item.category && (
                            <span style={{ fontSize: '12px', color: '#6b7280' }}>{item.category}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showRecent && (
                <div className="global-search-section">
                  <div className="global-search-section-title">Recently viewed</div>
                  <div className="global-search-results" ref={resultsRef}>
                    {recentlyViewed.map((item, index) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        className={`global-search-result-item ${selectedIndex === index ? 'selected' : ''}`}
                        onClick={() => handleSelectResult(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div className="global-search-result-icon">
                          {item.type === 'deal' && '$'}
                          {item.type === 'person' && '👤'}
                          {item.type === 'organization' && '🏢'}
                          {item.type === 'activity' && '📅'}
                        </div>
                        <div className="global-search-result-content">
                          <div className="global-search-result-title">{item.title}</div>
                          {item.subtitle && (
                            <div className="global-search-result-subtitle">{item.subtitle}</div>
                          )}
                        </div>
                        {item.status && (
                          <div className={`global-search-result-status ${item.status.toLowerCase()}`}>
                            {item.status}
                          </div>
                        )}
                        {item.value !== undefined && (
                          <div className="global-search-result-value">
                            ₹{item.value.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!showHistory && !showRecent && (
                <div className="global-search-empty">
                  <span>Start typing to search...</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

