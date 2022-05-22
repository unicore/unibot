module.exports = {
  apps: [{
    name: 'UniMultibot',
    script: 'app.js',
    watch: '.',
    instances: 4,
  }, {
    name: 'HelixBotWorker',
    script: './bots/helix/worker.js',
    watch: ['./bots/helix/'],
    instances: 1,
  }],
};
