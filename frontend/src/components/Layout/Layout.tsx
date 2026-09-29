import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import type { AlertSeverity } from '../../api/types';
import { useTheme } from '../../context/ThemeContext';
import { useLiveEvent, useLiveEvents } from '../../context/LiveEventsContext';
import { useToast } from '../../context/ToastContext';
import { useQuery } from '../../hooks/useQuery';
import { alertTypeLabel, titleCase } from '../../lib/format';
import { Icon, IconName } from '../ui';
import styles from './Layout.module.css';

const NAV: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/alerts', label: 'Alerts', icon: 'bell' },
  { to: '/inventory', label: 'Inventory', icon: 'package' },
  { to: '/vision-ai', label: 'Vision AI', icon: 'eye' },
  { to: '/floor-plan', label: 'Floor Plan', icon: 'map' },
];

const CONNECTION_LABEL = { live: 'Live', connecting: 'Reconnecting…', offline: 'Offline' } as const;

const Layout = ({ children }: { children: ReactNode }) => {
  const { theme, toggleTheme } = useTheme();
  const { status } = useLiveEvents();
  const notify = useToast();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const activeAlerts = useQuery(
    () => api.alerts({ statuses: 'OPEN,ACKNOWLEDGED,IN_PROGRESS', limit: 1 }).then((r) => r.pagination.total),
    [],
    { liveOn: ['alert.created', 'alert.updated'] }
  );

  // Surface urgent alerts wherever the user is.
  useLiveEvent(['alert.created'], (event) => {
    const severity = event.severity as AlertSeverity;
    if (severity !== 'CRITICAL' && severity !== 'HIGH') return;
    notify({
      kind: 'alert',
      title: `${titleCase(severity)}: ${alertTypeLabel(event.alertType as never)}`,
      message: `Shelf ${event.shelfLabel}`,
    });
  });

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className={styles.layout}>
      <header className={styles.topbar}>
        <button className="btn btn-ghost btn-icon" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
          <Icon name="menu" />
        </button>
        <span className={styles.logoText}>Shelf Monitor</span>
        <span className={`${styles.connection} ${styles[status]}`} title={`Live updates: ${CONNECTION_LABEL[status]}`} />
      </header>

      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>
            <Icon name="shelf" size={18} />
          </div>
          <div>
            <div className={styles.logoText}>Shelf Monitor</div>
            <div className={styles.logoSub}>Real-time stock tracking</div>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.to === '/alerts' && !!activeAlerts.data && (
                <span className={styles.navCount} aria-label={`${activeAlerts.data} active alerts`}>
                  {activeAlerts.data}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.connectionRow} role="status">
            <span className={`${styles.connection} ${styles[status]}`} />
            {CONNECTION_LABEL[status]}
          </div>
          <button className={styles.themeToggleBtn} onClick={toggleTheme}>
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={16} />
            <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          </button>
        </div>
      </aside>

      {menuOpen && <div className={styles.scrim} onClick={() => setMenuOpen(false)} />}

      <main className={styles.main}>{children}</main>
    </div>
  );
};

export default Layout;
