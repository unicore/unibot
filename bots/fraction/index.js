const { Markup } = require('telegraf');
const axios = require('axios');
const { ChainsSingleton, generateAccount: generateUniAccount } = require('unicore');
const EosApi = require('eosjs-api');

const { restoreAccount } = require('./restore');
const {
  mainButtons, communityButtons, backToMainMenu, demoButtons,
} = require('./utils/bot');

const PayForStatus = 10 //FLOWER

const {
  getHelixParams,
  getUserHelixBalances,
  printHelixWallet,
  transferAction,
  getLiquidBalance,
  getOneUserHelixBalance,
  printWallet,
  printUserBalances,
  printUserFractions,
  withdrawAction,
  printHelixs,
  priorityAction,
  massWithdrawAction,
  printTail,
  getCurrentUserDeposit,
  getCondition,
  exitFromTail,
  getHelixsList,
  transferToGateAction,
  cancelSellAction,
  getBalancesOnSale,
  payStatus,
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
  getOrdersAndCheckThem,
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
} = require('./goals');

const {
  sellSharesAction,
  printExpirience,
} = require('./shares');

// const education = require('./education');

const {
  loadDB,
  getUser,
  saveUser,
  addUserHelixBalance,
  delUserHelixBalance,
  insertWithdraw,
  updateWithdraw,
  getWithdraw,
  getUserByEosName,
  getQuiz,
  getAllQuizzes,
  saveQuiz,
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
      console.log('message on reg: ', message.data);
      // TODO set partner info
      await saveUser(bot.instanceName, user);
      return true;
    } else {
      await saveUser(bot.instanceName, user);
      console.error(message);
      ctx.reply('Произошла ошибка при регистрации вашего аккаунта. Перезапустите робота командой /start.', Markup.removeKeyboard());
      return false;
    }
  } catch (e) {
    ctx.reply('Произошла ошибка при регистрации вашего аккаунта. Перезапустите робота командой /start.', Markup.removeKeyboard());
    user.reg_error = e;
    await saveUser(bot.instanceName, user);

    return false;
  }
}

async function checkSponsor(bot, username, sponsor, contract) {
  const promoBudget = await getPromoBudget(bot, sponsor);
  const userHasRequest = await hasRequest(bot, username, contract);
  const partner = await getPartner(bot, username);

  return parseFloat(promoBudget) > 0 && !userHasRequest && partner.referer === sponsor;
}

async function startDemo(bot, ctx) {
  const user = await getUser(bot.instanceName, ctx.update.message.from.id);

  user.is_demo = true;
  await saveUser(bot.instanceName, user);
  await requestPromoBudgetAction(bot, user, 'eosio');
}

async function isAdmin(bot, id) {
  return Number(id) === Number(bot.getEnv().ADMIN_ID);
}

async function depositAction(bot, ctx, user) {
  const helix = await getHelixParams(bot, user.deposit_action.hostname);
  const fractions_on_sale = await getBalancesOnSale(bot, user.deposit_action.hostname, user.eosname, helix);

  const amount_for_direct_buy = 0;
  let total_deposit_amount = parseFloat(user.deposit_action.quantity);
  const balances_for_buy = [];
  const actions = [];
  console.log('fractions_on_sale: ', fractions_on_sale);

  fractions_on_sale.balances.map((bal) => {
    if (total_deposit_amount > 0) {
      console.log('total_deposit_amount: ', total_deposit_amount);

      const quantity = total_deposit_amount >= parseFloat(bal.compensator_amount) ? bal.compensator_amount : total_deposit_amount.toFixed(4) + ' FLOWER';

      actions.push({
        account: helix.host.root_token_contract,
        name: 'transfer',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          from: user.eosname,
          to: 'unicore',
          quantity,
          memo: `150-${bal.id}-${user.deposit_action.hostname}`,
        },
      });

      total_deposit_amount = parseFloat(total_deposit_amount) - parseFloat(quantity);

      // balances_for_buy.push(bal)
    }
  });

  total_deposit_amount = (total_deposit_amount).toFixed(4) + ' FLOWER';

  console.log('total_deposit_amount: ', total_deposit_amount, parseFloat(total_deposit_amount) > 0);

  if (parseFloat(total_deposit_amount) > 0) {
    console.log('before push');
    actions.push({
      account: helix.host.root_token_contract,
      name: 'transfer',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: {
        from: user.eosname,
        to: 'unicore',
        quantity: total_deposit_amount,
        memo: `100-${user.deposit_action.hostname}-`,
      },
    });
    console.log('after push', actions);
  }

  console.log(actions);
  try {
    const eos = await bot.uni.getEosPassInstance(user.wif);

    const data = await eos.transact({
      actions,
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    await ctx.deleteMessage();
    await ctx.replyWithHTML('Взнос успешно принят');

    const cons = data.processed.action_traces[0].inline_traces[1].console;
    let balanceID;

    data.processed.action_traces.map((at) => {
      at.inline_traces.map((it) => {
        console.log('IT: ', it);
        const regex = /BALANCE_ID: (\w+);?/gi;
        const group = regex.exec(cons);
        if (group[1]) balanceID = group[1];
      });
    });

    console.log('balanceID', balanceID);

    let index;

    if (balanceID) {
      const balances = await getUserHelixBalances(bot, helix.host.username, user.eosname);
      console.log('balances: ', balances);

      balances.all.map((bal, idx) => {
        if (bal.id == balanceID) index = idx;
      });
    }

    console.log('BALANCE INDEX: ', index);
    if (index) await printUserBalances(bot, ctx, user, helix.host.username, index);

    // console.log("cons: ", data.processed.action_traces)
    // const regex = /BALANCE_ID: (\w+);?/gi;
    // const group = regex.exec(cons);
    // const balanceId = group[1];
    // console.log("balanceID:", balanceId)
    // eslint-disable-next-line max-len
    // const balance = await getOneUserHelixBalance(bot, user.deposit_action.hostname, user.eosname, balanceId);
    // await addUserHelixBalance(user.eosname, balance);
    // await printHelixWallet(bot, ctx, user, user.deposit_action.hostname);
    // await printHelixs(bot, ctx, user);
  } catch (e) {
    await ctx.replyWithHTML(e.message);
    console.error('ere: ', e);
  }
}

async function refreshAction(bot, ctx, user, hostname, balanceId, currentIndex) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  try {
    await ctx.deleteMessage();
    await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'refreshbal',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          username: user.eosname,
          host: hostname,
          balance_id: balanceId,
          partrefresh: 50,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });
    // NOTIFY user
    await printUserBalances(bot, ctx, user, hostname, currentIndex, true);
  } catch (e) {
    await ctx.replyWithHTML(e.message);
    console.error(e);
  }
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

async function printMainMenu(ctx, text) {
  const icomeMenu = Markup
    .keyboard(mainButtons, { columns: 2 }).resize();
  // let t = 'Добро пожаловать.\n\n<b>ОКАЗАТЬ ПОМОЩЬ</b> - произвести добровольное безвозмездное пожертвование партнёрам и получить FLOWER.\n\n<b>ПОЛУЧИТЬ ПОМОЩЬ</b> - подарить FLOWER системе и получить добровольное безвозмездное пожертвование от партнёров.\n\n<b>КОШЕЛЁК</b> - хранит ваши FLOWER и подсчитывает вознаграждения от участия в кассах.\n\n<b>КАССЫ</b> - пространство честного обмена, где все зарабатывают.\n\n<b>КАК ЭТО РАБОТАЕТ</b> - раздел с описанием и обратной связью.\n\nКлубный чат: @helix_club';

  // if (text) t = text;

  // await ctx.replyWithHTML(t, icomeMenu);
}

async function printCommunityMenu(ctx, text) {
  const icomeMenu = Markup
    .keyboard(communityButtons, { columns: 2 }).resize();
  // let t = 'Добро пожаловать.\n\n<b>ОКАЗАТЬ ПОМОЩЬ</b> - произвести добровольное безвозмездное пожертвование партнёрам и получить FLOWER.\n\n<b>ПОЛУЧИТЬ ПОМОЩЬ</b> - подарить FLOWER системе и получить добровольное безвозмездное пожертвование от партнёров.\n\n<b>КОШЕЛЁК</b> - хранит ваши FLOWER и подсчитывает вознаграждения от участия в кассах.\n\n<b>КАССЫ</b> - пространство честного обмена, где все зарабатывают.\n\n<b>КАК ЭТО РАБОТАЕТ</b> - раздел с описанием и обратной связью.\n\nКлубный чат: @helix_club';

  // if (text) t = text;

  // await ctx.replyWithHTML(t, icomeMenu);
}

async function finishEducation(ctx) {
  await printMainMenu(ctx); // OR ask nickname
}

async function pushEducation(bot, ctx, currentSlideIndex) {
  const education = bot.getEnv().education
  
  const slide = education.find((el, index) => Number(index) === Number(currentSlideIndex));
  if (!slide) {
    try {
      await ctx.editMessageText('Ознакомление завершено');
    } catch (e) {
      console.error(e);
    }

    await finishEducation(ctx);
  } else {
    if (currentSlideIndex === 0) {
      const incomeMenu = Markup
        .removeKeyboard();

      // await ctx.reply('Ознакомление запущено', incomeMenu, { reply_markup: { remove_keyboard: true } });
    }

    const buttons = [];

    // buttons.push(Markup.button.callback('⬅️ Назад', `pusheducation ${currentSlideIndex - 1}`));

    if (currentSlideIndex + 1 === education.length) {
      // buttons.push(Markup.button.callback('🔄 Начать с начала', `pusheducation ${0}`))
      buttons.push(Markup.button.callback('⏺ Войти', 'finisheducation'));
    } else { buttons.push(Markup.button.callback('Продолжить ➡️', `pusheducation ${currentSlideIndex + 1}`)); }

    // buttons.push(Markup.button.callback('⏺ Завершить', `finisheducation`));

    // buttons.push(Markup.button.callback('⏺ Пропустить ознакомление', `pusheducation ${education.length - 1}`));

    let text = '';
    text += `\n\n${slide.text}`;

    if (currentSlideIndex === 0 && slide.img !== '') {
      if (slide.img.length > 0) {
        await ctx.replyWithPhoto({ source: slide.img }, { parse_mode: 'html', caption: text, ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize() });
      } else {
        await ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      }
    } else {
      try {
        await ctx.deleteMessage();
      } catch (e) {}

      if (slide.img.length > 0) {
        console.log('HERE3!');
        await ctx.replyWithPhoto({ source: slide.img }, { parse_mode: 'html', caption: text, ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize() });
      } else {
        console.log('HERE4!');
        await ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      }
    }
  }
}

function setBuyMenu(ctx) {
  const buttons = [];
  buttons.push(Markup.button.callback('USDT (сеть TRC20)', 'buywith USDT'));

  ctx.reply('\nВыберите валюту для оказания помощи:', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
}

async function setSellMenu(bot, ctx, user) {
  let myOrders = await getMyOrders(bot, user.eosname);
  myOrders = myOrders.filter((el) => el.parent_creator === '');

  if (myOrders.length > 0) {
    const order = myOrders[0];

    const childOrders = await getChildOrders(bot, order.id);

    const token = parseTokenString(order.out_quantity);
    const outRate = await bot.uni.p2pContract.getUsdRate(token.symbol, 4);

    const outQuantity = `${(parseFloat(order.quote_quantity) / parseFloat(outRate)).toFixed(4)} ${token.symbol}`;

    const buttons = [];

    let text = `У вас есть активная заявка на сумму ${outQuantity}`;
    if (childOrders.length > 0) {
      if (childOrders[0].status === 'finish') {
        text += '\nСтатус: завершена';
        buttons.push(Markup.button.callback('Очистить заявку', `delorder ${order.id}`));

        ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
      } else {
        text += '\nСтатус: в процессе';
        text += '\n\nОтменить заявку до завершения или отмены обмена партнёром невозможно.';

        ctx.reply(text);
      }
    } else {
      text += '\nСтатус: ожидание';
      text += '\n\nОтменить заявку?';
      buttons.push(Markup.button.callback('Отменить заявку', `cancelorder ${order.id}`));

      ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    }
  } else {
    const buttons = [];
    buttons.push(Markup.button.callback('USDT (сеть TRC20)', 'sellwith USDT'));
    ctx.reply('\n Выберите валюту для получения помощи: ', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
  }
}

async function showBuySellMenu(bot, user, ctx) {
  const myOrders = await bot.uni.p2pContract.getOrders(user.eosname);
  const buyOrders = myOrders.filter((el) => el.type === 'buy');

  if (user.state === 'giveHelp') {
    if (buyOrders.length === 0) setBuyMenu(ctx);
    else {
      const buyOrder = buyOrders[0];
      const buttons2 = [];
      buttons2.push(Markup.button.callback('Отменить заявку', `cancelorder ${buyOrder.id}`));
      ctx.reply(`У вас уже есть активная заявка на оказание помощи на сумму ${buyOrder.out_quantity}. `, Markup.inlineKeyboard(buttons2, { columns: 1 }).resize());
    }
  } else if (user.state === 'getHelp') {
    await setSellMenu(bot, ctx, user);
  }
}

async function checkAllUserAccountsForExist(bot) {
  const db = await loadDB();
  const collection = db.collection(`helixUsers_${bot.instanceName}`);
  const users = await collection.find({}).toArray();

  // eslint-disable-next-line no-restricted-syntax
  for (const user of users) {
    // eslint-disable-next-line no-await-in-loop
    let need_register = false;
    try {
      if (user.eosname) await bot.uni.readApi.getAccount(user.eosname);
    } catch (e) {
      need_register = true;
    }

    if (need_register) {
      if (!user.ref) user.ref = '';

      const params = {
        tg_id: user.id,
        username: user.eosname,
        active_pub: user.pub,
        owner_pub: user.pub,
        locale: 'ru',
        referer: user.ref,
        callback: 'tg.me',
        type: 'guest',
        meta: {},
      };

      try {
        const message = await axios.get(
          `${bot.getEnv().REGISTRATOR}/set`,
          {
            params,
          },
        );

        if (message.data) {
          if (message.data.status === 'ok') console.log('restored account: ', user.eosname, message.data);
          else {
            console.error(message.data);
          }
        } else {
          console.error(message.data);
        }
      } catch (e) {
        console.error('error on restore account: ', e.message);
      }
    }
  }
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
      const clearMenu = Markup.removeKeyboard();
      // const menu = Markup
      //   .keyboard(mainButtons, { columns: 2 }).resize();

      // await ctx.reply('Купи фракцию телеграм-канала с доходностью до 100%. Стоимость фракции растёт за счёт продаж рекламы и спроса на фракции у новых фракционеров.', clearMenu, { reply_markup: { remove_keyboard: true } });
      const first_enter = await ctx.reply('...', clearMenu);
      await ctx.deleteMessage(first_enter.message_id);

      // await ctx.reply('Как получать гарантированный пассивный доход?', clearMenu);
      // await ctx.deleteMessage()

      let user = await getUser(bot.instanceName, ctx.update.message.from.id);
      // console.log("user", ctx.update.message.from)

      let is_registered = true;
      let need_register = false;

      try {
        if (user) await bot.uni.readApi.getAccount(user.eosname);
      } catch (e) {
        need_register = true;
      }

      console.log('need_register: ', need_register);

      if (!user || need_register) {
        msg2 = await ctx.reply('Пожалуйста, подождите.. ⛓');

        user = ctx.update.message.from;
        user.app = bot.getEnv().APP;

        await saveUser(bot.instanceName, user);
        is_registered = await generateAccount(bot, ctx, false, ref);
        // await saveUser(bot.instanceName, user);
        console.log('is_registered: ', is_registered);
        // TODO check budget
        // TODO start demo
        await ctx.deleteMessage(msg2.message_id);
        // await ctx.reply('Аккаунт успешно зарегистрирован! 🗽');
      } else {

      // eosname = user.eosname;
      }

      if (is_registered) await pushEducation(bot, ctx, 0);
      // await startQuiz(bot, ctx, user);

    // if (process.env.MODE === "community") {
    // printCommunityMenu(ctx, "Welcome")
    // } else {
    // await printHelixs(bot, ctx, user);
    // await startDemo(bot, ctx);
    // }
    // await ctx.reply('Запускаем режим практического ознакомления.. 📟');
    }
  });

  async function startQuiz(bot, ctx, user) {
    await getQuiz(bot.instanceName, user.id);

    const q = {
      id: user.id,
      current_quiz: 0,
      answers: quizDefinition,
      is_finish: false,
    };

    await saveQuiz(bot.instanceName, user, q);

    // const buttons = [];

    // buttons.push(Markup.button.url('🏫 перейти на сайт', 'https://simply.estate'));

    const request = Markup.keyboard([Markup.button.contactRequest('📱 Отправить номер')], { columns: 1 }).resize();

    // await ctx.reply('Как можно к вам обращаться?');

    // await insertMessage(bot.instanceName, user, user.id, 'Получил вопросы');

    // const buttons = [Markup.button.contactRequest('Поделиться контактом')];
    // const request = Markup.keyboard(buttons, { columns: 1 }).resize();
    return ctx.reply('\n\nВведите номер телефона:', request);
  // await nextQuiz(bot, user, ctx)
  // startQuiz()
  // return ctx.reply('', request);
  }

  const quizDefinition = [
    { message: 'Номер телефона:' },
    { message: 'Введите ФИО или никнейм:' },
    // { message: 'Вы принимаете <a href="https://dacom.io/b85a436447704411b39ed130d58b4c55">устав</a> цифрового кооператива?', buttons: ['Принимаю']},
    // { message: 'Какие потребности благ у вас есть?' },
    // { message: 'Какие возможности по созданию благ у вас есть?' },

  // { message: 'Мой двигатель - дарономика времени и денег, учёт которых я веду на блокчейне.\n\nСколько времени в неделю вы могли бы подарить людям, если бы знали, что ваш вклад вернётся к вам с превышением?' },
  // { message: 'Какая главная проблема или задача развития стоит перед вами сейчас? Я помогу ' },
  ];

  async function nextQuiz(bot, user, ctx) {
    const quiz = await getQuiz(bot.instanceName, user.id);

    let q;

    // eslint-disable-next-line array-callback-return
    quizDefinition.map((el, index) => {
      if (!q && index > quiz.current_quiz) {
        quiz.current_quiz = index;
        q = el;
      }
    });

    if (q) {
      if (q.buttons && q.buttons.length > 0) {
        const buttons = [];

        // eslint-disable-next-line array-callback-return
        q.buttons.map((b) => {
          buttons.push(b);
        });

        await ctx.replyWithHTML(q.message, { disable_web_page_preview: true, ...Markup.keyboard(buttons, { columns: 2 }).resize() });
      } else {
        const clearMenu = Markup.removeKeyboard();

        await ctx.replyWithHTML(q.message, clearMenu, { disable_web_page_preview: true, reply_markup: { remove_keyboard: true } });// , clearMenu,
      }

      await saveQuiz(bot.instanceName, user, quiz);
    } else {
      quiz.is_finish = true;
      await saveQuiz(bot.instanceName, user, quiz);
      // user.state = ""
      // let unionName = quiz.answers[1].answer

      // let id = await ctx.reply("Пожалуйста, подождите. Мы регистрируем DAO для вас, это может занять несколько секунд.")
      // let chatResult = await createChat(bot, user, user.eosname, unionName, "union")
      // chatResult = {chatLink: "https://google.com", chatId: "-1001618007293"}

      // const icomeMenu = Markup
      //   .keyboard(mainButtons, { columns: 2 }).resize();

      // let t1 = '';
      // t1 += `\nУчастники этого чата получили возможность создавать и достигать совместные цели. Попробуйте! Для создания цели напишите сообщение с тегом #goal в этом чате.\n`

      // t1 += `\nПоказать это сообщение: /help,`
      // // t += `\nСоздать проект: напишите сообщение с тегом #project`
      // // t += `\nСовершить взнос: /donate,`
      // t1 += `\nКапитализация DAO: /stat,`
      // t1 += "\nВаш кошелёк: /wallet,"

      // const id2 = await sendMessageToUser(bot, { id: '-100' + chatResult.chatId }, { text: t1 });

      // const buttons = [];

      // buttons.push(Markup.button.url('🏫 войти', chatResult.chatLink));
      // const t = 'Войдите в ваше DAO и получите инструкции:';
      // ctx.reply(t, Markup.inlineKeyboard(buttons, { columns: 1 }).resize())

      let k = 0;
      let text = '';

      // , //phone
      text += `@${user.username} [${user.eosname}] \n`; // +${quiz.answers[0].answer.phone_number  || quiz.answers[0].answer}

      for (const answer of quiz.answers) {
        if (k > 0) {
        // text += `\n${answer.message}`;
          text += `\n${answer.answer}\n`;
        }
        k++;
      }

      // const id = await ctx.reply('Нам нужно время, чтобы создать предложение для вас. Оставайтесь на связи!');

      const id3 = await sendMessageToUser(bot, { id: bot.getEnv().CV_CHANNEL }, { text });
      // await insertMessage(bot.instanceName, user, bot.getEnv().CV_CHANNEL, text, id3, 'CV');
      // await insertMessage(bot.instanceName, user, user.id, text, id3, 'CV', {});// goalId: goal.goalId,

      user.state = 'chat';
      user.profile_channel_id = id3;

      await saveUser(bot.instanceName, user);

      const menu = Markup
        .keyboard(mainButtons, { columns: 2 }).resize();

      // await pushEducation(bot, ctx, 0);

      await ctx.replyWithHTML('Добро пожаловать в Цифровой Кооператив. Обязательно ознакомьтесь с <a href="https://dacom.io/1152812f510d47daa5875d685d887b6c">ИНСТРУКЦИЕЙ</a> по выбору клуба и участия в нём.', { disable_web_page_preview: true, ...menu });
      // let btns = []

      // btns.push(Markup.button.callback('совершить взнос ⤴️', 'deposit'));

      // await ctx.reply(`Совершите паевый взнос для получения FLOWER. Обязательный регистрационный взнос в размере 10 USDT будет автоматически удержан из средств первого взноса.\n\n`, Markup.inlineKeyboard(btns, { columns: 1 }).resize())

      // await ctx.reply('Регистрационный взнос будет ', menu)

      // await printWallet(bot, user);
      // await ctx.reply('Краткое ознакомление:')
    }
  }

  // eslint-disable-next-line no-unused-vars
  bot.hears('Получить цветок 🌼', async (ctx) => {
    // let user = await getUser(bot.instanceName, ctx.update.message.from.id)
    // console.log('start demo', user)
    // let promoBudget = await getPromoBudget(bot, user.ref)
    // if (user.is_demo) {

    //   if (parseFloat(promoBudget) >= 1) {
    //       requestPromoBudgetAction(bot, user, user.ref)
    //   } else {
    //     let telegram = await getTelegramByEosName(user.ref)
    //     let buttons = []
    //     buttons.push(Markup.button.callback(`Продолжить`, `skipdemo`))
    // eslint-disable-next-line max-len
    //     let text = `У вашего спонсора недостаточно цветков для совершения дара вам. Обратитесь к нему с запросом на пополнение бюджета по контакту - ${telegram}, или продолжите ознакомление без демо-режима.`
    //     ctx.reply(text, Markup.inlineKeyboard(buttons, {columns: 2}).resize())
    //   }
    // }
  });

  bot.action('finisheducation', async (ctx) => {
    ctx.deleteMessage();
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    // await startQuiz(bot, ctx, user);

    const menu = Markup
      .keyboard(mainButtons, { columns: 2 }).resize();

    // await pushEducation(bot, ctx, 0);
    await ctx.replyWithHTML('Краткая инструкция:\n💎 кошелёк - это ваш лицевой счёт для хранения универсальной учётной единицы благ (FLOWER). Получите FLOWER, совершив паевый взнос в Кооператив из кошелька.\n❇️ заложить FLOWER - выберите клуб по его программе развития и совершите взнос в него;\n🛑 требовать FLOWER - получите блага от деятельности клуба согласно его программе развития.\n\nОзнакомьтесь: <a href="https://dacom.io">как здесь всё работает</a>', { disable_web_page_preview: true, ...menu });

    await printWallet(bot, user);
    // TO CLIENT
    // await sendMessageToUser(bot, user, { text: `Заявка на вывод ${wobj.amount} успешно обработана` });

    // TODO make db insert
    // TODO send request to admin
    //
  });

  bot.action(/confirmwithdraw (\w+)/gi, async (ctx) => {
    const withdraw_id = ctx.match[1];
    const wobj = await getWithdraw(bot.instanceName, withdraw_id);
    const user = await getUser(bot.instanceName, wobj.userId);

    await updateWithdraw(bot.instanceName, withdraw_id, 'confirmed');

    ctx.editMessageText('вывод обработан');

    // TO CLIENT
    await sendMessageToUser(bot, user, { text: `Платежное поручение на ${wobj.amount} успешно обработано` });

    // TODO make db insert
    // TODO send request to admin
    //
  });

  bot.action('printbalances', async (ctx) => {
    console.log('print');
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    // const hostname = ctx.match[1];
    // const nextId = parseInt(ctx.match[2], 10);

    const list = await getHelixsList(bot);
    const first = list[0];
    if (first) {
      await ctx.editMessageText('Выберите фракцию для продажи:');
      // await printUserFractions(bot, ctx, user, first.username)
      await printUserBalances(bot, ctx, user, first.username);
    } else ctx.reply('у вас нет фракций для отображения.');
  });

  bot.action('skipdemo', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    user.is_demo = false;
    await saveUser(bot.instanceName, user);

    const menu = Markup
      .keyboard(mainButtons, { columns: 2 }).resize();

    // const t = 'Добро пожаловать в Двойную Спираль!.\n\nОКАЗАТЬ ПОМОЩЬ - произвести добровольное безвозмездное пожертвование партнёрам и получить FLOWER.\n\nПОЛУЧИТЬ ПОМОЩЬ - подарить FLOWER системе и получить добровольное безвозмездное пожертвование от партнёров.\n\nКОШЕЛЁК - хранит ваши FLOWER и подсчитывает вознаграждения от участия в кассах.\n\nКАССЫ - пространство честного обмена, где все зарабатывают.\n\nКАК ЭТО РАБОТАЕТ - раздел с описанием и обратной связью.\n\nКлубный чат: @helix_club';

    // await sendMessageToUser(bot, user, { text: t }, menu);
  });

  bot.action(/next (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const nextId = parseInt(ctx.match[1], 10);
    // console.log("next_id", next_id)
    await printHelixs(bot, ctx, user, nextId);
  });

  bot.action('mypartners', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await printPartners(bot, ctx, user);
  });

  bot.action('sendtoall', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const isAdminUser = isAdmin(bot, user.id);
    const message = user.message_to_send;

    user.message_to_send = null;

    await saveUser(bot.instanceName, user);

    if (isAdminUser && message) {
      const count = await sendMessageToAll({ text: message });
      await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
    } else {
      await ctx.replyWithHTML('Недостаточно прав');
    }
  });

  bot.action('cancelsendtoall', async (ctx) => {
    // let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    // const is_admin = isAdmin(bot, user.id);

    ctx.editMessageText('рассылка отменена');
  });

  bot.action(/select (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];

    try {
      await printHelixWallet(bot, ctx, user, hostname);
    } catch (e) {
      console.log(e);
    }
  });

  bot.action(/withdrtail (\w+)/gi, async (ctx) => {
    const hostname = ctx.match[1];
    const buttons = [];
    buttons.push(Markup.button.callback('Отмена', `tail ${hostname}`));
    buttons.push(Markup.button.callback('Да', `withdrtail2 ${hostname}`));

    const toPrint = 'Вы уверены, что хотите изъять все свои взносы из очереди?';

    await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  });

  bot.action(/withdrtail2 (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];

    await exitFromTail(bot, ctx, user, hostname);
  });

  bot.action(/deposit (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    let contract;
    if (user.is_demo) contract = 'faketoken';

    const hostname = ctx.match[1];
    const params = await getHelixParams(bot, hostname);

    const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER', contract);

    const maxDeposit = await getCondition(bot, hostname, 'maxdeposit');
    // eslint-disable-next-line max-len
    const fractions_on_sale = await getBalancesOnSale(bot, params.host.username, user.eosname, params);
    const remain = (parseFloat(params.currentPool.remain) + fractions_on_sale.summ).toFixed(4) + ' FLOWER';

    let max = parseFloat(remain) >= parseFloat(liquidBal) ? liquidBal : remain;

    max = max.replace('FLOWER', 'FLOWER');
    user.state = 'set_deposit_amount';
    user.deposit_action = { hostname };
    await saveUser(bot.instanceName, user);
    await ctx.reply(`Введите сумму до ${max}:`);
  });

  bot.action(/tail (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    await printTail(bot, user, hostname);
  });

  bot.action(/withdraw (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    user.state = 'withdraw';
  });

  bot.action('depositaction', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    await depositAction(bot, ctx, user);
  });

  bot.action(/refreshaction (\w+)\s(\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    const balanceId = parseInt(ctx.match[2], 10);
    const currentIndex = parseInt(ctx.match[3], 10);

    await refreshAction(bot, ctx, user, hostname, balanceId, currentIndex);
  });

  bot.action(/precancelsell (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    const balanceId = parseInt(ctx.match[2], 10);

    const balance = await getOneUserHelixBalance(bot, hostname, user.eosname, balanceId);
    const buttons = [];
    buttons.push(Markup.button.callback('Да', `cancelsell ${hostname} ${balance.id}`));
    buttons.push(Markup.button.callback('Нет', 'cancelwithdrawaction'));

    await ctx.deleteMessage();

    if (parseFloat(balance.solded_for) > 0) {
      ctx.reply(`Вы уверены, что хотите отменить продажу фракций на сумму ${balance.compensator_amount.replace('FLOWER', 'FLOWER')} и получить ${balance.solded_for.replace('FLOWER', 'FLOWER')}?`, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    } else {
      ctx.reply(`Вы уверены, что хотите отменить продажу фракций на сумму ${balance.compensator_amount.replace('FLOWER', 'FLOWER')}?`, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    }
  });

  bot.action(/prewithdrawaction (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    const balanceId = parseInt(ctx.match[2], 10);

    await ctx.deleteMessage();

    const balance = await getOneUserHelixBalance(bot, hostname, user.eosname, balanceId);

    const buttons = [];

    if (balance) {
      if (balance.win == 1) {
        buttons.push(Markup.button.callback('Требовать', `withdrawaction ${hostname} ${balance.id}`));
        buttons.push(Markup.button.callback('Отменить', 'cancelwithdrawaction'));

        ctx.reply(`Вы уверены, что хотите продать фракции на сумму ${balance.available.replace('FLOWER', 'FLOWER')} с чистой прибылью ${balance.root_percent / 10000}?`, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      } else {
        if (balance.last_recalculated_win_pool_id > balance.global_pool_id && balance.pool_num > 2) {
          buttons.push(Markup.button.callback('Требовать', `withdrawaction ${hostname} ${balance.id}`));
          buttons.push(Markup.button.callback('Отменить', 'cancelwithdrawaction'));

          ctx.reply(`Вы уверены, что хотите отложенно продать фракции на сумму ${balance.compensator_amount.replace('FLOWER', 'FLOWER')}?`, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
        } else {
          buttons.push(Markup.button.callback('Требовать', `withdrawaction ${hostname} ${balance.id}`));
          buttons.push(Markup.button.callback('Отменить', 'cancelwithdrawaction'));

          ctx.reply(`Вы уверены, что хотите затребовать возврат фракций на сумму ${balance.available.replace('FLOWER', 'FLOWER')}?`, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
        }
      }
    } else ctx.reply('Баланс не найден');
  });

  bot.action('cancelwithdrawaction', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    ctx.editMessageText('Требование фракций отменено');
  });

  bot.action(/withdrawaction (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    const balanceId = parseInt(ctx.match[2], 10);

    await withdrawAction(bot, ctx, user, hostname, balanceId);
  });

  bot.action(/cancelsell (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    const balanceId = parseInt(ctx.match[2], 10);

    await cancelSellAction(bot, ctx, user, hostname, balanceId);
  });

  bot.action('withdrawbalance', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    console.log('on withdraw', user);

    user.state = '';

    const amount = parseFloat(user.fast_withdraw_action.out_quantity).toFixed(4) + ' FLOWER';
    const address = user.fast_withdraw_action.address;

    const withdraw_id = await insertWithdraw(bot.instanceName, user, {
      userId: user.id,
      eosname: user.eosname,
      amount,
      address,
      created_at: new Date(),
      status: 'created',
    });

    // MASSWITHDRAWACTION
    // massWithdrawAction(bot, user, bot.getEnv().CORE_HOST, balances.all).then((res) => {
    // TODO make a burn from user with address in memo

    try {
      await transferToGateAction(bot, user, amount, address);

      const buttons = [];

      console.log('withdraw_id: ', `confirmwithdraw ${withdraw_id}`);

      buttons.push(Markup.button.callback('подтвердить оплату', `confirmwithdraw ${withdraw_id}`));

      // TO CLIENT
      await sendMessageToUser(bot, user, { text: `Платежное поручение создано на сумму ${amount.replace('FLOWER', 'FLOWER')}. Перевод будет выполнен на адрес: ${address}. Вы получите подтверждение по факту исполнения поручения.` });

      // TO ADMIN

      const admin = await getUserByEosName(bot.instanceName, bot.getEnv().OPERATOR_EOSNAME);
      await sendMessageToUser(bot, admin, { text: `Получено новое платежное поручение на сумму:\n${amount} от пользователя ${user.eosname} (${user.id}). Перевод будет выполнен на адрес:` });
      await sendMessageToUser(bot, admin, { text: `${address}` }, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

      await updateWithdraw(bot.instanceName, withdraw_id, 'waiting');
    } catch (e) {
      await ctx.deleteMessage(); // delete buttons
      console.log(e);
      ctx.reply(`Ошибка! Обратитесь в поддержку с сообщением: ${e.message}`);
    }

    // })
    // }).catch((e) => {
    //   console.error(e);
    //   ctx.reply(`Произошла ошибка при выполнении транзакции вывода. Попробуйте еще раз или обратитесь в поддержку с сообщением: ${e.message}`);
    // });

    //
  });

  bot.action(/prioroneaction (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    const balanceId = parseInt(ctx.match[2], 10);

    try {
      await delUserHelixBalance(bot.instanceName, user.eosname, balanceId);
    } catch (e) {
      // empty
    }

    await priorityAction(bot, user, hostname, balanceId);

    await printUserBalances(bot, ctx, user, hostname);
    ctx.reply('Баланс поставлен в очередь');
  });

  bot.action(/buystatus (.+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const json = JSON.parse(ctx.match[1]);
    console.log('JSON', json);
    let text = '';
    // text += `Ваш статус: кот 🐈\n`
    const buttons = [];
    if (!json.s) {
      text += 'Статус - это подписка на доход ваших партнеров. Когда партнер получает прибыль, тогда получаете прибыль и вы.\n\n';
      text += 'гость - не получает доход от дохода партнеров\n';
      text += 'коала 🐨 - доход с 1го уровня партнеров\n';
      text += 'панда 🐼 - доход с 1го и 2го уровня партнеров\n';
      text += 'волк 🐺 - доход до 3го уровня партнеров\n';
      text += 'тигр 🐯 - доход до 4го уровня партнеров\n';
      text += 'лев 🦁 - доход до 5го уровня партнеров\n';
      text += 'медведь 🐻 - доход до 6го уровня партнеров\n';
      text += 'дракон 🐲 - доход со всех уровней партнеров\n';
      text += '\nВыберите уровень подписки: ';

      buttons.push(Markup.button.callback('🐨 коала', `buystatus ${JSON.stringify({ s: 1, du: 1, di: 1 })}`));
      buttons.push(Markup.button.callback('🐼 панда', `buystatus ${JSON.stringify({ s: 2, du: 1, di: 1 })}`));
      buttons.push(Markup.button.callback('🐺 волк', `buystatus ${JSON.stringify({ s: 3, du: 1, di: 1 })}`));
      buttons.push(Markup.button.callback('🐯 тигр', `buystatus ${JSON.stringify({ s: 4, du: 1, di: 1 })}`));
      buttons.push(Markup.button.callback('🦁 лев', `buystatus ${JSON.stringify({ s: 5, du: 1, di: 1 })}`));
      buttons.push(Markup.button.callback('🐻 медведь', `buystatus ${JSON.stringify({ s: 6, du: 1, di: 1 })}`));
      buttons.push(Markup.button.callback('🐲 дракон', `buystatus ${JSON.stringify({ s: 7, du: 1, di: 1 })}`));
      await ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    } else {
      let status = '';
      if (json.s === 1) {
        status = '🐨 коала';
      } else if (json.s === 2) {
        status = '🐼 панда';
      } else if (json.s === 3) {
        status = '🐺 волк';
      } else if (json.s === 4) {
        status = '🐯 тигр';
      } else if (json.s === 5) {
        status = '🦁 лев';
      } else if (json.s === 6) {
        status = '🐻 медведь';
      } else if (json.s === 7) {
        status = '🐲 дракон';
      }

      text += `Выбранный статус: ${status}\n`;
      text += `Продолжительность: ${json.du} мес\n`;
      text += `Стоимость: ${(PayForStatus * json.s * json.du * json.di).toFixed(4)} FLOWER\n`;
      text += `Скидка: -${100 - json.di * 100}%\n\n`;

      text += 'Выберите продолжильность: ';

      buttons.push(Markup.button.callback('назад', `buystatus ${JSON.stringify({})}`));

      buttons.push(Markup.button.callback(`${json.du === 1 ? '✅' : ''} 1 мес (-0%)`, `buystatus ${JSON.stringify({ ...json, du: 1, di: 1 })}`));
      buttons.push(Markup.button.callback(`${json.du === 3 ? '✅' : ''} 3 мес (-10%)`, `buystatus ${JSON.stringify({ ...json, du: 3, di: 0.9 })}`));
      buttons.push(Markup.button.callback(`${json.du === 6 ? '✅' : ''} 6 мес (-20%)`, `buystatus ${JSON.stringify({ ...json, du: 6, di: 0.8 })}`));
      buttons.push(Markup.button.callback(`${json.du === 9 ? '✅' : ''} 9 мес (-30%)`, `buystatus ${JSON.stringify({ ...json, du: 9, di: 0.7 })}`));
      buttons.push(Markup.button.callback(`${json.du === 12 ? '✅' : ''} 12 мес (-50%)`, `buystatus ${JSON.stringify({ ...json, du: 12, di: 0.5 })}`));
      buttons.push(Markup.button.callback('продолжить', `buystatusact ${JSON.stringify({ ...json })}`));

      // await ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      try {
        await ctx.editMessageText(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      } catch (e) {
        console.log('e', e);
      }
    }

    // await buyStatus(bot, user, json);
  });

  bot.hears('❓ справка', async (ctx) => {
    const buttons = [];

    const help_buttons = bot.getEnv().HELP_BUTTONS;

    help_buttons.map((btn) => {
      if (btn.type == 'callback') {
        buttons.push(Markup.button.callback(btn.title, btn.command));
      } else if (btn.type == 'url') {
        buttons.push(Markup.button.url(btn.title, btn.url));
      }
    });

    // buttons.push(Markup.button.callback('Схема работы', 'sendvideo'));
    // buttons.push(Markup.button.url('Вопрос-ответ', 'https://dacom.io/welcome'));
    // buttons.push(Markup.button.url('Поддержка', 'https://t.me/knouni_bot'));
    // buttons.push(Markup.button.url('Чат сообщества', 'https://t.me/+TDKgKiSzfB33gt33'));
    // buttons.push(Markup.button.url('Новости', 'https://t.me/dhelix_news'));

    // let user = await getUser(bot.instanceName, ctx.update.message.from.id);

    // if (!user.is_demo) buttons.push(Markup.button.callback('Запустить демо', 'startdemo'));

    await ctx.replyWithHTML(bot.getEnv().MAIN_HELP_MSG, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  });

  function getStatusByNumber(number) {
    let status;
    let status2;
    if (number == 1) {
      status = 'koala';
      status2 = '🐨 коала';
    } else if (number == 2) {
      status = 'panda';
      status2 = '🐼 панда';
    } else if (number == 3) {
      status = 'wolf';
      status2 = '🐺 волк';
    } else if (number == 4) {
      status = 'tiger';
      status2 = '🐯 тигр';
    } else if (number == 5) {
      status = 'leo';
      status2 = '🦁 лев';
    } else if (number == 6) {
      status = 'bear';
      status2 = '🐻 медведь';
    } else if (number == 7) {
      status = 'dragon';
      status2 = '🐲 дракон';
    }

    return { status, status2 };
  }

  bot.action(/buystatusact (.+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const json = JSON.parse(ctx.match[1]);

    const number = parseInt(json.s);

    const statuses = getStatusByNumber(json.s);
    console.log(statuses);
    const cost = (PayForStatus * json.s * json.du * json.di).toFixed(4);

    let text = '';
    // text += `Ваш статус: кот 🐈\n`
    const buttons = [];

    text += `Выбранный статус: ${statuses.status2}\n`;
    text += `Продолжительность: ${json.du} мес\n\n`;

    text += `Стоимость: ${cost} FLOWER\n`;

    buttons.push(Markup.button.callback('Отмена', `buystatus ${JSON.stringify({ ...json })}`));
    buttons.push(Markup.button.callback('Оплатить', `buystatusaction ${JSON.stringify({ status: statuses.status, cost })}`));

    await ctx.editMessageText(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());

    // await buyStatus(bot, user, json);
  });

  bot.action(/buystatusaction (.+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const json = JSON.parse(ctx.match[1]);
    json.cost += ' FLOWER';

    const myBalance = await getLiquidBalance(bot, user.eosname, 'FLOWER');

    console.log('COST: ', json.cost);

    if (parseFloat(myBalance) < parseFloat(json.cost)) {
      await ctx.deleteMessage();
      ctx.reply('Недостаточно средств на балансе.');
    } else {
      try {
        await payStatus(bot, 'core', user, json.status, json.cost);
        await ctx.deleteMessage();
        await ctx.reply('Статус получен');
        await printWallet(bot, user);
      } catch (e) {
        await ctx.reply(`Системная ошибка на этапе покупки статуса: ${e.message}`);
      }
    }

    // await buyStatus(bot, user, json);
  });

  bot.action(/mybalances (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    const nextId = parseInt(ctx.match[2], 10);

    await printUserBalances(bot, ctx, user, hostname, nextId);
  });

  bot.action(/showtasks (\w+)\s(\w+)?/gi, async (ctx) => {
    // console.log("on show task")
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const hostname = ctx.match[1];
    const nextId = parseInt(ctx.match[2], 10);

    await printTasks(bot, ctx, user, hostname, nextId);
  });

  // eslint-disable-next-line no-unused-vars
  bot.action(/showgoals (\w+)\s(\w+)?/gi, async (ctx) => {
    // console.log("on show goal")
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const hostname = ctx.match[1];
    // const next_id = parseInt(ctx.match[2]);
    // console.log("next_id", next_id)

    await printGoalsMenu(bot, ctx, user, hostname);
  });

  bot.action(/sellexp (.+)\s(.+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const hostname = ctx.match[1];

    const userPower = await bot.uni.coreContract.getUserPower(user.eosname, hostname);

    if (userPower.power > 0) {
      const params = await getHelixParams(bot, hostname);
      const totalShares = params.host.total_shares > 0 ? params.host.total_shares : 1;
      const totalSharesAsset = `${((Number(userPower.power) / parseFloat(totalShares)) * parseFloat(params.host.quote_amount)).toFixed(4)} ${params.host.quote_symbol}`;

      const buttons = [];
      buttons.push(Markup.button.callback('Отмена', `showexp ${hostname}`));
      buttons.push(Markup.button.callback('Изъять', `sellexpnow ${hostname} ${userPower.power}`));

      const toPrint = `Вы уверены, что хотите изъять свой опыт из пула на сумму ${totalSharesAsset}?`;

      await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    } else {
      const buttons = [];

      const toPrint = 'У вас нет опыта для продажи. Получите его в спирали или купите.';

      buttons.push(Markup.button.callback('Отмена', `showexp ${hostname}`));

      await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    }
  });

  bot.action(/sellexpnow (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const hostname = ctx.match[1];
    const shares = ctx.match[2];

    await sellSharesAction(bot, ctx, user, hostname, shares);
  });

  bot.action(/backto (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const to = ctx.match[1];
    const hostname = ctx.match[2];
    if (to === 'helixs') await printHelixs(bot, ctx, user, null, hostname);

    else if (to === 'helix') {
      await printHelixWallet(bot, ctx, user, hostname);
    } else if (to === 'wallet') {
      await ctx.editMessageText('Покупка фракций отменена');
      await printWallet(bot, user);
    }
  });

  bot.action(/showexp (\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    await printExpirience(bot, ctx, user, hostname);
  });

  bot.hears('❇️ заложить FLOWER', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    console.log('user', user);
    // await checkForExistBCAccount(bot, ctx);
    await printHelixs(bot, ctx, user);
  });

  bot.hears('🌀 касса', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    if (user.is_demo) await printHelixWallet(bot, ctx, user, bot.getEnv().DEMO_HOST);
    else if (bot.getEnv().MODE === 'community') await printHelixWallet(bot, ctx, user, bot.getEnv().COMMUNITY_HOST);
  });

  bot.hears('🛑 требовать FLOWER', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    // const hostname = ctx.match[1];
    // const nextId = parseInt(ctx.match[2], 10);

    const list = await getHelixsList(bot);
    const first = list[0];
    console.log('FIRST:', first);

    if (first) {
      // await printUserFractions(bot, ctx, user, first.username)
      await printUserBalances(bot, ctx, user, first.username);
    } else ctx.reply('у вас нет фракций для отображения.');

    console.log(list);

    // if (user.is_demo) await printGoalsMenu(bot, ctx, user, bot.getEnv().DEMO_HOST);
    // else if (bot.getEnv().MODE === 'community') await printGoalsMenu(bot, ctx, user, bot.getEnv().COMMUNITY_HOST);
  });

  bot.hears('🏁 завершить демо', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    // await checkForExistBCAccount(bot, ctx);
    const buttons = [];

    buttons.push(Markup.button.callback('🛑 Отмена', 'cancelfinish'));
    buttons.push(Markup.button.callback('✅ Завершить', 'finishdemo'));

    await ctx.reply('Вы уверены, что хотите завершить демо и войти в реальную жизнь?', Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  });

  bot.action('startdemo', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    user.is_demo = true;

    await saveUser(bot.instanceName, user);
    const userHasRequest = await hasRequest(bot, user.eosname, 'faketoken');

    if (!userHasRequest) await requestPromoBudgetAction(bot, user, 'eosio');
    else await continueDemo(bot, user, 'eosio');
  });

  bot.action('cancelfinish', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    await ctx.deleteMessage();

    await printHelixWallet(bot, ctx, user, bot.getEnv().DEMO_HOST);
  });

  bot.action('finishdemo', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    user.is_demo = false;

    await saveUser(bot.instanceName, user);

    await printMainMenu(ctx, 'Демо-режим завершен');

    if (user.ref) {
      const giveFlower = await checkSponsor(bot, user.eosname, user.ref, 'eosio.token');

      if (giveFlower) await requestPromoBudgetAction(bot, user, user.ref);
    }

    await printWallet(bot, user);
  });

  bot.action(/pusheducation (\w+)/gi, async (ctx) => {
    const currentSlideIndex = Number(ctx.match[1]);
    await pushEducation(bot, ctx, currentSlideIndex);
  });

  bot.hears('Начать ознакомление', async (ctx) => {
    await pushEducation(bot, ctx, 0);
  });

  bot.hears('Пропустить ознакомление', async (ctx) => {
    await finishEducation(ctx);
  });

  bot.hears('Зачем мне цветки?', async (ctx) => {
    const menu = Markup
      .keyboard([
        'Что если я верну цветки?',
      ], { columns: 1 }).resize();
    await ctx.replyWithHTML('Курс обмена цифровых цветков растёт до 100% в месяц по графику:', menu);
    await ctx.replyWithPhoto('https://i.ibb.co/k2PqnVP/3-003.jpg');
  });

  bot.hears('Что если я верну цветки?', async (ctx) => {
    const menu = Markup
      .keyboard([
        'Начать',
      ], { columns: 1 }).resize();
    await ctx.replyWithHTML('Вернув роботу цифровые цветки по новому курсу, вы получите финансовую помощь от человека с прибылью. ', menu);
    await ctx.replyWithPhoto('https://i.ibb.co/FnXgxDt/PH2.jpg');
  });

  bot.hears('Начать', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    const icomeMenu = Markup
      .keyboard(demoButtons, { columns: 2 }).resize();
    await ctx.replyWithHTML('Режим ознакомления активирован 📟', icomeMenu);

    await printHelixWallet(bot, ctx, user, bot.getEnv().DEMO_HOST);
  });

  bot.hears('Поддержка', async (ctx) => {
    await ctx.replyWithHTML('Бот поддержки: @knouni_bot');
  });

  bot.hears('Назад', async (ctx) => {
    await backToMainMenu(ctx);
  });

  bot.action('deposit', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    // await ctx.deleteMessage();
    // console.log("купить билет")
    // await setBuyMenu(ctx)
    await buyTicket(bot, user, ctx, 'USDT.TRC20');
  });

  async function buyTicket(bot, user, ctx, currency) {
    try {
      const params = {
        username: user.eosname,
        currency,
        type: 'issue',
        botName: bot.instanceName,
        hostname: bot.getEnv().CORE_HOST,
        meta: {}
      };
      const path = `${bot.getEnv().PAY_GATEWAY}/generate`;

      const result = await axios.post(
        path,
        params,
      );

      if (result.data.status === 'ok') {
        await ctx.replyWithHTML('Взносы принимаются в USDT (TRC-20). Прочитайте <a href="https://dacom.io/60279ba5d0454f5cac5f4c782d412988">инструкцию</a> и отправьте USDT на ваш персональный адрес:', { disable_web_page_preview: true });
        await ctx.reply(`${result.data.address}`);
      } else {
        ctx.reply('Произошла ошибка на получении адреса. Попробуйте позже. ');
        console.log(result.data);
      }
    } catch (e) {
      console.log(e);
      ctx.reply('Произошла ошибка на получении адреса. Попробуйте позже. ');
    }
  }

  bot.hears('⬆️ оказать помощь', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    user.state = 'giveHelp';
    await saveUser(bot.instanceName, user);
    const buttons = [];
    await ctx.replyWithHTML('Оказывай безвозмездную финансовую помощь партнёрам и получай цифровые цветки в дар от системы. 🌼', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    await showBuySellMenu(bot, user, ctx);
  });

  bot.hears('⬇️ получить помощь', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    user.state = 'getHelp';
    await saveUser(bot.instanceName, user);
    const buttons = [];
    await ctx.replyWithHTML('Получай безвозмездную финансовую помощь от партнёров, возвращая цифровые цветки в дар системе. 🌼', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    await showBuySellMenu(bot, user, ctx);
  });

  bot.hears('💎 кошелёк', async (ctx) => {
    // await checkForExistBCAccount(bot, ctx);

    const user = await getUser(bot.instanceName, ctx.update.message.from.id);

    if (user) await printWallet(bot, user);
  });

  bot.hears('партнёры', async (ctx) => {
    // await checkForExistBCAccount(bot, ctx);
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);
    const link = `https://t.me/${(await bot.telegram.getMe()).username}?&start=${user.eosname}`;

    await ctx.replyWithHTML(`Для приглашения партнёров используйте ссылку: ${link}\n\nПриглашая партнёров в Коллективный Разум, вы ускоряете достижение своей мечты.`);
  });

  bot.hears('действия', async (ctx) => {
    // await checkForExistBCAccount(bot, ctx);
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);
    printTasks(bot, ctx, user);
  });

  bot.action(/buywith (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const currency = ctx.match[1];
    user.order_action = {
      name: 'createorder',
      data: {
        parent_id: '', type: 'buy', username: user.eosname, out_symbol: currency,
      },
    };
    await saveUser(bot.instanceName, user);

    let orders = await bot.uni.p2pContract.getOrders();

    orders = orders.filter((order) => order.out_symbol === currency && order.type === 'sell' && parseFloat(order.quote_remain) > 0 && order.status === 'waiting' && order.creator !== user.eosname);

    const outRate = await bot.uni.p2pContract.getUsdRate(currency, 4);

    const buttons = orders.map((order) => {
      const outQuantity = `${(parseFloat(order.quote_remain) / parseFloat(outRate)).toFixed(4)} ${currency}`;
      return Markup.button.callback(`до ${outQuantity} - партнёр ${order.creator.toUpperCase()}`, `orderid ${order.id}`);
    });

    if (orders.length > 0) ctx.editMessageText('Выберите заявку и нажмите на неё:', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    else ctx.editMessageText('На данный момент в системе нет заявок на получение помощи. Возвращайтесь позже.');
  });

  bot.action(/sellwith (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const currency = ctx.match[1];
    user.order_action = {
      name: 'createorder',
      data: {
        parent_id: 0, type: 'sell', username: user.eosname, out_symbol: currency,
      },
    };

    user.state = 'set_order_details';
    ctx.editMessageText(`Введите ваши реквизиты для создания платежного поручения в ${currency}${currency === 'USDT' ? ', сеть TRC20:' : ':'} `);
    await saveUser(bot.instanceName, user);
  });

  bot.action('sendvideo', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    // TODO approve order
    await sendMessageToUser(bot, user, { text: 'https://youtu.be/AMyoPTnrxno' });
  });

  bot.action(/startaction (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const taskId = ctx.match[1];

    user.state = 'waitreport';
    user.task_action = {
      name: 'setreport',
      data: {
        host: 'core', username: user.eosname, task_id: taskId, data: '',
      },
    };
    await saveUser(bot.instanceName, user);
    ctx.reply(user.task.data || 'Напишите отчёт:');
  });

  // eslint-disable-next-line no-unused-vars
  bot.action(/declinebuyorder (\w+)/gi, async (ctx) => {
    // TODO cancel order
    // const order_owner = ctx.match[1];
    // let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    // backToMainMenu(ctx)
  });

  bot.action(/subscribe (\w+)/gi, async (ctx) => {
    // TODO cancel order
    const hostname = ctx.match[1];
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    let subscribedNow = false;
    if (!user.subscribed_to) user.subscribed_to = [];

    if (user.subscribed_to.includes(hostname)) {
      user.subscribed_to = user.subscribed_to.filter((value) => value !== hostname);

      subscribedNow = true;
    } else user.subscribed_to.push(hostname);

    await saveUser(bot.instanceName, user);

    let buttons = [];

    buttons.push(Markup.button.callback('Назад', `backto helixs ${hostname}`));

    buttons.push(Markup.button.callback('Обновить', `select ${hostname}`));

    buttons.push(Markup.button.callback('Мой опыт', `showexp ${hostname} `));

    // buttons.push(Markup.button.callback('Цели', `showgoals ${hostname} `));

    buttons.push(Markup.button.callback('Очередь', `tail ${hostname}`));

    buttons.push(Markup.button.callback('Мои взносы', `mybalances ${hostname} `));

    buttons.push(Markup.button.callback('Совершить взнос', `deposit ${hostname}`));

    if (subscribedNow) buttons.push(Markup.button.callback('☑️ Подписка на обновления', `subscribe ${hostname}`));
    else buttons.push(Markup.button.callback('✅ Подписка на обновления', `subscribe ${hostname}`));

    const keyboard = buttons;

    const columnsCount = 2;

    buttons = keyboard.reduce((curr, next, index) => {
      if (index % columnsCount === 0) {
        curr.push([]);
      }

      const [row] = curr.slice(-1);

      row.push(next);

      return curr;
    }, []);

    ctx.editMessageReplyMarkup({ inline_keyboard: buttons });
  });

  bot.action(/withdrallwin (\w+)/gi, async (ctx) => {
    // TODO cancel order
    const hostname = ctx.match[1];
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const balances = await getUserHelixBalances(bot, hostname, user.eosname);

    const buttons = [];

    if (balances.priorityBalances.length > 0) {
      buttons.push(Markup.button.callback('Перевложить убыточные', `priority ${hostname}`));
      buttons.push(Markup.button.callback('Забрать убыточные', `withdrlose ${hostname}`));
    } else {
      await printHelixWallet(bot, ctx, user, hostname);
    }

    ctx.editMessageReplyMarkup({ inline_keyboard: [buttons] });

    await massWithdrawAction(bot, user, hostname, balances.winBalances);

    await sendMessageToUser(bot, user, { text: `Произведен успешный вывод на сумму ${balances.totalWinBalances}.` });
  });

  bot.action(/withdrlose (\w+)/gi, async (ctx) => {
    // TODO cancel order
    const hostname = ctx.match[1];
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const balances = await getUserHelixBalances(bot, hostname, user.eosname);

    const buttons = [];

    if (balances.winBalances.length > 0) {
      buttons.push(Markup.button.callback('Забрать прибыльные', `withdrallwin ${hostname}`));
    } else {
      await printHelixWallet(bot, ctx, user, hostname);
    }

    await ctx.editMessageReplyMarkup({ inline_keyboard: [buttons] });

    await massWithdrawAction(bot, user, hostname, balances.priorityBalances);

    await sendMessageToUser(bot, user, { text: `Произведен успешный вывод взносов на сумму ${balances.totalLoseBalances}.` });
  });

  bot.action(/priority (\w+)/gi, async (ctx) => {
    // TODO cancel order
    const hostname = ctx.match[1];
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const balances = await getUserHelixBalances(bot, hostname, user.eosname);

    const buttons = [];

    if (balances.winBalances.length > 0) {
      buttons.push(Markup.button.callback('Забрать прибыльные', `withdrallwin ${hostname}`));
    } else {
      await printHelixWallet(bot, ctx, user, hostname);
    }

    ctx.editMessageReplyMarkup({ inline_keyboard: [buttons] });

    try {
      // eslint-disable-next-line no-restricted-syntax
      for (const balance of balances.priorityBalances) {
        // eslint-disable-next-line no-await-in-loop
        await priorityAction(bot, user, hostname, balance.id);
      }
    } catch (e) {
      console.log('error on priority: ', e);
    }

    await sendMessageToUser(bot, user, { text: `Произведена успешная постановка в очередь на сумму ${balances.totalPriorityBalances}. Балансы очереди доступны к просмотру в кассе - раздел очередь.` });
  });

  bot.action(/acceptbuyorder (\w+)/gi, async (ctx) => {
    // TODO approve order
    const orderId = ctx.match[1];
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await acceptBuyOrder(bot, orderId, user, ctx);
  });

  bot.action('preparespread', async (ctx) => {
    // TODO approve order

    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const myBalance = await getLiquidBalance(bot, user.eosname, 'FLOWER');

    await prepareSpreadAction(bot, user, ctx, myBalance);
  });

  // eslint-disable-next-line no-unused-vars
  bot.action('startspread', async (ctx) => {
    // TODO approve order

    // let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    // TODO??? не определено
    // startSpreadAction(user, ctx);

    // backToMainMenu(ctx)
  });

  bot.action('startpromotion', async (ctx) => {
    // TODO approve order

    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    user.state = 'add_promo_budget';

    user.add_promo_budget = '0.0000 FLOWER';

    await saveUser(bot.instanceName, user);

    ctx.reply('Новые пользователи, которые перейдут по вашей рефералальной ссылке, смогут получить 1 FLOWER из вашего бюджета, и принять участие в кассе.\n\nВведите сумму в FLOWER для пополнения спонсорского бюджета.');
  });

  bot.action('addpromobudgetaction', async (ctx) => {
    // TODO approve order

    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const budget = user.add_promo_budget;

    user.state = '';
    user.add_promo_budget = '0.0000 FLOWER';
    await saveUser(bot.instanceName, user);
    try {
      await addPromoBudgetAction(bot, ctx, user, budget);
    } catch (e) {
      ctx.reply('Ошибка: ', e.message);
    }
  });

  bot.action(/cancelorder (\w+)/gi, async (ctx) => {
    // TODO cancel order
    const orderId = ctx.match[1];
    await cancelOrder(bot, orderId, ctx);
  });

  bot.action(/delorder (\w+)/gi, async (ctx) => {
    // TODO cancel order
    const orderId = ctx.match[1];
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await delOrder(bot, orderId, user.eosname);

    ctx.editMessageText('Заявка очищена. Создайте новую, если это необходимо.');
  });

  bot.action('cancelorder2', async (ctx) => {
    // TODO cancel order
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    user.active_order = {};
    user.orderStatus = '';
    user.order_action = {};
    saveUser(bot.instanceName, user).then();
    await backToMainMenu(ctx, 'Отмена и возврат в главное меню.');
  });

  bot.action(/confirmbuyorder (\w+)/gi, async (ctx) => {
    // TODO cancel order
    const orderId = ctx.match[1];
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    await confirmActiveBuyOrder(bot, user, orderId, ctx);
  });

  bot.action(/approvebuyorder (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    // TODO cancel order
    const orderId = ctx.match[1];
    await approveActiveBuyOrder(bot, user, orderId);
  });

  bot.action('disputeorder', async (ctx) => {
    // TODO cancel order
    ctx.reply('Обратитесь в поддержку, указав имя своего аккаунта из вашего кошелька: @knouni_bot');
  });

  bot.action('finhelp', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await showBuySellMenu(bot, user, ctx);
  });

  bot.action('createorder', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    user.state = '';
    user.orderStatus = 'waiting';
    await saveUser(bot.instanceName, user);
    await createOrder(bot, user, ctx);
  });

  bot.action(/orderid (\w+)/gi, async (ctx) => {
    const parentId = ctx.match[1];
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const orders = await bot.uni.p2pContract.getOrders();

    const order = orders.find((itr) => Number(itr.id) === Number(parentId));
    // TODO check amount не больше своей суммы в кошельке.
    if (order) {
      const currency = user.order_action.data.out_symbol;
      const outUsdRate = await bot.uni.p2pContract.getUsdRate(currency, 4);
      const min = `${(1 / parseFloat(outUsdRate)).toFixed(0)} ${currency}`;
      const max = `${(parseFloat(order.quote_remain) / parseFloat(outUsdRate)).toFixed(0)} ${currency}`;

      ctx.editMessageText(`Введите сумму!\n\n Пожалуйста, введите сумму оказания помощи от ${min} до ${max} цифрами.`);

      user.order_action.data.parent_id = parentId;
      user.state = 'set_order_amount';
      await saveUser(bot.instanceName, user);
    } else {
      ctx.editMessageText('Ордер не найден');
    }
  });

  bot.action(/transfer/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    user.state = 'transfer_to';
    user.transfer_action = { name: 'transfer', data: { from: user.eosname, to: '', memo: '' } };
    saveUser(bot.instanceName, user).then();
    ctx.reply('Введите системное имя аккаунта получателя блага: ');
  });

  bot.action(/transfaction (.*$)/gm, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const amount = ctx.match[1];

    await transferAction(bot, user, amount, ctx);
  });

  bot.action('prewithdrawbalance', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER');

    if (parseFloat(liquidBal) == 0) {
      await ctx.reply('Ваш доступный баланс равен нулю. Если у вас есть фракции, пожалуйста, продайте их до создания заявки на вывод.');
    } else {
      user.state = 'set_order_amount';
      user.fast_withdraw_action = {};
      await saveUser(bot.instanceName, user);

      await ctx.replyWithHTML(`Здесь вы можете создать платежное поручение, которое будет оплачено кооперативом в USDT на предоставленный вами адрес в сети TRON (TRC.20). Подробная инструкция обмена FLOWER на RUB <a href="https://dacom.io/c473c948fab0435aa432eb436d245998">здесь</a>.\n\nСумма для создания поручения от 2 до ${liquidBal.replace('FLOWER', 'FLOWER')}. Комиссия исполнения: 1 FLOWER.\n\nВведите сумму для создания платежного поручения:`, {disable_web_page_preview: true});
    }
  });

  bot.on('contact', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);
    const quiz = await getQuiz(bot.instanceName, user.id);

    quiz.answers.map((el, index) => {
      if (index === quiz.current_quiz) {
        el.answer = ctx.update.message.contact;
      }
    });

    await saveQuiz(bot.instanceName, user, quiz);
    await nextQuiz(bot, user, ctx);
  });

  bot.on('message', async (ctx) => {
    const userId = ctx.update.message.from.id;
    const user = await getUser(bot.instanceName, userId);
    if (!user || !user.wif) {
      return;
    }

    const isAdminUser = await isAdmin(bot, userId);
    const isText = ctx.update.message.text;
    const isVoice = ctx.update.message.voice;
    const isPhoto = ctx.update.message.photo;
    const isVideoNote = ctx.update.message.video_note;
    const isVideo = ctx.update.message.video;
    const isLocation = ctx.update.message.location;

    if (ctx.update.message.chat.type === 'private') {
      const quiz = await getQuiz(bot.instanceName, user.id);
      const { text } = ctx.update.message;

      if (quiz && !quiz.is_finish) {
        quiz.answers.map((el, index) => {
          if (index === quiz.current_quiz) {
            el.answer = text;
          }
        });

        await saveQuiz(bot.instanceName, user, quiz);
        await nextQuiz(bot, user, ctx);
      } else if (isLocation) {
        if (isAdminUser) {
          const count = await sendMessageToAll(ctx.update.message);
          await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
        }
      } else if (isVideo) {
        if (isAdminUser) {
          console.log('ctx.update.message', ctx.update.message);
          const count = await sendMessageToAll(ctx.update.message);
          await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
        }
      } else if (isVideoNote) {
        if (isAdminUser) {
          const count = await sendMessageToAll(ctx.update.message);
          await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
        }
      } else if (isPhoto) {
        if (isAdminUser) {
          // eslint-disable-next-line max-len
          const count = await sendMessageToAll({ photo: ctx.update.message.photo, caption: ctx.update.message.caption });
          await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
        }
      } else if (isVoice) {
        if (isAdminUser) {
          const count = await sendMessageToAll(ctx.update.message);
          await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
        }
      } else if (isText) {
        const { text } = ctx.update.message;

        if (user.state === 'waitreport') {
          await ctx.replyWithHTML('Отчёт принят и ожидает проверки.');
          // TODO send report
          const eos = await bot.uni.getEosPassInstance(user.wif);
          user.task_action.data.data = ctx.update.message.text;

          eos.transact({
            actions: [{
              account: 'unicore',
              name: 'setreport',
              authorization: [{
                actor: user.eosname,
                permission: 'active',
              }],
              data: user.task_action.data,
            }],
          }, {
            blocksBehind: 3,
            expireSeconds: 30,
          }).then(async () => {
            user.state = '';
            user.task_action = {};

            const reports = await bot.uni.coreContract.getReports(user.eosname);
            const tasks = await bot.uni.coreContract.getTasks(user.eosname, reports);
            const buttons = [];

            if (tasks[0]) {
              // eslint-disable-next-line prefer-destructuring
              user.task = tasks[0];
              await saveUser(bot.instanceName, user);
              buttons.push(Markup.button.callback('приступить', `startaction ${user.task.task_id}`));

              const output = await generateTaskOutput(tasks[0]);
              await ctx.replyWithHTML(output, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
            } else {
              await ctx.replyWithHTML('Доступных заданий пока нет. Приходите позже. ');
            }
          }).catch((e) => {
            user.state = '';

            saveUser(bot.instanceName, user);
            return ctx.replyWithHTML(`Ошибка: ${e.message}`);
          });
        } else if (user.state === 'set_order_amount') {
          const on_withdraw = parseFloat(text);

          const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER');

          if (on_withdraw > parseFloat(liquidBal)) {
            await ctx.reply(`Ваш доступный баланс ${liquidBal} меньше того, который вы ставите на вывод. Пожалуйста, продайте свои фракции и убедитесь, что доступный баланс превышает сумму вывода.`);
            return;
          }

          user.fast_withdraw_action.out_quantity = parseFloat(text);
          user.state = 'set_order_details';
          await saveUser(bot.instanceName, user);
          await ctx.reply('Пожалуйста, введите адрес для вывода USDT.TRC20 (сеть TRON):');
        } else if (user.state === 'set_order_details') {
          user.state = '';

          user.fast_withdraw_action.address = text;
          await saveUser(bot.instanceName, user);

          const buttons = [];
          buttons.push(Markup.button.callback('Да', 'withdrawbalance'));
          buttons.push(Markup.button.callback('Нет', 'cancelwithdrawbalance'));
          await ctx.replyWithHTML(`Вы уверены, что хотите создать платежное поручение на сумму: ${user.fast_withdraw_action.out_quantity} USDT? Реквизиты для получения: ${text}\n\n`, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
        } else if (user.state === 'transfer_to') {
          const account = await bot.uni.readApi.getAccount(text).catch((err) => {
            console.error(err);
            return null;
          });

          if (account) {
            user.state = 'transfer_amount';
            user.transfer_action.data.to = text;
            saveUser(bot.instanceName, user).then();
            await ctx.replyWithHTML('Введите сумму блага:');
          } else {
            await ctx.replyWithHTML('Аккаунт получателя не существует. Проверьте имя аккаунта и повторите попытку.');
          }
        } else if (user.state === 'transfer_amount') {
          const amount = `${parseFloat(text).toFixed(4)} FLOWER`;

          const buttons = [];

          buttons.push(Markup.button.callback('Да', `transfaction ${amount}`));
          buttons.push(Markup.button.callback('Нет', 'canceltransfer'));

          user.transfer_action.data.amount = amount;

          const textTo = `Вы уверены, что хотите совершить перевод на аккаунт ${user.transfer_action.data.to} на сумму ${amount}?`;

          ctx.reply(textTo, Markup.inlineKeyboard(buttons, { columns: 2 }));
          user.state = '';
          await saveUser(bot.instanceName, user);
        } else if (user.state === 'set_deposit_amount') {
          const { hostname } = user.deposit_action;
          const helix = await getHelixParams(bot, user.deposit_action.hostname);

          let depositNow = false;

          const amount = `${parseFloat(text).toFixed(helix.host.precision)} ${helix.host.symbol}`;
          let contract;

          if (user.is_demo) contract = 'faketoken';

          const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER', contract);

          const maxDeposit = await getCondition(bot, hostname, 'maxdeposit');
          const fractions_on_sale = await getBalancesOnSale(bot, helix.host.username, user.eosname, helix);
          const remain = (parseFloat(helix.currentPool.remain) + fractions_on_sale.summ).toFixed(4) + ' FLOWER';

          console.log('REMAIN: ', remain, amount);

          if (maxDeposit > 0) {
            const currentDeposit = await getCurrentUserDeposit(bot, hostname, user.eosname);
            if (parseFloat(currentDeposit) >= parseFloat(maxDeposit) / 10000) await ctx.reply(`Вы достигли предела взносов в этой кассе. Максимальный предел: ${(parseFloat(maxDeposit) / 10000).toFixed(4)} FLOWER, ваш текущий взнос: ${currentDeposit}`);
            else {
              depositNow = true;
            }
          } else if (parseFloat(amount) > parseFloat(liquidBal)) {
            await ctx.reply(`Недостаточный баланс для совершения взноса. Ваш баланс: ${liquidBal}. Введите сумму заново.`);
          } else if (parseFloat(amount) > parseFloat(remain)) {
            await ctx.reply(`Максимальная сумма покупки на данном этапе ${remain}. Введите сумму заново:`);
          } else {
            depositNow = true;
          }

          if (depositNow) {
            user.state = '';
            user.deposit_action.quantity = amount;
            const buttons = [];

            buttons.push(Markup.button.callback('Да', 'depositaction'));
            buttons.push(Markup.button.callback('Нет', `backto wallet ${user.deposit_action.hostname}`));// helix ${user.deposit_action.hostname}

            ctx.reply(`Вы подтверждаете, что хотите купить фракцию ${user.deposit_action.hostname.toUpperCase()} на сумму ${user.deposit_action.quantity.replace('FLOWER', 'FLOWER')}?`, Markup.inlineKeyboard(buttons, { columns: 2 }));
            await saveUser(bot.instanceName, user);
          }
        } else if (user.state === 'add_promo_budget') {
          user.state = '';

          user.add_promo_budget = `${parseFloat(text).toFixed(4)} FLOWER`;

          const buttons = [];

          buttons.push(Markup.button.callback('Да', 'addpromobudgetaction'));
          buttons.push(Markup.button.callback('Нет', 'backto wallet'));

          ctx.reply(`Вы уверены что хотите произвести взнос в свой спонсорский бюджет на сумму ${user.add_promo_budget}?`, Markup.inlineKeyboard(buttons, { columns: 2 }));
          await saveUser(bot.instanceName, user);
        } else if (isAdminUser) {
          user.state = '';
          user.message_to_send = text;
          const buttons = [];

          buttons.push(Markup.button.callback('Отмена', 'cancelsendtoall'));
          buttons.push(Markup.button.callback('Да', 'sendtoall'));

          const toPrint = 'Отправить сообщение всем пользователям робота?';

          await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
          await saveUser(bot.instanceName, user);
        }
      }
    }
  });

  await checkAllUserAccountsForExist(bot);

  return null;
};
