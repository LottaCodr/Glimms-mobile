import React from "react";
import { LegalDocument } from "@/components/legal/LegalDocument";

export default function PrivacyScreen() {
    return (
        <LegalDocument
            title="Privacy Policy"
            updated="August 11, 2026"
            sections={[
                {
                    heading: "1. What We Collect",
                    body: "Account details (email, name), style preferences you enter (occupation, style goals, occasions, cultural context), approximate location if you grant it, photos you scan, and analytics events describing feature usage.",
                },
                {
                    heading: "2. How We Use It",
                    body: "Photos and preferences feed the AI design pipeline (object detection, attribute extraction, embeddings, reasoning, mockup generation). Location powers climate-aware recommendations. Analytics events help us improve the product.",
                },
                {
                    heading: "3. What We Never Do",
                    body: "We never sell your personal data or your photos. We never use your wardrobe images for advertising. We do not train public models on your private uploads.",
                },
                {
                    heading: "4. Storage & Security",
                    body: "Passwords are hashed (bcrypt). Session tokens are short-lived and refresh tokens are stored only as hashes. Images live in private cloud storage and are served back to you via short-lived signed URLs.",
                },
                {
                    heading: "5. Third Parties",
                    body: "Stripe processes payments (they receive only billing details). Push notifications are delivered via Firebase. Weather context comes from Open-Meteo using coordinates, not your identity.",
                },
                {
                    heading: "6. Retention & Deletion",
                    body: "Deactivating your account hides your profile, catalog and saved designs. You can delete individual catalog items and saved designs at any time. Contact privacy@glimms.ai for full export or erasure requests.",
                },
                {
                    heading: "7. Contact",
                    body: "Privacy questions or data requests: privacy@glimms.ai",
                },
            ]}
        />
    );
}
