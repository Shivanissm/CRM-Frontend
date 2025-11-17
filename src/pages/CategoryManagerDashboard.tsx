import './RoleDashboards.css';

export default function CategoryManagerDashboard() {
  return (
    <div className="role-dashboard-page">
      <header className="role-dashboard-header">
        <h1>Category Manager Overview</h1>
        <p className="role-dashboard-subtitle">
          Monitor sales team performance, coach your reps, and keep your product mix ready for upcoming
          bridal seasons.
        </p>
      </header>

      <div className="role-dashboard-grid">
        <section className="role-dashboard-card">
          <h2>Team Highlights</h2>
          <div className="role-dashboard-metric">89%</div>
          <span className="role-dashboard-badge">Team quota attainment</span>
          <button type="button" className="role-dashboard-cta">
            View team board
          </button>
        </section>

        <section className="role-dashboard-card">
          <h2>Key Actions</h2>
          <ul className="role-dashboard-list">
            <li>Assign mentor for new rep Sneha S.</li>
            <li>Approve discount request for deal #BS-198</li>
            <li>Finalize June product showcase inventory</li>
          </ul>
        </section>

        <section className="role-dashboard-card">
          <h2>Performance Watchlist</h2>
          <div className="role-dashboard-empty">
            • Add target coaching sessions for underperforming reps<br />
            • Audit leads aging over 30 days<br />
            • Sync with marketing about July campaigns
          </div>
        </section>
      </div>
    </div>
  );
}

