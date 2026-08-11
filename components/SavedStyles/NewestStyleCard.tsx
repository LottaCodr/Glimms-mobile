import { useTheme } from "@/provider/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, Text, View, StyleSheet } from "react-native";

type Props = {
    title: string;
    image: string;
    generatedAt: string;
    onReuse: () => void;
    onMagic?: () => void;
};

export const mockNewestStyleCardProps: Props = {
    title: "Urban Denim Jacket",
    image:
        "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=400&q=80",
    generatedAt: "2 hours ago",
    onReuse: () => alert("Reuse pressed"),
    onMagic: () => alert("Magic pressed"),
};

export function NewestStyleCard({ title, image, generatedAt, onReuse, onMagic }: Props) {
    const theme = useTheme();

    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: theme.colors.neutral[900],
                    borderRadius: theme.radius.lg,
                    padding: theme.spacing[4],
                    borderWidth: 2,
                    borderColor: theme.colors.brand.primary, // Ensure visibility with a colored border
                },
            ]}
            accessibilityRole="summary"
            accessible={true}
            accessibilityLabel={`Newest style: ${title}. Generated ${generatedAt}.`}
        >
            {/* Label (VISIBLE - HIGH CONTRAST, UPPERCASE) */}
            <Text
                style={[
                    styles.label,
                    {
                        color: theme.colors.brand.primary,
                        marginBottom: theme.spacing[1],
                        fontSize: 14,
                        textTransform: "uppercase",
                        letterSpacing: 2,
                        backgroundColor: theme.colors.neutral[100], // contrast background
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                        alignSelf: "flex-start",
                    },
                ]}
            >
                NEWEST ADDITION – VISIBLE
            </Text>

            {/* Title (LARGER, bolder) */}
            <Text
                style={[
                    styles.title,
                    {
                        color: theme.colors.neutral[0],
                        marginBottom: theme.spacing[1],
                        fontSize: 20,
                        fontWeight: "bold",
                        letterSpacing: 0.2,
                    },
                ]}
                numberOfLines={2}
                accessible={true}
                accessibilityLabel={`Style title: ${title}`}
            >
                {title}
            </Text>

            {/* Meta */}
            <Text
                style={[
                    styles.meta,
                    {
                        color: theme.colors.neutral[400],
                        marginBottom: theme.spacing[3],
                        fontWeight: "500",
                    },
                ]}
                accessible={true}
            >
                Generated {generatedAt}
            </Text>

            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing[3],
                }}
            >
                {/* Buttons */}
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: theme.spacing[2],
                    }}
                >
                    <Pressable
                        onPress={onReuse}
                        style={[
                            styles.reuseButton,
                            {
                                backgroundColor: theme.colors.brand.primary,
                                paddingHorizontal: theme.spacing[4],
                                paddingVertical: theme.spacing[2],
                                borderColor: "#fff",
                                borderWidth: 1,
                                minWidth: 80,
                            },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Reuse style"
                    >
                        <Ionicons name="refresh" color="#fff" size={18} style={{ marginRight: 4 }} />
                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Reuse</Text>
                    </Pressable>

                    {onMagic && (
                        <Pressable
                            onPress={onMagic}
                            style={[
                                styles.magicButton,
                                {
                                    backgroundColor: theme.colors.neutral[800],
                                    padding: theme.spacing[2],
                                    borderColor: theme.colors.brand.primary,
                                    borderWidth: 1,
                                },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="Try magic outfit feature"
                        >
                            <Ionicons
                                name="sparkles"
                                color={theme.colors.brand.primary}
                                size={20}
                            />
                        </Pressable>
                    )}
                </View>

                {/* Image */}
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Image
                        source={{ uri: image }}
                        style={{
                            width: 110,
                            height: 150,
                            borderRadius: theme.radius.md,
                            resizeMode: "cover",
                            borderWidth: 2,
                            borderColor: theme.colors.brand.primary,
                        }}
                        accessibilityLabel="Preview of the newest style"
                        accessible={true}
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 7 },
        elevation: 8,
    },
    label: {
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 1,
    },
    title: {
        fontSize: 18,
        fontWeight: "700",
    },
    meta: {
        fontSize: 12,
    },
    reuseButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
    },
    magicButton: {
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
    },
});

// Demo usage
export function NewestStyleCardMockDemo() {
    return <NewestStyleCard {...mockNewestStyleCardProps} />;
}
