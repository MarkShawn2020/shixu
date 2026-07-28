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
    x: clamp(point.x / Math.max(1, width - 1), 0.025, 0.975),
    y: clamp(point.y / Math.max(1, height - 1), 0.025, 0.975),
  };
}

function expandFromCenter(point: Point, center: Point, amount: number): Point {
  return {
    x: center.x + (point.x - center.x) * amount,
    y: center.y + (point.y - center.y) * amount,
  };
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
  let bestTopLeft = { x: 0, y: 0 };
  let bestTopRight = { x: width - 1, y: 0 };
  let bestBottomRight = { x: width - 1, y: height - 1 };
  let bestBottomLeft = { x: 0, y: height - 1 };
  let bestBoundsArea = pixelCount;

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
    let minSum = Number.POSITIVE_INFINITY;
    let maxSum = Number.NEGATIVE_INFINITY;
    let minDifference = Number.POSITIVE_INFINITY;
    let maxDifference = Number.NEGATIVE_INFINITY;
    let topLeft = bestTopLeft;
    let topRight = bestTopRight;
    let bottomRight = bestBottomRight;
    let bottomLeft = bestBottomLeft;

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

      const sum = x + y;
      const difference = x - y;
      if (sum < minSum) {
        minSum = sum;
        topLeft = { x, y };
      }
      if (sum > maxSum) {
        maxSum = sum;
        bottomRight = { x, y };
      }
      if (difference > maxDifference) {
        maxDifference = difference;
        topRight = { x, y };
      }
      if (difference < minDifference) {
        minDifference = difference;
        bottomLeft = { x, y };
      }

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
    const componentScore = area * (0.55 + 0.45 * (area / boundsArea));
    const bestScore =
      bestArea * (0.55 + 0.45 * (bestArea / Math.max(1, bestBoundsArea)));
    if (componentScore > bestScore) {
      bestArea = area;
      bestBoundsArea = boundsArea;
      bestTopLeft = topLeft;
      bestTopRight = topRight;
      bestBottomRight = bottomRight;
      bestBottomLeft = bottomLeft;
    }
  }

  const areaRatio = bestArea / pixelCount;
  const fillRatio = bestArea / Math.max(1, bestBoundsArea);
  const plausible =
    areaRatio >= 0.12 &&
    areaRatio <= 0.94 &&
    fillRatio >= 0.38 &&
    bestTopRight.x - bestTopLeft.x > width * 0.28 &&
    bestBottomRight.y - bestTopRight.y > height * 0.24;

  if (!plausible) {
    return {
      quad: defaultDocumentQuad(),
      confidence: clamp(areaRatio * 0.35, 0.04, 0.28),
      usedFallback: true,
    };
  }

  const rawPoints = [
    bestTopLeft,
    bestTopRight,
    bestBottomRight,
    bestBottomLeft,
  ];
  const center = rawPoints.reduce(
    (current, point) => ({
      x: current.x + point.x / 4,
      y: current.y + point.y / 4,
    }),
    { x: 0, y: 0 },
  );
  const expanded = rawPoints.map((point) =>
    expandFromCenter(point, center, 1.025),
  );

  const quad = {
    topLeft: normalizePoint(expanded[0], width, height),
    topRight: normalizePoint(expanded[1], width, height),
    bottomRight: normalizePoint(expanded[2], width, height),
    bottomLeft: normalizePoint(expanded[3], width, height),
  };
  const confidence = clamp(
    0.32 + fillRatio * 0.46 + Math.min(areaRatio, 0.7) * 0.32,
    0,
    0.96,
  );

  return { quad, confidence, usedFallback: false };
}
