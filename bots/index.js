const BaseBot = require('./base');
const HelixBot = require('./helix');
const DacomBot = require('./dacom');
const LotoBot = require('./loto');
const AuctionBot = require('./auction');
const ManBot = require('./man');
const VacBot = require('./vac')
const KnouniBot = require('./knouni')
const SeBot = require('./se')
const MapalaBot = require('./mapala')


const BOTS = {
  base: BaseBot,
  helix: HelixBot,
  dacom: DacomBot,
  loto: LotoBot,
  auction: AuctionBot,
  man: ManBot,
  vac: VacBot,
  knouni: KnouniBot,
  se: SeBot,
  mapala: MapalaBot
};

module.exports.initBot = (botModel, name, telegrafBot) => {
  if (!BOTS[name]) {
    throw new Error(`No bot named ${name}`);
  }

  return BOTS[name].init(botModel, telegrafBot);
};
