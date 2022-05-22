const { Markup } = require('telegraf');
const axios = require('axios');
const { ChainsSingleton, generateAccount: generateUniAccount } = require('unicore');
const EosApi = require('eosjs-api');

const { restoreAccount } = require('./restore');
const {
  mainButtons, communityButtons, backToMainMenu, demoButtons,
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

const education = require('./education');

const {
  loadDB,
  getUser,
  saveUser,
  addUserHelixBalance,
  delUserHelixBalance,
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
  try {
    const eos = await bot.uni.getEosPassInstance(user.wif);

    const data = await eos.transact({
      actions: [{
        account: helix.host.root_token_contract,
        name: 'transfer',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          from: user.eosname,
          to: 'unicore',
          quantity: user.deposit_action.quantity,
          memo: `100-${user.deposit_action.hostname}-`,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    const cons = data.processed.action_traces[0].inline_traces[1].console;
    const regex = /BALANCE_ID: (\w+);?/gi;
    const group = regex.exec(cons);
    const balanceId = group[1];
    // eslint-disable-next-line max-len
    const balance = await getOneUserHelixBalance(bot, user.deposit_action.hostname, user.eosname, balanceId);
    await addUserHelixBalance(user.eosname, balance);
    await ctx.replyWithHTML('Взнос успешно принят');
    await printHelixWallet(bot, ctx, user, user.deposit_action.hostname);
  } catch (e) {
    await ctx.replyWithHTML(e.message);
    console.error('ere: ', e);
  }
}

async function refreshAction(bot, ctx, user, hostname, balanceId, currentIndex) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  try {
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
  let t = 'Добро пожаловать.\n\n<b>ОКАЗАТЬ ПОМОЩЬ</b> - произвести добровольное безвозмездное пожертвование партнёрам и получить FLOWER.\n\n<b>ПОЛУЧИТЬ ПОМОЩЬ</b> - подарить FLOWER системе и получить добровольное безвозмездное пожертвование от партнёров.\n\n<b>КОШЕЛЁК</b> - хранит ваши FLOWER и подсчитывает вознаграждения от участия в кассах.\n\n<b>КАССЫ</b> - пространство честного обмена, где все зарабатывают.\n\n<b>КАК ЭТО РАБОТАЕТ</b> - раздел с описанием и обратной связью.\n\nКлубный чат: @helix_club';

  if (text) t = text;

  await ctx.replyWithHTML(t, icomeMenu);
}

async function printCommunityMenu(ctx, text) {
  const icomeMenu = Markup
    .keyboard(communityButtons, { columns: 2 }).resize();
  let t = 'Добро пожаловать.\n\n<b>ОКАЗАТЬ ПОМОЩЬ</b> - произвести добровольное безвозмездное пожертвование партнёрам и получить FLOWER.\n\n<b>ПОЛУЧИТЬ ПОМОЩЬ</b> - подарить FLOWER системе и получить добровольное безвозмездное пожертвование от партнёров.\n\n<b>КОШЕЛЁК</b> - хранит ваши FLOWER и подсчитывает вознаграждения от участия в кассах.\n\n<b>КАССЫ</b> - пространство честного обмена, где все зарабатывают.\n\n<b>КАК ЭТО РАБОТАЕТ</b> - раздел с описанием и обратной связью.\n\nКлубный чат: @helix_club';

  if (text) t = text;

  await ctx.replyWithHTML(t, icomeMenu);
}

async function finishEducation(ctx) {
  await printMainMenu(ctx); // OR ask nickname
}

async function pushEducation(ctx, currentSlideIndex) {
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

      await ctx.reply('Ознакомление запущено', incomeMenu, { reply_markup: { remove_keyboard: true } });
    }

    const buttons = [];

    buttons.push(Markup.button.callback('Назад', `pusheducation ${currentSlideIndex - 1}`));

    if (currentSlideIndex + 1 === education.length) buttons.push(Markup.button.callback('Начать с начала', `pusheducation ${0}`));
    else { buttons.push(Markup.button.callback('Дальше', `pusheducation ${currentSlideIndex + 1}`)); }

    buttons.push(Markup.button.callback('Пропустить', `pusheducation ${education.length}`));

    let text = '';
    text += `\n\n${slide.text}`;

    if (currentSlideIndex === 0) {
      // eslint-disable-next-line max-len
      await ctx.replyWithPhoto({ source: slide.img }, { caption: text, ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize() });
    } else {
      await ctx.deleteMessage();

      if (slide.img.length > 0) {
        // eslint-disable-next-line max-len
        await ctx.replyWithPhoto({ source: slide.img }, { caption: text, ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize() });
      } else {
        await ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
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

    await ctx.reply('Добро Пожаловать в Двойную Спираль! ⚪️🌼⚫️');

    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    // console.log("user", ctx.update.message.from)
    const eosname = '';

    if (!user) {
      msg2 = await ctx.reply('Пожалуйста, подождите, мы создаём для вас аккаунт в блокчейне.. ⛓');

      if (await restoreAccount(bot, ctx, ctx.update.message.from, true) === false) {
        user = ctx.update.message.from;
        user.app = bot.getEnv().APP;

        await saveUser(bot.instanceName, user);
        user.eosname = await generateAccount(bot, ctx, false, ref);
        await saveUser(bot.instanceName, user);

        // TODO check budget
        // TODO start demo
        await ctx.deleteMessage(msg2.message_id);
        await ctx.reply('Аккаунт успешно зарегистрирован! 🗽');
      }
    } else {
      // eosname = user.eosname;
    }

    // if (process.env.MODE == "community") {
    // printCommunityMenu(ctx, "Welcome")
    // } else {
    await startDemo(bot, ctx);
    // }
    // await ctx.reply('Запускаем режим практического ознакомления.. 📟');
  });

  // eslint-disable-next-line no-unused-vars
  bot.hears('Получить цветок 🌼', async (ctx) => {
    // let user = await getUser(ctx.update.message.from.id)
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

  bot.action('skipdemo', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    user.is_demo = false;
    await saveUser(bot.instanceName, user);

    const menu = Markup
      .keyboard(mainButtons, { columns: 2 }).resize();

    const t = 'Добро пожаловать в Двойную Спираль!.\n\nОКАЗАТЬ ПОМОЩЬ - произвести добровольное безвозмездное пожертвование партнёрам и получить FLOWER.\n\nПОЛУЧИТЬ ПОМОЩЬ - подарить FLOWER системе и получить добровольное безвозмездное пожертвование от партнёров.\n\nКОШЕЛЁК - хранит ваши FLOWER и подсчитывает вознаграждения от участия в кассах.\n\nКАССЫ - пространство честного обмена, где все зарабатывают.\n\nКАК ЭТО РАБОТАЕТ - раздел с описанием и обратной связью.\n\nКлубный чат: @helix_club';

    await sendMessageToUser(bot, user, { text: t }, menu);
  });

  bot.action(/next (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const nextId = parseInt(ctx.match[1], 10);
    // console.log("next_id", next_id)
    await printHelixs(bot, ctx, user, nextId);
  });

  bot.action('mypartners', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await printPartners(bot, user);
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
    // let user = await getUser(ctx.update.callback_query.from.id);
    // const is_admin = isAdmin(bot, user.id);

    ctx.editMessageText('рассылка отменена');
  });

  bot.action(/select (\w+)/gi, async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.callback_query.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    }

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
    let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.callback_query.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    }

    let contract;
    if (user.is_demo) contract = 'faketoken';

    const hostname = ctx.match[1];
    const params = await getHelixParams(bot, hostname);

    const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER', contract);

    const maxDeposit = await getCondition(bot, hostname, 'maxdeposit');
    // eslint-disable-next-line max-len
    let max = parseFloat(params.currentPool.remain) >= parseFloat(liquidBal) ? liquidBal : params.currentPool.remain;

    if (maxDeposit > 0) {
      const currentDeposit = await getCurrentUserDeposit(bot, hostname, user.eosname);
      if (parseFloat(currentDeposit) >= parseFloat(maxDeposit) / 10000) await ctx.reply(`Вы достигли предела взносов в этой кассе. Максимальный предел: ${(parseFloat(maxDeposit) / 10000).toFixed(4)} FLOWER`);
      else {
        user.state = 'set_deposit_amount';
        user.deposit_action = { hostname };
        await saveUser(bot.instanceName, user);

        const max2 = `${((maxDeposit / 10000) - parseFloat(currentDeposit)).toFixed(4)} FLOWER`;

        // eslint-disable-next-line max-len
        if (parseFloat(max2) >= parseFloat(liquidBal) && parseFloat(liquidBal) <= parseFloat(params.currentPool.remain)) {
          max = liquidBal;
          // eslint-disable-next-line max-len
        } else if (parseFloat(max2) >= parseFloat(liquidBal) && parseFloat(liquidBal) >= parseFloat(params.currentPool.remain)) {
          max = params.currentPool.remain;
          // eslint-disable-next-line max-len
        } else if (parseFloat(max2) <= parseFloat(liquidBal) && parseFloat(liquidBal) >= parseFloat(params.currentPool.remain)) {
          // eslint-disable-next-line max-len
          max = parseFloat(max2) >= parseFloat(params.currentPool.remain) ? params.currentPool.remain : max2;
          // eslint-disable-next-line max-len
        } else if (parseFloat(max2) <= parseFloat(liquidBal) && parseFloat(liquidBal) <= parseFloat(params.currentPool.remain)) {
          // eslint-disable-next-line max-len
          max = parseFloat(max2) >= parseFloat(params.currentPool.remain) ? params.currentPool.remain : max2;
        }

        await ctx.reply(`Введите сумму взноса до ${max}.`);
      }
    } else {
      user.state = 'set_deposit_amount';
      user.deposit_action = { hostname };
      await saveUser(bot.instanceName, user);
      await ctx.reply(`Введите сумму взноса до ${max}.`);
    }
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

  bot.action(/withdrawaction (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    const balanceId = parseInt(ctx.match[2], 10);

    await withdrawAction(bot, ctx, user, hostname, balanceId);
  });

  bot.action(/prioroneaction (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];
    const balanceId = parseInt(ctx.match[2], 10);

    try {
      await delUserHelixBalance(user.eosname, balanceId);
    } catch (e) {
      // empty
    }

    await priorityAction(bot, user, hostname, balanceId);

    await printUserBalances(bot, ctx, user, hostname);
    ctx.reply('Баланс поставлен в очередь');
  });

  bot.action(/mybalances (\w+)\s(\w+)?/gi, async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.callback_query.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    }

    const hostname = ctx.match[1];
    const nextId = parseInt(ctx.match[2], 10);

    await printUserBalances(bot, ctx, user, hostname, nextId);
  });

  bot.action(/showtasks (\w+)\s(\w+)?/gi, async (ctx) => {
    // console.log("on show task")
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const hostname = ctx.match[1];
    const nextId = parseInt(ctx.match[2], 10);

    await printTasks(ctx, user, hostname, nextId);
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
      await printWallet(bot, user);
    }
  });

  bot.action(/showexp (\w+)?/gi, async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.callback_query.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    }

    const hostname = ctx.match[1];
    await printExpirience(bot, ctx, user, hostname);
  });

  bot.hears('🌀 кассы', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.message.from.id);
    }
    // console.log("user", user)
    // await checkForExistBCAccount(bot, ctx);
    await printHelixs(bot, ctx, user);
  });

  bot.hears('🌀 касса', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.message.from.id);
    }
    if (user.is_demo) await printHelixWallet(bot, ctx, user, bot.getEnv().DEMO_HOST);
    else if (bot.getEnv().MODE === 'community') await printHelixWallet(bot, ctx, user, bot.getEnv().COMMUNITY_HOST);
  });

  bot.hears('🌈 цели', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.message.from.id);
    }
    if (user.is_demo) await printGoalsMenu(bot, ctx, user, bot.getEnv().DEMO_HOST);
    else if (bot.getEnv().MODE === 'community') await printGoalsMenu(bot, ctx, user, bot.getEnv().COMMUNITY_HOST);
  });

  bot.hears('🏁 завершить демо', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.message.from.id);
    }

    // await checkForExistBCAccount(bot, ctx);
    const buttons = [];

    buttons.push(Markup.button.callback('🛑 Отмена', 'cancelfinish'));
    buttons.push(Markup.button.callback('✅ Завершить', 'finishdemo'));

    await ctx.reply('Вы уверены, что хотите завершить демо и войти в реальную жизнь?', Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  });

  bot.action('startdemo', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    }

    user.is_demo = true;

    await saveUser(bot.instanceName, user);
    const userHasRequest = await hasRequest(bot, user.eosname, 'faketoken');

    if (!userHasRequest) await requestPromoBudgetAction(bot, user, 'eosio');
    else await continueDemo(bot, user, 'eosio');
  });

  bot.action('cancelfinish', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.callback_query.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    }

    await ctx.deleteMessage();

    await printHelixWallet(bot, ctx, user, bot.getEnv().DEMO_HOST);
  });

  bot.action('finishdemo', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.callback_query.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    }

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
    await pushEducation(ctx, currentSlideIndex);
  });

  bot.hears('Начать ознакомление', async (ctx) => {
    await pushEducation(ctx, 0);
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

  bot.hears('🤔 как это работает', async (ctx) => {
    const buttons = [];
    buttons.push(Markup.button.callback('Ознакомление', 'pusheducation 0'));
    buttons.push(Markup.button.callback('Схема работы', 'sendvideo'));
    buttons.push(Markup.button.url('Поддержка', 'https://t.me/knouni_bot'));
    buttons.push(Markup.button.url('Клубный чат', 'https://t.me/helix_club'));
    buttons.push(Markup.button.url('Новости', 'https://t.me/helix_news'));

    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.message.from.id);
    }

    if (!user.is_demo) buttons.push(Markup.button.callback('Запустить демо', 'startdemo'));

    await ctx.replyWithHTML('Двойная Спираль предоставляет сервис честного финансового обмена между людьми.', Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  });

  bot.hears('Назад', async (ctx) => {
    await backToMainMenu(ctx);
  });

  bot.hears('⬆️ оказать помощь', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.message.from.id);
    }

    user.state = 'giveHelp';
    await saveUser(bot.instanceName, user);
    const buttons = [];
    await ctx.replyWithHTML('Оказывай безвозмездную финансовую помощь партнёрам и получай цифровые цветки в дар от системы. 🌼', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    await showBuySellMenu(bot, user, ctx);
  });

  bot.hears('⬇️ получить помощь', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.message.from.id);
    }

    user.state = 'getHelp';
    await saveUser(bot.instanceName, user);
    const buttons = [];
    await ctx.replyWithHTML('Получай безвозмездную финансовую помощь от партнёров, возвращая цифровые цветки в дар системе. 🌼', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    await showBuySellMenu(bot, user, ctx);
  });

  bot.hears('🪙 кошелёк', async (ctx) => {
    // await checkForExistBCAccount(bot, ctx);

    let user = await getUser(bot.instanceName, ctx.update.message.from.id);

    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.message.from.id);
    }

    await printWallet(bot, user);
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
    printTasks(ctx, user);
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
    ctx.editMessageText(`Введите ваши реквизиты для платежа в ${currency}${currency === 'USDT' ? ', сеть TRC20:' : ':'} `);
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
    // let user = await getUser(ctx.update.callback_query.from.id);
    // backToMainMenu(ctx)
  });

  bot.action(/subscribe (\w+)/gi, async (ctx) => {
    // TODO cancel order
    const hostname = ctx.match[1];
    let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.callback_query.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    }

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

    // let user = await getUser(ctx.update.callback_query.from.id);

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
    ctx.reply('Введите имя аккаунта получателя');
  });

  bot.action(/transfaction (.*$)/gm, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const amount = ctx.match[1];

    await transferAction(bot, user, amount, ctx);
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
    if (isLocation) {
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
        if (user.order_action.data.type === 'buy') {
          const order = await bot.uni.p2pContract.getOrder(user.order_action.data.parent_id);

          const currency = user.order_action.data.out_symbol;
          const outUsdRate = await bot.uni.p2pContract.getUsdRate(currency, 4);

          if (parseFloat(order.quote_remain) / outUsdRate < parseFloat(text)) {
            await ctx.replyWithHTML(`Сумма вашей заявки больше остатка в заявке партнёра. В заявке партнёра остался запрос на ${order.quote_remain}. Введите сумму от 10 до ${order.quote_remain}: `);
          } else {
            const buttons = [];
            buttons.push(Markup.button.callback('Да', 'createorder'));
            const corePrecision = 4;

            buttons.push(Markup.button.callback('Нет', 'cancelorder2'));
            user.order_action.data.out_quantity = parseFloat(text);

            const token = parseTokenString(order.root_remain);
            const outToken = parseTokenString(order.out_quantity);
            const quoteRate = await bot.uni.p2pContract.getUsdRate(token.symbol, token.precision);

            const outRate = await bot.uni.p2pContract.getUsdRate(outToken.symbol, corePrecision);

            // TODO get rate
            const rootQuantity = `${((parseFloat(text) * parseFloat(outRate)) / parseFloat(quoteRate)).toFixed(token.precision)} ${token.symbol}`;

            user.state = '';
            await ctx.replyWithHTML(`Внимание!\nВы уверены, что хотите оказать помощь партнёру ${order.creator.toUpperCase()} на сумму: ${text} ${user.order_action.data.out_symbol}? Вы получите ${rootQuantity} по курсу ${parseFloat(quoteRate).toFixed(8)} USD/FLOWER. \n\nВы также подтверждаете, что находитесь в здравом уме и добровольно оказываете безвозмездную финансовую помощь без гарантий возврата или обещаний получения прибыли.`, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
            await saveUser(bot.instanceName, user);
          }
        } else if (user.order_action.data.type === 'sell') {
          if (parseFloat(text) > 0) { // TODO check balance
            const buttons = [];
            buttons.push(Markup.button.callback('Да', 'createorder'));

            buttons.push(Markup.button.callback('Нет', 'cancelorder2'));

            const coreSymbol = 'FLOWER';
            const corePrecision = 4;
            const quoteRate = await bot.uni.p2pContract.getUsdRate(coreSymbol, corePrecision);
            // eslint-disable-next-line max-len
            const outRate = await bot.uni.p2pContract.getUsdRate(user.order_action.data.out_symbol, corePrecision);

            // TODO get rate
            const rootQuantity = `${((parseFloat(text) * parseFloat(outRate)) / parseFloat(quoteRate)).toFixed(corePrecision)} ${coreSymbol}`;
            const details = await getDetails(bot.instanceName, user.eosname, user.order_action.data.out_symbol);

            await ctx.replyWithHTML(`Внимание!\nВы уверены, что хотите создать заявку на получение помощи на сумму: ${text} ${user.order_action.data.out_symbol}? Вы передадите ${rootQuantity} в подарок партнёрам системы.\n\nВаши реквизиты для получения помощи: ${details}\n\nВы также подтверждаете, что находитесь в здравом уме и добровольно передаёте системе свои цифровые цветки без гарантий возврата или обещаний получения прибыли.`, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
            user.order_action.data.out_quantity = parseFloat(text);
            user.state = '';
            saveUser(bot.instanceName, user).then();
          } else {
            await ctx.replyWithHTML('Сумма вашей заявки больше вашего баланса цифровых цветков. Пожалуйста, введите сумму заново: ');
          }
        }
      } else if (user.state === 'set_order_details') {
        user.state = 'set_order_amount';
        const currency = user.order_action.data.out_symbol;
        await setDetails(bot.instanceName, user.id, user.eosname, currency, text);

        const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER');

        const coreUsdRate = await bot.uni.p2pContract.getUsdRate('FLOWER', 4);
        const outUsdRate = await bot.uni.p2pContract.getUsdRate(currency, 4);

        const min = `${(2 / parseFloat(outUsdRate)).toFixed(0)} ${currency}`;
        const max = `${((parseFloat(liquidBal) * parseFloat(coreUsdRate)) / parseFloat(outUsdRate)).toFixed(0)} ${currency}`;

        if (parseFloat(max) >= parseFloat(min)) ctx.reply(`Введите сумму!\n\n Пожалуйста, введите сумму получения помощи от ${min} до ${max} цифрами.`); // , Markup.inlineKeyboard(buttons, {columns: 1}).resize()
        else {
          ctx.reply(`Доступная сумма получения помощи меньше минимальной. Доступная вам сумма: ${max}. Минимальная сумма для создания заявки: ${min}.`); // , Markup.inlineKeyboard(buttons, {columns: 1}).resize()
        }

        saveUser(bot.instanceName, user).then();
      } else if (user.state === 'transfer_to') {
        const account = await bot.uni.readApi.getAccount(text).catch((err) => {
          console.error(err);
          return null;
        });

        if (account) {
          user.state = 'transfer_amount';
          user.transfer_action.data.to = text;
          saveUser(bot.instanceName, user).then();
          await ctx.replyWithHTML('Введите сумму перевода');
        } else {
          await ctx.replyWithHTML('Аккаунт получателя не существует. Проверьте имя аккаунта и повторите попытку.');
        }
      } else if (user.state === 'transfer_amount') {
        const amount = `${parseFloat(text).toFixed(4)} FLOWER`;

        const buttons = [];

        buttons.push(Markup.button.callback('Да', `transfaction ${amount}`));
        buttons.push(Markup.button.callback('Нет', 'canceltransfer'));

        user.transfer_action.data.amount = amount;

        const textTo = `Вы уверены, что хотите совершить перевод партнёру ${user.transfer_action.data.to} на сумму ${amount}?`;

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

        if (maxDeposit > 0) {
          const currentDeposit = await getCurrentUserDeposit(bot, hostname, user.eosname);
          if (parseFloat(currentDeposit) >= parseFloat(maxDeposit) / 10000) await ctx.reply(`Вы достигли предела взносов в этой кассе. Максимальный предел: ${(parseFloat(maxDeposit) / 10000).toFixed(4)} FLOWER, ваш текущий взнос: ${currentDeposit}`);
          else {
            depositNow = true;
          }
        } else if (parseFloat(amount) > parseFloat(liquidBal)) {
          await ctx.reply(`Недостаточный баланс для совершения взноса. Ваш баланс: ${liquidBal}. Введите сумму заново.`);
        } else if (parseFloat(amount) > parseFloat(helix.currentPool.remain)) {
          await ctx.reply(`Максимальный взнос, который может принять этот стол #${helix.currentPool.pool_num}: ${helix.currentPool.remain}. Введите сумму заново.`);
        } else {
          depositNow = true;
        }

        if (depositNow) {
          user.state = '';
          user.deposit_action.quantity = amount;
          const buttons = [];

          buttons.push(Markup.button.callback('Да', 'depositaction'));
          buttons.push(Markup.button.callback('Нет', `backto helix ${user.deposit_action.hostname}`));

          ctx.reply(`Вы уверены что хотите произвести взнос в кассу ${user.deposit_action.hostname} на сумму ${user.deposit_action.quantity}?`, Markup.inlineKeyboard(buttons, { columns: 2 }));
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
  });

  await checkAllUserAccountsForExist(bot);

  return null;
};
