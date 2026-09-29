// src/types.ts

export interface VisualItemAnalysis {
    name: string;
    count: number;
    status: 'FULL' | 'LOW' | 'EMPTY' | 'MISPLACED';
    confidence: number;
}

export interface AIAnalysisResult {
    timestamp: Date;
    detectedItems: VisualItemAnalysis[];
    rawOutput?: string;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /** Raw request bytes, captured for webhook signature verification. */
            rawBody?: Buffer;
        }
    }
}
