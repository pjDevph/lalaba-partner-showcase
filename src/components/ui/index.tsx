// Lalaba Merchant — Shared UI Primitives
// Mirrors customer app design system in React Native

import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, SHADOW, RADIUS, SP, COMP } from "../../theme/tokens";

// ─── Card ────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
  elevation?: keyof typeof SHADOW;
  onPress?: () => void;
  /** Left accent stripe color (3px wide, per design spec) */
  accentColor?: string;
}
export function Card({ children, style, padding = 16, elevation = "sm", onPress, accentColor }: Readonly<CardProps>) {
  const inner = (
    <View
      style={[
        {
          backgroundColor: C.white,
          borderRadius: RADIUS.lg,
          padding,
          borderWidth: 1,
          borderColor: C.gray100,
          overflow: "hidden",
          position: "relative",
          ...SHADOW[elevation],
        },
        style,
      ]}
    >
      {accentColor && (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: accentColor,
          }}
        />
      )}
      {children}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

// ─── Metric Card ─────────────────────────────────────────────────────────────
interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  tint?: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
}
export function MetricCard({ label, value, sub, tint, icon, style }: Readonly<MetricCardProps>) {
  return (
    <Card elevation="sm" padding={16} style={[{ flex: 1 }, style] as any}>
      {icon && (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: RADIUS.sm,
            backgroundColor: tint ?? C.brand100,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          {icon}
        </View>
      )}
      <Text style={{ fontSize: 22, fontWeight: "800", color: C.gray900, letterSpacing: -0.5 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{label}</Text>
      {sub ? (
        <Text style={{ fontSize: 11, color: C.success700, marginTop: 4, fontWeight: "600" }}>
          {sub}
        </Text>
      ) : null}
    </Card>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "secondary" | "ghost" | "soft" | "destructive" | "outline";
type BtnSize = "sm" | "md" | "lg";

interface BtnProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Btn({
  children,
  onPress,
  variant = "primary",
  size = "lg",
  disabled,
  loading,
  full,
  style,
  textStyle,
}: Readonly<BtnProps>) {
  const SIZE_HEIGHT: Record<string, number> = { sm: 36, md: 44, lg: 52 };
  const SIZE_FONT:   Record<string, number> = { sm: 13, md: 14, lg: 16 };
  const height   = SIZE_HEIGHT[size] ?? 52;
  const fontSize = SIZE_FONT[size]   ?? 16;
  // Customer app standard: lg CTAs use RADIUS.lg (16), smaller use RADIUS.md (12)
  const radius = size === "lg" ? RADIUS.lg : RADIUS.md;

  const variantStyles: Record<BtnVariant, { bg: string; color: string; border?: string }> = {
    primary:     { bg: C.brand500, color: C.white },
    secondary:   { bg: C.white, color: C.brand600, border: C.brand500 },
    ghost:       { bg: "transparent", color: C.brand600 },
    soft:        { bg: C.brand100, color: C.brand700 },
    destructive: { bg: C.error500, color: C.white },
    outline:     { bg: C.white, color: C.gray700, border: C.gray300 },
  };

  const vs = variantStyles[variant];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        {
          height,
          borderRadius: radius,
          backgroundColor: vs.bg,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
          borderWidth: vs.border ? 1.5 : 0,
          borderColor: vs.border ?? "transparent",
          opacity: isDisabled ? 0.5 : 1,
          ...(full ? { width: "100%" as any } : {}),
          ...(variant === "primary" ? SHADOW.brand : {}),
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={vs.color} size="small" />
      ) : (
        <Text
          style={[
            { fontSize, fontWeight: "700", color: vs.color, letterSpacing: -0.1 },
            textStyle,
          ]}
        >
          {children as string}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Chip / Badge ─────────────────────────────────────────────────────────────
type ChipVariant = "brand" | "brandSolid" | "success" | "warning" | "error" | "gray" | "accent" | "info" | "purple";

interface ChipProps {
  children: string;
  variant?: ChipVariant;
  size?: "sm" | "md";
  dot?: boolean;
}

export function Chip({ children, variant = "brand", size = "md", dot }: Readonly<ChipProps>) {
  const map: Record<ChipVariant, [string, string]> = {
    brand:      [C.brand100,   C.brand700],
    brandSolid: [C.brand500,   C.white],
    success:    [C.success100, C.success700],
    warning:    [C.warning100, C.warning700],
    error:      [C.error100,   C.error700],
    gray:       [C.gray100,    C.gray700],
    accent:     [C.accent100,  C.accent700],
    info:       [C.info100,    C.info500],
    purple:     [C.purple100,  C.purple700],
  };
  const [bg, fg] = map[variant];
  const fontSize = size === "sm" ? 10 : 11.5;
  const paddingH = size === "sm" ? 7 : 10;
  const paddingV = size === "sm" ? 3 : 4;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: bg,
        paddingHorizontal: paddingH,
        paddingVertical: paddingV,
        borderRadius: RADIUS.full,
        alignSelf: "flex-start",
        gap: 4,
      }}
    >
      {dot && (
        <View
          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }}
        />
      )}
      <Text numberOfLines={1} style={{ fontSize, fontWeight: "700", color: fg, letterSpacing: 0.2 }}>
        {children}
      </Text>
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
interface SectionHeadProps {
  title: string;
  action?: string;
  onAction?: () => void;
}
export function SectionHead({ title, action, onAction }: Readonly<SectionHeadProps>) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: C.gray900, letterSpacing: -0.2 }}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.brand500 }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────
export function Divider({ color = C.gray100, style }: Readonly<{ color?: string; style?: ViewStyle }>) {
  return <View style={[{ height: 1, backgroundColor: color }, style]} />;
}

// ─── Screen Header ───────────────────────────────────────────────────────────
interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}
export function ScreenHeader({ title, subtitle, right }: Readonly<ScreenHeaderProps>) {
  return (
    <View style={{ backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View
        style={{
          maxWidth: 880,
          width: "100%",
          alignSelf: "center",
          paddingHorizontal: 20,
          paddingVertical: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: C.gray900, letterSpacing: -0.4 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{subtitle}</Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}
export function EmptyState({ title, description, action, onAction }: Readonly<EmptyStateProps>) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: C.brand100,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      />
      <Text style={{ fontSize: 16, fontWeight: "700", color: C.gray900, textAlign: "center" }}>{title}</Text>
      {description ? (
        <Text style={{ fontSize: 13, color: C.gray500, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
          {description}
        </Text>
      ) : null}
      {action && (
        <Btn variant="primary" size="md" onPress={onAction} style={{ marginTop: 20, paddingHorizontal: 24 }}>
          {action}
        </Btn>
      )}
    </View>
  );
}

// ─── Status Banner ───────────────────────────────────────────────────────────
// Full-width colored strip matching customer app order status colors
// Usage: <StatusBanner status="CREATED" label="New Order" />
const STATUS_BANNER_CONF: Record<string, { bg: string; border: string; textColor: string; dot: string }> = {
  CREATED:          { bg: C.warning100, border: C.warning500, textColor: C.warning700, dot: C.warning500 },
  PROCESSING:       { bg: C.info100,    border: C.info500,    textColor: C.info500,    dot: C.info500 },
  READY_FOR_PICKUP: { bg: C.brand100,   border: C.brand500,   textColor: C.brand700,   dot: C.brand500 },
  CLAIMED:          { bg: C.success100, border: C.success500, textColor: C.success700, dot: C.success500 },
};

interface StatusBannerProps {
  status: string;
  label?: string;
  sub?: string;
  style?: ViewStyle;
}
export function StatusBanner({ status, label, sub, style }: Readonly<StatusBannerProps>) {
  const conf = STATUS_BANNER_CONF[status] ?? { bg: C.gray100, border: C.gray300, textColor: C.gray700, dot: C.gray400 };
  const displayLabel = label ?? status.replaceAll("_", " ");
  return (
    <View
      style={[
        {
          backgroundColor: conf.bg,
          borderWidth: 1,
          borderColor: conf.border,
          borderRadius: RADIUS.md,
          paddingVertical: SP._12,
          paddingHorizontal: SP._16,
          flexDirection: "row",
          alignItems: "center",
          gap: SP._8,
        },
        style,
      ]}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: conf.dot }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: conf.textColor }}>{displayLabel}</Text>
        {sub ? (
          <Text style={{ fontSize: 11, color: conf.textColor, opacity: 0.75, marginTop: 2 }}>{sub}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── FormField ────────────────────────────────────────────────────────────────
// Reusable customer-app–styled text input with label and focus ring

interface FormFieldProps extends Omit<TextInputProps, "style"> {
  label?: string;
  hint?: string;
  containerStyle?: ViewStyle;
  inputStyle?: ViewStyle;
}
export function FormField({ label, hint, containerStyle, inputStyle, ...rest }: Readonly<FormFieldProps>) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={[{ marginBottom: SP._16 }, containerStyle]}>
      {label ? (
        <Text style={COMP.fieldLabel}>{label}</Text>
      ) : null}
      <TextInput
        style={[
          COMP.field as any,
          focused && COMP.fieldFocused as any,
          inputStyle,
        ]}
        placeholderTextColor={C.gray400}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      {hint ? (
        <Text style={{ fontSize: 11, color: C.gray500, marginTop: 4 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ─── Row Item ────────────────────────────────────────────────────────────────
interface RowItemProps {
  left?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  divider?: boolean;
}
export function RowItem({ left, title, subtitle, right, onPress, style, divider }: Readonly<RowItemProps>) {
  const inner = (
    <View>
      <View style={[{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }, style]}>
        {left}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.gray900 }} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {divider ? <View style={{ height: 1, backgroundColor: C.gray100, marginHorizontal: -4 }} /> : null}
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  }
  return inner;
}

// ─── HeroStat pill ────────────────────────────────────────────────────────────
// Used inside HeroHeader: white pill with label + value
interface HeroStatProps {
  label: string;
  value: string;
  sub?: string;
}
export function HeroStat({ label, value, sub }: Readonly<HeroStatProps>) {
  return (
    <View style={{
      backgroundColor: "rgba(255,255,255,0.18)",
      borderRadius: RADIUS.md,
      paddingHorizontal: SP._12,
      paddingVertical: SP._8,
      flex: 1,
      alignItems: "center",
    }}>
      <Text style={{ fontSize: 18, fontWeight: "800", color: C.white, letterSpacing: -0.4 }}>{value}</Text>
      <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 1, fontWeight: "600" }}>{label}</Text>
      {sub ? <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}

// ─── HeroHeader ───────────────────────────────────────────────────────────────
// Brand gradient header with SVG wave bottom edge + optional stat pills
// Design: brand500→brand700 at 135°, wave reveals white background below
interface HeroHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  left?: React.ReactNode;
  stats?: HeroStatProps[];
  children?: React.ReactNode;
  onBack?: () => void;
  compact?: boolean;
  /** @deprecated The decorative wave is gone; this now only nudges padding. */
  noWave?: boolean;
}
export function HeroHeader({ title, subtitle, right, left, stats, children, onBack, compact = false, noWave = false }: Readonly<HeroHeaderProps>) {
  // `noWave` survives only as a spacing hint — there is no wave any more.
  const padBottomWithStats = stats ? SP._20 : SP._32;
  const padBottomNoWave = compact ? SP._12 : SP._20;
  const padBottomWithWave = compact ? SP._8 : padBottomWithStats;
  const padBottom = noWave ? padBottomNoWave : padBottomWithWave;
  // Plain white, like every other header in the app. The brand-blue fill (and
  // the wave that used to break it into the page below) is gone: headers were
  // split three ways — blue chrome, white chrome, and no header at all — with
  // no rule behind which screen got which. One treatment everywhere.
  return (
    <View style={{ backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View style={{ maxWidth: 880, width: "100%", alignSelf: "center", paddingHorizontal: SP._20, paddingTop: compact ? SP._12 : SP._16, paddingBottom: padBottom }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          {left}
          {!left && onBack && (
            <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: SP._12, marginTop: 4 }}>
              <Ionicons name="chevron-back" size={22} color={C.gray700} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: C.gray900, letterSpacing: -0.5 }}>{title}</Text>
            {subtitle ? <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
        {stats && (
          <View style={{ flexDirection: "row", gap: SP._8, marginTop: SP._12 }}>
            {stats.map((s) => <HeroStat key={s.label} {...s} />)}
          </View>
        )}
        {children}
      </View>

    </View>
  );
}

// ─── ShiftBanner ─────────────────────────────────────────────────────────────
// success100 strip (shift open) or warning100 strip (no active shift)
interface ShiftBannerProps {
  open: boolean;
  staffName?: string;
  openedAt?: string;
  onPress?: () => void;
}
export function ShiftBanner({ open, staffName, openedAt, onPress }: Readonly<ShiftBannerProps>) {
  const bg = open ? C.success100 : C.warning100;
  const border = open ? C.success500 : C.warning500;
  const text = open ? C.success700 : C.warning700;
  const staffSuffix   = staffName ? ` · ${staffName}` : "";
  const openedSuffix  = openedAt  ? ` · ${openedAt}`  : "";
  const label = open
    ? `Shift open${staffSuffix}${openedSuffix}`
    : "No active shift — tap to start";
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: bg,
        borderBottomWidth: 1,
        borderBottomColor: border,
        paddingHorizontal: SP._16,
        paddingVertical: SP._10,
        flexDirection: "row",
        alignItems: "center",
        gap: SP._8,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: border }} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: text, flex: 1 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Segments ────────────────────────────────────────────────────────────────
// Pill-style tab switcher (e.g. Terminal / Queue / Claim)
interface SegmentsProps<T extends string> {
  options: readonly { readonly value: T; readonly label: string; readonly badge?: number }[];
  value: T;
  onChange: (v: T) => void;
  style?: ViewStyle;
}
export function Segments<T extends string>({ options, value, onChange, style }: Readonly<SegmentsProps<T>>) {
  return (
    <View style={[{
      flexDirection: "row",
      backgroundColor: C.gray100,
      borderRadius: RADIUS.lg,
      padding: 3,
    }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            activeOpacity={0.7}
            style={{
              flex: 1,
              paddingVertical: SP._8,
              borderRadius: RADIUS.md,
              backgroundColor: active ? C.white : "transparent",
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 4,
              ...(active ? SHADOW.sm : {}),
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: active ? "700" : "500", color: active ? C.gray900 : C.gray500 }}>
              {o.label}
            </Text>
            {o.badge != null && o.badge > 0 && (
              <View style={{ backgroundColor: C.warning500, borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: C.white }}>{o.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
// Shimmer placeholder for loading states
interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}
export function Skeleton({ width = "100%", height = 14, radius = RADIUS.sm, style }: Readonly<SkeletonProps>) {
  return (
    <View style={[{ width: width as any, height, borderRadius: radius, backgroundColor: C.gray200 }, style]} />
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
// White navigation bar with back button + title + optional right action
interface TopBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /**
   * @deprecated No-op. Headers are a single plain-white treatment app-wide so
   * every screen reads as one surface; this prop is kept only so the many
   * existing call sites keep compiling. Do not add new uses.
   */
  blue?: boolean;
  /** Larger hero-style title (22px/800) to match HeroHeader, e.g. for Settings sub-pages. */
  large?: boolean;
  /** Override the title font size (still 800 weight when `large` is set) — e.g. 19 to match POSHeader. */
  titleSize?: number;
}
export function TopBar({ title, subtitle, onBack, right, blue: _blue, large = false, titleSize }: Readonly<TopBarProps>) {
  const titleColor = C.gray900;
  const subColor   = C.gray500;
  const chevron    = C.gray700;
  const resolvedTitleSize = titleSize ?? (large ? 22 : 16);
  return (
    <View style={{ backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
      <View style={{
        maxWidth: 880,
        width: "100%",
        alignSelf: "center",
        paddingHorizontal: SP._16,
        paddingVertical: large ? SP._16 : SP._12,
        flexDirection: "row",
        alignItems: "center",
        gap: SP._12,
      }}>
        {onBack && (
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={large ? 22 : 20} color={chevron} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: resolvedTitleSize, fontWeight: large ? "800" : "700", color: titleColor, letterSpacing: large ? -0.5 : 0 }}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: 12, color: subColor, marginTop: large ? 2 : 1 }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}
