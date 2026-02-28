import { useState } from 'react';
import styles from './Alerts.module.css';

interface Alert {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  type: string;
  shelf: string;
  sku: string;
  message: string;
  timestamp: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledgedBy?: string;
  resolvedBy?: string;
}

const Alerts = () => {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  const alerts: Alert[] = [
    {
      id: '1',
      severity: 'CRITICAL',
      type: 'PHANTOM_STOCK',
      shelf: 'DAIRY-A1',
      sku: 'MILK-001',
      message: 'Visual inspection shows empty shelf. System indicates 12 units should be present.',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      status: 'OPEN'
    },
    {
      id: '2',
      severity: 'HIGH',
      type: 'DISCREPANCY',
      shelf: 'DAIRY-A2',
      sku: 'CHEESE-001',
      message: 'Visual count (5) differs from system count (8) by 3 units.',
      timestamp: new Date(Date.now() - 900000).toISOString(),
      status: 'ACKNOWLEDGED',
      acknowledgedBy: 'staff-001'
    },
    {
      id: '3',
      severity: 'HIGH',
      type: 'LOW_STOCK',
      shelf: 'BAKERY-B1',
      sku: 'BREAD-001',
      message: 'Stock level (2) is below minimum threshold (5).',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      status: 'RESOLVED',
      acknowledgedBy: 'staff-002',
      resolvedBy: 'manager-001'
    },
    {
      id: '4',
      severity: 'MEDIUM',
      type: 'DISCREPANCY',
      shelf: 'DAIRY-A3',
      sku: 'YOGURT-001',
      message: 'Minor discrepancy detected between visual and system counts.',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      status: 'OPEN'
    }
  ];

  const filteredAlerts = alerts.filter(alert => {
    if (selectedStatus !== 'all' && alert.status !== selectedStatus) return false;
    if (selectedSeverity !== 'all' && alert.severity !== selectedSeverity) return false;
    return true;
  });

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const handleAcknowledge = (alertId: string) => {
    console.log('Acknowledging alert:', alertId);
    // API call would go here
  };

  const handleResolve = (alertId: string) => {
    console.log('Resolving alert:', alertId);
    // API call would go here
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Alerts</h1>
        <div className={styles.filters}>
          <select 
            className={styles.select}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          
          <select 
            className={styles.select}
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
          >
            <option value="all">All Severity</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
          </select>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {alerts.filter(a => a.status === 'OPEN').length}
          </div>
          <div className={styles.statLabel}>Open</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {alerts.filter(a => a.status === 'ACKNOWLEDGED').length}
          </div>
          <div className={styles.statLabel}>Acknowledged</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {alerts.filter(a => a.status === 'RESOLVED').length}
          </div>
          <div className={styles.statLabel}>Resolved</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {alerts.filter(a => a.severity === 'CRITICAL').length}
          </div>
          <div className={styles.statLabel}>Critical</div>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.alertsList}>
          {filteredAlerts.map(alert => (
            <div
              key={alert.id}
              className={`${styles.alertCard} ${selectedAlert?.id === alert.id ? styles.alertCardActive : ''}`}
              onClick={() => setSelectedAlert(alert)}
            >
              <div className={styles.alertHeader}>
                <div className={styles.alertHeaderLeft}>
                  <span className={`${styles.severity} ${styles[`severity${alert.severity}`]}`}>
                    {alert.severity}
                  </span>
                  <span className={`${styles.status} ${styles[`status${alert.status}`]}`}>
                    {alert.status}
                  </span>
                </div>
                <div className={styles.alertTime}>{getTimeAgo(alert.timestamp)}</div>
              </div>
              
              <div className={styles.alertType}>{alert.type.replace(/_/g, ' ')}</div>
              
              <div className={styles.alertInfo}>
                <span className={styles.alertShelf}>{alert.shelf}</span>
                <span className={styles.separator}>•</span>
                <span className={styles.alertSku}>{alert.sku}</span>
              </div>
              
              <div className={styles.alertMessage}>{alert.message}</div>
            </div>
          ))}
        </div>

        <div className={styles.detailPanel}>
          {selectedAlert ? (
            <>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>Alert Details</h2>
                <span className={`${styles.status} ${styles[`status${selectedAlert.status}`]}`}>
                  {selectedAlert.status}
                </span>
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Information</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Alert ID</div>
                    <div className={styles.detailValue}>{selectedAlert.id}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Severity</div>
                    <div className={styles.detailValue}>
                      <span className={`${styles.severity} ${styles[`severity${selectedAlert.severity}`]}`}>
                        {selectedAlert.severity}
                      </span>
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Type</div>
                    <div className={styles.detailValue}>
                      {selectedAlert.type.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Timestamp</div>
                    <div className={styles.detailValue}>
                      {formatTimestamp(selectedAlert.timestamp)}
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Shelf</div>
                    <div className={styles.detailValue}>{selectedAlert.shelf}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>SKU</div>
                    <div className={styles.detailValue}>{selectedAlert.sku}</div>
                  </div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Message</h3>
                <div className={styles.messageBox}>
                  {selectedAlert.message}
                </div>
              </div>

              {selectedAlert.acknowledgedBy && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>History</h3>
                  <div className={styles.timeline}>
                    <div className={styles.timelineItem}>
                      <div className={styles.timelineDot}></div>
                      <div className={styles.timelineContent}>
                        <div className={styles.timelineAction}>Acknowledged</div>
                        <div className={styles.timelineBy}>by {selectedAlert.acknowledgedBy}</div>
                      </div>
                    </div>
                    {selectedAlert.resolvedBy && (
                      <div className={styles.timelineItem}>
                        <div className={styles.timelineDot}></div>
                        <div className={styles.timelineContent}>
                          <div className={styles.timelineAction}>Resolved</div>
                          <div className={styles.timelineBy}>by {selectedAlert.resolvedBy}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.detailActions}>
                {selectedAlert.status === 'OPEN' && (
                  <button 
                    className={styles.btnPrimary}
                    onClick={() => handleAcknowledge(selectedAlert.id)}
                  >
                    Acknowledge
                  </button>
                )}
                {(selectedAlert.status === 'OPEN' || selectedAlert.status === 'ACKNOWLEDGED') && (
                  <button 
                    className={styles.btnSuccess}
                    onClick={() => handleResolve(selectedAlert.id)}
                  >
                    Resolve
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🔔</div>
              <div className={styles.emptyText}>
                Select an alert to view details
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Alerts;
