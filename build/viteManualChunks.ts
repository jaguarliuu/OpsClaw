const CHUNK_RULES: Array<{ match: RegExp; chunkName: string }> = [
  { match: /node_modules\/@xterm\//, chunkName: 'vendor-xterm' },
  { match: /node_modules\/(?:react|react-dom|scheduler)\//, chunkName: 'vendor-react' },
  { match: /node_modules\/react-router/, chunkName: 'vendor-router' },
  { match: /node_modules\/@radix-ui\//, chunkName: 'vendor-radix' },
  { match: /node_modules\/(?:react-markdown|remark-gfm|remark-parse|remark-rehype|rehype[\w-]*)\//, chunkName: 'vendor-markdown' },
  { match: /node_modules\/lucide-react\//, chunkName: 'vendor-icons' },
  {
    match: /node_modules\/(?:clsx|tailwind-merge|class-variance-authority|radix-ui)\//,
    chunkName: 'vendor-ui',
  },
];

export function resolveManualChunk(id: string) {
  for (const rule of CHUNK_RULES) {
    if (rule.match.test(id)) {
      return rule.chunkName;
    }
  }

  return undefined;
}
