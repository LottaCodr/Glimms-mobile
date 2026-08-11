import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, router } from 'expo-router';
import { uploadService } from '@/services/upload.service';
import { useContextStore } from '@/store/context.store';
import { useAuthStore } from '@/store/auth.store';
import { Colors, Radius } from '@/theme';

export default function ScanScreen() {
  const { vertical = 'wardrobe' } = useLocalSearchParams<{ vertical: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const { context } = useContextStore();
  const { user } = useAuthStore();

  const capture = async () => {
    if (!cameraRef.current || uploading) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUploading(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo) return;

      setCapturedCount(c => c + 1);
      const result = await uploadService.uploadAndScan([photo.uri], vertical, context);

      if (result.status === 'QUEUED_OFFLINE') {
        Alert.alert('Saved Offline', 'Your image will be processed when you reconnect.');
      } else {
        Alert.alert('Scanning! ✨', `Processing your ${vertical}...`, [
          { text: 'Scan More', style: 'cancel' },
          { text: 'See Designs', onPress: () => router.push(`/design/${result.jobId}`) }
        ]);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.response?.data?.error ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.gold} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera access needed</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
      />
      <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{vertical.toUpperCase()} SCAN</Text>
          </View>
          <View style={styles.counter}>
            <Text style={styles.counterText}>{capturedCount}</Text>
          </View>
        </View>

        {/* Guide Box */}
        <View style={styles.guide}>
          <View style={styles.guideTL} />
          <View style={styles.guideTR} />
          <View style={styles.guideBL} />
          <View style={styles.guideBR} />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.hint}>Good lighting · Fill the frame · Avoid clutter</Text>
          <TouchableOpacity
            onPress={capture}
            disabled={uploading}
            style={styles.shutterBtn}
            activeOpacity={0.8}
          >
            {uploading
              ? <ActivityIndicator color={Colors.black} />
              : <View style={styles.shutterInner} />
            }
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const C = { CORNER_SIZE: 28, BORDER: 3 };
const cornerBase = {
  width: C.CORNER_SIZE,
  height: C.CORNER_SIZE,
  position: 'absolute' as const,
  borderColor: 'rgba(255,255,255,0.9)'
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: { color: '#fff', fontSize: 16 },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2
  },
  counter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center'
  },
  counterText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  guide: {
    width: 280,
    height: 360,
    alignSelf: 'center',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  guideTL: {
    ...cornerBase,
    top: 0,
    left: 0,
    borderTopWidth: C.BORDER,
    borderLeftWidth: C.BORDER,
    borderTopLeftRadius: 4
  },
  guideTR: {
    ...cornerBase,
    top: 0,
    right: 0,
    borderTopWidth: C.BORDER,
    borderRightWidth: C.BORDER,
    borderTopRightRadius: 4
  },
  guideBL: {
    ...cornerBase,
    bottom: 0,
    left: 0,
    borderBottomWidth: C.BORDER,
    borderLeftWidth: C.BORDER,
    borderBottomLeftRadius: 4
  },
  guideBR: {
    ...cornerBase,
    bottom: 0,
    right: 0,
    borderBottomWidth: C.BORDER,
    borderRightWidth: C.BORDER,
    borderBottomRightRadius: 4
  },
  footer: { alignItems: 'center', gap: 20 },
  hint: { color: 'rgba(255,255,255,0.65)', fontSize: 12, textAlign: 'center' },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff'
  },
  permText: { color: Colors.text, fontSize: 17, fontWeight: '600' },
  permBtn: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.md
  },
  permBtnText: { color: '#fff', fontWeight: '700' }
});
