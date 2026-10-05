/** Prefix a site-relative path with the configured base ("/" for user pages, "/repo/" for project pages). */
export function withBase(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.replace(/^\//, '');
  return clean ? `${base}/${clean}` : `${base}/`;
}
export const absoluteUrl = (path: string, site: URL | undefined) => new URL(withBase(path), site ?? 'https://example.github.io').href;
