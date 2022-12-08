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
} = require('./db');
const { sendMessageToUser } = require('./messages');
const { getPartner } = require('./partners');
const { timestampToDHMS } = require('./utils/time');
const { lazyFetchAllTableInternal } = require('./utils/apiTable');

async function getHelixParams(bot, hostname) {
  const host = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'hosts');

  const helix = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', host[0].ahost, 'spiral');

  const [currentPool] = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'pool', host[0].current_pool_id, host[0].current_pool_id, 1);

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
  }

  const incomeStep = (helix[0].overlap / 100 - 100).toFixed(2);
  const lossFactor = (helix[0].loss_percent / 10000).toFixed(2);
  const maxIncome = (incomeStep * Math.floor(helix[0].pool_limit / 2)).toFixed(0);

  return {
    helix: helix[0], host: host[0], currentPool, incomeStep, lossFactor, maxIncome,
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
  toPrint += `\n\n\tДоходность одноцветных: +${params.incomeStep}%`;
  toPrint += `\n\tДобро противоцветных: -${params.lossFactor}%`;

  toPrint += `\n\n\tДо перезагрузки: ${params.currentPool.expired_time}`;
  toPrint += `\n\tНа столе: ${params.currentPool.filled}`;
  toPrint += `\n\tДо заполнения: ${params.currentPool.remain}`;

  toPrint += `\n\nМаксимальный взнос: ${maxDeposit === 0 ? 'не ограничен' : `${(maxDeposit / 10000).toFixed(4)} FLOWER`}`;
  toPrint += '\n----------------------------------';

  toPrint += '\nВаши вклады:';
  toPrint += `\n\t⚪️ Белый баланс: ${balances.totalWhiteBalances}`;
  toPrint += `\n\t⚫️ Чёрный баланс: ${balances.totalBlackBalances}`;

  if (skipForDemo) {
    toPrint += `\n\t💎 Опыт: ${totalSharesAsset} | ${sharesStake}%`;
  }

  toPrint += `\n\t🔗 В очереди: ${myTail.totalUserInTail}`;
  if (hostname === bot.getEnv().DEMO_HOST) {
    contract = 'faketoken';
    const bal = await getLiquidBalance(bot, user.eosname, 'FLOWER', contract);
    toPrint += `\n\nВаш демо-баланс: ${bal}`;
  } else {
    const bal = await getLiquidBalance(bot, user.eosname, 'FLOWER');
    toPrint += `\n\nВаш доступный баланс: ${bal}`;
  }

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

  try {
    if (params.currentPool.expired_time === 'режим ожидания') {
      await ctx.deleteMessage();
      // eslint-disable-next-line max-len
      await sendMessageToUser(bot, user, { text: toPrint }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    } else {
      await ctx.editMessageText(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    }
  } catch (e) {
    // eslint-disable-next-line max-len
    await sendMessageToUser(bot, user, { text: toPrint }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
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

async function withdrawAllUserRefBalances(bot, user) {
  const refBalances = await getRefBalances(bot, user.eosname);
  const promises = refBalances.map((rb) => internalRefWithdrawAction(bot, user, rb));

  const results = await Promise.all(promises).catch((err) => {
    console.log('error on auto-ref-withdraw: ', err);
    return [];
  });
  const messagePromises = results.map((id) => {
    const target = refBalances.find((el) => Number(el.id) === Number(id));
    return sendMessageToUser(bot, user, { text: `Получен подарок ${target.amount} от партнёра ${target.from.toUpperCase()} в кассе ${target.host.toUpperCase()}` });
  });

  await Promise.all(messagePromises);
}

async function printWallet(bot, user, ctx) {
  const buttons = [];
  console.log("on PRINT WALLET")

  // buttons.push(Markup.button.callback('перевести FLOWER', 'transfer'));
  // buttons.push(Markup.button.callback('мои партнёры', 'mypartners'));

  // if (bot.getEnv().DEPOSIT_WITHDRAW_FROM === 'wallet') {
    // buttons.push(Markup.button.callback('пополнить', 'givehelp'));
  // buttons.push(Markup.button.callback('совершить взнос ⤴️', 'deposit'));
  buttons.push(Markup.button.callback('оформить подписку', `buystatus ${JSON.stringify({})}`));
  //   buttons.push(Markup.button.callback('вывести', 'gethelp'));
  // }

  if (user && user.eosname) {
    // const account = await bot.uni.readApi.getAccount(user.eosname);
    await withdrawAllUserRefBalances(bot, user);
    const refStat = await getRefStat(bot, user.eosname, 'FLOWER');
    const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER');
    const status = await getPartnerStatus(bot, bot.getEnv().CORE_HOST, user.eosname)
    
    const balances = await getUserHelixBalances(bot, null, user.eosname);

    const assetBlockedNow = balances.totalBalances;

    const totalBal = `${(parseFloat(liquidBal) + parseFloat(assetBlockedNow)).toFixed(4)} FLOWER`;

    let text = '';
    const link = `https://t.me/${(await bot.telegram.getMe()).username}?&start=${user.eosname}`;

    text += '\n---------------------------------';
    text += `\n| Имя аккаунта: ${user.eosname}`;
    text += `\n| Ваш статус: `;

    text += `\n|\t\t\t\t\t${status.level == -1 ? (user.requests_count > 0 ? '✅' : '❌') : '☑️'} гость`
    
    if (status.level == -1 || status.level == 0)
      text += `\n|\t\t\t\t\t\t\t\t -> осталось запросов: ${user.requests_count}`
    
    text += `\n|\t\t\t\t\t${status.level == 1 ? '✅' : '☑️'} советник`
    // text += `\n|\t\t\t\t\t${status.level == 2 ? '✅' : '☑️'} ассистент`
    
    if (status.level > 0)
      text += `\n|\t\t\t\t\t до ${status.expiration}`
      
    // text += `\n| Цветки: ${totalBal}`;
    // text += `\n|\t\t\t\t\tДоступно: ${liquidBal}`;
    // text += `\n|\t\t\t\t\tЗаблокировано: ${assetBlockedNow}`;
    // text += `\n|\t\t\t\t\tПоступило от партнёров: ${refStat}`;
    // text += `\n| Память: ${ram}`;

    text += '\n---------------------------------';
    text += `\n\nДля приглашения партнёров используйте ссылку: ${link}\n`; //
    // eslint-disable-next-line max-len
    if (!ctx) await sendMessageToUser(bot, user, { text }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    else ctx.reply(text);
  }
}



async function getPartnerStatus(bot, hostname, username){
  let [guest] = await lazyFetchAllTableInternal(bot.eosapi, 'registrator', 'registrator', 'guests', username, username, 1);
  
  let partner = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'corepartners', username, username, 1);
  partner = partner[0]

  if (!partner) {
    return {status: 'гость', icon: "", level: -1}
  } else {

    let res = {}

    if (partner.status == "adviser")        {
        res.icon = "🐨"
        res.status = "советник"
        res.level = 1
    } else if (partner.status == "assistant") {
        res.icon = "🐼"
        res.status = "ассистент"
        res.level = 2
    } 
    res.expiration = partner.expiration
    return res

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

async function getHelixsList(bot) {
  let helixs = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', 'unicore', 'ahosts');
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
  const currentIndex = nextIndex || 0;

  currentHelix = helixs[currentIndex];

  if (hostname) {
    currentHelix = helixs.find((el) => el.username === hostname);
  }

  if (currentHelix) {
    const params = await getHelixParams(bot, currentHelix.username);
    const balances = await getUserHelixBalances(bot, currentHelix.username, user.eosname, params);
    const myTail = await getTail(bot, user.eosname, currentHelix.username);
    const userPower = await bot.uni.coreContract.getUserPower(user.eosname, currentHelix.username);

    const totalShares = params.host.total_shares > 0 ? params.host.total_shares : 1;
    const totalInHelix = `${(parseFloat(myTail.totalUserInTail) + parseFloat(balances.totalBalances) + ((Number(userPower.power) / parseFloat(totalShares)) * parseFloat(params.host.quote_amount))).toFixed(4)} ${params.host.quote_symbol}`;

    const estimateSysIncome = await getEstimateSystemIncome(bot, params.host.ahost);
    const buttons = [];

    if (helixs.length > 1) {
      buttons.push(Markup.button.callback(`⬅️ Предыдущая (${currentIndex})`, `next ${currentIndex - 1}`));
      buttons.push(Markup.button.callback(`Следующая (${helixs.length - 1 - currentIndex}) ➡️`, `next ${currentIndex + 1}`));
    }

    buttons.push(Markup.button.callback('Войти', `select ${currentHelix.username}`));

    let toPrint = '';
    toPrint += `\nКасса ${currentHelix.username.toUpperCase()}`;
    toPrint += '\n------------------------------';
    toPrint += `\nСтол: ${params.currentPool.pool_num} ${params.currentPool.color === 'white' ? '⚪️ белый' : '⚫️ чёрный'}`;
    toPrint += `\nДоходность одноцветных: +${params.incomeStep}%`;
    toPrint += `\nДобро противоцветных: -${params.lossFactor}%`;

    if (params.host.referral_percent > 0) {
      toPrint += '\n\nПодарки вам от каждой чистой прибыли ваших партнёров: ';
      toPrint += `${params.host.levels.map((el, index) => `\n\t\t\t\t\t\t\t\t\t - уровень ${index + 1}: ${parseFloat(((Number(el) * (estimateSysIncome.free_ref_percent / 10000) * (params.host.referral_percent / 10000))) / 100 / 100).toFixed(2)}%`)}`;
    }

    toPrint += '\n------------------------------';
    toPrint += `\nВаш вклад: ${totalInHelix}`;

    // TODO если есть опыт - обновить и вывести опытный поток
    // Если что-то начислено - обновить карточку и сообщить отдельным сообщением
    //
    if (hostname) {
      ctx.editMessageText(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    } else if (nextIndex === undefined) {
      await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    } else {
      ctx.editMessageText(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    }
  }
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

module.exports = {
  getHelixParams,
  getUserHelixBalances,
  printHelixWallet,
  refreshState,
  transferAction,
  getPartnerStatus,
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
};
