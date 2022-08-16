const { Markup } = require('telegraf');
const axios = require('axios');
const { ChainsSingleton, generateAccount: generateUniAccount } = require('unicore');
const EosApi = require('eosjs-api');

const { restoreAccount } = require('./restore');
const {
  mainButtons, backToMainMenu, demoButtons,
} = require('./utils/bot');

const {createChat, makeAdmin, createGroupCall, setDiscussionGroup, exportChatLink} = require('./mtproto')

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
  burnNow
} = require('./goals');

const {
  createTask,
  createReport
} = require('./tasks')

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
  getUnion,
  getUnionByType,
  insertGoal,
  addMainChatMessageToGoal,
  getGoalByChatMessage,
  insertTask,
  getTaskByChatMessage,
  insertReport,
  addMainChatMessageToReport
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
  { message: 'start' },
  // { message: 'Как к вам обращаться?' },
  { message: 'Введите название вашего союза:' },  
  // { message: 'Введите цель вашего союза:' },  
  // { message: 'Введите токен бота вашего союза:' },  
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

  // const buttons = [];

  // buttons.push(Markup.button.url('🏫 перейти на сайт', 'https://simply.estate'));
  
  // const request = Markup.keyboard([Markup.button.contactRequest('📱 Поделиться контактом')], { columns: 1 }).resize();
  
  // await ctx.reply('Как можно к вам обращаться?');


  // startQuiz()
  // return ctx.reply('', request);

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

    // const menu = Markup // , "цели", "действия"
    //   .keyboard(['🪙 кошелёк'], { columns: 1 }).resize();

    
    let unionName = quiz.answers[1].answer
    let id = await ctx.reply("Пожалуйста, подождите. Мы регистрируем союз для вас. ")
    
    //TODO создать чат 
    
    let chatResult = await createChat(bot, user, unionName, "union")

    // let goalChatResult = await createChat(bot, user, unionName, "goals")
    
    // let goalResult = await createChat(bot, user, unionName, "goals")
    // console.log("goalResult: ", goalResult)

    // await setDiscussionGroup(bot, parseInt(goalChatResult.chatId), parseInt(goalResult.chatId))    
    
    console.log("AFTE RCREATE CHAT", chatResult)

    await ctx.deleteMessage(id.message_id);

    const buttons = [];

    buttons.push(Markup.button.url('🏫 войти', chatResult.chatLink));
    // buttons.push(Markup.button.url('🏫 цели', goalResult.channelLink));
    

    const t = 'Союз создан. Пожалуйста, войдите в союз и завершите настройку.';
    // console.log(t)

    ctx.reply(t, Markup.inlineKeyboard(buttons, { columns: 1 }).resize())
    // await sendMessageToUser(bot, user, { text: t }, );
    console.log("FINISH?")
    //send message to Channel

    
    // console.log("HERE3")
    // const buttons = [];
    // buttons.push(Markup.button.callback('создать союз', `createunion`));
    // buttons.push(Markup.button.callback('список союзов', `listunion`));
    // buttons.push(Markup.button.callback('лента союзов', `newsunion`));
    // Markup.inlineKeyboard(buttons, { columns: 1 }).resize()
        


    // let text = ''
    // text += `Имя организатора: ${quiz.answers[1].answer}, @${user.username}\n`
    // text += `Название: ${quiz.answers[2].answer}\n`
    // text += `Назначение: ${quiz.answers[3].answer}\n`
    // text += `Токен: ${quiz.answers[4].answer}`
    // let id = await sendMessageToUser(bot, {id : bot.getEnv().CV_CHANNEL}, { text: text });
    // await insertMessage(bot.instanceName, user, bot.getEnv().CV_CHANNEL, text, id, 'CV');    
    // user.state = "chat"
    // user.resume_channel_id = id

    
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
          user = ctx.update.message.from;
          user.app = bot.getEnv().APP;
          user.ref = ref

          await saveUser(bot.instanceName, user);

        } else {

          user.resume_chat_id = null
          user.resume_channel_id = null
        }

        if (!user.eosname) {
          user.eosname = await generateAccount(bot, ctx, false, user.ref);
        } 

        await saveUser(bot.instanceName, user)

        const buttons = [];
        buttons.push(Markup.button.callback('🆕 создать союз', `createunion`));
        // buttons.push(Markup.button.callback('каталог союзов', `listunion`));
        // buttons.push(Markup.button.callback('лента союзов', `newsunion`));

        const clearMenu = Markup.removeKeyboard();
        // await ctx.reply(`Добро пожаловать в Децентрализованное Автономное Сообщество.\n\n`, clearMenu, { reply_markup: { remove_keyboard: true } });


        let t = 'Доброе пожаловать в Децентрализованное Автономное Сообщество.\n';
        // let t = '.\n';

        // Институт:  @intellect_run
//         t += `
// Инструкции:
// Новости:   @dacom_news
// Цели:         @dacom_goals
// Задания:   @dacom_tasks
// Союзы:      @dacom_unions
// Советы:     @dacom_soviets
// Досуг:        @dacom_fun`

        await ctx.reply(t, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());


        // await ctx.reply(q.message, clearMenu, { reply_markup: { remove_keyboard: true } });


        // await ctx.reply('Добро пожаловать в Децентрализованное Автономное Сообщество Института Коллективного Разума!');
  
        // await startQuiz(bot, ctx, user);

      }
    } else {
      console.log("ctx.update.message", ctx.update.message)
      let user = await getUser(bot.instanceName, ctx.update.message.from.id);

      let chatId = ctx.message.chat.id
      let userId = ctx.update.message.from.id

      // setDiscussionGroup(bot, 659911949, 1713017401, 9184800756685276000)

      // createGroupCall(bot, chatId, userId)
      // ctx.reply("hello world")
      // let res = await makeAdmin(bot, chatId, userId)
    
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

  async function welcome(bot, ctx){

    let chatId = ctx.message.chat.id
    let userId = ctx.message.new_chat_member.id
    
    console.log("chatId: ", chatId, "userId: ", userId)
    
    let union = await getUnion(bot.instanceName, chatId)
    console.log("UNION: ", union, chatId)
    if (union)
      if (union.ownerId == userId) {
        let res = await makeAdmin(bot, chatId, userId)

        const id = await sendMessageToUser(bot, { id: chatId }, { text: "Привет админу!" });
        console.log("make admin: ", res)

      } else {
        const id = await sendMessageToUser(bot, { id: chatId }, { text: "Привет участнику" });
      
      }
      
  
  };

  bot.on('new_chat_members', async (ctx) => {
    console.log("welcome")
    welcome(bot, ctx)
    
    //TODO set admin rights and publish next instructions 
    //
    //TODO publish instrucitons
    //
    // console.log("NEW CHAT MEMBERS: ", ctx.message.new_chat_members)
  })

  bot.hears('🏫 Об Институте', async (ctx) => {
    await getUser(bot.instanceName, ctx.update.message.from.id);
    await checkForExistBCAccount(bot, ctx);

    ctx.reply('Главный Вход: https://intellect.run');
  });





  bot.hears('🪙 кошелёк', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (ctx.update.message.chat.type === 'private') {
      await printWallet(bot, user);
    } 

  });

  function getHashtags(message){
    let tags = []
    let { text } = message;
    let entities = message.entities
    
    if (entities)
      entities.map(el => {
        if (el.type == 'hashtag') {
          tags.push(text.substr(el.offset + 1, el.length))
        }
      })
    return tags

  }

  bot.on('message', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    console.log('catch user', user);
    let { text } = ctx.update.message;
    let entities = ctx.update.message.entities
    
    let tags = getHashtags(ctx.update.message)
    
    console.log("MESSAGE:", ctx.update.message)
    console.log("TAGS:", tags)
    
    // entities: [ { offset: 12, length: 5, type: 'hashtag' } ]
    // console.log("message: ", ctx.update.message, ctx.update.message.chat.type)
    if (!user && ctx.update.message.from.is_bot == false && ctx.update.message.from.id != 777000){
        user = ctx.update.message.from;

        user.eosname = await generateAccount(bot, ctx, false, user.ref);
        await saveUser(bot.instanceName, user)
    }

    if (user) {

      //CATCH MESSAGE ON ANY PUBLIC CHAT WHERE BOT IS ADMIN
      if (ctx.update.message.chat.type !== 'private') {
        //PUBLIC CHAT
        // console.log('tyL: ', ctx.update.message);


        // if (ctx.update.message.reply_to_message) { //Если это ответ на чье-то сообщение
        //   //получаем из бд сообщение на которое отвечаем
        
        //   const msg = await getMessage(bot.instanceName, ctx.update.message.reply_to_message.forward_from_message_id   || ctx.update.message.reply_to_message.message_id);
        //   console.log("MESSAGE: ", msg)  
        //   if (msg && msg.message_id) {
        //     //отвечаем пользователю в бота, если сообщение находится в БД

        //     // console.log('resend back to: ', msg);
            
        //     const id = await sendMessageToUser(bot, { id: msg.id }, { text });
        //     console.log("message_id: ", id)
        //     await insertMessage(bot.instanceName, user, user.id, text, id, {chatId: ctx.update.message.chat.id});
        //   }
        

        // } else 
        if (true) {
          if (text == '/start_soviet'){
            
            ctx.reply("Введите дату начала и время Совета в формате 2022-08-09T20:00:00:")
            user.state = "start_soviet"
            user.new_soviet = {}
            await saveUser(bot.instanceName, user);

          } else if (user.state == "start_soviet") {
            
            let d = new Date(text)

            user.new_soviet.start_at = d
            let time = d.getTime() / 1000
            console.log("TIME: ", d, time)

            await createGroupCall(bot, ctx.update.message.chat.id, time)
            // await saveUser(bot.instanceName, user);

          }



          if (text == '/new_cycle'){
            ctx.reply("Введите дату начала цикла развития:")
            user.state = "start_cycle"
            user.new_cycle = {}
            await saveUser(bot.instanceName, user);
          } else if (user.state == 'start_cycle'){
            ctx.reply(`Дата начала: ${text}`)
            user.state = "create_cycle"
            //TODO text -> DATE
            user.new_cycle.start_date = text

            await saveUser(bot.instanceName, user);
            ctx.reply("Введите название цикла развития:")
          } 
          // else if (user.state == 'finish_cycle'){
          //   ctx.reply(`Дата завершения: ${text}`)
          //   user.state = "create_cycle"
          //   //TODO text -> DATE
          //   user.new_cycle.finish_date = text
          //   await saveUser(bot.instanceName, user);
          //   ctx.reply("Введите название цикла развития:")

          // }
           else if (user.state == 'create_cycle'){
            ctx.reply("Пожалуйста, подождите, мы создаём новый цикл.")

            user.state = ""
            user.new_cycle.title = text
            await saveUser(bot.instanceName, user);
            // ctx.reply(JSON.stringify(user.new_cycle))


          }


          else if (tags.length > 0) {
            for (tag of tags) {
              if (tag === 'report'){
                if (ctx.update.message.reply_to_message){
                  // let checkl = await exportChatLink(ctx.update.message.reply_to_message.forward_from_chat.id, ctx.update.message.message_id)
                  // console.log("CHECK!", checkl, ctx.update.message.reply_to_message.forward_from_chat.id, ctx.update.message.message_id)
                  // console.log("ctx.update.message.forward_from_message_id: ", ctx.update.message.reply_to_message.forward_from_message_id)
                  
                  // (eosio::name host, eosio::name creator, std::string permlink, uint64_t goal_id, uint64_t priority, eosio::string title, eosio::string data, eosio::asset requested, bool is_public, eosio::name doer, eosio::asset for_each, bool with_badge, uint64_t badge_id, uint64_t duration, bool is_batch, uint64_t parent_batch_id, bool is_regular, std::vector<uint64_t> calendar, eosio::time_point_sec start_at,eosio::time_point_sec expired_at, std::string meta){

                  try {
                    console.log("RECIEVE REPORT!")
                    // const msg = await getMessage(bot.instanceName, )
                    console.log("ctx.update.message.reply_to_message.message_id: ",ctx.update.message.reply_to_message.message_id)
                    let task = await getTaskByChatMessage(bot.instanceName, "core", ctx.update.message.reply_to_message.message_id)
                    console.log("TASK:", task)

                    if (!task){

                      let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                
                      exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "goalsChannel")
                  
                      ctx.reply(`Ошибка! Поставка отчётов к действиям доступна только в обсуждениях конкретной цели как ответ на конкретное действие. Канал целей: ${exist.link}`, {reply_to_message_id: ctx.update.message.message_id})
                  
                    } else {

                      try{

                         let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                         
                         console.log("CURRENT_CHAT: ", current_chat)
                          
                          if (current_chat){
                            let exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "reportsChannel")
                            
                            if (!exist) {
                              // const id = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: "Пожалуйста, подождите, мы создаём канал для действий союза" });
                              let reportsChatResult = await createChat(bot, user, current_chat.unionName, "reports")
                               
                              // const id2 = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: `Канал действий создан: ${tasksChatResult.channelLink}` });
                              exist = {id : "-100" + reportsChatResult.channelId}
                            }


                          const reportMessageId = await sendMessageToUser(bot, {id: exist.id}, { text });
                          await insertMessage(bot.instanceName, user, user.id, text, reportMessageId, 'report', {chatId: exist.id});//goalId: goal.goalId, 



                            //TODO send to channel
                            

                          await createReport(bot, ctx, user, {
                            host: "core",
                            username: user.eosname,
                            task_id: task.task_id,
                            data: text
                          })

                          insertReport(bot.instanceName, {
                            host: "core",
                            username: user.eosname,
                            data: text,
                            
                            task_id: task.task_id,
                            goal_id: task.goal_id,
                            goal_chat_message_id: ctx.update.message.message_id,
                            report_channel_message_id: reportMessageId
                          })

                          ctx.reply("Отчёт принят и ожидает утверждения", {reply_to_message_id: ctx.update.message.message_id})

                        }

                      } catch(e) {
                        console.error(e)
                        ctx.reply(`Ошибка при создании отчёта. Скорее всего, он уже создан. Сообщение: ${e.message}`, {reply_to_message_id: ctx.update.message.message_id})
                        
                      }


                    }


                  } catch(e) {
                    ctx.reply(e.message)
                  }

                 

                } else {
                  let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                
                  exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "goalsChannel")
                  
                  ctx.reply(`Ошибка! Поставка отчётов к действиям доступна только в обсуждениях конкретной цели.\nКанал целей: ${exist.link}`, {reply_to_message_id: ctx.update.message.message_id})
                }

              } else if (tag === 'task'){

                
                const buttons = [];
                buttons.push(Markup.button.callback('😁', 'vote'));
                buttons.push(Markup.button.callback('👍', 'vote'));
                buttons.push(Markup.button.callback('🔥', 'vote'));
                
                const request = Markup.inlineKeyboard(buttons, { columns: 3 }).resize()
                
                if (ctx.update.message.reply_to_message){
                  // let checkl = await exportChatLink(ctx.update.message.reply_to_message.forward_from_chat.id, ctx.update.message.message_id)
                  // console.log("CHECK!", checkl, ctx.update.message.reply_to_message.forward_from_chat.id, ctx.update.message.message_id)
                  // console.log("ctx.update.message.forward_from_message_id: ", ctx.update.message.reply_to_message.forward_from_message_id)
                
                  try{
                    // await ctx.deleteMessage(ctx.update.message.message_id);      
                  } catch(e){}
                  
                  
                  
                  // (eosio::name host, eosio::name creator, std::string permlink, uint64_t goal_id, uint64_t priority, eosio::string title, eosio::string data, eosio::asset requested, bool is_public, eosio::name doer, eosio::asset for_each, bool with_badge, uint64_t badge_id, uint64_t duration, bool is_batch, uint64_t parent_batch_id, bool is_regular, std::vector<uint64_t> calendar, eosio::time_point_sec start_at,eosio::time_point_sec expired_at, std::string meta){

                  try {
                    // const msg = await getMessage(bot.instanceName, )
                    console.log("ctx.update.message.reply_to_message.message_id: ",ctx.update.message.reply_to_message.message_id)
                    let goal = await getGoalByChatMessage(bot.instanceName, "core", ctx.update.message.reply_to_message.message_id)
                    console.log("GOAL:", goal)
                    let task_id = await createTask(bot, ctx, user, {
                      host: "core",
                      creator: user.eosname,
                      permlink: "",
                      goal_id: goal.goal_id, //TODO!
                      priority: 0,
                      title: text,
                      data: "предоставьте отчёт",
                      requested: parseFloat(0).toFixed(4) + " " + bot.getEnv().SYMBOL,
                      is_public: true,
                      doer: "",
                      for_each: parseFloat(0).toFixed(4) + " " + bot.getEnv().SYMBOL,
                      with_badge: false,
                      duration: 0,
                      badge_id: 0,
                      is_batch: false,
                      parent_batch_id: 0,
                      is_regular: false,
                      calendar: [],
                      start_at: "2022-01-01T00:00:00",
                      expired_at: "2022-01-01T00:00:00",
                      meta: ""

                    })

                    // text += '\nсоздатель: ' + user.eosname
                    // text += `\nдеятель: -`

                    let chat_message_id = (await ctx.reply("Действие добавлено", {reply_to_message_id: ctx.update.message.message_id})).message_id //...request

                    await insertTask(bot.instanceName, {
                      host: 'core',
                      task_id,
                      goal_id: goal.goal_id,
                      title: text,
                      chat_id: ctx.update.message.chat.id,
                      chat_message_id: ctx.update.message.reply_to_message.message_id,
                    })

                    //TODO insert task
                    await insertMessage(bot.instanceName, user, user.id, text, chat_message_id, 'report', {chatId: ctx.update.message.chat.id, task_id: task_id, goal_id: goal.goal_id});//goalId: goal.goalId, 


                  } catch(e) {
                    ctx.reply(e.message)
                  }

                  let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                  console.log("CURRENT_CHAT: ", current_chat)
 
                  if (current_chat){
                    let exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "tasksChannel")
                     
                    if (!exist){
                      exist = await getUnionByType(bot.instanceName, user.eosname, "unionChannel")
                      
                      if (exist){
                        const id = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: "Пожалуйста, подождите, мы создаём канал для действий союза" });
                        let tasksChatResult = await createChat(bot, user, exist.unionName, "tasks")
                        await ctx.deleteMessage(id);  
                        const id2 = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: `Канал действий создан: ${tasksChatResult.channelLink}` });
                        exist = {id : "-100" + tasksChatResult.channelId}
                      }

                    }

                    // if (!exist) {
                    //   // const id = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: "Пожалуйста, подождите, мы создаём канал для действий союза" });
                    //   let tasksChatResult = await createChat(bot, user, current_chat.unionName, "tasks")
                       
                    //   // const id2 = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: `Канал действий создан: ${tasksChatResult.channelLink}` });
                    //   exist = {id : "-100" + tasksChatResult.channelId}
                    // }
                    if (exist){
                      const taskMessageId = await sendMessageToUser(bot, {id: exist.id}, { text }, request);
                      await insertMessage(bot.instanceName, user, user.id, text, taskMessageId, 'task', {chatId: exist.id});//goalId: goal.goalId, 
                    }

                    //TODO send to channel
                  }

                } else {
                  let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                
                  exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "goalsChannel")
                  
                
                  ctx.reply(`Ошибка! Постановка действий доступна только в обсуждениях конкретной цели.\nКанал целей: ${exist.link}`, {reply_to_message_id: ctx.update.message.message_id})
                }

              } else if (tag === 'goal') {
                console.log("looking_for: ", ctx.chat.id.toString())
                let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                console.log("current_chat: ", current_chat)

                if (!current_chat) 
                  return

                
                // await getUnion(bot.instanceName, ctx.update.message.forward_from_chat.id.toString())
                let exist = await getUnion(bot.instanceName, ctx.update.message.chat.id.toString())
                console.log("AFTER!", exist)

                if (exist.type != "unionChat"){
                  ctx.reply("Ошибка! Постановка целей доступна только в главном чате союза. Используйте тег #task в сообщении.", {reply_to_message_id: ctx.message.message_id})
                  return
                }
                console.log("goalChannel: ", exist)
                
                exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "goalsChannel")
                
                if (!exist){
                  exist = await getUnionByType(bot.instanceName, user.eosname, "unionChannel")
                  const id = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: "Пожалуйста, подождите, мы создаём канал для целей союза" });
                  let goalChatResult = await createChat(bot, user, exist.unionName, "goals")
                  await ctx.deleteMessage(id);  
                  const id2 = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: `Канал целей создан: ${goalChatResult.channelLink}` });
                  exist = {id : "-100" + goalChatResult.channelId}
                }
                
                let goalChannelId = exist.id
    
                console.log("GOAL DETECTED:", tag, user)
                let goal = {
                  hostname: "core",
                  title: text,
                  description: "",
                  target: "0.0000 FLOWER",
                  parent_id: 0,
                }

                goal.goalId = await createGoal(bot, ctx, user, goal)
                
                if (!goal.goalId){
                  ctx.reply("Произошла ошибка при создании цели", {reply_to_message_id : ctx.update.message.message_id})
                  return
                }

                // let text_goal = `создатель: ${user.eosname}`
                // text_goal += `\nпредложение:\n${text}`
                let text_goal = text

                const buttons = [];

                buttons.push(Markup.button.callback('голосовать', 'vote'));
                
                const request = Markup.inlineKeyboard(buttons, { columns: 1 }).resize()
                // ctx.reply(text_goal, request)

                console.log("goalChannelId: ", goalChannelId)
                const goalMessageId = await sendMessageToUser(bot, {id: goalChannelId}, { text: text_goal });
                
                await insertGoal(bot.instanceName, {
                  host: "core",
                  title: text,
                  goal_id: goal.goalId,
                  channel_message_id: goalMessageId 
                })

                
                // console.log("goalId", goalId)

                ctx.reply("Цель добавлена", {reply_to_message_id : ctx.update.message.message_id})

                await insertMessage(bot.instanceName, user, user.id, text, goalMessageId, 'goal', {goalId: goal.goalId, chatId: goalChannelId});

              } else if (tag === 'action') {
                
                console.log("ACTION DETECTED:", tag)

              }
            }

          }
        }
      
      } else {//Если это диалог пользователя с ботом
        //проверяем не квиз ли

        const quiz = await getQuiz(bot.instanceName, user.id);
        let { text } = ctx.update.message;
        console.log("on else", text)

        if (quiz && !quiz.is_finish) {
          quiz.answers.map((el, index) => {
            if (index === quiz.current_quiz) {
              el.answer = text;
            }
          });

          await saveQuiz(bot.instanceName, user, quiz);
          await nextQuiz(bot, user, ctx);
        } else if (user.state) {

          console.log("message")
          //SEND FROM USER IN BOT TO PUB CHANNEL
          // console.log("\n\non here2")
          if (user.state === 'chat') {
            // console.log("try to send: ", bot.getEnv().CHAT_CHANNEL, 'reply_to: ', user.resume_chat_id)
            
            try{
              const id = await sendMessageToUser(bot, { id: bot.getEnv().CHAT_CHANNEL }, { text }, {reply_to_message_id : user.resume_chat_id});

              await insertMessage(bot.instanceName, user, bot.getEnv().CHAT_CHANNEL, text, id, 'chat');

              await saveUser(bot.instanceName, user);
            } catch(e) {
              // ctx.reply();
            }
            // 
          } 
        } else {
          console.log("message2")
          await insertMessage(bot.instanceName, user, 'user', text);
        }
      }
    } else {
      if (ctx.update.message && ctx.update.message.is_automatic_forward == true && ctx.update.message.sender_chat){
          let union = await getUnion(bot.instanceName, ctx.update.message.forward_from_chat.id.toString())
          
          console.log("UNION: ", union, ctx.update.message.sender_chat.id, ctx.update.message.forward_from_chat.id)
          
          if (union){ //если словили пересылку из прикрепленного канала
            if(true){ //то нужно запомнить ID сообщения, чтоб отвечать в том же треде

              const buttons = [];
              if (union.type == 'goalsChannel'){
                // buttons.push(Markup.button.callback('проголосовать', 'vote'));
                // buttons.push(Markup.button.callback('совершить взнос', 'vote'));
                // const request = Markup.inlineKeyboard(buttons, { columns: 2 }).resize()
                // ctx.reply("Выберите действие: ", {reply_to_message_id : ctx.message.message_id, ...request})              
                ctx.reply("Инструкция: ", {reply_to_message_id : ctx.message.message_id})              
                
                await addMainChatMessageToGoal(bot.instanceName, ctx.update.message.forward_from_message_id, ctx.message.message_id)
              
              } else if (union.type == 'reportsChannel'){
                buttons.push(Markup.button.callback('принять', 'vote'));
                buttons.push(Markup.button.callback('отклонить', 'vote'));
                const request = Markup.inlineKeyboard(buttons, { columns: 2 }).resize()
                ctx.reply("Выберите действие: ", {reply_to_message_id : ctx.message.message_id, ...request})              
                await addMainChatMessageToReport(bot.instanceName, ctx.update.message.forward_from_message_id, {"report_chat_message_id":ctx.message.message_id})
              
              }
              
              console.log("ctx.update.message.forward_from_message_id: ", ctx.update.message.forward_from_message_id, ctx.message.message_id)

              // console.log("here!!!!!")
              
              await insertMessage(bot.instanceName, {id: "bot"}, "bot", text, ctx.message.message_id, 'autoforward', {forward_from_type: union.type, forward_from_channel_id: union.id, forward_from_message_id: ctx.update.message.forward_from_message_id});

              

              // const msg = await getMessage(bot.instanceName, ctx.update.message.reply_to_message.forward_from_message_id   || ctx.update.message.reply_to_message.message_id);
        
              // user = await getUserByResumeChannelId(bot.instanceName, ctx.update.message.forward_from_message_id)

              // if (user && !user.resume_chat_id){
              //   // console.log("catch forwarded messsage to chat: ", ctx.update.message.message_id)
              //   user.resume_chat_id = ctx.update.message.message_id
              //   await saveUser(bot.instanceName, user);  
              // }
              
            }
          }
        } else { //Или отправляем пользователю ответ в личку если это ответ на резюме пользователя
        
     }
   }
  

  });


  bot.action('createunion', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    
    await startQuiz(bot, ctx, user);
    await nextQuiz(bot, user, ctx);
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


  return null;
};
