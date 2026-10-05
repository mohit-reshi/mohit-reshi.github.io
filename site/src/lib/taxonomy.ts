import taxonomyJson from '../../../content/taxonomy.json';

export interface Tag { key: string; label: string; group: 'platform' | 'skill' | 'domain'; color: string }
export const taxonomy = taxonomyJson as Record<string, { label: string; group: Tag['group']; color: string }>;
export const tagMeta = (key: string): Tag => ({ key, ...(taxonomy[key] ?? { label: key, group: 'skill' as const, color: '#888888' }) });
export const TAG_GROUP_LABEL: Record<Tag['group'], string> = { platform: 'Platform', skill: 'Skill', domain: 'Domain' };
