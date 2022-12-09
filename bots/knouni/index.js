const { Markup } = require('telegraf');
const axios = require('axios');
const { ChainsSingleton, generateAccount: generateUniAccount } = require('unicore');
const EosApi = require('eosjs-api');

const { restoreAccount } = require('./restore');
const {
  mainButtons, backToMainMenu, demoButtons,
} = require('./utils/bot');

const {getAIAnswer} = require('./ai.js')

const PayForStatus = 3 //FLOWER


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
  getPartnerStatus
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

async function generateAccount(bot, ctx, isAdminUser, ref, userext) {
  const user = userext || ctx.update.message.from;

  const generatedAccount = await generateUniAccount();

  user.eosname = generatedAccount.name;
  user.mnemonic = generatedAccount.mnemonic;
  user.wif = generatedAccount.wif;
  user.pub = generatedAccount.pub;
  user.is_admin = isAdminUser;
  user.ref = ref;

  if (!user.ref) user.ref = '';

  const params = {
    tg_id: user.id,
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
  const reply = 'Пожалуйста, подождите.. Мне потребуется некоторое время на создание разумного ответа. Я сразу свяжусь с вами, когда ответ будет найден!\n\nА пока, ознакомьтесь: \n- /news - запросы людей и мои ответы\n- /wallet - ваш кошелёк';
  // const menu = Markup.keyboard(['🏁 закрыть запрос'], { columns: 2 }).resize(); // , '🪙 кошелёк'

  await sendMessageToUser(bot, user, { text: reply });//, menu

  // const id = await sendMessageToUser(bot, { id: bot.getEnv().CV_CHANNEL }, { text });
  let id 
  if (ctx.update.message.photo || ctx.update.message.caption) { id = await sendMessageToUser(bot, { id:  bot.getEnv().CV_CHANNEL }, ctx.update.message, { caption: ctx.update.message.caption }); } else { id = await sendMessageToUser(bot, { id:  bot.getEnv().CV_CHANNEL }, { text }); }


  await insertMessage(bot.instanceName, user, bot.getEnv().CV_CHANNEL, text, id, 'CV');

  user.state = 'chat';
  user.request_channel_id = id;

  // if (!user.eosname) {
  //   user.eosname = await generateAccount(bot, ctx, false, user.ref);
  // }

  await saveUser(bot.instanceName, user);

  await insertRequest(bot.instanceName, user, id, text);
  
  //TODO AI

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
    console.log("REFERER:", ref)
    if (ctx.update.message.chat.type === 'private') {
      if (!ctx.update.message.from.is_bot) {
        let user = await getUser(bot.instanceName, ctx.update.message.from.id);

        if (!user) {
          user = ctx.update.message.from;
          user.app = bot.getEnv().APP;
          user.ref = ref;
          user.requests_count = 3;

          // try{
            user.eosname = await generateAccount(bot, ctx, false, user.ref);
          // } catch(e){
            // ctx.reply('')
          // }
          await saveUser(bot.instanceName, user);
        } else {
          console.log("on else")
          user.request_chat_id = false;
          user.request_channel_id = false;
          if (!user.requests_count)
            user.requests_count = 3;

          if (!user.eosname) {
            user.eosname = await generateAccount(bot, ctx, false, user.ref);
          }

          await saveUser(bot.instanceName, user);
        }

        // const request = Markup.keyboard(['🆕 cоздать запрос'], { columns: 1 }).resize();
        const buttons = [];

        if (user.requests_count > 0) {
          const clearMenu = Markup.removeKeyboard();
          // buttons.push(Markup.button.callback('🔄 купить лицензию', 'buystatus ${json.stringify({})}'));


          const id = await sendMessageToUser(bot, { id: user.id }, {   video: {
                duration: 5,
                width: 1920,
                height: 1080,
                file_name: 'ПП.mp4',
                mime_type: 'video/mp4',
                thumb: {
                  file_id: 'AAMCAgADGQEAAhKkY4-c1qW95qGFk_IfDq9nAAEz_MXUAAKaJwACk2aBSJjUQK2_Wr7-AQAHbQADKwQ',
                  file_unique_id: 'AQADmicAApNmgUhy',
                  file_size: 5044,
                  width: 320,
                  height: 180
                },
                file_id: 'BAACAgIAAxkBAAISpGOPnNalveahhZPyHw6vZwABM_zF1AACmicAApNmgUiY1ECtv1q-_isE',
                file_unique_id: 'AgADmicAApNmgUg',
                file_size: 4252145
            }}, clearMenu);
            
          let welcome_text = 'Привет! Я ваш карманный AI для сопровождения по жизни. Отправьте мне любой запрос и получите разумный совет.\n\nПримеры запросов: '
          welcome_text += `\n🟢 Предложи 10 креативных идей дня рождения 10-летнего ребенка`
          welcome_text += `\n🟢 Объясни квантовые вычисления простыми словами`
          // welcome_text += `\n🟢 Как создать HTTP-запрос в Javascript?;`
          welcome_text += `\n🟢 Как заработать миллион?`
          welcome_text += `\n🟢 Посоветуй фильм`
          
          welcome_text += `\n\nОграничения:`
          welcome_text += `\n🔴 Могу иногда генерировать неверную информацию`;
          welcome_text += `\n🔴 Могу иногда создавать вредные инструкции или предвзятый контент`;
          // welcome_text += `\n🔴 Могу иногда ругаться матом`;
          welcome_text += `\n🔴 У меня ограниченные знания мира и событий после 2021 года`;



          // welcome_text += `\n🔘 `
          // welcome_text += `Посоветуй фильм`

          await ctx.reply(welcome_text, clearMenu, { reply_markup: { remove_keyboard: true } });
          


          await addRequestAction(bot, user, ctx)
          // await ctx.reply('> Задайте ваш вопрос:', request);
          // buttons.push(Markup.button.callback('🆕 cоздать запрос', 'createrequest'));
          // await ctx.reply('Мой искусственный интеллект помогает принять решение в сложной жизненной ситуации. Попробуйте! Опишите вашу ситуацию, сформулируйте вопрос, и получите разумный ответ: ', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
        } else {
          const clearMenu = Markup.removeKeyboard();
          buttons.push(Markup.button.callback('🔄 оформить подписку', `buystatus ${JSON.stringify({})}`));

          // await ctx.reply('Меня зовут Кно, я ваш персональный помощник 🧙🏻‍♂️', clearMenu, { reply_markup: { remove_keyboard: true } });
          // await ctx.reply('Мой искусственный интеллект помогает принять решение в сложной жизненной ситуации.');
          await ctx.reply('К сожалению, у вас не осталось советов. Для получения советов подпишитесь на меня всего за 189 рублей в месяц:', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
        }
      }
    } else {
      const clearMenu = Markup.removeKeyboard();
      await ctx.reply('я здесь!', clearMenu, { reply_markup: { remove_keyboard: true } });
    }
  });

  async function addRequestAction(bot, user, ctx) {
    ctx.reply('> введите ваш запрос:');
    user.state = 'newrequest';
    await saveUser(bot.instanceName, user);
  }

 bot.action('deposit', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    // await ctx.deleteMessage();
    // console.log("купить билет")
    // await setBuyMenu(ctx)
    // await buyTicket(bot, user, ctx, 'USDT.TRC20');
  });

  async function buyTicket(bot, user, ctx, currency, json) {
    await ctx.deleteMessage()

    try {
      const params = {
        username: user.eosname,
        currency,
        type: 'subscribe',
        hostname: bot.getEnv().CORE_HOST,
        botName: bot.instanceName,
        meta: json
      };
      const path = `${bot.getEnv().PAY_GATEWAY}/generate`;

      const result = await axios.post(
        path,
        params,
      );
      
      // await ctx.reply(`Подписка на меня - правильное решение! Вы получите советника по всем вопросам всего за несколько долларов в месяц.`)

      if (result.data.status === 'ok') {
        await ctx.replyWithHTML(`В качестве оплаты временно принимаются только USDT (TRC-20). Прочитайте <a href="https://dacom.io/60279ba5d0454f5cac5f4c782d412988">инструкцию</a> и отправьте ${parseFloat(json.cost).toFixed(4)} USDT на ваш персональный адрес:`, { disable_web_page_preview: true });
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

  bot.command('news', async (ctx) => {

    await ctx.replyWithHTML(`Канал запросов и моих советов: ${bot.getEnv().CV_CHANNEL_LINK}`);  
  });

  bot.command('close', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);
    const isAdminUser = isAdmin(bot, user.id);
    
    if (isAdminUser && ctx.update.message.reply_to_message) { // Если это ответ на чье-то сообщение
      const msg = await getMessage(bot.instanceName, ctx.update.message.reply_to_message.forward_from_message_id || ctx.update.message.reply_to_message.message_id, bot.getEnv().CV_CHANNEL);
      
      if (msg.id) {
        const question_owner = await getUser(bot.instanceName, msg.id);
        const status = await getPartnerStatus(bot, "core", question_owner.eosname)
        
        if (question_owner) {

          question_owner.state = "newrequest";
          question_owner.request_chat_id = false;

          question_owner.requests_count -= 1;
          await saveUser(bot.instanceName, question_owner)
          let text = `Ваш запрос закрыт. `

          if (status.level == -1){
            if (question_owner.requests_count > 0)
              text += `Советов осталось: ${question_owner.requests_count}.\n\nОформите подписку всего за 3 USDT в месяц и получите неограниченное количество советов.`
            else text += `У вас не осталось советов.\n\nОформите подписку всего за 3 USDT в месяц и получите неограниченное количество советов.`
          } 

          console.log("on send")
          let extra = {}
          const buttons = [];
    
          if (status.level < 1) {
            buttons.push(Markup.button.callback('🔄 оформить подписку', `buystatus ${JSON.stringify({})}`));
            extra = Markup.inlineKeyboard(buttons, { columns: 1 }).resize()
          } 

          await sendMessageToUser(bot, { id: msg.id }, { text }, extra);
          
          
          if (question_owner.requests_count > 0)
            await sendMessageToUser(bot, { id: msg.id }, { text: '> введите ваш запрос:' });
          
          // await ctx.deleteMessage(ctx.update.message.message_id)

          await ctx.reply(`Запрос закрыт`, { reply_to_message_id: ctx.update.message.message_id })

        } else {
          ctx.reply(`Пользователь не найден`,{ reply_to_message_id: ctx.update.message.message_id })
        }
        
      }

    }
  });


  function getStatusByNumber(number) {
    let status;
    let status2;
    if (number == 1) {
      status = 'adviser';
      status2 = '🐨 советник';
    } else if (number == 2) {
      status = 'assistant';
      status2 = '🐼 ассистент';
    } 

    return { status, status2 };
  }


  bot.action(/buystatus (.+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    // console.log('BOT!: ', bot.getEnv())
    const json = JSON.parse(ctx.match[1]);
    // console.log('JSON', json);
    let text = '';
    // text += `Ваш статус: кот 🐈\n`
    const buttons = [];
    
    const status = await getPartnerStatus(bot, bot.getEnv().CORE_HOST, user.eosname)
    

    if (!json.s) {
      // text += 'Статус - это подписка на доход ваших партнеров. Когда партнер получает прибыль, тогда получаете прибыль и вы.\n\n';
      // text += 'гость - у вас есть всего 3 совета\n';
      // text += 'волк 🐺 - доход до 3го уровня партнеров\n';
      // text += 'тигр 🐯 - доход до 4го уровня партнеров\n';
      // text += 'лев 🦁 - доход до 5го уровня партнеров\n';
      // text += 'медведь 🐻 - доход до 6го уровня партнеров\n';
      // text += 'дракон 🐲 - доход со всех уровней партнеров\n';
      text += `\n${status.level <= 1 ? '✅' : '☑️'} <b>гость</b> - бесплатно - 3 совета по любым запросам в месяц;`;
      text += `\n${status.level == 2 ? '✅' : '☑️'} <b>советник</b> - 3 USDT / месяц - неограниченное количество советов в месяц;`;
      // text += '\n☑️ <b>ассистент</b> - 100 USDT / месяц - я выполняю ваши поручения;';
      // text += '\n☑️ <b>эксперт</b> - 1000 USD / месяц - я собираю экспертный совет из людей и машин для развития вашего бизнеса;';
      // text += `\n\n<a href='${bot.getEnv().STATUS_EXPLANATIONS}'>подробнее</a>`
      // buttons.push(Markup.button.callback('гость', `buystatus ${JSON.stringify({ s: -1, du: 1, di: 1 })}`));
      text += '\n\nВыберите уровень доступа: ';
      
      buttons.push(Markup.button.callback('советник', `buystatus ${JSON.stringify({ s: 1, du: 1, di: 1 })}`));
      // buttons.push(Markup.button.callback('ассистент', `buystatusact ${JSON.stringify({ s: 2, du: 1, di: 1 })}`));
      // buttons.push(Markup.button.callback('эксперт', `buystatus ${JSON.stringify({ s: 3, du: 1, di: 1 })}`));
      // buttons.push(Markup.button.callback('🐯 тигр', `buystatus ${JSON.stringify({ s: 4, du: 1, di: 1 })}`));
      // buttons.push(Markup.button.callback('🦁 лев', `buystatus ${JSON.stringify({ s: 5, du: 1, di: 1 })}`));
      // buttons.push(Markup.button.callback('🐻 медведь', `buystatus ${JSON.stringify({ s: 6, du: 1, di: 1 })}`));
      // buttons.push(Markup.button.callback('🐲 дракон', `buystatus ${JSON.stringify({ s: 7, du: 1, di: 1 })}`));
      try{
        await ctx.editMessageText(text, {disable_web_page_preview: true, parse_mode: 'html', ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize()});
      } catch(e){

      }
    } else {
      let status = '';
      if (json.s === 1) {
        status = '🐨 советник';
      } 
      // else if (json.s === 2) {
      //   status = '🐼 панда';
      // } else if (json.s === 3) {
      //   status = '🐺 волк';
      // } else if (json.s === 4) {
      //   status = '🐯 тигр';
      // } else if (json.s === 5) {
      //   status = '🦁 лев';
      // } else if (json.s === 6) {
      //   status = '🐻 медведь';
      // } else if (json.s === 7) {
      //   status = '🐲 дракон';
      // }

      text += `Выбранный статус: ${status}\n`;
      text += `Продолжительность: ${json.du} мес\n`;
      text += `Стоимость: ${(PayForStatus * json.s * json.du * json.di).toFixed(4)} USDT\n`;
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
        await ctx.editMessageText(text, {parse_mode: 'html', ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize()});
      } catch (e) {
        console.log('e', e);
      }
    }
    // await buyStatus(bot, user, json);
  });

  bot.command('wallet', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (user)
      await printWallet(bot, user);
  });


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
      await ctx.reply(`Ваш запрос закрыт. Осталось советов: ${user.requests_count}.\n\nДля пополнения советов станьте пайщиком Цифрового Кооператива: @digital_earth_bot`, menu);
    } else {
      const clearMenu = Markup.removeKeyboard();
      await ctx.reply('Ваш запрос закрыт.', clearMenu, { reply_markup: { remove_keyboard: true } });
      const buttons = [];
      buttons.push(Markup.button.callback('🔄 обновить запросы', `buystatus ${json.stringify({})}`));

      await ctx.reply('К сожалению, вас не осталось советов. Для получения советов станьте пайщиком цифрового кооператива: @digital_earth_bot и нажмите кнопку "обновить запросы".', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    }
  });

  bot.on('message', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    // console.log('catch user', user);
    console.log("message: ", ctx.update.message)
    if (user && user.id != 777000) {
      if (ctx.update.message.chat.type !== 'private') { // CATCH MESSAGE ON ANY PUBLIC CHAT WHERE BOT IS ADMIN
        const { text } = ctx.update.message;

        // console.log('tyL: ', ctx.update.message.reply_to_message);

        if (ctx.update.message.reply_to_message) { // Если это ответ на чье-то сообщение
          const msg = await getMessage(bot.instanceName, ctx.update.message.reply_to_message.forward_from_message_id || ctx.update.message.reply_to_message.message_id, bot.getEnv().CV_CHANNEL);

          if (msg && msg.message_id) {
            // console.log('resend back to: ', msg);
            let id

            if (ctx.update.message.photo || ctx.update.message.caption) { id = await sendMessageToUser(bot, { id: msg.id }, ctx.update.message, { caption: ctx.update.message.caption }); } else { id = await sendMessageToUser(bot, { id: msg.id }, { text }); }

            // const id = await sendMessageToUser(bot, { id: msg.id }, { text });

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

            // const id = await sendMessageToUser(bot, { id: bot.getEnv().CHAT_CHANNEL }, { text }, { reply_to_message_id: user.request_chat_id });

            let id
            console.log(ctx.update.message)
            console.log("SEND!")
            if (ctx.update.message.photo || ctx.update.message.caption) { 
              id = await sendMessageToUser(bot, { id:  bot.getEnv().CHAT_CHANNEL }, ctx.update.message, { caption: ctx.update.message.caption, reply_to_message_id: user.request_chat_id });
            } else { 
              id = await sendMessageToUser(bot, { id:  bot.getEnv().CHAT_CHANNEL }, { text }, {reply_to_message_id: user.request_chat_id}); 
            }


            await insertMessage(bot.instanceName, user, bot.getEnv().CHAT_CHANNEL, text, id, 'chat');

            await saveUser(bot.instanceName, user);
            // //TODO AI
            
            // try{
            //   let response = await getAIAnswer(bot, text)
            //   console.log("AI RESPONCE: ", response.status, response.statusText)
            //   if (response.status == 200){
            //     await ctx.reply(response.data.choices[0].text)
            //   } else {

            //     await ctx.reply(`Ошибка 1: `, response.statusText)  
            //   }
            // } catch(e){
              
            //   await ctx.reply(`Пожалуйста, сформулируйте вопрос короче.`)  
            // }
            

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



  // bot.action('buystatus ', async (ctx) => {
  //   const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
  //   await buyTicket(bot, user, ctx, 'USDT.TRC20');
  //   // await addRequestAction(bot, user, ctx);
  // });



  bot.action(/buystatusact (.+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const json = JSON.parse(ctx.match[1]);

    const number = parseInt(json.s);

    const statuses = getStatusByNumber(json.s);
    console.log(statuses);
    const cost = (PayForStatus * json.s * json.du * json.di).toFixed(4);

    let text = '';
    
    const buttons = [];

    text += `Выбранный статус: ${statuses.status2}\n`;
    text += `Продолжительность: ${json.du} мес\n\n`;

    text += `Стоимость: ${cost} USDT\n`;

    text += `Выберите метод оплаты:`
    buttons.push(Markup.button.callback('USDT', `buystatusaction ${JSON.stringify({ status: statuses.status, cost })}`));
    buttons.push(Markup.button.callback('Visa, Mastercard', `buystatuswithcash`));
    buttons.push(Markup.button.callback('Отмена', `buystatus ${JSON.stringify({ ...json })}`));

    await ctx.editMessageText(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());

    // await buyStatus(bot, user, json);
  });

  bot.action("buystatuswithcash", async (ctx) => {
    await ctx.reply('Оплата с банковских карт временно недоступна.')
  });
  

  bot.action(/buystatusaction (.+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const json = JSON.parse(ctx.match[1]);
    json.cost += ' FLOWER';

    const myBalance = await getLiquidBalance(bot, user.eosname, 'FLOWER');

    try {
      await buyTicket(bot, user, ctx, 'USDT.TRC20', json);
    } catch (e) {
      await ctx.reply(`Системная ошибка на этапе получения адреса: ${e.message}`);
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
