import React from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radius } from "@/theme";

export function PreviewCard({ uri, onRemove }: { uri: string; onRemove: () => void }) {
    return (
        <View
            style={{
                flex: 1,
                aspectRatio: 1,
                borderRadius: Radius.md,
                overflow: "hidden",
                backgroundColor: Colors.card2,
                borderWidth: 1,
                borderColor: Colors.border,
            }}
        >
            <Image source={{ uri }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
            <Pressable
                onPress={onRemove}
                accessibilityLabel="Remove photo"
                hitSlop={8}
                style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    backgroundColor: "rgba(0,0,0,0.65)",
                    borderRadius: 999,
                    padding: 5,
                }}
            >
                <Ionicons name="close" size={13} color="#fff" />
            </Pressable>
        </View>
    );
}
