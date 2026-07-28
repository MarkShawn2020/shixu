import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Camera,
  Check,
  FileOutput,
  History,
  SlidersHorizontal,
  Smartphone,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, shadows } from '../theme';
import type { ScanPage } from '../types';
import { PrimaryButton, RoundIconButton } from './Controls';

export function ScanComplete({
  pages,
  onEdit,
  onExport,
  onNewScan,
  onOpenHistory,
}: {
  pages: ScanPage[];
  onEdit: () => void;
  onExport: () => void;
  onNewScan: () => void;
  onOpenHistory: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const cover = pages[0];
  if (!cover) return null;

  const coverRatio =
    (cover.processedWidth ?? cover.originalWidth) /
    Math.max(1, cover.processedHeight ?? cover.originalHeight);
  const previewWidth = Math.min(width - 96, 244);
  const previewHeight = Math.min(height * 0.34, previewWidth / coverRatio);
  const resolvedPreviewWidth = Math.min(
    previewWidth,
    previewHeight * coverRatio,
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>拾序</Text>
          <Text style={styles.headerTitle}>扫描完成</Text>
        </View>
        <RoundIconButton
          icon={History}
          label="查看扫描历史"
          onPress={onOpenHistory}
        />
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successMark}>
          <Check color={colors.white} size={32} strokeWidth={2.8} />
        </View>
        <Text style={styles.title}>这份文档已收好</Text>
        <Text style={styles.body}>
          {pages.length} 页已经保存到本机。现在可以导出，也可以开始下一份。
        </Text>

        <View
          style={[
            styles.previewStack,
            {
              width: resolvedPreviewWidth + 24,
              height: previewHeight + 24,
            },
          ]}
        >
          {pages.length > 1 && <View style={styles.previewBack} />}
          <View
            style={[
              styles.preview,
              {
                width: resolvedPreviewWidth,
                height: previewHeight,
              },
            ]}
          >
            <Image
              resizeMode="contain"
              source={{ uri: cover.processedUri ?? cover.originalUri }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.pageBadge}>
              <Text style={styles.pageBadgeText}>{pages.length} 页</Text>
            </View>
          </View>
        </View>

        <View style={styles.localNotice}>
          <Smartphone color={colors.sage} size={18} />
          <View style={styles.localNoticeCopy}>
            <Text style={styles.localNoticeTitle}>已与下一份扫描分开保存</Text>
            <Text style={styles.localNoticeBody}>
              原图、校正结果与记录都只留在这台设备
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <PrimaryButton
          icon={Camera}
          label="再拍一份"
          onPress={onNewScan}
        />
        <View style={styles.secondaryActions}>
          <View style={styles.secondaryAction}>
            <PrimaryButton
              icon={FileOutput}
              label="导出这份"
              onPress={onExport}
              variant="secondary"
            />
          </View>
          <View style={styles.secondaryAction}>
            <PrimaryButton
              icon={SlidersHorizontal}
              label="继续调整"
              onPress={onEdit}
              variant="secondary"
            />
          </View>
        </View>
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
    minHeight: 70,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  kicker: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 224,
  },
  successMark: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    lineHeight: 35,
    fontWeight: '800',
    marginTop: 18,
    textAlign: 'center',
  },
  body: {
    maxWidth: 320,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
    textAlign: 'center',
  },
  previewStack: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBack: {
    position: 'absolute',
    top: 6,
    right: 0,
    bottom: 0,
    left: 18,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    transform: [{ rotate: '3deg' }],
  },
  preview: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 6,
    backgroundColor: colors.paperStrong,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.floating,
  },
  pageBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(37,35,31,0.78)',
  },
  pageBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  localNotice: {
    width: '100%',
    maxWidth: 360,
    marginTop: 22,
    padding: 14,
    borderRadius: radii.medium,
    backgroundColor: colors.sageSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  localNoticeCopy: {
    flex: 1,
  },
  localNoticeTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  localNoticeBody: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  actions: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 14,
    padding: 14,
    borderRadius: radii.large,
    backgroundColor: colors.paperStrong,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
    ...shadows.floating,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
  },
});
