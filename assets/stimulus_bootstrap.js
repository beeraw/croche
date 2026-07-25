import { startStimulusApp } from '@symfony/stimulus-bridge';

// Registers Stimulus controllers from controllers.json and in the controllers/ directory.
export const app = startStimulusApp(import.meta.webpackContext('@symfony/stimulus-bridge/lazy-controller-loader!./controllers', {
    recursive: true,
    regExp: /\.[jt]sx?$/,
}));

// Exposed so the editor can be inspected and driven from the console — handy
// when something on the iPad does not behave, and what the smoke tests use.
window.crocheApp = app;
