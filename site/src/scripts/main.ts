import type { Cleanup, Init } from './util';
import { initTheme } from './theme';
import { initClock } from './clock';
import { initInfo } from './dialogs';
import { initPalette } from './palette';
import { initGrid, initPreviews } from './grid';
import { initCursor } from './cursor';
import { initIntro } from './intro';
import { initMotion } from './motion';
import { initHero } from './hero3d';
import { initLightbox } from './lightbox';
import { initBeforeAfter } from './beforeafter';
import { initAppEmbed } from './appembed';
import { initLiveLab } from './livelab';
import { initLayout } from './layout';
import { initSlideIn } from './slidein';
import { initCasePanel } from './casepanel';
import { initIndexStage } from './stage-index';
import { initModelStage } from './stage-model';

// Every feature is initialised on each (view-transition) page load and cleaned up before the next swap.
const inits: Init[] = [initLayout, initSlideIn, initCasePanel, initIndexStage, initModelStage, initTheme, initClock, initInfo, initPalette, initIntro, initGrid, initPreviews, initCursor, initMotion, initHero, initLightbox, initBeforeAfter, initAppEmbed, initLiveLab];
let cleanups: Cleanup[] = [];

async function boot() {
  const results = await Promise.all(inits.map(async (fn) => { try { return await fn(); } catch (e) { console.error('init failed', fn.name, e); } }));
  cleanups = results.filter((r): r is Cleanup => typeof r === 'function');
}
document.addEventListener('astro:page-load', () => void boot());
document.addEventListener('astro:before-swap', () => { cleanups.forEach((c) => { try { c(); } catch { /* ignore */ } }); cleanups = []; });
