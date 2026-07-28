import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  VisionDocumentResult,
  VisionPdfResult,
  VisionProcessedResult,
} from './DocumentVision.types';

declare class DocumentVisionModule extends NativeModule<{}> {
  detectDocumentAsync(uri: string): Promise<VisionDocumentResult | null>;
  processDocumentAsync(
    uri: string,
    quad: VisionDocumentResult['quad'],
    scanFilter: 'color' | 'grayscale' | 'blackwhite',
  ): Promise<VisionProcessedResult>;
  createPdfAsync(
    sourceUris: string[],
    destinationUri: string,
    watermarkUri: string | null,
  ): Promise<VisionPdfResult>;
}

export default requireOptionalNativeModule<DocumentVisionModule>(
  'DocumentVision',
);
