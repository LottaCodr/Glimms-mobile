/**
 * "Continue with Google / Apple".
 *
 * The provider gives the app an ID token; the API verifies it and signs the
 * user in (creating the account on first use). A provider that is not set up
 * for this build is not shown at all, rather than shown and broken.
 *
 *   Google: set EXPO_PUBLIC_GOOGLE_{IOS,ANDROID,WEB}_CLIENT_ID
 *   Apple:  iOS only; needs the "Sign in with Apple" capability
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Touchable } from "@/components/motion";
import { AppIcon, IoniconName } from "@/components/ui/Icon";
import { ApiError } from "@/services/api.client";
import { useAuthStore } from "@/store/auth.store";
import { ENV } from "@/config/env";
import { Colors, Radius } from "@/theme";

// Lets the browser tab that Google redirected hand its result back and close.
WebBrowser.maybeCompleteAuthSession();

type Props = {
    /** Called after the session is established. */
    onSignedIn: () => void;
    onError: (message: string) => void;
    disabled?: boolean;
};

function socialError(err: unknown, provider: string): string {
    if (err instanceof ApiError) {
        if (err.isNetworkError) return "Can't reach the server — check your connection.";
        if (err.status === 401) return `${provider} sign-in was not accepted. Please try again.`;
        if (err.status === 429) return "Too many attempts — please wait a few minutes and try again.";
        return err.message;
    }
    return `${provider} sign-in failed — please try again.`;
}

/** The Google client id this platform signs in with, if one is configured. */
export function googleClientIdForPlatform(): string | undefined {
    const { ios, android, web } = ENV.GOOGLE_CLIENT_IDS;
    return Platform.select({ ios, android, default: web });
}

function GoogleButton({ onSignedIn, onError, disabled }: Props) {
    const signIn = useAuthStore((s) => s.signInWithGoogle);
    const [busy, setBusy] = useState(false);
    const [request, , promptAsync] = Google.useIdTokenAuthRequest({
        iosClientId: ENV.GOOGLE_CLIENT_IDS.ios,
        androidClientId: ENV.GOOGLE_CLIENT_IDS.android,
        webClientId: ENV.GOOGLE_CLIENT_IDS.web,
    });

    const onPress = async () => {
        setBusy(true);
        try {
            const result = await promptAsync();
            if (result.type === "error") return onError("Google sign-in failed — please try again.");
            if (result.type !== "success") return; // dismissed or cancelled: not an error
            const idToken = result.params?.id_token ?? result.authentication?.idToken;
            if (!idToken) return onError("Google did not return a sign-in token. Please try again.");
            await signIn(idToken);
            onSignedIn();
        } catch (err) {
            onError(socialError(err, "Google"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Touchable
            style={[styles.button, (disabled || busy || !request) && styles.dimmed]}
            disabled={disabled || busy || !request}
            haptic="light"
            onPress={onPress}
            accessibilityLabel="Continue with Google"
        >
            {busy ? <ActivityIndicator color={Colors.text} /> : (
                <>
                    <AppIcon name={"logo-google" as IoniconName} size={17} color={Colors.text} style={styles.icon} />
                    <Text style={styles.text}>Continue with Google</Text>
                </>
            )}
        </Touchable>
    );
}

function AppleButton({ onSignedIn, onError, disabled }: Props) {
    const signIn = useAuthStore((s) => s.signInWithApple);
    const [available, setAvailable] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let mounted = true;
        AppleAuthentication.isAvailableAsync()
            .then((ok) => { if (mounted) setAvailable(ok); })
            .catch(() => {});
        return () => { mounted = false; };
    }, []);

    if (!available) return null;

    const onPress = async () => {
        setBusy(true);
        try {
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });
            if (!credential.identityToken) throw new Error("no identity token");
            const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
            await signIn(credential.identityToken, name || undefined);
            onSignedIn();
        } catch (err) {
            // The user closing Apple's sheet is not an error.
            if ((err as { code?: string } | null)?.code !== "ERR_REQUEST_CANCELED") onError(socialError(err, "Apple"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Touchable
            style={[styles.button, styles.apple, (disabled || busy) && styles.dimmed]}
            disabled={disabled || busy}
            haptic="light"
            onPress={onPress}
            accessibilityLabel="Continue with Apple"
        >
            {busy ? <ActivityIndicator color="#000" /> : (
                <>
                    <AppIcon name={"logo-apple" as IoniconName} size={18} color="#000" style={styles.icon} />
                    <Text style={[styles.text, { color: "#000" }]}>Continue with Apple</Text>
                </>
            )}
        </Touchable>
    );
}

/** Whether any social sign-in can be offered on this device and build. */
export function socialSignInAvailable(): boolean {
    return !!googleClientIdForPlatform() || Platform.OS === "ios";
}

/** The social buttons available on this build, preceded by `divider` when there are any. */
export function SocialButtons({ divider, ...props }: Props & { divider?: React.ReactNode }) {
    const google = !!googleClientIdForPlatform();
    const apple = Platform.OS === "ios";
    if (!google && !apple) return null;
    return (
        <View>
            {divider}
            {google && <GoogleButton {...props} />}
            {apple && <AppleButton {...props} />}
        </View>
    );
}

const styles = StyleSheet.create({
    button: {
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
    apple: { backgroundColor: Colors.cream, borderWidth: 0 },
    dimmed: { opacity: 0.55 },
    icon: { marginRight: 10 },
    text: { color: Colors.text, fontWeight: "600", fontSize: 15 },
});
