const { Markup } = require('telegraf');
const eosjsAccountName = require('eosjs-account-name');
const { lazyFetchAllTableInternal } = require('./utils/apiTable');
const { saveUser } = require('./db');

async function getVotesCount(bot, hostname, username) {
  let votes = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', username, 'votes');
  votes = votes.filter((el) => el.host === hostname);
  return votes.length;
}

async function fetchGoals(bot, hostname) {
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

async function createGoal(bot, ctx, user, goal) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  let res 
  if (!user.create_goal)
    user.create_goal = {}
  
  try {
    res = await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'setgoal',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          creator: user.eosname,
          host: goal.hostname || user.create_goal.hostname,
          parent_id: goal.parent_id || 0,
          title: goal.title || user.create_goal.title,
          description: goal.description || user.create_goal.description,
          target: goal.target || user.create_goal.target || parseFloat(0).toFixed(4) + " FLOWER",
          meta: JSON.stringify(goal.meta || {}),
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    const cons = res.processed.action_traces[0].console;
    console.log("CONSOLE: ", cons)

    const [, goalId] = cons.split('GOAL_ID:');
    console.log("GOALID: ", goalId)
    // operatorOrder.id = orderId;

    const buttons = [];

    // buttons.push(Markup.button.callback('Показать все цели', `showgoals ${user.create_goal.hostname} `));
    // ctx.editMessageText('Ваша цель успешно создана и добавлена в общий список.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

    // eslint-disable-next-line no-param-reassign
    user.create_goal = {};
    console.log("GOAL CREATED!")
    await saveUser(bot.instanceName, user);
    return goalId
  } catch (e) {
    ctx.reply(e.message);
    console.error(e);
  }
}

async function printGoalsMenu(bot, ctx, user, hostname) {
  const goals = await fetchGoals(hostname);
  const conditions = await fetchConditions(hostname);
  let upower = await fetchUPower(hostname, user.eosname);

  console.log('goals', goals.length);
  let index = 1;
  // eslint-disable-next-line no-restricted-syntax
  for (const goal of goals) {
    const buttons = [];

    if (goal.voters.find((el) => user.eosname === el)) {
      buttons.push(Markup.button.callback('Снять голос', `voteup ${hostname} ${goal.id}`));
    } else if (goal.status !== 'filled') {
      buttons.push(Markup.button.callback('Проголосовать ЗА', `voteup ${hostname} ${goal.id}`));
    }
    // eslint-disable-next-line no-await-in-loop,max-len
    await ctx.reply(getGoalMsg(index, goal), Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    index += 1;
  }

  const buttons = [];
  buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));

  if (bot.getEnv().WHO_CAN_SET_GOALS === 'any' || (bot.getEnv().WHO_CAN_SET_GOALS === 'admin' && Number(user.id) === Number(process.env.ADMIN_ID))) {
    buttons.push(Markup.button.callback('Создать цель', `creategoal ${hostname}`));
  }

  buttons.push(Markup.button.callback('Пополнить силу голоса', `burn ${hostname}`));

  const maxVotesCondition = conditions.find((el) => el.key_string === 'maxuvotes');
  const maxVotesCount = maxVotesCondition ? maxVotesCondition.value : 0;

  upower = `${parseFloat(upower / 10000).toFixed(4)} FLOWER`;
  const votesCount = await getVotesCount(hostname, user.eosname);

  const mingamountCondition = conditions.find((el) => el.key_string === 'mingamount');
  const mingamount = mingamountCondition ? mingamountCondition.value : 0;

  const mingpercentCondition = conditions.find((el) => el.key_string === 'mingpercent');
  const mingpercent = mingpercentCondition ? mingpercentCondition.value / 10000 : 0;

  // eslint-disable-next-line no-nested-ternary
  const fillAmount = mingamount === 0 ? (mingpercent === 0 ? 'без ограничений' : `${mingpercent}% от суммы`) : `${parseFloat(mingamount / 10000).toFixed(4)} FLOWER`;
  let text = '';

  text += `\nСтоимость постановки цели: ${fillAmount}`;
  text += `\nВаша сила голоса: ${upower}`;
  text += `\nВаши голоса: ${maxVotesCount - votesCount} из ${maxVotesCount}`;

  await ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
}

module.exports = {
  printGoalsMenu,
  voteAction,
  createGoal,
  burnNow,
};
