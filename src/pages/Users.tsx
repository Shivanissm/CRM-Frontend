import { useMemo, useState, useEffect } from 'react'
import './Users.css'
import { usersApi } from '../services/users'
import type { User } from '../types/user'

type Member = {
  id: string
  name: string
  role: string
  email: string
  avatar?: string
  total?: number
  direct?: number
  preSales?: Member[]
}

type Group = {
  id: string
  label: string
  count: number
  avatars: string[]
  members: Member[]
}

// Transform API users to component structure
const transformUsersToGroups = (users: User[]): Group[] => {
  if (!users || users.length === 0) {
    console.log('No users provided to transform')
    return []
  }
  
  console.log('Transforming users:', users.length)
  
  // Find admin user (not used in transform, but kept for consistency)
  // const adminUser = users.find(u => u.role === 'ADMIN')
  
  // Group by category manager (users with CATEGORY_MANAGER role or users who are managers of others)
  const categoryManagers = users.filter(u => u.role === 'CATEGORY_MANAGER')
  
  console.log('Category managers found:', categoryManagers.length)
  
  // If no category managers, create groups based on managers
  if (categoryManagers.length === 0) {
    console.log('No category managers, looking for top-level managers')
    // Group by top-level managers (users who have no manager or are managers of others)
    const topManagers = users.filter(u => 
      u.role === 'MANAGER' && (!u.managerId || !users.find(m => m.id === u.managerId))
    )
    
    console.log('Top-level managers found:', topManagers.length)
    
    if (topManagers.length === 0) {
      // If no managers at all, create a single group with all non-admin users
      console.log('No managers found, creating default group')
      const nonAdminUsers = users.filter(u => u.role !== 'ADMIN')
      if (nonAdminUsers.length === 0) {
        return []
      }
      
      // Group all users together
      const members: Member[] = nonAdminUsers.map(u => ({
        id: u.id.toString(),
        name: `${u.firstName} ${u.lastName}`,
        role: u.role === 'SALESREP' ? 'Pre Sales' : u.role === 'MANAGER' ? 'Sales Rep' : 'Category Manager',
        email: u.email,
      }))
      
      return [{
        id: 'group-default',
        label: 'All Users',
        count: members.length,
        avatars: [],
        members,
      }]
    }
    
    return topManagers.map((cm) => {
      const salesReps = users.filter(u => u.managerId === cm.id && u.role === 'MANAGER')
      const preSales = users.filter(u => {
        const manager = users.find(m => m.id === u.managerId)
        return manager && salesReps.some(sr => sr.id === manager.id) && u.role === 'SALESREP'
      })
      
      // Attach pre-sales to their managers
      const salesWithPreSales = salesReps.map(sr => {
        const srPreSales = preSales.filter(ps => {
          const psManager = users.find(m => m.id === ps.managerId)
          return psManager?.id === sr.id
        }).map(ps => ({
          id: ps.id.toString(),
          name: `${ps.firstName} ${ps.lastName}`,
          role: 'Pre Sales',
          email: ps.email,
        }))
        
        return {
          id: sr.id.toString(),
          name: `${sr.firstName} ${sr.lastName}`,
          role: 'Sales Rep',
          email: sr.email,
          preSales: srPreSales.length > 0 ? srPreSales : undefined,
        }
      })
      
      const members: Member[] = [
        {
          id: cm.id.toString(),
          name: `${cm.firstName} ${cm.lastName}`,
          role: 'Category Manager',
          email: cm.email,
          total: salesReps.length + preSales.length,
          direct: salesReps.length,
        },
        ...salesWithPreSales,
      ]
      
      return {
        id: `group-${cm.id}`,
        label: `${cm.firstName} ${cm.lastName}'s Team`,
        count: members.length,
        avatars: [],
        members,
      }
    })
  }
  
  // Create groups for each category manager
  return categoryManagers.map((cm) => {
    // Find all users managed by this category manager (direct and indirect)
    const directReports = users.filter(u => u.managerId === cm.id)
    const salesReps = directReports.filter(u => u.role === 'MANAGER')
    
    // Find pre-sales (SALESREP) that report to the sales reps
    const preSales = users.filter(u => {
      if (u.role !== 'SALESREP') return false
      const manager = users.find(m => m.id === u.managerId)
      return manager && salesReps.some(sr => sr.id === manager.id)
    })
    
    // Attach pre-sales to their managers
    const salesWithPreSales = salesReps.map(sr => {
      const srPreSales = preSales.filter(ps => {
        const psManager = users.find(m => m.id === ps.managerId)
        return psManager?.id === sr.id
      }).map(ps => ({
        id: ps.id.toString(),
        name: `${ps.firstName} ${ps.lastName}`,
        role: 'Pre Sales',
        email: ps.email,
      }))
      
      return {
        id: sr.id.toString(),
        name: `${sr.firstName} ${sr.lastName}`,
        role: 'Sales Rep',
        email: sr.email,
        preSales: srPreSales.length > 0 ? srPreSales : undefined,
      }
    })
    
    const members: Member[] = [
      {
        id: cm.id.toString(),
        name: `${cm.firstName} ${cm.lastName}`,
        role: 'Category Manager',
        email: cm.email,
        total: salesReps.length + preSales.length,
        direct: salesReps.length,
      },
      ...salesWithPreSales,
    ]
    
    return {
      id: `group-${cm.id}`,
      label: `${cm.firstName} ${cm.lastName}'s Team`,
      count: members.length,
      avatars: [],
      members,
    }
  })
}

const Users = () => {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [groupsState, setGroupsState] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedSalesId, setSelectedSalesId] = useState<string | null>(null)
  const [isCategorySelected, setIsCategorySelected] = useState<boolean>(false)
  const [isAdminSelected, setIsAdminSelected] = useState<boolean>(false)
  const [viewMode, setViewMode] = useState<'tree' | 'sheet'>('tree')
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState<boolean>(false)
  const [isSheetEditing, setIsSheetEditing] = useState<boolean>(false)
  const [adminUser, setAdminUser] = useState<User | null>(null)

  const groups = groupsState
  const selected = groups.find((g) => g.id === selectedGroupId) || groups[0]
  
  const categoryManagerTagged = useMemo(() => selected?.members?.find((m) => /category\s*manager/i.test(m.role)), [selected])
  const salesMembersTagged = useMemo(() => selected?.members?.filter((m) => /sales/i.test(m.role) && !/pre/i.test(m.role)) || [], [selected])
  const preSalesMembersTagged = useMemo(() => selected?.members?.filter((m) => /pre\s*-?\s*sales/i.test(m.role)) || [], [selected])

  // Fallback grouping when roles are not tagged in data
  const categoryManager = categoryManagerTagged ?? selected?.members?.[0]
  const restMembers = useMemo(() => (selected?.members || []).filter((m) => m !== categoryManager), [selected, categoryManager])
  const preSalesFallbackCount = Math.max(1, Math.floor(restMembers.length / 3))
  const preSalesMembers = preSalesMembersTagged.length ? preSalesMembersTagged : restMembers.slice(-preSalesFallbackCount)
  const salesMembers = salesMembersTagged.length ? salesMembersTagged : restMembers.filter((m) => !preSalesMembers.includes(m))

  const allSales = useMemo(() => groups.flatMap((g) => g.members.filter((m) => /sales/i.test(m.role) && !/pre/i.test(m.role))), [groups])
  const allPreSales = useMemo(() => groups.flatMap((g) => g.members.flatMap((m) => m.preSales || [])), [groups])

  const displayedSales = useMemo(() => {
    if (isAdminSelected) return allSales
    if (isCategorySelected) return salesMembers
    return [] // Show nothing until a category manager is selected
  }, [isAdminSelected, isCategorySelected, allSales, salesMembers])
  
  const salesCount = displayedSales.length
  
  const preSalesCount = useMemo(() => {
    if (!isCategorySelected && !isAdminSelected) return 0
    if (selectedSalesId) {
      const selectedSales = displayedSales.find((s) => s.id === selectedSalesId)
      return selectedSales?.preSales?.length || 0
    }
    if (isAdminSelected) return allPreSales.length
    return displayedSales.reduce((sum, s) => sum + (s.preSales?.length || 0), 0)
  }, [isCategorySelected, isAdminSelected, selectedSalesId, displayedSales, allPreSales])
  
  const visiblePreSales = useMemo(() => {
    if (!isCategorySelected && !isAdminSelected) return [] // Show nothing until something is selected
    const base = isAdminSelected ? allSales : salesMembers
    if (selectedSalesId) {
      return base.find((s) => s.id === selectedSalesId)?.preSales || []
    }
    if (isAdminSelected) return allPreSales
    return salesMembers.flatMap((s) => s.preSales || [])
  }, [isAdminSelected, isCategorySelected, allSales, allPreSales, salesMembers, selectedSalesId])

  // Fetch users from API
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await usersApi.getAllUsers()
        console.log('API Response:', response) // Debug log
        if (response.success && response.data) {
          console.log('Users data:', response.data) // Debug log
          console.log('Users count:', response.data.length) // Debug log
          const transformedGroups = transformUsersToGroups(response.data)
          console.log('Transformed groups:', transformedGroups) // Debug log
          setGroupsState(transformedGroups)
          if (transformedGroups.length > 0) {
            setSelectedGroupId(transformedGroups[0].id)
          }
          
          // Find admin user
          const admin = response.data.find(u => u.role === 'ADMIN')
          if (admin) {
            setAdminUser(admin)
          }
        } else {
          setError(response.message || 'Failed to fetch users')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch users')
        console.error('Error fetching users:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchUsers()
  }, [])

  const adminMember: Member = adminUser ? {
    id: adminUser.id.toString(),
    name: `${adminUser.firstName} ${adminUser.lastName}`,
    role: 'Admin',
    email: adminUser.email,
  } : { id: 'admin', name: 'Admin', role: 'Admin', email: '' }

  // Sheet edit helpers
  const renameGroup = (groupId: string, newLabel: string) => {
    setGroupsState((prev) => prev.map((g) => (g.id === groupId ? { ...g, label: newLabel } : g)))
  }
  const renameMember = (memberId: string, newName: string) => {
    setGroupsState((prev) => prev.map((g) => ({
      ...g,
      members: g.members.map((m) => {
        if (m.id === memberId) return { ...m, name: newName }
        if (m.preSales && m.preSales.length) {
          const updated = m.preSales.map((ps) => (ps.id === memberId ? { ...ps, name: newName } : ps))
          return updated !== m.preSales ? { ...m, preSales: updated } : m
        }
        return m
      })
    })))
  }

  const renderCell = (
    value: string,
    onSave: (v: string) => void,
    autoFocus?: boolean
  ) => {
    if (!isSheetEditing) {
      return <span className="cell-text">{value}</span>
    }
    return (
      <input
        className="sheet-input"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onSave(e.target.value)}
      />
    )
  }

  // Clear all selections when switching views
  useEffect(() => {
    setSelectedMember(null)
    setSelectedSalesId(null)
    setIsCategorySelected(false)
    setIsAdminSelected(false)
  }, [viewMode])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.view-dropdown')) {
        setIsViewDropdownOpen(false)
      }
    }
    if (isViewDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isViewDropdownOpen])

  // Create connection lines
  useEffect(() => {
    const svg = document.getElementById('connection-lines-svg')
    if (!svg || !(svg instanceof SVGElement)) return

    // Clear existing lines
    svg.innerHTML = ''

    // Get all elements
    const cmCircles = document.querySelectorAll('.cm-circle[data-cm-index]')
    const salesPills = document.querySelectorAll('.board-pill.sales[data-sales-index]')
    const presalesPills = document.querySelectorAll('.board-pill.presales[data-presales-index]')

    // Connect Sales to Category Manager (horizontal + vertical)
    salesPills.forEach((salesPill) => {
      const cmIndex = parseInt(salesPill.getAttribute('data-cm-index') || '-1')
      const salesIndex = parseInt(salesPill.getAttribute('data-sales-index') || '-1')
      
      if (cmIndex >= 0 && salesIndex >= 0 && cmCircles[cmIndex]) {
        const cmRect = cmCircles[cmIndex].getBoundingClientRect()
        const salesRect = salesPill.getBoundingClientRect()
        const orgGrid = document.querySelector('.org-grid')?.getBoundingClientRect()
        
        if (orgGrid) {
          const cmY = cmRect.top + cmRect.height / 2 - orgGrid.top
          const salesY = salesRect.top + salesRect.height / 2 - orgGrid.top
          const cmX = cmRect.right - orgGrid.left
          const salesX = salesRect.left - orgGrid.left
          
          // Create path for L-shaped connection: horizontal then vertical
          const midX = (cmX + salesX) / 2
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', `M ${cmX} ${cmY} L ${midX} ${cmY} L ${midX} ${salesY} L ${salesX} ${salesY}`)
          path.setAttribute('stroke', '#800000')
          path.setAttribute('stroke-width', '2')
          path.setAttribute('fill', 'none')
          path.setAttribute('opacity', '0.4')
          svg.appendChild(path)
        }
      }
    })

    // Connect Pre-Sales to Sales (horizontal + vertical)
    presalesPills.forEach((presalesPill) => {
      const salesIndex = parseInt(presalesPill.getAttribute('data-sales-index') || '-1')
      const presalesIndex = parseInt(presalesPill.getAttribute('data-presales-index') || '-1')
      
      if (salesIndex >= 0 && presalesIndex >= 0 && salesPills[salesIndex]) {
        const salesRect = salesPills[salesIndex].getBoundingClientRect()
        const presalesRect = presalesPill.getBoundingClientRect()
        const orgGrid = document.querySelector('.org-grid')?.getBoundingClientRect()
        
        if (orgGrid) {
          const salesY = salesRect.top + salesRect.height / 2 - orgGrid.top
          const presalesY = presalesRect.top + presalesRect.height / 2 - orgGrid.top
          const salesX = salesRect.right - orgGrid.left
          const presalesX = presalesRect.left - orgGrid.left
          
          // Create path for L-shaped connection: horizontal then vertical
          const midX = (salesX + presalesX) / 2
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', `M ${salesX} ${salesY} L ${midX} ${salesY} L ${midX} ${presalesY} L ${presalesX} ${presalesY}`)
          path.setAttribute('stroke', '#c026d3')
          path.setAttribute('stroke-width', '2')
          path.setAttribute('fill', 'none')
          path.setAttribute('opacity', '0.4')
          svg.appendChild(path)
        }
      }
    })
  }, [displayedSales, visiblePreSales, selectedGroupId, selectedSalesId, isCategorySelected, isAdminSelected])

  if (loading) {
    return (
      <>
        <h1 className="users-page-title">Users</h1>
        <div className="board-page">
          <div style={{ padding: '40px', textAlign: 'center' }}>Loading users...</div>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <h1 className="users-page-title">Users</h1>
        <div className="board-page">
          <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>
            Error: {error}
          </div>
        </div>
      </>
    )
  }

  if (groups.length === 0) {
    return (
      <>
        <h1 className="users-page-title">Users</h1>
        <div className="board-page">
          <div style={{ padding: '40px', textAlign: 'center' }}>No users found</div>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="users-page-title">Users</h1>
      <div className="users-header-new">
          <div className="users-header-top">
            <div className="users-toolbar-left">
              <button className="tab-new active">Active Users <span className="dropdown-arrow">▾</span></button>
              <div className="users-secondary-actions">
                <button className="icon-btn-small" title="Time">⏳</button>
                <button className="icon-btn-small" title="Search">🔍</button>
                <button className="icon-btn-small" title="Filter">⚲</button>
                <button className="icon-btn-close" title="Close">×</button>
              </div>
            </div>
            <div className="users-toolbar-right">
              <div className="view-dropdown">
                <button className="icon-btn-tree" onClick={() => setIsViewDropdownOpen(!isViewDropdownOpen)}>
                  {viewMode === 'tree' ? 'Tree' : 'Sheet'} <span>▾</span>
                </button>
                {isViewDropdownOpen && (
                  <div className="view-menu">
                    <button className={`view-menu-item ${viewMode === 'tree' ? 'active' : ''}`} onClick={() => { setViewMode('tree'); setIsViewDropdownOpen(false); }}>
                      Tree
                    </button>
                    <button className={`view-menu-item ${viewMode === 'sheet' ? 'active' : ''}`} onClick={() => { setViewMode('sheet'); setIsViewDropdownOpen(false); }}>
                      Sheet
                    </button>
                  </div>
                )}
              </div>
              {viewMode === 'sheet' && (
                <button
                  className="icon-btn"
                  onClick={() => setIsSheetEditing((v) => !v)}
                  title={isSheetEditing ? 'Finish editing' : 'Edit sheet'}
                  aria-label={isSheetEditing ? 'Finish editing' : 'Edit sheet'}
                >
                  {isSheetEditing ? '✓' : '✎'}
                </button>
              )}
              <button className="btn-add-user">Add User</button>
            </div>
          </div>
        </div>
        <div className="board-page">
      {/* category chips removed per request */}

      <div className="branch-bar" style={{display:'none'}}>
        <div className="branch-track" />
        <div className="branch-nodes">
          <div className="branch-node-chip inactive">
            <span className="chip-badge">{selected.count}</span>
            <span className="chip-label">Admin</span>
          </div>
          <div className="branch-node-chip inactive">
            <span className="chip-badge">{selected.count - 37 > 0 ? selected.count - 37 : 32}</span>
            <span className="chip-label">Category Manager</span>
          </div>
          <div className="branch-node-chip inactive">
            <span className="chip-badge">{salesCount || 28}</span>
            <span className="chip-label">Sales</span>
          </div>
          <div className="branch-node-chip active">
            <span className="chip-badge">{preSalesCount || 22}</span>
            <span className="chip-label">Pre Sales</span>
          </div>
        </div>
      </div>

      {/* chain removed per request */}

      <div className="board-content">
        {viewMode === 'tree' ? (
        <div className="org-grid">
          {/* SVG for connection lines */}
          <svg id="connection-lines-svg" className="connection-lines-svg" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}></svg>
          <div className="org-col admin-col">
            <div className="org-title">admin <span className="title-badge">{groups.length}</span></div>
            <div className="avatar-stack">
              <div
                className={`avatar-small ${isAdminSelected ? 'active' : ''}`}
                onClick={() => { setIsAdminSelected(true); setIsCategorySelected(false); setSelectedSalesId(null); setSelectedMember(adminMember) }}
                title={adminMember.name}
              >
                <span>{adminMember.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'AD'}</span>
              </div>
            </div>
          </div>

          <div className="org-col cm-col">
            <div className="org-title">category manager <span className="title-badge">{groups.length}</span></div>
            <div className="cm-stack">
              {groups.map((g, cmIndex) => {
                const cm = g.members.find((m) => /category\s*manager/i.test(m.role)) || g.members[0]
                const initials = (cm?.name || g.label).split(' ').map((n) => n[0]).join('').slice(0,2)
                const isActive = selectedGroupId === g.id && isCategorySelected
                return (
                  <div
                    key={g.id}
                    className={`cm-circle ${isActive ? 'active' : ''}`}
                    onClick={() => { setSelectedGroupId(g.id); setIsAdminSelected(false); setIsCategorySelected(true); setSelectedSalesId(null); if (cm) setSelectedMember(cm); }}
                    title={cm?.name || g.label}
                    data-cm-index={cmIndex}
                    data-group-id={g.id}
                  >
                    <div className="cm-circle-inner">
                      <div className="cm-avatar">{initials}</div>
                      <div className="cm-name">{cm?.name || g.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="org-col sales-col">
            <div className="column-title">sales <span className="title-badge">{salesCount}</span></div>
            {!isCategorySelected && !isAdminSelected ? (
              <div className="placeholder-msg">Select Category Manager</div>
            ) : (
            <div className="column-list">
              {displayedSales.map((s, salesIndex) => {
                const salesGroup = groups.find(g => g.members.some(m => m.id === s.id))
                const cmIndex = groups.findIndex(g => g.id === salesGroup?.id)
  return (
                  <div
                    key={s.id}
                    className={`board-pill sales ${selectedSalesId === s.id ? 'is-active' : ''} ${s.preSales?.length ? 'has-children' : ''}`}
                    onClick={() => { setSelectedMember(s); setSelectedSalesId(s.id); }}
                    data-sales-id={s.id}
                    data-cm-index={cmIndex}
                    data-sales-index={salesIndex}
                  >
                    <div className="board-pill-avatar">{s.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
                    <div className="board-pill-info">
                      <div className="board-pill-name">{s.name}</div>
                      <div className="board-pill-role">{s.role}</div>
                      {s.email && <div className="board-pill-email">{s.email}</div>}
                    </div>
                    <span className="row-badge">{s.preSales?.length ?? 0}</span>
                  </div>
                )
              })}
            </div>
            )}
          </div>

          <div className="org-col presales-col">
            <div className="column-title">pre sales <span className="title-badge">{preSalesCount}</span></div>
            {!isCategorySelected && !isAdminSelected ? (
              <div className="placeholder-msg">Select Category Manager</div>
            ) : visiblePreSales.length === 0 && !selectedSalesId ? (
              <div className="placeholder-msg">Select Sales Rep</div>
            ) : (
            <div className="column-list">
              {visiblePreSales.map((ps, presalesIndex) => {
                const parentSales = displayedSales.find(s => s.preSales?.some(p => p.id === ps.id))
                const salesGroup = groups.find(g => g.members.some(m => m.id === parentSales?.id))
                const cmIndex = groups.findIndex(g => g.id === salesGroup?.id)
                const salesIndex = displayedSales.findIndex(s => s.id === parentSales?.id)
                return (
                <div
                  key={ps.id}
                  className={`board-pill small presales ${selectedMember?.id === ps.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedMember(ps)}
                  data-presales-id={ps.id}
                    data-parent-sales-id={parentSales?.id}
                    data-cm-index={cmIndex}
                    data-sales-index={salesIndex}
                    data-presales-index={presalesIndex}
                  >
                    <div className="board-pill-avatar">{ps.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
                    <div className="board-pill-info">
                      <div className="board-pill-name">{ps.name}</div>
                      <div className="board-pill-role">{ps.role}</div>
                      {ps.email && <div className="board-pill-email">{ps.email}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
            )}
          </div>
        </div>
        ) : (
          <div className="sheet-view">
            <table className="users-sheet-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Category Manager</th>
                  <th>Sales Rep</th>
                  <th>Pre Sales</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const cm = g.members.find((m) => /category\s*manager/i.test(m.role)) || g.members[0]
                  const sales = g.members.filter((m) => /sales/i.test(m.role) && !/pre/i.test(m.role))
                  
                  if (sales.length === 0) {
                    return (
                      <tr key={`${g.id}-empty`}>
                        <td>{renderCell(g.label, (v) => renameGroup(g.id, v), true)}</td>
                        <td>{renderCell(cm?.name || '', (v) => cm && renameMember(cm.id, v))}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    )
                  }
                  
                  return sales.flatMap((s) => {
                    const presales = s.preSales || []
                    if (presales.length === 0) {
                      return (
                        <tr key={s.id}>
                          <td>{renderCell(g.label, (v) => renameGroup(g.id, v))}</td>
                          <td>{renderCell(cm?.name || '', (v) => cm && renameMember(cm.id, v))}</td>
                          <td>{renderCell(s.name, (v) => renameMember(s.id, v))}</td>
                          <td></td>
                        </tr>
                      )
                    }
                    return presales.map((p, idx) => (
                      <tr key={`${s.id}-${p.id}`}>
                        <td>{idx === 0 ? renderCell(g.label, (v) => renameGroup(g.id, v)) : null}</td>
                        <td>{idx === 0 ? renderCell(cm?.name || '', (v) => cm && renameMember(cm.id, v)) : null}</td>
                        <td>{idx === 0 ? renderCell(s.name, (v) => renameMember(s.id, v)) : null}</td>
                        <td>{renderCell(p.name, (v) => renameMember(p.id, v))}</td>
                      </tr>
                    ))
                  })
                })}
              </tbody>
            </table>
          </div>
        )}

            {selectedMember && (
              <div className="board-detail">
                <div className="board-detail-name">{selectedMember.name}</div>
                <div className="board-detail-email">{selectedMember.email}</div>
            <div className="board-detail-stats">
              <div className="stat">
                    <div className="stat-num">{selectedMember.total ?? 0}</div>
                <div className="stat-label">Total Members</div>
              </div>
              <div className="stat">
                    <div className="stat-num">{selectedMember.direct ?? 0}</div>
                <div className="stat-label">Direct reports</div>
              </div>
            </div>
                {(isCategorySelected && /category\s*manager/i.test(selectedMember.role)) && (
                  <div className="detail-info-section">
                    <div className="detail-info-line">
                      <span className="detail-info-label">Category:</span>
                      <span className="detail-info-value">{selected.label}</span>
                    </div>
                    <div className="detail-info-line">
                      <span className="detail-info-label">Sales reps:</span>
                      <span className="detail-info-value">{salesMembers.length}</span>
                    </div>
                    <div className="detail-info-line">
                      <span className="detail-info-label">Pre sales:</span>
                      <span className="detail-info-value">{salesMembers.reduce((s, m) => s + (m.preSales?.length || 0), 0)}</span>
                    </div>
                  </div>
                )}
            <div className="board-detail-actions">
              <button>✉</button>
              <button>📞</button>
              <button>💬</button>
                  <button onClick={() => setSelectedMember(null)}>✕</button>
            </div>
          </div>
        )}
      </div>

      <button className="board-invite">send invite</button>
        </div>
        </>
  )
}

export default Users
