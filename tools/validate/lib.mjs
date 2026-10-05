import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function splitFrontmatter(text) {
  const m = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  return { data: YAML.parse(m[1]) ?? {}, body: m[2] };
}

export function loadProjects(root = REPO_ROOT) {
  const dir = join(root, 'content', 'projects');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()).sort().map((folder) => {
    const file = join(dir, folder, 'index.md');
    if (!existsSync(file)) return { folder, file, error: 'index.md is missing' };
    try {
      const fm = splitFrontmatter(readFileSync(file, 'utf8'));
      if (!fm) return { folder, file, error: 'frontmatter block (--- ... ---) not found' };
      return { folder, file, data: fm.data, body: fm.body };
    } catch (e) { return { folder, file, error: 'frontmatter is not valid YAML: ' + e.message }; }
  });
}

export function loadTaxonomy(root = REPO_ROOT) {
  const f = join(root, 'content', 'taxonomy.json');
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8'));
}

export function modelDocPath(root, ref) { return ref ? join(root, ref.replace(/^\//, '')) : null; }
