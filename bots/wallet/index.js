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
  cantBuyTicket,
  depositAction,
  retireAction
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
  insertStudent,
  insertWithdraw,
  updateWithdraw,
  getUserByEosName,
  getWithdraw
} = require('./db');

const { getDecodedParams } = require('./utils/utm');
const { parseTokenString } = require('./utils/tokens');

async function generateAccount(bot, ctx, isAdminUser, ref) {
  return new Promise(async (resolve, reject) => {

  

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
    console.log("message, data: ", message.data)
    if (message && message.data) {
      // TODO set partner info
      await saveUser(bot.instanceName, user);
      resolve({eosname: user.eosname, status: "ok"})
    } else {
      await saveUser(bot.instanceName, user);
      console.error(message);
      ctx.reply('Произошла ошибка при регистрации вашего аккаунта. Попробуйте позже перезапустить робота командой /start.', Markup.removeKeyboard());
      reject({eosname: user.eosname, status: "error", message: e.message})
      
    }
  } catch (e) {
    await saveUser(bot.instanceName, user);
    ctx.reply('Произошла ошибка при регистрации вашего аккаунта. Попробуйте позже перезапустить робота командой /start.', Markup.removeKeyboard());
    reject({eosname: user.eosname, status: "error", message: e.message})
  }


})
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
  { message: 'В каком городе вы живете?' },
];

async function startQuiz(bot, ctx, user) {
  await getQuiz(bot.instanceName, user.id);
  await ctx.deleteMessage(user.del_msg);

  const q = {
    id: user.id,
    current_quiz: 0,
    answers: quizDefinition,
    is_finish: false,
  };

  await saveQuiz(bot.instanceName, user, q);
  
  // const request = Markup.keyboard([Markup.button.contactRequest('📱 Поделиться контактом')], { columns: 1 }).resize();
  
  // const buttons = [];
  // buttons.push(Markup.button.url('🏫 узнать подробнее об Институте', 'https://intellect.run'));
  
  // return ctx.reply('');
  //Markup.inlineKeyboard(buttons, { columns: 1 }).resize()

}


async function catchRequest(bot, user, ctx, text){

    const reply = 'Ваш рецепт принят! Мы благодарим вас за расширение базы знаний.';
    // const menu = Markup.keyboard(['🏁 закрыть запрос'], { columns: 2 }).resize(); //, '🪙 кошелёк'
        
    await sendMessageToUser(bot, user, { text: reply });

    let id = await sendMessageToUser(bot, {id : bot.getEnv().STUDENTS_CHANNEL_ID}, { text: text });

    await insertMessage(bot.instanceName, user, bot.getEnv().STUDENTS_CHANNEL_ID, text, id, 'STUDENTS');
    
    user.state = "chat"
    user.request_channel_id = id

    if (!user.eosname) {
      user.eosname = await generateAccount(bot, ctx, false, user.ref);
    } 
  
    await saveUser(bot.instanceName, user)  
    
    await insertRequest(bot.instanceName, user, id, text)
    
}


  async function addRequestAction(bot, user, ctx){
    
    ctx.reply("Введите текст рецепта:")
    user.state = 'newrequest'
    await saveUser(bot.instanceName, user);
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

      let message = q.message + ' <i>Введите ответ текстом:</i>'
      await ctx.replyWithHTML(message, Markup.keyboard(buttons, { columns: 2 }).resize());
    } else {

      const clearMenu = Markup.removeKeyboard();
      let message = q.message + ' <i>Введите ответ текстом:</i>'
      
      await ctx.replyWithHTML(message, clearMenu, { reply_markup: { remove_keyboard: true } });
    }

    await saveQuiz(bot.instanceName, user, quiz);
  } else {
    quiz.is_finish = true;
    await saveQuiz(bot.instanceName, user, quiz);
    const {mainButtons} = require('./utils/bot')
    
    const menu = Markup // , "цели", "действия"
      .keyboard(mainButtons, { columns: 2 }).resize();

    user.state = ""
    await saveUser(bot.instanceName, user)  
    
    const t = 'Ваша анкета принята!';


    await sendMessageToUser(bot, user, { text: t }, menu);

    //send message to Channel
    // let text = `${quiz.answers[1].answer}, `
    // text += `+${quiz.answers[0].answer.phone_number || quiz.answers[0].answer}, @${user.username}\n`
    let text = ''

    k = 0

    for (const answer of quiz.answers) {
      if (k > 0){
        text += `\n${answer.message}`
        text += `\n${answer.answer}\n`
      }
      k++
    }
  
    let id = await sendMessageToUser(bot, {id : bot.getEnv().STUDENTS_CHANNEL_ID}, { text: text });

    await insertMessage(bot.instanceName, user, bot.getEnv().STUDENTS_CHANNEL_ID, text, id, 'STUDENT');
    
    await insertStudent(bot.instanceName, user, {
      userId: user.id,
      eosname: user.eosname,
      text: text,
      message_id: id,
      channel_id: bot.getEnv().STUDENTS_CHANNEL_ID
    })

    
    if (!user.eosname) {
      user.eosname = await generateAccount(bot, ctx, false, user.ref);
    } 
    
    user.state = ""
    user.resume_channel_id = id
    user.is_student = true
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
    
    const clearMenu = Markup.removeKeyboard();
    let r = await ctx.reply("Пожалуйста, подождите...", clearMenu, { reply_markup: { remove_keyboard: true } });
    
    await ctx.deleteMessage(r.message_id);

    const ref = await ctx.update.message.text.split('/start ')[1] || null;
    let msg2;

    if (ctx.update.message.chat.type === 'private') {
      if (!ctx.update.message.from.is_bot) {
        let user = await getUser(bot.instanceName, ctx.update.message.from.id);

        if (!user) {
          msg2 = await ctx.reply('Пожалуйста, подождите, мы создаём для вас аккаунт в блокчейне.. ⛓');
          user = ctx.update.message.from;
          user.app = bot.getEnv().APP;
          user.ref = ref

          await saveUser(bot.instanceName, user);
          user.eosname = (await generateAccount(bot, ctx, false, ref)).eosname;
          await saveUser(bot.instanceName, user);
          await ctx.deleteMessage(msg2.message_id);
          await ctx.reply('Аккаунт успешно зарегистрирован! 🗽');

        } else {
          let re_register = false
          const account = await bot.uni.readApi.getAccount(user.eosname).catch((err) => {
            re_register = true
          });
          
          if (re_register == true){
            user.eosname = (await generateAccount(bot, ctx, false, ref)).eosname;
            await saveUser(bot.instanceName, user);
          }
          user.is_student = false
          user.resume_chat_id = null
          user.resume_channel_id = null
        }
        const buttons = [];

        // buttons.push(Markup.button.callback('🆕 продолжить', `nextwelcome1`));
        
        user.del_msg = (await ctx.replyWithHTML('<b>Добро пожаловать в UNIWALL! </b>\n\nЗдесь можно совершить вклад в развитие Цифрового Кооператива и получить ценные подарки. ', Markup.inlineKeyboard(buttons, { columns: 1 }).resize())).message_id; //\n🛶🚁🎢🎡🌄🌅🏑🏏🏸🏒🥋🤿🏹🪁⛳️🥅🪃🥌⛸🏂🪂🤸‍♂️🤺🚵‍♂️🎯\n\n
        await saveUser(bot.instanceName, user);
        await printWallet(bot, user);
        // await startQuiz(bot, ctx, user);
      }
    } else {
      //dont have any reactions on public chats
    }
  });



   bot.on('contact', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);
    const quiz = await getQuiz(bot.instanceName, user.id);

    console.log(ctx.tg)
    quiz.answers.map((el, index) => {
      if (index === quiz.current_quiz) {
        el.answer = ctx.update.message.contact;
      }
    });

    await saveQuiz(bot.instanceName, user, quiz);
    await nextQuiz(bot, user, ctx);
  });


  bot.hears('❓ обратная связь', async (ctx) => {
    const buttons = [];

    buttons.push(Markup.button.url('задать вопрос ➡️', 'https://t.me/knouni_bot'));
            
    ctx.reply('Для создания запроса в обратную связь, пожалуйста, воспользуйтесь роботом: @knouni_bot', Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  });


  bot.hears('👌 отзывы', async (ctx) => {
    const buttons = [];

    buttons.push(Markup.button.callback('создать отзыв ◀️', `feedback`));
    

    buttons.push(Markup.button.url('просмотреть отзывы ➡️', bot.getEnv().TESTIMONIAL_CHANNEL));
            
    ctx.reply('Академия Кайфа бережно хранит отзывы своих кайфуш:', Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  });


  bot.hears('🗓 события', async (ctx) => {
    const buttons = [];

    buttons.push(Markup.button.url('просмотреть события ➡️', bot.getEnv().EVENTS_CHANNEL));
            
    ctx.reply('События кайфадемиков и кайфологов проходят по всему миру:', Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  });


  bot.hears('действия', async (ctx) => {
    // await checkForExistBCAccount(bot, ctx);
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);
    printTasks(ctx, user);
  });

  bot.hears('🧙🏻‍♂️ кайфология', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    
    const buttons = [];
    let text = ""
    text += "<b>Статусы в Академии Кайфа:</b>"
    text += '\n<i>Кайфуши</i> - это люди, любящие получать удовольствие от жизни.'
    text += `\n<i>Кайфологи</i> - это люди, обучающие получать удовольствие от жизни.`
    text += `\n<i>Кайфадемики</i> - это мастера получать удовольствие от жизни.`
    text += '\n\nТы такой? Тогда заяви о себе!'

    buttons.push(Markup.button.callback('заявить 🙋‍♂️', "startquiz"));
    buttons.push(Markup.button.url('канал кайфуш ➡️', bot.getEnv().STUDENTS_CHANNEL));
            
    user.del_msg = (ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons, { columns: 1 }).resize())).message_id;
    await saveUser(bot.instanceName, user)
  });


 bot.hears('🌀 касса', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.message.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.message.from.id);
    }

    await checkForExistBCAccount(bot, ctx);
    
    await printHelixWallet(bot, ctx, user, bot.getEnv().CORE_HOST);

  });



 bot.hears('🆕 бросить вызов', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    await addRequestAction(bot, user, ctx)

  });


 bot.hears('💝 кайфовый канал', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    
    ctx.reply("Ссылка: ")
    
  });

 bot.hears('💭 чат кайфологов', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    
    ctx.reply("Ссылка: ")
    
  });


 bot.hears('🆕 добавить рецепт', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    await addRequestAction(bot, user, ctx)
    
  });




  bot.hears('🪙 кошелёк', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (ctx.update.message.chat.type === 'private') {
      await printWallet(bot, user);
    } 

  });



  bot.hears('🎯 цели', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    
    await printGoalsMenu(bot, ctx, user, bot.getEnv().CORE_HOST);

  });



  bot.hears('🎫 билеты', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (ctx.update.message.chat.type === 'private') {
      // await printTickets(bot, user, ctx);
    } 

  });


  bot.on('message', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    

    if (user) {


      if (ctx.update.message.chat.type !== 'private') {//CATCH MESSAGE ON ANY PUBLIC CHAT WHERE BOT IS ADMIN
        let { text } = ctx.update.message;
        
        // console.log('need find reply: ', ctx.update.message.reply_to_message);
        
        if (ctx.update.message.reply_to_message) { //Если это ответ на чье-то сообщение

          const msg = await getMessage(bot.instanceName, ctx.update.message.reply_to_message.forward_from_message_id || ctx.update.message.reply_to_message.message_id);
          
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

        if (text == '/skip'){
          const menu = Markup
            .keyboard(mainButtons, { columns: 2 }).resize();

          const t = 'Оплата пропущена.';

          await sendMessageToUser(bot, user, { text: t }, menu);
          
        } else if (quiz && !quiz.is_finish) {
          quiz.answers.map((el, index) => {
            if (index === quiz.current_quiz) {
              el.answer = text;
            }
          });

          await saveQuiz(bot.instanceName, user, quiz);
          await nextQuiz(bot, user, ctx);
        } else if (user.state) {
            if (user.state === 'transfer_to') {
              const account = await bot.uni.readApi.getAccount(text).catch((err) => {
                console.error(err);
                return null;
              });

              if (account) {
                user.state = 'transfer_amount';
                user.transfer_action.data.to = text;
                saveUser(bot.instanceName, user).then();
                await ctx.replyWithHTML('Введите сумму перевода:');
              } else {
                await ctx.replyWithHTML('Аккаунт получателя не существует. Проверьте имя аккаунта и повторите попытку.');
              }
            } 


            else if (user.state === 'set_goal_title') {
              user.create_goal.title = text;
              user.create_goal.description = "";
              user.create_goal.target = `${parseFloat(bot.getEnv().TARGET).toFixed(4)} ${bot.getEnv().SYMBOL}`;
              
              saveUser(bot.instanceName, user);

              const buttons = [];

              buttons.push(Markup.button.callback('Отмена', 'cancelcreategoal'));
              buttons.push(Markup.button.callback('Да', 'creategoalnow'));

              let toPrint = 'Вы уверены, что хотите создать цель на 300$?';
              toPrint += `\n\n${user.create_goal.title}`;
              // toPrint += `\nОписание: ${user.create_goal.description}`;
              // toPrint += `\nЦель: ${user.create_goal.target}`;
              // toPrint += '\nВаш взнос: 10.0000 FLOWER';
              toPrint += `\n________________________________________________`
              toPrint += '\nВаша цель будет анонимно опубликована в канале целей кайфологов.';

              // eslint-disable-next-line max-len
              await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
            
            } 

            
            else if (user.state === 'set_withdraw_amount') {
              const helix = await getHelixParams(bot, bot.getEnv().CORE_HOST);

              let {min, max} = await getMaxWithdrawAmount(bot, user, ctx)
              const amount = `${parseFloat(text).toFixed(helix.host.precision)} ${helix.host.symbol}`;
              

              if (parseFloat(amount) > parseFloat(max)) ctx.reply(`Ошибка!\n\n Введенная сумма больше вашего баланса. Пожалуйста, введите сумму для вывода от ${min} до ${max} цифрами:`); // , Markup.inlineKeyboard(buttons, {columns: 1}).resize()
              
              else if (parseFloat(min) > parseFloat(amount)){
                
                ctx.reply(`Ошибка!. Минимальная сумма для создания заявки: ${min}, вы ставите на вывод: ${amount}. Повторите ввод суммы цифрами:`); // , Markup.inlineKeyboard(buttons, {columns: 1}).resize()
              
              } else {

                user.state = "set_withdraw_address"
                user.on_withdraw = {
                  amount
                }
                await saveUser(bot.instanceName, user);

                ctx.reply("Введите адрес для получения USDT.TRC20: ")

              }


            } 

            else if (user.state === 'set_withdraw_address') {
              user.on_withdraw.address = text
              await saveUser(bot.instanceName, user);

              const buttons = [];

              buttons.push(Markup.button.callback('Да', 'withdrawaction'));
              buttons.push(Markup.button.callback('Отмена', `backto wallet `));

              let text2 = "Подтверждение! Вы уверены, что хотите поставить средства на вывод?"
              text2 += `\n\nСумма: ${user.on_withdraw.amount}`
              text2 += `\nАдрес: ${user.on_withdraw.address}`

              ctx.reply(text2, Markup.inlineKeyboard(buttons, { columns: 2 }))


            } 

            else if (user.state === 'set_deposit_amount') {
              const { hostname } = user.deposit_action;
              const helix = await getHelixParams(bot, user.deposit_action.hostname);

              let depositNow = false;

              const amount = `${parseFloat(text).toFixed(helix.host.precision)} ${helix.host.symbol}`;
              let contract;

              // if (user.is_demo) contract = 'faketoken';

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
            }


            else if (user.state === 'transfer_amount') {
              const amount = `${parseFloat(text).toFixed(4)} FLOWER`;

              const buttons = [];

              buttons.push(Markup.button.callback('Да', `transfaction ${amount}`));
              buttons.push(Markup.button.callback('Нет', 'canceltransfer'));

              user.transfer_action.data.amount = amount;

              const textTo = `Вы уверены, что хотите совершить перевод партнёру ${user.transfer_action.data.to} на сумму ${amount}?`;

              ctx.reply(textTo, Markup.inlineKeyboard(buttons, { columns: 2 }));
              user.state = '';
              await saveUser(bot.instanceName, user);
            } else if (user.state === 'newrequest'){
            // console.log("HERE 1")
            await catchRequest(bot, user, ctx, text)

          } else if (user.state === 'chat') {
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
          if (ctx.update.message.sender_chat.id == bot.getEnv().STUDENTS_CHANNEL){ //если словили пересылку из прикрепленного канала
            if(ctx.update.message.forward_from_chat.id == bot.getEnv().STUDENTS_CHANNEL){ //то нужно запомнить ID сообщения, чтоб отвечать в том же треде
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


  async function buyTicket(bot, user, ctx, currency) {
    try{

      let params = {
        username: user.eosname,
        currency: currency
      }
      let path = `${bot.getEnv().PAY_GATEWAY}/generate`
      
      const result = await axios.post(
        path,
        params
      );
      
      if (result.data.status === 'ok'){
        await ctx.replyWithHTML(`Для оплаты принимаем USDT в сети TRC20.\nИнструкция для оплаты: свяжитесь с Владом (@skyone77777) или отправьте 150 USDT.TRC20. \n\nАдрес для оплаты в USDT поступит следующим сообщением:`)
        await ctx.reply(`${result.data.address}`)
      }
      else ctx.reply("Произошла ошибка на получении адреса. Попробуйте позже. ")

    } catch(e){
      ctx.reply("Произошла ошибка на получении адреса. Попробуйте позже. ")
    }
    
  }


  bot.action('startquiz', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    user.state = ""

    if (user.is_student == false){
      await startQuiz(bot, ctx, user)
      await nextQuiz(bot, user, ctx);
    } else {
      ctx.reply('Вы уже кайфуша! Повторно опубликовать анкету временно нельзя.')
    }
  });


  bot.action(/confirmwithdraw (\w+)/gi, async (ctx) => {
    const withdraw_id = ctx.match[1];
    // console.log("withdraw_id: ", withdraw_id)
    let wobj = await getWithdraw(bot.instanceName, withdraw_id)
    // console.log('wobj', wobj)
    const user = await getUser(bot.instanceName, wobj.userId);

    await updateWithdraw(bot.instanceName, withdraw_id, "confirmed")

    ctx.editMessageText('вывод обработан');

    //TO CLIENT
    await sendMessageToUser(bot, user, { text: `Заявка на вывод ${wobj.amount} успешно обработана` });

    //TODO make db insert
    //TODO send request to admin
    //
  });

  bot.action('withdrawaction', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    user.state = ""
    let withdraw_id = await insertWithdraw(bot.instanceName, user, {
      userId: user.id,
      eosname: user.eosname,
      amount: user.on_withdraw.amount,
      address: user.on_withdraw.address,
      created_at: new Date(),
      status: 'created'
    })

    const balances = await getUserHelixBalances(bot, bot.getEnv().CORE_HOST, user.eosname);
    

    //MASSWITHDRAWACTION
    massWithdrawAction(bot, user, bot.getEnv().CORE_HOST, balances.all).then(res => {

      //TODO make a burn from user with address in memo
      retireAction(bot, user, user.on_withdraw.amount, user.on_withdraw.address).then(async () => {
        ctx.deleteMessage(); //delete buttons

        const buttons = [];
        buttons.push(Markup.button.callback('подтвердить оплату', `confirmwithdraw ${withdraw_id}`));
        
        //TO CLIENT
        await sendMessageToUser(bot, user, { text: `Заявка на вывод создана на сумму ${user.on_withdraw.amount}. Перевод будет выполнен на адрес:\n${user.on_withdraw.address}` });

        //TO ADMIN
        
        let admin = await getUserByEosName(bot.instanceName, bot.getEnv().OPERATOR_EOSNAME)
        await sendMessageToUser(bot, admin, { text: `Получена новая заявка на вывод на сумму:\n${user.on_withdraw.amount} от пользователя ${user.eosname} (${user.id}). Перевод будет выполнен на адрес:` });
        await sendMessageToUser(bot, admin, { text: `${user.on_withdraw.address}` }, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

        
        await updateWithdraw(bot.instanceName, withdraw_id, "waiting")
        
      }).catch(e => {
        console.error(e)
        ctx.reply(`Ошибка! Обратитесь в поддержку с сообщением: ${e.message}`)      
      }) 
    }).catch(e => {
      console.error(e)
        ctx.reply(`Произошла ошибка при выполнении транзакции вывода. Попробуйте еще раз или обратитесь в поддержку с сообщением: ${e.message}`)      
    })

    //
  });


  bot.action('nextwelcome1', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    
    const buttons = [];

    await ctx.deleteMessage(user.del_msg);

    buttons.push(Markup.button.callback('➡️ продолжить', `nextwelcome2`));
    const menu = Markup // , "цели", "действия"
      .keyboard(mainButtons, { columns: 2 }).resize();

    user.del_msg = (await ctx.reply('Каждый NFT-токен предоставляет обладателю пожизненную долю от финансового оборота Цифрового Кооператива.', menu)).message_id; 
    await saveUser(bot.instanceName, user);
  });


  bot.action('nextwelcome2', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    
    const buttons = [];
    await ctx.deleteMessage(user.del_msg);

    // buttons.push(Markup.button.callback('➡️ начать знакомство', `startquiz`));
  
    // user.del_msg = (await ctx.reply('Каждый NFT-токен предоставляет обладателю пожизненную долю от финансового оборота Цифрового Кооператива.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize())).message_id; 
    await saveUser(bot.instanceName, user);
    await printWallet(bot, user);
    // const buttons = [];
    // await ctx.deleteMessage(user.del_msg);

    // buttons.push(Markup.button.callback('🎫 купить билет', `buyticket`));

  });

// bot.action('nextwelcome3', async (ctx) => {
//     const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    
//     const buttons = [];
//     await ctx.deleteMessage(user.del_msg);

//     buttons.push(Markup.button.callback('➡️ продолжить', `nextwelcome4`));
  
//     user.del_msg = (await ctx.reply('Совершая вклад в развитие Цифрового Кооператива, вы создаёте платформу ', Markup.inlineKeyboard(buttons, { columns: 1 }).resize())).message_id; 
//     await saveUser(bot.instanceName, user);

//   });


bot.action('nextwelcome4', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    
    const buttons = [];
    await ctx.deleteMessage(user.del_msg);

    buttons.push(Markup.button.callback('➡️ продолжить', `nextwelcome5`));
  
    user.del_msg = (await ctx.reply('', Markup.inlineKeyboard(buttons, { columns: 1 }).resize())).message_id; 
    await saveUser(bot.instanceName, user);

});


bot.action('nextwelcome5', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    
    const buttons = [];
    await ctx.deleteMessage(user.del_msg);

    buttons.push(Markup.button.callback('➡️ продолжить', `nextwelcome6`));
  
    user.del_msg = (await ctx.reply('На приоритет и скорость осуществления вашей кайфовой цели влияет количество фракций и количество проданных сетью билетов.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize())).message_id; 
    await saveUser(bot.instanceName, user);

});



bot.action('nextwelcome6', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    
    const buttons = [];
    await ctx.deleteMessage(user.del_msg);

    buttons.push(Markup.button.callback('🎫 купить билет', `buyticket`));
  
    user.del_msg = (await ctx.reply('Таким образом, участники осуществляют свои кайфовые цели здесь, пока покупают билеты Академии.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize())).message_id; 
    await saveUser(bot.instanceName, user);

});

  bot.action(/next (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const nextId = parseInt(ctx.match[1], 10);
    console.log("nextId", nextId)
    await printTickets(bot, user, ctx, nextId);
  });

  bot.action('buyticket', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await ctx.deleteMessage();
    // console.log("купить билет")
    // await setBuyMenu(ctx)
    buyTicket(bot, user, ctx, "USDT.TRC20")
    // ctx.reply('покупаю!')
  });

  bot.action('refreshwallet', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await ctx.deleteMessage();
    // console.log("купить билет")
    // await setBuyMenu(ctx)
    await printWallet(bot, user);
    // ctx.reply('покупаю!')
  });


  bot.action('cantbuyticket', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    // await ctx.deleteMessage();
    
    await cantBuyTicket(bot, user)
    
    // console.log("купить билет")
    // await setBuyMenu(ctx)
    // buyTicket(bot, user, ctx, "USDT.TRC20")
    // ctx.reply('покупаю!')
  });


 bot.action(/creategoal (\w+)/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const hostname = ctx.match[1];

    user.state = 'set_goal_title';
    user.create_goal = { hostname };
    saveUser(bot.instanceName, user);

    ctx.replyWithHTML(`Как вы потратите ${bot.getEnv().TARGET}$ ? <i>Введите ответ текстом: </i>`);
  });

 bot.action('creategoalnow', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    createGoal(bot, ctx, user);
  });

  bot.action('cancelcreategoal', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    user.state = '';
    user.create_goal = {};
    saveUser(bot.instanceName, user);

    ctx.editMessageText('Создание цели отменено.');
  });

  bot.action('depositaction', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    await depositAction(bot, ctx, user);
  });

bot.action(/deposit (\w+)/gi, async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    if (!user) {
      if (await restoreAccount(bot, ctx, ctx.update.callback_query.from) === false) return;
      user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    }

    let contract;
    // if (user.is_demo) contract = 'faketoken';

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


bot.action('nextwelcome5', async (ctx) => {
    const buttons = [];
    await ctx.deleteMessage();

    buttons.push(Markup.button.callback('🆕 продолжить 3', `nextwelcome4`));
  
    await ctx.reply('Чтобы ', Markup.inlineKeyboard(buttons, { columns: 1 }).resize()); 

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
      const count = await sendMessageToAll(bot, { text: message });
      await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
    } else {
      await ctx.replyWithHTML('Недостаточно прав');
    }
  });


  bot.action(/transfer/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    user.state = 'transfer_to';
    user.transfer_action = { name: 'transfer', data: { from: user.eosname, to: '', memo: '' } };
    saveUser(bot.instanceName, user).then();
    ctx.reply('Введите имя аккаунта получателя:');
  });

  bot.action(/transfaction (.*$)/gm, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const amount = ctx.match[1];

    await transferAction(bot, user, amount, ctx);
  });


// async function showBuySellMenu(bot, user, ctx) {
//   const myOrders = await bot.uni.p2pContract.getOrders(user.eosname);
//   const buyOrders = myOrders.filter((el) => el.type === 'buy');

//   if (user.state === 'giveHelp') {
//     if (buyOrders.length === 0) setBuyMenu(ctx);
//     else {
//       const buyOrder = buyOrders[0];
//       const buttons2 = [];
//       buttons2.push(Markup.button.callback('Отменить заявку', `cancelorder ${buyOrder.id}`));
//       ctx.reply(`У вас уже есть активная заявка на оказание помощи на сумму ${buyOrder.out_quantity}. `, Markup.inlineKeyboard(buttons2, { columns: 1 }).resize());
//     }
//   } else if (user.state === 'getHelp') {
//     await setSellMenu(bot, ctx, user);
//   }
// }
  
  async function getMaxWithdrawAmount(bot, user, ctx) {
    const liquidBal = await getLiquidBalance(bot, user.eosname, bot.getEnv().SYMBOL);
    const balances = await getUserHelixBalances(bot, bot.getEnv().CORE_HOST, user.eosname);
    
    const min = `${(2 / parseFloat(1)).toFixed(0)} ${bot.getEnv().SYMBOL}`;
    const max = `${(((parseFloat(balances.totalBalances) + parseFloat(liquidBal)) * parseFloat(1)) / parseFloat(1)).toFixed(4)} ${bot.getEnv().SYMBOL}`;
    
    return {min, max}

  }


  bot.action(/backto (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const to = ctx.match[1];
    const hostname = ctx.match[2];
    
    user.state = ""

    await saveUser(bot.instanceName, user);

    if (to === 'helixs') await printHelixs(bot, ctx, user, null, hostname);

    else if (to === 'helix') {
      await printHelixWallet(bot, ctx, user, hostname);
    } else if (to === 'wallet') {
      await printWallet(bot, user);
    }
  });

  bot.action("withdraw", async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    user.state = 'set_withdraw_amount';
    await saveUser(bot.instanceName, user);
    // showBuySellMenu(bot, user, ctx);
    // console.log("helixBalances: ", balances)
    let {min, max} = await getMaxWithdrawAmount(bot, user, ctx)
    
    if (parseFloat(max) >= parseFloat(min)) ctx.reply(`Введите сумму!\n\n Пожалуйста, введите сумму для вывода от ${min} до ${max} цифрами.`); // , Markup.inlineKeyboard(buttons, {columns: 1}).resize()
    else {
      ctx.reply(`Ошибка!. Минимальная сумма для создания заявки: ${min}, на вашем балансе: ${max}. `); // , Markup.inlineKeyboard(buttons, {columns: 1}).resize()
    }

    // if (parseFloat(liquidBal) == 0){
    //   ctx.reply('Ошибка! У вас нет USDT для вывода. ')
    // } else {

      // ctx.reply(`Введите ваш адрес USDT в сети TRC20:`)  
    // }
     
     

    // await printTickets(bot, user, ctx, nextId);
  });


  bot.action('gethelp', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    
    // const min = `${(2 / parseFloat(1)).toFixed(0)} USDT`;
    // const max = `${((parseFloat(liquidBal) * parseFloat(1)) / parseFloat(1)).toFixed(0)} USDT`;

    // if (parseFloat(max) >= parseFloat(min)) ctx.reply(`Введите сумму!\n\n Пожалуйста, введите сумму получения помощи от ${min} до ${max} цифрами.`); // , Markup.inlineKeyboard(buttons, {columns: 1}).resize()
    // else {
    //   ctx.reply(`Ошибка!. Минимальная сумма для создания заявки: ${min}, на вашем балансе: ${max}. `); // , Markup.inlineKeyboard(buttons, {columns: 1}).resize()
    // }

  });

  return null;
};
