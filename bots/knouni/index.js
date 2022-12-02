const { Markup } = require('telegraf');
const axios = require('axios');
const { ChainsSingleton, generateAccount: generateUniAccount } = require('unicore');
const EosApi = require('eosjs-api');

const { restoreAccount } = require('./restore');
const {
  mainButtons, backToMainMenu, demoButtons,
} = require('./utils/bot');

const {
  getHelixParams,
  getUserHelixBalances,
  printHelixWallet,
  transferAction,
  getLiquidBalance,
  getOneUserHelixBalance,
  printWallet,
  printUserBalances,
  withdrawAction,
  printHelixs,
  priorityAction,
  massWithdrawAction,
  printTail,
  getCurrentUserDeposit,
  getCondition,
  exitFromTail,
} = require('./core');

const { sendMessageToUser, sendMessageToAll } = require('./messages');
const {
  printPartners,
  prepareSpreadAction,
  addPromoBudgetAction,
  getPromoBudget,
  hasRequest,
  requestPromoBudgetAction,
  getPartner,
  continueDemo,
} = require('./partners');

const {
  delOrder,
  getMyOrders,
  cancelOrder,
  acceptBuyOrder,
  confirmActiveBuyOrder,
  approveActiveBuyOrder,
  createOrder,
  setDetails,
  getDetails,
  getChildOrders,
} = require('./p2p');

const {
  generateTaskOutput,
  printTasks,
} = require('./tasks');

const {
  printGoalsMenu,
  voteAction,
  createGoal,
  burnNow,
} = require('./goals');

const {
  sellSharesAction,
  printExpirience,
} = require('./shares');

const education = require('./education');

const {
  getUser,
  saveUser,
  addUserHelixBalance,
  delUserHelixBalance,
  getQuiz,
  saveQuiz,
  insertMessage,
  getMessage,
  getUserByResumeChannelId,
  insertRequest,
  closeRequest,
} = require('./db');

const { getDecodedParams } = require('./utils/utm');
const { parseTokenString } = require('./utils/tokens');

async function generateAccount(bot, ctx, isAdminUser, ref) {
  const user = ctx.update.message.from;

  const generatedAccount = await generateUniAccount();

  user.eosname = generatedAccount.name;
  user.mnemonic = generatedAccount.mnemonic;
  user.wif = generatedAccount.wif;
  user.pub = generatedAccount.pub;
  user.is_admin = isAdminUser;
  user.ref = ref;

  if (!user.ref) user.ref = '';

  const params = {
    tg_id: ctx.update.message.from.id,
    username: user.eosname,
    active_pub: user.pub,
    owner_pub: user.pub,
    locale: 'ru',
    referer: user.ref, // referer
    callback: 'tg.me',
    type: 'guest',
    meta: {},
  };

  console.log('referer on register: ', params.referer, 'username: ', generatedAccount.name, 'ref: ', ref);
  try {
    const message = await axios.get(
      `${bot.getEnv().REGISTRATOR}/set`,
      {
        params,
      },
    );
    if (message.data) {
      // TODO set partner info
      await saveUser(bot.instanceName, user);
    } else {
      await saveUser(bot.instanceName, user);
      console.error(message);
      ctx.reply('Произошла ошибка при регистрации вашего аккаунта. Попробуйте позже.', Markup.removeKeyboard());
    }
  } catch (e) {
    await saveUser(bot.instanceName, user);
    return user.eosname;
  }

  return user.eosname;
}

async function isAdmin(bot, id) {
  return Number(id) === Number(bot.getEnv().ADMIN_ID);
}

async function checkForExistBCAccount(bot, ctx) {
  const user = ctx.update.message.from.id;
  const exist = await getUser(bot.instanceName, user);

  if (!exist || !exist.eosname) {
    await generateAccount(bot, ctx, false, '');
    return true;
  }

  return true;
}

const quizDefinition = [
  { message: 'Contants' },
  // { message: 'Как вас зовут?' },
  // { message: 'Из какого вы города?' },
  // { message: 'Какая ваша профессиональная специализация?'},
  // { message: 'В чём хотели бы развиваться?' },
  // { message: 'Расскажите о себе, и почему вы хотите сотрудничать с Институтом?' },
];

async function catchRequest(bot, user, ctx, text) {
  const reply = 'Я получил запрос, мне нужно время на подготовку ответа! Для дополнения запроса, напишите сообщение ниже:';
  const menu = Markup.keyboard(['🏁 закрыть запрос'], { columns: 2 }).resize(); // , '🪙 кошелёк'

  await sendMessageToUser(bot, user, { text: reply }, menu);

  const id = await sendMessageToUser(bot, { id: bot.getEnv().CV_CHANNEL }, { text });

  await insertMessage(bot.instanceName, user, bot.getEnv().CV_CHANNEL, text, id, 'CV');

  user.state = 'chat';
  user.request_channel_id = id;

  if (!user.eosname) {
    user.eosname = await generateAccount(bot, ctx, false, user.ref);
  }

  await saveUser(bot.instanceName, user);

  await insertRequest(bot.instanceName, user, id, text);
}

module.exports.init = async (botModel, bot) => {
  const protocol = bot.getEnv().PROTOCOL.replace('://', '');
  let host = String(bot.getEnv().ENDPOINT);

  let port = protocol === 'https' ? 443 : 80;

  if (host.includes(':')) {
    [host, port] = host.split(':');
    port = Number(port);
  }

  const config = {
    chains: [
      {
        name: 'FLOWER',
        rpcEndpoints: [
          {
            protocol,
            host,
            port,
          },
        ],
        explorerApiUrl: 'https://explorer.samplesite.com',
      },
    ],
    ual: {
      rootChain: 'FLOWER',
    },
    tableCodeConfig: {
      core: 'unicore',
      staker: 'staker',
      p2p: 'p2p',
      reg: 'registrator',
      part: 'part',
    },
  };

  const instance = new ChainsSingleton();
  instance.init(config);

  bot.uni = instance.getRootChain();

  const options = {
    httpEndpoint: bot.getEnv().PROTOCOL + bot.getEnv().ENDPOINT,
    verbose: false, // API logging
    sign: true,
    logger: {
      // Default logging functions
    },
    fetchConfiguration: {},
  };

  bot.eosapi = EosApi(options);

  bot.start(async (ctx) => {
    ctx.update.message.from.params = getDecodedParams(ctx.update.message.text);

    const ref = await ctx.update.message.text.split('/start ')[1] || null;
    let msg2;

    if (ctx.update.message.chat.type === 'private') {
      if (!ctx.update.message.from.is_bot) {
        let user = await getUser(bot.instanceName, ctx.update.message.from.id);

        if (!user) {
          user = ctx.update.message.from;
          user.app = bot.getEnv().APP;
          user.ref = ref;
          user.requests_count = 3;
          await saveUser(bot.instanceName, user);
        } else {
          user.request_chat_id = false;
          user.request_channel_id = false;
          // if (!user.requests_count)
          user.requests_count = 3;

          await saveUser(bot.instanceName, user);
        }

        const request = Markup.keyboard(['🆕 cоздать запрос'], { columns: 1 }).resize();
        const buttons = [];

        if (user.requests_count > 0) {
          await ctx.reply('Меня зовут Кно, я ваш персональный помощник 🧙🏻‍♂️', request);
          buttons.push(Markup.button.callback('🆕 cоздать запрос', 'createrequest'));
          await ctx.reply('Мой искусственный интеллект помогает принять решение в сложной жизненной ситуации. Попробуйте! Опишите вашу ситуацию, сформулируйте вопрос, и получите разумный ответ: ', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
        } else {
          const clearMenu = Markup.removeKeyboard();
          buttons.push(Markup.button.callback('🔄 обновить запросы', 'refreshrequests'));

          await ctx.reply('Меня зовут Кно, я ваш персональный помощник 🧙🏻‍♂️', clearMenu, { reply_markup: { remove_keyboard: true } });
          await ctx.reply('Мой искусственный интеллект помогает принять решение в сложной жизненной ситуации.');
          await ctx.reply('К сожалению, вас не осталось запросов. Для получения запросов станьте пайщиком цифрового кооператива: @digital_earth_bot и нажмите кнопку "обновить запросы".', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
        }
      }
    } else {
      const clearMenu = Markup.removeKeyboard();
      await ctx.reply('я здесь!', clearMenu, { reply_markup: { remove_keyboard: true } });
    }
  });

  async function addRequestAction(bot, user, ctx) {
    ctx.reply('Введите текст запроса:');
    user.state = 'newrequest';
    await saveUser(bot.instanceName, user);
  }

  bot.command('restart_all', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    const isAdminUser = isAdmin(bot, user.id);

    const text = ctx.update.message.text;
    const entities = ctx.update.message.entities;
    const to_send = 'Внимание! Для получения советов в сложных жизненных ситуациях, пожалуйста, перезапустите Персонального Помощника командой /start';

    if (isAdminUser) {
      const count = await sendMessageToAll(bot, { text: to_send });
      await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
    } else {
      await ctx.replyWithHTML('Недостаточно прав');
    }
  });

  bot.hears('🏫 Об Институте', async (ctx) => {
    await getUser(bot.instanceName, ctx.update.message.from.id);
    await checkForExistBCAccount(bot, ctx);

    ctx.reply('Главный Вход: https://intellect.run');
  });

  bot.hears('🪙 кошелёк', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (ctx.update.message.chat.type === 'private') {
      await printWallet(bot, user);
    }
  });

  bot.hears('🆕 cоздать запрос', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    await addRequestAction(bot, user, ctx);
  });

  bot.hears('🏁 закрыть запрос', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    await closeRequest(bot.instanceName, user.request_channel_id);

    user.state = null;
    user.request_chat_id = false;
    user.requests_count -= 1;

    await saveUser(bot.instanceName, user);
    let menu;

    if (user.requests_count > 0) {
      menu = Markup.keyboard(['🆕 cоздать запрос'], { columns: 1 }).resize();
      await ctx.reply(`Ваш запрос закрыт. Осталось запросов: ${user.requests_count}.\n\nДля пополнения запросов станьте пайщиком Цифрового Кооператива: @digital_earth_bot`, menu);
    } else {
      const clearMenu = Markup.removeKeyboard();
      await ctx.reply('Ваш запрос закрыт.', clearMenu, { reply_markup: { remove_keyboard: true } });
      const buttons = [];
      buttons.push(Markup.button.callback('🔄 обновить запросы', 'refreshrequests'));

      await ctx.reply('К сожалению, вас не осталось запросов. Для получения запросов станьте пайщиком цифрового кооператива: @digital_earth_bot и нажмите кнопку "обновить запросы".', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    }
  });

  bot.on('message', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    console.log('catch user', user);
    // console.log("message: ", ctx.update.message)
    if (user && user.id != 777000) {
      if (ctx.update.message.chat.type !== 'private') { // CATCH MESSAGE ON ANY PUBLIC CHAT WHERE BOT IS ADMIN
        const { text } = ctx.update.message;

        // console.log('tyL: ', ctx.update.message.reply_to_message);

        if (ctx.update.message.reply_to_message) { // Если это ответ на чье-то сообщение
          const msg = await getMessage(bot.instanceName, ctx.update.message.reply_to_message.forward_from_message_id || ctx.update.message.reply_to_message.message_id, bot.getEnv().CV_CHANNEL);

          if (msg && msg.message_id) {
            // console.log('resend back to: ', msg);
            const id = await sendMessageToUser(bot, { id: msg.id }, { text });

            await insertMessage(bot.instanceName, user, user.id, text, 'question', id);
          }
        } else {
          await insertMessage(bot.instanceName, user, 'user', text);
        }
      } else { // Если это диалог пользователя с ботом
        // проверяем не квиз ли
        const { text } = ctx.update.message;

        if (user.state) {
          // SEND FROM USER IN BOT TO PUB CHANNEL
          // console.log("\n\non here2")
          if (user.state === 'newrequest') {
            // console.log("HERE 1")
            await catchRequest(bot, user, ctx, text);
          } else if (user.state === 'chat') {
            // console.log("user: ", user)
            console.log('try to send: ', bot.getEnv().CHAT_CHANNEL, 'reply_to: ', user.request_chat_id);

            const id = await sendMessageToUser(bot, { id: bot.getEnv().CHAT_CHANNEL }, { text }, { reply_to_message_id: user.request_chat_id });

            await insertMessage(bot.instanceName, user, bot.getEnv().CHAT_CHANNEL, text, id, 'chat');

            await saveUser(bot.instanceName, user);

            // ctx.reply('Сообщение отправлено');
          } else {
            // console.log("HERE 3")
            const request = Markup.keyboard(['🆕 cоздать запрос'], { columns: 1 }).resize();

            await ctx.reply('Оставьте свой текстовый запрос и получите разумный ответ:', request);

            const buttons = [];
            buttons.push(Markup.button.callback('🆕 cоздать запрос', 'createrequest'));

            buttons.push(Markup.button.url('🏫 узнать подробнее', 'https://intellect.run'));

            // await ctx.reply('\n\nПримеры запросов:\n-Мой бизнес стал убыточен, как сохранить его и улучшить позиции?.\n-Я застрял в развитии и нахожусь в условиях жизни, которые меня не устраивают. Что делать?\n\nПри необходимости, Институт соберёт Совет и пригласит вас к участию в нём. ', Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
          }
        } else {
          await insertMessage(bot.instanceName, user, 'user', text);
        }
      }
    } else {
      if (ctx.update.message && ctx.update.message.is_automatic_forward === true && ctx.update.message.sender_chat) {
        if (ctx.update.message.sender_chat.id == bot.getEnv().CV_CHANNEL) { // если словили пересылку из прикрепленного канала
          if (ctx.update.message.forward_from_chat.id == bot.getEnv().CV_CHANNEL) { // то нужно запомнить ID сообщения, чтоб отвечать в том же треде
            user = await getUserByResumeChannelId(bot.instanceName, ctx.update.message.forward_from_message_id);
            console.log('before catch: ', user);

            if (user && !user.request_chat_id) {
              console.log('catch forwarded messsage to chat: ', ctx.update.message.message_id);
              user.request_chat_id = ctx.update.message.message_id;
              await saveUser(bot.instanceName, user);
            }
          }
        }
      } else {
        if (ctx.update.message.chat.type === 'private') { // Если надо обновить меню пользователя после миграции
          const request = Markup.keyboard(['🆕 cоздать запрос'], { columns: 1 }).resize();

          const buttons = [];
          buttons.push(Markup.button.callback('🆕 cоздать запрос', 'createrequest'));

          await ctx.reply('Меня зовут Кно, я ваш персональный помощник 🧙🏻‍♂️', request);
          await ctx.reply('Мой искусственный интеллект помогает принять решение в любой жизненной ситуации. Попробуйте! Опишите вашу жизненную ситуацию, сформулируйте вопрос, и получите разумный ответ.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

          // await ctx.reply('Добро пожаловать!', request);
          // await ctx.reply('Коллективный Разум ищет ответы на запросы людей любой сложности и неопределенности. Попробуйте! Оставьте свой запрос на решение вашей задачи развития и получите релевантный ответ:', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

          // buttons.push(Markup.button.url('🏫 узнать подробнее', 'https://intellect.run'));
        }
        // ?
      }
    }
  });

  bot.action('createrequest', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await addRequestAction(bot, user, ctx);
  });

  bot.action('mypartners', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await printPartners(bot, user);
  });

  return null;
};
