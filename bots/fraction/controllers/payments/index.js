const {
  getUserByEosName, insertMessage, insertTicket,
} = require('../../db');
const { sendMessageToUser } = require('../../messages');

const { getHelixParams, printWallet } = require('../../core');

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

  const message = `Поступил взнос в размере ${amount2}`;


  await sendMessageToUser(bot, user, { text: message });

  return {
    ok: true,
  };
};
