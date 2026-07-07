export const DOCS_NAV = [
  {
    group: 'Start here',
    items: [
      ['/docs', 'Overview'],
      ['/docs/install', 'Install & run'],
      ['/docs/integrate', 'Integrate a project'],
      ['/docs/features', 'Traces, prompts & budgets'],
    ],
  },
  {
    group: 'Operate',
    items: [
      ['/docs/config', 'Configuration'],
      ['/docs/auth', 'Auth & teams'],
      ['/docs/providers', 'Providers & pricing'],
      ['/docs/self-hosting', 'Self-hosting'],
      ['/docs/security', 'Security'],
    ],
  },
  {
    group: 'Reference',
    items: [
      ['/docs/api', 'HTTP API'],
      ['/docs/comparison', 'Comparison'],
      ['/docs/faq', 'FAQ'],
    ],
  },
];

// Flattened order for prev/next.
export const DOCS_ORDER = DOCS_NAV.flatMap((g) => g.items);
