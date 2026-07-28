import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  Check,
  Flashlight,
  ImagePlus,
  Sparkles,
} from 'lucide-react-native';
import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
  type FlashMode,
} from 'expo-camera';
import { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import { detectDocumentPreview } from '../lib/imagePipeline';
import { colors, radii, shadows } from '../theme';
import type { Point, Quad, ScanPage } from '../types';
import { PrimaryButton, RoundIconButton } from './Controls';

const flashModes: FlashMode[] = ['off', 'auto', 'on'];
const cornerKeys = [
  'topLeft',
  'topRight',
  'bottomRight',
  'bottomLeft',
] as const;
const LIVE_SCAN_DELAY = 620;

type LiveDetection = {
  quad: Quad;
  confidence: number;
  imageWidth: number;
  imageHeight: number;
  usedFallback: boolean;
  stable: boolean;
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

function blendQuad(previous: Quad, next: Quad, amount: number): Quad {
  const blendPoint = (first: Point, second: Point): Point => ({
    x: first.x + (second.x - first.x) * amount,
    y: first.y + (second.y - first.y) * amount,
  });
  return {
    topLeft: blendPoint(previous.topLeft, next.topLeft),
    topRight: blendPoint(previous.topRight, next.topRight),
    bottomRight: blendPoint(previous.bottomRight, next.bottomRight),
    bottomLeft: blendPoint(previous.bottomLeft, next.bottomLeft),
  };
}

function averageQuadMovement(previous: Quad, next: Quad) {
  return (
    cornerKeys.reduce(
      (total, key) =>
        total +
        Math.hypot(
          previous[key].x - next[key].x,
          previous[key].y - next[key].y,
        ),
      0,
    ) / cornerKeys.length
  );
}

function projectPoint(
  point: Point,
  imageWidth: number,
  imageHeight: number,
  viewWidth: number,
  viewHeight: number,
) {
  const scale = Math.max(
    viewWidth / Math.max(1, imageWidth),
    viewHeight / Math.max(1, imageHeight),
  );
  const displayedWidth = imageWidth * scale;
  const displayedHeight = imageHeight * scale;
  return {
    x: (viewWidth - displayedWidth) / 2 + point.x * displayedWidth,
    y: (viewHeight - displayedHeight) / 2 + point.y * displayedHeight,
  };
}

function discardCameraSample(uri?: string) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Sampling files live in cache; cleanup failure is not user-facing.
  }
}

export function ScannerCamera({
  pages,
  onCapture,
  onImport,
  onFinish,
}: {
  pages: ScanPage[];
  onCapture: (photo: CameraCapturedPicture) => Promise<void>;
  onImport: () => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const cameraRef = useRef<CameraView>(null);
  const cameraBusyRef = useRef(false);
  const captureIntentRef = useRef(false);
  const stableDetectionsRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [liveDetection, setLiveDetection] = useState<LiveDetection>();

  useEffect(() => {
    if (!ready || !permission?.granted || capturing) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (milliseconds: number) => {
      timer = setTimeout(() => void sampleFrame(), milliseconds);
    };
    const sampleFrame = async () => {
      if (cancelled) return;
      if (cameraBusyRef.current || captureIntentRef.current) {
        schedule(180);
        return;
      }

      cameraBusyRef.current = true;
      let sample: CameraCapturedPicture | undefined;
      try {
        sample = await cameraRef.current?.takePictureAsync({
          quality: 0.24,
          exif: false,
          shutterSound: false,
          skipProcessing: false,
        });
        if (!sample || cancelled || captureIntentRef.current) return;
        const detection = await detectDocumentPreview(sample.uri);
        if (cancelled || captureIntentRef.current) return;

        setLiveDetection((previous) => {
          if (detection.usedFallback) {
            stableDetectionsRef.current = 0;
            return {
              quad: detection.quad,
              confidence: detection.confidence,
              imageWidth: sample?.width ?? 1,
              imageHeight: sample?.height ?? 1,
              usedFallback: true,
              stable: false,
            };
          }
          const movement =
            previous && !previous.usedFallback
              ? averageQuadMovement(previous.quad, detection.quad)
              : 1;
          const consistent =
            movement < 0.028 && detection.confidence >= 0.62;
          stableDetectionsRef.current = consistent
            ? stableDetectionsRef.current + 1
            : 0;
          return {
            quad:
              previous && !previous.usedFallback && movement < 0.12
                ? blendQuad(previous.quad, detection.quad, 0.42)
                : detection.quad,
            confidence: detection.confidence,
            imageWidth: sample?.width ?? 1,
            imageHeight: sample?.height ?? 1,
            usedFallback: false,
            stable: stableDetectionsRef.current >= 2,
          };
        });
      } catch {
        // The next sample retries automatically; manual capture stays available.
      } finally {
        discardCameraSample(sample?.uri);
        cameraBusyRef.current = false;
        if (!cancelled) schedule(LIVE_SCAN_DELAY);
      }
    };

    schedule(420);
    return () => {
      cancelled = true;
      stableDetectionsRef.current = 0;
      if (timer) clearTimeout(timer);
    };
  }, [capturing, permission?.granted, ready]);

  const capture = async () => {
    if (!ready || capturing) return;
    captureIntentRef.current = true;
    setCapturing(true);
    try {
      await delay(90);
      while (cameraBusyRef.current) await delay(35);
      cameraBusyRef.current = true;
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.94,
        exif: false,
        shutterSound: true,
        skipProcessing: false,
      });
      if (photo) await onCapture(photo);
    } finally {
      cameraBusyRef.current = false;
      captureIntentRef.current = false;
      setCapturing(false);
    }
  };

  const measureCamera = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCameraLayout({ width, height });
  };

  const cycleFlash = () => {
    const index = flashModes.indexOf(flash);
    setFlash(flashModes[(index + 1) % flashModes.length]);
  };

  if (!permission) {
    return <View style={styles.permissionScreen} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <View style={styles.permissionMark}>
          <Camera color={colors.primary} size={34} />
        </View>
        <Text style={styles.permissionTitle}>先允许使用相机</Text>
        <Text style={styles.permissionBody}>
          相机只用于拍摄纸质文件。照片会留在手机本地，不会上传。
        </Text>
        <PrimaryButton
          icon={Camera}
          label="允许相机权限"
          onPress={requestPermission}
        />
        <PrimaryButton
          icon={ImagePlus}
          label="或者从相册导入"
          onPress={onImport}
          variant="secondary"
        />
        {pages.length > 0 && (
          <PrimaryButton
            icon={Check}
            label={`处理已导入的 ${pages.length} 页`}
            onPress={onFinish}
          />
        )}
      </SafeAreaView>
    );
  }

  const latestPage = pages.at(-1);
  const detectedPoints =
    liveDetection &&
    !liveDetection.usedFallback &&
    liveDetection.confidence >= 0.52 &&
    cameraLayout.width > 0 &&
    cameraLayout.height > 0
      ? cornerKeys.map((key) =>
          projectPoint(
            liveDetection.quad[key],
            liveDetection.imageWidth,
            liveDetection.imageHeight,
            cameraLayout.width,
            cameraLayout.height,
          ),
        )
      : undefined;
  const detectedPointString = detectedPoints
    ?.map((point) => `${point.x},${point.y}`)
    .join(' ');
  const paperLocked = Boolean(
    detectedPoints && liveDetection?.stable && liveDetection.confidence >= 0.62,
  );

  return (
    <View onLayout={measureCamera} style={styles.container}>
      <CameraView
        active
        animateShutter={capturing}
        facing="back"
        flash={capturing ? flash : 'off'}
        mode="picture"
        onCameraReady={() => setReady(true)}
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.58)', 'transparent', 'rgba(0,0,0,0.78)']}
        locations={[0, 0.42, 1]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View>
          <Text style={styles.kicker}>手工川扫描</Text>
          <Text style={styles.cameraTitle}>
            {pages.length ? `已拍 ${pages.length} 页` : '对准纸张，连续拍摄'}
          </Text>
        </View>
        <RoundIconButton
          icon={Flashlight}
          label={`闪光灯：${flash}`}
          onPress={cycleFlash}
          tone="dark"
        />
      </SafeAreaView>

      {detectedPoints && detectedPointString ? (
        <View pointerEvents="none" style={styles.liveEdgeOverlay}>
          <Svg height="100%" width="100%">
            <Polygon
              fill={
                paperLocked
                  ? 'rgba(132,149,122,0.13)'
                  : 'rgba(217,119,87,0.11)'
              }
              points={detectedPointString}
              stroke={paperLocked ? colors.sageSoft : colors.primarySoft}
              strokeLinejoin="round"
              strokeWidth={4}
            />
            {detectedPoints.map((point, index) => (
              <Circle
                cx={point.x}
                cy={point.y}
                fill={paperLocked ? colors.sageSoft : colors.primarySoft}
                key={cornerKeys[index]}
                r={6}
                stroke="rgba(17,17,15,0.5)"
                strokeWidth={2}
              />
            ))}
          </Svg>
        </View>
      ) : (
        <View pointerEvents="none" style={styles.guideWrap}>
          <Svg height="100%" width="100%">
            <Path
              d="M36 92 V48 Q36 36 48 36 H92 M268 36 H312 Q324 36 324 48 V92 M324 368 V412 Q324 424 312 424 H268 M92 424 H48 Q36 424 36 412 V368"
              fill="none"
              stroke={colors.primarySoft}
              strokeLinecap="round"
              strokeWidth={4}
              vectorEffect="non-scaling-stroke"
            />
          </Svg>
        </View>
      )}
      <View
        pointerEvents="none"
        style={[
          styles.guideCaption,
          paperLocked && styles.guideCaptionLocked,
        ]}
      >
        <Sparkles color={colors.primarySoft} size={15} />
        <Text style={styles.guideCaptionText}>
          {paperLocked
            ? '已锁定纸张边缘'
            : detectedPoints
              ? '正在稳定四角'
              : '正在识别纸张'}
        </Text>
      </View>

      {latestPage && (
        <View pointerEvents="none" style={styles.latestResultCard}>
          <View style={styles.latestResultImageWrap}>
            <Image
              resizeMode="cover"
              source={{
                uri: latestPage.processedUri ?? latestPage.originalUri,
              }}
              style={StyleSheet.absoluteFill}
            />
            {latestPage.status !== 'ready' && (
              <View style={styles.latestResultBusy}>
                <ActivityIndicator color={colors.white} size="small" />
              </View>
            )}
          </View>
          <View style={styles.latestResultCopy}>
            <Text style={styles.latestResultPage}>第 {pages.length} 页</Text>
            <Text style={styles.latestResultStatus}>
              {latestPage.status === 'ready'
                ? '已标准化 · 已提亮'
                : '正在智能校正'}
            </Text>
          </View>
        </View>
      )}

      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <View style={styles.captureRow}>
          <Pressable
            accessibilityLabel="从相册导入"
            onPress={onImport}
            style={({ pressed }) => [
              styles.thumbnailButton,
              pressed && { opacity: 0.72 },
            ]}
          >
            {latestPage ? (
              <>
                <Image
                  source={{
                    uri: latestPage.processedUri ?? latestPage.originalUri,
                  }}
                  style={styles.latestThumbnail}
                />
                <View style={styles.pageBadge}>
                  <Text style={styles.pageBadgeText}>{pages.length}</Text>
                </View>
              </>
            ) : (
              <ImagePlus color={colors.white} size={24} />
            )}
          </Pressable>

          <Pressable
            accessibilityLabel="拍照扫描"
            disabled={!ready || capturing}
            onPress={capture}
            style={({ pressed }) => [
              styles.shutterOuter,
              pressed && { transform: [{ scale: 0.94 }] },
              (!ready || capturing) && { opacity: 0.56 },
            ]}
          >
            <View style={styles.shutterInner}>
              {capturing && <ActivityIndicator color={colors.primary} />}
            </View>
          </Pressable>

          {pages.length ? (
            <Pressable
              accessibilityLabel="完成拍摄"
              onPress={onFinish}
              style={({ pressed }) => [
                styles.doneButton,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Check color={colors.white} size={22} strokeWidth={2.4} />
              <Text style={styles.doneLabel}>完成</Text>
            </Pressable>
          ) : (
            <View style={styles.donePlaceholder} />
          )}
        </View>
        <Text style={styles.bottomHint}>
          实时识别边缘 · 拍后自动标准化并提亮
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.camera,
  },
  permissionScreen: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 14,
  },
  permissionMark: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  permissionTitle: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  permissionBody: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    color: colors.primarySoft,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  cameraTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  guideWrap: {
    position: 'absolute',
    width: 360,
    height: 460,
    left: '50%',
    top: '48%',
    marginLeft: -180,
    marginTop: -230,
  },
  guideCaption: {
    position: 'absolute',
    top: 124,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(17,17,15,0.48)',
  },
  guideCaptionLocked: {
    backgroundColor: 'rgba(56,73,51,0.74)',
  },
  guideCaptionText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  liveEdgeOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  latestResultCard: {
    position: 'absolute',
    right: 18,
    bottom: 154,
    width: 142,
    padding: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255,252,247,0.94)',
    ...shadows.floating,
  },
  latestResultImageWrap: {
    width: '100%',
    height: 94,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.cameraSoft,
  },
  latestResultBusy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,17,15,0.45)',
  },
  latestResultCopy: {
    paddingHorizontal: 3,
    paddingTop: 7,
    paddingBottom: 2,
  },
  latestResultPage: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  latestResultStatus: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 28,
    paddingHorizontal: 24,
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  thumbnailButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  latestThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
  },
  pageBadge: {
    position: 'absolute',
    right: -7,
    top: -7,
    minWidth: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.camera,
  },
  pageBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  shutterOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.white,
    borderWidth: 4,
    borderColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
  doneButton: {
    minWidth: 76,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  doneLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  donePlaceholder: {
    width: 76,
  },
  bottomHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
});
