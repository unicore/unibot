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
  getUserByResumeChannelId
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
  { message: 'Как вас зовут?' },
  { message: 'Из какого вы города?' },
  { message: 'Какая ваша профессиональная специализация?'},
  { message: 'В чём хотели бы развиваться?' },
  { message: 'Расскажите о себе, и почему вы хотите сотрудничать с Институтом?' },
];

async function startQuiz(bot, ctx, user) {
  await getQuiz(bot.instanceName, user.id);

  const q = {
    id: user.id,
    current_quiz: 0,
    answers: quizDefinition,
    is_finish: false,
  };

  await saveQuiz(bot.instanceName, user, q);

  const buttons = [Markup.button.contactRequest('📱 Поделиться контактом')];
  const request = Markup.keyboard(buttons, { columns: 1 }).resize();
  return ctx.reply('Здравствуйте! Институт Коллективного Разума готов принять вашу заявку на сотрудничество. У нас к вам всего 5 вопросов. Пожалуйста, поделитесь контактом для продолжения. 🌐', request);
}

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

      await ctx.reply(q.message, Markup.keyboard(buttons, { columns: 2 }).resize());
    } else {
      const clearMenu = Markup.removeKeyboard();

      await ctx.reply(q.message, clearMenu, { reply_markup: { remove_keyboard: true } });
    }

    await saveQuiz(bot.instanceName, user, quiz);
  } else {
    quiz.is_finish = true;
    await saveQuiz(bot.instanceName, user, quiz);

    const menu = Markup // , "цели", "действия"
      .keyboard(['🏫 Об Институте'], { columns: 1 }).resize();



    const t = 'Благодарим за отклик! Мы свяжемся с вами в ближайшее время.';

    await sendMessageToUser(bot, user, { text: t }, menu);

    //send message to Channel
    let text = `${quiz.answers[1].answer}, `
    text += `${quiz.answers[2].answer}, `
    text += `+${quiz.answers[0].answer.phone_number}, @${user.username}\n`
    
    k = 0

    for (const answer of quiz.answers) {
      if (k > 2){
        text += `\n${answer.message}`
        text += `\n${answer.answer}\n`
      }
      k++
    }
  
    let id = await sendMessageToUser(bot, {id : bot.getEnv().CV_CHANNEL}, { text: text });

    await insertMessage(bot.instanceName, user, bot.getEnv().CV_CHANNEL, text, id, 'CV');
    
    user.state = "chat"
    user.resume_channel_id = id
    await saveUser(bot.instanceName, user)
    
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
      if (!ctx.update.message.from.is_bot) {
        let user = await getUser(bot.instanceName, ctx.update.message.from.id);

        if (!user) {
          msg2 = await ctx.reply('Пожалуйста, подождите, мы создаём для вас аккаунт в блокчейне.. ⛓');

          user = ctx.update.message.from;
          user.app = bot.getEnv().APP;

          await saveUser(bot.instanceName, user);
          user.eosname = await generateAccount(bot, ctx, false, ref);
          await saveUser(bot.instanceName, user);

          await ctx.deleteMessage(msg2.message_id);
          await ctx.reply('Аккаунт успешно зарегистрирован! 🗽');
        
        }
        
        user.resume_chat_id = null
        user.resume_channel_id = null
        
        await saveUser(bot.instanceName, user)

        await startQuiz(bot, ctx, user);
      }
    } else {
      //dont have any reactions on public chats
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


  bot.hears('🏫 Об Институте', async (ctx) => {
    await getUser(bot.instanceName, ctx.update.message.from.id);
    await checkForExistBCAccount(bot, ctx);

    ctx.reply('Главный Вход: https://intellect.run');
  });




  bot.on('message', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    // console.log('catch user', user);
    // console.log("message: ", ctx.update.message)
    if (user) {


      if (ctx.update.message.chat.type !== 'private') {//CATCH MESSAGE ON ANY PUBLIC CHAT WHERE BOT IS ADMIN
        let { text } = ctx.update.message;
        
        // console.log('tyL: ', ctx.update.message.reply_to_message);
        
        if (ctx.update.message.reply_to_message) { //Если это ответ на чье-то сообщение

          const msg = await getMessage(bot.instanceName, ctx.update.message.reply_to_message.forward_from_message_id);
          
          if (msg && msg.message_id) {
            // console.log('resend back to: ', msg);
            const id = await sendMessageToUser(bot, { id: msg.id }, { text });

            await insertMessage(bot.instanceName, user, user.id, text, 'question', id);
          }
        

        } else {
          await insertMessage(bot.instanceName, user, 'user', text);
        }
      } else {//Если это диалог пользователя с ботом
        //проверяем не квиз ли

        const quiz = await getQuiz(bot.instanceName, user.id);
        let { text } = ctx.update.message;
        // console.log("on else", text)

        if (quiz && !quiz.is_finish) {
          quiz.answers.map((el, index) => {
            if (index === quiz.current_quiz) {
              el.answer = text;
            }
          });

          await saveQuiz(bot.instanceName, user, quiz);
          await nextQuiz(bot, user, ctx);
        } else if (user.state) {

          //SEND FROM USER IN BOT TO PUB CHANNEL
          // console.log("\n\non here2")
          if (user.state === 'chat') {
            // console.log("try to send: ", bot.getEnv().CHAT_CHANNEL, 'reply_to: ', user.resume_chat_id)
            const id = await sendMessageToUser(bot, { id: bot.getEnv().CHAT_CHANNEL }, { text }, {reply_to_message_id : user.resume_chat_id});

            await insertMessage(bot.instanceName, user, bot.getEnv().CHAT_CHANNEL, text, id, 'chat');

            await saveUser(bot.instanceName, user);

            // ctx.reply('Сообщение отправлено');
          } 
        } else {
          await insertMessage(bot.instanceName, user, 'user', text);
        }
      }
    } else {
      if (ctx.update.message && ctx.update.message.is_automatic_forward == true && ctx.update.message.sender_chat){
          if (ctx.update.message.sender_chat.id == bot.getEnv().CV_CHANNEL){ //если словили пересылку из прикрепленного канала
            if(ctx.update.message.forward_from_chat.id == bot.getEnv().CV_CHANNEL){ //то нужно запомнить ID сообщения, чтоб отвечать в том же треде
              user = await getUserByResumeChannelId(bot.instanceName, ctx.update.message.forward_from_message_id)

              if (user && !user.resume_chat_id){
                // console.log("catch forwarded messsage to chat: ", ctx.update.message.message_id)
                user.resume_chat_id = ctx.update.message.message_id
                await saveUser(bot.instanceName, user);  
              }
              
            }
          }
        } else { //Или отправляем пользователю ответ в личку если это ответ на резюме пользователя
      }
    }
  });

  bot.action('sendtoall', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const isAdminUser = isAdmin(bot, user.id);
    const message = user.message_to_send;

    user.message_to_send = null;

    await saveUser(bot.instanceName, user);

    if (isAdminUser && message) {
      const count = await sendMessageToAll(bot, { text: message });
      await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
    } else {
      await ctx.replyWithHTML('Недостаточно прав');
    }
  });


  return null;
};
