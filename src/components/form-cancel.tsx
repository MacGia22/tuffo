import Link from "next/link";

/** Carries the page to go back to after Save (see src/lib/return-to.ts). */
export function ReturnTo({ value }: { value: string }) {
  return <input type="hidden" name="return_to" value={value} />;
}

const cancel =
  "inline-flex h-11 items-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold hover:border-lagoon";

/** Leaves a form without saving, back to where the person came from. */
export function CancelLink({ href, className = cancel }: { href: string; className?: string }) {
  return (
    <Link href={href} className={className}>
      Cancel
    </Link>
  );
}

/** Puts an always-open form back as it was. */
export function ResetButton({
  className = "text-sm text-muted underline-offset-2 hover:underline",
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button type="reset" onClick={onClick} className={className}>
      Cancel
    </button>
  );
}
