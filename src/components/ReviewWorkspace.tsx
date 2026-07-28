import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Crop,
  FileOutput,
  ImagePlus,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, shadows } from '../theme';
import type { ScanFilter, ScanPage } from '../types';
import {
  PrimaryButton,
  RoundIconButton,
  SegmentedControl,
} from './Controls';

const filterSegments: { value: ScanFilter; label: string }[] = [
  { value: 'color', label: '智能彩色' },
  { value: 'grayscale', label: '灰度' },
  { value: 'blackwhite', label: '黑白' },
];

export function ReviewWorkspace({
  pages,
  selectedPageId,
  busyPageId,
  onSelect,
  onAddPages,
  onDelete,
  onMove,
  onOpenCorners,
  onChangeFilter,
  onExport,
  onShareCurrent,
  onBackToCamera,
}: {
  pages: ScanPage[];
  selectedPageId: string;
  busyPageId?: string;
  onSelect: (pageId: string) => void;
  onAddPages: () => void;
  onDelete: (pageId: string) => void;
  onMove: (pageId: string, direction: -1 | 1) => void;
  onOpenCorners: () => void;
  onChangeFilter: (filter: ScanFilter) => Promise<void>;
  onExport: () => void;
  onShareCurrent: () => Promise<void>;
  onBackToCamera: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const selectedIndex = Math.max(
    0,
    pages.findIndex((page) => page.id === selectedPageId),
  );
  const page = pages[selectedIndex];
  if (!page) return null;

  const previewWidth = width - 40;
  const rawRatio =
    (page.processedWidth ?? page.originalWidth) /
    Math.max(1, page.processedHeight ?? page.originalHeight);
  const maxPreviewHeight = height * 0.47;
  const previewHeight = Math.min(maxPreviewHeight, previewWidth / rawRatio);
  const resolvedPreviewWidth = Math.min(previewWidth, previewHeight * rawRatio);
  const busy = busyPageId === page.id;
  const sourceUri = page.processedUri ?? page.originalUri;
  const lowConfidence = (page.detectionConfidence ?? 1) < 0.48;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.header}>
        <RoundIconButton
          icon={ArrowLeft}
          label="继续拍摄"
          onPress={onBackToCamera}
        />
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>扫描结果</Text>
          <Text style={styles.title}>
            {pages.length} 页 · 第 {selectedIndex + 1} 页
          </Text>
        </View>
        <RoundIconButton
          icon={ImagePlus}
          label="添加页面"
          onPress={onAddPages}
        />
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.previewZone}>
          <View
            style={[
              styles.paperPreview,
              {
                width: resolvedPreviewWidth,
                height: previewHeight,
              },
            ]}
          >
            <Image
              resizeMode="contain"
              source={{ uri: sourceUri }}
              style={StyleSheet.absoluteFill}
            />
            {busy && (
              <View style={styles.busyOverlay}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.busyText}>正在重新校正并提亮</Text>
              </View>
            )}
          </View>
          <View style={styles.autoBadge}>
            <Sparkles color={colors.primaryDark} size={14} />
            <Text style={styles.autoBadgeText}>
              {lowConfidence ? '建议检查边缘' : '已自动拉直 · 智能提亮'}
            </Text>
          </View>
        </View>

        <View style={styles.filterSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionLabel}>页面效果</Text>
            <Text style={styles.sectionMeta}>本地像素处理</Text>
          </View>
          <SegmentedControl
            onChange={(filter) => void onChangeFilter(filter)}
            segments={filterSegments}
            value={page.filter}
          />
        </View>

        <View style={styles.toolsRow}>
          <View style={styles.tool}>
            <RoundIconButton
              icon={Crop}
              label="调整边缘"
              onPress={onOpenCorners}
            />
            <Text style={styles.toolLabel}>四角</Text>
          </View>
          <View style={styles.tool}>
            <RoundIconButton
              disabled={selectedIndex === 0}
              icon={ChevronLeft}
              label="向前移动"
              onPress={() => onMove(page.id, -1)}
            />
            <Text style={styles.toolLabel}>前移</Text>
          </View>
          <View style={styles.tool}>
            <RoundIconButton
              disabled={selectedIndex === pages.length - 1}
              icon={ChevronRight}
              label="向后移动"
              onPress={() => onMove(page.id, 1)}
            />
            <Text style={styles.toolLabel}>后移</Text>
          </View>
          <View style={styles.tool}>
            <RoundIconButton
              icon={Share2}
              label="分享当前图片"
              onPress={() => void onShareCurrent()}
            />
            <Text style={styles.toolLabel}>分享</Text>
          </View>
          <View style={styles.tool}>
            <RoundIconButton
              icon={Trash2}
              label="删除当前页"
              onPress={() => onDelete(page.id)}
              tone="danger"
            />
            <Text style={[styles.toolLabel, { color: colors.danger }]}>
              删除
            </Text>
          </View>
        </View>

        <View style={styles.thumbnailSection}>
          <Text style={styles.sectionLabel}>页面顺序</Text>
          <FlatList
            contentContainerStyle={styles.thumbnailList}
            data={pages}
            horizontal
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const selected = item.id === page.id;
              return (
                <Pressable
                  onPress={() => onSelect(item.id)}
                  style={({ pressed }) => [
                    styles.thumbnailWrap,
                    selected && styles.thumbnailWrapSelected,
                    pressed && { opacity: 0.72 },
                  ]}
                >
                  <Image
                    resizeMode="cover"
                    source={{ uri: item.processedUri ?? item.originalUri }}
                    style={styles.thumbnail}
                  />
                  <View
                    style={[
                      styles.thumbnailNumber,
                      selected && styles.thumbnailNumberSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.thumbnailNumberText,
                        selected && styles.thumbnailNumberTextSelected,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      </ScrollView>

      <View style={styles.exportBar}>
        <View>
          <Text style={styles.exportEyebrow}>输出</Text>
          <Text style={styles.exportHint}>图片或多页 PDF</Text>
        </View>
        <PrimaryButton
          icon={FileOutput}
          label="导出文件"
          onPress={onExport}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
  },
  kicker: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  content: {
    paddingTop: 18,
    paddingBottom: 120,
  },
  previewZone: {
    alignItems: 'center',
    minHeight: 300,
    justifyContent: 'center',
  },
  paperPreview: {
    backgroundColor: colors.paperStrong,
    borderRadius: 3,
    overflow: 'hidden',
    ...shadows.floating,
  },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,252,247,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  busyText: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: '700',
  },
  autoBadge: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.primarySoft,
  },
  autoBadgeText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  filterSection: {
    marginTop: 22,
    paddingHorizontal: 20,
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  sectionLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  toolsRow: {
    marginTop: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tool: {
    alignItems: 'center',
    gap: 6,
  },
  toolLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  thumbnailSection: {
    marginTop: 24,
    gap: 10,
  },
  thumbnailList: {
    paddingHorizontal: 20,
    gap: 10,
  },
  thumbnailWrap: {
    width: 72,
    height: 96,
    padding: 3,
    borderRadius: 12,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumbnailWrapSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 2,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  thumbnailNumber: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailNumberSelected: {
    backgroundColor: colors.primary,
  },
  thumbnailNumberText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  thumbnailNumberTextSelected: {
    color: colors.white,
  },
  exportBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    minHeight: 76,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.paperStrong,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.floating,
  },
  exportEyebrow: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  exportHint: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
});
