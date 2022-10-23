const { Markup } = require('telegraf');
const eosjsAccountName = require('eosjs-account-name');
const { lazyFetchAllTableInternal } = require('./utils/apiTable');
const { saveUser, insertMessage, insertGoal } = require('./db');
const { getHelixParams } = require('./core');
const { sendMessageToUser, sendMessageToAll } = require('./messages');

async function getVotesCount(bot, hostname, username) {
  let votes = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', username, 'votes');
  votes = votes.filter((el) => el.host === hostname);
  return votes.length;
}

async function fetchGoals(bot, hostname) {
  console.log('hostname', hostname);
  const goals = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'goals');
  return goals.sort((a, b) => parseFloat(a.votes) - parseFloat(b.votes));
}

async function fetchUPower(bot, hostname, username) {
  const goals = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'power3', username, username, 1);
  if (goals[0]) return goals[0].power;
  return 0;
}

async function fetchConditions(bot, hostname) {
  const conditions = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'conditions');
  // eslint-disable-next-line array-callback-return
  conditions.map((cond, index) => {
    if (cond.key_string === 'condaddgoal') {
      conditions[index].value = eosjsAccountName.uint64ToName(cond.value);
    }

    if (cond.key_string === 'condaddtask') {
      conditions[index].value = eosjsAccountName.uint64ToName(cond.value);
    }

    if (cond.key_string === 'condjoinhost') {
      conditions[index].value = eosjsAccountName.uint64ToName(cond.value);
    }
  });

  return conditions;
}

function getGoalMsg(index, goal) {
  const votes = goal.positive_votes === 0 ? goal.filled_votes : goal.positive_votes;
  const flowerVotes = `${parseFloat(votes / 10000).toFixed(4)} FLOWER`;

  return `Цель №${index}: ${goal.title}\n${goal.description}\n\nСобрано: ${goal.available} из ${goal.target}\nГолоса: ${flowerVotes}\n${goal.status === 'filled' ? 'Голосование завершено' : ''}`;
}

async function editGoalMsg(ctx, user, hostname, goalId) {
  const goals = await fetchGoals(hostname);
  let index = 1;
  let goal;

  // eslint-disable-next-line array-callback-return
  goals.map((g) => {
    if (Number(g.id) === Number(goalId)) {
      goal = g;
      index = 1;
    }
  });

  console.log('index', index);

  const buttons = [];

  if (goal.voters.find((el) => user.eosname === el)) {
    buttons.push(Markup.button.callback('Снять голос', `voteup ${hostname} ${goal.id}`));
  } else if (goal.status !== 'filled') {
    buttons.push(Markup.button.callback('Проголосовать ЗА', `voteup ${hostname} ${goal.id}`));
  }
  // eslint-disable-next-line max-len
  await ctx.editMessageText(getGoalMsg(index, goal), Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
}

async function voteAction(bot, ctx, user, hostname, goalId) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  try {
    await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'vote',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          voter: user.eosname,
          host: hostname,
          goal_id: goalId,
          up: true,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    await editGoalMsg(ctx, user, hostname, goalId);
  } catch (e) {
    if (e.message === 'assertion failure with message: You dont have shares for voting process') {
      ctx.reply('Ошибка: У вас нет силы голоса для управления целями.');
    } else {
      ctx.reply(e.message);
    }

    console.error(e);
  }
}

async function burnNow(bot, ctx, user) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  try {
    await eos.transact({
      actions: [{
        account: 'eosio.token',
        name: 'transfer',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          from: user.eosname,
          to: 'unicore',
          quantity: user.burn.amount,
          memo: `800-${user.burn.hostname}`,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    const buttons = [];

    buttons.push(Markup.button.callback('Показать все цели', `showgoals ${user.burn.hostname} `));
    ctx.editMessageText('Сила голоса успешно пополнена.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

    // eslint-disable-next-line no-param-reassign
    user.burn = {};
    await saveUser(bot.instanceName, user);
  } catch (e) {
    ctx.reply(e.message);
    console.error(e);
  }
}

async function createGoal(bot, ctx, user) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  const goal = {
    creator: user.eosname,
    host: user.create_goal.hostname,
    parent_id: 0,
    title: user.create_goal.title,
    description: user.create_goal.description,
    target: user.create_goal.target,
    meta: JSON.stringify({}),
  };

  try {
    // console.log("goal",goal)
    const res = await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'setgoal',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: goal,
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    const cons = res.processed.action_traces[0].console;
    console.log('CONSOLE: ', cons);

    const [, goalId] = cons.split('GOAL_ID:');
    console.log('GOALID: ', goalId);

    goal.id = goalId;
    goal.channel_id = bot.getEnv().GOALS_CHANNEL_ID;

    await insertGoal(bot.instanceName, user, goal);

    const buttons = [];
    printGoalsMenu(bot, ctx, user, user.create_goal.hostname);
    // buttons.push(Markup.button.callback('Показать все цели', `showgoals ${user.create_goal.hostname} `));
    // ctx.editMessageText('Ваша цель успешно создана и добавлена в общий список.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

    let text = '';
    text += `Кайфолог: ${user.eosname}\n`;
    text += `Цель на ${user.create_goal.target}:\n\n${user.create_goal.title}`;

    const id = await sendMessageToUser(bot, { id: bot.getEnv().GOALS_CHANNEL_ID }, { text });

    await insertMessage(bot.instanceName, user, bot.getEnv().GOALS_CHANNEL_ID, text, id, 'MASTER');

    // eslint-disable-next-line no-param-reassign
    user.create_goal = {};
    await saveUser(bot.instanceName, user);
  } catch (e) {
    console.log(goal);
    ctx.reply(e.message);
    console.error(e);
  }
}

async function printGoalsMenu(bot, ctx, user, hostname) {
  console.log('hostname0: ', hostname);
  const goals = await fetchGoals(bot, hostname);
  const conditions = await fetchConditions(bot, hostname);
  // let upower = await fetchUPower(bot, hostname, user.eosname);
  const helix = await getHelixParams(bot, bot.getEnv().CORE_HOST);

  console.log('goals', goals[0]);
  const index = 1;
  // eslint-disable-next-line no-restricted-syntax
  // for (const goal of goals) {
  //   const buttons = [];

  //   if (goal.voters.find((el) => user.eosname === el)) {
  //     buttons.push(Markup.button.callback('Снять голос', `voteup ${hostname} ${goal.id}`));
  //   } else if (goal.status !== 'filled') {
  //     buttons.push(Markup.button.callback('Проголосовать ЗА', `voteup ${hostname} ${goal.id}`));
  //   }
  //   // eslint-disable-next-line no-await-in-loop,max-len
  //   // await ctx.reply(getGoalMsg(index, goal), Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  //   index += 1;
  // }

  const maxVotesCondition = conditions.find((el) => el.key_string === 'maxuvotes');
  const maxVotesCount = maxVotesCondition ? maxVotesCondition.value : 0;

  // upower = `${parseFloat(upower / 10000).toFixed(4)} FLOWER`;

  const userPower = await bot.uni.coreContract.getUserPower(user.eosname, bot.getEnv().CORE_HOST);
  const totalShares = helix.host.total_shares > 0 ? helix.host.total_shares : 1;
  const totalSharesAsset = `${((Number(userPower.power) / parseFloat(totalShares)) * parseFloat(helix.host.quote_amount)).toFixed(4)} ${helix.host.quote_symbol}`;
  const sharesStake = ((100 * userPower.power) / totalShares).toFixed(4);

  const votesCount = await getVotesCount(bot, hostname, user.eosname);

  const mingamountCondition = conditions.find((el) => el.key_string === 'mingamount');
  const mingamount = mingamountCondition ? mingamountCondition.value : 0;

  const mingpercentCondition = conditions.find((el) => el.key_string === 'mingpercent');
  const mingpercent = mingpercentCondition ? mingpercentCondition.value / 10000 : 0;

  // eslint-disable-next-line no-nested-ternary
  const fillAmount = mingamount === 0 ? (mingpercent === 0 ? 'без ограничений' : `${mingpercent}% от суммы`) : `${parseFloat(mingamount / 10000).toFixed(4)} FLOWER`;
  let text = '';

  const myGoal = goals.find((el) => el.creator === user.eosname);
  let k = 0;

  const prevGoalsCount = goals.map((el) => {
    if (myGoal && el.id < myGoal.id) { k++; }
  });

  const buttons = [];
  // buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));

  if (!myGoal) {
    buttons.push(Markup.button.callback('➕ установить цель', `creategoal ${hostname}`));
  } else {
    buttons.push(Markup.button.callback('➕ пополнить цель', `fillgoal ${hostname} ${myGoal.id}`));
  }

  buttons.push(Markup.button.url('перейти в канал ➡️', bot.getEnv().GOALS_CHANNEL));

  const link = `https://t.me/${(await bot.telegram.getMe()).username}?&start=${user.eosname}`;

  const totalPrevGoalsAmount = Math.floor(k * 300 / 150 * 4);

  // text += `\nСтоимость постановки цели: ${fillAmount}`;
  text += '\n---------------------------------';
  // text += `\nВаши акции: ${userPower.power} POWER`;
  // text += `\nДоступ: ${userPower.power} POWER`;
  if (myGoal) {
    // text += `\nВаша цель 1 в очереди`
    text += `\nДо начала накопления: ${totalPrevGoalsAmount} билетов`;
    text += `\nНакоплено: ${parseFloat(myGoal.available).toFixed(0)}/${bot.getEnv().TARGET} ${bot.getEnv().SYMBOL}`;
    // text += `\nвывод средств доступен сразу по`
  } else {
    text += '\nЦель не установлена';
  }

  text += '\n---------------------------------';
  text += `\n\nДля приглашения партнёров используйте ссылку: ${link}\n`; //

  // text += `\nВаши голоса: ${maxVotesCount - votesCount} из ${maxVotesCount}`;

  await ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
}

module.exports = {
  printGoalsMenu,
  voteAction,
  createGoal,
  burnNow,
};
