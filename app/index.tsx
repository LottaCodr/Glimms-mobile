import { useTheme } from "@/provider/ThemeProvider";
import { useAuthStore } from "@/store/auth.store";
import { fetchHealth } from "@/services/api.client";
import { toast } from "@/store/toast.store";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function SplashScreen() {
  const router = useRouter();
  const theme = useTheme();

  // Fix: Initialize hydrateAuth safely, handling possible undefined
  const hydrateAuth = useAuthStore((s) => s.hydrateAuth);

  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bootstrap = async () => {
      // Restore the session from SecureStore (with refresh fallback — guide §16.1)
      // Readiness poll (guide §6): non-blocking — degraded still serves reads.
      fetchHealth()
        .then((h) => {
          if (h?.status === "degraded") {
            toast.warning("Some services are degraded — designs may be slower than usual.");
          }
        })
        .catch(() => {
          // Offline or API down; screens render their own error/empty states.
        });

      if (typeof hydrateAuth === "function") {
        await hydrateAuth();
      }

      await new Promise((res) => setTimeout(res, 1400));

      // Route on the freshly resolved auth state, not a stale render value.
      const { isAuthenticated } = useAuthStore.getState();
      router.replace(isAuthenticated ? "/(tabs)/home" : "/(onboarding)/welcome");
    };

    bootstrap();
  }, [hydrateAuth, router]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: SCREEN_WIDTH * 0.5,
        duration: 1200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [scale, opacity, progress]);

  const styles = createStyles(theme, SCREEN_WIDTH);

  return (
    <SafeAreaProvider>
      <View style={styles.background}>
        {/* Center Logo */}
        <View style={styles.centerContent}>
          <Animated.Text
            style={[
              styles.logo,
              {
                transform: [{ scale }],
                opacity,
              },
            ]}
          >
            GLIMMS
          </Animated.Text>

          <Animated.Text style={[styles.tagline, { opacity }]}>
            STYLING INTELLIGENCE
          </Animated.Text>
        </View>

        {/* Bottom Section */}
        <View style={styles.bottom}>
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progress,
                },
              ]}
            />
          </View>

          <Text style={styles.progressText}>INITIALIZING</Text>

          {/* PRODUCT CREDIT */}
          <Text style={styles.productCredit}>
            PRODUCT OF T.O.P
          </Text>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

function createStyles(theme: any, SCREEN_WIDTH: number) {
  return StyleSheet.create({
    background: {
      flex: 1,
      backgroundColor: theme?.colors?.background || "#FBFCFE",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 50,
    },

    centerContent: {
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
    },

    logo: {
      fontWeight: "800",
      fontSize: 34,
      letterSpacing: 8,
      color: theme?.colors?.primaryText || "#1A1A1A",
      textAlign: "center",
    },

    tagline: {
      fontSize: 12,
      color: theme?.colors?.secondaryText || "#6B6B6B",
      letterSpacing: 3,
      marginTop: 14,
      textAlign: "center",
    },

    bottom: {
      width: "100%",
      alignItems: "center",
    },

    progressBarTrack: {
      width: SCREEN_WIDTH * 0.5,
      height: 4,
      backgroundColor: theme?.colors?.border || "#E2E5EA",
      borderRadius: 3,
      overflow: "hidden",
      marginBottom: 10,
    },

    progressBar: {
      height: "100%",
      backgroundColor: theme?.colors?.primary || "#4792FF",
      borderRadius: 3,
    },

    progressText: {
      color: theme?.colors?.caption || "#ADB4BB",
      fontSize: 11,
      letterSpacing: 1.6,
      fontWeight: "500",
      marginBottom: 14,
    },

    productCredit: {
      fontSize: 10,
      letterSpacing: 2.5,
      color: theme?.colors?.secondaryText || "#9AA1A9",
      opacity: 0.8,
    },
  });
}

export default function App() {
  return <SplashScreen />;
}
