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
    // Only run in the browser
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
 * AdZep Centralized Handler
 * - Single centralized component for AdZep activation
 * - Activates ads exactly ONCE per route, and never re-activates for a route already done
 * - Designed to be used in the Header component for consistent activation
 */

// Module scope on purpose: these must survive effect re-runs AND component remounts.
//
// They used to live inside the effect, so they reset on every pathname change and the
// debounce could not span navigations. Together with the popstate listener this file used
// to register, that produced a real bug: closing an offerwall fired a fresh
// AdZepActivateAds() call which RE-ARMED the gate the user had just satisfied. The page
// stayed scroll-locked showing "View ad to continue", and the second click unlocked it
// without serving a new ad, because the view had already been credited.

let lastActivatedPathname: string | null = null;
let lastActivationTime = 0;
const DEBOUNCE_DELAY = 500;

export function AdZepCentralizedHandler() {
  const pathname = usePathname();

  useEffect(() => {
    // Only run in the browser
    if (typeof window === "undefined") return;

    const activateAds = () => {
      // Hard guard: one activation per route. Re-activating re-arms interstitial and
      // offerwall units the user has already satisfied, which is what locked the page.
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

    // No popstate listener here on purpose.
    //
    // usePathname() already updates on browser back/forward in the App Router, so this
    // effect re-runs and handles those navigations. The old listener was redundant AND
    // harmful: ad SDKs touch history when their overlay closes, so it fired right after
    // the user finished an offerwall and re-armed the gate.
    if (window.AdZepActivateAds) {
      activateAds();
      return;
    }

    // Script not loaded yet: retry once. Single cleanup path, unlike the previous version
    // where an early return meant the listener was registered only on some load timings.
    const timeoutId = setTimeout(activateAds, 1000);
    return () => clearTimeout(timeoutId);
  }, [pathname]);

  return null;
}
