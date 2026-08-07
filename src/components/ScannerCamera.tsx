import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
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
  FlashlightOff,
  History,
  ImagePlus,
  Info,
  Sparkles,
} from 'lucide-react-native';
import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
} from 'expo-camera';
import { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import {
  detectDocumentPreview,
  hasNativeDocumentVision,
} from '../lib/imagePipeline';
import { colors, radii, shadows } from '../theme';
import type { Point, Quad, ScanPage } from '../types';
import { PrimaryButton, RoundIconButton } from './Controls';

const cornerKeys = [
  'topLeft',
  'topRight',
  'bottomRight',
  'bottomLeft',
] as const;
const LIVE_SCAN_DELAY = 320;
const INITIAL_SCAN_DELAY = 80;
const CAMERA_VIEW_ASPECT_RATIO = 3 / 4;

type LiveDetection = {
  quad: Quad;
  confidence: number;
  imageWidth: number;
  imageHeight: number;
  usedFallback: boolean;
  stable: boolean;
};

type NativeDocumentDetectionEvent = {
  nativeEvent: {
    quad?: Quad;
    confidence: number;
    area: number;
    imageWidth?: number;
    imageHeight?: number;
  };
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
  onOpenHistory,
  onOpenAbout,
  onOpenPage,
  historyCount,
}: {
  pages: ScanPage[];
  onCapture: (photo: CameraCapturedPicture) => Promise<void>;
  onImport: () => Promise<void>;
  onFinish: () => Promise<void>;
  onOpenHistory: () => void;
  onOpenAbout: () => void;
  onOpenPage: (pageId: string) => void;
  historyCount: number;
}) {
  const cameraRef = useRef<CameraView>(null);
  const cameraBusyRef = useRef(false);
  const captureIntentRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [liveDetection, setLiveDetection] = useState<LiveDetection>();

  const applyLiveDetection = useCallback(
    (
      detection: Omit<
        LiveDetection,
        'imageWidth' | 'imageHeight' | 'stable'
      >,
      imageWidth: number,
      imageHeight: number,
    ) => {
      if (detection.usedFallback || detection.confidence < 0.52) {
        setLiveDetection(undefined);
        return;
      }

      setLiveDetection((previous) => {
        const movement =
          previous && !previous.usedFallback
            ? averageQuadMovement(previous.quad, detection.quad)
            : 1;
        const nearlyStationary =
          previous && !previous.usedFallback && movement < 0.014;
        return {
          quad: nearlyStationary
            ? blendQuad(previous.quad, detection.quad, 0.2)
            : detection.quad,
          confidence: detection.confidence,
          imageWidth,
          imageHeight,
          usedFallback: false,
          stable: detection.confidence >= 0.62,
        };
      });
    },
    [],
  );

  const handleNativeDocumentDetected = useCallback(
    (event: NativeDocumentDetectionEvent) => {
      if (captureIntentRef.current) return;
      const {
        quad,
        confidence,
        imageWidth = 3,
        imageHeight = 4,
      } = event.nativeEvent;
      if (!quad || confidence < 0.52) {
        setLiveDetection(undefined);
        return;
      }
      applyLiveDetection(
        {
          quad,
          confidence,
          usedFallback: false,
        },
        imageWidth,
        imageHeight,
      );
    },
    [applyLiveDetection],
  );

  useEffect(() => {
    if (
      hasNativeDocumentVision ||
      !ready ||
      !permission?.granted ||
      capturing
    ) {
      return;
    }

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
        applyLiveDetection(
          detection,
          sample.width ?? 1,
          sample.height ?? 1,
        );
      } catch {
        // The next sample retries automatically; manual capture stays available.
      } finally {
        discardCameraSample(sample?.uri);
        cameraBusyRef.current = false;
        if (!cancelled) schedule(LIVE_SCAN_DELAY);
      }
    };

    schedule(INITIAL_SCAN_DELAY);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [applyLiveDetection, capturing, permission?.granted, ready]);

  const capture = async () => {
    if (!ready || capturing) return;
    captureIntentRef.current = true;
    setCapturing(true);
    try {
      await delay(90);
      while (cameraBusyRef.current) await delay(35);
      cameraBusyRef.current = true;
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 1,
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

  if (!permission) {
    return <View style={styles.permissionScreen} />;
  }

  if (!permission.granted) {
    const canRequestCamera = permission.canAskAgain;

    return (
      <SafeAreaView style={styles.permissionScreen}>
        <View style={styles.permissionMark}>
          <Camera color={colors.primary} size={34} />
        </View>
        <Text style={styles.permissionTitle}>
          {canRequestCamera ? '使用相机扫描文件' : '相机访问已关闭'}
        </Text>
        <Text style={styles.permissionBody}>
          {canRequestCamera
            ? '相机仅用于拍摄纸质文件，照片只保存在这台设备上。'
            : '可在系统设置中开启相机，也可以继续从相册导入文件。'}
        </Text>
        <PrimaryButton
          icon={Camera}
          label={canRequestCamera ? '继续' : '打开系统设置'}
          onPress={
            canRequestCamera
              ? requestPermission
              : () => void Linking.openSettings()
          }
        />
        <PrimaryButton
          icon={ImagePlus}
          label="从相册导入"
          onPress={onImport}
          variant="secondary"
        />
        <PrimaryButton
          icon={History}
          label="查看扫描历史"
          onPress={onOpenHistory}
          variant="quiet"
        />
        <PrimaryButton
          icon={Info}
          label="隐私与关于"
          onPress={onOpenAbout}
          variant="quiet"
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
    <View style={styles.container}>
      <View onLayout={measureCamera} style={styles.cameraViewport}>
        <CameraView
          {...(hasNativeDocumentVision
            ? { onDocumentDetected: handleNativeDocumentDetected }
            : {})}
          active
          animateShutter={capturing}
          enableTorch={torchEnabled}
          facing="back"
          flash="off"
          mode="picture"
          onCameraReady={() => setReady(true)}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.58)', 'transparent', 'rgba(0,0,0,0.42)']}
          locations={[0, 0.42, 1]}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />

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
      </View>

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View>
          <Text style={styles.kicker}>拾序</Text>
          <Text style={styles.cameraTitle}>
            {pages.length ? `已拍 ${pages.length} 页` : '对准纸张，连续拍摄'}
          </Text>
        </View>
        <View style={styles.topActions}>
          <RoundIconButton
            icon={Info}
            label="隐私与关于"
            onPress={onOpenAbout}
            tone="dark"
          />
          <View>
            <RoundIconButton
              icon={History}
              label={`扫描历史，共 ${historyCount} 份`}
              onPress={onOpenHistory}
              tone="dark"
            />
            {historyCount > 0 && (
              <View pointerEvents="none" style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>
                  {historyCount > 99 ? '99+' : historyCount}
                </Text>
              </View>
            )}
          </View>
          <RoundIconButton
            icon={torchEnabled ? Flashlight : FlashlightOff}
            label={`手电筒：${torchEnabled ? '已开启' : '已关闭'}`}
            onPress={() => setTorchEnabled((enabled) => !enabled)}
            tone={torchEnabled ? 'primary' : 'dark'}
          />
        </View>
      </SafeAreaView>

      {latestPage && (
        <Pressable
          accessibilityHint="进入扫描结果预览"
          accessibilityLabel={`查看第 ${pages.length} 页扫描结果`}
          accessibilityRole="button"
          disabled={latestPage.status !== 'ready'}
          onPress={() => onOpenPage(latestPage.id)}
          style={({ pressed }) => [
            styles.latestResultCard,
            pressed && styles.latestResultCardPressed,
            latestPage.status !== 'ready' &&
              styles.latestResultCardDisabled,
          ]}
        >
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
                ? '已完成 · 点击查看'
                : '正在智能校正'}
            </Text>
          </View>
        </Pressable>
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
              disabled={capturing}
              onPress={onFinish}
              style={({ pressed }) => [
                styles.doneButton,
                pressed && { opacity: 0.75 },
                capturing && { opacity: 0.5 },
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
  cameraViewport: {
    width: '100%',
    aspectRatio: CAMERA_VIEW_ASPECT_RATIO,
    overflow: 'hidden',
    backgroundColor: colors.cameraSoft,
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  historyBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.camera,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '800',
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
  latestResultCardPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.96 }],
  },
  latestResultCardDisabled: {
    opacity: 0.9,
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
