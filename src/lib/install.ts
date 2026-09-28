/**
 * Which "add to home screen" steps to show, from the browser's user agent. Pure, so it
 * can be tested and used in the browser.
 */

export type InstallPlatform = "ios" | "android" | "desktop" | null;

export function installPlatform(userAgent: string, options: { standalone: boolean; maxTouchPoints?: number }): InstallPlatform {
  if (options.standalone) return null; // already opened from the home screen
  const ua = userAgent.toLowerCase();
  // iPadOS reports itself as a Mac; touch points give it away.
  const iPadAsMac = ua.includes("macintosh") && (options.maxTouchPoints ?? 0) > 1;
  if (/iphone|ipad|ipod/.test(ua) || iPadAsMac) return "ios";
  if (ua.includes("android")) return "android";
  // Desktop Chrome and Edge can install web apps; Firefox and Safari on a computer cannot.
  if ((ua.includes("chrome/") || ua.includes("edg/")) && !ua.includes("mobile")) return "desktop";
  return null;
}
