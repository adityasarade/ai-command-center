const SITE = 'https://ai-command-center.vercel.app';
const paths = [
  '', '/docs', '/docs/install', '/docs/integrate', '/docs/config', '/docs/auth',
  '/docs/providers', '/docs/self-hosting', '/docs/security', '/docs/api',
  '/docs/comparison', '/docs/faq',
];

export default function sitemap() {
  return paths.map((p) => ({ url: `${SITE}${p}`, changeFrequency: 'monthly', priority: p === '' ? 1 : 0.6 }));
}
