import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { LiveEventsProvider } from './context/LiveEventsContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import FloorPlan from './pages/FloorPlan/FloorPlan';
import VisionAI from './pages/VisionAI/VisionAI';
import Alerts from './pages/Alerts/Alerts';
import Inventory from './pages/Inventory/Inventory';
import './App.css';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <LiveEventsProvider>
          <Router>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/floor-plan" element={<FloorPlan />} />
                <Route path="/vision-ai" element={<VisionAI />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Layout>
          </Router>
        </LiveEventsProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
