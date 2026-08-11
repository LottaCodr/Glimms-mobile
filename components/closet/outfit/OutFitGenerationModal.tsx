import { PrimaryButton } from "@/components/buttons/PrimaryButton";
import { useTheme } from "@/provider/ThemeProvider";
import { useStyleSetupStore } from "@/store/style.setup";
import { Modal, Text, View } from "react-native";

interface Props {
    visible: boolean,
    onClose: () => void,
    onGenerate: () => void
}

export function OutFitGenerationModal({
    visible, onClose, onGenerate,
}: Props) {
    const theme = useTheme()
    const { occasion, color, vibe } = useStyleSetupStore()

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View
                style={{
                    flex: 1,
                    justifyContent: "flex-end",
                    backgroundColor: "rgba(0,0,0,0.5)"
                }}
            >
                <View
                    style={{
                        backgroundColor: theme.colors.neutral[0],
                        borderTopLeftRadius: theme.radius.xl,
                        borderTopRightRadius: theme.radius.xl,
                        padding: theme.spacing[5]

                    }}>
                    <Text style={theme.typography.h3}>Style Setup</Text>

                    <Text style={theme.typography.caption}>
                        Occasion: {occasion} · Color: {color}
                    </Text>

                    <View style={{ marginTop: theme.spacing[4] }}>
                        <PrimaryButton
                            onPress={onGenerate}
                        >
                            Generate Styles ✨
                        </PrimaryButton>
                    </View>

                    <View style={{ marginTop: theme.spacing[4] }}>
                        <PrimaryButton
                            variant="secondary"
                            onPress={onClose}
                        >
                            Cancel
                        </PrimaryButton>
                    </View>
                </View>

            </View>

        </Modal>
    )
}