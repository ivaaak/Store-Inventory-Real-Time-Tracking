# Shelf Monitoring Dashboard

A comprehensive React TypeScript dashboard for the Shelf Monitoring & Real-Time Alerting System v2.0.

## Features

### 📊 Dashboard
- Real-time metrics overview
- Active alerts summary
- Recent audit history
- Stock trends visualization

### 🗺️ Floor Plan Editor
- Interactive canvas-based editor
- Add and position shelves, cameras, entrances, and checkouts
- Drag-and-drop functionality
- Wall drawing tools
- Point of Interest (POI) management
- Properties panel for editing shelf details

### 👁️ Vision AI
- Upload shelf images for AI analysis
- Real-time audit processing
- Confidence scoring
- Phantom stock detection
- Visual vs system count comparison
- Detailed audit history
- AI response interpretation

### 🔔 Alerts
- Multi-level alert management (CRITICAL, HIGH, MEDIUM)
- Filter by severity and status
- Acknowledge and resolve workflows
- Detailed alert timeline
- Integration with shelf and inventory data

### 📋 Inventory
- Complete product catalog
- Real-time stock levels with visual indicators
- Low stock and out-of-stock tracking
- Stock percentage visualization
- Detailed product information
- Quick actions (Add Stock, Record Sale, Audit Shelf)

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **CSS Modules** - Scoped styling

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3001`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   └── Layout/
│       ├── Layout.tsx
│       └── Layout.module.css
├── pages/
│   ├── Dashboard/
│   │   ├── Dashboard.tsx
│   │   └── Dashboard.module.css
│   ├── FloorPlan/
│   │   ├── FloorPlan.tsx
│   │   └── FloorPlan.module.css
│   ├── VisionAI/
│   │   ├── VisionAI.tsx
│   │   └── VisionAI.module.css
│   ├── Alerts/
│   │   ├── Alerts.tsx
│   │   └── Alerts.module.css
│   └── Inventory/
│       ├── Inventory.tsx
│       └── Inventory.module.css
├── App.tsx
├── App.css
└── main.tsx
```

## API Integration

The dashboard is designed to connect to the backend API running on `http://localhost:3000`. The Vite configuration includes a proxy for API requests:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
}
```

### API Endpoints Used

- `GET /api/stock/:sku` - Get stock levels
- `POST /api/stock/add` - Add stock
- `POST /api/stock/sale` - Record sale
- `POST /api/vision/audit` - Perform vision audit
- `GET /api/vision/history/:shelfLabel` - Get audit history
- `GET /api/alerts` - Get alerts
- `POST /api/alerts/:alertId/acknowledge` - Acknowledge alert
- `POST /api/alerts/:alertId/resolve` - Resolve alert

## Floor Plan Editor Usage

1. **Select Mode** (✋): Click to select and drag existing points
2. **Add Shelf** (📦): Click to add a new shelf location
3. **Add Camera** (📷): Click to add a camera position
4. **Add Wall** (🧱): Click to draw walls for the floor plan

### Point Types
- 📦 Shelf - Monitored shelf location with SKU
- 📷 Camera - Vision AI camera position
- 🚪 Entrance - Store entrance/exit
- 💳 Checkout - Checkout counter location

## Vision AI Panel Usage

1. Upload a shelf image (JPG, PNG, or WebP)
2. Enter the shelf label (e.g., DAIRY-A1)
3. Click "Analyze Shelf" to process
4. View results in the audit history
5. Click on any audit to see detailed analysis

## Customization

### Colors
Edit CSS custom properties in `src/App.css`:

```css
:root {
  --color-primary: #2563eb;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  /* ... */
}
```

### Spacing
Adjust spacing variables:

```css
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
}
```

## Development Notes

- All styling uses CSS Modules for component-scoped styles
- TypeScript strict mode is enabled
- The app uses React Router for navigation
- No external UI library dependencies (lightweight and customizable)

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## License

MIT
