/**
 * Glimms motion kit.
 *
 * Playful, physical motion in the spirit of the best learning apps: things
 * squash when pressed and spring back, screens assemble piece by piece,
 * progress fills rather than jumps, numbers count up, mistakes shake, and
 * wins get confetti. All of it is original to Glimms and built on Reanimated.
 *
 * Everything here respects the system "Reduce Motion" setting: movement is
 * dropped, haptics and final states stay.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    GestureResponderEvent,
    Pressable,
    PressableProps,
    StyleProp,
    StyleSheet,
    Text,
    TextProps,
    useWindowDimensions,
    View,
    ViewStyle,
} from "react-native";
import Animated, {
    Easing,
    FadeIn,
    FadeInDown,
    interpolate,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
    ZoomIn,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors } from "@/theme";

// ─── Feel ────────────────────────────────────────────────────────────────────

/** Shared spring settings so every surface moves like part of one object. */
export const Springs = {
    /** Finger down: quick, no wobble. */
    press: { damping: 22, stiffness: 420, mass: 0.6 },
    /** Finger up: overshoots slightly, then settles. */
    release: { damping: 9, stiffness: 260, mass: 0.6 },
    /** Things arriving on screen. */
    enter: { damping: 14, stiffness: 150, mass: 0.8 },
    /** Bars and meters filling. */
    fill: { damping: 18, stiffness: 110, mass: 1 },
} as const;

/** Delay between siblings in a staggered entrance. */
export const STAGGER_MS = 55;

export type HapticKind = "light" | "medium" | "select" | "success" | "warning" | "error";

/** Fire-and-forget haptic. Never throws (web and old devices have none). */
export function haptic(kind: HapticKind = "light"): void {
    const run = () => {
        switch (kind) {
            case "light": return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            case "medium": return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            case "select": return Haptics.selectionAsync();
            case "success": return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            case "warning": return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            case "error": return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    };
    try {
        void Promise.resolve(run()).catch(() => {});
    } catch {
        /* haptics unavailable */
    }
}

// ─── Touchable: springy press-down ───────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type TouchableProps = Omit<PressableProps, "style"> & {
    style?: StyleProp<ViewStyle>;
    /** Accepted for drop-in compatibility with TouchableOpacity: opacity while pressed. */
    activeOpacity?: number;
    /** How far it squashes while pressed (1 = not at all). */
    pressedScale?: number;
    /** Haptic on press. Off by default; buttons turn it on. */
    haptic?: HapticKind | false;
    /**
     * Makes it rise into place when it first appears; siblings given 0, 1, 2…
     * arrive one after another. Done in the same transform as the press
     * effect, so it adds no wrapper view and cannot disturb layout.
     */
    enterIndex?: number;
};

/**
 * Drop-in replacement for TouchableOpacity that squashes under the finger and
 * springs back on release.
 */
export function Touchable({
    style,
    activeOpacity = 0.85,
    pressedScale = 0.95,
    haptic: hapticKind = false,
    enterIndex,
    onPressIn,
    onPressOut,
    onPress,
    disabled,
    children,
    ...rest
}: TouchableProps) {
    const reduced = useReducedMotion();
    const pressed = useSharedValue(0);

    const enters = enterIndex !== undefined && !reduced;
    const appear = useSharedValue(enters ? 0 : 1);

    useEffect(() => {
        if (!enters) return;
        appear.set(withDelay(Math.min(enterIndex ?? 0, 12) * STAGGER_MS, withSpring(1, Springs.enter)));
        // Plays once, when the item first mounts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const animated = useAnimatedStyle(() => ({
        opacity: interpolate(pressed.value, [0, 1], [1, activeOpacity]) * Math.min(1, Math.max(0, appear.value * 1.6)),
        transform: [
            { translateY: (1 - appear.value) * 18 },
            { scale: reduced ? 1 : interpolate(pressed.value, [0, 1], [1, pressedScale]) },
        ],
    }));

    const handleIn = useCallback((event: GestureResponderEvent) => {
        pressed.set(withSpring(1, Springs.press));
        onPressIn?.(event);
    }, [onPressIn, pressed]);

    const handleOut = useCallback((event: GestureResponderEvent) => {
        pressed.set(withSpring(0, Springs.release));
        onPressOut?.(event);
    }, [onPressOut, pressed]);

    const handlePress = useCallback((event: GestureResponderEvent) => {
        if (hapticKind) haptic(hapticKind);
        onPress?.(event);
    }, [hapticKind, onPress]);

    return (
        <AnimatedPressable
            accessibilityRole="button"
            {...rest}
            disabled={disabled}
            onPressIn={handleIn}
            onPressOut={handleOut}
            onPress={onPress || hapticKind ? handlePress : undefined}
            style={[style, animated]}
        >
            {children as React.ReactNode}
        </AnimatedPressable>
    );
}

// ─── Enter: staggered screen entrances ───────────────────────────────────────

type EnterProps = {
    children: React.ReactNode;
    /** Position in the stagger: 0 arrives first. */
    index?: number;
    /** Extra delay before the stagger starts. */
    delay?: number;
    style?: StyleProp<ViewStyle>;
};

/** Slides up and fades in. Give siblings increasing `index` for a cascade. */
export function Enter({ children, index = 0, delay = 0, style }: EnterProps) {
    const reduced = useReducedMotion();
    const wait = delay + Math.min(index, 12) * STAGGER_MS;
    const entering = reduced
        ? FadeIn.duration(150)
        : FadeInDown.delay(wait).springify().damping(Springs.enter.damping).stiffness(Springs.enter.stiffness).mass(Springs.enter.mass);
    return <Animated.View entering={entering} style={style}>{children}</Animated.View>;
}

/** Wraps each child in an `Enter` with the next index. */
export function Stagger({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
    return (
        <>
            {React.Children.toArray(children).map((child, index) => (
                <Enter key={(child as React.ReactElement).key ?? index} index={index} delay={delay} style={style}>
                    {child}
                </Enter>
            ))}
        </>
    );
}

/** Pops in with a bounce: badges, checkmarks, awards. */
export function Pop({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
    const reduced = useReducedMotion();
    const entering = reduced ? FadeIn.duration(150) : ZoomIn.delay(delay).springify().damping(8).stiffness(180);
    return <Animated.View entering={entering} style={style}>{children}</Animated.View>;
}

// ─── ProgressBar: fills with a spring ────────────────────────────────────────

type ProgressBarProps = {
    /** 0..1 */
    progress: number;
    height?: number;
    color?: string;
    trackColor?: string;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
};

export function ProgressBar({
    progress,
    height = 10,
    color = Colors.gold,
    trackColor = "rgba(255,255,255,0.08)",
    style,
    accessibilityLabel = "Progress",
}: ProgressBarProps) {
    const reduced = useReducedMotion();
    const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const value = useSharedValue(0);

    useEffect(() => {
        value.set(reduced ? clamped : withSpring(clamped, Springs.fill));
    }, [clamped, reduced, value]);

    const fill = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, value.value)) * 100}%` }));

    return (
        <View
            style={[{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: "hidden" }, style]}
            accessibilityRole="progressbar"
            accessibilityLabel={accessibilityLabel}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
        >
            <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, fill]}>
                {/* The glossy highlight that makes the bar look rounded. */}
                <View style={[styles.gloss, { height: Math.max(2, height * 0.28), top: height * 0.2, borderRadius: height }]} />
            </Animated.View>
        </View>
    );
}

// ─── CountUp: numbers that roll to their value ───────────────────────────────

type CountUpProps = Omit<TextProps, "children"> & {
    value: number;
    durationMs?: number;
    format?: (value: number) => string;
};

/** Counts from the previous value to the new one, easing out. */
export function CountUp({ value, durationMs = 700, format = (n) => String(Math.round(n)), ...text }: CountUpProps) {
    const reduced = useReducedMotion();
    const target = Number.isFinite(value) ? value : 0;
    const [shown, setShown] = useState(reduced ? target : 0);
    const from = useRef(reduced ? target : 0);

    useEffect(() => {
        if (reduced || from.current === target) {
            from.current = target;
            setShown(target);
            return;
        }
        const start = Date.now();
        const origin = from.current;
        let frame: ReturnType<typeof requestAnimationFrame>;
        const tick = () => {
            const t = Math.min(1, (Date.now() - start) / durationMs);
            const eased = 1 - Math.pow(1 - t, 3);
            const current = origin + (target - origin) * eased;
            from.current = current;
            setShown(current);
            if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, durationMs, reduced]);

    return <Text {...text} accessibilityLabel={text.accessibilityLabel ?? format(target)}>{format(shown)}</Text>;
}

// ─── Shake: "that's not right" ───────────────────────────────────────────────

/**
 * `const { shakeStyle, shake } = useShake()` — put `shakeStyle` on an
 * `Animated.View` (or use `<Shakeable>`), call `shake()` on an error.
 */
export function useShake() {
    const reduced = useReducedMotion();
    const offset = useSharedValue(0);
    const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

    const shake = useCallback(() => {
        haptic("error");
        if (reduced) return;
        const step = (to: number) => withTiming(to, { duration: 55, easing: Easing.inOut(Easing.quad) });
        offset.set(withSequence(step(-10), step(10), step(-7), step(7), step(-3), step(0)));
    }, [offset, reduced]);

    return { shakeStyle, shake };
}

/** Shakes its children every time `trigger` changes to a new truthy value. */
export function Shakeable({ trigger, children, style }: { trigger: unknown; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    const { shakeStyle, shake } = useShake();
    const last = useRef<unknown>(null);
    useEffect(() => {
        if (trigger && trigger !== last.current) shake();
        last.current = trigger;
    }, [trigger, shake]);
    return <Animated.View style={[style, shakeStyle]}>{children}</Animated.View>;
}

// ─── Pulse: gentle "look here" ───────────────────────────────────────────────

/** Breathes slowly to draw the eye to the next thing to tap. */
export function Pulse({ children, active = true, style }: { children: React.ReactNode; active?: boolean; style?: StyleProp<ViewStyle> }) {
    const reduced = useReducedMotion();
    const scale = useSharedValue(1);
    useEffect(() => {
        scale.set(
            active && !reduced
                ? withRepeat(withSequence(withTiming(1.04, { duration: 900 }), withTiming(1, { duration: 900 })), -1, false)
                : withTiming(1, { duration: 150 }),
        );
    }, [active, reduced, scale]);
    const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

// ─── Confetti + Celebration ──────────────────────────────────────────────────

const CONFETTI_COLORS = [Colors.gold, "#F5E6C4", "#E8785A", "#7FB7A3", "#FFFFFF", "#D9A441"];

type Piece = { x: number; drift: number; delay: number; size: number; color: string; spin: number; fall: number; round: boolean };

function ConfettiPiece({ piece, height }: { piece: Piece; height: number }) {
    const t = useSharedValue(0);
    useEffect(() => {
        t.set(withDelay(piece.delay, withTiming(1, { duration: piece.fall, easing: Easing.out(Easing.quad) })));
    }, [piece, t]);
    const animated = useAnimatedStyle(() => ({
        opacity: interpolate(t.value, [0, 0.08, 0.8, 1], [0, 1, 1, 0]),
        transform: [
            { translateX: piece.x + piece.drift * t.value },
            { translateY: interpolate(t.value, [0, 1], [-30, height * 0.85]) },
            { rotate: `${piece.spin * t.value}deg` },
            { rotateX: `${piece.spin * 1.7 * t.value}deg` },
        ],
    }));
    return (
        <Animated.View
            style={[
                styles.piece,
                { width: piece.size, height: piece.round ? piece.size : piece.size * 0.45, borderRadius: piece.round ? piece.size : 2, backgroundColor: piece.color },
                animated,
            ]}
        />
    );
}

function makePieces(count: number, width: number): Piece[] {
    return Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 140,
        delay: Math.random() * 350,
        size: 7 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        spin: (Math.random() - 0.5) * 900,
        fall: 1500 + Math.random() * 1200,
        round: i % 4 === 0,
    }));
}

function ConfettiBurst({ count }: { count: number }) {
    const { width, height } = useWindowDimensions();
    // Random once per burst: a new burst is a new mount (see `key` below).
    const [pieces] = useState(() => makePieces(count, width));
    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {pieces.map((piece, i) => <ConfettiPiece key={i} piece={piece} height={height} />)}
        </View>
    );
}

/** A burst of confetti over its parent. Change `burstKey` to fire again. */
export function Confetti({ burstKey = 0, count = 42 }: { burstKey?: number | string; count?: number }) {
    const reduced = useReducedMotion();
    if (reduced) return null;
    return <ConfettiBurst key={burstKey} count={count} />;
}

type CelebrationProps = {
    visible: boolean;
    title: string;
    message?: string;
    /** Glyph shown in the badge. */
    emblem?: string;
    /** Called when the celebration has finished (or was tapped away). */
    onDone?: () => void;
    durationMs?: number;
};

/** Full-screen "you did it": confetti, a bouncing badge, a success haptic. */
export function Celebration({ visible, title, message, emblem = "✓", onDone, durationMs = 2200 }: CelebrationProps) {
    const done = useRef(onDone);
    useEffect(() => { done.current = onDone; }, [onDone]);

    useEffect(() => {
        if (!visible) return;
        haptic("success");
        const timer = setTimeout(() => done.current?.(), durationMs);
        return () => clearTimeout(timer);
    }, [visible, durationMs]);

    if (!visible) return null;
    return (
        <Animated.View entering={FadeIn.duration(180)} style={styles.celebration} accessibilityLiveRegion="polite">
            <Pressable style={styles.celebrationInner} onPress={() => done.current?.()} accessibilityRole="button" accessibilityLabel={`${title}. Tap to continue.`}>
                <Pop>
                    <View style={styles.badge}><Text style={styles.badgeGlyph}>{emblem}</Text></View>
                </Pop>
                <Enter index={2}><Text style={styles.celebrationTitle}>{title}</Text></Enter>
                {!!message && <Enter index={3}><Text style={styles.celebrationMessage}>{message}</Text></Enter>}
            </Pressable>
            <Confetti />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    gloss: { position: "absolute", left: 6, right: 6, backgroundColor: "rgba(255,255,255,0.28)" },
    piece: { position: "absolute", top: 0, left: 0 },
    celebration: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,10,10,0.92)", zIndex: 1000, elevation: 1000 },
    celebrationInner: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    badge: {
        width: 104, height: 104, borderRadius: 52, backgroundColor: Colors.gold,
        alignItems: "center", justifyContent: "center", marginBottom: 24,
        shadowColor: Colors.gold, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    },
    badgeGlyph: { fontSize: 52, color: Colors.black, fontWeight: "800" },
    celebrationTitle: { fontSize: 26, fontWeight: "700", color: Colors.text, textAlign: "center" },
    celebrationMessage: { fontSize: 15, color: Colors.mid, textAlign: "center", marginTop: 10, lineHeight: 22 },
});
