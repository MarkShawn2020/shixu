import type { ComponentType } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import type { LucideProps } from 'lucide-react-native';

import { colors, radii } from '../theme';

type IconComponent = ComponentType<LucideProps>;

type RoundIconButtonProps = Omit<PressableProps, 'children'> & {
  icon: IconComponent;
  label: string;
  tone?: 'light' | 'dark' | 'primary' | 'danger';
  size?: number;
  style?: ViewStyle;
};

export function RoundIconButton({
  icon: Icon,
  label,
  tone = 'light',
  size = 44,
  disabled,
  style,
  ...props
}: RoundIconButtonProps) {
  const foreground =
    tone === 'dark'
      ? colors.white
      : tone === 'primary'
        ? colors.white
        : tone === 'danger'
          ? colors.danger
          : colors.ink;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.roundButton,
        {
          width: size,
          height: size,
          backgroundColor:
            tone === 'dark'
              ? 'rgba(255,255,255,0.14)'
              : tone === 'primary'
                ? colors.primary
                : tone === 'danger'
                  ? '#F8E6E3'
                  : colors.paper,
          opacity: disabled ? 0.42 : pressed ? 0.72 : 1,
        },
        style,
      ]}
      {...props}
    >
      <Icon color={foreground} size={Math.round(size * 0.46)} strokeWidth={2} />
    </Pressable>
  );
}

type PrimaryButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  icon?: IconComponent;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet';
};

export function PrimaryButton({
  label,
  icon: Icon,
  loading,
  variant = 'primary',
  disabled,
  ...props
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const foreground =
    variant === 'primary' ? colors.white : variant === 'quiet' ? colors.muted : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.primaryButton,
        variant === 'primary' && styles.primaryButtonFilled,
        variant === 'secondary' && styles.primaryButtonSecondary,
        variant === 'quiet' && styles.primaryButtonQuiet,
        { opacity: isDisabled ? 0.45 : pressed ? 0.76 : 1 },
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : Icon ? (
        <Icon color={foreground} size={19} strokeWidth={2.2} />
      ) : null}
      <Text style={[styles.primaryButtonLabel, { color: foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

type Segment<T extends string> = {
  value: T;
  label: string;
};

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            key={segment.value}
            onPress={() => onChange(segment.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && { opacity: 0.72 },
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                selected && styles.segmentLabelSelected,
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  roundButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  primaryButton: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  primaryButtonFilled: {
    backgroundColor: colors.primary,
  },
  primaryButtonSecondary: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  primaryButtonQuiet: {
    backgroundColor: 'transparent',
  },
  primaryButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  segmented: {
    minHeight: 42,
    padding: 4,
    borderRadius: 13,
    flexDirection: 'row',
    backgroundColor: '#EDE5DA',
  },
  segment: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  segmentSelected: {
    backgroundColor: colors.paperStrong,
    shadowColor: '#2C2118',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  segmentLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentLabelSelected: {
    color: colors.ink,
  },
});
