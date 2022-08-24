const {
  getChat,
} = require('../../db');
const { getBotByNameAndType } = require('../../../../common/getBotByNameAndType');

module.exports.getChat = async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');

  const {
    botName,
    eosname,
  } = req.body;

  const bot = await getBotByNameAndType(botName, 'dacom');

  if (!bot) {
    res.code(401);

    return {
      ok: false,
      message: 'invalid botName',
    };
  }

  if (!eosname) {
    res.code(401);

    return {
      ok: false,
      message: 'eosname is required field',
    };
  }

  const chat = await getChat(botName, eosname);

  return {
    ok: true,
    chat,
  };
};
