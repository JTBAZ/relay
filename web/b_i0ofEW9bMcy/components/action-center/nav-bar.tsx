"use client"

import Link from "next/link"
import { Activity, BookOpen, FlaskConical, GalleryHorizontalEnd, Pencil, User } from "lucide-react"

const navLinks = [
  { label: "Library",       icon: BookOpen,             href: "/library" },
  { label: "Designer",      icon: Pencil,               href: "/designer" },
  { label: "Profile",       icon: User,                 href: "#" },
  { label: "Action Center", icon: Activity,             href: "/", active: true },
  { label: "Gallery",       icon: GalleryHorizontalEnd, href: "#" },
  { label: "Dev bench",     icon: FlaskConical,         href: "#" },
]

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 h-14 border-b border-border bg-surface-0/95 backdrop-blur-md">
      {/* Logo */}
      <div className="flex items-center gap-8">
        <span className="text-base font-semibold text-gold tracking-tight select-none">Relay</span>
        
        {/* Nav pills */}
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {navLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.label}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  link.active
                    ? "bg-accent text-primary-foreground"
                    : "text-text-lo hover:text-text-mid hover:bg-surface-2"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-mute">relaytestcreator@yahoo.com</span>
        <button className="px-3 py-1.5 rounded-full bg-surface-2 text-sm font-medium text-text-mid hover:bg-surface-3 transition-colors">
          Account
        </button>
      </div>
    </header>
  )
}
