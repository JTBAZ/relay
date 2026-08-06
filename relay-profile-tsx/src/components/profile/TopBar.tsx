export function TopBar() {
  return (
    <div className="absolute left-0 right-0 top-0 z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-primary shadow-[var(--shadow-glow)]" />
        <span className="text-sm font-medium tracking-[0.2em] text-foreground">
          RELAY
        </span>
      </div>
      <nav className="hidden items-center gap-8 text-xs uppercase tracking-[0.2em] text-muted-foreground md:flex">
        <a href="#" className="transition-colors hover:text-foreground">Discover</a>
        <a href="#" className="transition-colors hover:text-foreground">Patrons</a>
        <a href="#" className="text-foreground">Profile</a>
      </nav>
    </div>
  );
}
