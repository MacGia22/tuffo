import type { ReactNode } from "react";
import type { InstallPlatform } from "@/lib/install";

/** Small line icons drawn like the browser buttons they point at (currentColor, 20 px). */
function Icon({ children }: { children: ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-lagoon"
    >
      {children}
    </svg>
  );
}

const MenuLines = () => (
  <Icon label="menu">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
const Share = () => (
  <Icon label="share">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </Icon>
);
const More = () => (
  <Icon label="more">
    <circle cx="6" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" />
  </Icon>
);
const MoreVertical = () => (
  <Icon label="menu">
    <circle cx="12" cy="6" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="18" r="1.2" fill="currentColor" />
  </Icon>
);
const AddSquare = () => (
  <Icon label="add">
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </Icon>
);
const PhoneDownload = () => (
  <Icon label="install">
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M12 8v6M9.5 11.5 12 14l2.5-2.5" />
  </Icon>
);
const MonitorDownload = () => (
  <Icon label="install">
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4M12 7v5M9.5 9.5 12 12l2.5-2.5" />
  </Icon>
);

interface Step {
  icon: ReactNode;
  text: ReactNode;
}

const STEPS: Record<Exclude<InstallPlatform, null>, Step[]> = {
  ios: [
    { icon: <MenuLines />, text: <>Tap the menu button next to the address</> },
    { icon: <Share />, text: <>Tap <strong>Share</strong></> },
    { icon: <More />, text: <>Tap <strong>View More</strong></> },
    { icon: <AddSquare />, text: <>Tap <strong>Add to Home Screen</strong></> },
  ],
  android: [
    { icon: <MoreVertical />, text: <>Tap the <strong>⋮</strong> menu at the top right</> },
    { icon: <PhoneDownload />, text: <>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong></> },
  ],
  desktop: [
    { icon: <MonitorDownload />, text: <>Click the install icon at the right of the address bar, or open the browser menu</> },
    { icon: <AddSquare />, text: <>Choose <strong>Install Tuffo</strong></> },
  ],
};

/** Numbered, icon-led steps for adding Tuffo to the home screen on this kind of device. */
export function InstallSteps({ platform }: { platform: Exclude<InstallPlatform, null> }) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5">
      {STEPS[platform].map((step, index) => (
        <li key={index} className="flex items-center gap-2 text-sm">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lagoon text-[11px] font-semibold text-white">
            {index + 1}
          </span>
          {step.icon}
          <span>{step.text}</span>
        </li>
      ))}
    </ol>
  );
}
