export type ScanFilter = 'color' | 'grayscale' | 'blackwhite';

export type Point = {
  x: number;
  y: number;
};

export type Quad = {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
};

export type PageStatus = 'captured' | 'processing' | 'ready' | 'error';

export type ScanPage = {
  id: string;
  originalUri: string;
  originalWidth: number;
  originalHeight: number;
  processedUri?: string;
  processedWidth?: number;
  processedHeight?: number;
  corners?: Quad;
  detectionConfidence?: number;
  filter: ScanFilter;
  status: PageStatus;
  errorMessage?: string;
};

export type ProcessingProgress = {
  current: number;
  total: number;
  label: string;
};
