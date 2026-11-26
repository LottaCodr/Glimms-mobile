import { checkPhoto, MIN_SIDE_PX, RECOMMENDED_SIDE_PX } from "@/lib/vision/photoCheck";

describe("checkPhoto", () => {
    it("accepts a normal phone photo", () => {
        expect(checkPhoto({ width: 3024, height: 4032 })).toEqual({ severity: "ok", issue: null, message: null });
    });

    it("blocks a photo the server would reject as too small", () => {
        const check = checkPhoto({ width: 4000, height: MIN_SIDE_PX - 1 });
        expect(check).toMatchObject({ severity: "block", issue: "too_small" });
        expect(checkPhoto({ width: MIN_SIDE_PX, height: MIN_SIDE_PX }).severity).toBe("warn");
    });

    it("warns about low resolution but allows it", () => {
        expect(checkPhoto({ width: 400, height: 300 })).toMatchObject({ severity: "warn", issue: "low_resolution" });
        expect(checkPhoto({ width: RECOMMENDED_SIDE_PX, height: RECOMMENDED_SIDE_PX }).severity).toBe("ok");
    });

    it("warns about panoramas and thin strips in either orientation", () => {
        expect(checkPhoto({ width: 4000, height: 1000 })).toMatchObject({ severity: "warn", issue: "too_narrow" });
        expect(checkPhoto({ width: 1000, height: 4000 })).toMatchObject({ severity: "warn", issue: "too_narrow" });
        expect(checkPhoto({ width: 3000, height: 1000 }).severity).toBe("ok");
    });

    it("blocks a file over the size limit, when a limit is given", () => {
        const limit = 10 * 1024 * 1024;
        expect(checkPhoto({ width: 3000, height: 4000, fileSize: limit + 1 }, limit)).toMatchObject({
            severity: "block",
            issue: "too_large",
            message: "That photo is larger than 10 MB. Choose a smaller one.",
        });
        expect(checkPhoto({ width: 3000, height: 4000, fileSize: limit }, limit).severity).toBe("ok");
        expect(checkPhoto({ width: 3000, height: 4000, fileSize: limit * 5 }).severity).toBe("ok");
    });

    it("lets the server decide when the size is unknown", () => {
        expect(checkPhoto({}).severity).toBe("ok");
        expect(checkPhoto({ width: null, height: 0 }).severity).toBe("ok");
    });
});
