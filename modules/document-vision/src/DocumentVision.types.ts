export type VisionPoint = {
  x: number;
  y: number;
};

export type VisionDocumentResult = {
  quad: {
    topLeft: VisionPoint;
    topRight: VisionPoint;
    bottomRight: VisionPoint;
    bottomLeft: VisionPoint;
  };
  confidence: number;
  area: number;
};

export type VisionProcessedResult = {
  uri: string;
  width: number;
  height: number;
  processingMs: number;
};

export type VisionPdfResult = {
  uri: string;
  numberOfPages: number;
  fileSize: number;
  processingMs: number;
};
