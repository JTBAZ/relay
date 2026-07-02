import Link from "next/link";

export function PatronProfileDraftTopBar() {
  return (
    <div className="absolute left-0 right-0 top-0 z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <Link href="/feed" className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-primary shadow-[var(--shadow-glow)]" />
        <span className="text-sm font-medium tracking-[0.2em] text-foreground">RELAY</span>
      </Link>
      <nav className="hidden items-center gap-8 text-xs uppercase tracking-[0.2em] text-muted-foreground md:flex">
        <Link href="/feed" className="transition-colors hover:text-foreground">
          Feed
        </Link>
        <Link href="/library" className="transition-colors hover:text-foreground">
          Library
        </Link>
        <span className="text-foreground">Profile</span>
      </nav>
    </div>
  );
}
