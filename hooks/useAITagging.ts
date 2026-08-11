import { UploadImage } from "@/store/upload.store";

// hooks/useAITagging.ts
export function useAITagging() {
    const tagImages = async (images: UploadImage[]) => {
        return fetch("/ai/tag", {
            method: "POST",
            body: JSON.stringify({ images }),
        }).then(res => res.json());
    };

    return { tagImages };
}
