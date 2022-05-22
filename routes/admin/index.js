const bearerAuthPlugin = require('@fastify/bearer-auth');

const keys = new Set([process.env.TOKEN]);
const Admin = require('../../controllers/admin');

module.exports = (fastify, opts, done) => {
  fastify.register(bearerAuthPlugin, { keys });

  fastify.post('/add-bot', Admin.addBot);
  fastify.get('/list-bots', Admin.listBots);
  fastify.post('/get-bot', Admin.getBot);
  fastify.post('/set-bot-token', Admin.setBotToken);
  fastify.post('/enable-bot', Admin.enableBot);
  fastify.post('/disable-bot', Admin.disableBot);
  fastify.post('/change-bot-mode', Admin.changeBotMode);
  fastify.post('/set-bot-env', Admin.setEnv);

  done();
};
