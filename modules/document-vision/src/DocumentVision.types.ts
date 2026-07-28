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
