import React from "react";
import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { EmptyState } from "@/components/ui/EmptyState";
import { Colors } from "@/theme";

export default function NotFoundScreen() {
    const router = useRouter();
    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.code}>404</Text>
            <EmptyState
                icon="compass-outline"
                title="That page wandered off"
                subtitle="The screen you’re looking for doesn’t exist or was moved."
                actionLabel="Back to home"
                onAction={() => router.replace("/(tabs)/home")}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, justifyContent: "center" },
    code: {
        textAlign: "center",
        fontSize: 64,
        fontWeight: "800",
        color: Colors.gold,
        letterSpacing: 6,
        marginBottom: 8,
    },
});
