import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Relay · Get started',
  description: 'Elevate your Patreon — more reach for creators, more art for collectors. Set up in three quick steps.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased">
        <svg
          className="pointer-events-none fixed h-0 w-0 overflow-hidden"
          aria-hidden
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/*
              Subtle paper grain for hero “Relay” (relay-hero-relay-fg). Noise is masked
              to glyph alpha, then soft-lit into SourceGraphic. Not via background-clip+blend
              (broken with clip: text in most Chromium builds).
            */}
            <filter
              id="relay-hero-fg-texture"
              x="-5%"
              y="-5%"
              width="110%"
              height="110%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.7"
                numOctaves="2"
                result="raw"
              />
              <feColorMatrix
                in="raw"
                type="saturate"
                values="0"
                result="gry"
              />
              <feComponentTransfer in="gry" result="gmask">
                <feFuncA type="linear" slope="0.55" />
              </feComponentTransfer>
              <feComposite
                in="gmask"
                in2="SourceGraphic"
                operator="in"
                result="nonly"
              />
              <feBlend
                in="SourceGraphic"
                in2="nonly"
                mode="soft-light"
              />
            </filter>
          </defs>
        </svg>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
