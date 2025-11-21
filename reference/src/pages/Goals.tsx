import './Goals.css'

type Goal = {
  id: string
  title: string
  segment: 'Pre Sales' | 'Sales'
  current: number
  target: number
  unit: string
}

const goals: Goal[] = [
  { id: 'g-activities', title: 'Activities Completed', segment: 'Pre Sales', current: 124, target: 200, unit: 'activities' },
  { id: 'g-deals', title: 'Deals Won', segment: 'Sales', current: 37, target: 60, unit: 'deals' },
]

const Goals = () => {

  return (
    <div className="goals-page">
      <div className="goals-header">
        <h2 className="goals-title">Goals</h2>
        <button className="goals-add">+ New Goal</button>
      </div>

      <div className="goals-grid">
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.current / g.target) * 100))
          const badgeClass = g.segment === 'Pre Sales' ? 'badge presales' : 'badge sales'
          const barClass = g.segment === 'Pre Sales' ? 'goal-progress-bar presales' : 'goal-progress-bar sales'
          return (
            <div key={g.id} className="goal-card">
              <div className="goal-card-head">
                <div className="goal-title">{g.title}</div>
                <div className={badgeClass}>{g.segment}</div>
              </div>
              <div className="goal-metrics">
                <div className="metric">
                  <div className="metric-label">Current</div>
                  <div className="metric-value">{g.current} {g.unit}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Target</div>
                  <div className="metric-value">{g.target} {g.unit}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Progress</div>
                  <div className="metric-value">{pct}%</div>
                </div>
              </div>
              <div className="goal-progress">
                <div className={barClass} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Per-employee breakdown */}
      <div className="goals-section">
        <h3 className="goals-subtitle">Pre Sales • Activities Completed</h3>
        <div className="person-grid">
          {[
            { id: 'ps-asha', name: 'Asha Rao', current: 58, target: 80 },
            { id: 'ps-nitin', name: 'Nitin Verma', current: 42, target: 70 },
            { id: 'ps-priya', name: 'Priya Shah', current: 24, target: 50 },
          ].map((p) => {
            const pct = Math.min(100, Math.round((p.current / p.target) * 100))
            const initials = p.name.split(' ').map(n => n[0]).join('').slice(0,2)
            return (
              <div key={p.id} className="person-card presales">
                <div className="person-head">
                  <div className="avatar presales">{initials}</div>
                  <div className="person-name">{p.name}</div>
                  <div className="person-value">{p.current}/{p.target}</div>
                </div>
                <div className="person-progress">
                  <div className="person-bar presales" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="goals-section">
        <h3 className="goals-subtitle">Sales • Deals Won</h3>
        <div className="person-grid">
          {[
            { id: 's-gemin', name: 'Gemin Milli', current: 12, target: 20 },
            { id: 's-steve', name: 'Steve Banks', current: 9, target: 18 },
            { id: 's-gracy', name: 'Gracy Fedro', current: 6, target: 12 },
          ].map((p) => {
            const pct = Math.min(100, Math.round((p.current / p.target) * 100))
            const initials = p.name.split(' ').map(n => n[0]).join('').slice(0,2)
            return (
              <div key={p.id} className="person-card sales">
                <div className="person-head">
                  <div className="avatar sales">{initials}</div>
                  <div className="person-name">{p.name}</div>
                  <div className="person-value">{p.current}/{p.target}</div>
                </div>
                <div className="person-progress">
                  <div className="person-bar sales" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Goals


