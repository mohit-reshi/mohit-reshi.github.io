import type { APIRoute } from 'astro';
import { getProjects } from '../../lib/projects';
import { tagMeta } from '../../lib/taxonomy';
import { ogCard } from './_card';

export async function getStaticPaths() {
  const all = await getProjects();
  return [...all.map((project) => ({ params: { slug: project.slug }, props: { title: project.data.title, sub: project.data.summary, tags: project.data.tags.map((t) => tagMeta(t).label) } })),
    { params: { slug: 'default' }, props: { title: 'Power BI & Fabric developer specializing in embedded analytics', sub: 'Row-level security, effective identity, DirectLake, DAX and paginated reports.', tags: ['Power BI', 'Fabric', 'RLS', 'DAX'] } }];
}
export const GET: APIRoute = async ({ props }) => new Response(new Uint8Array(await ogCard(props.title, props.sub, props.tags)), { headers: { 'Content-Type': 'image/png' } });
