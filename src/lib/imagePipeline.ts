import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Buffer } from 'buffer';
import * as base64 from 'base64-js';
import jpeg from 'jpeg-js';

import DocumentVisionModule from '../../modules/document-vision/src/DocumentVisionModule';
import type { Point, Quad, ScanFilter, ScanPage } from '../types';
import {
  defaultDocumentQuad,
  detectDocument,
  type DetectionResult,
  type PixelImage,
} from './documentDetection';

const ANALYSIS_WIDTH = 420;
const WORKING_WIDTH = 1600;
const OUTPUT_SHORT_EDGE = 1120;
const OUTPUT_LONG_EDGE_LIMIT = 1800;
const WATERMARK_ASSET = require('../../assets/brand/shougongchuan-watermark.jpg');

type DecodedImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

type PreparedImage = {
  uri: string;
  width: number;
  height: number;
  base64: string;
  decoded: DecodedImage;
};

type RenderResult = {
  uri: string;
  width: number;
  height: number;
};

type WatermarkPixels = {
  width: number;
  height: number;
  data: Uint8Array;
};

let watermarkCache: Promise<WatermarkPixels> | undefined;

export const hasNativeDocumentVision = Boolean(DocumentVisionModule);

if (!(globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const distance = (first: Point, second: Point) =>
  Math.hypot(first.x - second.x, first.y - second.y);

const pixelPoint = (point: Point, width: number, height: number): Point => ({
  x: clamp(point.x, 0, 1) * Math.max(1, width - 1),
  y: clamp(point.y, 0, 1) * Math.max(1, height - 1),
});

const yieldToUi = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

function deleteTemporaryFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must never interrupt scanning.
  }
}

function normalizedQuadArea(quad: Quad) {
  const points = [
    quad.topLeft,
    quad.topRight,
    quad.bottomRight,
    quad.bottomLeft,
  ];
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(area) / 2;
}

function isValidVisionQuad(quad: Quad) {
  const points = [
    quad.topLeft,
    quad.topRight,
    quad.bottomRight,
    quad.bottomLeft,
  ];
  if (
    points.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1,
    )
  ) {
    return false;
  }

  const crossProducts = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const following = points[(index + 2) % points.length];
    return (
      (next.x - point.x) * (following.y - next.y) -
      (next.y - point.y) * (following.x - next.x)
    );
  });
  const consistentlyClockwise = crossProducts.every((value) => value > 0);
  const consistentlyCounterClockwise = crossProducts.every(
    (value) => value < 0,
  );
  const shortestEdge = Math.min(
    ...points.map((point, index) =>
      distance(point, points[(index + 1) % points.length]),
    ),
  );
  const area = normalizedQuadArea(quad);
  return (
    (consistentlyClockwise || consistentlyCounterClockwise) &&
    shortestEdge >= 0.12 &&
    area >= 0.08 &&
    area <= 0.94
  );
}

async function detectDocumentWithVision(
  uri: string,
): Promise<DetectionResult | undefined> {
  if (!DocumentVisionModule) return undefined;

  try {
    const result = await DocumentVisionModule.detectDocumentAsync(uri);
    if (
      !result ||
      !Number.isFinite(result.confidence) ||
      result.confidence < 0.45 ||
      !isValidVisionQuad(result.quad)
    ) {
      return undefined;
    }
    return {
      quad: result.quad,
      confidence: clamp(result.confidence, 0, 1),
      usedFallback: false,
    };
  } catch {
    return undefined;
  }
}

async function prepareJpeg(
  uri: string,
  targetWidth: number,
  quality: number,
): Promise<PreparedImage> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: targetWidth, height: null });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: true,
    compress: quality,
    format: SaveFormat.JPEG,
  });

  if (!result.base64) {
    throw new Error('图像预处理没有返回像素数据');
  }

  const bytes = base64.toByteArray(result.base64);
  const decoded = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
  }) as DecodedImage;

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    base64: result.base64,
    decoded,
  };
}

function solveLinearSystem(matrix: number[][], values: number[]) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row][column]) >
        Math.abs(augmented[pivot][column])
      ) {
        pivot = row;
      }
    }

    if (Math.abs(augmented[pivot][column]) < 1e-10) {
      throw new Error('页面四角过于接近，无法完成几何校正');
    }

    [augmented[column], augmented[pivot]] = [
      augmented[pivot],
      augmented[column],
    ];
    const divisor = augmented[column][column];
    for (let item = column; item <= size; item += 1) {
      augmented[column][item] /= divisor;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= size; item += 1) {
        augmented[row][item] -= factor * augmented[column][item];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function homographyForQuad(quad: Point[]) {
  const destinations = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const matrix: number[][] = [];
  const values: number[] = [];

  for (let index = 0; index < 4; index += 1) {
    const destination = destinations[index];
    const source = quad[index];
    matrix.push([
      destination.x,
      destination.y,
      1,
      0,
      0,
      0,
      -destination.x * source.x,
      -destination.y * source.x,
    ]);
    values.push(source.x);
    matrix.push([
      0,
      0,
      0,
      destination.x,
      destination.y,
      1,
      -destination.x * source.y,
      -destination.y * source.y,
    ]);
    values.push(source.y);
  }

  return solveLinearSystem(matrix, values);
}

function calculateOutputSize(quad: Point[]) {
  const measuredWidth =
    (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2;
  const measuredHeight =
    (distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2;
  const safeWidth = Math.max(1, measuredWidth);
  const safeHeight = Math.max(1, measuredHeight);
  const portrait = safeHeight >= safeWidth;
  const ratio = safeWidth / safeHeight;

  let width: number;
  let height: number;
  if (portrait) {
    width = OUTPUT_SHORT_EDGE;
    height = Math.round(width / ratio);
  } else {
    height = OUTPUT_SHORT_EDGE;
    width = Math.round(height * ratio);
  }

  if (Math.max(width, height) > OUTPUT_LONG_EDGE_LIMIT) {
    const scale = OUTPUT_LONG_EDGE_LIMIT / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  return {
    width: Math.max(640, width),
    height: Math.max(640, height),
  };
}

function sampleBilinear(
  source: DecodedImage,
  sourceX: number,
  sourceY: number,
  target: Uint8Array,
  targetIndex: number,
) {
  const x = clamp(sourceX, 0, source.width - 1);
  const y = clamp(sourceY, 0, source.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(source.width - 1, x0 + 1);
  const y1 = Math.min(source.height - 1, y0 + 1);
  const xWeight = x - x0;
  const yWeight = y - y0;

  const first = (y0 * source.width + x0) * 4;
  const second = (y0 * source.width + x1) * 4;
  const third = (y1 * source.width + x0) * 4;
  const fourth = (y1 * source.width + x1) * 4;

  for (let channel = 0; channel < 3; channel += 1) {
    const top =
      source.data[first + channel] * (1 - xWeight) +
      source.data[second + channel] * xWeight;
    const bottom =
      source.data[third + channel] * (1 - xWeight) +
      source.data[fourth + channel] * xWeight;
    target[targetIndex + channel] = Math.round(
      top * (1 - yWeight) + bottom * yWeight,
    );
  }
  target[targetIndex + 3] = 255;
}

async function warpPerspective(
  source: DecodedImage,
  quad: Point[],
  width: number,
  height: number,
) {
  const homography = homographyForQuad(quad);
  const output = new Uint8Array(width * height * 4);
  const denominatorWidth = Math.max(1, width - 1);
  const denominatorHeight = Math.max(1, height - 1);

  for (let y = 0; y < height; y += 1) {
    const normalizedY = y / denominatorHeight;
    for (let x = 0; x < width; x += 1) {
      const normalizedX = x / denominatorWidth;
      const denominator =
        homography[6] * normalizedX +
        homography[7] * normalizedY +
        1;
      const sourceX =
        (homography[0] * normalizedX +
          homography[1] * normalizedY +
          homography[2]) /
        denominator;
      const sourceY =
        (homography[3] * normalizedX +
          homography[4] * normalizedY +
          homography[5]) /
        denominator;
      sampleBilinear(
        source,
        sourceX,
        sourceY,
        output,
        (y * width + x) * 4,
      );
    }
    if (y > 0 && y % 40 === 0) await yieldToUi();
  }

  return output;
}

function histogramPercentile(
  histogram: Uint32Array,
  total: number,
  percentile: number,
) {
  const target = total * percentile;
  let seen = 0;
  for (let index = 0; index < 256; index += 1) {
    seen += histogram[index];
    if (seen >= target) return index;
  }
  return 255;
}

function otsuFromHistogram(histogram: Uint32Array, total: number) {
  let weightedTotal = 0;
  for (let index = 0; index < 256; index += 1) {
    weightedTotal += index * histogram[index];
  }

  let bestThreshold = 150;
  let bestVariance = 0;
  let backgroundWeight = 0;
  let backgroundWeighted = 0;

  for (let index = 0; index < 256; index += 1) {
    backgroundWeight += histogram[index];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundWeighted += index * histogram[index];
    const backgroundMean = backgroundWeighted / backgroundWeight;
    const foregroundMean =
      (weightedTotal - backgroundWeighted) / foregroundWeight;
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = index;
    }
  }
  return bestThreshold;
}

async function enhanceDocument(
  data: Uint8Array,
  width: number,
  height: number,
  filter: ScanFilter,
) {
  const histogram = new Uint32Array(256);
  const pixels = width * height;
  const tileSize = Math.max(72, Math.round(Math.min(width, height) / 11));
  const tileColumns = Math.max(1, Math.ceil(width / tileSize));
  const tileRows = Math.max(1, Math.ceil(height / tileSize));
  const tileHistograms = Array.from(
    { length: tileColumns * tileRows },
    () => new Uint32Array(256),
  );
  const tileSamples = new Uint32Array(tileColumns * tileRows);
  let redMean = 0;
  let greenMean = 0;
  let blueMean = 0;
  let samples = 0;

  for (let index = 0; index < pixels; index += 5) {
    const source = index * 4;
    const red = data[source];
    const green = data[source + 1];
    const blue = data[source + 2];
    const light = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
    histogram[light] += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const tileIndex =
      Math.min(tileRows - 1, Math.floor(y / tileSize)) * tileColumns +
      Math.min(tileColumns - 1, Math.floor(x / tileSize));
    tileHistograms[tileIndex][light] += 1;
    tileSamples[tileIndex] += 1;
    redMean += red;
    greenMean += green;
    blueMean += blue;
    samples += 1;
    if (index > 0 && index % 240000 === 0) await yieldToUi();
  }

  const low = histogramPercentile(histogram, samples, 0.018);
  const high = Math.max(
    low + 48,
    histogramPercentile(histogram, samples, 0.985),
  );
  const tileBackgrounds = new Float32Array(tileColumns * tileRows);
  for (let index = 0; index < tileBackgrounds.length; index += 1) {
    tileBackgrounds[index] = histogramPercentile(
      tileHistograms[index],
      tileSamples[index],
      0.88,
    );
  }
  const localBackgroundAt = (x: number, y: number) => {
    const gridX = x / tileSize - 0.5;
    const gridY = y / tileSize - 0.5;
    const left = clamp(Math.floor(gridX), 0, tileColumns - 1);
    const right = clamp(left + 1, 0, tileColumns - 1);
    const top = clamp(Math.floor(gridY), 0, tileRows - 1);
    const bottom = clamp(top + 1, 0, tileRows - 1);
    const xWeight = clamp(gridX - Math.floor(gridX), 0, 1);
    const yWeight = clamp(gridY - Math.floor(gridY), 0, 1);
    const topBackground =
      tileBackgrounds[top * tileColumns + left] * (1 - xWeight) +
      tileBackgrounds[top * tileColumns + right] * xWeight;
    const bottomBackground =
      tileBackgrounds[bottom * tileColumns + left] * (1 - xWeight) +
      tileBackgrounds[bottom * tileColumns + right] * xWeight;
    return (
      topBackground * (1 - yWeight) + bottomBackground * yWeight
    );
  };
  redMean /= Math.max(1, samples);
  greenMean /= Math.max(1, samples);
  blueMean /= Math.max(1, samples);
  const neutralMean = (redMean + greenMean + blueMean) / 3;
  const redBalance = clamp((neutralMean / Math.max(1, redMean)) ** 0.24, 0.9, 1.1);
  const greenBalance = clamp(
    (neutralMean / Math.max(1, greenMean)) ** 0.24,
    0.9,
    1.1,
  );
  const blueBalance = clamp(
    (neutralMean / Math.max(1, blueMean)) ** 0.24,
    0.9,
    1.1,
  );

  const transformedHistogram = new Uint32Array(256);
  const normalizedLights = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    const source = index * 4;
    const light =
      data[source] * 0.299 +
      data[source + 1] * 0.587 +
      data[source + 2] * 0.114;
    const normalized = clamp((light - low) / (high - low), 0, 1);
    const globalLifted = 255 * normalized ** 0.84;
    const background = localBackgroundAt(
      index % width,
      Math.floor(index / width),
    );
    const localLifted =
      244 * (light / Math.max(36, background)) ** 0.9;
    const lifted = Math.round(
      clamp(globalLifted * 0.46 + localLifted * 0.54, 0, 255),
    );
    normalizedLights[index] = lifted;
    if (index % 5 === 0) transformedHistogram[lifted] += 1;
    if (index > 0 && index % 180000 === 0) await yieldToUi();
  }
  const blackWhiteThreshold = otsuFromHistogram(
    transformedHistogram,
    samples,
  );

  for (let index = 0; index < pixels; index += 1) {
    const source = index * 4;
    const originalLight =
      data[source] * 0.299 +
      data[source + 1] * 0.587 +
      data[source + 2] * 0.114;
    const lifted = normalizedLights[index];

    if (filter === 'blackwhite') {
      const threshold = clamp(blackWhiteThreshold + 7, 112, 202);
      const value = lifted >= threshold ? 255 : 20;
      data[source] = value;
      data[source + 1] = value;
      data[source + 2] = value;
      continue;
    }

    if (filter === 'grayscale') {
      data[source] = lifted;
      data[source + 1] = lifted;
      data[source + 2] = lifted;
      continue;
    }

    const gain = lifted / Math.max(12, originalLight);
    data[source] = clamp(
      Math.round(data[source] * gain * redBalance),
      0,
      255,
    );
    data[source + 1] = clamp(
      Math.round(data[source + 1] * gain * greenBalance),
      0,
      255,
    );
    data[source + 2] = clamp(
      Math.round(data[source + 2] * gain * blueBalance),
      0,
      255,
    );
    if (index > 0 && index % 180000 === 0) await yieldToUi();
  }
}

async function writeJpeg(
  image: DecodedImage,
  prefix: string,
  quality = 90,
) {
  const encoded = jpeg.encode(
    {
      width: image.width,
      height: image.height,
      data: image.data,
    },
    quality,
  );
  const file = new File(
    Paths.cache,
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
  );
  file.create({ overwrite: true, intermediates: true });
  file.write(new Uint8Array(encoded.data));
  return file.uri;
}

async function loadWatermark(): Promise<WatermarkPixels> {
  if (!watermarkCache) {
    watermarkCache = (async () => {
      const asset = Asset.fromModule(WATERMARK_ASSET);
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      const bytes = await new File(uri).bytes();
      const decoded = jpeg.decode(bytes, {
        useTArray: true,
        formatAsRGBA: true,
      }) as DecodedImage;
      return decoded;
    })();
  }
  return watermarkCache;
}

function applyWatermarkPixels(
  image: DecodedImage,
  watermark: WatermarkPixels,
) {
  const targetWidth = Math.round(image.width * 0.27);
  const targetHeight = Math.round(
    targetWidth * (watermark.height / watermark.width),
  );
  const margin = Math.round(Math.min(image.width, image.height) * 0.036);
  const startX = Math.max(0, image.width - targetWidth - margin);
  const startY = Math.max(0, image.height - targetHeight - margin);

  for (let y = 0; y < targetHeight; y += 1) {
    const watermarkY = Math.min(
      watermark.height - 1,
      Math.round((y / Math.max(1, targetHeight - 1)) * (watermark.height - 1)),
    );
    for (let x = 0; x < targetWidth; x += 1) {
      const watermarkX = Math.min(
        watermark.width - 1,
        Math.round((x / Math.max(1, targetWidth - 1)) * (watermark.width - 1)),
      );
      const watermarkIndex =
        (watermarkY * watermark.width + watermarkX) * 4;
      const red = watermark.data[watermarkIndex];
      const green = watermark.data[watermarkIndex + 1];
      const blue = watermark.data[watermarkIndex + 2];
      const distanceFromWhite = Math.max(
        255 - red,
        255 - green,
        255 - blue,
      );
      const alpha = clamp((distanceFromWhite - 8) / 90, 0, 1) * 0.48;
      if (alpha <= 0) continue;

      const targetIndex = ((startY + y) * image.width + startX + x) * 4;
      image.data[targetIndex] = Math.round(
        image.data[targetIndex] * (1 - alpha) + red * alpha,
      );
      image.data[targetIndex + 1] = Math.round(
        image.data[targetIndex + 1] * (1 - alpha) + green * alpha,
      );
      image.data[targetIndex + 2] = Math.round(
        image.data[targetIndex + 2] * (1 - alpha) + blue * alpha,
      );
    }
  }
}

export async function persistCapturedImage(uri: string) {
  const destination = new File(
    Paths.cache,
    `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
  );
  try {
    await new File(uri).copy(destination, { overwrite: true });
  } finally {
    if (uri !== destination.uri) deleteTemporaryFile(uri);
  }
  return destination.uri;
}

async function analyzeDocument(
  uri: string,
  width: number,
  quality: number,
): Promise<DetectionResult> {
  const analysis = await prepareJpeg(uri, width, quality);
  try {
    return detectDocument(analysis.decoded as PixelImage);
  } finally {
    deleteTemporaryFile(analysis.uri);
  }
}

export async function detectDocumentPreview(uri: string) {
  return (
    (await detectDocumentWithVision(uri)) ?? {
      quad: defaultDocumentQuad(),
      confidence: 0,
      usedFallback: true,
    }
  );
}

async function renderDocumentWithJavaScript(
  originalUri: string,
  corners: Quad,
  filter: ScanFilter,
): Promise<RenderResult> {
  const working = await prepareJpeg(originalUri, WORKING_WIDTH, 0.94);
  const quad = [
    pixelPoint(corners.topLeft, working.width, working.height),
    pixelPoint(corners.topRight, working.width, working.height),
    pixelPoint(corners.bottomRight, working.width, working.height),
    pixelPoint(corners.bottomLeft, working.width, working.height),
  ];
  const outputSize = calculateOutputSize(quad);
  let warped: Uint8Array;
  try {
    warped = await warpPerspective(
      working.decoded,
      quad,
      outputSize.width,
      outputSize.height,
    );
  } finally {
    deleteTemporaryFile(working.uri);
  }
  await enhanceDocument(
    warped,
    outputSize.width,
    outputSize.height,
    filter,
  );
  const uri = await writeJpeg(
    {
      data: warped,
      width: outputSize.width,
      height: outputSize.height,
    },
    'scan',
  );
  return { uri, ...outputSize };
}

export async function renderDocument(
  originalUri: string,
  corners: Quad,
  filter: ScanFilter,
): Promise<RenderResult> {
  if (DocumentVisionModule) {
    try {
      const rendered = await DocumentVisionModule.processDocumentAsync(
        originalUri,
        corners,
        filter,
      );
      if (
        rendered.uri &&
        rendered.width > 0 &&
        rendered.height > 0
      ) {
        return rendered;
      }
    } catch {
      // Expo Go and stale development builds continue through the local JS path.
    }
  }

  return renderDocumentWithJavaScript(originalUri, corners, filter);
}

export async function prepareDocument(page: ScanPage): Promise<ScanPage> {
  const visionDetection = await detectDocumentWithVision(page.originalUri);
  const localFallback = visionDetection
    ? undefined
    : await analyzeDocument(page.originalUri, ANALYSIS_WIDTH, 0.76);
  const detection =
    visionDetection ??
    (localFallback &&
    !localFallback.usedFallback &&
    localFallback.confidence >= 0.54
      ? localFallback
      : {
          quad: defaultDocumentQuad(),
          confidence: localFallback?.confidence ?? 0,
          usedFallback: true,
        });
  const rendered = await renderDocument(
    page.originalUri,
    detection.quad,
    page.filter,
  );

  return {
    ...page,
    processedUri: rendered.uri,
    processedWidth: rendered.width,
    processedHeight: rendered.height,
    corners: detection.quad,
    detectionConfidence: detection.confidence,
    status: 'ready',
    errorMessage: undefined,
  };
}

export async function reprocessDocument(
  page: ScanPage,
  corners: Quad = page.corners ?? defaultDocumentQuad(),
  filter: ScanFilter = page.filter,
): Promise<ScanPage> {
  const rendered = await renderDocument(page.originalUri, corners, filter);
  return {
    ...page,
    processedUri: rendered.uri,
    processedWidth: rendered.width,
    processedHeight: rendered.height,
    corners,
    filter,
    status: 'ready',
    errorMessage: undefined,
  };
}

export async function createWatermarkedCopy(uri: string) {
  const image = jpeg.decode(await new File(uri).bytes(), {
    useTArray: true,
    formatAsRGBA: true,
  }) as DecodedImage;
  applyWatermarkPixels(image, await loadWatermark());
  return writeJpeg(image, 'scan-watermarked', 90);
}

export async function useFallbackDocument(page: ScanPage): Promise<ScanPage> {
  return reprocessDocument(page, defaultDocumentQuad(), page.filter);
}
