import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import taxonomy from '../../content/taxonomy.json';
import { projectSchema } from '../../tools/validate/schema.mjs';

// Frontmatter is validated by the shared schema (SPEC 6.1). An unknown tag, a missing field or a typo fails the build.
const projects = defineCollection({
  loader: glob({ pattern: '*/index.md', base: '../content/projects' }),
  schema: projectSchema(z, Object.keys(taxonomy)),
});

export const collections = { projects };
