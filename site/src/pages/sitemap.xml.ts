import type { APIRoute } from 'astro';
import { getProjects } from '../lib/projects';
import { siteConfig } from '../config';
import { absoluteUrl } from '../lib/url';

export const GET: APIRoute = async ({ site }) => {
  const projects = await getProjects();
  const pages = ['', 'work/', 'apps/', 'about/', ...(siteConfig.liveLab.enabled ? ['live-lab/'] : []), ...projects.map((p) => `work/${p.slug}/`)];
  const today = new Date().toISOString().slice(0, 10);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${absoluteUrl(p, site)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
