"use client";

/** "Change" on the assumptions bar: opens the pool details below and moves focus there. */
export function ChangeLink({ target }: { target: string }) {
  return (
    <a
      href={`#${target}`}
      onClick={(e) => {
        const details = document.getElementById(target);
        if (!(details instanceof HTMLDetailsElement)) return;
        e.preventDefault();
        details.open = true;
        details.scrollIntoView({ behavior: "smooth", block: "center" });
        details.querySelector("input")?.focus({ preventScroll: true });
      }}
      className="inline-flex min-h-11 items-center font-semibold text-lagoon underline-offset-2 hover:underline"
    >
      Change
    </a>
  );
}
