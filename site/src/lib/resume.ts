import { existsSync } from 'node:fs';
import { siteConfig } from '../config';

/** The résumé link, only when the PDF is actually in site/public (so the site never links to a missing file). */
export const resumeUrl = (): string => {
  const link = siteConfig.links.resume;
  return link && existsSync(new URL(`../../public${link}`, import.meta.url)) ? link : '';
};
