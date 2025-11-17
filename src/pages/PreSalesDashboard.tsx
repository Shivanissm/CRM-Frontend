import './RoleDashboards.css';

export default function PreSalesDashboard() {
  return (
    <div className="role-dashboard-page">
      <header className="role-dashboard-header">
        <h1>Pre-Sales Workspace</h1>
        <p className="role-dashboard-subtitle">
          Prepare proposals, coordinate with sales, and surface the insights that close the next big celebration.
        </p>
      </header>

      <div className="role-dashboard-grid">
        <section className="role-dashboard-card">
          <h2>Active Briefs</h2>
          <div className="role-dashboard-metric">5</div>
          <span className="role-dashboard-badge">Awaiting proposal drafts</span>
          <button type="button" className="role-dashboard-cta">
            Open briefs
          </button>
        </section>

        <section className="role-dashboard-card">
          <h2>Upcoming Deadlines</h2>
          <ul className="role-dashboard-list">
            <li>Concept deck for “Royal Heritage” – due today</li>
            <li>Vendor pricing sheet refresh – due tomorrow</li>
            <li>Venue shortlist for Mehta family – Friday</li>
          </ul>
        </section>

        <section className="role-dashboard-card">
          <h2>Collaboration Corner</h2>
          <div className="role-dashboard-empty">
            • Share insights from last weekend&apos;s showcase<br />
            • Sync with Jay (Sales) on entertainment packages<br />
            • Update knowledge base with new décor partners
          </div>
        </section>
      </div>
    </div>
  );
}

