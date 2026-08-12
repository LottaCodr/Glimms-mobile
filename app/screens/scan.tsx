import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { uploadService } from '@/services/upload.service';
import { getLastScanQuota } from '@/services/sessions.service';
import { ApiError } from '@/services/api.client';
import { analyticsService } from '@/services/analytics.service';
import { getClimate } from '@/services/weather.service';
import { useContextStore } from '@/store/context.store';
import { useAuthStore } from '@/store/auth.store';
import { ENV } from '@/config/env';
import { Colors, Radius } from '@/theme';
import { AppIcon } from '@/components/ui/Icon';
import type { LocalImage } from '@/services/sessions.service';
import type { Vertical } from '@/types/api';

type Stage = 'idle' | 'creating' | 'uploading' | 'queuing';

export default function ScanScreen() {
  const { vertical = 'wardrobe' } = useLocalSearchParams<{ vertical: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('idle');
  const [photos, setPhotos] = useState<LocalImage[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const { context } = useContextStore();
  const { user } = useAuthStore();

  const busy = stage !== 'idle';
  const quota = getLastScanQuota();
  const limit = quota?.limit ?? ENV.SCAN_LIMITS[user?.tier ?? 'free'] ?? 10;
  const used = quota?.used ?? 0;

  const addPhoto = (img: LocalImage) =>
    setPhotos((prev) => (prev.length >= ENV.SCAN_MAX_IMAGES ? prev : [...prev, img]));

  const capture = async () => {
    if (!cameraRef.current || busy || photos.length >= ENV.SCAN_MAX_IMAGES) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
    if (photo) addPhoto({ uri: photo.uri, mimeType: 'image/jpeg' });
  };

  const pickFromGallery = async () => {
    if (busy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Gallery access needed', 'Allow photo access to add from your library.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: ENV.SCAN_MAX_IMAGES - photos.length,
      quality: 0.9,
    });
    if (result.canceled) return;
    result.assets.forEach((a) =>
      addPhoto({ uri: a.uri, mimeType: a.mimeType ?? null, fileName: a.fileName, fileSize: a.fileSize }),
    );
  };

  const removePhoto = (index: number) =>
    setPhotos((prev) => prev.filter((_, i) => i !== index));

  const generate = async () => {
    if (!photos.length || busy) return;
    setUploadProgress(photos.map(() => 0));
    setStage('creating');

    try {
      // Optional climate context (guide §8A) — never blocks the flow.
      let climate: { temperature_c: number; humidity?: number } | undefined;
      const { latitude, longitude } = await currentCoords();
      if (latitude !== undefined && longitude !== undefined) {
        const w = await getClimate(latitude, longitude);
        if (w) climate = { temperature_c: w.temperature_c, humidity: w.humidity };
      }

      setStage('uploading');
      const result = await uploadService.startDesignSession(vertical as Vertical, photos, {
        occasion: context.occasion,
        // "tone:*" markers are client-side only — the session schema takes real style names.
        preferences: context.styles.length
          ? { styles: context.styles.filter((s) => !s.startsWith('tone:')) }
          : undefined,
        climate,
        onImageProgress: (i, f) =>
          setUploadProgress((prev) => prev.map((v, j) => (j === i ? f : v))),
      });

      if (result.kind === 'queued_offline') {
        Alert.alert('Saved offline', 'We’ll process your photos when you’re back online.');
        setPhotos([]);
        return;
      }

      setStage('queuing');
      analyticsService.track('scan_uploaded', { vertical, imageCount: photos.length });
      setPhotos([]);
      router.push(`/session/${result.sessionId}` as any);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SCAN_LIMIT_REACHED') {
        const p = err.payload;
        Alert.alert(
          'Daily limit reached',
          `You’ve used ${p?.scansUsed ?? limit}/${p?.limit ?? limit} scans today. Resets tomorrow — or go further with a plan.`,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'See plans', onPress: () => router.push('/paywall' as any) },
          ],
        );
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        Alert.alert('Check your input', err.fieldError() ?? err.message);
      } else {
        Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
      }
    } finally {
      setStage('idle');
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
        <TouchableOpacity
          style={[styles.permBtn, { backgroundColor: Colors.card, marginTop: 10 }]}
          onPress={pickFromGallery}
        >
          <Text style={styles.permBtnText}>Pick from gallery</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} accessibilityLabel="Close">
            <AppIcon name="close" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{(vertical as string).toUpperCase()} SCAN</Text>
          </View>
          <View style={styles.quotaPill}>
            <Text style={styles.quotaText}>
              {limit === Infinity ? `${used}` : `${used}/${limit}`}
            </Text>
          </View>
        </View>

        {/* Occasion/context shortcut */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
          <TouchableOpacity
            onPress={() => !busy && router.push({ pathname: '/screens/style-setup' as any, params: { vertical: vertical as string } })}
            style={styles.occasionChip}
            accessibilityLabel="Change style context"
            activeOpacity={0.8}
          >
            <AppIcon name="options-outline" size={12} color={Colors.cream} />
            <Text style={styles.occasionChipText}>{context.occasion}</Text>
            <AppIcon name="chevron-down" size={11} color={Colors.mid} />
          </TouchableOpacity>
        </View>

        {/* Guide Box or capture tray */}
        {photos.length === 0 ? (
          <View style={styles.guide}>
            <View style={styles.guideTL} />
            <View style={styles.guideTR} />
            <View style={styles.guideBL} />
            <View style={styles.guideBR} />
          </View>
        ) : (
          <View style={styles.trayWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tray}>
              {photos.map((p, i) => (
                <View key={`${p.uri}-${i}`} style={styles.thumbWrap}>
                  <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" />
                  {stage === 'uploading' && (
                    <View style={styles.thumbProgress}>
                      <View style={[styles.thumbProgressFill, { width: `${Math.round((uploadProgress[i] ?? 0) * 100)}%` }]} />
                    </View>
                  )}
                  {!busy && (
                    <TouchableOpacity style={styles.thumbRemove} onPress={() => removePhoto(i)} accessibilityLabel="Remove photo">
                      <AppIcon name="close" size={11} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {photos.length < ENV.SCAN_MAX_IMAGES && !busy && (
                <TouchableOpacity style={styles.thumbAdd} onPress={capture} accessibilityLabel="Add another photo">
                  <AppIcon name="add" size={22} color="#fff" />
                </TouchableOpacity>
              )}
            </ScrollView>
            <Text style={styles.trayHint}>
              {photos.length}/{ENV.SCAN_MAX_IMAGES} photos — up to {ENV.SCAN_MAX_IMAGES} per scan
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.hint}>Good lighting · Fill the frame · Avoid clutter</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={pickFromGallery}
              disabled={busy}
              style={styles.sideBtn}
              activeOpacity={0.8}
            >
              <AppIcon name="images-outline" size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={photos.length ? generate : capture}
              disabled={busy}
              style={styles.shutterBtn}
              activeOpacity={0.8}
            >
              {busy ? (
                <ActivityIndicator color={Colors.black} />
              ) : photos.length ? (
                <AppIcon name="checkmark" size={34} color={Colors.gold} />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </TouchableOpacity>

            <View style={[styles.sideBtn, { opacity: 0.35 }]}>
              <Text style={{ fontSize: 16, color: '#fff' }}>{photos.length}</Text>
            </View>
          </View>
          <Text style={styles.hint}>
            {stage === 'creating' && 'Preparing your session…'}
            {stage === 'uploading' && 'Uploading photos…'}
            {stage === 'queuing' && 'Queueing your design…'}
            {stage === 'idle' && (photos.length ? 'Tap the check to generate your looks' : 'Tap the shutter to capture')}
          </Text>
        </View>
      </View>

      {/* Busy veil while a session is being created/uploaded/queued */}
      {busy && (
        <View style={styles.veil}>
          <View style={styles.veilCard}>
            <AppIcon
              name={stage === 'creating' ? 'construct-outline' : stage === 'uploading' ? 'cloud-upload-outline' : 'hourglass-outline'}
              size={30}
              color={Colors.gold}
            />
            <Text style={styles.veilTitle}>
              {stage === 'creating' && 'Preparing your session…'}
              {stage === 'uploading' && 'Uploading photos…'}
              {stage === 'queuing' && 'Handing off to the AI…'}
            </Text>
            {stage === 'uploading' && uploadProgress.length > 0 && (
              <>
                <View style={styles.veilTrack}>
                  <View
                    style={[
                      styles.veilFill,
                      {
                        width: `${Math.round(
                          (uploadProgress.reduce((a, b) => a + b, 0) / uploadProgress.length) * 100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.veilMeta}>
                  {uploadProgress.filter((p) => p >= 1).length}/{uploadProgress.length} photos uploaded
                </Text>
              </>
            )}
            <Text style={styles.veilMeta}>Keep the app open — this takes a few seconds</Text>
          </View>
        </View>
      )}
    </View>
  );
}

async function currentCoords(): Promise<{ latitude?: number; longitude?: number }> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') return {};
    }
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: coords.latitude, longitude: coords.longitude };
  } catch {
    return {}; // location is optional climate context — never block the scan
  }
}

const C = { CORNER_SIZE: 28, BORDER: 3 };
const cornerBase = {
  width: C.CORNER_SIZE,
  height: C.CORNER_SIZE,
  position: 'absolute' as const,
  borderColor: 'rgba(255,255,255,0.9)',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  overlay: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  occasionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  occasionChipText: { color: Colors.cream, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  quotaPill: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quotaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  guide: {
    width: 280,
    height: 360,
    alignSelf: 'center',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideTL: { ...cornerBase, top: 0, left: 0, borderTopWidth: C.BORDER, borderLeftWidth: C.BORDER, borderTopLeftRadius: 4 },
  guideTR: { ...cornerBase, top: 0, right: 0, borderTopWidth: C.BORDER, borderRightWidth: C.BORDER, borderTopRightRadius: 4 },
  guideBL: { ...cornerBase, bottom: 0, left: 0, borderBottomWidth: C.BORDER, borderLeftWidth: C.BORDER, borderBottomLeftRadius: 4 },
  guideBR: { ...cornerBase, bottom: 0, right: 0, borderBottomWidth: C.BORDER, borderRightWidth: C.BORDER, borderBottomRightRadius: 4 },
  trayWrap: { alignSelf: 'stretch', alignItems: 'center' },
  tray: { gap: 10, paddingHorizontal: 8, alignItems: 'center' },
  thumbWrap: { width: 88, height: 118, borderRadius: Radius.md, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbProgress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  thumbProgressFill: { height: '100%', backgroundColor: Colors.gold },
  thumbAdd: {
    width: 88,
    height: 118,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayHint: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 8, textAlign: 'center' },
  footer: { alignItems: 'center', gap: 14 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 26 },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: 'rgba(255,255,255,0.65)', fontSize: 12, textAlign: 'center' },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  permText: { color: Colors.text, fontSize: 17, fontWeight: '600' },
  permBtn: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  permBtnText: { color: '#fff', fontWeight: '700' },
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  veilCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  veilTitle: { color: Colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  veilTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.card2,
    overflow: 'hidden',
    marginTop: 6,
  },
  veilFill: { height: '100%', backgroundColor: Colors.gold },
  veilMeta: { color: Colors.mid, fontSize: 12 },
});
