import { PrimaryButton } from "@/components/buttons/PrimaryButton";
import { PreviewCard } from "@/components/closet/upload/PreviewCard";
import { StepIndicator } from "@/components/closet/upload/StepIndicator";
import { useTheme } from "@/provider/ThemeProvider";
import { useUploadStore } from "@/store/upload.store";
import { useRouter } from "expo-router";
import { FlatList, Text, View } from "react-native";

export default function ReviewUploads() {
    const theme = useTheme();
    const router = useRouter();
    const { images, removeImage, nextStep, step } = useUploadStore();
    console.log(images.map(i => i.uri));


    return (
        <View style={{ flex: 1, padding: theme.spacing[4] }}>
            <StepIndicator step={step}/>
            <Text style={theme.typography.h3}>Confirm your items</Text>
            <Text
                style={{
                    ...theme.typography.body,
                    color: theme.colors.neutral[500],
                    marginBottom: theme.spacing[4],
                }}
            >
                Make sure your clothes are clearly visible before we start styling.
            </Text>

            <FlatList
                data={images}
                numColumns={3}
                keyExtractor={(i) => i.id}
                columnWrapperStyle={{ gap: theme.spacing[3] }}
                contentContainerStyle={{
                    gap: theme.spacing[3],
                    paddingBottom: theme.spacing[6]
                 }}
                renderItem={({ item }) => (
                    <PreviewCard
                        uri={item.uri}
                        onRemove={() => removeImage(item.id)}
                    />
                )}
            />

            <PrimaryButton onPress={() => {
                nextStep();
                router.push('/screens/style-setup')
             }}>
                Continue
            </PrimaryButton>
        </View>
    );
}


// TO USE
// /(closet)/upload/tagging