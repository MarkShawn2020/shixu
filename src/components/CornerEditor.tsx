import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import Svg, { Polygon } from 'react-native-svg';

import { colors, radii } from '../theme';
import type { Point, Quad, ScanPage } from '../types';
import { PrimaryButton, RoundIconButton } from './Controls';

type CornerKey = keyof Quad;

const cornerKeys: CornerKey[] = [
  'topLeft',
  'topRight',
  'bottomRight',
  'bottomLeft',
];

const clamp = (value: number) => Math.max(0.02, Math.min(0.98, value));

function CornerHandle({
  point,
  canvasWidth,
  canvasHeight,
  onMove,
}: {
  point: Point;
  canvasWidth: number;
  canvasHeight: number;
  onMove: (point: Point) => void;
}) {
  const start = useRef(point);
  useEffect(() => {
    start.current = point;
  }, [point]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = point;
        },
        onPanResponderMove: (_, gesture) => {
          onMove({
            x: clamp(start.current.x + gesture.dx / canvasWidth),
            y: clamp(start.current.y + gesture.dy / canvasHeight),
          });
        },
      }),
    [canvasHeight, canvasWidth, onMove, point],
  );

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.cornerTouch,
        {
          left: point.x * canvasWidth - 24,
          top: point.y * canvasHeight - 24,
        },
      ]}
    >
      <View style={styles.cornerDot} />
    </View>
  );
}

export function CornerEditor({
  page,
  visible,
  onClose,
  onApply,
}: {
  page?: ScanPage;
  visible: boolean;
  onClose: () => void;
  onApply: (corners: Quad) => Promise<void>;
}) {
  const { width, height } = useWindowDimensions();
  const [corners, setCorners] = useState<Quad | undefined>(page?.corners);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setCorners(page?.corners);
  }, [page?.corners, visible]);

  if (!page || !corners) return null;

  const availableWidth = width - 32;
  const availableHeight = height * 0.6;
  const imageRatio =
    Math.max(1, page.originalWidth) / Math.max(1, page.originalHeight);
  const canvasWidth = Math.min(
    availableWidth,
    availableHeight * imageRatio,
  );
  const canvasHeight = canvasWidth / imageRatio;
  const points = cornerKeys
    .map(
      (key) =>
        `${corners[key].x * canvasWidth},${corners[key].y * canvasHeight}`,
    )
    .join(' ');

  const updateCorner = (key: CornerKey, point: Point) => {
    setCorners((current) => (current ? { ...current, [key]: point } : current));
  };

  const apply = async () => {
    setSaving(true);
    try {
      await onApply(corners);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={styles.modal}>
        <View style={styles.header}>
          <RoundIconButton icon={X} label="关闭" onPress={onClose} />
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>几何校正</Text>
            <Text style={styles.title}>拖动四角贴合纸张边缘</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.stage}>
          <View
            style={[
              styles.canvas,
              { width: canvasWidth, height: canvasHeight },
            ]}
          >
            <Image
              resizeMode="stretch"
              source={{ uri: page.originalUri }}
              style={StyleSheet.absoluteFill}
            />
            <Svg
              height={canvasHeight}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              width={canvasWidth}
            >
              <Polygon
                fill="rgba(217, 119, 87, 0.16)"
                points={points}
                stroke={colors.primary}
                strokeDasharray="8 5"
                strokeWidth={3}
              />
            </Svg>
            {cornerKeys.map((key) => (
              <CornerHandle
                canvasHeight={canvasHeight}
                canvasWidth={canvasWidth}
                key={key}
                onMove={(point) => updateCorner(key, point)}
                point={corners[key]}
              />
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.hint}>
            自动识别置信度{' '}
            {Math.round((page.detectionConfidence ?? 0) * 100)}%。边缘不准时拖动圆点即可。
          </Text>
          <PrimaryButton
            icon={Check}
            label={saving ? '正在重新校正' : '应用并重新提亮'}
            loading={saving}
            onPress={apply}
          />
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelLabel}>保持当前结果</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  eyebrow: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 3,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.camera,
    paddingVertical: 22,
  },
  canvas: {
    overflow: 'visible',
    backgroundColor: colors.white,
  },
  cornerTouch: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.white,
    shadowColor: colors.camera,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 34,
    gap: 12,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  cancel: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
