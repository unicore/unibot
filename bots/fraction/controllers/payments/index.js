const {
  getUserByEosName, insertMessage, insertTicket,
} = require('../../db');
const { sendMessageToUser } = require('../../messages');

const { getHelixParams, printWallet, getPartnerStatus } = require('../../core');

const { getBotByNameAndType } = require('../../../../common/getBotByNameAndType');
const { mainButtons } = require('../../utils/bot');
const { Markup } = require('telegraf');

module.exports.payReciever = async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');
  console.log('req.body', req.body);
  const {
    botName,
    eosname,
    amount,
    trx_id,
    message
  } = req.body;

  const bot = await getBotByNameAndType(botName, 'fraction');

  if (!bot) {
    res.code(401);

    return {
      ok: false,
      message: 'invalid botName',
    };
  }

  if (!eosname || !trx_id) {
    res.code(401);

    return {
      ok: false,
      message: 'eosname and trx_id are required fields',
    };
  }

  const user = await getUserByEosName(botName, eosname);
  let amount2 = parseFloat(amount).toFixed(4) + " USDT"


  // let message2 = message.replace("FLOWER", "USDT")

  // let status = await getPartnerStatus(bot, "core", eosname)
  // let extra = {}
  
  // if status.status != 'гость'
  //   extra = 

  await sendMessageToUser(bot, user, { text: message });
  await printWallet(bot, user)

  return {
    ok: true,
  };
};
