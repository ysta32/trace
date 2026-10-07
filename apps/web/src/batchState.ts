import { signal } from '@preact/signals';

/** Open state of the batch dialog; T15a toggles this and renders <BatchPanel/> inside its dialog. */
export const batchOpen = signal(false);
