import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ExternalLink,
  GitFork,
  LifeBuoy,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii } from '../theme';
import { RoundIconButton } from './Controls';

const links = [
  {
    icon: ShieldCheck,
    label: '隐私政策',
    detail: '查看手工川工作室隐私政策',
    url: 'https://lovstudio.ai/privacy',
  },
  {
    icon: LifeBuoy,
    label: '技术支持',
    detail: '反馈问题或提出功能建议',
    url: 'https://github.com/MarkShawn2020/shixu/issues',
  },
  {
    icon: GitFork,
    label: '开源代码',
    detail: '查看源码、版本记录与许可证',
    url: 'https://github.com/MarkShawn2020/shixu',
  },
] as const;

async function openExternalUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('链接打开失败', '请稍后重新尝试。');
  }
}

export function AboutPanel({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>本地扫描工具</Text>
            <Text style={styles.title}>关于拾序</Text>
          </View>
          <RoundIconButton icon={X} label="关闭关于拾序" onPress={onClose} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Image
              accessibilityIgnoresInvertColors
              source={require('../../assets/logo.png')}
              style={styles.logo}
            />
            <View style={styles.heroCopy}>
              <Text style={styles.productName}>拾序</Text>
              <Text style={styles.tagline}>
                把随手拍下的纸张，整理成规整、清晰、可归档的文档。
              </Text>
            </View>
          </View>

          <View style={styles.privacyCard}>
            <View style={styles.privacyHeading}>
              <ShieldCheck color={colors.sage} size={22} />
              <Text style={styles.privacyTitle}>文档始终留在本机</Text>
            </View>
            <Text style={styles.privacyBody}>
              拾序没有账号系统、广告或分析 SDK。拍摄、几何校正、图像增强、
              扫描历史与 PDF 生成均在这台设备上完成。只有当你主动使用系统分享
              或保存功能时，文件才会进入你选择的位置。
            </Text>
          </View>

          <View style={styles.linkList}>
            {links.map(({ icon: Icon, label, detail, url }) => (
              <Pressable
                accessibilityHint={detail}
                accessibilityLabel={label}
                accessibilityRole="link"
                key={url}
                onPress={() => void openExternalUrl(url)}
                style={({ pressed }) => [
                  styles.linkRow,
                  pressed && styles.linkRowPressed,
                ]}
              >
                <View style={styles.linkIcon}>
                  <Icon color={colors.primaryDark} size={21} />
                </View>
                <View style={styles.linkCopy}>
                  <Text style={styles.linkLabel}>{label}</Text>
                  <Text style={styles.linkDetail}>{detail}</Text>
                </View>
                <ExternalLink color={colors.muted} size={18} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.footer}>
            由手工川工作室制作 · MIT 开源
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 74,
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
  title: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: '800',
    marginTop: 3,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 20,
  },
  hero: {
    padding: 20,
    borderRadius: radii.large,
    backgroundColor: colors.paperStrong,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 19,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  productName: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  tagline: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  privacyCard: {
    padding: 18,
    borderRadius: radii.large,
    backgroundColor: colors.sageSoft,
    gap: 10,
  },
  privacyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  privacyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  privacyBody: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 22,
  },
  linkList: {
    overflow: 'hidden',
    borderRadius: radii.large,
    backgroundColor: colors.paperStrong,
    borderWidth: 1,
    borderColor: colors.line,
  },
  linkRow: {
    minHeight: 76,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  linkRowPressed: {
    backgroundColor: colors.paper,
  },
  linkIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkCopy: {
    flex: 1,
    gap: 3,
  },
  linkLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  linkDetail: {
    color: colors.muted,
    fontSize: 12,
  },
  footer: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});
