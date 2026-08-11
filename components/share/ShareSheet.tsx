import { useShare } from '@/hooks/useShare';
import { useTheme } from '@/provider/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ShareSheetProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    previewImage?: string;
    shareMessage: string;
}

export const ShareSheet: React.FC<ShareSheetProps> = ({
    visible,
    onClose,
    title,
    previewImage,
    shareMessage
}) => {
    const theme = useTheme();
    const { shareResult } = useShare();

    const handleNativeShare = () => {
        shareResult(title, shareMessage, 'https://glimms.ai/share/123');
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <View style={[styles.sheet, { backgroundColor: theme.colors.neutral[0], borderRadius: theme.radius.lg || 20 }]}>
                    <View style={styles.header}>
                        <Text style={theme.typography.h3}>Share your Style</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color={theme.colors.neutral[500]} />
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.previewContainer, { backgroundColor: theme.colors.neutral[50], borderRadius: 12 }]}>
                        {previewImage ? (
                            <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="cover" />
                        ) : (
                            <View style={styles.placeholderImage}>
                                <Ionicons name="shirt-outline" size={40} color={theme.colors.brand.primary} />
                            </View>
                        )}
                        <View style={styles.previewInfo}>
                            <Text style={[theme.typography.body, { fontWeight: '600' }]}>{title}</Text>
                            <Text style={theme.typography.caption} numberOfLines={1}>{shareMessage}</Text>
                        </View>
                    </View>

                    <View style={styles.socialRow}>
                        <SocialButton icon="logo-instagram" label="Stories" color="#E1306C" />
                        <SocialButton icon="logo-whatsapp" label="WhatsApp" color="#25D366" />
                        <SocialButton icon="paper-plane" label="Direct" color="#0088CC" />
                        <SocialButton icon="copy-outline" label="Link" color={theme.colors.neutral[700]} />
                    </View>

                    <TouchableOpacity
                        style={[styles.mainButton, { backgroundColor: theme.colors.brand.primary }]}
                        onPress={handleNativeShare}
                    >
                        <Ionicons name="share-social-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={[theme.typography.button, { color: '#FFF' }]}>More Share Options</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

const SocialButton = ({ icon, label, color }: { icon: any; label: string; color: string }) => {
    const theme = useTheme();
    return (
        <TouchableOpacity style={styles.socialItem}>
            <View style={[styles.socialIcon, { backgroundColor: color }]}>
                <Ionicons name={icon} size={24} color="#FFF" />
            </View>
            <Text style={[theme.typography.caption, { marginTop: 4 }]}>{label}</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        padding: 24,
        paddingBottom: 44,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    previewContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginBottom: 24,
    },
    previewImage: {
        width: 60,
        height: 60,
        borderRadius: 8,
    },
    placeholderImage: {
        width: 60,
        height: 60,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    previewInfo: {
        marginLeft: 12,
        flex: 1,
    },
    socialRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    socialItem: {
        alignItems: 'center',
    },
    socialIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mainButton: {
        flexDirection: 'row',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
