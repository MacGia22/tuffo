import { describe, expect, it } from "vitest";
import { installPlatform } from "../install";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1",
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
};

describe("installPlatform", () => {
  it("shows the iPhone steps in any iOS browser, and on an iPad that reports a Mac", () => {
    expect(installPlatform(UA.iphone, { standalone: false })).toBe("ios");
    expect(installPlatform(UA.iphoneChrome, { standalone: false })).toBe("ios");
    expect(installPlatform(UA.ipadAsMac, { standalone: false, maxTouchPoints: 5 })).toBe("ios");
  });

  it("shows the Android steps on Android", () => {
    expect(installPlatform(UA.android, { standalone: false })).toBe("android");
  });

  it("shows the desktop steps in Chrome and Edge on a computer", () => {
    expect(installPlatform(UA.windowsEdge, { standalone: false })).toBe("desktop");
  });

  it("shows nothing where installing is not possible, or when already installed", () => {
    expect(installPlatform(UA.macSafari, { standalone: false, maxTouchPoints: 0 })).toBeNull();
    expect(installPlatform(UA.firefox, { standalone: false })).toBeNull();
    expect(installPlatform(UA.iphone, { standalone: true })).toBeNull();
  });
});
