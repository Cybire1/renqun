import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif, JetBrains_Mono, Sora } from 'next/font/google';
import { Header } from '@/components/Header';
import { Providers } from '@/components/Providers';
import './globals.css';

const sora = Sora({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-sora', display: 'swap' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-jetbrains', display: 'swap' });
// One accent face: the italic half of a headline, and nothing else.
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: 'italic', variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
  ),
  title: { default: 'Renqun', template: '%s · Renqun' },
  description: 'Call Bitcoin’s next move. Five-minute and hourly rounds, paid in MUSD on Mezo, settled by the chain’s own Bitcoin price.',
  applicationName: 'Renqun',
  openGraph: {
    title: 'Renqun',
    description: 'Call Bitcoin’s next move. Get paid in MUSD.',
    siteName: 'Renqun',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Renqun', description: 'Call Bitcoin’s next move. Get paid in MUSD.' },
};

export const viewport: Viewport = {
  themeColor: '#F4F0ED',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable} ${mono.variable} ${serif.variable}`}>
      <body>
        <div className="grain" aria-hidden />
        <Providers>
          <Header />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
