// Legacy gallery-first upload entry (still reachable via deep link).
// The tab "Scan" flow (app/screens/scan.tsx) is the primary path.
import { PrimaryButton } from "@/components/buttons/PrimaryButton";
import { UploadDropzone } from "@/components/closet/upload/UploadDropZone";
import { IconButton } from "@/components/ui/IconButton";
import { Screen } from "@/components/layout/Screen";
import { Colors, Spacing, Typography } from "@/theme";
import { useUploadStore } from "@/store/upload.store";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React from "react";
import { Alert, Text, View } from "react-native";

function simpleUid() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 11)
    );
}

function assetsToUploads(assets: ImagePicker.ImagePickerAsset[]) {
    return assets.map((a) => ({
        id: simpleUid(),
        uri: a.uri,
        localPath: a.uri,
        status: "pending" as const,
    }));
}

export default function UploadScreen() {
    const addImages = useUploadStore((s) => s.addImages);
    const nextStep = useUploadStore((n) => n.nextStep);
    const clearImages = useUploadStore((s) => s.clearImages);
    const images = useUploadStore((s) => s.images);

    const pickFromGallery = async () => {
        const res = await ImagePicker.launchImageLibraryAsync({
            allowsMultipleSelection: true,
            selectionLimit: 5,
            quality: 0.85,
        });
        if (!res.canceled && res.assets?.length) {
            addImages(assetsToUploads(res.assets));
            nextStep();
            router.push("/screens/upload/review" as any);
        }
    };

    const takePhoto = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            Alert.alert("Camera access needed", "Allow camera access to photograph your items.");
            return;
        }
        const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
        if (!res.canceled && res.assets?.length) {
            addImages(assetsToUploads(res.assets));
            nextStep();
            router.push("/screens/upload/review" as any);
        }
    };

    return (
        <Screen padded={false}>
            <View style={{ flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}>
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.md }}>
                    <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
                    <Text style={styles.title}>Upload Clothes</Text>
                    <View style={{ width: 38 }} />
                </View>
                <Text style={styles.subtitle}>
                    Add photos of your clothing and start building your smart closet.
                </Text>

                {/* Dropzone */}
                <View style={{ marginTop: Spacing.md }}>
                    <UploadDropzone onPick={pickFromGallery} />
                </View>

                {/* Actions */}
                <View style={{ marginTop: Spacing.xl, gap: 10 }}>
                    <PrimaryButton icon="camera-outline" onPress={takePhoto}>
                        Take Photo
                    </PrimaryButton>
                    <PrimaryButton variant="secondary" icon="images-outline" onPress={pickFromGallery}>
                        Upload from Gallery
                    </PrimaryButton>
                    {images.length > 0 && (
                        <PrimaryButton variant="secondary" icon="trash-outline" onPress={clearImages}>
                            Clear Selected Images
                        </PrimaryButton>
                    )}
                </View>
            </View>
        </Screen>
    );
}

const styles = {
    title: {
        flex: 1,
        fontSize: 20,
        fontFamily: Typography.serif,
        fontWeight: "600" as const,
        color: Colors.text,
        textAlign: "center" as const,
    },
    subtitle: {
        fontSize: 13,
        color: Colors.mid,
        textAlign: "center" as const,
        maxWidth: 300,
        alignSelf: "center" as const,
        lineHeight: 19,
    },
};
