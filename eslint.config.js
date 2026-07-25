import js from '@eslint/js';

// Hand-rolled global lists rather than the `globals` package: the surface this
// project touches is small enough to spell out, and an explicit list makes an
// accidental `no-undef` easier to read than a preset would.
const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    console: 'readonly',
    localStorage: 'readonly',
    sessionStorage: 'readonly',
    location: 'readonly',
    history: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    performance: 'readonly',
    fetch: 'readonly',
    Request: 'readonly',
    Response: 'readonly',
    Headers: 'readonly',
    AbortController: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    FormData: 'readonly',
    Blob: 'readonly',
    Event: 'readonly',
    CustomEvent: 'readonly',
    WheelEvent: 'readonly',
    MutationObserver: 'readonly',
    IntersectionObserver: 'readonly',
    ResizeObserver: 'readonly',
    HTMLElement: 'readonly',
    Element: 'readonly',
    Node: 'readonly',
    NodeList: 'readonly',
    Image: 'readonly',
    alert: 'readonly',
    confirm: 'readonly',
    getComputedStyle: 'readonly',
    matchMedia: 'readonly',
    structuredClone: 'readonly',
    crypto: 'readonly',
    AudioContext: 'readonly',
    webkitAudioContext: 'readonly',
};

const nodeGlobals = {
    process: 'readonly',
    console: 'readonly',
    __dirname: 'readonly',
    URL: 'readonly',
    setTimeout: 'readonly',
};

const sharedRules = {
    'no-console': 'warn',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
};

export default [
    js.configs.recommended,
    {
        files: ['assets/**/*.js'],
        rules: sharedRules,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: browserGlobals,
        },
    },
    {
        // Playwright specs run in Node but drive a page, so `page.evaluate()`
        // callbacks are browser code embedded in a Node file.
        files: ['tests/e2e/**/*.js'],
        rules: sharedRules,
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...nodeGlobals, ...browserGlobals },
        },
    },
];
