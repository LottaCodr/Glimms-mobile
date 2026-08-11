// app/(closet)/upload/tagging.tsx
import { useAITagging } from "@/hooks/useAITagging";
import { useTheme } from "@/provider/ThemeProvider";
import { useUploadStore } from "@/store/upload.store";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

export default function TaggingScreen() {
    const theme = useTheme();
    const router = useRouter();
    const { images } = useUploadStore();
    const { tagImages } = useAITagging();

    useEffect(() => {
        (async () => {
            await tagImages(images);
            // router.replace("/(closet)/upload/confirm");
        })();
    }, []);

    return (
        <View
            style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <ActivityIndicator size="large" color={theme.colors.brand.primary} />
            <Text style={{ marginTop: theme.spacing[3] }}>
                Glimms is analyzing your items…
            </Text>
        </View>
    );
}
