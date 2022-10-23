require('dotenv').config();
const mongoose = require('mongoose');
const { autoHostRefresh, refreshAllBalances } = require('./core');
const { getOrdersAndCheckThem } = require('./p2p');
const Bot = require('../../models/Bot');

const work = async (bot) => {
  console.log('Running worker for', bot.instanceName);
  await Promise.all([
    autoHostRefresh(bot).catch((e) => {
      console.error('Error in autoHostRefresh for', bot.instanceName);
      console.error(e);
    }),
    getOrdersAndCheckThem(bot).catch((e) => {
      console.error('Error in getOrdersAndCheckThem for', bot.instanceName);
      console.error(e);
    }),
    refreshAllBalances(bot, null, null, true).catch((e) => {
      console.error('Error in refreshAllBalances for', bot.instanceName);
      console.error(e);
    }),
  ]);
  console.log('Success worker for', bot.instanceName);
};

const worker = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log('Helix worker start');

    try {
      // eslint-disable-next-line no-await-in-loop
      const bots = await Bot.find({ isActive: true, mode: 'helix' });

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(bots.map((bot) => bot.getTelegrafInstance(true).then((tg) => work(tg))));
    } catch (e) {
      console.error(e);
    }

    console.log('Helix worker wait...');
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 9500);
    });
  }
};

worker().then();
