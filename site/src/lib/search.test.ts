import { describe, expect, it } from 'vitest';
import { searchItems, type SearchItem } from './search';

const items: SearchItem[] = [
  { kind: 'project', title: 'Sales Analytics', hint: 'DirectLake model', url: '/a', keywords: 'power-bi dax directlake' },
  { kind: 'project', title: 'Retention Model', hint: 'Row-level security by broker', url: '/b', keywords: 'rls dax insurance' },
  { kind: 'page', title: 'About', hint: 'Bio and links', url: '/about', keywords: 'resume' },
  { kind: 'tag', title: 'Filter: DAX', hint: '2 projects', url: '/work?tag=dax', keywords: 'dax skill' },
];
describe('searchItems', () => {
  it('returns the first items for an empty query', () => expect(searchItems(items, '', 2).map((i) => i.title)).toEqual(['Sales Analytics', 'Retention Model']));
  it('requires every word to match and ranks title matches first', () => {
    expect(searchItems(items, 'dax').map((i) => i.title)[0]).toBe('Filter: DAX');
    expect(searchItems(items, 'row security').map((i) => i.title)).toEqual(['Retention Model']);
    expect(searchItems(items, 'zzz')).toEqual([]);
  });
  it('matches keywords and is case-insensitive', () => expect(searchItems(items, 'RESUME')[0].title).toBe('About'));
  it('honours the limit', () => expect(searchItems(items, 'a', 1).length).toBe(1));
});
