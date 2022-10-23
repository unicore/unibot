const {
  getUserByEosName, insertMessage, insertTicket, getGoalByChatMessage
} = require('../../db');
const { sendMessageToUser } = require('../../messages');

const { getHelixParams, printWallet } = require('../../core');
const {constructGoalMessage} = require('../../goals');

const { getBotByNameAndType } = require('../../../../common/getBotByNameAndType');
const {mainButtons} = require('../../utils/bot')
const { Markup } = require('telegraf');

module.exports.payReciever = async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');
  console.log('req.body', req.body)
  const {
    botName,
    eosname,
    hostname,
    amount,
    trx_id,
    chat,
    type,
    meta
  } = req.body;

  const bot = await getBotByNameAndType(botName, 'dacom2');

  if (!bot) {
    res.code(401);

    return {
      ok: false,
      message: 'invalid botName',
    };
  }

  if (!eosname || !trx_id || !chat || !type || !hostname) {
    res.code(401);

    return {
      ok: false,
      message: 'eosname and trx_id and chat and type and hostname are required fields',
    };
  }

  if (type === 'donate' && !meta) {
    res.code(401);
    return {
      ok: false,
      message: 'metadata for donate type is not accepted'
    }
  }

  const user = await getUserByEosName(botName, eosname);
  let sender = (user.username && user.username !== '') ? '@' + user.username : user.eosname
  let message = `Поступил взнос в размере ${amount} от ${sender} в цель #${meta.goal_id}`

  await insertMessage(botName, {id: chat.union_chat_id}, 'operator', message);

  await sendMessageToUser(bot, {id: chat.union_chat_id}, { text: message });

  let message2 = `Поступил взнос в размере ${amount} от ${sender}`

  await insertMessage(botName, {id: chat.reply_to_message_chat_id}, 'operator', message, {reply_to_message_id: chat.reply_to_message_id});

  await sendMessageToUser(bot, {id: chat.reply_to_message_chat_id}, { text: message2 }, {reply_to_message_id: chat.reply_to_message_id});

  let goal = await getGoalByChatMessage(bot.instanceName, 'core', chat.goal_message_id)

  if (type === 'donate') {
    let text = await constructGoalMessage(bot, hostname, null, meta.goal_id)

    try {
      await bot.telegram.editMessageText(chat.goal_channel_id, chat.goal_message_id, null, text);
    } catch (e) {
      console.log('same message!', e)
    }
    // await editGoalMsg(bot, ctx, user, hostname, meta.goal_id, true)
  }

  return {
    ok: true,
  };
};
