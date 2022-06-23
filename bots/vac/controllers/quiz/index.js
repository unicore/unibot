const { getAllQuizzes, getUser } = require('../../db');
const { getBotByNameAndType } = require('../../../../common/getBotByNameAndType');

module.exports.getRequests = async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');

  const {
    botName,
  } = req.body;

  const bot = await getBotByNameAndType(botName, 'dacom');

  if (!bot) {
    res.code(401);

    return {
      ok: false,
      message: 'invalid botName',
    };
  }

  const quizzes = await getAllQuizzes(botName);

  // eslint-disable-next-line no-restricted-syntax
  for (const quiz of quizzes) {
    // eslint-disable-next-line no-await-in-loop
    const user = await getUser(quiz.id);
    quiz.username = user.username;
    quiz.eosname = user.eosname;
  }

  return {
    quizzes,
  };
};
