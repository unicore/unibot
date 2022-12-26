const { Markup } = require('telegraf');
const {
  saveUser,
  getSubscribers,
  delUserHelixBalance,
  addUserHelixBalance,
  getUserByEosName,
  getDbHost,
  saveDbHost,
  loadDB,
  getProjects,
} = require('./db');
const { sendMessageToUser } = require('./messages');
const { getPartner } = require('./partners');
const { timestampToDHMS } = require('./utils/time');
const { lazyFetchAllTableInternal } = require('./utils/apiTable');

async function getHelixParams(bot, hostname) {
  const host = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'hosts');

  const helix = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', host[0].ahost, 'spiral');

  const [currentPool] = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'pool', host[0].current_pool_id, host[0].current_pool_id, 1);

  const [currentRate] = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'rate', currentPool.pool_num - 1, currentPool.pool_num - 1, 1);

  const bcinfo = await bot.eosapi.getInfo({});
  const bctime = await new Date(bcinfo.head_block_time);

  if (currentPool) {
    const poolExpiredAt = await new Date(currentPool.pool_expired_at);

    currentPool.expired_seconds = ((poolExpiredAt - bctime) / 1000).toFixed(2);
    if (currentPool.expired_seconds > 31540000) currentPool.expired_time = 'режим ожидания';
    else currentPool.expired_time = timestampToDHMS(currentPool.expired_seconds);

    currentPool.priority_time = await new Date(currentPool.priority_until);
    // eslint-disable-next-line max-len
    currentPool.priority_time = ((currentPool.priority_time - bctime) / 1000 / 60 / 60).toFixed(2);
    // console.log("currentPool.remain_quants: ", currentPool.remain_quants, )
    currentPool.remain = (parseFloat(currentPool.remain_quants) / parseFloat(helix[0].quants_precision) * parseFloat(currentPool.quant_cost)).toFixed(4) + ' ' + host[0].symbol;
  }

  const incomeStep = (helix[0].overlap / 100 - 100).toFixed(2);
  const lossFactor = (helix[0].loss_percent / 10000).toFixed(2);
  const maxIncome = (incomeStep * Math.floor(helix[0].pool_limit / 2)).toFixed(0);

  return {
    helix: helix[0], host: host[0], currentPool, incomeStep, lossFactor, maxIncome, currentRate,
  };
}

async function getUserHelixBalances(bot, hostname, username, helix) {
  let balances = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', username, 'balance');

  if (hostname) {
    balances = balances.filter((bal) => bal.host === hostname);
    // eslint-disable-next-line no-param-reassign
    if (!helix) helix = await getHelixParams(bot, hostname);
  } else {
    balances = balances.filter((bal) => bal.host !== bot.getEnv().DEMO_HOST);
  }

  const blackBalances = [];
  const whiteBalances = [];
  let totalWhiteBalances = '0.0000 FLOWER';
  let totalBlackBalances = '0.0000 FLOWER';
  let totalBalances = '0.0000 FLOWER';

  const priorityBalances = [];
  const winBalances = [];
  const loseBalances = [];
  let totalWinBalances = '0.0000 FLOWER';
  let totalPriorityBalances = '0.0000 FLOWER';
  let totalLoseBalances = '0.0000 FLOWER';

  balances.forEach((balance) => {
    if (balance.pool_color === 'white') {
      whiteBalances.push(balance);
      totalWhiteBalances = `${(parseFloat(totalWhiteBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
      totalBalances = `${(parseFloat(totalBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
    } else {
      blackBalances.push(balance);
      totalBlackBalances = `${(parseFloat(totalBlackBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
      totalBalances = `${(parseFloat(totalBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
    }

    if (hostname) {
      if (parseFloat(balance.available) < parseFloat(balance.purchase_amount)) {
        if (helix.host.current_cycle_num > balance.cycle_num) {
          priorityBalances.push(balance);
          totalPriorityBalances = `${(parseFloat(totalPriorityBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
        }

        loseBalances.push(balance);
        totalLoseBalances = `${(parseFloat(totalLoseBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
      } else {
        winBalances.push(balance);
        totalWinBalances = `${(parseFloat(totalWinBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
      }
    }
  });

  return {
    all: balances,
    blackBalances,
    whiteBalances,
    winBalances,
    priorityBalances,
    loseBalances,
    totalLoseBalances,
    totalWinBalances,
    totalPriorityBalances,
    totalWhiteBalances,
    totalBlackBalances,
    totalBalances,
  };
}

async function getCondition(bot, hostname, key) {
  const conditions = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'conditions');
  const condition = conditions.find((cond) => cond.key_string === key);
  if (condition) return condition.value;
  return 0;
}

async function getDacs(bot, hostname) {
  const conditions = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'dacs');

  return conditions;
}

async function getCurrentUserDeposit(bot, hostname, username) {
  const hoststat = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'hoststat', username, username, 1);

  if (hoststat.length > 0) return hoststat[0].blocked_now;
  return 0;
}

async function getTail(bot, username, hostname) {
  const userTailBalances = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'tail', username, username, 1000, 2, 'i64');
  let totalUserInTail = '0.0000 FLOWER';
  let firstUserNum = null;
  let firstUserAmount = null;

  userTailBalances.forEach((t, index) => {
    if (t.username === username && !firstUserNum) {
      firstUserNum = index;
      firstUserAmount = t.amount;
    }

    totalUserInTail = `${(parseFloat(totalUserInTail) + parseFloat(t.amount)).toFixed(4)} FLOWER`;
  });

  return {
    userTailBalances,
    totalUserInTail,
    firstUserNum,
    firstUserAmount,
  };
}

async function getLiquidBalance(bot, username, symbol, contract = 'eosio.token') {
  let liquidBal = await bot.eosapi.getCurrencyBalance(contract, username, symbol);

  if (liquidBal.length === 0) liquidBal = `${(0).toFixed(4)} ${symbol}`;
  // eslint-disable-next-line prefer-destructuring
  else liquidBal = liquidBal[0];

  return liquidBal;
}

async function printHelixWallet(bot, ctx, user, hostname) {
  const paramsPromise = getHelixParams(bot, hostname);
  const [
    params,
    balances,
    myTail,
    maxDeposit,
    userPower,
  ] = await Promise.all([
    paramsPromise,
    paramsPromise.then((p) => getUserHelixBalances(bot, hostname, user.eosname, p)),
    getTail(bot, user.eosname, hostname),
    getCondition(bot, hostname, 'maxdeposit'),
    bot.uni.coreContract.getUserPower(user.eosname, hostname),
  ]);

  let contract;

  const totalShares = params.host.total_shares > 0 ? params.host.total_shares : 1;
  const totalSharesAsset = `${((Number(userPower.power) / parseFloat(totalShares)) * parseFloat(params.host.quote_amount)).toFixed(4)} ${params.host.quote_symbol}`;
  const sharesStake = ((100 * userPower.power) / totalShares).toFixed(4);

  const skipForDemo = (user.is_demo === false || !user.is_demo) && bot.getEnv().MODE !== 'community';

  let toPrint = '';
  toPrint += `\nКасса ${params.host.username.toUpperCase()}`;

  toPrint += `\n\tСтол: №${params.currentPool.pool_num}, цикл ${params.currentPool.cycle_num}`;
  toPrint += `\n\tЦвет: ${params.currentPool.color === 'white' ? '⚪️ белый' : '⚫️ чёрный'}`;
  toPrint += `\n\tДоходность: +${params.incomeStep}%`;
  toPrint += `\n\tДобро: -${params.lossFactor}%`;

  toPrint += `\n\tНа столе: ${params.currentPool.filled}`;
  toPrint += `\n\tДо заполнения: ${params.currentPool.remain}`;
  toPrint += `\n\tДо перезагрузки: ${params.currentPool.expired_time}`;

  // toPrint += `\n\nМаксимальный взнос: ${maxDeposit === 0 ? 'не ограничен' : `${(maxDeposit / 10000).toFixed(4)} FLOWER`}`;
  toPrint += '\n----------------------------------';

  toPrint += '\nВаши вклады:';
  toPrint += `\n\t⚪️ Белый баланс: ${balances.totalWhiteBalances}`;
  toPrint += `\n\t⚫️ Чёрный баланс: ${balances.totalBlackBalances}`;

  // if (skipForDemo) {
  //   toPrint += `\n\t💎 Опыт: ${totalSharesAsset} | ${sharesStake}%`;
  // }

  toPrint += `\n\t🔗 В очереди: ${myTail.totalUserInTail}`;
  // if (hostname === bot.getEnv().DEMO_HOST) {
  // contract = 'faketoken';
  // const bal = await getLiquidBalance(bot, user.eosname, 'FLOWER', contract);
  // toPrint += `\n\nВаш демо-баланс: ${bal}`;
  // } else {
  // const bal = await getLiquidBalance(bot, user.eosname, 'FLOWER');
  // toPrint += `\n\nВаш доступный баланс: ${bal}`;
  // }

  const buttons = [];
  let subscribedNow = false;

  // eslint-disable-next-line no-param-reassign
  if (!user.subscribed_to) user.subscribed_to = [];

  if (user.subscribed_to.includes(hostname)) subscribedNow = true;

  if (skipForDemo) buttons.push(Markup.button.callback('Назад', `backto helixs ${hostname}`));

  buttons.push(Markup.button.callback('Обновить', `select ${hostname}`));

  if (skipForDemo) {
    buttons.push(Markup.button.callback('Мой опыт', `showexp ${hostname} `));
    // buttons.push(Markup.button.callback('Цели', `showgoals ${hostname} `));
  }

  if (bot.getEnv().MODE !== 'community') {
    buttons.push(Markup.button.callback('Очередь', `tail ${hostname}`));
  }

  buttons.push(Markup.button.callback('Мои взносы', `mybalances ${hostname} `));

  buttons.push(Markup.button.callback('Совершить взнос', `deposit ${hostname}`));

  if (skipForDemo) {
    if (subscribedNow) buttons.push(Markup.button.callback('✅ Подписка на обновления', `subscribe ${hostname}`));
    else buttons.push(Markup.button.callback('☑️ Подписка на обновления', `subscribe ${hostname}`));
  }

  let reply_to;
  if (ctx.update.message.reply_to_message) { reply_to = ctx.update.message.reply_to_message.message_id; }

  try {
    if (params.currentPool.expired_time === 'режим ожидания') {
      await ctx.deleteMessage();
      // eslint-disable-next-line max-len

      // await sendMessageToUser(bot, user, { text: toPrint }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());

      const id = (await ctx.reply(toPrint, { reply_to_message_id: reply_to })).message_id;
    } else {
      await ctx.editMessageText(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    }
  } catch (e) {
    // eslint-disable-next-line max-len
    // await sendMessageToUser(bot, user, { text: toPrint }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    const id = (await ctx.reply(toPrint, { reply_to_message_id: reply_to })).message_id;
  }
}

async function refreshState(bot, hostname, user) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  return eos.transact({
    actions: [{
      account: 'unicore',
      name: 'refreshst',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: {
        username: user.eosname,
        host: hostname,
      },
    }],
  }, {
    blocksBehind: 3,
    expireSeconds: 30,
  });
}

async function getOneUserHelixBalance(bot, hostname, username, balanceId) {
  const balances = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', username, 'balance', balanceId, balanceId, 1);
  return balances.find((bal) => Number(bal.id) === Number(balanceId));
}

async function getRefStat(bot, username, symbol) {
  const stats = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', symbol, 'refstat', username, username, 1000, 2, 'i64');

  const stat = stats.find((st) => st.symbol === symbol);
  if (!stat) return `${(0).toFixed(4)} ${symbol}`;
  return stat.withdrawed;
}

function getRefBalances(bot, username) {
  return lazyFetchAllTableInternal(bot.eosapi, 'unicore', username, 'refbalances');
}

async function internalRefWithdrawAction(bot, user, refbalance) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  try {
    await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'withrbenefit',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          username: user.eosname,
          host: refbalance.host,
          id: refbalance.id,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });
  } catch (e) {
    console.log('ERROR ON REFRESH REF-BALANCE: ', e.message);
    throw e;
  }

  return refbalance.id;
}

async function withdrawAllUserRefBalances(bot, user, ctx) {
  const refBalances = await getRefBalances(bot, user.eosname);
  const promises = refBalances.map((rb) => internalRefWithdrawAction(bot, user, rb));

  const results = await Promise.all(promises).catch((err) => {
    console.log('error on auto-ref-withdraw: ', err);
    return [];
  });
  const messagePromises = results.map((id) => {
    const target = refBalances.find((el) => Number(el.id) === Number(id));
    if (ctx) { return ctx.reply(`Получен подарок ${target.amount} от партнёра ${target.from.toUpperCase()} в кассе ${target.host.toUpperCase()}`); } else { return sendMessageToUser(bot, user, { text: `Получен подарок ${target.amount} от партнёра ${target.from.toUpperCase()} в кассе ${target.host.toUpperCase()}` }); }
  });

  await Promise.all(messagePromises);
}

async function printHelixStat(bot, user, hostname, ctx) {
  const buttons = [];
  console.log('ON PRUNT', ctx.update);

  const d = (await ctx.reply('Пожалуйста, подождите. Идёт расчёт капитализации.')).message_id;

  // buttons.push(Markup.button.callback('перевести FLOWER', 'transfer'));
  // buttons.push(Markup.button.callback('мои партнёры', 'mypartners'));

  // if (bot.getEnv().DEPOSIT_WITHDRAW_FROM === 'wallet') {
  //   buttons.push(Markup.button.callback('пополнить', 'givehelp'));
  //   buttons.push(Markup.button.callback('вывести', 'gethelp'));
  // }

  if (user && user.eosname) {
    // const account = await bot.uni.readApi.getAccount(user.eosname);
    await withdrawAllUserRefBalances(bot, user, ctx);
    const refStat = await getRefStat(bot, user.eosname, 'FLOWER');
    const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER');

    // const ram = `${((account.ram_quota - account.ram_usage) / 1024).toFixed(2)} kb`;

    const outUsdRate = await bot.uni.p2pContract.getUsdRate('FLOWER', 4);

    const params = await getHelixParams(bot, hostname);
    const totalShares = params.host.total_shares > 0 ? params.host.total_shares : 1;

    const estimateSysIncome = await getEstimateSystemIncome(bot, hostname);
    console.log('estimateSysIncome', estimateSysIncome);

    const cfund_percent = parseFloat((params.host.cfund_percent / 1000000) * estimateSysIncome.free_flow_percent).toFixed(8);
    const hfund_percent = parseFloat((params.host.hfund_percent / 1000000) * estimateSysIncome.free_flow_percent).toFixed(8);
    const ref_percent = parseFloat((params.host.referral_percent / 1000000) * estimateSysIncome.free_flow_percent).toFixed(8);
    const dacs_percent = parseFloat((params.host.dacs_percent / 1000000) * estimateSysIncome.free_flow_percent).toFixed(8);

    // console.log("royalty: ", royalty)
    let text = '';
    const link = `https://t.me/${(await bot.telegram.getMe()).username}?&start=${user.eosname}`;

    const convert_rate = params.host.sale_shift / 10000;
    const levels = `${params.host.levels.map((el, index) => `\n|\t\t\t\t\t\t\t\t\t - уровень ${index + 1}: ${parseFloat(((Number(el) * (estimateSysIncome.free_ref_percent / 10000) * (params.host.referral_percent / 10000))) / 100 / 100).toFixed(2)}%`)}`;

    // text += '\n---------------------------------';
    text += `\n| Союз: ${params.host.username} | ${params.host.title}`;
    // text += `\n| Взнос: 1 USD / месяц`;
    // text += `\n| Взносы: ${estimateSysIncome.free_flow_percent}% FLOWER`;
    // text += `\n| Кэшбэк: ${estimateSysIncome.free_flow_percent}% от оборота FLOWER`;
    text += `\n| Интеллектуальная собственность: ${params.host.approved_reports} объектов`;

    // text += `\n|\t\t\t\t\tКурс: ${convert_rate} FLOWER/POWER`;

    // text += `\n| Свободный поток: ${estimateSysIncome.free_flow_percent}% от оборота FLOWER`;
    // text += `\n|\t\t\t\t\tЦелевой поток: ${cfund_percent}%`;
    // text += `\n|\t\t\t\t\tФракционный поток: ${hfund_percent}%`;
    // text += `\n|\t\t\t\t\tКорпоративный поток: ${dacs_percent}%`;
    // text += `\n|\t\t\t\t\tПартнёрский поток: ${ref_percent}%`;
    // text += `${levels}`
    // text += `\n| Кэшбэк: ${estimateSysIncome.free_flow_percent}% от оборота FLOWER`;
    // text += `\n| Всего кэшбэк: ${estimateSysIncome.free_flow_percent}% от оборота FLOWER`;

    // text += `\n|\t\t\t\t\tКурс: ${convert_rate} FLOWER/POWER`;

    // text += `\n| Всего фракций: ${totalShares} POWER`;
    // text += `\n|\t\t\t\t\tКурс: ${convert_rate} FLOWER/POWER`;

    text += `\n| Капитализация: ${convert_rate * totalShares * outUsdRate} USD`;
    text += `\n|\t\t\t\t\tВсего фракций: ${totalShares} POWER`;
    // text += `\n|\t\t\t\t\tСтоимость: ${convert_rate * totalShares} FLOWER`;
    text += `\n|\t\t\t\t\tКурс: ${(parseFloat(convert_rate) * parseFloat(outUsdRate)).toFixed(4)} USD/POWER`;
    // text += `\n|`
    // text += `\n| Оборот: ${totalShares} POWER`;
    // text += `\n| Свободный поток: ${estimateSysIncome.free_flow_percent}% от оборота FLOWER`;
    // text += `\n|\t\t\t\t\tЦелевой фонд: ${cfund_percent}%`;
    // text += `\n|\t\t\t\t\tФракционный фонд: ${hfund_percent}%`;
    // text += `\n|\t\t\t\t\tКорпоративный фонд: ${dacs_percent}%`;
    // text += `\n|\t\t\t\t\tПартнёрский фонд: ${ref_percent}%`;

    // text += `\n|\t\t\t\t\tСтоимость: ${(parseFloat(liquidBal) * parseFloat(outUsdRate)).toFixed(8)} USD`;
    // text += `\n|\t\t\t\t\tДоступно: ${liquidBal}`;
    // text += `\n|\t\t\t\t\tЗаблокировано: ${assetBlockedNow}`;
    // text += `\n|\t\t\t\t\tПоступило от партнёров: ${refStat}`;
    // text += `\n| Память: ${ram}`;

    text += '\n---------------------------------';
    text += '\nсообщение будет удалено через 30 секунд';
    text += `\n\nДля приглашения партнёров используйте ссылку: ${link}\n`; //
    text += '\nПоказать помощь: /help';
    // eslint-disable-next-line max-len
    await ctx.deleteMessage(d);

    const id = (await ctx.reply(text, { reply_to_message_id: ctx.update.message.message_id })).message_id;

    setTimeout(
      () => {
        ctx.deleteMessage(ctx.update.message.message_id);
        ctx.deleteMessage(id);
      },
      30 * 1000,
    );
  } else {
    ctx.reply('Аккаунт не найден');
    ctx.deleteMessage(d);
  }
}

// async function printWallet(bot, user, ctx, hostname) {
//   const buttons = [];

//   // buttons.push(Markup.button.callback('перевести FLOWER', 'transfer'));
//   // buttons.push(Markup.button.callback('мои партнёры', 'mypartners'));

//   // if (bot.getEnv().DEPOSIT_WITHDRAW_FROM === 'wallet') {
//   // buttons.push(Markup.button.callback('пополнить', 'givehelp'));
//   buttons.push(Markup.button.callback('вывести', 'withdraw'));
//   // }

//   if (user && user.eosname) {
//     // const account = await bot.uni.readApi.getAccount(user.eosname);
//     await withdrawAllUserRefBalances(bot, user);
//     const refStat = await getRefStat(bot, user.eosname, 'FLOWER');
//     const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER');

//     // const ram = `${((account.ram_quota - account.ram_usage) / 1024).toFixed(2)} kb`;

//     const balances = await getUserHelixBalances(bot, null, user.eosname);

//     const assetBlockedNow = balances.totalBalances;

//     const totalBal = `${(parseFloat(liquidBal) + parseFloat(assetBlockedNow)).toFixed(4)} FLOWER`;

//     let text = '';
//     const link = `https://t.me/${(await bot.telegram.getMe()).username}?&start=${user.eosname}`;
//     const outUsdRate = await bot.uni.p2pContract.getUsdRate('FLOWER', 4);
//     let userPower;
//     let io;
//     let convert_rate;
//     let params;
//     let totalShares;
//     let estimateSysIncome;
//     let royalty;

//     if (hostname) {
//       params = await getHelixParams(bot, hostname);
//       convert_rate = params.host.sale_shift / 10000;
//       totalShares = params.host.total_shares > 0 ? params.host.total_shares : 1;
//       userPower = await bot.uni.coreContract.getUserPower(user.eosname, hostname);
//       io = await getUserIntelOwn(bot, hostname, user.eosname);
//       estimateSysIncome = await getEstimateSystemIncome(bot, hostname);

//       royalty = parseFloat(userPower.power / totalShares * (params.host.cfund_percent / 1000000) * estimateSysIncome.free_flow_percent).toFixed(8);
//     }

//     // text += '\n---------------------------------';
//     text += `\n| Имя аккаунта: ${user.eosname}`;
//     text += `\n| Цветки: ${totalBal}`;
//     text += `\n|\t\t\t\t\tДоступно: ${liquidBal}`;
//     text += `\n|\t\t\t\t\tЗаблокировано: ${assetBlockedNow}`;
//     text += `\n|\t\t\t\t\tПоступило от партнёров: ${refStat}`;
//     // text += `\n| Память: ${ram}`;
//     text += `\n| Курс: ${parseFloat(outUsdRate).toFixed(8)} USD / FLOWER`;
//     text += `\n| Стоимость: ${(parseFloat(totalBal) * parseFloat(outUsdRate)).toFixed(8)} USD`;

//     if (hostname) {
//       text += `\n| Интеллектуальная собственность: ${io.approved_reports} объектов`;
//       // text += `\n| Взносы: ${0} FLOWER`;
//       text += `\n| Роялти: ${royalty}% от оборота`;
//       text += `\n| Фракции: ${userPower.power} POWER`;
//       text += `\n|\t\t\t\t\tКурс: ${(convert_rate * outUsdRate).toFixed(4)} USD / POWER`;
//       text += `\n|\t\t\t\t\tСтоимость: ${(convert_rate * userPower.power * outUsdRate).toFixed(4)} USD`;
//     }

//     text += '\n---------------------------------';
//     text += `\nСсылка для приглашений: ${link}\n`; //
//     // eslint-disable-next-line max-len
//     if (!ctx) await sendMessageToUser(bot, user, { text }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
//     else {
//       text += '\n\nсообщение будет удалено через 30 секунд';

//       const id = (await ctx.reply(text, { reply_to_message_id: ctx.update.message.message_id })).message_id;

//       setTimeout(
//         () => {
//           ctx.deleteMessage(ctx.update.message.message_id);
//           ctx.deleteMessage(id);
//         },
//         30 * 1000,
//       );
//     }
//   }
// }

async function getRefBalancesByStatus(bot, hostname, username) {
  let balances = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', username, 'refbalances');
  const status = await getPartnerStatus(bot, hostname, username);

  balances = balances.filter((el) => el.level > status.level);
  let summ = 0;
  balances.map((bal) => {
    summ += parseFloat(bal.amount);
  });

  return (summ).toFixed(4) + ' FLOWER';
}

async function getPartnerStatus(bot, hostname, username) {
  const [guest] = await lazyFetchAllTableInternal(bot.eosapi, 'registrator', 'registrator', 'guests', username, username, 1);

  let partner = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'corepartners', username, username, 1);
  partner = partner[0];

  if (guest) {
    return { status: 'гость', icon: '', level: -1 };
  } else if (!partner) return { status: 'пайщик', icon: '', level: 0 };
  else {
    const res = {};

    if (partner.status == 'koala') {
      res.icon = '🐨';
      res.status = 'коала';
      res.level = 1;
    } else if (partner.status == 'panda') {
      res.icon = '🐼';
      res.status = 'панда';
      res.level = 2;
    } else if (partner.status == 'wolf') {
      res.icon = '🐺';
      res.status = 'волк';
      res.level = 3;
    } else if (partner.status == 'tiger') {
      res.icon = '🐯';
      res.status = 'тигр';
      res.level = 4;
    } else if (partner.status == 'leo') {
      res.icon = '🦁';
      res.status = 'лев';
      res.level = 5;
    } else if (partner.status == 'bear') {
      res.icon = '🐻';
      res.status = 'медведь';
      res.level = 6;
    } else if (partner.status == 'dragon') {
      res.icon = '🐲';
      res.status = 'дракон';
      res.level = 7;
    }
    res.expiration = partner.expiration;
    return res;
  }
}

async function printWallet(bot, user) {
  const buttons = [];

  const status = await getPartnerStatus(bot, 'core', user.eosname);

  // if(status.level == -1) {

  // buttons.push(Markup.button.callback('совершить взнос ⤴️', 'deposit'));
  // buttons.push(Markup.button.callback('совершить взнос ⤴️', 'deposit'));
  // buttons.push(Markup.button.callback('повысить статус 🔼', `buystatus ${JSON.stringify({})}`));

  // } else {
  // buttons.push(Markup.button.callback('купить фракцию ⤴️', 'deposit'));
  // buttons.push(Markup.button.callback('продать фракцию ⤵️', 'prewithdrawbalance'));
  // buttons.push(Markup.button.callback('внутренний перевод ➡️', 'transfer'));
  // buttons.push(Markup.button.callback('моя структура 🔀', 'mypartners'));
  // buttons.push(Markup.button.callback('повысить статус 🔼', `buystatus ${JSON.stringify({})}`));

  // }

  if (user && user.eosname) {
    const account = await bot.uni.readApi.getAccount(user.eosname);
    await withdrawAllUserRefBalances(bot, user);
    const refStat = await getRefStat(bot, user.eosname, 'FLOWER');

    const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER');

    const ram = `${((account.ram_quota - account.ram_usage) / 1024).toFixed(2)} kb`;

    // const balances = await getUserHelixBalances(bot, null, user.eosname);

    const hosts = await getHelixsList(bot);
    if (hosts.length > 0) {
      const hostname = hosts[0].username;

      const notAccessableRefBalance = await getRefBalancesByStatus(bot, hostname, user.eosname);
      const status = await getPartnerStatus(bot, 'core', user.eosname);
      console.log('status: ', status);
      const userPower = await bot.uni.coreContract.getUserPower(user.eosname, hostname);
      const balances = await getUserHelixBalances(bot, hostname, user.eosname);
      const assetBlockedNow = balances.totalBalances.replace('FLOWER', 'FLOWER');

      const params = await getHelixParams(bot, hostname);

      const uPower = (userPower.power / params.helix.quants_precision).toFixed(4);
      const totalCost = parseFloat(params.currentRate.quant_sell_rate) * uPower;

      const totalBal = `${(parseFloat(liquidBal) + parseFloat(assetBlockedNow)).toFixed(4)} FLOWER`;

      let text = '';
      const link = `https://t.me/${(await bot.telegram.getMe()).username}?&start=${user.eosname}`;

      text += '\n---------------------------------';
      text += `\n| Системное имя: ${user.eosname}`;
      text += `\n| Статус: ${status.status} ${status.icon}`;

      if (status.level > 0) text += `\n|\t\t\t\t\t до ${status.expiration}`;

      text += `\n| Ликвидный баланс: ${liquidBal}`;//
      // text += `\n|\t\t\t\t\tДоступные: ${liquidBal.replace("FLOWER", "FLOWER")}`;
      // text += `\n|\t\t\t\t\tЗаблокировано: ${assetBlockedNow.replace("FLOWER", "FLOWER")}`;
      // text += `\n|\t\t\t\t\tПоступило от партнеров: ${refStat.replace("FLOWER", "FLOWER")}`;
      // text += `\n|\t\t\t\t\tЗаблокировано по статусу: ${notAccessableRefBalance.replace("FLOWER", "FLOWER")}`;

      // text += `\n|\t\t\t\t\tФракции: ${uPower} шт.\n`
      // text += `\n|\t\t\t\t\tЗаложено: ${assetBlockedNow.replace("FLOWER", "FLOWER")}`

      // text += `\n| Ресурс аккаунта: ${ram} RAM`;

      text += '\n---------------------------------';
      text += `\n\nДля приглашения партнеров используйте ссылку: ${link}\n`; //
      // eslint-disable-next-line max-len
      await sendMessageToUser(bot, user, { text }, { disable_web_page_preview: true, ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize() });
    } else await sendMessageToUser(bot, user, { text: 'Кооперативные участки не найдены' }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  }
}

async function printPublicWallet(bot, user, hostname, ctx) {
  const buttons = [];
  console.log('ON PRUNT', ctx.update);

  const d = (await ctx.reply('Пожалуйста, подождите. Идёт расчёт роялти.')).message_id;

  // buttons.push(Markup.button.callback('перевести FLOWER', 'transfer'));
  // buttons.push(Markup.button.callback('мои партнёры', 'mypartners'));

  // if (bot.getEnv().DEPOSIT_WITHDRAW_FROM === 'wallet') {
  //   buttons.push(Markup.button.callback('пополнить', 'givehelp'));
  //   buttons.push(Markup.button.callback('вывести', 'gethelp'));
  // }

  if (user && user.eosname) {
    // const account = await bot.uni.readApi.getAccount(user.eosname);
    await withdrawAllUserRefBalances(bot, user, ctx);
    const refStat = await getRefStat(bot, user.eosname, 'FLOWER');
    const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER');

    // const ram = `${((account.ram_quota - account.ram_usage) / 1024).toFixed(2)} kb`;

    const balances = await getUserHelixBalances(bot, null, user.eosname);

    const assetBlockedNow = balances.totalBalances;

    const totalBal = `${(parseFloat(liquidBal) + parseFloat(assetBlockedNow)).toFixed(4)} FLOWER`;

    const userPower = await bot.uni.coreContract.getUserPower(user.eosname, hostname);

    const outUsdRate = await bot.uni.p2pContract.getUsdRate('FLOWER', 4);

    const params = await getHelixParams(bot, hostname);
    const totalShares = params.host.total_shares > 0 ? params.host.total_shares : 1;

    const sharesStake = ((100 * userPower.power) / totalShares).toFixed(4);

    const estimateSysIncome = await getEstimateSystemIncome(bot, hostname);
    console.log('estimateSysIncome', estimateSysIncome);
    const royalty = parseFloat(userPower.power / totalShares * (params.host.cfund_percent / 1000000) * estimateSysIncome.free_flow_percent).toFixed(8);
    console.log('royalty: ', royalty);
    let text = '';
    const link = `https://t.me/${(await bot.telegram.getMe()).username}?&start=${user.eosname}`;

    const convert_rate = params.host.sale_shift / 10000;

    const io = await getUserIntelOwn(bot, hostname, user.eosname);

    // text += '\n---------------------------------';
    text += `\n| Аккаунт: ${user.eosname}`;
    text += `\n| Интеллектуальная собственность: ${io.approved_reports} объектов`;
    // text += `\n| Взносы: ${0} FLOWER`;
    text += `\n| Роялти: ${royalty}% от оборота`;
    text += `\n| Фракции: ${userPower.power} POWER`;
    text += `\n|\t\t\t\t\tКурс: ${(convert_rate * outUsdRate).toFixed(4)} USD / POWER`;
    text += `\n|\t\t\t\t\tСтоимость: ${(convert_rate * userPower.power * outUsdRate).toFixed(4)} USD`;
    // text += `\n| Цветки: ${totalBal}`;
    // text += `\n|\t\t\t\t\tКурс: ${parseFloat(outUsdRate).toFixed(8)} USD/FLOWER`;
    // text += `\n|\t\t\t\t\tСтоимость: ${(parseFloat(liquidBal) * parseFloat(outUsdRate)).toFixed(8)} USD`;
    // text += `\n|\t\t\t\t\tДоступно: ${liquidBal}`;
    // text += `\n|\t\t\t\t\tЗаблокировано: ${assetBlockedNow}`;
    // text += `\n|\t\t\t\t\tПоступило от партнёров: ${refStat}`;
    // text += `\n| Память: ${ram}`;

    text += '\n---------------------------------';
    text += `\nСсылка для приглашений: ${link}\n`; //
    text += '\n\nсообщение будет удалено через 30 секунд.';

    // eslint-disable-next-line max-len
    await ctx.deleteMessage(d);

    const id = (await ctx.reply(text, { reply_to_message_id: ctx.update.message.message_id })).message_id;

    setTimeout(
      () => {
        ctx.deleteMessage(ctx.update.message.message_id);
        ctx.deleteMessage(id);
      },
      30 * 1000,
    );
  } else {
    ctx.reply('Аккаунт не найден');
    ctx.deleteMessage(d);
  }
}

async function transferAction(bot, user, amount, ctx) {
  const bal = await getLiquidBalance(bot, user.eosname, 'FLOWER');

  if (parseFloat(amount) === 0) {
    await ctx.replyWithHTML('Сумма перевода должна быть больше нуля.');
  } else if (parseFloat(bal) < parseFloat(amount)) {
    await ctx.replyWithHTML('Недостаточный баланс для перевода. Введите другую сумму.');
  } else {
    const eos = await bot.uni.getEosPassInstance(user.wif);

    eos.transact({
      actions: [{
        account: 'eosio.token',
        name: user.transfer_action.name,
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          from: user.eosname,
          to: user.transfer_action.data.to,
          quantity: amount,
          memo: '',
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    }).then(async () => {
      await saveUser(bot.instanceName, user);

      await ctx.editMessageText('Перевод выполнен успешно');

      await printWallet(bot, user);
    }).catch(async (e) => {
      // eslint-disable-next-line no-param-reassign
      user.transfer_action = {};
      await saveUser(bot.instanceName, user);
      console.log(e);
      await ctx.editMessageText(`Ошибка: ${e.message}`);
    });
  }
}

async function withdrawPartnerRefBalance(bot, username) {
  const partner = await getPartner(bot, username);

  if (partner) {
    const { referer } = partner;
    const user = await getUserByEosName(bot.instanceName, referer);
    if (user && user.eosname) await withdrawAllUserRefBalances(bot, user);
  }
}

async function goalWithdraw(bot, ctx, user, goal) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  return await eos.transact({
    actions: [{
      account: 'unicore',
      name: 'gwithdraw',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: {
        username: user.eosname,
        host: goal.host,
        goal_id: goal.goal_id,
      },
    }],
  }, {
    blocksBehind: 3,
    expireSeconds: 30,
  });
}

async function internalWithdrawAction(bot, user, hostname, balanceId) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  await eos.transact({
    actions: [{
      account: 'unicore',
      name: 'withdraw',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: {
        username: user.eosname,
        host: hostname,
        balance_id: balanceId,
      },
    }],
  }, {
    blocksBehind: 3,
    expireSeconds: 30,
  }).catch((e) => {
    console.log('internalWithdrawActionError: ', e);
  });
}

async function retireAction(bot, user, amount, address) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  return new Promise(async (resolve, reject) => {
    eos.transact({
      actions: [{
        account: 'eosio.token',
        name: 'retire',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          username: user.eosname,
          quantity: amount,
          memo: address,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    }).then(async () => {
      resolve();
    }).catch(async (e) => {
      reject(e);
    });
  });
}

async function massWithdrawAction(bot, user, hostname, balances) {
  // eslint-disable-next-line no-restricted-syntax
  for (const balance of balances) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await internalWithdrawAction(bot, user, hostname, balance.id);
      // eslint-disable-next-line no-await-in-loop
      await delUserHelixBalance(bot.instanceName, user.eosname, balance.id);
    } catch (e) {
      console.log('ERROR:', e);
    }
  }
}

async function getUserIntelOwn(bot, hostname, username) {
  const ios = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'intelown', username, username, 1);

  return ios[0] || { total_reports: 0, approved_reports: 0 };
}

async function getHelixsList(bot) {
  let helixs = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', bot.getEnv().CORE_HOST, 'ahosts');
  helixs = helixs.filter((el) => el.username !== bot.getEnv().DEMO_HOST);
  return helixs;
}

async function internalRefreshAction(bot, balance, username) {
  const eos = await bot.uni.getEosPassInstance(bot.getEnv().REFRESHER);

  try {
    await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'refreshbal',
        authorization: [{
          actor: 'refresher',
          permission: 'active',
        }],
        data: {
          username,
          balance_id: balance.id,
          // eslint-disable-next-line max-len
          partrefresh: Math.floor(Math.random() * (50 - 40) + 40), // Дублицируемые транзакции вызвают сбой, для обхода временно рандомизирую
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });
  } catch (e) {
    console.log('ERROR ON REFRESH BALANCE: ', e.message);
    return e.message;
  }

  return balance.id;
}

async function refreshAllBalances(bot, hostname, baseUser, skip) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUsers_${bot.instanceName}`);
    let ahosts;
    let users;

    if (baseUser) users = [baseUser];
    else users = await collection.find({}).toArray();

    if (hostname) ahosts = [{ username: hostname }];
    else {
      ahosts = await getHelixsList(bot);
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const ahost of ahosts) {
      // eslint-disable-next-line no-await-in-loop
      const helix = await getHelixParams(bot, ahost.username);

      // eslint-disable-next-line no-restricted-syntax
      for (const user of users) {
        // eslint-disable-next-line no-await-in-loop
        const balances = await getUserHelixBalances(bot, ahost.username, user.eosname, helix);

        // eslint-disable-next-line no-restricted-syntax
        for (const bal of balances.all) {
          // eslint-disable-next-line no-await-in-loop
          await addUserHelixBalance(user.eosname, bal);

          if (bal && bal.last_recalculated_win_pool_id < helix.host.current_pool_id) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await internalRefreshAction(bot, bal, user.eosname);
            } catch (e) {
              console.log('error on all-refresh: ', e);
            }
          }
        }
      }
    }
  } catch (e) {
    console.log(e);
  }

  if (!skip) {
    setTimeout(
      () => refreshAllBalances(bot),
      60 * 1000,
    );
  }
}

async function printUserBalances(bot, ctx, user, hostname, nextIndex, fresh) {
  const balances = await getUserHelixBalances(bot, hostname, user.eosname);

  const currentIndex = nextIndex || 0;
  const currentBalance = balances.all[currentIndex];

  if (currentBalance) {
    let isPriority = false;
    // eslint-disable-next-line max-len
    const priorBal = balances.priorityBalances.find((el) => Number(el.id) === Number(currentBalance.id));

    if (priorBal) isPriority = true;

    const buttons = [];
    if (balances.all.length === 1) {
      buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));
    } else {
      if (currentIndex === 0) buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));
      else buttons.push(Markup.button.callback(`Предыдущий (${currentIndex})`, `mybalances ${hostname} ${currentIndex - 1}`));

      if (balances.all.length - 1 - currentIndex === 0) buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));
      else buttons.push(Markup.button.callback(`Следующий (${balances.all.length - 1 - currentIndex})`, `mybalances ${hostname} ${currentIndex + 1}`));
    }

    buttons.push(Markup.button.callback('Обновить', `refreshaction ${hostname} ${currentBalance.id} ${currentIndex}`));
    buttons.push(Markup.button.callback('Вывести', `withdrawaction ${hostname} ${currentBalance.id}`));

    if (isPriority) buttons.push(Markup.button.callback('Войти в очередь', `prioroneaction ${hostname} ${currentBalance.id}`));

    let toPrint = '';
    toPrint += `\nВзнос на ${currentBalance.pool_num} ${currentBalance.pool_color === 'white' ? '⚪️ белый' : '⚫️ чёрный'} стол ${currentBalance.cycle_num} цикла:`;
    toPrint += `\n\t\t${currentBalance.purchase_amount}`;

    if (parseFloat(currentBalance.compensator_amount) > 0) toPrint += `\n\nНа крайнем одноцветном столе:\n\t\t${currentBalance.compensator_amount}`;

    toPrint += `\n\nДоступно сейчас:\n\t\t${currentBalance.available}`; // (${parseFloat(currentBalance.root_percent / 10000).toFixed(1)}%)
    // TODO отобразить в следующем цикле
    if (parseFloat(currentBalance.available) >= parseFloat(currentBalance.purchase_amount)) {
      toPrint += `\n\nПрибыль:\n\t\t${((parseFloat(currentBalance.available) / parseFloat(currentBalance.purchase_amount)) * 100 - 100).toFixed(1)}%`;
    } else {
      toPrint += `\n\nУбыток:\n\t\t${((parseFloat(currentBalance.available) / parseFloat(currentBalance.purchase_amount)) * 100 - 100).toFixed(1)}%`;
    }

    // eslint-disable-next-line max-len
    if (nextIndex === undefined || fresh === true) await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    else ctx.editMessageText(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  } else {
    const buttons = [];
    buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));

    ctx.reply(`У вас нет взносов в кассу ${hostname.toUpperCase()}`, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  }
}

async function withdrawAction(bot, ctx, user, hostname, balanceId) {
  const bal = await getOneUserHelixBalance(bot, hostname, user.eosname, balanceId);

  internalWithdrawAction(bot, user, hostname, balanceId).then(async () => {
    try {
      await delUserHelixBalance(bot.instanceName, user.eosname, bal.id);
    } catch (e) {
      // empty
    }

    if (bal.win === 1) {
      ctx.reply(`Вы получили подарок из кассы ${hostname.toUpperCase()} на сумму ${bal.available} с чистой прибылью ${bal.root_percent / 10000}%`);
    } else {
      ctx.reply(`Вы получили подарок из кассы ${hostname.toUpperCase()} на сумму ${bal.available}`);
    }

    await printUserBalances(bot, ctx, user, hostname);

    // TODO get partner/withdraw balance and notify
    await withdrawPartnerRefBalance(bot, user.eosname);
  }).catch((e) => {
    ctx.replyWithHTML(e);
    console.error(e);
  });
}

async function notifyNewCycle(bot, hostname) {
  const host = await getDbHost(bot.instanceName, hostname);

  const users = await getSubscribers(bot, hostname);

  // eslint-disable-next-line no-restricted-syntax
  for (const user of users) {
    let text = '';
    const buttons = [];

    try {
      if (!host.new_cycle_sent_to.includes(user.eosname)) { // for not repeate for user
        // eslint-disable-next-line no-await-in-loop
        await refreshAllBalances(bot, hostname, user, true);

        text += `\nВнимание! Объявляется новый цикл развития кассы ${hostname.toUpperCase()}. Всем участникам рекомендуется забрать свои взносы из раздела "мои вклады" кассы.\n\nВклады, совершившие добро, могут быть перевложены своим остатком в очередь, и автоматически зайти в первые два стола последующих циклов.`;

        // eslint-disable-next-line no-await-in-loop,max-len
        await sendMessageToUser(bot, user, { text }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());

        host.new_cycle_sent_to.push(user.eosname);
        // eslint-disable-next-line no-await-in-loop
        await saveDbHost(bot.instanceName, host);
      }
    } catch (e) {
      console.log('error cycle NOTIFY:', e);
    }
  }
}

async function notifyNewTable(bot, hostname) {
  const users = await getSubscribers(bot, hostname);
  const text = `Внимание! Открыт новый стол в кассе ${hostname.toUpperCase()}!`;

  // eslint-disable-next-line no-restricted-syntax
  for (const user of users) {
    // TODO??? подумать, должо ли быть параллельным, так как раньше результат не ожидался
    // eslint-disable-next-line no-await-in-loop
    await sendMessageToUser(bot, user, { text });
  }
}

async function autoHostRefresh(bot) {
  const helixs = await getHelixsList(bot);

  // eslint-disable-next-line no-restricted-syntax
  for (const helix of helixs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await refreshState(bot, helix.username, { wif: bot.getEnv().REFRESHER, eosname: 'refresher' });
    } catch (e) {
      console.log('ERROR ON AUTO HOST REFRESH!', e);
    }

    // eslint-disable-next-line no-await-in-loop
    const oldParams = await getDbHost(bot.instanceName, helix.username);

    // eslint-disable-next-line no-await-in-loop
    const newParams = await getHelixParams(bot, helix.username);

    newParams.new_cycle_sent_to = [];
    // eslint-disable-next-line no-await-in-loop
    await saveDbHost(bot.instanceName, newParams);

    if (oldParams && newParams) {
      if (oldParams.host.current_cycle_num < newParams.host.current_cycle_num) {
        // TODO notify about new cycle
        console.log('start notify cycle');
        // eslint-disable-next-line no-await-in-loop
        await notifyNewCycle(bot, helix.username, newParams);
      }

      if (oldParams.host.current_pool_num < newParams.host.current_pool_num) {
        console.log('start notify table');
        // eslint-disable-next-line no-await-in-loop
        await notifyNewTable(bot, helix.username);
      }
    }
  }
}

async function priorityAction(bot, user, hostname, balanceId) {
  try {
    const eos = await bot.uni.getEosPassInstance(user.wif);

    await delUserHelixBalance(bot.instanceName, user.eosname, balanceId);

    await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'priorenter',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          username: user.eosname,
          host: hostname,
          balance_id: balanceId,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });
  } catch (e) {
    await sendMessageToUser(bot, user, { text: `Ошибка. Обратитесь в поддержку с сообщением: ${e.message}` });
    console.error('priority error: ', e, user.eosname);
    return e.message;
  }
  return null;
}

async function getEstimateSystemIncome(bot, hostname) {
  const targetRates = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'rate', 2, 4, 1000);
  const systemRates = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', 'unicore', 'gpercents');

  // eslint-disable-next-line max-len
  let freeFlowPercent = ((parseFloat(targetRates[1].system_income) - parseFloat(targetRates[0].system_income)) / parseFloat(targetRates[0].live_balance_for_sale)).toFixed(1) * 100;

  const growth = parseFloat(targetRates[2].sell_rate) / parseFloat(targetRates[0].buy_rate);
  // eslint-disable-next-line max-len
  const systemIncomeDiff = parseFloat(targetRates[2].system_income) - parseFloat(targetRates[0].system_income);

  // eslint-disable-next-line max-len
  const userProfit = parseFloat(targetRates[0].live_balance_for_sale) * growth - parseFloat(targetRates[0].live_balance_for_sale);

  // eslint-disable-next-line max-len
  const partnersAmount = (parseFloat(targetRates[0].live_balance_for_sale) / parseFloat(targetRates[0].pool_cost)) * systemIncomeDiff;

  const freeRefPercent = ((partnersAmount / userProfit) * 100).toFixed(1);

  const systemPercent = (parseFloat(systemRates[0].value) / 10000).toFixed(1);
  let systemFlow = 0;

  if (systemPercent > 0) {
    systemFlow = (freeFlowPercent * systemPercent) / 100;
    freeFlowPercent -= systemFlow;
  }

  return {
    free_flow_percent: freeFlowPercent,
    system_percent: systemPercent,
    system_flow: systemFlow,
    free_ref_percent: freeRefPercent,
  };
}

async function printHelixs(bot, ctx, user, nextIndex, hostname) {
  const helixs = await getHelixsList(bot);
  let currentHelix;

  console.log('on print helix', bot.getEnv().CORE_HOST, helixs);
  const currentIndex = nextIndex || 0;

  currentHelix = helixs[currentIndex];
  console.log('on print helix2', currentHelix);
  if (hostname) {
    currentHelix = helixs.find((el) => el.username == hostname);
  } else {
    // currentHelix = helixs.find((el) => el.username == bot.getEnv().CORE_HOST);
  }
  console.log('on print helix3', currentHelix, bot.getEnv().CORE_HOST);

  if (currentHelix) {
    console.log('inside');
    const params = await getHelixParams(bot, currentHelix.username);
    const balances = await getUserHelixBalances(bot, currentHelix.username, user.eosname, params);
    const myTail = await getTail(bot, user.eosname, currentHelix.username);
    const userPower = await bot.uni.coreContract.getUserPower(user.eosname, currentHelix.username);

    const totalShares = params.host.total_shares > 0 ? params.host.total_shares : 1;
    const totalInHelix = `${(parseFloat(myTail.totalUserInTail) + parseFloat(balances.totalBalances) + ((Number(userPower.power) / parseFloat(totalShares)) * parseFloat(params.host.quote_amount))).toFixed(4)} ${params.host.quote_symbol}`;

    const estimateSysIncome = await getEstimateSystemIncome(bot, params.host.ahost);
    const buttons = [];

    // if (helixs.length > 1) {
    buttons.push(Markup.button.callback(`⬅️ Предыдущий (${currentIndex})`, `next ${currentIndex - 1}`));
    buttons.push(Markup.button.callback(`Следующий (${helixs.length - 1 - currentIndex}) ➡️`, `next ${currentIndex + 1}`));
    // }

    // buttons.push(Markup.button.callback('Войти', `select ${currentHelix.username}`));

    let toPrint = '';
    // toPrint += `\n${currentHelix.title}`;
    toPrint += `\n<b>${currentHelix.title.toUpperCase()}</b>`;// {${currentHelix.username}}
    toPrint += '\n------------------------------';
    toPrint += `\n${currentHelix.purpose}`;
    // toPrint += `\nСтол: ${params.currentPool.pool_num} ${params.currentPool.color === 'white' ? '⚪️ белый' : '⚫️ чёрный'}`;
    // toPrint += `\nДоходность одноцветных: +${params.incomeStep}%`;
    // toPrint += `\nДобро противоцветных: -${params.lossFactor}%`;

    // if (params.host.referral_percent > 0) {
    //   toPrint += '\n\nПодарки вам от каждой чистой прибыли ваших партнёров: ';
    //   toPrint += `${params.host.levels.map((el, index) => `\n\t\t\t\t\t\t\t\t\t - уровень ${index + 1}: ${parseFloat(((Number(el) * (estimateSysIncome.free_ref_percent / 10000) * (params.host.referral_percent / 10000))) / 100 / 100).toFixed(2)}%`)}`;
    // }

    // toPrint += '\n------------------------------';
    // toPrint += `\nВаш вклад: ${totalInHelix}`;

    // TODO если есть опыт - обновить и вывести опытный поток
    // Если что-то начислено - обновить карточку и сообщить отдельным сообщением
    //
    if (hostname) {
      ctx.editMessageText(toPrint, { disable_web_page_preview: true, ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize() });
    } else if (nextIndex === undefined) {
      await ctx.replyWithHTML(toPrint, { disable_web_page_preview: true, ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize() });
    } else {
      ctx.editMessageText(toPrint, { disable_web_page_preview: true, ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize() });
    }
  }
}

async function printProjects(bot, ctx) {

}

async function exitTailAction(bot, hostname, user, tailid) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  return eos.transact({
    actions: [{
      account: 'unicore',
      name: 'exittail',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: {
        username: user.eosname,
        host: hostname,
        id: tailid,
      },
    }],
  }, {
    blocksBehind: 3,
    expireSeconds: 30,
  });
}

async function printTail(bot, user, hostname) {
  const tail = await getTail(bot, user.eosname, hostname);
  let text = '';

  const buttons = [];

  buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));

  if (tail.userTailBalances.length > 0) {
    text += `\nВаш первый взнос в очереди:\n\t\t№${tail.firstUserNum}`;
    text += `\nСумма первого взноса:\n\t\t${tail.firstUserAmount}`;
    text += `\nВсе ваши взносы в очереди:\n\t\t${tail.totalUserInTail}`;

    buttons.push(Markup.button.callback('Выйти из очереди', `withdrtail ${hostname}`));
  } else {
    text += 'У вас нет взносов, участвующих в очереди.';
  }

  text += '\n\nПервый взнос с начала очереди автоматически попадает в первые два стола каждого нового цикла, пока взнос не будет исчерпан.';

  // eslint-disable-next-line max-len
  await sendMessageToUser(bot, user, { text }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
}

async function exitFromTail(bot, ctx, user, hostname) {
  const tail = await getTail(bot, user.eosname, hostname);
  try {
    // eslint-disable-next-line no-restricted-syntax
    for (const bal of tail.userTailBalances) {
      // eslint-disable-next-line no-await-in-loop
      await exitTailAction(bot, hostname, user, bal.id);
    }
    ctx.editMessageText(`Произведен успешный выход из очереди на сумму ${tail.totalUserInTail}`);

    await printTail(bot, user, hostname);
  } catch (e) {
    ctx.reply(`Возникла ошибка: ${e.message}`);
  }
}

async function getWelcome() {
  let text = '';
  text += 'Любая цель - это проект, предложенный и утвержденный участниками союза.';
  text += 'Для создания цели напишите ваш запрос с тегом #goal в этот чат.';
  text += 'Принимайте участие в достижении целей участников, регистрируя свою интеллектуальную собственность при выполнении действий';
  text += 'Получайте фракции (POWER) ';

  return text;
}

async function getGoalInstructions() {
  let text = '';
  text += 'Выполняя действия, участники создают интеллектуальную собственность и получают % от всех взносов в DAO.';
  // text += `\n\n/donate - создать взнос в цель и получить возможность голосовать за цели (минимальный взнос 10 USDT)`
  // text += `\n/about - о союзе`
  // text += `\n/set_coordinator @username - установить координатора цели (доступно только архитектору)`
  // text += `\n/withdraw - вывод донатов из цели (доступно только координатору)`
  // text += `\nсообщение с тегом #task или кнопка "создать действие" - создаёт действие в рамках цели`
  // text += `\nсообщение с тегом #report как ответ на созданное действие, или кнопка "создать отчёт" - создаёт отчёт для опубликованного ранее действия.`

  return text;
}

async function addToTeam(bot, ctx, user, hostname, dac, title) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  await eos.transact({
    actions: [{
      account: 'unicore',
      name: 'adddac',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: {
        username: dac,
        host: hostname,
        weight: 1,
        limit_type: '',
        income_limit: '0.0000 FLOWER',
        title,
        descriptor: '',
      },
    }],
  }, {
    blocksBehind: 3,
    expireSeconds: 30,
  });
}

module.exports = {
  getHelixParams,
  getUserHelixBalances,
  printHelixWallet,
  refreshState,
  transferAction,
  getLiquidBalance,
  getOneUserHelixBalance,
  printWallet,
  printUserBalances,
  withdrawAction,
  internalRefreshAction,
  printHelixs,
  autoHostRefresh,
  refreshAllBalances,
  priorityAction,
  massWithdrawAction,
  printTail,
  getCurrentUserDeposit,
  getCondition,
  exitFromTail,
  printPublicWallet,
  printHelixStat,
  goalWithdraw,
  retireAction,
  getGoalInstructions,
  printProjects,
  getDacs,
  addToTeam,
};
