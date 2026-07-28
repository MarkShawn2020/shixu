import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FileImage, FileText, ShieldCheck, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createPdf,
  savePagesAsImages,
  sharePdf,
} from '../lib/exportDocuments';
import { colors, radii } from '../theme';
import type { ScanPage } from '../types';
import {
  PrimaryButton,
  RoundIconButton,
  SegmentedControl,
} from './Controls';

type ExportFormat = 'pdf' | 'images';

const formatSegments: { value: ExportFormat; label: string }[] = [
  { value: 'pdf', label: '多页 PDF' },
  { value: 'images', label: '图片' },
];

const defaultName = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `手工川扫描-${year}-${month}-${day}`;
};

export function ExportPanel({
  pages,
  visible,
  onClose,
}: {
  pages: ScanPage[];
  visible: boolean;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [filename, setFilename] = useState(defaultName);
  const [watermark, setWatermark] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (!visible) setProgress('');
  }, [visible]);

  const runExport = async () => {
    setExporting(true);
    try {
      if (format === 'images') {
        await savePagesAsImages(pages, watermark, (_, __, label) =>
          setProgress(label),
        );
        Alert.alert(
          '图片已保存',
          `${pages.length} 张扫描图片已写入系统相册。`,
          [{ text: '完成', onPress: onClose }],
        );
        return;
      }

      const uri = await createPdf(
        pages,
        filename,
        watermark,
        (_, __, label) => setProgress(label),
      );
      setProgress('PDF 已生成，正在打开分享');
      const shared = await sharePdf(uri);
      if (!shared) {
        Alert.alert('PDF 已生成', '文件已保存在应用缓存目录中。', [
          { text: '完成', onPress: onClose },
        ]);
      }
    } catch (error) {
      Alert.alert(
        '导出没有完成',
        error instanceof Error ? error.message : '请稍后再试',
      );
    } finally {
      setExporting(false);
      setProgress('');
    }
  };

  const buttonLabel =
    format === 'pdf'
      ? `生成并分享 ${pages.length} 页 PDF`
      : `保存 ${pages.length} 张图片到相册`;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>最后一步</Text>
              <Text style={styles.title}>导出扫描文件</Text>
            </View>
            <RoundIconButton icon={X} label="关闭导出" onPress={onClose} />
          </View>

          <View style={styles.previewStrip}>
            {pages.slice(0, 4).map((page, index) => (
              <View
                key={page.id}
                style={[
                  styles.previewPage,
                  {
                    transform: [
                      { rotate: `${(index - 1.5) * 2.3}deg` },
                      { translateX: index * -8 },
                    ],
                    zIndex: pages.length - index,
                  },
                ]}
              >
                <Image
                  resizeMode="cover"
                  source={{ uri: page.processedUri ?? page.originalUri }}
                  style={styles.previewImage}
                />
              </View>
            ))}
            <View style={styles.pageCount}>
              <Text style={styles.pageCountText}>{pages.length} 页</Text>
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>输出格式</Text>
              <SegmentedControl
                onChange={setFormat}
                segments={formatSegments}
                value={format}
              />
              <Text style={styles.supporting}>
                {format === 'pdf'
                  ? '按当前顺序合成 A4 多页 PDF，并打开系统分享。'
                  : '每页保存为一张高清 JPEG 图片。'}
              </Text>
            </View>

            {format === 'pdf' && (
              <View style={styles.field}>
                <Text style={styles.label}>文件名</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setFilename}
                  placeholder="扫描文件"
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.primary}
                  style={styles.input}
                  value={filename}
                />
              </View>
            )}

            <View style={styles.watermarkRow}>
              <View style={styles.watermarkIcon}>
                <Image
                  resizeMode="contain"
                  source={require('../../assets/brand/shougongchuan-logo.png')}
                  style={styles.watermarkLogo}
                />
              </View>
              <View style={styles.watermarkCopy}>
                <Text style={styles.watermarkTitle}>手工川工作室水印</Text>
                <Text style={styles.supporting}>
                  默认加在每页右下角，保持轻量透明。
                </Text>
              </View>
              <Switch
                ios_backgroundColor={colors.lineStrong}
                onValueChange={setWatermark}
                thumbColor={colors.white}
                trackColor={{
                  false: colors.lineStrong,
                  true: colors.primary,
                }}
                value={watermark}
              />
            </View>

            <View style={styles.privacyRow}>
              <ShieldCheck color={colors.sage} size={18} />
              <Text style={styles.privacyText}>
                几何校正、提亮、水印与 PDF 均在这台手机本地完成。
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            {progress ? <Text style={styles.progress}>{progress}</Text> : null}
            <PrimaryButton
              icon={format === 'pdf' ? FileText : FileImage}
              label={buttonLabel}
              loading={exporting}
              onPress={() => void runExport()}
            />
            <Pressable
              disabled={exporting}
              onPress={onClose}
              style={styles.cancel}
            >
              <Text style={styles.cancelLabel}>返回继续调整</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: '800',
    marginTop: 2,
  },
  previewStrip: {
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  previewPage: {
    width: 98,
    height: 132,
    padding: 5,
    marginHorizontal: -22,
    backgroundColor: colors.white,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.13,
    shadowRadius: 8,
    elevation: 4,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.paper,
  },
  pageCount: {
    position: 'absolute',
    right: 28,
    bottom: 22,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  pageCountText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  form: {
    paddingHorizontal: 20,
    gap: 22,
  },
  field: {
    gap: 9,
  },
  label: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  supporting: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperStrong,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  watermarkRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  watermarkIcon: {
    width: 62,
    height: 48,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermarkLogo: {
    width: 50,
    height: 25,
  },
  watermarkCopy: {
    flex: 1,
  },
  watermarkTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.sageSoft,
  },
  privacyText: {
    flex: 1,
    color: '#526249',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  footer: {
    marginTop: 'auto',
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 8,
  },
  progress: {
    color: colors.primaryDark,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  cancel: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
