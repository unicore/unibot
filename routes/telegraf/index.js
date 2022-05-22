const TelegrafController = require('../../controllers/telegraf');

module.exports = (fastify, opts, done) => {
  fastify.post('/:secret', TelegrafController.botUpdate);
  done();
};
