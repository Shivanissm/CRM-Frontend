// Utility to track recently viewed items for global search

const RECENTLY_VIEWED_KEY = 'crm_recently_viewed';
const MAX_RECENT_ITEMS = 10;

export interface RecentlyViewedItem {
  type: 'deal' | 'person' | 'organization' | 'activity';
  id: number;
  title: string;
  subtitle?: string;
  status?: string;
  value?: number;
  viewedAt: number;
}

export function addToRecentlyViewed(item: Omit<RecentlyViewedItem, 'viewedAt'>) {
  try {
    const existing = localStorage.getItem(RECENTLY_VIEWED_KEY);
    const recent: RecentlyViewedItem[] = existing ? JSON.parse(existing) : [];
    
    const newItem: RecentlyViewedItem = {
      ...item,
      viewedAt: Date.now(),
    };
    
    // Remove existing item with same type and id, then add new one at the beginning
    const filtered = recent.filter(r => !(r.type === item.type && r.id === item.id));
    const updated = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
    
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save recently viewed item:', err);
  }
}

export function getRecentlyViewed(): RecentlyViewedItem[] {
  try {
    const existing = localStorage.getItem(RECENTLY_VIEWED_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch (err) {
    console.error('Failed to load recently viewed items:', err);
    return [];
  }
}

