const BaseBot = require('./base');
const HelixBot = require('./helix');
const DacomBot = require('./dacom');
const LotoBot = require('./loto');
const AuctionBot = require('./auction');
const ManBot = require('./man');


const BOTS = {
  base: BaseBot,
  helix: HelixBot,
  dacom: DacomBot,
  loto: LotoBot,
  auction: AuctionBot,
  man: ManBot
};

module.exports.initBot = (botModel, name, telegrafBot) => {
  if (!BOTS[name]) {
    throw new Error(`No bot named ${name}`);
  }

  return BOTS[name].init(botModel, telegrafBot);
};
