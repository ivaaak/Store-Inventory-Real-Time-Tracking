import { classifyAudit, lowStockSeverity } from './reconciliation';

describe('classifyAudit', () => {
  it('flags phantom stock when the shelf is empty but the book is above threshold', () => {
    expect(classifyAudit({ systemCount: 12, visualCount: 0, confidence: 0.9 }, 5)).toEqual({
      type: 'PHANTOM_STOCK',
      severity: 'CRITICAL',
    });
  });

  it('does not flag phantom stock at or below the threshold', () => {
    const outcome = classifyAudit({ systemCount: 5, visualCount: 0, confidence: 0.9 }, 5);
    expect(outcome?.type).not.toBe('PHANTOM_STOCK');
  });

  it('never raises alerts from low-confidence readings', () => {
    // A failed or uncertain vision call must not page staff.
    expect(classifyAudit({ systemCount: 40, visualCount: 0, confidence: 0 })).toBeNull();
    expect(classifyAudit({ systemCount: 40, visualCount: 0, confidence: 0.5 })).toBeNull();
  });

  it('raises a HIGH discrepancy for large, confident mismatches', () => {
    expect(classifyAudit({ systemCount: 20, visualCount: 14, confidence: 0.85 })).toEqual({
      type: 'DISCREPANCY',
      severity: 'HIGH',
    });
  });

  it('raises a MEDIUM discrepancy for small mismatches', () => {
    expect(classifyAudit({ systemCount: 10, visualCount: 9, confidence: 0.75 })).toEqual({
      type: 'DISCREPANCY',
      severity: 'MEDIUM',
    });
  });

  it('treats surplus on the shelf as a discrepancy too', () => {
    expect(classifyAudit({ systemCount: 2, visualCount: 9, confidence: 0.9 })?.type).toBe('DISCREPANCY');
  });

  it('returns null when counts match', () => {
    expect(classifyAudit({ systemCount: 8, visualCount: 8, confidence: 0.99 })).toBeNull();
  });
});

describe('lowStockSeverity', () => {
  it('is CRITICAL when out of stock and HIGH otherwise', () => {
    expect(lowStockSeverity(0)).toBe('CRITICAL');
    expect(lowStockSeverity(2)).toBe('HIGH');
  });
});
