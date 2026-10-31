import './globals.css';
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from 'next/font/google';
import { LeagueProvider } from '../components/LeagueProvider';
import BottomNav from '../components/BottomNav';

export const metadata = {
  title: 'Holm League Parlay',
  description: 'Live weekly parlay tracker for Our Holm League',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/favicon-48.png', sizes: '48x48', type: 'image/png' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], shortcut: '/favicon.ico', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Holm Parlay', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0f14',
};

const sans = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--f-sans', display: 'swap' });
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700'], variable: '--f-display', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500'], variable: '--f-mono', display: 'swap' });

// Apply the saved theme before first paint so light mode does not flash dark.
const THEME_SCRIPT = "try{document.documentElement.dataset.theme=localStorage.getItem('hp_theme')||'dark'}catch(e){document.documentElement.dataset.theme='dark'}";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <LeagueProvider>
          <div className="wrap">{children}</div>
          <BottomNav />
        </LeagueProvider>
      </body>
    </html>
  );
}
