import { ApiError } from "@/services/api.client";
import { useAuthStore } from "@/store/auth.store";
import { AppIcon, IoniconName } from "@/components/ui/Icon";
import { Colors, Radius, Spacing, Typography } from "@/theme";
import { router } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Backend error codes → friendly copy (guide §5). */
function authErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
        if (err.status === 401) return "Incorrect email or password.";
        if (err.status === 429) return "Too many attempts — please wait about 15 minutes and try again.";
        if (err.status === 400 && err.code === "VALIDATION_ERROR") {
            return err.fieldError() ?? "Please check the highlighted fields.";
        }
        if (err.isNetworkError) return "Can't reach the server — check your connection.";
        return err.message;
    }
    return "Login failed — please try again.";
}

function Field({
    label,
    icon,
    right,
    ...inputProps
}: {
    label: string;
    icon: IoniconName;
    right?: React.ReactNode;
} & React.ComponentProps<typeof TextInput>) {
    return (
        <View style={{ marginTop: 18 }}>
            <Text style={styles.inputLabel}>{label}</Text>
            <View style={styles.inputWrap}>
                <AppIcon name={icon} size={16} color={Colors.mid} style={{ marginRight: 10 }} />
                <TextInput
                    style={[styles.input, { paddingRight: right ? 34 : 0 }]}
                    placeholderTextColor={Colors.dim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    {...inputProps}
                />
                {right}
            </View>
        </View>
    );
}

export default function Login() {
    const login = useAuthStore((s) => s.login);

    const [form, setForm] = useState({ email: "", password: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    // Seconds remaining on a 429 rate-limit cooldown (from Retry-After).
    const [cooldown, setCooldown] = useState(0);

    // Countdown ticker for the 429 cooldown (guide §5: disable button + timer).
    React.useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const handleSubmit = async () => {
        if (cooldown > 0) return;
        const email = form.email.trim();
        if (!email || !form.password) return setError("Please fill in all fields");
        if (!EMAIL_RE.test(email)) return setError("Enter a valid email address");

        setLoading(true);
        setError("");
        try {
            await login(email, form.password);
            router.replace("/(tabs)/home");
        } catch (err) {
            setError(authErrorMessage(err));
            if (err instanceof ApiError && err.status === 429) {
                setCooldown(err.retryAfterSeconds ?? 15 * 60);
            }
        } finally {
            setLoading(false);
        }
    };

    // Social providers aren't wired on the backend yet (guide §21).
    const notAvailable = () => setError("Social sign-in is coming soon — use email for now.");

    return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Brand */}
                    <View style={styles.brandRow}>
                        <View style={styles.brandBadge}>
                            <AppIcon name="sparkles" size={22} color={Colors.black} />
                        </View>
                    </View>

                    <Text style={styles.header}>Welcome back</Text>
                    <Text style={styles.subhead}>Sign in to continue styling</Text>

                    <Field
                        label="Email Address"
                        icon="mail-outline"
                        placeholder="you@example.com"
                        keyboardType="email-address"
                        value={form.email}
                        onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
                        returnKeyType="next"
                    />

                    <Field
                        label="Password"
                        icon="lock-closed-outline"
                        placeholder="Your password"
                        secureTextEntry={!showPassword}
                        value={form.password}
                        onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
                        returnKeyType="done"
                        onSubmitEditing={handleSubmit}
                        right={
                            <TouchableOpacity
                                onPress={() => setShowPassword((v) => !v)}
                                style={styles.eyeBtn}
                                hitSlop={10}
                                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                            >
                                <AppIcon name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.mid} />
                            </TouchableOpacity>
                        }
                    />

                    {!!error && (
                        <View style={styles.errorBox}>
                            <AppIcon name="alert-circle-outline" size={15} color={Colors.error} style={{ marginRight: 6 }} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.cta, (loading || cooldown > 0) && { opacity: 0.55 }]}
                        onPress={handleSubmit}
                        disabled={loading || cooldown > 0}
                        accessibilityRole="button"
                    >
                        {loading ? (
                            <ActivityIndicator color={Colors.black} />
                        ) : cooldown > 0 ? (
                            <Text style={styles.ctaText}>
                                Try again in {Math.ceil(cooldown / 60)}m {cooldown % 60 > 0 ? `${cooldown % 60}s` : ""}
                            </Text>
                        ) : (
                            <>
                                <Text style={styles.ctaText}>Sign In</Text>
                                <AppIcon name="arrow-forward" size={16} color={Colors.black} style={{ marginLeft: 6 }} />
                            </>
                        )}
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerLabel}>OR</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* Social */}
                    <TouchableOpacity style={styles.socialBtn} activeOpacity={0.85} onPress={notAvailable}>
                        <AppIcon name={"logo-google" as IoniconName} size={17} color={Colors.text} style={{ marginRight: 10 }} />
                        <Text style={styles.socialText}>Continue with Google</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.socialBtn, styles.appleBtn]} activeOpacity={0.85} onPress={notAvailable}>
                        <AppIcon name={"logo-apple" as IoniconName} size={18} color="#000" style={{ marginRight: 10 }} />
                        <Text style={[styles.socialText, { color: "#000" }]}>Continue with Apple</Text>
                    </TouchableOpacity>

                    {/* Bottom */}
                    <View style={styles.bottomRow}>
                        <Text style={styles.bottomText}>Don’t have an account?</Text>
                        <TouchableOpacity onPress={() => router.push("/(auth)/register")} hitSlop={8}>
                            <Text style={styles.createLink}> Create Account</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    scroll: {
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xl,
    },
    brandRow: { alignItems: "center", marginBottom: Spacing.lg },
    brandBadge: {
        width: 52,
        height: 52,
        borderRadius: Radius.lg,
        backgroundColor: Colors.gold,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: Colors.gold,
        shadowOpacity: 0.45,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 0 },
        elevation: 10,
    },
    header: {
        fontSize: 30,
        fontFamily: Typography.serif,
        fontWeight: "600",
        color: Colors.text,
        textAlign: "center",
    },
    subhead: {
        fontSize: 14,
        color: Colors.mid,
        marginTop: 8,
        textAlign: "center",
    },
    inputLabel: {
        fontSize: 12,
        color: Colors.mid,
        fontWeight: "600",
        letterSpacing: 0.4,
        marginBottom: 8,
        textTransform: "uppercase",
    },
    inputWrap: {
        flexDirection: "row",
        alignItems: "center",
        borderColor: Colors.border,
        borderWidth: 1,
        borderRadius: Radius.md,
        backgroundColor: Colors.card,
        paddingHorizontal: Spacing.md,
        height: 52,
    },
    input: { flex: 1, fontSize: 15, color: Colors.text, height: "100%" },
    eyeBtn: { position: "absolute", right: 12 },
    errorBox: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(192,64,64,0.12)",
        borderWidth: 1,
        borderColor: "rgba(192,64,64,0.35)",
        borderRadius: Radius.sm,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: Spacing.md,
    },
    errorText: { color: Colors.error, fontSize: 13, flex: 1, lineHeight: 18 },
    cta: {
        marginTop: Spacing.lg,
        backgroundColor: Colors.gold,
        borderRadius: Radius.md,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        height: 52,
        shadowColor: Colors.gold,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },
    ctaText: { color: Colors.black, fontWeight: "700", fontSize: 16 },
    dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: Spacing.lg },
    dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
    dividerLabel: { marginHorizontal: 14, color: Colors.dim, fontWeight: "600", fontSize: 12, letterSpacing: 1 },
    socialBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 50,
        borderRadius: Radius.md,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 12,
    },
    appleBtn: { backgroundColor: Colors.cream, borderWidth: 0 },
    socialText: { color: Colors.text, fontWeight: "600", fontSize: 15 },
    bottomRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: Spacing.md,
    },
    bottomText: { color: Colors.mid, fontSize: 14 },
    createLink: { fontWeight: "700", fontSize: 14, color: Colors.gold },
});
