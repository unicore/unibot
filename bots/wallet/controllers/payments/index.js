const {
  getUserByEosName, insertMessage, insertTicket,
} = require('../../db');
const { sendMessageToUser } = require('../../messages');

const { getHelixParams, printWallet } = require('../../core');

const { getBotByNameAndType } = require('../../../../common/getBotByNameAndType');
const { mainButtons } = require('../../utils/bot')
const { Markup } = require('telegraf');

module.exports.payReciever = async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');
  console.log('req.body', req.body)
  const {
    botName,
    eosname,
    amount,
    trx_id,
  } = req.body;

  const bot = await getBotByNameAndType(botName, 'wallet');

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
  let message = `Поступила оплата в размере ${amount}`

  const icomeMenu = Markup.keyboard(mainButtons, { columns: 2 }).resize();

  await insertMessage(botName, user, 'operator', message);

  let params = await getHelixParams(bot, bot.getEnv().CORE_HOST)

  let cycle = params.host.current_cycle_num
  let pool = params.host.current_pool_num

  await insertTicket(botName, user, {
    amount,
    cycle,
    pool,
    trx_id,
    eosname,
  })

  await sendMessageToUser(bot, user, { text: message }, icomeMenu);
  await printWallet(bot, user)

  return {
    ok: true,
  };
};
