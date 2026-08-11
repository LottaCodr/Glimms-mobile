import { Platform, Share } from 'react-native';

export const useShare = () => {
    const shareResult = async (title: string, message: string, url?: string) => {
        try {
            const content = {
                title,
                message: Platform.OS === 'android' ? `${message} ${url || ''}` : message,
                url: Platform.OS === 'ios' ? url : undefined,
            };

            const result = await Share.share(content, {
                dialogTitle: title,
            });

            if (result.action === Share.sharedAction) {
                if (result.activityType) {
                    // shared with activity type of result.activityType
                } else {
                    // shared
                }
            } else if (result.action === Share.dismissedAction) {
                // dismissed
            }
        } catch (error: any) {
            console.error('Error sharing:', error.message);
        }
    };

    return { shareResult };
};
