"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import logger from "@/lib/browser-logger";

/**
 * TopAds Analytics Script Component
 * - Loads the TopAds script and configuration
 * - Handles script loading errors
 * - Triggers TopAds SPA function on route changes
 */
export default function TopAds() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);

  // SPA Navigation Handler
  useEffect(() => {
    // Skip the first run (initial mount)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Function to trigger TopAds SPA
    const triggerTopAdsSPA = () => {
      try {
        if (
          typeof window !== "undefined" &&
          window.topAds &&
          typeof window.topAds.spa === "function"
        ) {
          logger.info("[TopAds] Triggering SPA navigation");
          window.topAds.spa();
        } else {
          logger.warn("[TopAds] topAds.spa() not available yet");
        }
      } catch (error) {
        logger.error("[TopAds] Error triggering SPA:", error);
      }
    };

    // Trigger on route change (pathname or searchParams change)
    logger.info("[TopAds] Next.js route change detected");
    // Small timeout to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      triggerTopAdsSPA();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [pathname, searchParams]);

  return (
    <>
      <Script
        id="topads-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.topAds = window.topAds || {};

            topAds.config = {
              domain: "KARD_US",
              networkCode: "23333454576",
              lazyLoad: "soft",
              pageSetting: {
                exclude: [
                  "/contact-us",
                  "/privacy-policy",
                  "/terms",
                  "/cookie-policy",
                  "/about-us",
                  "/quiz",
                ],
              },
              formats: {
                interstitial: {
                  status: "active",
                  exclude: ["/credit-card-recommender-p3"],
                },
                offerwall: {
                  status: "active",
                  logoUrl:
                    "https://media.topfinanzas.com/images/kardtrust/kardtrust-logo-dark.webp",
                  websiteName: "KardTrust",
                  cooldown: "12",
                  exclude: [
                    "/credit-card-recommender-p2",
                    "/credit-card-recommender-p3",
                  ],
                },
              },
            };
          `,
        }}
      />
      <Script
        id="topads-script"
        // La query ?v= existe para poder invalidar la caché de los navegadores.
        //
        // topAds.min.js se sirvió durante meses con 'Cache-Control: immutable' y un año de
        // max-age. Las copias ya guardadas conservan ESAS cabeceras: corregirlas en el
        // servidor no alcanza a quien ya tiene el archivo, y el navegador no vuelve a
        // pedirlo hasta 2027. Medido el 2026-09-21: un arreglo desplegado no llegaba a
        // ningún visitante recurrente.
        //
        // Cambiar este valor crea una URL nueva, que ninguna caché tiene, y el arreglo llega
        // de inmediato. Súbelo cada vez que se despliegue un cambio de topAds que deba
        // llegar ya; si no, déjalo quieto y la caché de 5 minutos hace su trabajo.
        src="https://topads.topnetworks.co/topAds.min.js?v=20260921"
        strategy="afterInteractive"
        data-cfasync="false"
        defer={true}
        onLoad={() => {
          if (typeof window !== "undefined") {
            window.performance?.mark("topads-loaded");
            logger.info("[TopAds] Script loaded successfully");
          }
        }}
        onError={(e) => {
          logger.error("TopAds Script failed to load", e);
        }}
      />
    </>
  );
}

// Type declaration for TypeScript
declare global {
  interface Window {
    topAds?: {
      config?: Record<string, unknown>;
      spa?: () => void;
    };
  }
}
