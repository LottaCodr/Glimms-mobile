import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing, Typography } from "@/theme";
import { IconButton } from "@/components/ui/IconButton";

type Props = {
    title: string;
    updated?: string;
    sections: { heading: string; body: string }[];
};

/** Shared branded legal/document screen (Terms, Privacy). */
export function LegalDocument({ title, updated, sections }: Props) {
    const router = useRouter();
    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <View style={styles.header}>
                <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
                <Text style={styles.headerTitle}>{title}</Text>
                <View style={{ width: 38 }} />
            </View>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {!!updated && <Text style={styles.updated}>Last updated {updated}</Text>}
                {sections.map((s) => (
                    <View key={s.heading} style={styles.section}>
                        <Text style={styles.heading}>{s.heading}</Text>
                        <Text style={styles.body}>{s.body}</Text>
                    </View>
                ))}
                <View style={{ height: Spacing.xl }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    headerTitle: { fontSize: 15, fontWeight: "600", color: Colors.text },
    scroll: { padding: Spacing.lg },
    updated: { fontSize: 11, color: Colors.dim, marginBottom: Spacing.md },
    section: { marginBottom: Spacing.md },
    heading: {
        fontSize: 15,
        fontFamily: Typography.serif,
        fontWeight: "600",
        color: Colors.text,
        marginBottom: 6,
    },
    body: { fontSize: 13, color: Colors.mid, lineHeight: 20 },
});
