import type { Point, Quad } from '../types';

export type PixelImage = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};

export type DetectionResult = {
  quad: Quad;
  confidence: number;
  usedFallback: boolean;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function defaultDocumentQuad(): Quad {
  return {
    topLeft: { x: 0.075, y: 0.065 },
    topRight: { x: 0.925, y: 0.065 },
    bottomRight: { x: 0.925, y: 0.935 },
    bottomLeft: { x: 0.075, y: 0.935 },
  };
}

function luminance(r: number, g: number, b: number) {
  return Math.round(r * 0.299 + g * 0.587 + b * 0.114);
}

function percentileFromHistogram(histogram: Uint32Array, percentile: number) {
  let total = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    total += histogram[index];
  }

  const target = total * percentile;
  let seen = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    seen += histogram[index];
    if (seen >= target) {
      return index;
    }
  }
  return 255;
}

function otsuThreshold(histogram: Uint32Array, pixelCount: number) {
  let totalWeighted = 0;
  for (let value = 0; value < 256; value += 1) {
    totalWeighted += value * histogram[value];
  }

  let backgroundWeight = 0;
  let backgroundWeighted = 0;
  let maximumVariance = 0;
  let threshold = 150;

  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (backgroundWeight === 0) continue;

    const foregroundWeight = pixelCount - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundWeighted += value * histogram[value];
    const backgroundMean = backgroundWeighted / backgroundWeight;
    const foregroundMean =
      (totalWeighted - backgroundWeighted) / foregroundWeight;
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) ** 2;

    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = value;
    }
  }

  return threshold;
}

function normalizePoint(point: Point, width: number, height: number): Point {
  return {
    x: clamp(point.x / Math.max(1, width - 1), 0.008, 0.992),
    y: clamp(point.y / Math.max(1, height - 1), 0.008, 0.992),
  };
}

function expandFromCenter(point: Point, center: Point, amount: number): Point {
  return {
    x: center.x + (point.x - center.x) * amount,
    y: center.y + (point.y - center.y) * amount,
  };
}

function histogramPercentile(
  histogram: Uint32Array,
  total: number,
  percentile: number,
) {
  const target = Math.max(1, total * percentile);
  let seen = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    seen += histogram[index];
    if (seen >= target) return index;
  }
  return histogram.length - 1;
}

function robustCorners(
  pixels: Int32Array,
  width: number,
  height: number,
): [Point, Point, Point, Point] {
  const diagonalSize = width + height - 1;
  const sumHistogram = new Uint32Array(diagonalSize);
  const differenceHistogram = new Uint32Array(diagonalSize);

  for (let index = 0; index < pixels.length; index += 1) {
    const pixel = pixels[index];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    sumHistogram[x + y] += 1;
    differenceHistogram[x - y + height - 1] += 1;
  }

  const cornerFraction = clamp(220 / Math.max(1, pixels.length), 0.0025, 0.012);
  const lowSum = histogramPercentile(
    sumHistogram,
    pixels.length,
    cornerFraction,
  );
  const highSum = histogramPercentile(
    sumHistogram,
    pixels.length,
    1 - cornerFraction,
  );
  const lowDifference = histogramPercentile(
    differenceHistogram,
    pixels.length,
    cornerFraction,
  );
  const highDifference = histogramPercentile(
    differenceHistogram,
    pixels.length,
    1 - cornerFraction,
  );
  const accumulators = [
    { x: 0, y: 0, weight: 0 },
    { x: 0, y: 0, weight: 0 },
    { x: 0, y: 0, weight: 0 },
    { x: 0, y: 0, weight: 0 },
  ];

  for (let index = 0; index < pixels.length; index += 1) {
    const pixel = pixels[index];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const sum = x + y;
    const difference = x - y + height - 1;

    const candidates = [
      sum <= lowSum,
      difference >= highDifference,
      sum >= highSum,
      difference <= lowDifference,
    ];
    for (let corner = 0; corner < candidates.length; corner += 1) {
      if (!candidates[corner]) continue;
      accumulators[corner].x += x;
      accumulators[corner].y += y;
      accumulators[corner].weight += 1;
    }
  }

  const fallback = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  return accumulators.map((corner, index) =>
    corner.weight
      ? {
          x: corner.x / corner.weight,
          y: corner.y / corner.weight,
        }
      : fallback[index],
  ) as [Point, Point, Point, Point];
}

function polygonArea(points: Point[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(area) / 2;
}

function edgeContrast(
  gray: Uint8Array,
  width: number,
  height: number,
  points: Point[],
) {
  const center = points.reduce(
    (current, point) => ({
      x: current.x + point.x / points.length,
      y: current.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  );
  const sample = (point: Point) => {
    const x = clamp(Math.round(point.x), 0, width - 1);
    const y = clamp(Math.round(point.y), 0, height - 1);
    return gray[y * width + x];
  };
  let contrast = 0;
  let samples = 0;

  for (let edge = 0; edge < points.length; edge += 1) {
    const start = points[edge];
    const end = points[(edge + 1) % points.length];
    for (let step = 2; step <= 10; step += 1) {
      const ratio = step / 12;
      const point = {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
      const inset = {
        x: point.x + (center.x - point.x) * 0.035,
        y: point.y + (center.y - point.y) * 0.035,
      };
      const outset = {
        x: point.x - (center.x - point.x) * 0.025,
        y: point.y - (center.y - point.y) * 0.025,
      };
      contrast += Math.abs(sample(inset) - sample(outset));
      samples += 1;
    }
  }

  return contrast / Math.max(1, samples);
}

/**
 * Detects the largest connected, paper-like bright region. It is intentionally
 * implemented in TypeScript so the full pipeline remains available in Expo Go.
 * Manual four-corner correction remains available when a low-contrast surface
 * makes the automatic result uncertain.
 */
export function detectDocument(image: PixelImage): DetectionResult {
  const { width, height, data } = image;
  const pixelCount = width * height;
  if (width < 32 || height < 32 || data.length < pixelCount * 4) {
    return {
      quad: defaultDocumentQuad(),
      confidence: 0,
      usedFallback: true,
    };
  }

  const gray = new Uint8Array(pixelCount);
  const histogram = new Uint32Array(256);
  const borderHistogram = new Uint32Array(256);
  const borderSize = Math.max(3, Math.round(Math.min(width, height) * 0.06));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const sourceIndex = pixelIndex * 4;
      const value = luminance(
        data[sourceIndex],
        data[sourceIndex + 1],
        data[sourceIndex + 2],
      );
      gray[pixelIndex] = value;
      histogram[value] += 1;
      if (
        x < borderSize ||
        x >= width - borderSize ||
        y < borderSize ||
        y >= height - borderSize
      ) {
        borderHistogram[value] += 1;
      }
    }
  }

  const borderMedian = percentileFromHistogram(borderHistogram, 0.5);
  const otsu = otsuThreshold(histogram, pixelCount);
  const brightPercentile = percentileFromHistogram(histogram, 0.62);
  const threshold = clamp(
    Math.round(
      Math.max(
        otsu,
        borderMedian + (borderMedian < 170 ? 12 : 4),
        brightPercentile - 10,
      ),
    ),
    72,
    238,
  );

  const mask = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const sourceIndex = index * 4;
    const maxChannel = Math.max(
      data[sourceIndex],
      data[sourceIndex + 1],
      data[sourceIndex + 2],
    );
    const minChannel = Math.min(
      data[sourceIndex],
      data[sourceIndex + 1],
      data[sourceIndex + 2],
    );
    const saturation = maxChannel - minChannel;
    const value = gray[index];
    if (
      value >= threshold &&
      (saturation < 92 || value > 214) &&
      value >= borderMedian - 4
    ) {
      mask[index] = 1;
    }
  }

  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let bestArea = 0;
  let bestBoundsArea = pixelCount;
  let bestScore = 0;
  let bestTouchedSides = 4;
  let bestPixels = new Int32Array();

  for (let start = 0; start < pixelCount; start += 1) {
    if (!mask[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    let area = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let touchesLeft = false;
    let touchesRight = false;
    let touchesTop = false;
    let touchesBottom = false;

    while (head < tail) {
      const current = queue[head];
      head += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      touchesLeft ||= x <= 1;
      touchesRight ||= x >= width - 2;
      touchesTop ||= y <= 1;
      touchesBottom ||= y >= height - 2;

      const left = current - 1;
      const right = current + 1;
      const up = current - width;
      const down = current + width;
      if (x > 0 && mask[left] && !visited[left]) {
        visited[left] = 1;
        queue[tail] = left;
        tail += 1;
      }
      if (x < width - 1 && mask[right] && !visited[right]) {
        visited[right] = 1;
        queue[tail] = right;
        tail += 1;
      }
      if (y > 0 && mask[up] && !visited[up]) {
        visited[up] = 1;
        queue[tail] = up;
        tail += 1;
      }
      if (y < height - 1 && mask[down] && !visited[down]) {
        visited[down] = 1;
        queue[tail] = down;
        tail += 1;
      }
    }

    const boundsArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
    const fill = area / boundsArea;
    const centerX = (minX + maxX) / 2 / Math.max(1, width - 1);
    const centerY = (minY + maxY) / 2 / Math.max(1, height - 1);
    const centrality = clamp(
      1 - Math.hypot(centerX - 0.5, centerY - 0.5) / 0.7,
      0.22,
      1,
    );
    const touchedSides = [
      touchesLeft,
      touchesRight,
      touchesTop,
      touchesBottom,
    ].filter(Boolean).length;
    const borderPenalty = [1, 0.78, 0.5, 0.27, 0.11][touchedSides];
    const componentScore =
      area *
      (0.46 + 0.54 * fill) *
      (0.72 + 0.28 * centrality) *
      borderPenalty;
    if (componentScore > bestScore) {
      bestArea = area;
      bestBoundsArea = boundsArea;
      bestScore = componentScore;
      bestTouchedSides = touchedSides;
      bestPixels = queue.slice(0, tail);
    }
  }

  const areaRatio = bestArea / pixelCount;
  const fillRatio = bestArea / Math.max(1, bestBoundsArea);
  const rawPoints =
    bestPixels.length >= 4
      ? robustCorners(bestPixels, width, height)
      : [
          { x: 0, y: 0 },
          { x: width - 1, y: 0 },
          { x: width - 1, y: height - 1 },
          { x: 0, y: height - 1 },
        ];
  const detectedAreaRatio = polygonArea(rawPoints) / pixelCount;
  const contrast = edgeContrast(gray, width, height, rawPoints);
  const plausible =
    areaRatio >= 0.12 &&
    areaRatio <= 0.94 &&
    fillRatio >= 0.38 &&
    detectedAreaRatio >= 0.1 &&
    detectedAreaRatio <= 0.96 &&
    rawPoints[1].x - rawPoints[0].x > width * 0.24 &&
    rawPoints[2].y - rawPoints[1].y > height * 0.2;

  if (!plausible) {
    return {
      quad: defaultDocumentQuad(),
      confidence: clamp(areaRatio * 0.35, 0.04, 0.28),
      usedFallback: true,
    };
  }

  const center = rawPoints.reduce(
    (current, point) => ({
      x: current.x + point.x / 4,
      y: current.y + point.y / 4,
    }),
    { x: 0, y: 0 },
  );
  const expanded = rawPoints.map((point) =>
    expandFromCenter(
      point,
      center,
      clamp(1.018 + contrast / 1400, 1.018, 1.045),
    ),
  );

  const quad = {
    topLeft: normalizePoint(expanded[0], width, height),
    topRight: normalizePoint(expanded[1], width, height),
    bottomRight: normalizePoint(expanded[2], width, height),
    bottomLeft: normalizePoint(expanded[3], width, height),
  };
  const confidence = clamp(
    0.22 +
      fillRatio * 0.28 +
      Math.min(detectedAreaRatio, 0.72) * 0.28 +
      clamp(contrast / 52, 0, 1) * 0.28 -
      bestTouchedSides * 0.045,
    0,
    0.96,
  );

  return { quad, confidence, usedFallback: false };
}
