import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cameraRoot = new URL('../node_modules/expo-camera/ios/', import.meta.url);

function patchFile(relativePath, replacements) {
  const sourceUrl = new URL(relativePath, cameraRoot);
  const sourcePath = fileURLToPath(sourceUrl);
  if (!existsSync(sourcePath)) {
    throw new Error(`[postinstall] expo-camera source is missing: ${sourcePath}`);
  }

  let source = readFileSync(sourcePath, 'utf8');
  let changed = false;
  for (const { before, after } of replacements) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) {
      throw new Error(
        `[postinstall] expo-camera ${relativePath} changed; live document patch needs review.`,
      );
    }
    source = source.replace(before, after);
    changed = true;
  }

  if (changed) writeFileSync(sourcePath, source);
  return changed;
}

const moduleChanged = patchFile('CameraViewModule.swift', [
  {
    before:
      'let cameraEvents = ["onCameraReady", "onMountError", "onPictureSaved", "onBarcodeScanned", "onResponsiveOrientationChanged", "onAvailableLensesChanged"]',
    after:
      'let cameraEvents = ["onCameraReady", "onMountError", "onPictureSaved", "onBarcodeScanned", "onResponsiveOrientationChanged", "onAvailableLensesChanged", "onDocumentDetected"]',
  },
]);

const viewChanged = patchFile('Current/CameraView.swift', [
  {
    before: '  let onAvailableLensesChanged = EventDispatcher()\n',
    after:
      '  let onAvailableLensesChanged = EventDispatcher()\n  let onDocumentDetected = EventDispatcher()\n',
  },
]);

const managerChanged = patchFile('Current/CameraSessionManager.swift', [
  {
    before:
      'import UIKit\n@preconcurrency import AVFoundation\nimport ExpoModulesCore\n',
    after:
      'import UIKit\n@preconcurrency import AVFoundation\nimport ExpoModulesCore\nimport ImageIO\nimport Vision\n',
  },
  {
    before:
      '  var onMountError: EventDispatcher { get }\n  var onCameraReady: EventDispatcher { get }\n',
    after:
      '  var onMountError: EventDispatcher { get }\n  var onCameraReady: EventDispatcher { get }\n  var onDocumentDetected: EventDispatcher { get }\n',
  },
  {
    before:
      'class CameraSessionManager: NSObject, DeviceDiscoveryDelegate {\n',
    after:
      'class CameraSessionManager: NSObject, DeviceDiscoveryDelegate, AVCaptureVideoDataOutputSampleBufferDelegate {\n',
  },
  {
    before:
      '  private var videoFileOutput: AVCaptureMovieFileOutput?\n  private var runtimeErrorTask: Task<Void, Never>?\n',
    after:
      '  private var videoFileOutput: AVCaptureMovieFileOutput?\n  private var documentVideoOutput: AVCaptureVideoDataOutput?\n  private var runtimeErrorTask: Task<Void, Never>?\n  private let documentDetectionQueue = DispatchQueue(\n    label: "expo.camera.document-detection",\n    qos: .userInitiated\n  )\n  private var lastDocumentDetectionAt = 0.0\n  private var consecutiveMissingDocuments = 0\n',
  },
  {
    before:
      '    if session.canAddOutput(photoOutput) {\n      session.addOutput(photoOutput)\n      self.photoOutput = photoOutput\n    }\n\n    let preset = delegate.mode == .video\n',
    after:
      '    if session.canAddOutput(photoOutput) {\n      session.addOutput(photoOutput)\n      self.photoOutput = photoOutput\n    }\n\n    let documentVideoOutput = AVCaptureVideoDataOutput()\n    documentVideoOutput.alwaysDiscardsLateVideoFrames = true\n    documentVideoOutput.videoSettings = [\n      kCVPixelBufferPixelFormatTypeKey as String:\n        Int(kCVPixelFormatType_420YpCbCr8BiPlanarFullRange)\n    ]\n    documentVideoOutput.setSampleBufferDelegate(\n      self,\n      queue: documentDetectionQueue\n    )\n    if session.canAddOutput(documentVideoOutput) {\n      session.addOutput(documentVideoOutput)\n      self.documentVideoOutput = documentVideoOutput\n    }\n\n    let preset = delegate.mode == .video\n',
  },
  {
    before: '    enableTorch()\n  }\n}\n',
    after: `    enableTorch()
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard
      output === documentVideoOutput,
      delegate?.active == true,
      let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
    else {
      return
    }

    let now = CFAbsoluteTimeGetCurrent()
    guard now - lastDocumentDetectionAt >= 0.1 else {
      return
    }
    lastDocumentDetectionAt = now

    let request = VNDetectDocumentSegmentationRequest()
    let orientation = documentVisionOrientation()
    let rawWidth = CVPixelBufferGetWidth(pixelBuffer)
    let rawHeight = CVPixelBufferGetHeight(pixelBuffer)
    let swapsDimensions = orientation == .left || orientation == .right
    let orientedWidth = swapsDimensions ? rawHeight : rawWidth
    let orientedHeight = swapsDimensions ? rawWidth : rawHeight
    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: orientation,
      options: [:]
    )

    do {
      try handler.perform([request])
      guard
        let observation = request.results?.max(by: {
          $0.boundingBox.width * $0.boundingBox.height <
            $1.boundingBox.width * $1.boundingBox.height
        })
      else {
        consecutiveMissingDocuments += 1
        if consecutiveMissingDocuments >= 3 {
          emitMissingDocument()
        }
        return
      }

      consecutiveMissingDocuments = 0
      let normalizedPoint: (CGPoint) -> [String: Double] = { point in
        [
          "x": Double(point.x),
          "y": Double(1 - point.y)
        ]
      }
      let quad = [
        "topLeft": normalizedPoint(observation.topLeft),
        "topRight": normalizedPoint(observation.topRight),
        "bottomRight": normalizedPoint(observation.bottomRight),
        "bottomLeft": normalizedPoint(observation.bottomLeft)
      ]
      let area = Double(
        observation.boundingBox.width * observation.boundingBox.height
      )
      let payload: [String: Any] = [
        "quad": quad,
        "confidence": Double(observation.confidence),
        "area": area,
        "imageWidth": orientedWidth,
        "imageHeight": orientedHeight
      ]
      DispatchQueue.main.async { [weak self] in
        self?.delegate?.onDocumentDetected(payload)
      }
    } catch {
      consecutiveMissingDocuments += 1
    }
  }

  private func emitMissingDocument() {
    DispatchQueue.main.async { [weak self] in
      self?.delegate?.onDocumentDetected([
        "confidence": 0,
        "area": 0
      ])
    }
  }

  private func documentVisionOrientation() -> CGImagePropertyOrientation {
    switch UIDevice.current.orientation {
    case .portraitUpsideDown:
      return .left
    case .landscapeLeft:
      return .up
    case .landscapeRight:
      return .down
    default:
      return .right
    }
  }
}
`,
  },
  {
    before: `    let request = VNDetectDocumentSegmentationRequest()
    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: documentVisionOrientation(),
      options: [:]
    )
`,
    after: `    let request = VNDetectDocumentSegmentationRequest()
    let orientation = documentVisionOrientation()
    let rawWidth = CVPixelBufferGetWidth(pixelBuffer)
    let rawHeight = CVPixelBufferGetHeight(pixelBuffer)
    let swapsDimensions = orientation == .left || orientation == .right
    let orientedWidth = swapsDimensions ? rawHeight : rawWidth
    let orientedHeight = swapsDimensions ? rawWidth : rawHeight
    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: orientation,
      options: [:]
    )
`,
  },
  {
    before: `      let payload: [String: Any] = [
        "quad": quad,
        "confidence": Double(observation.confidence),
        "area": area
      ]
`,
    after: `      let payload: [String: Any] = [
        "quad": quad,
        "confidence": Double(observation.confidence),
        "area": area,
        "imageWidth": orientedWidth,
        "imageHeight": orientedHeight
      ]
`,
  },
]);

if (moduleChanged || viewChanged || managerChanged) {
  console.log(
    '[postinstall] patched expo-camera with native live document detection.',
  );
} else {
  console.log(
    '[postinstall] expo-camera native live document detection is already applied.',
  );
}
