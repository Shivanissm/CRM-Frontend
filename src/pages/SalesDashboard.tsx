import './RoleDashboards.css';

export default function SalesDashboard() {
  return (
    <div className="role-dashboard-page">
      <header className="role-dashboard-header">
        <h1>Sales Command Center</h1>
        <p className="role-dashboard-subtitle">
          Track deals in flight, follow up on hot leads, and keep your pipeline healthy.
        </p>
      </header>

      <div className="role-dashboard-grid">
        <section className="role-dashboard-card">
          <h2>Pipeline Snapshot</h2>
          <div className="role-dashboard-metric">₹ 2.4 Cr</div>
          <span className="role-dashboard-badge">7 active deals</span>
          <button type="button" className="role-dashboard-cta">
            Review deals
          </button>
        </section>

        <section className="role-dashboard-card">
          <h2>Today’s Priorities</h2>
          <ul className="role-dashboard-list">
            <li>Call Riya – ceremony package proposal due</li>
            <li>Prepare demo for Karan & Anika</li>
            <li>Update stage for #BS-204 “Summer Gala”</li>
          </ul>
          <button type="button" className="role-dashboard-cta secondary">
            View tasks
          </button>
        </section>

        <section className="role-dashboard-card">
          <h2>Need Attention</h2>
          <ul className="role-dashboard-list">
            <li>2 deals stuck in Negotiation</li>
            <li>3 high-value leads without follow-up</li>
            <li>Monthly quota at 62% achieved</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

