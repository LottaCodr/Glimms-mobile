import { inferMimeType, validateLocalImages } from "@/services/sessions.service";

describe("inferMimeType", () => {
    it("trusts a supported mime type from the picker", () => {
        expect(inferMimeType({ uri: "file:///a.jpg", mimeType: "image/webp" })).toBe("image/webp");
    });

    it("falls back to the file extension, ignoring query strings and case", () => {
        expect(inferMimeType({ uri: "file:///photos/shot.PNG?width=200" })).toBe("image/png");
        expect(inferMimeType({ uri: "content://media/1234", fileName: "look.webp" })).toBe("image/webp");
    });

    it("assumes JPEG when nothing else is known or the type is unsupported", () => {
        expect(inferMimeType({ uri: "content://media/1234" })).toBe("image/jpeg");
        expect(inferMimeType({ uri: "file:///a.heic", mimeType: "image/heic" })).toBe("image/jpeg");
    });
});

describe("validateLocalImages", () => {
    const photo = { uri: "file:///a.jpg" };

    it("accepts one to five photos", () => {
        expect(() => validateLocalImages([photo])).not.toThrow();
        expect(() => validateLocalImages(Array(5).fill(photo))).not.toThrow();
    });

    it("requires at least one photo", () => {
        expect(() => validateLocalImages([])).toThrow("Add at least one photo.");
    });

    it("rejects more than five photos", () => {
        expect(() => validateLocalImages(Array(6).fill(photo))).toThrow("Max 5 photos per session.");
    });

    it("rejects a photo over 15 MB", () => {
        expect(() => validateLocalImages([{ ...photo, fileSize: 15 * 1024 * 1024 + 1 }])).toThrow(/over 15 MB/);
        expect(() => validateLocalImages([{ ...photo, fileSize: 15 * 1024 * 1024 }])).not.toThrow();
    });
});
