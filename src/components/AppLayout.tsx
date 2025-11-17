import { useMemo } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAuthSession, getStoredUser } from '../utils/authToken';
import './AppLayout.css';
import { resolveRoleDashboardRoute } from '../utils/roleRoutes';

interface NavItem {
  label: string;
  to: string;
  icon?: string;
}

const baseNavItems: NavItem[] = [
  { label: 'Persons', to: '/' , icon: '👥' },
  { label: 'Deals', to: '/deals', icon: '💼' },
  { label: 'Pipelines', to: '/pipelines', icon: '🛤️' },
  { label: 'Teams', to: '/teams', icon: '🤝' },
  { label: 'Activities', to: '/activities', icon: '🗓️' },
  { label: 'Organizations', to: '/organizations', icon: '🏢' },
  { label: 'Users', to: '/users', icon: '🧑‍💼' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const dashboardRoute = resolveRoleDashboardRoute(user?.role);

  const navItems = useMemo(() => {
    if (!dashboardRoute) return baseNavItems;
    return [
      { label: 'Dashboard', to: dashboardRoute, icon: '📊' },
      ...baseNavItems,
    ];
  }, [dashboardRoute]);

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="app-shell-sidebar">
        <div className="app-shell-brand">
          <span className="app-shell-logo">CRM</span>
          <span className="app-shell-title">Brideside</span>
        </div>
        <nav className="app-shell-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
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
        <div className="app-shell-scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}


