import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import type { CameraCapturedPicture } from 'expo-camera';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CornerEditor } from './src/components/CornerEditor';
import { ExportPanel } from './src/components/ExportPanel';
import { ReviewWorkspace } from './src/components/ReviewWorkspace';
import { ScannerCamera } from './src/components/ScannerCamera';
import { shareImage } from './src/lib/exportDocuments';
import {
  createWatermarkedCopy,
  persistCapturedImage,
  prepareDocument,
  reprocessDocument,
  useFallbackDocument,
} from './src/lib/imagePipeline';
import { colors, radii, shadows } from './src/theme';
import type {
  ProcessingProgress,
  Quad,
  ScanFilter,
  ScanPage,
} from './src/types';

type AppScreen = 'camera' | 'review';

const makePageId = (counter: number) =>
  `${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 7)}`;

async function preparePageWithFallback(page: ScanPage) {
  try {
    return await prepareDocument(page);
  } catch (primaryError) {
    try {
      return await useFallbackDocument(page);
    } catch {
      return {
        ...page,
        processedUri: page.originalUri,
        processedWidth: page.originalWidth,
        processedHeight: page.originalHeight,
        status: 'ready' as const,
        detectionConfidence: 0,
        errorMessage:
          primaryError instanceof Error
            ? primaryError.message
            : '自动校正需要手动调整',
      };
    }
  }
}

export default function App() {
  const pageCounter = useRef(0);
  const processingQueue = useRef<Promise<void>>(Promise.resolve());
  const processingTasks = useRef(new Map<string, Promise<ScanPage>>());
  const [screen, setScreen] = useState<AppScreen>('camera');
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [processing, setProcessing] = useState<ProcessingProgress>();
  const [busyPageId, setBusyPageId] = useState<string>();
  const [cornerEditorVisible, setCornerEditorVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);

  const selectedPage = useMemo(
    () =>
      pages.find((page) => page.id === selectedPageId) ??
      pages.find((page) => page.status === 'ready') ??
      pages[0],
    [pages, selectedPageId],
  );

  const enqueuePageProcessing = (page: ScanPage) => {
    const existing = processingTasks.current.get(page.id);
    if (existing) return existing;

    const task = processingQueue.current.then(() =>
      preparePageWithFallback(page),
    );
    processingQueue.current = task.then(
      () => undefined,
      () => undefined,
    );
    processingTasks.current.set(page.id, task);
    void task.then((updated) => {
      setPages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    });
    return task;
  };

  const appendCapturedPage = async (photo: CameraCapturedPicture) => {
    const originalUri = await persistCapturedImage(photo.uri);
    pageCounter.current += 1;
    const page: ScanPage = {
      id: makePageId(pageCounter.current),
      originalUri,
      originalWidth: photo.width,
      originalHeight: photo.height,
      filter: 'color',
      status: 'processing',
    };
    setPages((current) => [...current, page]);
    enqueuePageProcessing(page);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const importFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 20,
      quality: 1,
    });
    if (result.canceled) return;

    const imported: ScanPage[] = result.assets.map((asset) => {
      pageCounter.current += 1;
      return {
        id: makePageId(pageCounter.current),
        originalUri: asset.uri,
        originalWidth: asset.width,
        originalHeight: asset.height,
        filter: 'color' as const,
        status: 'processing' as const,
      };
    });
    setPages((current) => [...current, ...imported]);
    imported.forEach(enqueuePageProcessing);
    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    );
  };

  const processCapturedPages = async () => {
    if (!pages.length) return;
    const working = [...pages];
    const pendingIndexes = working
      .map((page, index) => (page.status === 'ready' ? -1 : index))
      .filter((index) => index >= 0);

    if (!pendingIndexes.length) {
      setSelectedPageId(
        selectedPageId && pages.some((page) => page.id === selectedPageId)
          ? selectedPageId
          : pages[0].id,
      );
      setScreen('review');
      return;
    }

    for (let position = 0; position < pendingIndexes.length; position += 1) {
      const pageIndex = pendingIndexes[position];
      const page = { ...working[pageIndex], status: 'processing' as const };
      working[pageIndex] = page;
      setPages([...working]);
      setProcessing({
        current: position + 1,
        total: pendingIndexes.length,
        label: `正在识别第 ${position + 1} 页边缘`,
      });

      working[pageIndex] = await enqueuePageProcessing(page);
      setPages([...working]);
    }

    setProcessing(undefined);
    const firstReady = working.find((page) => page.status === 'ready');
    if (firstReady) {
      setSelectedPageId(firstReady.id);
      setScreen('review');
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
    }
  };

  const openCapturedPage = (pageId: string) => {
    const page = pages.find((item) => item.id === pageId);
    if (page?.status !== 'ready') return;
    setSelectedPageId(pageId);
    setScreen('review');
  };

  const updateSelectedPage = async (
    operation: (page: ScanPage) => Promise<ScanPage>,
  ) => {
    if (!selectedPage) return;
    setBusyPageId(selectedPage.id);
    try {
      const updated = await operation(selectedPage);
      setPages((current) =>
        current.map((page) => (page.id === updated.id ? updated : page)),
      );
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
    } catch (error) {
      Alert.alert(
        '页面处理没有完成',
        error instanceof Error ? error.message : '请重新调整后再试',
      );
    } finally {
      setBusyPageId(undefined);
    }
  };

  const applyCorners = async (corners: Quad) => {
    await updateSelectedPage((page) =>
      reprocessDocument(page, corners, page.filter),
    );
  };

  const changeFilter = async (filter: ScanFilter) => {
    if (!selectedPage || filter === selectedPage.filter) return;
    await updateSelectedPage((page) =>
      reprocessDocument(page, page.corners, filter),
    );
  };

  const deletePage = (pageId: string) => {
    processingTasks.current.delete(pageId);
    const index = pages.findIndex((page) => page.id === pageId);
    const nextPages = pages.filter((page) => page.id !== pageId);
    setPages(nextPages);
    if (!nextPages.length) {
      setSelectedPageId('');
      setScreen('camera');
      return;
    }
    const nextSelection = nextPages[Math.min(index, nextPages.length - 1)];
    setSelectedPageId(nextSelection.id);
  };

  const movePage = (pageId: string, direction: -1 | 1) => {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === pageId);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.length) {
        return current;
      }
      const moved = [...current];
      [moved[index], moved[destination]] = [
        moved[destination],
        moved[index],
      ];
      return moved;
    });
  };

  const shareCurrentPage = async () => {
    if (!selectedPage?.processedUri) return;
    setBusyPageId(selectedPage.id);
    try {
      const watermarkedUri = await createWatermarkedCopy(
        selectedPage.processedUri,
      );
      await shareImage(watermarkedUri);
    } catch (error) {
      Alert.alert(
        '分享没有完成',
        error instanceof Error ? error.message : '请稍后再试',
      );
    } finally {
      setBusyPageId(undefined);
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar
        style={screen === 'camera' ? 'light' : 'dark'}
      />
      {screen === 'camera' ? (
        <ScannerCamera
          onCapture={appendCapturedPage}
          onFinish={processCapturedPages}
          onImport={importFromLibrary}
          onOpenPage={openCapturedPage}
          pages={pages}
        />
      ) : (
        <ReviewWorkspace
          busyPageId={busyPageId}
          onAddPages={() => setScreen('camera')}
          onBackToCamera={() => setScreen('camera')}
          onChangeFilter={changeFilter}
          onDelete={deletePage}
          onExport={() => setExportVisible(true)}
          onMove={movePage}
          onOpenCorners={() => setCornerEditorVisible(true)}
          onSelect={setSelectedPageId}
          onShareCurrent={shareCurrentPage}
          pages={pages}
          selectedPageId={selectedPage?.id ?? ''}
        />
      )}

      <CornerEditor
        onApply={applyCorners}
        onClose={() => setCornerEditorVisible(false)}
        page={selectedPage}
        visible={cornerEditorVisible}
      />
      <ExportPanel
        onClose={() => setExportVisible(false)}
        pages={pages}
        visible={exportVisible}
      />

      {processing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingSheet}>
            <Image
              source={require('./assets/logo.png')}
              style={styles.processingLogo}
            />
            <Text style={styles.processingKicker}>本地文档引擎</Text>
            <Text style={styles.processingTitle}>{processing.label}</Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(
                      (processing.current / processing.total) * 100,
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.processingMeta}>
              {processing.current} / {processing.total} · 透视校正与智能提亮
            </Text>
          </View>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  processingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    backgroundColor: 'rgba(20,18,15,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  processingSheet: {
    width: '100%',
    padding: 24,
    borderRadius: 28,
    backgroundColor: colors.paperStrong,
    alignItems: 'center',
    ...shadows.floating,
  },
  processingLogo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 18,
  },
  processingKicker: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  processingTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 5,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    marginTop: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  processingMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 10,
  },
});
