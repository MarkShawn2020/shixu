import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  VisionDocumentResult,
  VisionProcessedResult,
} from './DocumentVision.types';

declare class DocumentVisionModule extends NativeModule<{}> {
  detectDocumentAsync(uri: string): Promise<VisionDocumentResult | null>;
  processDocumentAsync(
    uri: string,
    quad: VisionDocumentResult['quad'],
    scanFilter: 'color' | 'grayscale' | 'blackwhite',
  ): Promise<VisionProcessedResult>;
}

export default requireOptionalNativeModule<DocumentVisionModule>(
  'DocumentVision',
);
