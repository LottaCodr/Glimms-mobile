import React from "react";
import { LegalDocument } from "@/components/legal/LegalDocument";

export default function TermsScreen() {
    return (
        <LegalDocument
            title="Terms of Service"
            updated="August 11, 2026"
            sections={[
                {
                    heading: "1. The Service",
                    body: "Glimms is an AI-assisted styling application. It analyses photos you upload (wardrobe, room or garden items) and returns design suggestions. Suggestions are generated content and carry no guarantee of fitness for any purpose.",
                },
                {
                    heading: "2. Your Account",
                    body: "You are responsible for the credentials on your account and for everything uploaded through it. You must be at least 13 years old to create an account. You can deactivate your account at any time from Profile.",
                },
                {
                    heading: "3. Your Content",
                    body: "You retain ownership of photos you upload. You grant Glimms a limited, revocable licence to process them solely to operate the design pipeline (analysis, embeddings, mockup generation) and to display them back to you. We do not sell your images.",
                },
                {
                    heading: "4. Fair Use & Limits",
                    body: "Free accounts have a daily scan limit; paid tiers raise it. Attempting to circumvent rate limits, quotas or authentication is prohibited and may lead to suspension.",
                },
                {
                    heading: "5. Subscriptions",
                    body: "Paid plans are processed by Stripe. By starting a subscription you agree to Stripe's terms. Subscriptions renew until cancelled; you can manage or cancel billing at any time. Refunds are handled per applicable law.",
                },
                {
                    heading: "6. Acceptable Use",
                    body: "Do not upload content you do not own, illegal content, or images of other people without consent. Do not probe, scrape or disrupt the service.",
                },
                {
                    heading: "7. Liability",
                    body: "Glimms is provided \"as is\". To the maximum extent permitted by law, we are not liable for indirect or consequential damages arising from use of the service.",
                },
                {
                    heading: "8. Contact",
                    body: "Questions about these terms: legal@glimms.ai",
                },
            ]}
        />
    );
}
