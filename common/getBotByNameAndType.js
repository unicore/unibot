const Bot = require('../models/Bot');

module.exports.getBotByNameAndType = async (botName, botType) => {
  const bot = await Bot.findOne({ name: botName, mode: botType, isActive: true });

  if (!bot)
    return null;

  return bot.getTelegrafInstance(false, true);
};
