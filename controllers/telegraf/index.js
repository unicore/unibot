const Bot = require('../../models/Bot');

module.exports.botUpdate = async (req) => {
  const { secret } = req.params;
  const bot = await Bot.findOne({ botSecret: secret });
  if (!bot) {
    return {};
  }
  const telegrafInstance = await bot.getTelegrafInstance();
  await telegrafInstance.handleUpdate(req.body);
  return {};
};
