// components/upload/PreviewCard.tsx
import { useTheme } from "@/provider/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, View } from "react-native";

export function PreviewCard({ uri, onRemove }: { uri: any, onRemove: any }) {
    const theme = useTheme();
    // const 

    return (
        <View
            style={{
                flex: 1,
                aspectRatio: 1,
                borderRadius: theme.radius.md,
                overflow: "hidden",
                backgroundColor: theme.colors.neutral[100],
            }}
        >
            <Image
                source={{ uri }}
                resizeMode="cover"
                style={{ width: "100%", height: "100%" }}
            />

            <Pressable
                onPress={onRemove}
                style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    backgroundColor: theme.colors.brand.primary,
                    borderRadius: 999,
                    padding: 4,
                }}
            >
                <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
        </View>
    );
}
