import { useEffect, useMemo, useState } from "react";

const GPT_SCRIPT_SRC = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
const GPT_SCRIPT_ID = "google-publisher-tag-script";
const DEFAULT_SIZES: number[][] = [[300, 250], [336, 280], [320, 50]];

type GamStatus = "idle" | "loading" | "ready" | "failed";

type GoogleTagSlot = {
  addService(service: unknown): GoogleTagSlot;
  setTargeting?(key: string, value: string | string[]): GoogleTagSlot;
};

type GoogleTagApi = {
  apiReady?: boolean;
  cmd: Array<() => void>;
  defineSlot(adUnitPath: string, sizes: number[][], slotElementId: string): GoogleTagSlot | null;
  pubads(): {
    enableSingleRequest?: () => void;
  };
  enableServices(): void;
  display(slotElementId: string): void;
  destroySlots?: (slots?: GoogleTagSlot[]) => boolean;
};

declare global {
  interface Window {
    googletag?: GoogleTagApi;
  }
}

let gptLoadPromise: Promise<void> | null = null;
let servicesEnabled = false;

function getGoogletag(): GoogleTagApi {
  if (!window.googletag) {
    window.googletag = { cmd: [] } as GoogleTagApi;
  }
  if (!window.googletag.cmd) {
    window.googletag.cmd = [];
  }
  return window.googletag;
}

function loadGptScript(): Promise<void> {
  const googletag = getGoogletag();
  if (googletag.apiReady) {
    return Promise.resolve();
  }

  if (gptLoadPromise) {
    return gptLoadPromise;
  }

  gptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GPT_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load GPT script.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GPT_SCRIPT_ID;
    script.async = true;
    script.src = GPT_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load GPT script."));
    document.head.appendChild(script);
  });

  return gptLoadPromise;
}

function parseSizes(rawSizes?: string): number[][] {
  if (!rawSizes) {
    return DEFAULT_SIZES;
  }

  const parsed = rawSizes
    .split(",")
    .map((value) => value.trim())
    .map((value) => value.toLowerCase().split("x"))
    .map(([width, height]) => [Number(width), Number(height)])
    .filter(([width, height]) => Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0);

  return parsed.length > 0 ? parsed : DEFAULT_SIZES;
}

type GoogleAdSlotProps = {
  adUnitPath?: string;
  slotElementId: string;
  sizes?: number[][];
  className?: string;
  testId?: string;
};

const GoogleAdSlot: React.FC<GoogleAdSlotProps> = ({
  adUnitPath,
  slotElementId,
  sizes,
  className,
  testId,
}) => {
  const [status, setStatus] = useState<GamStatus>("idle");

  const resolvedSizes = useMemo(() => {
    if (sizes && sizes.length > 0) {
      return sizes;
    }
    return parseSizes(import.meta.env.VITE_GAM_SCAN_LIMIT_SIZES);
  }, [sizes]);

  const isConfigured = Boolean(adUnitPath);

  useEffect(() => {
    if (!isConfigured || !adUnitPath) {
      return;
    }

    let cancelled = false;
    let createdSlot: GoogleTagSlot | null = null;
    setStatus("loading");

    loadGptScript()
      .then(() => {
        if (cancelled) {
          return;
        }

        const googletag = getGoogletag();
        googletag.cmd.push(() => {
          if (cancelled) {
            return;
          }

          const slot = googletag.defineSlot(adUnitPath, resolvedSizes, slotElementId);
          if (!slot) {
            setStatus("failed");
            return;
          }

          slot.addService(googletag.pubads());

          if (!servicesEnabled) {
            googletag.pubads().enableSingleRequest?.();
            googletag.enableServices();
            servicesEnabled = true;
          }

          createdSlot = slot;
          googletag.display(slotElementId);
          setStatus("ready");
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("failed");
        }
      });

    return () => {
      cancelled = true;
      if (createdSlot) {
        const googletag = getGoogletag();
        googletag.cmd.push(() => {
          googletag.destroySlots?.([createdSlot as GoogleTagSlot]);
        });
      }
    };
  }, [adUnitPath, isConfigured, resolvedSizes, slotElementId]);

  return (
    <div className={className} data-testid={testId} role="region" aria-label="Sponsored ad">
      <p className="redirect-not-found__ad-label">Sponsored</p>
      {!isConfigured && (
        <>
          <h2>Ad Slot Placeholder</h2>
          <p>
            Google Ad Manager is not configured yet. Set
            {" "}VITE_GAM_SCAN_LIMIT_AD_UNIT_PATH to enable this ad slot.
          </p>
        </>
      )}
      {isConfigured && (
        <>
          <div id={slotElementId} className="redirect-not-found__ad-frame" />
          {status === "loading" && <p>Loading sponsored placement...</p>}
          {status === "failed" && <p>Ad could not load. Please try again in a moment.</p>}
        </>
      )}
    </div>
  );
};

export default GoogleAdSlot;