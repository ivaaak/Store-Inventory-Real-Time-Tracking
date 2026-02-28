import { useState, useRef, useEffect } from 'react';
import styles from './FloorPlan.module.css';

interface Point {
  id: string;
  x: number;
  y: number;
  label: string;
  type: 'shelf' | 'camera' | 'entrance' | 'checkout';
  sku?: string;
  cameraUrl?: string;
}

interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const FloorPlan = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<Point[]>([
    { id: '1', x: 150, y: 200, label: 'DAIRY-A1', type: 'shelf', sku: 'MILK-001' },
    { id: '2', x: 350, y: 200, label: 'DAIRY-A2', type: 'shelf', sku: 'CHEESE-001' },
    { id: '3', x: 150, y: 400, label: 'CAM-01', type: 'camera', cameraUrl: 'rtsp://cam1' },
    { id: '4', x: 500, y: 100, label: 'Entrance', type: 'entrance' },
  ]);
  const [walls, setWalls] = useState<Wall[]>([
    { id: 'w1', x1: 50, y1: 50, x2: 550, y2: 50 },
    { id: 'w2', x1: 550, y1: 50, x2: 550, y2: 550 },
    { id: 'w3', x1: 550, y1: 550, x2: 50, y2: 550 },
    { id: 'w4', x1: 50, y1: 550, x2: 50, y2: 50 },
  ]);
  
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [mode, setMode] = useState<'select' | 'addShelf' | 'addCamera' | 'addWall'>('select');
  const [isDragging, setIsDragging] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newPointData, setNewPointData] = useState({ label: '', sku: '', cameraUrl: '' });
  const [tempWallStart, setTempWallStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    drawCanvas();
  }, [points, walls, selectedPoint, tempWallStart]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }

    // Draw walls
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 4;
    walls.forEach(wall => {
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
      ctx.stroke();
    });

    // Draw temporary wall
    if (tempWallStart) {
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(tempWallStart.x, tempWallStart.y);
      ctx.lineTo(tempWallStart.x + 100, tempWallStart.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw points
    points.forEach(point => {
      const isSelected = selectedPoint === point.id;
      
      // Point background
      ctx.fillStyle = getPointColor(point.type);
      ctx.beginPath();
      ctx.arc(point.x, point.y, isSelected ? 16 : 12, 0, 2 * Math.PI);
      ctx.fill();

      // Point border
      if (isSelected) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Icon
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(getPointIcon(point.type), point.x, point.y);

      // Label
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(point.label, point.x, point.y + 20);
    });
  };

  const getPointColor = (type: string): string => {
    switch (type) {
      case 'shelf': return '#10b981';
      case 'camera': return '#3b82f6';
      case 'entrance': return '#f59e0b';
      case 'checkout': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const getPointIcon = (type: string): string => {
    switch (type) {
      case 'shelf': return '📦';
      case 'camera': return '📷';
      case 'entrance': return '🚪';
      case 'checkout': return '💳';
      default: return '📍';
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'select') {
      // Check if clicking on existing point
      const clickedPoint = points.find(p => {
        const distance = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
        return distance < 20;
      });
      setSelectedPoint(clickedPoint ? clickedPoint.id : null);
    } else if (mode === 'addShelf' || mode === 'addCamera') {
      setShowAddDialog(true);
    } else if (mode === 'addWall') {
      if (!tempWallStart) {
        setTempWallStart({ x, y });
      } else {
        const newWall: Wall = {
          id: `w${Date.now()}`,
          x1: tempWallStart.x,
          y1: tempWallStart.y,
          x2: x,
          y2: y,
        };
        setWalls([...walls, newWall]);
        setTempWallStart(null);
        setMode('select');
      }
    }
  };

  const handleAddPoint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const newPoint: Point = {
      id: `${Date.now()}`,
      x: 300,
      y: 300,
      label: newPointData.label,
      type: mode === 'addShelf' ? 'shelf' : 'camera',
      sku: newPointData.sku || undefined,
      cameraUrl: newPointData.cameraUrl || undefined,
    };

    setPoints([...points, newPoint]);
    setNewPointData({ label: '', sku: '', cameraUrl: '' });
    setShowAddDialog(false);
    setMode('select');
  };

  const handleDeletePoint = () => {
    if (selectedPoint) {
      setPoints(points.filter(p => p.id !== selectedPoint));
      setSelectedPoint(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'select') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clickedPoint = points.find(p => {
      const distance = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
      return distance < 20;
    });

    if (clickedPoint) {
      setSelectedPoint(clickedPoint.id);
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !selectedPoint) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPoints(points.map(p => 
      p.id === selectedPoint ? { ...p, x, y } : p
    ));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const selectedPointData = points.find(p => p.id === selectedPoint);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Floor Plan Editor</h1>
        <div className={styles.actions}>
          <button 
            className={`${styles.btn} ${mode === 'select' ? styles.btnActive : ''}`}
            onClick={() => setMode('select')}
          >
            ✋ Select
          </button>
          <button 
            className={`${styles.btn} ${mode === 'addShelf' ? styles.btnActive : ''}`}
            onClick={() => setMode('addShelf')}
          >
            📦 Add Shelf
          </button>
          <button 
            className={`${styles.btn} ${mode === 'addCamera' ? styles.btnActive : ''}`}
            onClick={() => setMode('addCamera')}
          >
            📷 Add Camera
          </button>
          <button 
            className={`${styles.btn} ${mode === 'addWall' ? styles.btnActive : ''}`}
            onClick={() => setMode('addWall')}
          >
            🧱 Add Wall
          </button>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.canvasContainer}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className={styles.canvas}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        <div className={styles.sidebar}>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Properties</h3>
            {selectedPointData ? (
              <div className={styles.properties}>
                <div className={styles.property}>
                  <label className={styles.label}>Type</label>
                  <div className={styles.value}>{selectedPointData.type}</div>
                </div>
                <div className={styles.property}>
                  <label className={styles.label}>Label</label>
                  <input 
                    type="text" 
                    className={styles.input}
                    value={selectedPointData.label}
                    onChange={(e) => setPoints(points.map(p => 
                      p.id === selectedPoint ? { ...p, label: e.target.value } : p
                    ))}
                  />
                </div>
                {selectedPointData.type === 'shelf' && (
                  <div className={styles.property}>
                    <label className={styles.label}>SKU</label>
                    <input 
                      type="text" 
                      className={styles.input}
                      value={selectedPointData.sku || ''}
                      onChange={(e) => setPoints(points.map(p => 
                        p.id === selectedPoint ? { ...p, sku: e.target.value } : p
                      ))}
                    />
                  </div>
                )}
                {selectedPointData.type === 'camera' && (
                  <div className={styles.property}>
                    <label className={styles.label}>Camera URL</label>
                    <input 
                      type="text" 
                      className={styles.input}
                      value={selectedPointData.cameraUrl || ''}
                      onChange={(e) => setPoints(points.map(p => 
                        p.id === selectedPoint ? { ...p, cameraUrl: e.target.value } : p
                      ))}
                    />
                  </div>
                )}
                <button 
                  className={styles.btnDanger}
                  onClick={handleDeletePoint}
                >
                  Delete Point
                </button>
              </div>
            ) : (
              <div className={styles.emptyState}>
                Select a point to view properties
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Points of Interest</h3>
            <div className={styles.pointsList}>
              {points.map(point => (
                <div 
                  key={point.id}
                  className={`${styles.pointItem} ${selectedPoint === point.id ? styles.pointItemActive : ''}`}
                  onClick={() => setSelectedPoint(point.id)}
                >
                  <span className={styles.pointIcon}>{getPointIcon(point.type)}</span>
                  <div className={styles.pointInfo}>
                    <div className={styles.pointLabel}>{point.label}</div>
                    <div className={styles.pointType}>{point.type}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showAddDialog && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>
              Add {mode === 'addShelf' ? 'Shelf' : 'Camera'}
            </h2>
            <div className={styles.formGroup}>
              <label className={styles.label}>Label</label>
              <input
                type="text"
                className={styles.input}
                value={newPointData.label}
                onChange={(e) => setNewPointData({ ...newPointData, label: e.target.value })}
                placeholder="e.g., DAIRY-A1"
              />
            </div>
            {mode === 'addShelf' && (
              <div className={styles.formGroup}>
                <label className={styles.label}>SKU</label>
                <input
                  type="text"
                  className={styles.input}
                  value={newPointData.sku}
                  onChange={(e) => setNewPointData({ ...newPointData, sku: e.target.value })}
                  placeholder="e.g., MILK-001"
                />
              </div>
            )}
            {mode === 'addCamera' && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Camera URL</label>
                <input
                  type="text"
                  className={styles.input}
                  value={newPointData.cameraUrl}
                  onChange={(e) => setNewPointData({ ...newPointData, cameraUrl: e.target.value })}
                  placeholder="rtsp://camera-url"
                />
              </div>
            )}
            <div className={styles.modalActions}>
              <button 
                className={styles.btnSecondary}
                onClick={() => {
                  setShowAddDialog(false);
                  setNewPointData({ label: '', sku: '', cameraUrl: '' });
                  setMode('select');
                }}
              >
                Cancel
              </button>
              <button 
                className={styles.btnPrimary}
                onClick={handleAddPoint}
                disabled={!newPointData.label}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloorPlan;
