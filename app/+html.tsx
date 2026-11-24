import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Custom HTML document for Expo Router Web.
 * Optimizes viewport, PWA/mobile-web meta tags, and dark-mode base styles
 * so GLIMMS feels like a native app on mobile browsers.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#09090B" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GLIMMS" />
        <title>GLIMMS — AI Personal Stylist</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                margin: 0;
                padding: 0;
                background-color: #09090B;
                color: #F5F5F7;
                overscroll-behavior-y: none;
                -webkit-tap-highlight-color: transparent;
                -webkit-font-smoothing: antialiased;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
