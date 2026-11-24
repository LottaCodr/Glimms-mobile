import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import * as authService from "@/services/auth.services";
import { tokenStore } from "@/services/api.client";
import { useAuthStore } from "@/store/auth.store";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function completeAuth() {
      try {
        if (!supabase) {
          throw new Error("Supabase Auth is not configured.");
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const accessToken = data.session?.access_token;
        if (!accessToken) {
          throw new Error("No Supabase session found after OAuth callback.");
        }

        const tokens = await authService.signInWithSupabase(accessToken);
        await tokenStore.save(tokens);
        await useAuthStore.getState().hydrateAuth();

        if (active) {
          router.replace("/(tabs)/home");
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message ?? "Authentication failed.");
        }
      }
    }

    void completeAuth();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={styles.text}>Completing sign-in...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090B",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  text: {
    marginTop: 16,
    color: "#F5F5F7",
    fontSize: 16,
  },
  errorText: {
    color: "#F87171",
    fontSize: 15,
    textAlign: "center",
  },
});
