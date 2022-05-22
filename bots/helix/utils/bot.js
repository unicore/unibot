require('dotenv').config();

const { Markup } = require('telegraf');

const mainButtons = [
  '⬆️ оказать помощь',
  '⬇️ получить помощь',
  '🪙 кошелёк',
  '🌀 кассы',
  '🤔 как это работает', // , , 'партнёры', , 'программы' 'новости', 'банка', 'цели',
];

const communityButtons = [
  '⬆️ оказать помощь',
  '⬇️ получить помощь',
  '🪙 кошелёк',
  '🌈 цели',
  '🌀 касса',
  '🤔 как это работает', // , , 'партнёры', , 'программы' 'новости', 'банка', 'цели',
];

const demoButtons = ['🤔 как это работает', '🌀 касса', '🏁 завершить демо'];

async function backToMainMenu(ctx, text) {
  // let user = await getUser(ctx.update.message.from.id)
  // user.state = ""
  // saveUser(user)

  const icomeMenu = Markup.keyboard(mainButtons, { columns: 2 }).resize();
  let t = 'Добро пожаловать в глобальную кассу взаимопомощи Двойная Спираль.';
  if (text) t = text;
  await ctx.replyWithHTML(t, icomeMenu);
}

module.exports = {
  mainButtons,
  backToMainMenu,
  demoButtons,
  communityButtons,
};
