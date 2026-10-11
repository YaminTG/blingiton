// Cache tags shared by the data layer (src/lib/data.ts) and the save hooks (src/hooks/revalidate.ts).
export const tags = {
  products: 'products',
  product: (id: number | string) => `product:${id}`,
  categories: 'categories',
  category: (id: number | string) => `category:${id}`,
  pages: 'pages',
  settings: 'site-settings',
  redirects: 'redirects',
} as const
