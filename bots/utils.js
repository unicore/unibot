const Bot = require('../models/Bot');

module.exports.initAllBots = async () => {
  const bots = await Bot.find({ isActive: true });
  // eslint-disable-next-line no-restricted-syntax
  for (const bot of bots) {
    // eslint-disable-next-line no-await-in-loop
    await bot.getTelegrafInstance();
  }
};

const checkAllBotsVersions = async () => {
  const bots = await Bot.find({ isActive: true });
  // eslint-disable-next-line no-restricted-syntax
  for (const bot of bots) {
    // eslint-disable-next-line no-await-in-loop
    await bot.getTelegrafInstance(false, true);
  }
  setTimeout(checkAllBotsVersions, 10000);
};

module.exports.checkAllBotsVersions = checkAllBotsVersions;
