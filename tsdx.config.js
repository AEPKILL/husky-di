const rollupCopyPlugin = require('rollup-plugin-copy');

module.exports = {
  rollup(config, options) {
    config.plugins.push(
      rollupCopyPlugin({
        targets: [
          {
            src: ['src/typings/*.ts', '!src/typings/reflect-metadata.d.ts'],
            dest: 'dist/typings',
          },
        ],
      })
    );

    return config;
  },
};
