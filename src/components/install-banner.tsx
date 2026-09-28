"use client";

import { useEffect, useState } from "react";
import { installPlatform, type InstallPlatform } from "@/lib/install";

const DISMISSED_KEY = "tuffo.install-banner.dismissed";

/** Chrome and Edge fire this when the app can be installed with one tap. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "Add Tuffo to your home screen", with the steps for the device in hand. Hidden when
 * the app is already installed, on browsers that cannot install it, and after the
 * person closes it (remembered on this device only).
 */
export function InstallBanner() {
  const [platform, setPlatform] = useState<InstallPlatform>(null);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const detected = readDismissed() ? null : installPlatform(navigator.userAgent, { standalone, maxTouchPoints: navigator.maxTouchPoints });

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPlatform(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Reading the device happens only in the browser, so the first render matches the server's.
    const frame = window.requestAnimationFrame(() => setPlatform(detected));
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!platform) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode: it just shows again next time.
    }
    setPlatform(null);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    if (outcome === "accepted") setPlatform(null);
  }

  let steps: React.ReactNode;
  if (platform === "ios") {
    steps = (
      <>
        In Safari, tap <strong>Share</strong> <span aria-hidden="true">(the square with an arrow)</span>, then{" "}
        <strong>Add to Home Screen</strong>. In Chrome, tap <strong>Share</strong> in the address bar, then{" "}
        <strong>Add to Home Screen</strong>.
      </>
    );
  } else if (platform === "android") {
    steps = prompt ? (
      <>Install it for one-tap access, full screen, like any other app.</>
    ) : (
      <>
        Tap the <strong>⋮</strong> menu, then <strong>Add to Home screen</strong> or <strong>Install app</strong>.
      </>
    );
  } else {
    steps = prompt ? (
      <>Install it to open Tuffo in its own window.</>
    ) : (
      <>
        Click the install icon at the right end of the address bar, or the <strong>⋮</strong> /{" "}
        <strong>…</strong> menu, then <strong>Install Tuffo</strong>.
      </>
    );
  }

  return (
    <section
      aria-labelledby="install-title"
      className="flex flex-col gap-3 rounded-2xl border border-lagoon/30 bg-lagoon/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <h2 id="install-title" className="text-base font-semibold">
          {platform === "desktop" ? "Install Tuffo on this computer" : "Add Tuffo to your home screen"}
        </h2>
        <p className="text-sm text-muted">{steps}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {prompt ? (
          <button
            type="button"
            onClick={install}
            className="rounded-xl bg-lagoon px-4 py-2 text-sm font-semibold text-white hover:bg-lagoon-deep"
          >
            Install
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted hover:text-foreground"
        >
          {prompt ? "Not now" : "Got it"}
        </button>
      </div>
    </section>
  );
}
