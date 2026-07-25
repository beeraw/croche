import Encore from '@symfony/webpack-encore';

if (!Encore.isRuntimeEnvironmentConfigured()) {
    Encore.configureRuntimeEnvironment(process.env.NODE_ENV || 'dev');
}

Encore
    .setOutputPath('public/build/')
    .setPublicPath('/build')

    // Screen styles + behaviour, loaded on every page.
    .addEntry('app', './assets/app.js')
    // Print-only stylesheet, linked with media="print" so it never affects the screen.
    .addStyleEntry('print', './assets/styles/print.scss')

    .splitEntryChunks()
    .enableStimulusBridge('./assets/controllers.json')
    .enableSingleRuntimeChunk()

    .cleanupOutputBeforeBuild()
    .enableSourceMaps(!Encore.isProduction())
    .enableVersioning(true)

    .configureBabel((config) => {
        config.plugins.push(['polyfill-corejs3', { method: 'usage-global', version: '3.49' }]);
    })

    .enableSassLoader()
;

// Returned as a promise rather than awaited at the top level: webpack-cli 5
// cannot `require()` an ESM config that uses top-level await.
export default Encore.getWebpackConfig();
