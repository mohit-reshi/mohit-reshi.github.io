import { siteConfig } from '../config';
export const personJsonLd = (url: string) => ({
  '@context': 'https://schema.org', '@type': 'Person', name: siteConfig.name, jobTitle: 'Power BI & Microsoft Fabric developer', description: siteConfig.description, url,
  address: { '@type': 'PostalAddress', addressCountry: 'IN' },
  knowsAbout: ['Power BI', 'Microsoft Fabric', 'DAX', 'Row-level security', 'Embedded analytics', 'Paginated reports'],
  sameAs: [siteConfig.links.linkedin, siteConfig.links.github].filter((l) => l && !l.includes('your-handle')),
});
