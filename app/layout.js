import './globals.css';
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { LeagueProvider } from '../components/LeagueProvider';
import BottomNav from '../components/BottomNav';
import BookingHost from '../components/BookingHost';
import rawLore from '../league-lore.json';
import nicknames from '../data/nicknames.json';
import { withNicknames } from '../lib/nicknames.mjs';
import { THEME_COLORS, THEME_SCRIPT } from '../lib/theme.mjs';

const lore = withNicknames(rawLore, nicknames);

const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://holm-parlay.vercel.app';

export const metadata = {
  metadataBase: new URL(SITE),
  openGraph: { siteName: 'Our Holm League', type: 'website', title: 'Our Holm League', description: 'League history, the chat and the weekly parlay' },
  twitter: { card: 'summary_large_image' },
  title: 'Our Holm League',
  description: 'Our Holm League: 16 seasons of league history, the chat, and the weekly parlay',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/favicon-48.png', sizes: '48x48', type: 'image/png' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], shortcut: '/favicon.ico', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Holm League', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // No-JS fallback; the theme script replaces these with the color of the chosen theme.
  themeColor: [{ media: '(prefers-color-scheme: light)', color: THEME_COLORS.light }, { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark }],
};

const sans = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--f-sans', display: 'swap' });
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700'], variable: '--f-display', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500'], variable: '--f-mono', display: 'swap' });

// The saved theme (THEME_SCRIPT, lib/theme.mjs) is applied before first paint so light mode does not flash dark.

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <LeagueProvider lore={lore}>
          <div className="wrap">{children}</div>
          <BottomNav />
          <BookingHost />
        </LeagueProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
