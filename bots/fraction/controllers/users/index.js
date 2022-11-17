const {
  getUserByEosName, insertMessage,
} = require('../../db');
const { sendMessageToUser } = require('../../messages');
const { getBotByNameAndType } = require('../../../../common/getBotByNameAndType');

module.exports.sendMessage = async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');

  const {
    botName,
    eosname,
    message,
  } = req.body;

  const bot = await getBotByNameAndType(botName, 'dacom');

  if (!bot) {
    res.code(401);

    return {
      ok: false,
      message: 'invalid botName',
    };
  }

  if (!eosname || !message) {
    res.code(401);

    return {
      ok: false,
      message: 'eosname and message are required fields',
    };
  }

  const user = await getUserByEosName(botName, eosname);
  console.log(user);

  await insertMessage(botName, user, 'operator', message);

  await sendMessageToUser(bot, user, { text: message });

  return {
    ok: true,
  };
};
