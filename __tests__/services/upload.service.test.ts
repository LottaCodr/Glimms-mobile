import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { sessionService, uploadImageToS3 } from "@/services/sessions.service";
import { uploadService } from "@/services/upload.service";
import { useOfflineQueueStore } from "@/store/offlineQueue.store";

jest.mock("@/services/sessions.service", () => {
    const actual = jest.requireActual("@/services/sessions.service");
    return {
        ...actual,
        uploadImageToS3: jest.fn(async () => undefined),
        sessionService: { create: jest.fn(), completeUploads: jest.fn() },
    };
});

const netInfo = NetInfo.fetch as jest.Mock;
const create = sessionService.create as jest.Mock;
const completeUploads = sessionService.completeUploads as jest.Mock;
const putToS3 = uploadImageToS3 as jest.Mock;

const photos = [{ uri: "file:///a.jpg" }, { uri: "file:///b.png" }];
const plan = {
    session_id: "sess_1",
    upload_urls: [
        { image_id: "img_1", upload_url: "https://s3/1" },
        { image_id: "img_2", upload_url: "https://s3/2" },
    ],
};

beforeEach(async () => {
    await AsyncStorage.clear();
    useOfflineQueueStore.setState({ items: [], hydrated: false });
    netInfo.mockResolvedValue({ isConnected: true });
    create.mockResolvedValue(plan);
    completeUploads.mockResolvedValue({ session_id: "sess_1", status: "queued" });
});

describe("startDesignSession (online)", () => {
    it("creates the session, uploads every photo to its own URL, then completes", async () => {
        const result = await uploadService.startDesignSession("wardrobe", photos, {
            occasion: "work",
            climate: { temperature_c: 28, humidity: 70 },
            preferences: { styles: ["minimal"] },
        });

        expect(result).toEqual({ kind: "session", sessionId: "sess_1" });
        expect(create).toHaveBeenCalledWith({
            vertical: "wardrobe",
            occasion: "work",
            culture: undefined,
            climate: { temperature_c: 28, humidity: 70 },
            preferences: { styles: ["minimal"] },
            imageCount: 2,
        });
        expect(putToS3).toHaveBeenCalledTimes(2);
        expect(putToS3).toHaveBeenNthCalledWith(1, plan.upload_urls[0], photos[0], expect.any(Function));
        expect(putToS3).toHaveBeenNthCalledWith(2, plan.upload_urls[1], photos[1], expect.any(Function));
        expect(completeUploads).toHaveBeenCalledWith("sess_1", ["img_1", "img_2"]);
    });

    it("reports per-photo upload progress", async () => {
        putToS3.mockImplementation(async (_upload, _image, onProgress) => onProgress(0.5));
        const onImageProgress = jest.fn();

        await uploadService.startDesignSession("room", photos, { onImageProgress });

        expect(onImageProgress).toHaveBeenCalledWith(0, 0.5);
        expect(onImageProgress).toHaveBeenCalledWith(1, 0.5);
    });

    it("does not start the pipeline when an upload fails", async () => {
        putToS3.mockRejectedValueOnce(new Error("S3 upload failed (403)"));

        await expect(uploadService.startDesignSession("wardrobe", photos)).rejects.toThrow("S3 upload failed (403)");
        expect(completeUploads).not.toHaveBeenCalled();
    });

    it("validates before touching the network", async () => {
        await expect(uploadService.startDesignSession("wardrobe", [])).rejects.toThrow("Add at least one photo.");
        expect(netInfo).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });
});

describe("startDesignSession (offline)", () => {
    it("queues the scan on the device instead of calling the API", async () => {
        netInfo.mockResolvedValue({ isConnected: false });

        const result = await uploadService.startDesignSession("garden", photos, { occasion: "casual" });

        expect(result).toEqual({ kind: "queued_offline" });
        expect(create).not.toHaveBeenCalled();
        const [queued] = useOfflineQueueStore.getState().items;
        expect(queued).toMatchObject({
            vertical: "garden",
            uris: ["file:///a.jpg", "file:///b.png"],
            options: { occasion: "casual" },
        });
    });

    it("treats unknown connectivity as online", async () => {
        netInfo.mockResolvedValue({ isConnected: null });
        await expect(uploadService.startDesignSession("wardrobe", photos)).resolves.toMatchObject({ kind: "session" });
    });
});
