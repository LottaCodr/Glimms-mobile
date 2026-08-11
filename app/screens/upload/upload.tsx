// app/(closet)/upload/index.tsx

import { PrimaryButton } from "@/components/buttons/PrimaryButton";
import { UploadDropzone } from "@/components/closet/upload/UploadDropZone";
import { Screen } from "@/components/layout/Screen";
import { useTheme } from "@/provider/ThemeProvider";
import { useUploadStore } from "@/store/upload.store";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Text, View } from "react-native";
import type { FlexAlignType } from "react-native"; // for type check of alignItems

function simpleUid() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).substr(2, 9)
    );
}

export default function UploadScreen() {
    const theme = useTheme();

    const addImages = useUploadStore((s) => s.addImages);
    const nextStep = useUploadStore((n) => n.nextStep);
    const clearImages = useUploadStore((s) => s.clearImages);
    const images = useUploadStore((s) => s.images);

    const pickFromGallery = async () => {
        const res = await ImagePicker.launchImageLibraryAsync({
            allowsMultipleSelection: true,
            quality: 0.8,
        });

        if (!res.canceled && res.assets?.length) {
            addImages(
                res.assets.map((a) => ({
                    id: simpleUid(),
                    uri: a.uri,
                    localPath: a.uri,
                    status: "pending",
                }))
            );

            nextStep();
            router.push("/screens/upload/review");
        }
    };

    const takePhoto = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return;

        const res = await ImagePicker.launchCameraAsync({
            quality: 0.8,
        });

        if (!res.canceled && res.assets?.length) {
            addImages(
                res.assets.map((a) => ({
                    id: simpleUid(),
                    uri: a.uri,
                    localPath: a.uri,
                    status: "pending",
                }))
            );

            nextStep();
            router.push("/screens/upload/review");
        }
    };

    return (
        <Screen padded={false}>
            <View style={styles.container(theme)}>

                {/* HEADER */}
                <View style={styles.header(theme)}>
                    <Text style={styles.title(theme)}>Upload Clothes</Text>

                    <Text style={styles.subtitle(theme)}>
                        Add photos of your clothing and start building your smart closet.
                    </Text>
                </View>

                {/* DROPZONE CARD */}
                <View style={styles.card(theme)}>
                    <UploadDropzone onPick={pickFromGallery} />
                </View>

                {/* ACTIONS */}
                <View style={styles.actions(theme)}>

                    <PrimaryButton icon="camera" onPress={takePhoto}>
                        Take Photo
                    </PrimaryButton>

                    <PrimaryButton variant="secondary" onPress={pickFromGallery}>
                        Upload from Gallery
                    </PrimaryButton>

                    {images?.length > 0 && (
                        <PrimaryButton variant="secondary" onPress={clearImages}>
                            Clear Selected Images
                        </PrimaryButton>
                    )}
                </View>
            </View>
        </Screen>
    );
}

const styles = {
    container: (theme: any) => ({
        flex: 1,
        paddingHorizontal: theme.spacing[5],
        paddingTop: theme.spacing[6],
        backgroundColor: theme.colors.neutral[50],
    }),

    header: (theme: any) => ({
        marginBottom: theme.spacing[6],
        alignItems: "center" as FlexAlignType,
    }),

    title: (theme: any) => ({
        ...theme.typography.h2,
        color: theme.colors.neutral[900],
        marginBottom: theme.spacing[2],
        textAlign: "center" as const,
    }),

    subtitle: (theme: any) => ({
        ...theme.typography.body,
        color: theme.colors.neutral[500],
        textAlign: "center" as const,
        maxWidth: 320,
    }),

    card: (theme: any) => ({
        backgroundColor: "#fff",
        borderRadius: theme.radius.lg,
        padding: theme.spacing[4],
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
    }),

    actions: (theme: any) => ({
        marginTop: theme.spacing[8],
        gap: theme.spacing[3],
    }),
};
