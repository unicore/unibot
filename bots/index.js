const BaseBot = require('./base');
const HelixBot = require('./helix');

const BOTS = {
  base: BaseBot,
  helix: HelixBot,
};

module.exports.initBot = (botModel, name, telegrafBot) => {
  if (!BOTS[name]) {
    throw new Error(`No bot named ${name}`);
  }

  return BOTS[name].init(botModel, telegrafBot);
};
