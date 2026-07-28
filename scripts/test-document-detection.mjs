import {
  detectDocument,
} from '../src/lib/documentDetection.ts';

const width = 360;
const height = 480;

function insideConvexQuad(x, y, points) {
  let direction = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const cross =
      (end.x - start.x) * (y - start.y) -
      (end.y - start.y) * (x - start.x);
    if (Math.abs(cross) < 0.001) continue;
    const currentDirection = Math.sign(cross);
    if (!direction) direction = currentDirection;
    if (direction !== currentDirection) return false;
  }
  return true;
}

function renderScenario({ background, paper, quad, withContent = true }) {
  const data = new Uint8Array(width * height * 4);
  const points = quad.map((point) => ({
    x: point.x * (width - 1),
    y: point.y * (height - 1),
  }));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const subtleTexture = ((x * 17 + y * 29) % 9) - 4;
      const onPaper = insideConvexQuad(x, y, points);
      let value = onPaper ? paper : background + subtleTexture;
      if (
        onPaper &&
        withContent &&
        x > width * 0.28 &&
        x < width * 0.72 &&
        y > height * 0.23 &&
        y < height * 0.77 &&
        y % 29 < 3
      ) {
        value = 68;
      }
      data[index] = value;
      data[index + 1] = onPaper ? Math.max(0, value - 2) : value;
      data[index + 2] = onPaper ? Math.max(0, value - 5) : value;
      data[index + 3] = 255;
    }
  }

  return { width, height, data };
}

function averageCornerError(actual, expected) {
  const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  return (
    keys.reduce(
      (total, key) =>
        total +
        Math.hypot(
          actual[key].x - expected[key].x,
          actual[key].y - expected[key].y,
        ),
      0,
    ) / keys.length
  );
}

const scenarios = [
  {
    name: '深色桌面上的斜拍文字页',
    background: 48,
    paper: 242,
    quad: {
      topLeft: { x: 0.17, y: 0.13 },
      topRight: { x: 0.84, y: 0.09 },
      bottomRight: { x: 0.89, y: 0.88 },
      bottomLeft: { x: 0.11, y: 0.91 },
    },
  },
  {
    name: '浅色桌面上的低对比度页面',
    background: 204,
    paper: 246,
    quad: {
      topLeft: { x: 0.12, y: 0.1 },
      topRight: { x: 0.89, y: 0.15 },
      bottomRight: { x: 0.82, y: 0.9 },
      bottomLeft: { x: 0.16, y: 0.84 },
    },
  },
  {
    name: '较暗纸张与透视收缩',
    background: 72,
    paper: 211,
    quad: {
      topLeft: { x: 0.23, y: 0.08 },
      topRight: { x: 0.76, y: 0.14 },
      bottomRight: { x: 0.9, y: 0.92 },
      bottomLeft: { x: 0.08, y: 0.87 },
    },
  },
];

for (const scenario of scenarios) {
  const expected = {
    topLeft: scenario.quad.topLeft,
    topRight: scenario.quad.topRight,
    bottomRight: scenario.quad.bottomRight,
    bottomLeft: scenario.quad.bottomLeft,
  };
  const result = detectDocument(
    renderScenario({
      ...scenario,
      quad: Object.values(expected),
    }),
  );
  const error = averageCornerError(result.quad, expected);
  if (result.usedFallback || error > 0.075 || result.confidence < 0.4) {
    throw new Error(
      `${scenario.name} 识别失败：fallback=${result.usedFallback}, error=${error.toFixed(3)}, confidence=${result.confidence.toFixed(2)}`,
    );
  }
  console.log(
    `✓ ${scenario.name}：四角平均误差 ${error.toFixed(3)}，置信度 ${result.confidence.toFixed(2)}`,
  );
}
