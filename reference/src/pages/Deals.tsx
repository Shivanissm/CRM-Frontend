import { useState, useEffect, useRef } from 'react'
import './Deals.css'

type Deal = {
  id: number
  name: string
  value: number
  personId: number | null
  pipelineId: number | null
  stageId: number | null
  sourceId: number | null
  organizationId: number | null
  categoryId: number | null
  eventType: string | null
  status: string
  commissionAmount: number | null
  createdAt: string
  venue: string
  phoneNumber: string | null
  finalThankYouSent: boolean | null
  eventDateAsked: boolean | null
  contactNumberAsked: boolean | null
  venueAsked: boolean | null
  eventDate: string
}

type Organization = {
  id: number
  name: string
}

type Category = {
  id: number
  name: string
}

type Person = {
  id: number
  name: string
}

const Deals = () => {
  const [deals, setDeals] = useState<Deal[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterOrganization, setFilterOrganization] = useState<number | null>(null)
  const [filterCategory, setFilterCategory] = useState<number | null>(null)
  const [filterPerson, setFilterPerson] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [viewMode, setViewMode] = useState<'grid' | 'sheet'>('grid')
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState<boolean>(false)
  const [isSheetEditing, setIsSheetEditing] = useState<boolean>(false)
  const viewDropdownRef = useRef<HTMLDivElement>(null)
  const [formData, setFormData] = useState<Partial<Deal>>({
    name: '',
    value: 0,
    status: 'IN_PROGRESS',
    venue: '',
    phoneNumber: '',
    eventDate: '',
    eventType: '',
    organizationId: null,
    categoryId: null,
    personId: null
  })

  // TODO: Replace with actual API endpoints
  useEffect(() => {
    // Simulated API calls - replace with actual fetch
    const fetchData = async () => {
      try {
        setLoading(true)
        // Example: const dealsResponse = await fetch('/api/deals')
        // const dealsData = await dealsResponse.json()
        
        // Mock data for now
        const mockDeals: Deal[] = [
          {
            id: 3,
            name: "Grand Hotel Event",
            value: 50000.00,
            personId: 1,
            pipelineId: null,
            stageId: null,
            sourceId: null,
            organizationId: 1,
            categoryId: 1,
            eventType: "Wedding",
            status: "WON",
            commissionAmount: null,
            createdAt: "2025-10-16T21:35:58.781483",
            venue: "Grand Hotel",
            phoneNumber: null,
            finalThankYouSent: null,
            eventDateAsked: null,
            contactNumberAsked: null,
            venueAsked: null,
            eventDate: "2024-06-15"
          },
          {
            id: 4,
            name: "Corporate Conference",
            value: 75000.00,
            personId: 2,
            pipelineId: null,
            stageId: null,
            sourceId: null,
            organizationId: 2,
            categoryId: 2,
            eventType: "Conference",
            status: "OPEN",
            commissionAmount: null,
            createdAt: "2025-10-15T10:20:30.123456",
            venue: "Convention Center",
            phoneNumber: "+1234567890",
            finalThankYouSent: null,
            eventDateAsked: null,
            contactNumberAsked: null,
            venueAsked: null,
            eventDate: "2024-08-20"
          }
        ]
        
        const mockOrganizations: Organization[] = [
          { id: 1, name: "ABC Corporation" },
          { id: 2, name: "XYZ Industries" },
          { id: 3, name: "Tech Solutions Inc" }
        ]
        
        const mockCategories: Category[] = [
          { id: 1, name: "Electronics" },
          { id: 2, name: "Apparel" },
          { id: 3, name: "Food & Beverage" }
        ]
        
        const mockPersons: Person[] = [
          { id: 1, name: "John Doe" },
          { id: 2, name: "Jane Smith" },
          { id: 3, name: "Mike Johnson" },
          { id: 4, name: "Sarah Williams" }
        ]
        
        setDeals(mockDeals)
        setOrganizations(mockOrganizations)
        setCategories(mockCategories)
        setPersons(mockPersons)
        setLoading(false)
      } catch (err) {
        setError('Failed to load data')
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const filteredDeals = deals.filter(deal => {
    const statusMatch = filterStatus === 'all' || deal.status === filterStatus
    const organizationMatch = filterOrganization === null || deal.organizationId === filterOrganization
    const categoryMatch = filterCategory === null || deal.categoryId === filterCategory
    const personMatch = filterPerson === null || deal.personId === filterPerson
    const searchMatch = searchQuery === '' || 
      (deal.name && deal.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (deal.venue && deal.venue.toLowerCase().includes(searchQuery.toLowerCase()))
    return statusMatch && organizationMatch && categoryMatch && personMatch && searchMatch
  })

  const handleOpenModal = () => {
    setIsModalOpen(true)
      setFormData({
        name: '',
        value: 0,
        status: 'IN_PROGRESS',
        venue: '',
        phoneNumber: '',
        eventDate: '',
        eventType: '',
        organizationId: null,
        categoryId: null,
        personId: null
      })
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'value' || name === 'organizationId' || name === 'categoryId' || name === 'personId'
        ? (value === '' ? null : Number(value))
        : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/deals', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData)
      // })
      // const newDeal = await response.json()
      
      // Mock: Add new deal to state
      const newDeal: Deal = {
        id: Date.now(),
        ...formData,
        name: formData.name || `Deal #${Date.now()}`,
        value: formData.value || 0,
        status: formData.status || 'IN_PROGRESS',
        venue: formData.venue || '',
        createdAt: new Date().toISOString(),
        personId: formData.personId || null,
        pipelineId: null,
        stageId: null,
        sourceId: null,
        eventType: formData.eventType || null,
        phoneNumber: formData.phoneNumber || null,
        finalThankYouSent: null,
        eventDateAsked: null,
        contactNumberAsked: null,
        venueAsked: null,
        eventDate: formData.eventDate || ''
      } as Deal
      
      setDeals(prev => [...prev, newDeal])
      setIsModalOpen(false)
      setFormData({
        name: '',
        value: 0,
        status: 'IN_PROGRESS',
        venue: '',
        phoneNumber: '',
        eventDate: '',
        eventType: '',
        organizationId: null,
        categoryId: null,
        personId: null
      })
    } catch (err) {
      setError('Failed to create deal')
    }
  }

  // Sheet edit helpers
  const updateDeal = (dealId: number, field: keyof Deal, value: string | number | null) => {
    setDeals(prev => prev.map(deal => 
      deal.id === dealId ? { ...deal, [field]: value } : deal
    ))
  }

  const renderCell = (
    value: string | number | null,
    onSave: (v: string) => void,
    type: 'text' | 'number' | 'date' | 'select' = 'text',
    options?: { value: string; label: string }[],
    displayValue?: string
  ) => {
    if (!isSheetEditing) {
      if (displayValue !== undefined) {
        return <span className="cell-text">{displayValue}</span>
      }
      if (value === null || value === '') return <span className="cell-text">—</span>
      if (type === 'number' && typeof value === 'number') {
        return <span className="cell-text">{formatCurrency(value)}</span>
      }
      if (type === 'date' && typeof value === 'string') {
        return <span className="cell-text">{formatDate(value)}</span>
      }
      if (type === 'select' && options) {
        const option = options.find(opt => opt.value === String(value))
        return <span className="cell-text">{option?.label || '—'}</span>
      }
      return <span className="cell-text">{String(value)}</span>
    }

    if (type === 'select' && options) {
      return (
        <select
          className="sheet-input"
          value={String(value || '')}
          onChange={(e) => onSave(e.target.value)}
          autoFocus
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )
    }

    if (type === 'date') {
      return (
        <input
          type="date"
          className="sheet-input"
          value={value ? String(value).split('T')[0] : ''}
          onChange={(e) => onSave(e.target.value)}
          autoFocus
        />
      )
    }

    if (type === 'number') {
      return (
        <input
          type="number"
          className="sheet-input"
          value={value === null || value === '' ? '' : value}
          onChange={(e) => onSave(e.target.value)}
          step="0.01"
          autoFocus
        />
      )
    }

    return (
      <input
        className="sheet-input"
        value={value || ''}
        onChange={(e) => onSave(e.target.value)}
        autoFocus
      />
    )
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(event.target as Node)) {
        setIsViewDropdownOpen(false)
      }
    }
    if (isViewDropdownOpen) {
      // Use setTimeout to ensure the click event on the button completes first
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
      }, 0)
      return () => {
        document.removeEventListener('click', handleClickOutside)
      }
    }
  }, [isViewDropdownOpen])

  const statusColors: Record<string, string> = {
    'WON': '#10b981',
    'LOST': '#ef4444',
    'IN_PROGRESS': '#8b5cf6'
  }

  if (loading) {
    return (
      <div className="deals-page">
        <div className="deals-loading">Loading deals...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="deals-page">
        <div className="deals-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="deals-page">
      <div className="deals-header">
        <div className="deals-header-left">
          <div className="deals-search-container">
            <input
              type="text"
              className="deals-search-input"
              placeholder="Search deals by name or venue..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="deals-search-icon">🔍</span>
          </div>
        </div>
        <div className="deals-header-right">
          <div className="deals-filters">
            <button 
              className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
              onClick={() => setFilterStatus('all')}
            >
              All
            </button>
            <button 
              className={`filter-btn ${filterStatus === 'WON' ? 'active' : ''}`}
              onClick={() => setFilterStatus('WON')}
            >
              Won
            </button>
            <button 
              className={`filter-btn ${filterStatus === 'LOST' ? 'active' : ''}`}
              onClick={() => setFilterStatus('LOST')}
            >
              Lost
            </button>
            <button 
              className={`filter-btn ${filterStatus === 'IN_PROGRESS' ? 'active' : ''}`}
              onClick={() => setFilterStatus('IN_PROGRESS')}
            >
              In Progress
            </button>
          </div>
          <select 
            className="filter-select"
            value={filterOrganization || ''}
            onChange={(e) => setFilterOrganization(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">All Organizations</option>
            {organizations.map(org => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <select 
            className="filter-select"
            value={filterCategory || ''}
            onChange={(e) => setFilterCategory(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <select 
            className="filter-select"
            value={filterPerson || ''}
            onChange={(e) => setFilterPerson(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">All Clients</option>
            {persons.map(person => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
          <div className="view-dropdown" ref={viewDropdownRef}>
            <button 
              className="icon-btn-tree" 
              onClick={(e) => {
                e.stopPropagation()
                setIsViewDropdownOpen(!isViewDropdownOpen)
              }}
            >
              {viewMode === 'grid' ? 'Grid' : 'Sheet'} <span>▾</span>
            </button>
            {isViewDropdownOpen && (
              <div className="view-menu">
                <button 
                  className={`view-menu-item ${viewMode === 'grid' ? 'active' : ''}`} 
                  onClick={(e) => {
                    e.stopPropagation()
                    setViewMode('grid')
                    setIsViewDropdownOpen(false)
                  }}
                >
                  Grid
                </button>
                <button 
                  className={`view-menu-item ${viewMode === 'sheet' ? 'active' : ''}`} 
                  onClick={(e) => {
                    e.stopPropagation()
                    setViewMode('sheet')
                    setIsViewDropdownOpen(false)
                  }}
                >
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
          <button className="deals-add-btn" onClick={handleOpenModal}>+ New Deal</button>
        </div>
      </div>

      <div className="deals-content">
        {viewMode === 'grid' ? (
          <div className="deals-grid">
            {filteredDeals.length === 0 ? (
              <div className="deals-empty">No deals found</div>
            ) : (
              filteredDeals.map((deal) => (
                <div 
                  key={deal.id} 
                  className={`deal-card ${selectedDeal?.id === deal.id ? 'selected' : ''}`}
                  onClick={() => setSelectedDeal(deal)}
                >
                  <div className="deal-card-header">
                    <div className="deal-name">{deal.name || `Deal #${deal.id}`}</div>
                    <div 
                      className="deal-status-badge"
                      style={{ backgroundColor: statusColors[deal.status] || '#6b7280' }}
                    >
                      {deal.status}
                    </div>
                  </div>
                  
                  <div className="deal-value">
                    {formatCurrency(deal.value)}
                  </div>

                  <div className="deal-details">
                    {deal.venue && (
                      <div className="deal-detail-item">
                        <span className="deal-detail-label">Venue:</span>
                        <span className="deal-detail-value">{deal.venue}</span>
                      </div>
                    )}
                    {deal.eventDate && (
                      <div className="deal-detail-item">
                        <span className="deal-detail-label">Event Date:</span>
                        <span className="deal-detail-value">{formatDate(deal.eventDate)}</span>
                      </div>
                    )}
                    {deal.createdAt && (
                      <div className="deal-detail-item">
                        <span className="deal-detail-label">Created:</span>
                        <span className="deal-detail-value">{formatDate(deal.createdAt)}</span>
                      </div>
                    )}
                  </div>

                  {deal.commissionAmount !== null && (
                    <div className="deal-commission">
                      Commission: {formatCurrency(deal.commissionAmount)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="sheet-view">
            <table className="deals-sheet-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Client</th>
                  <th>Organization</th>
                  <th>Category</th>
                  <th>Venue</th>
                  <th>Event Date</th>
                  <th>Event Type</th>
                  <th>Phone</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="deals-empty-cell">No deals found</td>
                  </tr>
                ) : (
                  filteredDeals.map((deal) => {
                    const orgName = organizations.find(o => o.id === deal.organizationId)?.name || '—'
                    const catName = categories.find(c => c.id === deal.categoryId)?.name || '—'
                    const personName = persons.find(p => p.id === deal.personId)?.name || '—'
                    return (
                      <tr key={deal.id}>
                        <td>
                          {renderCell(
                            deal.name || `Deal #${deal.id}`,
                            (v) => updateDeal(deal.id, 'name', v)
                          )}
                        </td>
                        <td>
                          {renderCell(
                            deal.value,
                            (v) => updateDeal(deal.id, 'value', v ? Number(v) : 0),
                            'number'
                          )}
                        </td>
                        <td>
                          {renderCell(
                            deal.status,
                            (v) => updateDeal(deal.id, 'status', v),
                            'select',
                            [
                              { value: 'WON', label: 'Won' },
                              { value: 'LOST', label: 'Lost' },
                              { value: 'IN_PROGRESS', label: 'In Progress' }
                            ]
                          )}
                        </td>
                        <td>
                          {renderCell(
                            deal.personId ? String(deal.personId) : '',
                            (v) => updateDeal(deal.id, 'personId', v ? Number(v) : null),
                            'select',
                            [
                              { value: '', label: '—' },
                              ...persons.map(p => ({ value: String(p.id), label: p.name }))
                            ],
                            personName
                          )}
                        </td>
                        <td>
                          {renderCell(
                            deal.organizationId ? String(deal.organizationId) : '',
                            (v) => updateDeal(deal.id, 'organizationId', v ? Number(v) : null),
                            'select',
                            [
                              { value: '', label: '—' },
                              ...organizations.map(o => ({ value: String(o.id), label: o.name }))
                            ],
                            orgName
                          )}
                        </td>
                        <td>
                          {renderCell(
                            deal.categoryId ? String(deal.categoryId) : '',
                            (v) => updateDeal(deal.id, 'categoryId', v ? Number(v) : null),
                            'select',
                            [
                              { value: '', label: '—' },
                              ...categories.map(c => ({ value: String(c.id), label: c.name }))
                            ],
                            catName
                          )}
                        </td>
                        <td>
                          {renderCell(
                            deal.venue,
                            (v) => updateDeal(deal.id, 'venue', v)
                          )}
                        </td>
                        <td>
                          {renderCell(
                            deal.eventDate,
                            (v) => updateDeal(deal.id, 'eventDate', v),
                            'date'
                          )}
                        </td>
                        <td>
                          {renderCell(
                            deal.eventType,
                            (v) => updateDeal(deal.id, 'eventType', v)
                          )}
                        </td>
                        <td>
                          {renderCell(
                            deal.phoneNumber,
                            (v) => updateDeal(deal.id, 'phoneNumber', v)
                          )}
                        </td>
                        
                        <td>
                          {renderCell(
                            deal.createdAt,
                            (v) => updateDeal(deal.id, 'createdAt', v),
                            'date'
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedDeal && viewMode === 'grid' && (
          <div className="deal-detail-panel">
            <div className="deal-detail-header">
              <h3 className="deal-detail-title">Deal Details</h3>
              <button 
                className="deal-detail-close"
                onClick={() => setSelectedDeal(null)}
              >
                ×
              </button>
            </div>
            
            <div className="deal-detail-content">
              <div className="deal-detail-section">
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Name:</span>
                  <span className="deal-detail-value">{selectedDeal.name || `Deal #${selectedDeal.id}`}</span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Value:</span>
                  <span className="deal-detail-value">{formatCurrency(selectedDeal.value)}</span>
                </div>
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Status:</span>
                  <span 
                    className="deal-detail-value"
                    style={{ color: statusColors[selectedDeal.status] || '#6b7280' }}
                  >
                    {selectedDeal.status}
                  </span>
                </div>
              </div>

              {selectedDeal.venue && (
                <div className="deal-detail-section">
                  <h4 className="deal-detail-section-title">Event Information</h4>
                  <div className="deal-detail-row">
                    <span className="deal-detail-label">Venue:</span>
                    <span className="deal-detail-value">{selectedDeal.venue}</span>
                  </div>
                  {selectedDeal.eventDate && (
                    <div className="deal-detail-row">
                      <span className="deal-detail-label">Event Date:</span>
                      <span className="deal-detail-value">{formatDate(selectedDeal.eventDate)}</span>
                    </div>
                  )}
                  {selectedDeal.eventType && (
                    <div className="deal-detail-row">
                      <span className="deal-detail-label">Event Type:</span>
                      <span className="deal-detail-value">{selectedDeal.eventType}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="deal-detail-section">
                <h4 className="deal-detail-section-title">Additional Information</h4>
                {selectedDeal.phoneNumber && (
                  <div className="deal-detail-row">
                    <span className="deal-detail-label">Phone:</span>
                    <span className="deal-detail-value">{selectedDeal.phoneNumber}</span>
                  </div>
                )}
                {selectedDeal.commissionAmount !== null && (
                  <div className="deal-detail-row">
                    <span className="deal-detail-label">Commission:</span>
                    <span className="deal-detail-value">{formatCurrency(selectedDeal.commissionAmount)}</span>
                  </div>
                )}
                <div className="deal-detail-row">
                  <span className="deal-detail-label">Created:</span>
                  <span className="deal-detail-value">{formatDate(selectedDeal.createdAt)}</span>
                </div>
              </div>

              <div className="deal-detail-actions">
                <button className="deal-action-btn">Edit</button>
                <button className="deal-action-btn">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Deal Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Deal</h3>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Deal Name *</label>
                <input
                  type="text"
                  name="name"
                  className="form-input"
                  value={formData.name || ''}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Value ($) *</label>
                  <input
                    type="number"
                    name="value"
                    className="form-input"
                    value={formData.value || ''}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Status *</label>
                  <select
                    name="status"
                    className="form-input"
                    value={formData.status || 'IN_PROGRESS'}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="WON">Won</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Client (Person)</label>
                  <select
                    name="personId"
                    className="form-input"
                    value={formData.personId || ''}
                    onChange={handleInputChange}
                  >
                    <option value="">Select Client</option>
                    {persons.map(person => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Organization</label>
                  <select
                    name="organizationId"
                    className="form-input"
                    value={formData.organizationId || ''}
                    onChange={handleInputChange}
                  >
                    <option value="">Select Organization</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    name="categoryId"
                    className="form-input"
                    value={formData.categoryId || ''}
                    onChange={handleInputChange}
                  >
                    <option value="">Select Category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Venue</label>
                <input
                  type="text"
                  name="venue"
                  className="form-input"
                  value={formData.venue || ''}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Event Date</label>
                  <input
                    type="date"
                    name="eventDate"
                    className="form-input"
                    value={formData.eventDate || ''}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Event Type</label>
                  <input
                    type="text"
                    name="eventType"
                    className="form-input"
                    value={formData.eventType || ''}
                    onChange={handleInputChange}
                    placeholder="e.g., Wedding, Conference"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  name="phoneNumber"
                  className="form-input"
                  value={formData.phoneNumber || ''}
                  onChange={handleInputChange}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="modal-btn-cancel" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="modal-btn-submit">
                  Create Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Deals

