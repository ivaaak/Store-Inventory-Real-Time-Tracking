import { useState, useRef } from 'react';
import styles from './VisionAI.module.css';

interface AuditResult {
  id: string;
  timestamp: string;
  shelfLabel: string;
  visualCount: number;
  systemCount: number;
  confidence: number;
  status: 'match' | 'discrepancy' | 'phantom';
  imageUrl: string;
  aiResponse: string;
}

const VisionAI = () => {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [shelfLabel, setShelfLabel] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AuditResult[]>([
    {
      id: '1',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      shelfLabel: 'DAIRY-A1',
      visualCount: 0,
      systemCount: 12,
      confidence: 0.95,
      status: 'phantom',
      imageUrl: 'https://via.placeholder.com/400x300?text=Shelf+Image',
      aiResponse: 'Visual inspection shows empty shelf. System indicates 12 units of MILK-001 should be present. This is a phantom stock situation.'
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      shelfLabel: 'DAIRY-A2',
      visualCount: 8,
      systemCount: 8,
      confidence: 0.92,
      status: 'match',
      imageUrl: 'https://via.placeholder.com/400x300?text=Shelf+Image',
      aiResponse: 'Visual count matches system records. 8 units of CHEESE-001 detected on shelf.'
    }
  ]);
  const [selectedAudit, setSelectedAudit] = useState<AuditResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedImage || !shelfLabel) return;

    setIsAnalyzing(true);
    
    // Simulate API call
    setTimeout(() => {
      const newResult: AuditResult = {
        id: `${Date.now()}`,
        timestamp: new Date().toISOString(),
        shelfLabel: shelfLabel,
        visualCount: Math.floor(Math.random() * 15),
        systemCount: Math.floor(Math.random() * 15),
        confidence: 0.85 + Math.random() * 0.15,
        status: Math.random() > 0.5 ? 'match' : 'discrepancy',
        imageUrl: previewUrl,
        aiResponse: 'Analysis complete. Visual inspection shows varying stock levels.'
      };

      setResults([newResult, ...results]);
      setIsAnalyzing(false);
      setSelectedImage(null);
      setPreviewUrl('');
      setShelfLabel('');
    }, 3000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'match':
        return <span className={styles.badgeSuccess}>Match</span>;
      case 'discrepancy':
        return <span className={styles.badgeWarning}>Discrepancy</span>;
      case 'phantom':
        return <span className={styles.badgeDanger}>Phantom Stock</span>;
      default:
        return <span className={styles.badge}>Unknown</span>;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Vision AI Auditing</h1>
        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{results.length}</div>
            <div className={styles.statLabel}>Total Audits</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>
              {results.filter(r => r.status === 'phantom').length}
            </div>
            <div className={styles.statLabel}>Phantom Stock</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>
              {(results.reduce((acc, r) => acc + r.confidence, 0) / results.length * 100).toFixed(0)}%
            </div>
            <div className={styles.statLabel}>Avg Confidence</div>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.mainPanel}>
          <div className={styles.uploadSection}>
            <h2 className={styles.sectionTitle}>New Audit</h2>
            
            <div className={styles.uploadArea}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className={styles.fileInput}
              />
              
              {previewUrl ? (
                <div className={styles.preview}>
                  <img src={previewUrl} alt="Preview" className={styles.previewImage} />
                  <button 
                    className={styles.removeBtn}
                    onClick={() => {
                      setSelectedImage(null);
                      setPreviewUrl('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div 
                  className={styles.dropzone}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className={styles.dropzoneIcon}>📷</div>
                  <div className={styles.dropzoneText}>
                    Click to upload shelf image
                  </div>
                  <div className={styles.dropzoneSubtext}>
                    JPG, PNG or WebP (max 10MB)
                  </div>
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Shelf Label</label>
              <input
                type="text"
                className={styles.input}
                value={shelfLabel}
                onChange={(e) => setShelfLabel(e.target.value)}
                placeholder="e.g., DAIRY-A1"
              />
            </div>

            <button
              className={styles.btnPrimary}
              onClick={handleAnalyze}
              disabled={!selectedImage || !shelfLabel || isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <span className={styles.spinner}></span>
                  Analyzing...
                </>
              ) : (
                '🔍 Analyze Shelf'
              )}
            </button>
          </div>

          <div className={styles.resultsSection}>
            <h2 className={styles.sectionTitle}>Audit History</h2>
            
            <div className={styles.resultsList}>
              {results.map((result) => (
                <div
                  key={result.id}
                  className={`${styles.resultCard} ${selectedAudit?.id === result.id ? styles.resultCardActive : ''}`}
                  onClick={() => setSelectedAudit(result)}
                >
                  <img 
                    src={result.imageUrl} 
                    alt={result.shelfLabel}
                    className={styles.resultImage}
                  />
                  <div className={styles.resultContent}>
                    <div className={styles.resultHeader}>
                      <h3 className={styles.resultTitle}>{result.shelfLabel}</h3>
                      {getStatusBadge(result.status)}
                    </div>
                    <div className={styles.resultMeta}>
                      <div className={styles.resultTime}>
                        {formatTimestamp(result.timestamp)}
                      </div>
                      <div className={styles.resultConfidence}>
                        Confidence: {(result.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className={styles.resultCounts}>
                      <div className={styles.count}>
                        <span className={styles.countLabel}>Visual:</span>
                        <span className={styles.countValue}>{result.visualCount}</span>
                      </div>
                      <div className={styles.count}>
                        <span className={styles.countLabel}>System:</span>
                        <span className={styles.countValue}>{result.systemCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.detailPanel}>
          {selectedAudit ? (
            <>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>Audit Details</h2>
                {getStatusBadge(selectedAudit.status)}
              </div>

              <div className={styles.detailImage}>
                <img 
                  src={selectedAudit.imageUrl} 
                  alt={selectedAudit.shelfLabel}
                />
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Shelf Information</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Shelf Label</div>
                    <div className={styles.detailValue}>{selectedAudit.shelfLabel}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Timestamp</div>
                    <div className={styles.detailValue}>
                      {formatTimestamp(selectedAudit.timestamp)}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Stock Analysis</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Visual Count</div>
                    <div className={styles.detailValue}>{selectedAudit.visualCount}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>System Count</div>
                    <div className={styles.detailValue}>{selectedAudit.systemCount}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Discrepancy</div>
                    <div className={styles.detailValue}>
                      {Math.abs(selectedAudit.visualCount - selectedAudit.systemCount)}
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Confidence</div>
                    <div className={styles.detailValue}>
                      {(selectedAudit.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>AI Response</h3>
                <div className={styles.aiResponse}>
                  {selectedAudit.aiResponse}
                </div>
              </div>

              <div className={styles.detailActions}>
                <button className={styles.btnSecondary}>
                  Create Alert
                </button>
                <button className={styles.btnSecondary}>
                  Download Report
                </button>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>👁️</div>
              <div className={styles.emptyText}>
                Select an audit to view details
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisionAI;
