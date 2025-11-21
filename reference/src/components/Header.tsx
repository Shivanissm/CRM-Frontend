import { useLocation } from 'react-router-dom'
import './Header.css'

const Header = () => {
  const location = useLocation()
  
  const getPageTitle = () => {
    const path = location.pathname
    if (path === '/') return 'Dashboard'
    if (path === '/users') return 'Users'
    if (path === '/goals') return 'Goals'
    if (path === '/deals') return 'Deals'
    if (path === '/pipeline') return 'Pipeline'
    if (path === '/person') return 'Person'
    if (path === '/activities') return 'Activities'
    if (path === '/settings') return 'Settings'
    return 'Dashboard'
  }

  return (
    <header className="header">
      <div className="header-left">
        <h1 className={`header-title ${location.pathname === '/users' ? 'users-title' : ''}`}>{getPageTitle()}</h1>
      </div>
      <div className="header-right">
        <div className="header-user">
          <span className="user-name">Rajesh Kumar Admin</span>
        </div>
        <button className="btn-dashboard">Dashboard</button>
      </div>
    </header>
  )
}

export default Header

