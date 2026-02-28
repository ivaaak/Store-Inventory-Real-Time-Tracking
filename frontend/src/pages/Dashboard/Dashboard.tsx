import styles from './Dashboard.module.css';

const Dashboard = () => {
  const alerts = [
    { id: '1', severity: 'CRITICAL', type: 'PHANTOM_STOCK', shelf: 'DAIRY-A1', sku: 'MILK-001', time: '5m ago' },
    { id: '2', severity: 'HIGH', type: 'DISCREPANCY', shelf: 'DAIRY-A2', sku: 'CHEESE-001', time: '15m ago' },
    { id: '3', severity: 'HIGH', type: 'LOW_STOCK', shelf: 'BAKERY-B1', sku: 'BREAD-001', time: '1h ago' },
  ];

  const recentAudits = [
    { id: '1', shelf: 'DAIRY-A1', status: 'phantom', time: '10m ago', confidence: 95 },
    { id: '2', shelf: 'DAIRY-A2', status: 'match', time: '25m ago', confidence: 92 },
    { id: '3', shelf: 'BAKERY-B1', status: 'discrepancy', time: '1h ago', confidence: 88 },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <div className={styles.timestamp}>
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>🚨</div>
          <div className={styles.metricContent}>
            <div className={styles.metricValue}>3</div>
            <div className={styles.metricLabel}>Active Alerts</div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>📦</div>
          <div className={styles.metricContent}>
            <div className={styles.metricValue}>24</div>
            <div className={styles.metricLabel}>Monitored Shelves</div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>👁️</div>
          <div className={styles.metricContent}>
            <div className={styles.metricValue}>142</div>
            <div className={styles.metricLabel}>Audits Today</div>
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricIcon}>📊</div>
          <div className={styles.metricContent}>
            <div className={styles.metricValue}>94%</div>
            <div className={styles.metricLabel}>Accuracy Rate</div>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Alerts</h2>
            <a href="/alerts" className={styles.link}>View All →</a>
          </div>
          <div className={styles.alertsList}>
            {alerts.map(alert => (
              <div key={alert.id} className={styles.alertItem}>
                <div className={`${styles.alertSeverity} ${styles[`severity${alert.severity}`]}`}>
                  {alert.severity}
                </div>
                <div className={styles.alertContent}>
                  <div className={styles.alertType}>{alert.type.replace('_', ' ')}</div>
                  <div className={styles.alertDetails}>
                    {alert.shelf} • {alert.sku}
                  </div>
                </div>
                <div className={styles.alertTime}>{alert.time}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Audits</h2>
            <a href="/vision-ai" className={styles.link}>View All →</a>
          </div>
          <div className={styles.auditsList}>
            {recentAudits.map(audit => (
              <div key={audit.id} className={styles.auditItem}>
                <div className={styles.auditShelf}>{audit.shelf}</div>
                <div className={`${styles.auditStatus} ${styles[`status${audit.status}`]}`}>
                  {audit.status}
                </div>
                <div className={styles.auditConfidence}>{audit.confidence}%</div>
                <div className={styles.auditTime}>{audit.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Stock Overview</h2>
        </div>
        <div className={styles.chartPlaceholder}>
          <div className={styles.chartIcon}>📊</div>
          <div className={styles.chartText}>Stock trends chart would go here</div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
