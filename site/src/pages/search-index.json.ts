import type { APIRoute } from 'astro';
import { getProjects, tagCounts } from '../lib/projects';
import { siteConfig } from '../config';
import { withBase } from '../lib/url';
import type { SearchItem } from '../lib/search';

/** Build-time index for the command palette: every project, page and tag filter. */
export const GET: APIRoute = async () => {
  const projects = await getProjects();
  const items: SearchItem[] = [
    { kind: 'page', title: 'Home', hint: 'Start here', url: withBase(''), keywords: 'home start' },
    { kind: 'page', title: 'Work', hint: 'All projects, filterable', url: withBase('work/'), keywords: 'projects portfolio reports' },
    ...(siteConfig.liveLab.enabled ? [{ kind: 'page' as const, title: 'Live Lab', hint: 'Live embedded reports and the code behind them', url: withBase('live-lab/'), keywords: 'embed rls persona demo live' }] : []),
    { kind: 'page', title: 'Apps', hint: 'AI-built apps', url: withBase('apps/'), keywords: 'ai prototypes' },
    { kind: 'page', title: 'About', hint: 'Bio, résumé and links', url: withBase('about/'), keywords: 'bio resume contact email linkedin github' },
    ...projects.map((p) => ({ kind: (p.data.kind === 'app' ? 'app' : 'project') as SearchItem['kind'], title: p.data.title, hint: p.data.summary, url: p.href, keywords: [...p.data.tags, ...p.data.tools, p.data.kind, p.data.group, p.data.client_label ?? ''].join(' ') })),
    ...tagCounts(projects.filter((p) => p.data.kind !== 'app')).map((t) => ({ kind: 'tag' as const, title: `Filter: ${t.label}`, hint: `${t.count} project${t.count === 1 ? '' : 's'}`, url: `${withBase('work/')}?tag=${t.key}`, keywords: `${t.key} ${t.group} tag filter` })),
  ];
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
