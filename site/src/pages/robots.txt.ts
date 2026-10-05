import type { APIRoute } from 'astro';
import { absoluteUrl } from '../lib/url';

export const GET: APIRoute = ({ site }) => new Response(`User-agent: *\nAllow: /\nDisallow: /design/\n\nSitemap: ${absoluteUrl('sitemap.xml', site)}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
