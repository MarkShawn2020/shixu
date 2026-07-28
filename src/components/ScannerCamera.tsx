import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { colors, radii, shadows } from '../theme';
import type { ScanPage } from '../types';
import { PrimaryButton, RoundIconButton } from './Controls';

const flashModes: FlashMode[] = ['off', 'auto', 'on'];

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
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState<FlashMode>('off');

  const capture = async () => {
    if (!ready || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.94,
        exif: false,
        skipProcessing: false,
      });
      if (photo) await onCapture(photo);
    } finally {
      setCapturing(false);
    }
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

  return (
    <View style={styles.container}>
      <CameraView
        active
        animateShutter
        facing="back"
        flash={flash}
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
        <View style={styles.guideCaption}>
          <Sparkles color={colors.primarySoft} size={15} />
          <Text style={styles.guideCaptionText}>拍完自动拉直并提亮</Text>
        </View>
      </View>

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
                  source={{ uri: latestPage.originalUri }}
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
        <Text style={styles.bottomHint}>每页拍完即可继续，不必等待处理</Text>
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
    alignSelf: 'center',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(17,17,15,0.48)',
  },
  guideCaptionText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
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
