import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = "google" | "apple";

/**
 * Performs PKCE OAuth with Supabase Auth on both Web and Native (iOS/Android),
 * returning the verified Supabase access_token to exchange with backend/api.
 */
export async function signInWithSupabaseOAuth(provider: SocialProvider): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Supabase Auth is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const redirectTo =
    Platform.OS === "web" && typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : Linking.createURL("auth/callback");

  if (Platform.OS === "web") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });
    if (error) throw error;
    // Web redirects away; session is resolved on callback.
    return "";
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });

  if (error || !data?.url) {
    throw error ?? new Error("Failed to start Supabase OAuth flow.");
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) {
    throw new Error("Social sign-in was cancelled.");
  }

  const parsed = Linking.parse(result.url);
  const code = parsed.queryParams?.code;
  if (typeof code !== "string" || !code) {
    throw new Error("Missing authorization code from Supabase OAuth callback.");
  }

  const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !sessionData.session?.access_token) {
    throw exchangeError ?? new Error("Failed to exchange OAuth code for Supabase session.");
  }

  return sessionData.session.access_token;
}
