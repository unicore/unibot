const BaseBot = require('./base');
const HelixBot = require('./helix');
const DacomBot = require('./dacom');
const LotoBot = require('./loto');
const AuctionBot = require('./auction');
const ManBot = require('./man');
const VacBot = require('./vac');
const KnouniBot = require('./knouni');
const SeBot = require('./se');
const MapalaBot = require('./mapala');
const Dacom2Bot = require('./dacom2');
const WalletBot = require('./wallet');
const Knouni2Bot = require('./knouni2');
const fractionBot = require('./fraction');
const unicodeBot = require('./unicode');
const signalBot = require('./signal');

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
  mapala: MapalaBot,
  dacom2: Dacom2Bot,
  wallet: WalletBot,
  knouni2: Knouni2Bot,
  fraction: fractionBot,
  unicode: unicodeBot,
  signal: signalBot
};

module.exports.initBot = (botModel, name, telegrafBot) => {
  if (!BOTS[name]) {
    throw new Error(`No bot named ${name}`);
  }

  return BOTS[name].init(botModel, telegrafBot);
};
