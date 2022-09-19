const { Markup } = require('telegraf');
const axios = require('axios');
const { ChainsSingleton, generateAccount: generateUniAccount } = require('unicore');
const EosApi = require('eosjs-api');
const Octokit = require('@octokit/rest');

const { restoreAccount } = require('./restore');
const {
  mainButtons, backToMainMenu, demoButtons,
} = require('./utils/bot');

const {createChat, makeAdmin, createGroupCall, setDiscussionGroup, exportChatLink, makeChannelAdmin, insertUnion} = require('./mtproto')

const {
  getHelixParams,
  getUserHelixBalances,
  printHelixWallet,
  transferAction,
  getLiquidBalance,
  getOneUserHelixBalance,
  printWallet,
  printHelixStat,
  printPublicWallet,
  printUserBalances,
  withdrawAction,
  printHelixs,
  priorityAction,
  massWithdrawAction,
  printTail,
  getCurrentUserDeposit,
  getCondition,
  exitFromTail,
  goalWithdraw,
  retireAction,
  getGoalInstructions,
  printProjects
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
  editGoal,
  burnNow,
  setBenefactor,
  setTaskPriority,
  constructGoalMessage,
  constructTaskMessage,
  constructReportMessage,
  rvoteAction,
  editGoalMsg,
  fetchGoal
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
  saveHost,
  getHost,
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
  getTaskById,
  insertReport,
  addMainChatMessageToReport,
  getUserByUsername,
  insertWithdraw,
  updateWithdraw,
  getWithdraw,
  getUserByEosName,
  getChat,
  getProject,
  insertProject,
  getProjects
} = require('./db');

const { getDecodedParams } = require('./utils/utm');
const { parseTokenString } = require('./utils/tokens');


async function generateHost(bot, ctx, host) {
  return new Promise(async (resolve, reject) => {

    const generatedAccount = await generateUniAccount();

    host.eosname = generatedAccount.name;
    host.mnemonic = generatedAccount.mnemonic;
    host.wif = generatedAccount.wif;
    host.pub = generatedAccount.pub;
    
    const params = {
      tg_id: host.ownerId,
      username: host.eosname,
      active_pub: host.pub,
      owner_pub: host.pub,
      locale: 'ru',
      referer: host.ownerEosname, // referer
      callback: 'tg.me',
      type: 'guest',
      meta: {},
    };

    console.log('referer on register: ', params.referer, 'username: ', generatedAccount.name);
    
    try {
      const message = await axios.get(
        `${bot.getEnv().REGISTRATOR}/set`,
        {
          params,
        },
      );
      if (message.data.status == 'ok') {
        // TODO set partner info
        await saveHost(bot.instanceName, host);
        console.log("message.data: ", message.data)
        resolve(host)
      } else {
        // await saveHost(bot.instanceName, host);
        resolve()
        console.error(message);
        // await ctx.reply('Произошла ошибка при регистрации вашего аккаунта. Попробуйте позже.', Markup.removeKeyboard());
      }


    } catch (e) {
      console.log(e)
      
      ctx.reply(`Ошибка при создании DAO: ${e.message}`)
      resolve()

    }


  })

}



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
  const user = ctx.update.message.from.id || ctx.update.callback_query.from.id;
  const exist = await getUser(bot.instanceName, user);

  if (!exist || !exist.eosname) {
    await generateAccount(bot, ctx, false, '');
    return true;
  }

  return true;
}


const quizDefinition = [
  { message: 'Contacts' },
  { message: 'Как вас зовут?' },
  // { message: 'В чём хотели бы развиваться?' },
  { message: 'Расскажите о себе и/или пришлите профиль в любой соцсети' },
];


async function welcome(bot, ctx){
    
    await pushEducation(bot, ctx, 0);

};


async function pushEducation(bot, ctx, currentSlideIndex) {
  try{

    console.log("ctx: ", ctx)

  const slide = education.find((el, index) => Number(index) === Number(currentSlideIndex));
  console.log("SLIDE : ", slide)
  if (!slide) {
    try {
      // await ctx.editMessageText('Ознакомление завершено');
      await ctx.deleteMessage()
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
    let id 
    try {
      id = ctx.update.callback_query.message.chat.id
    } catch(e){
      id = ctx.update.message.chat.id 
    }
    
    let current_chat = await getUnion(bot.instanceName, (id).toString())
    
    
    if (currentSlideIndex + 1 === education.length){
      // buttons.push(Markup.button.callback('Назад', `pusheducation ${currentSlideIndex - 1}`));
      // buttons.push(Markup.button.callback('C начала', `pusheducation 0`)); 
      // buttons.push(Markup.button.url('Зачем это нужно', 'https://t.me/intellect_news/557'))
      // buttons.push(Markup.button.url('Как это работает', 'https://t.me/intellect_news/557'))
      // buttons.push(Markup.button.url('Условия для Агентов', 'https://intellect.run/c8d5400639914f39a54f1496fbe40dd9'))
      

      if (!current_chat)  
        buttons.push(Markup.button.callback('Создать DAO 🚀', `startunion`));
      
      
    } else {
      // buttons.push(Markup.button.url('Зачем это нужно', 'https://t.me/intellect_news/557'))
      // buttons.push(Markup.button.url('Как это работает', 'https://t.me/intellect_news/557'))
      // buttons.push(Markup.button.url('Условия', 'https://intellect.run/c8d5400639914f39a54f1496fbe40dd9'))
      // buttons.push(Markup.button.callback('Назад', `pusheducation ${currentSlideIndex - 1}`));
      // buttons.push(Markup.button.callback('Дальше', `pusheducation ${currentSlideIndex + 1}`)); 
      
      if (!current_chat)  
        buttons.push(Markup.button.callback('Создать DAO 🚀', `startunion`));
    }



    let text = '';
    text += `Создать DAO.`// [${currentSlideIndex + 1} / ${education.length}]`
    

    text += `\n\n${slide.text}`;
    
    if (currentSlideIndex === 0 && slide.img != "") {
      if (slide.img.length > 0) {
        
        await ctx.replyWithPhoto({ source: slide.img }, { caption: text, ...Markup.inlineKeyboard(buttons, { columns: 1 }).resize() });
      
      } else {

        await ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

      }    
    } else {

      try{

        await ctx.deleteMessage();  

      } catch(e){}
      
      if (slide.img.length > 0) {
        console.log("HERE3!")
        await ctx.replyWithPhoto({ source: slide.img }, { caption: text, ...Markup.inlineKeyboard(buttons, { columns: 1 }).resize() });
      } else {
        console.log("HERE4!")
        await ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
      }
    }
  }
} catch(e){
    console.log(e)
    ctx.reply(`error 2: ${e.message}`)
  }
}


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

  await insertMessage(bot.instanceName, user, user.id, 'Получил вопросы');

  const buttons = [Markup.button.contactRequest('Поделиться контактом')];
  const request = Markup.keyboard(buttons, { columns: 1 }).resize();
  return ctx.reply('Я ваш проводник в DAO Коллективного Разума.\n\nПожалуйста, поделитесь номером телефона для продолжения знакомства.', request);

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

      await ctx.reply(q.message, clearMenu, { reply_markup: { remove_keyboard: true } });//, clearMenu, 
    }

    await saveQuiz(bot.instanceName, user, quiz);
  } else {
    quiz.is_finish = true;
    await saveQuiz(bot.instanceName, user, quiz);
    user.state = ""
    let unionName = quiz.answers[1].answer
    let id = await ctx.reply("Пожалуйста, подождите. Мы регистрируем DAO для вас, это может занять несколько секунд.")
    
    let chatResult = await createChat(bot, user, user.eosname, unionName, "union")
    chatResult = {chatLink: "https://google.com", chatId: "-1001618007293"}
    const icomeMenu = Markup
      .keyboard(mainButtons, { columns: 2 }).resize();
   
    let t1 = '';
    t1 += `\nУчастники этого чата получили возможность создавать и достигать совместные цели. Попробуйте! Для создания цели напишите сообщение с тегом #goal в этом чате.\n`
    
    t1 += `\nПоказать это сообщение: /help,`
    // t += `\nСоздать проект: напишите сообщение с тегом #project`
    // t += `\nСовершить взнос: /donate,`
    t1 += `\nКапитализация DAO: /stat,`
    t1 += "\nВаш кошелёк: /wallet,"
    
    const id2 = await sendMessageToUser(bot, { id: '-100' + chatResult.chatId }, { text: t1 });

    const buttons = [];

    buttons.push(Markup.button.url('🏫 войти', chatResult.chatLink));
    const t = 'Войдите в ваше DAO и получите инструкции:';
    ctx.reply(t, Markup.inlineKeyboard(buttons, { columns: 1 }).resize())

    k = 0
    let text = ``
    //`${quiz.answers[1].answer}, `
    // text += `${quiz.answers[2].answer}, `
    text += `+${quiz.answers[0].answer.phone_number  || quiz.answers[0].answer}, @${user.username} [${user.eosname}]\n`
    
    for (const answer of quiz.answers) {
      if (k > 0) {
        text += `\n${answer.message}`
        text += `\n${answer.answer}\n`
      }
      k++
    }

    let id3 = await sendMessageToUser(bot, {id : bot.getEnv().CV_CHANNEL}, { text: text });

    await insertMessage(bot.instanceName, user, bot.getEnv().CV_CHANNEL, text, id3, 'CV');    


    user.state = "chat"
    user.resume_channel_id = id3
    console.log("TEXT: ", text)   
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

  if (bot.getEnv().GITHUB_TOKEN) {
    bot.octokit = new Octokit({
      auth: bot.getEnv().GITHUB_TOKEN,
    });
  }

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

        const menu = Markup
          .keyboard(mainButtons, { columns: 2 }).resize();

      
        // buttons.push(Markup.button.callback('🆕 создать союз', `createunion`));
        const clearMenu = Markup.removeKeyboard();
        
        // buttons.push(Markup.button.callback('каталог союзов', `listunion`));
        // buttons.push(Markup.button.callback('лента союзов', `newsunion`));

        // await ctx.reply(`Добро пожаловать в Децентрализованное Автономное Сообщество.\n\n`, clearMenu, { reply_markup: { remove_keyboard: true } });


        let t = 'Добро пожаловать.\n\n';
        await ctx.reply(t, clearMenu);

        await startQuiz(bot, ctx, user);

        //TODO UNCOMMENT IT
        // await ctx.reply('\n\nЭтот робот создаёт DAO. \nИнструкция: ', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
  
        

      }
    } else {
      console.log("ctx.update.message", ctx.update.message)
      let user = await getUser(bot.instanceName, ctx.update.message.from.id);

      let chatId = ctx.message.chat.id
      let userId = ctx.update.message.from.id

      //TODO запуск WELCOME
      // let res = await ctx.getChatAdministrators()
      // console.log(res)

      // let res2 = await ctx.getChat()
      
      // await welcome(bot, ctx)
     
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


  bot.hears('🤝 мои союзы', async (ctx) => {
    await getUser(bot.instanceName, ctx.update.message.from.id);
    await checkForExistBCAccount(bot, ctx);

    const buttons = [];

    buttons.push(Markup.button.callback('🆕 добавить союз', `createunion`));

    ctx.reply('Союз - это цифровое объединение людей в чате с копилкой. Копилки пополняются из разных направлений и распределяется по фондам союзов и их партнёров. Партнёр - это участник, принявший кодекс и принятый в систему на равных правах со всеми партнёрами системы. Каждый участник союза - это партнёр всех союзов.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
  });




  bot.hears('🪙 кошелёк', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    // if (ctx.update.message.chat.type === 'private') {
      await printWallet(bot, user);
    // } 

  });


  function getHashtags(message) {
    const { text, entities } = message;
    const result = [];

    if (entities) {
      entities.forEach((entity) => {
        if (entity.type === 'hashtag') {
          const tag = text.substring(entity.offset + 1, entity.offset + entity.length).replace(/\s/g, '');
          const [tagHead, id] = tag.split('_');
          result.push({ tag: tagHead, id });
        }
      });
    }

    return result;
  }

  function cutTags(botInstance, text, tags) {
    let newText = text;
    for (const tag of tags) {
      let tmp = `#${tag.tag}`;
      if (tag.id) {
        tmp = `${tmp}_${tag.id}`;
      }
      newText = newText.replace(new RegExp(tmp, 'g'), '').replace(/\s\s+/g, ' ');
    }

    newText = newText.replace(new RegExp(`@${botInstance.getEnv().BOTNAME}`, 'g'), '');
    return newText.trim();
  }

async function finishEducation(ctx, id) {
    
    const icomeMenu = Markup
    .keyboard(mainButtons, { columns: 2 }).resize();
   
    let t = '';
    t += `\nУчастники этого чата получили возможность создавать и достигать совместные цели. Попробуйте! Для создания цели напишите сообщение с тегом #goal в этом чате.\n`
    
    t += `\nПоказать это сообщение: /help,`
    // t += `\nСоздать проект: напишите сообщение с тегом #project`
    // t += `\nСовершить взнос: /donate,`
    t += `\nКапитализация DAO: /stat,`
    t += "\nВаш кошелёк: /wallet,"
    
    if (id){
      
      const id = await sendMessageToUser(bot, { id }, { text:t });

    } else {
      await ctx.replyWithHTML(t);  
    }
    //Ваша интеллектуальная собственность: /iam,\n
    
  
}

  bot.action(/pusheducation (\w+)/gi, async (ctx) => {
    const currentSlideIndex = Number(ctx.match[1]);
    await pushEducation(bot, ctx, currentSlideIndex);
  });

  bot.command('make_me_admin', async(ctx) => {
    console.log("on start union", ctx)
    let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())

    await makeChannelAdmin(bot, current_chat.id, ctx.update.message.from.id, ctx, "-1001598098546")

  })

  bot.command('list', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);

    let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
    if (current_chat){
      console.log('current_chat: ', current_chat)
      let projects = await getProjects(bot.instanceName, user.id)
      console.log(projects)
      let text = `Проекты DAO ${current_chat.unionName}:\n`

      for (const project of projects) {
        text += `#${project.projectCount}: <a href='${project.link}'>${project.unionName}</a>`
      }

      await ctx.replyWithHTML(text)
    } else {
      console.log('LiST current chat is not found')
    }
  });

  bot.command('create_dao', async (ctx) => {
    // finishEducation(ctx)
    await pushEducation(bot, ctx, 0);
  });

  bot.command('welcome', async (ctx) => {
    finishEducation(ctx)
    // await pushEducation(bot, ctx, 0);
  });

  bot.command('help', async (ctx) => {
    finishEducation(ctx)
    // await pushEducation(bot, ctx, 0);
  });


  bot.command(`create_union`, async (ctx) => {

    await startUnion(bot, ctx)

  })


async function upgradeHost(eos, target_host, host) {

        console.log("TARGET HOST: ", target_host, host)

        return eos.transact({ 
          actions: [
          {
            account: "unicore",
            name: 'upgrade',
            authorization: [{
              actor: target_host,
              permission: 'active',
            }],
            data: host
          }]
        }, {
          blocksBehind: 3,
          expireSeconds: 30,
        })

}


async function setParamsToHost(eos, target_host, host) {
      console.log("set params", host)
      return  eos.transact({ 
          actions: [
          {
            account: "unicore",
            name: 'setparams',
            authorization: [{
              actor: target_host,
              permission: 'active',
            }],
            data: host
          }]
        }, {
          blocksBehind: 3,
          expireSeconds: 30,
        })

}



async function startHost(eos, target_host, host) {
      console.log("start host")
      
        return eos.transact({ 
          actions: [
          {
            account: "unicore",
            name: 'start',
            authorization: [{
              actor: target_host,
              permission: 'active',
            }],
            data: {
              host: target_host,
              chost: target_host
            }
          }]
        }, {
          blocksBehind: 3,
          expireSeconds: 30,
        })

}


async function setupHost(bot, ctx, eosname, wif, chat) {
    
    try{
      console.log("before start")
      const eos = await bot.uni.getEosPassInstance(wif);

      let helix = {
          host: eosname,
          chost: eosname,
          size_of_pool: 10000,
          quants_precision: 1000000,
          overlap: 20000,
          profit_growth: 10000, 
          base_rate: 100,
          loss_percent: 1000000,
          compensator_percent: 0,
          pool_limit: 20,
          pool_timeout: 259200,
          priority_seconds: 0,
          
        }

      let host = {
          username: eosname,
          platform: eosname,
          title: chat.title,
          purpose: "",
          total_shares: 0,
          quote_amount: "0.0000 FLOWER",
          root_token: "0.0000 FLOWER",
          root_token_contract: "eosio.token",
          consensus_percent: 0,
          gtop: 0,
          emission_percent: 0,
          referral_percent: 250000,
          dacs_percent: 250000,
          cfund_percent: 250000,
          hfund_percent: 250000,
          quote_token_contract: "eosio.token",
          voting_only_up: false,
          levels: [1000000],
          meta: JSON.stringify({})
        }

      let upgrade_res = await upgradeHost(eos, eosname, host)
      let setparams_res = await setParamsToHost(eos, eosname, helix)
      let start_res = await startHost(eos, eosname, eosname)
    } catch(e){
      ctx.reply(`ошибка при запуске союза, обратитесь в поддержку с сообщением: ${e.message}`)
      console.log(e.message)
    }

}

  async function startUnion(bot, ctx){
    console.log("on start Union", ctx)

    let res = await ctx.getChatAdministrators()
    // console.log(res)
    let bot_is_admin = false


    res.map(user => {
      console.log("user.user.username", user.user.username)
      console.log("botname: ", bot.getEnv().BOTNAME)

      if (user.user.username == bot.getEnv().BOTNAME){
        bot_is_admin = true
      }
    })

    if (!bot_is_admin) {
      ctx.reply(`Для создания DAO в чате робот @${bot.getEnv().BOTNAME} должен быть назначен администратором.`)
    } else {

      //CHECK union for exist in current chat

      let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
      
      console.log("current_union: ", current_chat, ctx.chat.id)
      
      if (current_chat){
        await ctx.reply(`DAO уже активно в этом чате. Показать команды: /help`)
      } else {
        let user = await checkAccountForExist(bot, ctx, ctx.from)
        console.log("IT IS USER: ", user)
        //TODO make a host
        if (user) {
          let type = "union"
          let chat = await ctx.getChat()
          
          try {
            
            let host = {
              ownerId: user.id,
              ownerEosname: user.eosname, 
              chatId: chat.id.toString(),
              chatLink: chat.invite_link,
            }

            host = await generateHost(bot, ctx, host);
            console.log("GENERATED HOST: ", host)
            if (host){

              await insertUnion(bot.instanceName, {
                ownerId: user.id,
                ownerEosname: user.eosname, 
                host: host.eosname,
                id: chat.id.toString(),
                type: type + 'Chat', 
                unionName: chat.title,
                link: chat.invite_link,
              })

              await setupHost(bot, ctx, host.eosname, host.wif, chat)

              await ctx.reply(`DAO успешно создано в этом чате.`)
              await finishEducation(ctx)
            } else {
              await ctx.reply(`Произошла ошибка при регистрации DAO, попробуйте повторить позже.`)
            }
      
          } catch(e){
            ctx.reply(`Ошибка при регистрации DAO, обратитесь в поддержку с сообщением: ${e.message}`)
          }

        } else {
          ctx.reply(`Ошибка при регистрации DAO, обратитесь в поддержку.`)
        }
        
      
      }

      
      
      // ctx.reply(`@${bot.getEnv().BOTNAME} готов к запуску DAO. `)
      
      // console.log('ctx.from', ctx.from)
      
      // let user = await getUser(bot.instanceName, from.id);
      // console.log('user: ', user)
      /* Регистрация DAO в бч и бд
       * Одно DAO = 1 аккаунт
       * Проверка запускающего пользователя на наличие аккаунта в бч, если нет - создать
       * 
      */
    }
  }

  async function checkAccountForExist(bot, ctx, from){
    let user = await getUser(bot.instanceName, from.id);
    
    try {

      if (!user) {
        // await ctx.reply(`Регистрируем аккаунт в блокчейне для администратора`)

        user = from;
        user.eosname = await generateAccount(bot, ctx, false, "", user);

        await saveUser(bot.instanceName, user)
        await ctx.deleteMessage()
        // await ctx.reply(`Регистрация завершена`)
        return user
      } else {

        return user
      }

    } catch(e){
      ctx.reply(`error: ${e.message}`)
      console.log(e)
      return
    }
    
  }

  bot.action('startunion', async(ctx) => {
    // console.log("on start union", ctx)
    await startUnion(bot, ctx)
  })

  bot.action('finisheducation', async (ctx) => {
    await finishEducation(ctx);
  });

  bot.command("stat", async(ctx) => {
    await checkForExistBCAccount(bot, ctx);
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    
    let current_chat = await getUnion(bot.instanceName, (ctx.update.message.chat.id).toString())
    if (!current_chat){
      ctx.reply(`Чат не является DAO. Для запуска нажмите кнопку: /start`)
      return
    }
    if (user)
      await printHelixStat(bot, user, current_chat.host, ctx);
    else ctx.repy("Пользователь не зарегистрирован")
  })

  // async function printAbout(bot, ctx){
  //   await ctx.reply(`DAO создано`)
  // }

  // bot.command("about", async(ctx) => {
  //   printAbout()
  // })


  bot.command("iam", async(ctx) => {
    await checkForExistBCAccount(bot, ctx);
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    
    let current_chat = await getUnion(bot.instanceName, (ctx.update.message.chat.id).toString())
    if (!current_chat){
      ctx.reply(`Чат не является DAO. Для запуска нажмите кнопку: /start`)
      return
    }

    if (user)
      await printPublicWallet(bot, user, current_chat.host, ctx);
    else ctx.reply("Пользователь не зарегистрирован")
  })


  bot.command("wallet", async(ctx) => {
    await checkForExistBCAccount(bot, ctx);
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    
    let current_chat = await getUnion(bot.instanceName, (ctx.update.message.chat.id).toString())

    if (!current_chat){
      return ctx.reply(`Союз не найден`)
    }

    if (user)
      await printWallet(bot, user, ctx, current_chat.host || 'core');
    else ctx.reply("Пользователь не зарегистрирован")
  })


  bot.command("helix", async(ctx) => {
    await checkForExistBCAccount(bot, ctx);
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    let current_chat = await getUnion(bot.instanceName, (ctx.update.message.chat.id).toString())
    if (!current_chat){
      ctx.reply(`Чат не является DAO. Для запуска нажмите кнопку: /start`)
      return
    }
    if (user)
      await printHelixWallet(bot, ctx, user, current_chat.host);
    else ctx.reply("Пользователь не зарегистрирован")
  })



  bot.command("withdraw", async(ctx) => {
    await checkForExistBCAccount(bot, ctx);
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    let current_chat = await getUnion(bot.instanceName, (ctx.update.message.chat.id).toString())
    if (!current_chat){
      ctx.reply(`Чат не является DAO. Для запуска нажмите кнопку: /start`)
      return
    }

    if (ctx.update.message.reply_to_message){
      goal = await getGoalByChatMessage(bot.instanceName, current_chat.host, ctx.update.message.reply_to_message.forward_from_message_id)
      if (!goal){
        
        ctx.reply("Цель не найдена", {reply_to_message_id: ctx.update.message.message_id})

      } else {
        console.log("GOAL:", goal, user.eosname)
        // if (goal.benefactor != user.eosname) {

        //   await ctx.reply("Только координатор может получить донат из цели.", {reply_to_message_id: ctx.update.message.message_id})
        
        // } else {

          try{

            await goalWithdraw(bot, ctx, user, goal)
            await editGoalMsg(bot, ctx, user, goal.host, goal.goal_id, true)

            await ctx.reply(`Вывод баланса в кошелёк координатора произведён успешно.`, {reply_to_message_id: ctx.update.message.message_id})    

          } catch(e){

            await ctx.reply(`Ошибка: ${e.message}`, {reply_to_message_id: ctx.update.message.message_id})    
          
          // }
          
        }

      }
    } 
  })

 bot.command("donate", async(ctx) => {
    let msg_id = (await ctx.reply("Пожалуйста, подождите", {reply_to_message_id: ctx.update.message.message_id})).message_id

    await checkForExistBCAccount(bot, ctx);
    
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    let goal
    
    let current_chat = await getUnion(bot.instanceName, (ctx.update.message.chat.id).toString())
    if (!current_chat){
      ctx.reply(`Чат не является DAO. Для запуска нажмите кнопку: /start`)
      return
    }

    if (ctx.update.message.reply_to_message){
      goal = await getGoalByChatMessage(bot.instanceName, current_chat.host, ctx.update.message.reply_to_message.forward_from_message_id)
      
    } 

    if (!ctx.update.message.reply_to_message || !goal) {
      // let exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "goalsChannel")

      await ctx.reply("Совершить взнос можно только в обсуждениях цели. ", {reply_to_message_id: ctx.update.message.message_id})
      await ctx.deleteMessage(msg_id)
      return
    }
    
    // console.log("donate", ctx.update.message.reply_to_message)
    // console.log(goal)

    let exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "unionChat")
    if (exist){
      let address
      if (user)
        address = await getAddress(bot, user, ctx, exist.host, exist.id, "USDT.TRC20", "donate", {goal_id: goal.goal_id});
      else ctx.reply("Пользователь не зарегистрирован", {reply_to_message_id: ctx.update.message.message_id})

      if (address) {
        ctx.reply(`Персональный адрес для взноса в USDT (TRC20):\n${address}`, {reply_to_message_id: ctx.update.message.message_id})
      }

      await ctx.deleteMessage(msg_id)
    }
    
    
  })


  async function getMaxWithdrawAmount(bot, user, ctx) {
    const liquidBal = await getLiquidBalance(bot, user.eosname, bot.getEnv().SYMBOL);
    const balances = await getUserHelixBalances(bot, bot.getEnv().CORE_HOST, user.eosname);
    
    const min = `${(2 / parseFloat(1)).toFixed(0)} ${bot.getEnv().SYMBOL}`;
    const max = `${(((parseFloat(balances.totalBalances) + parseFloat(liquidBal)) * parseFloat(1)) / parseFloat(1)).toFixed(4)} ${bot.getEnv().SYMBOL}`;
    
    return {min, max}

  }


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


  async function getAddress(bot, user, ctx, host, unionchat, currency, type, meta) {
    try{
      
      let params = {
        username: user.eosname,
        currency: currency,
        hostname: host,
        chat: {
          union_chat_id: unionchat,
          reply_to_message_id: ctx.update.message.reply_to_message.message_id,
          reply_to_message_chat_id: ctx.update.message.reply_to_message.chat.id,
          goal_message_id: ctx.update.message.reply_to_message.forward_from_message_id,
          goal_channel_id: ctx.update.message.reply_to_message.forward_from_chat.id
        },
        type: type,
        meta: meta
      }

      let path = `${bot.getEnv().PAY_GATEWAY}/generate`
      
      const result = await axios.post(
        path,
        params
      );
      
      if (result.data.status === 'ok')
        return result.data.address
      else {
        ctx.reply("Произошла ошибка на получении адреса. Попробуйте позже. ", {reply_to_message_id: ctx.update.message.message_id})
      }

    } catch(e){
      console.log(e)
      ctx.reply("Произошла ошибка на получении адреса. Попробуйте позже. ", {reply_to_message_id: ctx.update.message.message_id})
    }
    
  }

  bot.command("set_priority", async(ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
  
    //TODO only architect can set CURATOR!

    let current_chat = await getUnion(bot.instanceName, (ctx.update.message.chat.id).toString())
    if (!current_chat){
      ctx.reply(`Чат не является DAO. Для запуска нажмите кнопку: /start`)
      return
    }

    console.log("on set_priority", ctx.update.message)
    let text = ctx.update.message.text
    let entities = ctx.update.message.entities
    let priority = 0

    entities.map(entity => {
      if (entity.type == 'bot_command')
        priority = parseInt((text.substr(entity.offset + entity.length, text.length).replace(' ', '')))
    })

    console.log('priority: ', priority)

    //TODO get task from message
    //if not task - return
    let task = await getTaskByChatMessage(bot.instanceName, current_chat.host, ctx.update.message.reply_to_message.message_id)
    console.log("TASK: ", task)
    if (!task){
        ctx.reply("Действие не найдено. Для установки приоритета воспользуйтесь командой /set_coordinator PRIORITY_NUM, где PRIORITY_NUM - число от 1 до 3. Сообщение должно быть ответом на действие, приоритет которого изменяется.", {reply_to_message_id: ctx.update.message.message_id})
    
    } else {
     if (!priority){
        ctx.reply("Для установки приоритета воспользуйтесь командой /set_coordinator PRIORITY_NUM, где PRIORITY_NUM - число от 1 до 3. Сообщение должно быть ответом на действие, приоритет которого изменяется.", {reply_to_message_id: ctx.update.message.message_id})
      } else {
        
        let current_chat = await getUnion(bot.instanceName, (ctx.update.message.chat.id).toString())
        // let goal = await getGoalByChatMessage(bot.instanceName, current_chat.host, ctx.update.message.reply_to_message.forward_from_message_id)
        // console.log("goal", goal)
        // let curator_object = await getUserByUsername(bot.instanceName, curator)

        if (current_chat && task) {
          console.log("ON HERE")
          try {
            // await setBenefactor(bot, ctx, user, current_chat.host, goal.goal_id, curator_object.eosname)
            await setTaskPriority(bot, ctx, user, current_chat.host, task.task_id, priority)
            await ctx.deleteMessage(ctx.update.message.message_id)
            let tprior = (priority == 0 || priority == 1) ? "10 $/час" : ((priority == 2) ? "20 $/час" :"40 $/час")
            await ctx.reply(`Координатор установил ставку действия: ${tprior}`, {reply_to_message_id: ctx.update.message.reply_to_message.message_id})
         
          } catch(e){
            console.log(e)
            await ctx.reply(`Ошибка: ${e.message}`,{reply_to_message_id: ctx.update.message.reply_to_message.message_id})
          }
          
        } else {

        }
      }
    }
   
  })



  bot.command("set_coordinator", async(ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
  
    //TODO only architect can set CURATOR!

    console.log("on set curator", ctx.update.message)
    let text = ctx.update.message.text
    let entities = ctx.update.message.entities
    let curator = ""

    entities.map(entity => {
      if (entity.type == 'mention')
        curator = (text.substr(entity.offset + 1, entity.length).replace(' ', ''))
    })


    if (curator == ""){
      ctx.reply("Для установки куратора отметьте пользователя командой /set_coordinator @telegram_username", {reply_to_message_id: ctx.update.message.message_id})
    } else {
      
      let current_chat = await getUnion(bot.instanceName, (ctx.update.message.chat.id).toString())
      let goal = await getGoalByChatMessage(bot.instanceName, current_chat.host, ctx.update.message.reply_to_message.forward_from_message_id)
      
      let curator_object = await getUserByUsername(bot.instanceName, curator)

      if (current_chat && goal && curator_object) {
        console.log("ON HERE")
        try {
          await setBenefactor(bot, ctx, user, current_chat.host, goal.goal_id, curator_object.eosname)
          await ctx.deleteMessage(ctx.update.message.message_id)
          await ctx.reply(`У цели появился новый координатор: @${curator}`, {reply_to_message_id: ctx.update.message.reply_to_message.message_id})
        } catch(e){
          console.log(e)
          await ctx.reply(`Ошибка: ${e.message}`,{reply_to_message_id: ctx.update.message.reply_to_message.message_id})
        }
        
      } else {

      }
    }
  })

  bot.on('edited_message', async (ctx) => {
    // console.log('edited_message', ctx.update.edited_message)
    // console.log("edited_chat_id: ", ctx.update.edited_message.forward_from_chat.id)

    // let user = await getUser(bot.instanceName, ctx.update.edited_message.forward_from_chat.id);
    if (ctx.update.edited_message.forward_from_chat){
      let current_chat = await getUnion(bot.instanceName, (ctx.update.edited_message.forward_from_chat.id).toString())
      // console.log("current_chat: ", current_chat)
      if (current_chat){
        // console.log(true)
        let goal = await getGoalByChatMessage(bot.instanceName, current_chat.host, ctx.update.edited_message.forward_from_message_id)
        console.log(goal)
        if (goal) {
          // console.log("true", true)
          let trueGoal = await fetchGoal(bot, goal.host, goal.goal_id)
          // console.log("trueGoal:", trueGoal)
          if (trueGoal){
            // console.log(true)
            let editor = await getUserByEosName(bot.instanceName, trueGoal.creator)
            // console.log()
            if (editor){
              try {
                let text = ctx.update.edited_message.text
                console.log("text on edit1: ", text)
                let index1 = text.indexOf("\n");

                text = text.substr(index1 + 1, text.length)
                console.log("text on edit1: ",  index1, text)
                let index2 = text.indexOf("\n\nОдобрена: ");

                text = text.substr(0, index2)
                console.log("text on edit1: ",  index2, text)

                
                await editGoal(bot, ctx, editor, {
                  editor: trueGoal.creator,
                  id: trueGoal.id,
                  hostname: goal.host, 
                  title: text,
                  description: "",
                  meta: {},
                })
                console.log("scucss edit: ", text)
                
              } catch(e){
                console.log(e)
                
              }
              
            } else {
              // console.log("no")
            }
            
          }
        } else {

          console.log("not find the goal")
        }
      } else {
        console.log("not find the chat")
      }
    }
    
  });

// bot.on('edited_channel_post', async (ctx) => {
//     console.log('edited_channel_post')
//     console.log(ctx)
    
//   });

  
  
  bot.on('message', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    console.log('catch user', user);

    // await checkForExistBCAccount(bot, ctx);
    console.log(ctx.update)
    let { text } = ctx.update.message;

    const tags = getHashtags(ctx.update.message);

    if (tags.length > 0) {
      text = cutTags(bot, text, tags);
    }

    console.log("MESSAGE:", ctx.update.message)
    console.log("TAGS:", tags)
    console.log("TEXT AFTER CUT: ", text)
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


          } else if (tags.length > 0) {
            for (const tag of tags) {
              if (tag.tag === 'project'){
                
                let gexist = tags.find(el => el.tag == 'goal')
                
                if (!gexist) {

                  let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                 
                  if (!current_chat){
                    ctx.reply(`Чат не является DAO. Для запуска нажмите кнопку: /start`)
                    return
                  }

                  if (current_chat.ownerId != user.id){
                    await ctx.reply(`Только организатор союза может создавать проекты сейчас.`)
                    return
                  }

                  if (text.length >= 100){
                    await ctx.reply(`Название проекта должно быть меньше 100 символов.`)
                    return
                  } 

                  const id = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: "Пожалуйста, подождите, мы создаём канал проекта." });
                  let goalChatResult = await createChat(bot, user, current_chat.host, current_chat.unionName, "project")
                  

                  let goal = {
                    hostname: current_chat.host,
                    title: text,
                    description: "",
                    target: "0.0000 FLOWER",
                    parent_id: 0,
                  }

                  goal.goalId = await createGoal(bot, ctx, user, goal)

                  await insertGoal(bot.instanceName, {
                    host: current_chat.host,
                    title: text,
                    goal_id: goal.goalId,
                    type: 'project',
                    // channel_message_id: goalMessageId,
                    channel_id: goalChatResult.channelId
                  })


                  await insertProject(bot.instanceName, {
                    host: current_chat.host,
                    channelLink: goalChatResult.channelLink,
                  })

                  await ctx.deleteMessage(id);  
                  
                  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
                  await sleep(3000)

                  await ctx.reply(`Проект создан: ${goalChatResult.channelLink}`, {reply_to_message_id: ctx.update.message.message_id})


                } else {
                  console.log("NOT INSIDE!", tags.indexOf('goal') == -1)
                }

              } else if (tag.tag === 'report'){

                let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                if (!current_chat){
                  ctx.reply(`Чат не является DAO. Для запуска нажмите кнопку: /start`)
                  return
                }
                console.log("on report!")
                if (ctx.update.message.reply_to_message || tag.id){
                  
                  try {
                    let task
                    let reply_to

                    console.log("TEXT: ", text)
                    let [duration, ...data] = text.split(',');
                    data = data.join(',').trim();
                    duration = duration.replace(/[^0-9]/g, '');
                    duration = Number(duration);

                    if ((!duration && duration !== 0) || !data)
                    {
                      await ctx.reply("Неверный формат отчёта! Инструкция: ", {reply_to_message_id: ctx.update.message.message_id})
                      return
                    }

                    if (tag.id){
                      task = await getTaskById(bot.instanceName, current_chat.host, tag.id)
                      
                    } else {
                      task = await getTaskByChatMessage(bot.instanceName, current_chat.host, ctx.update.message.reply_to_message.message_id)

                    }
                    
                    reply_to = task.chat_message_id
                    
                    console.log("RECIEVE REPORT!")
                    console.log("TASK:", task)

                    if (!task){

                      exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "goalsChannel")
                  
                      ctx.reply(`Ошибка! Поставка отчётов к действиям доступна только в обсуждениях конкретной цели как ответ на конкретное действие. Канал целей: ${exist.link}`, {reply_to_message_id: ctx.update.message.message_id})
                  
                    } else {

                      try{

                         console.log("CURRENT_CHAT: ", current_chat)
                          
                          // let duration = 1 //час
                          let asset_per_hour = "0.0000 FLOWER"

                          let reportId = await createReport(bot, ctx, user, {
                            host: current_chat.host,
                            username: user.eosname,
                            task_id: task.task_id,
                            data: data,
                            duration_secs: 60 * duration, 
                            asset_per_hour: asset_per_hour
                          })

                          await insertReport(bot.instanceName, {
                            host: current_chat.host,
                            username: user.eosname,
                            data: text,
                            report_id: reportId,
                            task_id: task.task_id,
                            goal_id: task.goal_id,
                            goal_chat_message_id: ctx.update.message.message_id,
                            // report_channel_message_id: reportMessageId
                          })


                          let new_text = await constructReportMessage(bot, current_chat.host, null, reportId)

                          // let new_text = ""
                          // new_text += `Деятель: ${user.eosname}\n`
                          // new_text += `Затрачено: ${duration} ч.\n`
                          // new_text += `За час: ${asset_per_hour}\n\n`
                          // new_text += `Отчёт: ${text}`

                          // let text2 = cutEntities(text, tags)
                          const buttons = [];
                          console.log("rvote", reportId)
                          buttons.push(Markup.button.callback('👍 (0)', `rvote ${current_chat.host} ${reportId}`));
                          
                          const request = Markup.inlineKeyboard(buttons, { columns: 1 }).resize()
                          

                          await ctx.reply(new_text, {reply_to_message_id: reply_to, ...request})
                          // await sendMessageToUser(bot, {id: current_chat.id}, { text });

                          await ctx.deleteMessage(ctx.update.message.message_id)
                          
                          // ctx.reply("Отчёт принят и ожидает утверждения", {reply_to_message_id: ctx.update.message.message_id})

                        // }

                      } catch(e) {
                        console.error(e)
                        if (e.message == 'assertion failure with message: Task is not regular, but report is exist')
                          ctx.reply(`У вас уже есть отчёт по этому действию. `, {reply_to_message_id: ctx.update.message.message_id})
                        else
                          ctx.reply(`Ошибка при создании отчёта. Сообщение: ${e.message}`, {reply_to_message_id: ctx.update.message.message_id})
                        
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

              } else if (tag.tag === 'task'){

                let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                if (!current_chat){
                  ctx.reply(`Чат не является DAO. Для запуска нажмите кнопку: /start`)
                  return
                }

                // buttons.push(Markup.button.callback('голосовать', ' vote'));
                
                // buttons.push(Markup.button.callback('😁', 'vote'));
                // buttons.push(Markup.button.callback('👍', 'vote'));
                // buttons.push(Markup.button.callback('🔥', 'vote'));
                
                // const request = Markup.inlineKeyboard(buttons, { columns: 3 }).resize()
                console.log("ON TASK")
                let task_id
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
                    console.log("ctx.update.message.reply_to_message.message_id: ",ctx.update.message)
                    let goal = await getGoalByChatMessage(bot.instanceName, current_chat.host, ctx.update.message.reply_to_message.forward_from_message_id)
                    console.log("GOAL:", goal)
                    let task = {
                      host: current_chat.host,
                      creator: user.eosname,
                      permlink: "",
                      goal_id: goal.goal_id, //TODO!
                      priority: 1,
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

                    }
                    task_id = await createTask(bot, ctx, user, task)
                    task.id = task_id
                    // text += '\nсоздатель: ' + user.eosname
                    // text += `\nдеятель: -`
                    // const buttons = [];

                     const buttons = [];
                
                    buttons.push(Markup.button.switchToCurrentChat('создать отчёт', `#report_${task_id} ЗАМЕНИТЕ_НА_ЗАТРАЧЕННОЕ_ВРЕМЯ_В_МИНУТАХ, ЗАМЕНИТЕ_НА_ТЕКСТ_ОТЧЁТА`));
                    const request = Markup.inlineKeyboard(buttons, { columns: 1 }).resize()
                    // console.log("before C")
                    let task_text = await constructTaskMessage(bot, current_chat.host, task)

                    let chat_message_id = (await ctx.reply(task_text, {reply_to_message_id: ctx.update.message.message_id, ...request})).message_id //

                    await insertTask(bot.instanceName, {
                      host: current_chat.host,
                      task_id,
                      goal_id: goal.goal_id,
                      title: text,
                      chat_id: ctx.update.message.chat.id,
                      goal_message_id: ctx.update.message.reply_to_message.message_id,
                      chat_message_id: chat_message_id,
                    })

                    await ctx.deleteMessage(ctx.update.message.message_id)

                    //TODO insert task
                    await insertMessage(bot.instanceName, user, user.id, text, chat_message_id, 'report', {chatId: ctx.update.message.chat.id, task_id: task_id, goal_id: goal.goal_id});//goalId: goal.goalId, 


                  } catch(e) {
                    ctx.reply(e.message,{reply_to_message_id: ctx.update.message.message_id})
                  }

                  // let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                  // console.log("CURRENT_CHAT: ", current_chat)
 
                  // if (current_chat){
                  //   let exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "tasksChannel")
                     
                  //   if (!exist){
                  //     exist = await getUnionByType(bot.instanceName, user.eosname, "unionChannel")
                      
                  //     if (exist){
                  //       const id = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: "Пожалуйста, подождите, мы создаём канал для действий союза" });
                  //       let tasksChatResult = await createChat(bot, user, exist.unionName, "tasks")
                  //       await ctx.deleteMessage(id);  
                  //       const id2 = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: `Канал действий создан: ${tasksChatResult.channelLink}` });
                  //       exist = {id : "-100" + tasksChatResult.channelId}
                  //     }

                  //   }

                  //   // if (!exist) {
                  //   //   // const id = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: "Пожалуйста, подождите, мы создаём канал для действий союза" });
                  //   //   let tasksChatResult = await createChat(bot, user, current_chat.unionName, "tasks")
                       
                  //   //   // const id2 = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: `Канал действий создан: ${tasksChatResult.channelLink}` });
                  //   //   exist = {id : "-100" + tasksChatResult.channelId}
                  //   // }
                  //   if (exist){
                  //     const taskMessageId = await sendMessageToUser(bot, {id: exist.id}, { text });
                  //     await insertMessage(bot.instanceName, user, user.id, text, taskMessageId, 'task', {chatId: exist.id});//goalId: goal.goalId, 
                  //   }

                    
                  // }

                } else {
                  // let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                
                  exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "goalsChannel")
                  
                
                  ctx.reply(`Ошибка! Постановка действий доступна только в обсуждениях конкретной цели.\nКанал целей: ${exist.link}`, {reply_to_message_id: ctx.update.message.message_id})
                }

              } else if (tag.tag === 'goal') {
                // console.log("looking_for: ", ctx.chat.id.toString())
                let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())
                // console.log("current_chat: ", current_chat)

                if (!current_chat) 
                  return

                
                // await getUnion(bot.instanceName, ctx.update.message.forward_from_chat.id.toString())
                let exist = await getUnion(bot.instanceName, ctx.update.message.chat.id.toString())
                // console.log("AFTER!", exist)

                if (exist.type != "unionChat"){
                  ctx.reply("Ошибка! Постановка целей доступна только в главном чате союза. Используйте тег #task в сообщении.", {reply_to_message_id: ctx.message.message_id})
                  return
                }
                // console.log("goalChannel: ", exist)
                
                exist = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "goalsChannel")
                
                if (!exist){
                  exist = await getUnionByType(bot.instanceName, user.eosname, "unionChannel")
                  if (!exist){
                    exist = await getUnionByType(bot.instanceName, user.eosname, "unionChat")

                    const id = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: "Пожалуйста, подождите, мы создаём канал для целей вашего DAO" });
                    let goalChatResult = await createChat(bot, user, current_chat.host, exist.unionName, "goals")
                    await ctx.deleteMessage(id);
                    const id2 = await sendMessageToUser(bot, {id: ctx.chat.id}, { text: `Канал целей создан: ${goalChatResult.channelLink}` });
                    exist = {id : "-100" + goalChatResult.channelId, host: exist.host, link: exist.link}
                    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
                    await sleep(3000)
                  } else {
                    await ctx.reply(`Ошибка: канал целей союза не подключен.`)
                  }
                }
                
                let goalChannelId = exist.id
                let project = tags.find(el => el.tag == 'project')
                let pr 
                let projectChannelId

                let msg

                let hostname = pr ? pr.host : exist.host

                // console.log("GOAL DETECTED:")
                let goal = {
                  hostname: hostname,
                  title: text,
                  description: "",
                  target: "0.0000 FLOWER",
                  parent_id: 0,
                }

                console.log("goal.goalId: ", goal)
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

                // console.log("goalChannelId: ", goalChannelId)
                
                let t
                let text_to_channel

                if (project) {
                  if (project.id) {
                    pr = await getProject(bot.instanceName, project.id)

                    if (pr) {
                      projectChannelId = pr.id
                      t = await constructGoalMessage(bot, pr.host, null, goal.goalId)
                      text_to_channel = t
                      t += `\n${project.id ? `\n\nКанал проекта: ${pr.link}` : ''}`
                      // t += `\nОбсуждение: https://t.me/c/${tempChannelId}/${goalMessageId}`
                      await ctx.reply(`Добавляем цель в проект`)
                      
                      const projectMessageId = await sendMessageToUser(bot, { id:  projectChannelId}, { text: text_to_channel });
                      
                      await insertGoal(bot.instanceName, {
                        host: pr.host,
                        title: text,
                        goal_id: goal.goalId,
                        channel_message_id: projectMessageId,
                        channel_id: projectChannelId
                      })
                    } else {
                      await ctx.reply(`Проект не найден`)
                    }
                  } else {
                    await ctx.reply(`Невозможно добавить цель в проект без идентификатора.`)
                  }

                } else {
                  t = await constructGoalMessage(bot, current_chat.host, null, goal.goalId)
                      
                  gc = await getUnionByType(bot.instanceName, current_chat.ownerEosname, "goalsChannel")
                  text_to_channel = t
                  t += `\n\nОбсуждение: ${gc.link}` // https://t.me/c/${tempChannelId}/${goalMessageId}

                }

                
                //TODo редактирование образа цели
                const goalMessageId = await sendMessageToUser(bot, {id: goalChannelId}, { text: text_to_channel });
                // console.log("goalMessageId: ", goalMessageId)


                await insertGoal(bot.instanceName, {
                  host: hostname,
                  title: text,
                  goal_id: goal.goalId,
                  channel_message_id: goalMessageId,
                  channel_id: goalChannelId
                })


                //SEND to global goal channel
                console.log("text_to_channel: ", text_to_channel, t)
                const globalGoalMessageId = await sendMessageToUser(bot, {id: bot.getEnv().GOALS_CHANNEL_ID}, { text: text_to_channel || t });


                await insertGoal(bot.instanceName, {
                  host: hostname,
                  title: text,
                  goal_id: goal.goalId,
                  channel_message_id: globalGoalMessageId,
                  channel_id: bot.getEnv().GOALS_CHANNEL_ID
                })

                

                let tempChannelId = goalChannelId.replace('-100', '')
                
                


                // console.log("goalId", goalId)
                
                // await ctx.deleteMessage(ctx.update.message.message_id)

                await insertMessage(bot.instanceName, user, user.id, text, goalMessageId, 'goal', {goalId: goal.goalId, chatId: goalChannelId});


                // console.log("project", projectChannelId, project, pr)
                

                    
                if (project && project.id) {
                  
                }

                if (t)
                  await ctx.reply(t) //, , {reply_to_message_id : ctx.update.message.message_id}
                
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
          else if (user.state === 'set_withdraw_amount') {

              let current_chat = await getUnion(bot.instanceName, (ctx.chat.id).toString())

              if (!current_chat) {
                await ctx.reply(`Союз не найден`)
                return
              }

              const helix = await getHelixParams(bot, exist.host);

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


        } else {
          console.log("message2")
          await insertMessage(bot.instanceName, user, 'user', text);
        }
      }
    } else {
      if (ctx.update.message && ctx.update.message.is_automatic_forward == true && ctx.update.message.sender_chat){
          let union 
          try{
            union = await getUnion(bot.instanceName, ctx.update.message.forward_from_chat.id.toString())
          } catch(e){}
          
          console.log("___________________________")
          // console.log("UNION: ", union, ctx.update.message.sender_chat.id, ctx.update.message.forward_from_chat.id)
          
          if (union.id.toString() == bot.getEnv().GOALS_CHANNEL_ID)
            union = {
              type: 'goalsChannel',
              host: 'core',
              id: bot.getEnv().GOALS_CHANNEL_ID
            }

          if (union){ //если словили пересылку из прикрепленного канала
            if(true){ //то нужно запомнить ID сообщения, чтоб отвечать в том же треде

              const buttons = [];
              if (union.type == 'goalsChannel' || 'projectChannel'){
                let goal = await getGoalByChatMessage(bot.instanceName, union.host, ctx.update.message.forward_from_message_id)
                // console.log("ИНСТРУКЦИЯ:Ж ", goal, ctx.update.message)
                
                let goalid = goal ? goal.goal_id : null

                buttons.push(Markup.button.callback('👍', `upvote ${union.host} ${goalid}`));
                buttons.push(Markup.button.callback('👎', `downvote ${union.host} ${goalid}`));
                buttons.push(Markup.button.switchToCurrentChat('создать действие', `#task_${goalid} ЗАМЕНИТЕ_НА_ТЕКСТ_ДЕЙСТВИЯ`));
                // buttons.push(Markup.button.switchToCurrentChat('создать донат', `/donate`));
  
                    
                const request = Markup.inlineKeyboard(buttons, { columns: 2 }).resize()
                // ctx.reply("Выберите действие: ", {reply_to_message_id : ctx.message.message_id, ...request})              
                let instructions = await getGoalInstructions();
                let iid = (await ctx.reply(instructions, {reply_to_message_id : ctx.message.message_id, ...request})).message_id

                await insertMessage(bot.instanceName, {id: "bot"}, "goalInstruction", text, iid, 'autoforward', {forward_from_type: union.type, forward_from_channel_id: union.id, forward_from_message_id: ctx.update.message.forward_from_message_id});

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


  bot.action(/confirmwithdraw (\w+)/gi, async (ctx) => {
    const withdraw_id = ctx.match[1];
    // console.log("withdraw_id: ", withdraw_id)
    let wobj = await getWithdraw(bot.instanceName, withdraw_id)
    // console.log('wobj', wobj)
    const user = await getUser(bot.instanceName, wobj.userId);

    await updateWithdraw(bot.instanceName, withdraw_id, "confirmed")

    await ctx.editMessageText('вывод обработан');

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

  
  bot.action(/rvote (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const hostname = ctx.match[1];
    const reportId = parseInt(ctx.match[2], 10);
    
    console.log("rvote: ", hostname, reportId)
    await rvoteAction(bot, ctx, user, hostname, reportId, true)
    
    console.log("upvote")
  });


  bot.action(/upvote (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const hostname = ctx.match[1];
    const goalId = parseInt(ctx.match[2], 10);
    console.log("upvote: ", hostname, goalId)
    await voteAction(bot, ctx, user, hostname, goalId, true)
    
    console.log("upvote")
  });

  bot.action(/downvote (\w+)\s(\w+)?/gi, async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    const hostname = ctx.match[1];
    const goalId = parseInt(ctx.match[2], 10);
    console.log("downvote: ", hostname, goalId)
    await voteAction(bot, ctx, user, hostname, goalId, false)
    
    console.log("downvote")
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
