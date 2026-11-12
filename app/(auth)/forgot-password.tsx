/**
 * Forgot password: emails a link that opens a page where the user chooses a
 * new password. The reply is the same whether or not the address has an
 * account, so this screen never reveals who is registered.
 */
import React, { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Enter, Pop, Shakeable, Touchable, haptic } from "@/components/motion";
import { AppIcon } from "@/components/ui/Icon";
import { ApiError } from "@/services/api.client";
import { requestPasswordReset } from "@/services/auth.services";
import { Colors, Radius, Spacing, Typography } from "@/theme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [errorCount, setErrorCount] = useState(0);
    const [sentTo, setSentTo] = useState<string | null>(null);

    const fail = (message: string) => {
        setError(message);
        setErrorCount((n) => n + 1);
    };

    const submit = async () => {
        const address = email.trim();
        if (!EMAIL_RE.test(address)) return fail("Enter a valid email address");
        setLoading(true);
        setError("");
        try {
            await requestPasswordReset(address);
            haptic("success");
            setSentTo(address);
        } catch (err) {
            if (err instanceof ApiError && err.status === 429) fail("Too many requests — please wait a few minutes and try again.");
            else if (err instanceof ApiError && err.isNetworkError) fail("Can't reach the server — check your connection.");
            else fail("Something went wrong — please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <Touchable onPress={() => router.back()} style={styles.back} hitSlop={10} accessibilityLabel="Back">
                        <AppIcon name="chevron-back" size={22} color={Colors.text} />
                    </Touchable>

                    {sentTo ? (
                        <View style={styles.center}>
                            <Pop>
                                <View style={styles.badge}>
                                    <AppIcon name="mail-outline" size={36} color={Colors.black} />
                                </View>
                            </Pop>
                            <Enter index={1}><Text style={styles.header}>Check your inbox</Text></Enter>
                            <Enter index={2}>
                                <Text style={[styles.subhead, { textAlign: "center" }]}>
                                    If an account exists for {sentTo}, a link to choose a new password is on its way.
                                    It works for 30 minutes.
                                </Text>
                            </Enter>
                            <Enter index={3} style={{ alignSelf: "stretch" }}>
                                <Touchable style={styles.cta} haptic="light" onPress={() => router.replace("/(auth)/login")}>
                                    <Text style={styles.ctaText}>Back to sign in</Text>
                                </Touchable>
                                <Touchable style={styles.secondary} onPress={() => setSentTo(null)}>
                                    <Text style={styles.secondaryText}>Use a different email</Text>
                                </Touchable>
                            </Enter>
                        </View>
                    ) : (
                        <>
                            <Enter index={0}><Text style={styles.header}>Forgot your password?</Text></Enter>
                            <Enter index={1}>
                                <Text style={styles.subhead}>
                                    {"Enter your email and we'll send you a link to choose a new one."}
                                </Text>
                            </Enter>

                            <Enter index={2}>
                                <Shakeable trigger={errorCount}>
                                    <Text style={styles.inputLabel}>Email Address</Text>
                                    <View style={[styles.inputWrap, !!error && { borderColor: Colors.error }]}>
                                        <AppIcon name="mail-outline" size={16} color={Colors.mid} style={{ marginRight: 10 }} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="you@example.com"
                                            placeholderTextColor={Colors.dim}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            autoComplete="email"
                                            keyboardType="email-address"
                                            value={email}
                                            onChangeText={setEmail}
                                            returnKeyType="send"
                                            onSubmitEditing={submit}
                                            accessibilityLabel="Email address"
                                        />
                                    </View>
                                </Shakeable>
                                {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
                            </Enter>

                            <Enter index={3}>
                                <Touchable style={[styles.cta, loading && { opacity: 0.55 }]} haptic="light" onPress={submit} disabled={loading}>
                                    {loading ? <ActivityIndicator color={Colors.black} /> : <Text style={styles.ctaText}>Send reset link</Text>}
                                </Touchable>
                            </Enter>
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    scroll: { flexGrow: 1, padding: Spacing.lg },
    back: { width: 40, height: 40, justifyContent: "center", marginBottom: Spacing.lg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
    badge: {
        width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.gold,
        alignItems: "center", justifyContent: "center", marginBottom: Spacing.lg,
    },
    header: { fontSize: 30, fontFamily: Typography.serif, color: Colors.text, fontWeight: "300" },
    subhead: { fontSize: 14, color: Colors.mid, marginTop: 8, lineHeight: 21 },
    inputLabel: { fontSize: 12, color: Colors.mid, marginTop: 28, marginBottom: 8, fontWeight: "600" },
    inputWrap: {
        flexDirection: "row", alignItems: "center", height: 52, borderRadius: Radius.md,
        backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14,
    },
    input: { flex: 1, color: Colors.text, fontSize: 15 },
    errorText: { color: Colors.error, fontSize: 13, marginTop: 10 },
    cta: {
        height: 52, borderRadius: Radius.md, backgroundColor: Colors.gold,
        alignItems: "center", justifyContent: "center", marginTop: Spacing.lg,
    },
    ctaText: { color: Colors.black, fontWeight: "700", fontSize: 16 },
    secondary: { alignItems: "center", padding: 14 },
    secondaryText: { color: Colors.mid, fontSize: 14 },
});
