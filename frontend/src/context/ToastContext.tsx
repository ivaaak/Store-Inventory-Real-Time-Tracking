import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Icon, IconName } from '../components/ui/Icon';
import styles from '../components/ui/ui.module.css';

type ToastKind = 'success' | 'error' | 'alert' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastContextType {
  notify: (toast: Omit<Toast, 'id'>) => void;
}

const ICONS: Record<ToastKind, IconName> = { success: 'check', error: 'alert', alert: 'bell', info: 'activity' };

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = ++nextId.current;
      setToasts((ts) => [...ts.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.kind === 'alert' ? 8000 : 4500);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className={styles.toasts} role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[`toast-${t.kind}`] ?? ''}`}>
            <Icon name={ICONS[t.kind]} size={18} />
            <div className={styles.toastBody}>
              <div className={styles.toastTitle}>{t.title}</div>
              {t.message && <div className={styles.toastMessage}>{t.message}</div>}
            </div>
            <button className={styles.toastClose} onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.notify;
};
