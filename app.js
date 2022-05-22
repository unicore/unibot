require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const mongoose = require('mongoose');

const { initAllBots, checkAllBotsVersions } = require('./bots/utils');

fastify.register(require('./routes/admin'), { prefix: '/admin' });
fastify.register(require('./routes/telegraf'), { prefix: '/telegraf' });

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await fastify.listen(Number(process.env.PORT) || 3000);
    await initAllBots();
    checkAllBotsVersions();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start().then();
