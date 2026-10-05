import type { LiveLabHandle, MountOptions, Snippet } from './types';
import { LiveLab } from './ui/liveLab';
import snippetsJson from './generated/snippets.json';

export type * from './types';
export { createBroker, createMockBroker } from './broker';
export { MockAdapter } from './adapters/mock';
export { RealPowerBiAdapter } from './adapters/real';

/**
 * Mount the Live Lab into `container` (SPEC 6.4).
 * `options.brokerUrl` is the Cloudflare Worker base URL; use "mock:" for a fully offline demo.
 */
export function mountLiveLab(container: HTMLElement, options: MountOptions): LiveLabHandle {
  return new LiveLab(container, options, (snippetsJson as { snippets: Snippet[] }).snippets);
}
