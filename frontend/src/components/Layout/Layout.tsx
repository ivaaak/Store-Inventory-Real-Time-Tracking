import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Layout.module.css';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>📦</div>
          <h1 className={styles.logoText}>Shelf Monitor</h1>
        </div>
        
        <nav className={styles.nav}>
          <NavLink 
            to="/dashboard" 
            className={({ isActive }) => 
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <span className={styles.navIcon}>📊</span>
            <span>Dashboard</span>
          </NavLink>
          
          <NavLink 
            to="/floor-plan" 
            className={({ isActive }) => 
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <span className={styles.navIcon}>🗺️</span>
            <span>Floor Plan</span>
          </NavLink>
          
          <NavLink 
            to="/vision-ai" 
            className={({ isActive }) => 
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <span className={styles.navIcon}>👁️</span>
            <span>Vision AI</span>
          </NavLink>
          
          <NavLink 
            to="/alerts" 
            className={({ isActive }) => 
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <span className={styles.navIcon}>🔔</span>
            <span>Alerts</span>
          </NavLink>
          
          <NavLink 
            to="/inventory" 
            className={({ isActive }) => 
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            <span className={styles.navIcon}>📋</span>
            <span>Inventory</span>
          </NavLink>
        </nav>
      </aside>
      
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
};

export default Layout;
