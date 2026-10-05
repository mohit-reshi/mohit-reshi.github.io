// Single source of truth for project frontmatter (SPEC 6.1 + the apps extension).
// Used by the Astro content collection (with Astro's own `z`) and by tools/validate (with this package's zod).
export const KINDS = ['report', 'paginated', 'app', 'pipeline'];
export const GROUPS = ['portfolio', 'enterprise', 'app'];
export const STATUSES = ['live', 'recorded-only'];
export const APP_KINDS = ['static', 'external', 'repo-only'];
export const TAG_GROUPS = ['platform', 'skill', 'domain'];
export const CHAPTERS = ['Problem', 'Data model', 'Report', 'Under the hood', 'Outcome'];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

export function taxonomySchema(z) {
  return z.record(z.string().regex(KEBAB, 'tag keys are kebab-case'), z.object({
    label: z.string().min(1), group: z.enum(TAG_GROUPS), color: z.string().regex(HEX, 'color must be #RRGGBB'),
  }).strict());
}

/** @param z a zod namespace (Astro's or the package's)  @param tagKeys allowed tags from content/taxonomy.json */
export function projectSchema(z, tagKeys) {
  const mediaPath = z.string().regex(/^(?!\/|\.\.|[a-z]+:)[^\\]+$/, 'media paths are relative to the project folder (for example media/cover.webp)');
  const url = z.string().regex(/^https?:\/\/\S+$/, 'must be an http(s) URL');
  return z.object({
    slug: z.string().regex(KEBAB, 'slug must be kebab-case'),
    title: z.string().min(1),
    kind: z.enum(KINDS),
    group: z.enum(GROUPS),
    client_label: z.string().nullable().default(null),
    summary: z.string().min(1).max(160, 'summary must be 160 characters or fewer'),
    role: z.string().default(''),
    year: z.number().int().min(2000).max(2100),
    tools: z.array(z.string()).default([]),
    tags: z.array(z.string().refine((t) => tagKeys.includes(t), { message: 'unknown tag (add it to content/taxonomy.json)' })).default([]),
    featured: z.boolean().default(false),
    order: z.number().default(100),
    draft: z.boolean().default(false),
    sample: z.boolean().default(false),
    status: z.enum(STATUSES).default('recorded-only'),
    media: z.object({
      cover: mediaPath.default('media/cover.webp'),
      video: mediaPath.optional(),
      poster: mediaPath.optional(),
      before_after: z.object({ before: mediaPath, after: mediaPath, caption: z.string().default('') }).optional(),
    }).default({ cover: 'media/cover.webp' }),
    links: z.object({ repo: url.optional(), pbip: url.optional(), live: url.optional(), external: url.optional() }).default({}),
    live_lab: z.object({ enabled: z.boolean().default(false), report_key: z.string().nullable().default(null) }).default({ enabled: false, report_key: null }),
    featured_measures: z.array(z.string()).default([]),
    model_doc: z.string().regex(/^\/(content\/generated|site\/sample-data)\/[\w.-]+\.json$/, 'model_doc must be /content/generated/<slug>.model.json').nullable().default(null),
    // apps (kind: app)
    appKind: z.enum(APP_KINDS).optional(),
    url: url.optional(),
    repo: url.optional(),
    stack: z.array(z.string()).default([]),
    ai_built: z.boolean().default(true),
    needs_api_key: z.boolean().default(false),
    howBuilt: z.string().default(''),
  }).strict().superRefine((d, ctx) => {
    if (d.kind === 'app') {
      if (!d.appKind) ctx.addIssue({ code: 'custom', path: ['appKind'], message: 'apps need appKind: static | external | repo-only' });
      if (d.appKind === 'external' && !d.url) ctx.addIssue({ code: 'custom', path: ['url'], message: 'external apps need url' });
      if (d.appKind === 'repo-only' && !d.repo) ctx.addIssue({ code: 'custom', path: ['repo'], message: 'repo-only apps need repo' });
    }
    if (d.live_lab.enabled && !d.live_lab.report_key) ctx.addIssue({ code: 'custom', path: ['live_lab', 'report_key'], message: 'live_lab.enabled needs report_key' });
    if (d.status === 'live' && !d.live_lab.enabled) ctx.addIssue({ code: 'custom', path: ['status'], message: 'status "live" means a Live Lab embed: set live_lab.enabled (or use recorded-only)' });
  });
}
