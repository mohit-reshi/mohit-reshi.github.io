/**
 * Site settings. Edit this file to change names, links, status and the Live Lab switch.
 * TODO(owner): replace every "example" value before publishing.
 */
const LIVE_LAB_ENABLED = true; // <- the one line to change

export const siteConfig = {
  name: 'Mohit Reshi',
  title: 'Mohit Reshi · Power BI & Fabric',
  headline: 'Embedded analytics you can explore and learn from',
  description: 'Embedded Power BI and Microsoft Fabric projects you can explore live: row-level security, effective identity, DirectLake, DAX and paginated reports, with the code behind each one.',
  location: 'India',
  timeZone: 'Asia/Kolkata',
  /** Header status pill. Set `show: false` to hide it. */
  status: { show: true, text: 'Open to roles', tone: 'open' as 'open' | 'busy' | 'away' },
  /** Contact is links only: no form, no backend, no phone number. */
  links: {
    email: 'mohitreshib@gmail.com',
    linkedin: 'https://www.linkedin.com/in/mohit-reshi',
    github: 'https://github.com/mohit-reshi',
    resume: '/resume.pdf', // shown only when site/public/resume.pdf exists (see lib/resume.ts)
  },
  bio: [
    'I build analytics that live inside products: Power BI reports embedded with row-level security and effective identity, on Microsoft Fabric.',
    'Everything here is something I built. Each project shows the report, the model behind it and the DAX, so you can see how it works and borrow the ideas.',
    'The Live Lab runs real embedded reports. Switch who is signed in, filter, use bookmarks, and read the code behind every click.',
  ],
  /**
   * Live Lab switch. To turn the Live Lab off (nav item and page) change the next line to `false`.
   * brokerUrl points at the deployed token broker. Set LIVE_BROKER_URL=mock: for the offline demo (the CI tests do this).
   * After the Fabric trial ends the module falls back to recorded media by itself, so turning it off is optional.
   */
  liveLab: { enabled: LIVE_LAB_ENABLED && process.env.LIVE_LAB !== 'off', brokerUrl: (process.env.LIVE_BROKER_URL || 'https://portfolio-live-lab-broker.mohitreshi.workers.dev') as string },
  /** Words for the marquee band. */
  marquee: ['DAX', 'DirectLake', 'RLS', 'Effective identity', 'PySpark', 'Medallion', 'Paginated reports', 'Incremental refresh', 'Embedded analytics', 'Fabric', 'TMDL', 'PBIR'],
  /** Shown after the first deploy only if you add a photo to site/public/. */
  photo: '' as string,
};
export type SiteConfig = typeof siteConfig;
