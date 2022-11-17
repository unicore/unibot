const Admin = require('../../controllers/admin');
const { registerAdminAuth } = require('../../common/adminAuth');

module.exports = (fastify, opts, done) => {
  registerAdminAuth(fastify);

  fastify.post('/add-bot', Admin.addBot);
  fastify.get('/list-bots', Admin.listBots);
  fastify.post('/get-bot', Admin.getBot);
  fastify.post('/set-bot-token', Admin.setBotToken);
  fastify.post('/enable-bot', Admin.enableBot);
  fastify.post('/disable-bot', Admin.disableBot);
  fastify.post('/change-bot-mode', Admin.changeBotMode);
  fastify.post('/set-bot-env', Admin.setEnv);

  // eslint-disable-next-line global-require
  // fastify.register(require('../../bots/dacom/routes'), { prefix: '/dacom' });
  fastify.register(require('../../bots/fraction/routes'), { prefix: '/fraction' });
  // fastify.register(require('../../bots/dacom2/routes'), { prefix: '/dacom' });
  // fastify.register(require('../../bots/mapala/routes'), { prefix: '/mapala' });
  // fastify.register(require('../../bots/wallet/routes'), { prefix: '/wallet' });

  done();
};
