/** Mock data for the patron profile draft (F:\relay-profile-tsx). Replace with API wiring later. */

export const PATRON_PROFILE_DRAFT_VIEWER = {
  displayName: "Elena Voss",
  handle: "elena.voss",
  roleLabel: "Curator",
  bio:
    "Independent curator and lifelong patron. Collecting quiet moments, light studies, and the spaces between brushstrokes.",
  avatarUrl: "/placeholder.svg?height=512&width=512&text=EV",
} as const;

export const PATRON_PROFILE_DRAFT_PATRONAGE = [
  { id: "p1", name: "Marcus Hale", avatarUrl: "/placeholder.svg?height=128&width=128&text=MH" },
  { id: "p2", name: "Iris Moreau", avatarUrl: "/placeholder.svg?height=128&width=128&text=IM" },
  { id: "p3", name: "August Reyn", avatarUrl: "/placeholder.svg?height=128&width=128&text=AR" },
  { id: "p4", name: "Theo Lin", avatarUrl: "/placeholder.svg?height=128&width=128&text=TL" },
  { id: "p5", name: "Niko Brandt", avatarUrl: "/placeholder.svg?height=128&width=128&text=NB" },
  { id: "p6", name: "Sava Ortiz", avatarUrl: "/placeholder.svg?height=128&width=128&text=SO" },
] as const;

export const PATRON_PROFILE_DRAFT_COLLECTIONS = [
  {
    id: "c1",
    title: "Hand Studies",
    count: 24,
    year: "2019 — 2024",
    coverUrl: "/placeholder.svg?height=768&width=768&text=Hands",
  },
  {
    id: "c2",
    title: "Lighting",
    count: 38,
    year: "2020 — 2024",
    coverUrl: "/placeholder.svg?height=768&width=768&text=Light",
  },
  {
    id: "c3",
    title: "Portraits in Green",
    count: 17,
    year: "2022 — 2024",
    coverUrl: "/placeholder.svg?height=768&width=768&text=Green",
  },
  {
    id: "c4",
    title: "Quiet Landscapes",
    count: 29,
    year: "2018 — 2024",
    coverUrl: "/placeholder.svg?height=768&width=768&text=Land",
  },
] as const;

export const PATRON_PROFILE_DRAFT_FAVORITES = [
  {
    id: "f1",
    title: "Rose, Black Vase",
    artist: "M. Hale",
    imageUrl: "/placeholder.svg?height=768&width=768&text=Rose",
  },
  {
    id: "f2",
    title: "Skylight Study II",
    artist: "I. Moreau",
    imageUrl: "/placeholder.svg?height=768&width=768&text=Skylight",
  },
  {
    id: "f3",
    title: "Figure in Repose",
    artist: "A. Reyn",
    imageUrl: "/placeholder.svg?height=768&width=768&text=Figure",
  },
  {
    id: "f4",
    title: "Emerald Field",
    artist: "T. Lin",
    imageUrl: "/placeholder.svg?height=768&width=768&text=Emerald",
  },
] as const;
