import { NavLink } from 'react-router-dom'
import './Sidebar.css'

type SidebarProps = {
  isCollapsed: boolean
  onToggle: () => void
}

const Sidebar = ({ isCollapsed, onToggle }: SidebarProps) => {
  const menuItems = [
    { path: '/', icon: '🏠', label: 'HOME' },
    { path: '/pipeline', icon: '📊', label: 'PIPELINE' },
    { path: '/person', icon: '👤', label: 'PERSON' },
    { path: '/activities', icon: '📅', label: 'ACTIVITIES' },
    { path: '/users', icon: '👥', label: 'USERS' },
    { path: '/goals', icon: '🎯', label: 'GOALS' },
    { path: '/deals', icon: '💼', label: 'DEALS' },
    { path: '/settings', icon: '⚙️', label: 'SETTINGS' },
  ]

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        {!isCollapsed && <h2>TBS CRM</h2>}
        {isCollapsed && <h2 className="sidebar-logo-short">TBS</h2>}
        <button className="sidebar-toggle" onClick={onToggle} title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {isCollapsed ? '→' : '←'}
        </button>
      </div>
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-item ${isActive ? 'active' : ''}`
            }
            title={isCollapsed ? item.label : ''}
          >
            {isCollapsed ? (
              <span className="sidebar-icon">{item.icon}</span>
            ) : (
              <span className="sidebar-label">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
