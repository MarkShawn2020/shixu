import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { VisionDocumentResult } from './DocumentVision.types';

declare class DocumentVisionModule extends NativeModule<{}> {
  detectDocumentAsync(uri: string): Promise<VisionDocumentResult | null>;
}

export default requireOptionalNativeModule<DocumentVisionModule>(
  'DocumentVision',
);
