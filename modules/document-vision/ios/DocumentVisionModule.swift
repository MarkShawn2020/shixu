import ExpoModulesCore
import Foundation
import ImageIO
import Vision

public class DocumentVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DocumentVision")

    AsyncFunction("detectDocumentAsync") { (uri: URL) -> [String: Any]? in
      guard
        let imageSource = CGImageSourceCreateWithURL(uri as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
      else {
        throw DocumentVisionError.unreadableImage
      }

      let handler = VNImageRequestHandler(
        cgImage: image,
        orientation: imageOrientation(from: imageSource),
        options: [:]
      )

      let documentRequest = VNDetectDocumentSegmentationRequest()
      try handler.perform([documentRequest])
      var best = bestDocument(from: documentRequest.results ?? [])

      if best == nil {
        let rectangleRequest = VNDetectRectanglesRequest()
        rectangleRequest.minimumAspectRatio = 0.25
        rectangleRequest.maximumAspectRatio = 1
        rectangleRequest.minimumSize = 0.14
        rectangleRequest.minimumConfidence = 0.45
        rectangleRequest.quadratureTolerance = 35
        rectangleRequest.maximumObservations = 8
        try handler.perform([rectangleRequest])
        best = bestDocument(from: rectangleRequest.results ?? [])
      }

      guard let best else {
        return nil
      }

      return [
        "quad": [
          "topLeft": normalizedPoint(best.observation.topLeft),
          "topRight": normalizedPoint(best.observation.topRight),
          "bottomRight": normalizedPoint(best.observation.bottomRight),
          "bottomLeft": normalizedPoint(best.observation.bottomLeft)
        ],
        "confidence": Double(best.observation.confidence),
        "area": best.area
      ]
    }
  }
}

private enum DocumentVisionError: Error {
  case unreadableImage
}

private struct ScoredRectangle {
  let observation: VNRectangleObservation
  let area: Double
  let score: Double
}

private func imageOrientation(from source: CGImageSource) -> CGImagePropertyOrientation {
  guard
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
    let rawOrientation = properties[kCGImagePropertyOrientation] as? NSNumber
  else {
    return .up
  }

  return CGImagePropertyOrientation(rawValue: rawOrientation.uint32Value) ?? .up
}

private func polygonArea(_ points: [CGPoint]) -> Double {
  var doubledArea = 0.0
  for index in points.indices {
    let next = points[(index + 1) % points.count]
    doubledArea += Double(points[index].x * next.y - next.x * points[index].y)
  }
  return abs(doubledArea) / 2
}

private func bestDocument(
  from observations: [VNRectangleObservation]
) -> ScoredRectangle? {
  observations.compactMap { observation in
    let points = [
      observation.topLeft,
      observation.topRight,
      observation.bottomRight,
      observation.bottomLeft
    ]
    let area = polygonArea(points)
    guard area >= 0.08, area <= 0.94 else {
      return nil
    }

    let centerX = points.reduce(0) { $0 + Double($1.x) } / 4
    let centerY = points.reduce(0) { $0 + Double($1.y) } / 4
    let centerDistance = hypot(centerX - 0.5, centerY - 0.5)
    let centrality = max(0, 1 - centerDistance / 0.72)
    let areaScore = min(area / 0.58, 1)
    let confidence = Double(observation.confidence)
    let score = confidence * 0.52 + areaScore * 0.34 + centrality * 0.14

    return ScoredRectangle(
      observation: observation,
      area: area,
      score: score
    )
  }
  .max { first, second in
    first.score < second.score
  }
}

private func normalizedPoint(_ point: CGPoint) -> [String: Double] {
  [
    "x": min(1, max(0, Double(point.x))),
    "y": min(1, max(0, 1 - Double(point.y)))
  ]
}
