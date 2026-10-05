export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
export type Cleanup = () => void;
export type Init = () => Cleanup | void | Promise<Cleanup | void>;

/** Add an event listener and get back its remover (used for cleanup before a view-transition swap). */
export function on<K extends keyof DocumentEventMap>(t: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions): Cleanup;
export function on<K extends keyof WindowEventMap>(t: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): Cleanup;
export function on(t: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions): Cleanup;
export function on(t: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions): Cleanup {
  t.addEventListener(type, fn, opts);
  return () => t.removeEventListener(type, fn, opts);
}
export const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
