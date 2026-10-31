import './globals.css';
import { LeagueProvider } from '../components/LeagueProvider';
import BottomNav from '../components/BottomNav';

export const metadata = {
  title: 'Holm League Parlay',
  description: 'Live weekly parlay tracker for Our Holm League',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }], apple: '/icon-192.png' },
  appleWebApp: { capable: true, title: 'Holm Parlay', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0f14',
};

// Apply the saved theme before first paint so light mode does not flash dark.
const THEME_SCRIPT = "try{document.documentElement.dataset.theme=localStorage.getItem('hp_theme')||'dark'}catch(e){document.documentElement.dataset.theme='dark'}";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet" />
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
