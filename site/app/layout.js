import './globals.css';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

const SITE = 'https://ai-command-center.dev';

export const metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'AI Command Center — one gateway, every AI project, one dashboard',
    template: '%s — AI Command Center',
  },
  description:
    'A dependency-free LLM gateway and self-hosted usage/cost dashboard. Point any project at it — any language, one command — and see tokens, cost and latency across every AI product in one place.',
  keywords: ['LLM', 'observability', 'cost tracking', 'OpenAI', 'Anthropic', 'Gemini', 'gateway', 'self-hosted', 'LLMOps'],
  authors: [{ name: 'Aditya Sarade' }],
  openGraph: {
    title: 'AI Command Center',
    description: 'One gateway, every AI project, one dashboard. Self-hosted LLM usage & cost tracking with zero dependencies.',
    type: 'website',
    url: SITE,
  },
  twitter: { card: 'summary_large_image', title: 'AI Command Center', description: 'Self-hosted LLM usage & cost dashboard. Any language, one command.' },
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230c0d10'/%3E%3Cpath d='M16 5 27 16 16 27 5 16Z' fill='none' stroke='%234c8dff' stroke-width='2.5'/%3E%3Ccircle cx='16' cy='16' r='3' fill='%2321c17a'/%3E%3C/svg%3E",
      },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
