import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowLeft,
  FileStack,
  History,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, shadows } from '../theme';
import type { ScanHistoryRecord } from '../types';
import { PrimaryButton, RoundIconButton } from './Controls';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function ScanHistory({
  records,
  loading,
  onBack,
  onDelete,
  onNewScan,
  onOpen,
}: {
  records: ScanHistoryRecord[];
  loading: boolean;
  onBack: () => void;
  onDelete: (recordId: string) => Promise<void>;
  onNewScan: () => void;
  onOpen: (record: ScanHistoryRecord) => void;
}) {
  const confirmDelete = (record: ScanHistoryRecord) => {
    Alert.alert(
      '删除这份扫描？',
      `其中有 ${record.pages.length} 页，删除后将从本机移除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => void onDelete(record.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.header}>
        <RoundIconButton icon={ArrowLeft} label="返回相机" onPress={onBack} />
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>本机文档</Text>
          <Text style={styles.title}>扫描历史</Text>
        </View>
        <RoundIconButton
          icon={Plus}
          label="开始新扫描"
          onPress={onNewScan}
          tone="primary"
        />
      </View>

      <View style={styles.localNotice}>
        <ShieldCheck color={colors.sage} size={17} />
        <Text style={styles.localNoticeText}>
          原图与处理结果只保存在这台设备
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.stateCopy}>正在读取本机记录</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[
            styles.list,
            !records.length && styles.emptyList,
          ]}
          data={records}
          keyExtractor={(record) => record.id}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <History color={colors.primary} size={30} />
              </View>
              <Text style={styles.emptyTitle}>还没有扫描记录</Text>
              <Text style={styles.emptyCopy}>
                拍完第一张并完成校正后，会自动出现在这里。
              </Text>
              <PrimaryButton
                icon={Plus}
                label="开始第一份扫描"
                onPress={onNewScan}
              />
            </View>
          }
          renderItem={({ item: record }) => {
            const cover = record.pages[0];
            return (
              <Pressable
                accessibilityHint="打开后可继续编辑和导出"
                accessibilityLabel={`打开扫描记录，共 ${record.pages.length} 页`}
                accessibilityRole="button"
                onPress={() => onOpen(record)}
                style={({ pressed }) => [
                  styles.recordCard,
                  pressed && styles.recordCardPressed,
                ]}
              >
                <View style={styles.coverWrap}>
                  <Image
                    resizeMode="cover"
                    source={{
                      uri: cover.processedUri ?? cover.originalUri,
                    }}
                    style={styles.cover}
                  />
                  <View style={styles.pageCount}>
                    <FileStack color={colors.white} size={12} />
                    <Text style={styles.pageCountText}>
                      {record.pages.length} 页
                    </Text>
                  </View>
                </View>
                <View style={styles.recordCopy}>
                  <Text numberOfLines={1} style={styles.recordTitle}>
                    扫描文档
                  </Text>
                  <Text style={styles.recordDate}>
                    {dateFormatter.format(new Date(record.updatedAt))}
                  </Text>
                  <Text style={styles.recordHint}>点击继续编辑或导出</Text>
                </View>
                <RoundIconButton
                  icon={Trash2}
                  label="删除扫描记录"
                  onPress={(event) => {
                    event.stopPropagation();
                    confirmDelete(record);
                  }}
                  size={40}
                  tone="danger"
                />
              </Pressable>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
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
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  localNotice: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radii.medium,
    backgroundColor: colors.sageSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  localNoticeText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  stateCopy: {
    color: colors.muted,
    fontSize: 14,
  },
  recordCard: {
    minHeight: 142,
    padding: 12,
    borderRadius: radii.large,
    backgroundColor: colors.paperStrong,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...shadows.floating,
  },
  recordCardPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
  coverWrap: {
    width: 86,
    height: 116,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  pageCount: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(37,35,31,0.78)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageCountText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  recordCopy: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  recordTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  recordDate: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 7,
  },
  recordHint: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 15,
  },
  emptyState: {
    paddingHorizontal: 26,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
  },
});
