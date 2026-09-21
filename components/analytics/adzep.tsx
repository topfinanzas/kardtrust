"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import logger from "@/lib/browser-logger";

/**
 * AdZep Analytics Script Component
 * - Loads the AdZep script with proper Next.js script optimization
 * - Handles script loading with error handling and performance monitoring
 * - Integrates with the project's analytics infrastructure
 */
export default function AdZep() {
  useEffect(() => {
    // Mark AdZep script execution for performance monitoring
    if (typeof window !== "undefined") {
      window.performance?.mark("adzep-start");
    }
  }, []);

  return (
    <>
      {/* AdZep Script */}
      <Script
        id="adzep-script"
        src="https://autozep.adzep.io/paid/kardtrust.js"
        strategy="afterInteractive" // Load after page is interactive
        data-cfasync="false" // Preserve the original data-cfasync attribute
        onLoad={() => {
          // Mark AdZep script loaded for performance monitoring
          if (typeof window !== "undefined") {
            window.performance?.mark("adzep-loaded");
            window.performance?.measure(
              "adzep-execution",
              "adzep-start",
              "adzep-loaded",
            );
          }
        }}
        onError={(error) => {
          // Handle script loading errors
          logger.warn(
            {
              module: "adzep",
              error,
            },
            "AdZep script failed to load",
          );
        }}
      />
    </>
  );
}

/**
 * AdZep Activation Hook
 * - Provides a function to activate ads programmatically
 * - Can be used in components or event handlers
 */
export function useAdZep() {
  const activateAds = () => {
    if (typeof window !== "undefined" && window.AdZepActivateAds) {
      try {
        window.AdZepActivateAds();
      } catch (error) {
        logger.warn(
          {
            module: "adzep",
            error,
          },
          "Error activating AdZep ads",
        );
      }
    }
  };

  return { activateAds };
}

/**
 * AdZep Link Click Handler Component
 * - Simplified version that only handles link click tracking
 * - Does NOT call window.AdZepActivateAds() (handled by centralized handler)
 * - Kept for potential future link-specific analytics
 */
export function AdZepLinkHandler() {
  useEffect(() => {
    // Solo en el navegador
    if (typeof window === "undefined") return;

    const handleLinkClick = (event: Event) => {
      // Check if the clicked element is a link or inside a link
      const target = event.target as HTMLElement;
      const link = target.closest("a");

      if (link && process.env.NODE_ENV === "development") {
        logger.debug(
          {
            module: "adzep",
            href: link.href,
            text: link.textContent?.trim(),
          },
          "Link click detected",
        );
      }
    };

    // Add event listener for link clicks (passive tracking only)
    document.addEventListener("click", handleLinkClick);

    // Cleanup
    return () => {
      document.removeEventListener("click", handleLinkClick);
    };
  }, []);

  return null; // This component doesn't render anything
}

/**
 * AdZep Navigation Handler
 * - Simplified version that only handles navigation tracking
 * - Does NOT call window.AdZepActivateAds() (handled by centralized handler)
 * - Kept for potential future navigation-specific analytics
 */
export function AdZepNavigationHandler() {
  const pathname = usePathname();

  useEffect(() => {
    // Only run in the browser
    if (typeof window === "undefined") return;

    if (process.env.NODE_ENV === "development") {
      logger.debug(
        {
          module: "adzep",
          pathname,
        },
        "Navigation detected",
      );
    }
  }, [pathname]);

  return null;
}

/**
 * Manejador centralizado de AdZep
 * - Único punto de activación de AdZep
 * - Activa los anuncios EXACTAMENTE una vez por ruta, y nunca reactiva una ruta ya hecha
 * - Pensado para usarse desde el componente Header
 */

// A propósito en ámbito de módulo: deben sobrevivir a las re-ejecuciones del effect Y al
// remontaje del componente.
//
// Antes vivían dentro del effect, así que se reiniciaban en cada cambio de pathname y el
// debounce no podía abarcar una navegación. Junto con el listener de popstate que este
// archivo registraba, eso producía un bug real: al cerrar un offerwall se disparaba una
// nueva llamada a AdZepActivateAds() que RE-ARMABA el gate que el usuario acababa de
// satisfacer. La página quedaba con el scroll bloqueado mostrando "View ad to continue", y
// el segundo clic la desbloqueaba sin servir ningún anuncio, porque la vista ya estaba
// acreditada.

let lastActivatedPathname: string | null = null;
let lastActivationTime = 0;
const DEBOUNCE_DELAY = 500;

export function AdZepCentralizedHandler() {
  const pathname = usePathname();

  useEffect(() => {
    // Only run in the browser
    if (typeof window === "undefined") return;

    const activateAds = () => {
      // Guarda dura: una activación por ruta. Reactivar re-arma los interstitials y
      // offerwalls que el usuario ya satisfizo, que es lo que bloqueaba la página.
      if (lastActivatedPathname === pathname) {
        if (process.env.NODE_ENV === "development") {
          logger.debug(
            { module: "adzep", pathname },
            "Activation skipped: already activated for this route",
          );
        }
        return;
      }

      const now = Date.now();
      if (now - lastActivationTime < DEBOUNCE_DELAY) {
        if (process.env.NODE_ENV === "development") {
          logger.debug(
            { module: "adzep" },
            "Activation skipped due to debounce",
          );
        }
        return;
      }

      if (!window.AdZepActivateAds) {
        if (process.env.NODE_ENV === "development") {
          logger.warn(
            { module: "adzep" },
            "window.AdZepActivateAds not available",
          );
        }
        return;
      }

      try {
        window.AdZepActivateAds();
        lastActivatedPathname = pathname;
        lastActivationTime = now;

        if (process.env.NODE_ENV === "development") {
          logger.debug(
            { module: "adzep", pathname, timestamp: new Date().toISOString() },
            "Centralized activation successful",
          );
        }
      } catch (error) {
        logger.warn(
          { module: "adzep", error },
          "Error during centralized activation",
        );
      }
    };

    // Aquí no hay listener de popstate, a propósito.
    //
    // usePathname() ya se actualiza con atrás/adelante del navegador en el App Router, así
    // que este effect se vuelve a ejecutar y cubre esas navegaciones. El listener anterior
    // era redundante Y dañino: los SDK de anuncios tocan el historial al cerrar su overlay,
    // así que disparaba justo cuando el usuario terminaba el offerwall y re-armaba el gate.
    if (window.AdZepActivateAds) {
      activateAds();
      return;
    }

    // El script aún no ha cargado: se reintenta una vez. Una sola ruta de limpieza, a
    // diferencia de la versión anterior, donde un return temprano hacía que el listener
    // quedara registrado solo en algunos tiempos de carga.
    const timeoutId = setTimeout(activateAds, 1000);
    return () => clearTimeout(timeoutId);
  }, [pathname]);

  return null;
}
