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


async function transferToGateAction(bot, user, amount, address) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  
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
          to: "gateway",
          quantity: amount,
          memo: `withdraw to : ${address}`,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    })


}

async function getPartnerStatus(bot, hostname, username){
  let [guest] = await lazyFetchAllTableInternal(bot.eosapi, 'registrator', 'registrator', 'guests', username, username, 1);
  
  let partner = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'corepartners', username, username, 1);
  partner = partner[0]

  if (guest) {
    return {status: 'гость', icon: "", level: -1}
  } else if (!partner)
    return {status: 'фракционер', icon: "", level: 0}
  else {

    let res = {}

    if (partner.status == "koala")        {
        res.icon = "🐨"
        res.status = "коала"
        res.level = 1
    } else if (partner.status == "panda") {
        res.icon = "🐼"
        res.status = "панда"
        res.level = 2
    } else if (partner.status == "wolf")  {
        res.icon = "🐺"
        res.status = "волк"
        res.level = 3
    } else if (partner.status == "tiger") {
        res.icon = "🐯"
        res.status = "тигр"
        res.level = 4
    } else if (partner.status == "leo")   {
        res.icon = "🦁"
        res.status = "лев"
        res.level = 5
    } else if (partner.status == "bear")  {
        res.icon = "🐻"
        res.status = "медведь"
        res.level = 6
    } else if (partner.status == "dragon") {
        res.icon = "🐲"
        res.status = "дракон"
        res.level = 7
    }
    res.expiration = partner.expiration
    return res

  }

}

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
    currentPool.remain = (parseFloat(currentPool.remain_quants) / parseFloat(helix[0].quants_precision) * parseFloat(currentPool.quant_cost)).toFixed(4) + " " + host[0].symbol
  }

  const incomeStep = (helix[0].overlap / 100 - 100).toFixed(2);
  const lossFactor = (helix[0].loss_percent / 10000).toFixed(2);
  const maxIncome = (incomeStep * Math.floor(helix[0].pool_limit / 2)).toFixed(0);

  return {
    helix: helix[0], host: host[0], currentPool, incomeStep, lossFactor, maxIncome, currentRate
  };
}

async function getBalancesOnSale(bot, hostname, username, params) {
  let balances = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'balance4', "onsell", "onsell", 1000, 4, 'i64');
  let summ = 0 

  balances.map(bal => {
    summ += parseFloat(bal.compensator_amount)
  })

  let fractions_on_sale = (summ / (parseFloat(params.host.sale_shift) / 10000).toFixed(4))

  return {balances, summ, fractions_on_sale}

}

async function getAllHelixBalances(bot, hostname) {
  let balances = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'balance4');
  return balances
}

async function getUserHelixBalances(bot, hostname, username, helix) {
  let balances = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'balance4');
  balances = balances.filter(bal => bal.owner == username)
  // console.log("balances.length", balances)

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
  let totalNominal = 0;
  let totalProfit = 0;

  balances.forEach((balance) => {
    if (balance.pool_color === 'white') {
      whiteBalances.push(balance);
      totalWhiteBalances = `${(parseFloat(totalWhiteBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
      totalBalances = `${(parseFloat(totalBalances) + parseFloat(balance.compensator_amount)).toFixed(4)} FLOWER`;
    } else {
      blackBalances.push(balance);
      totalBlackBalances = `${(parseFloat(totalBlackBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
      totalBalances = `${(parseFloat(totalBalances) + parseFloat(balance.compensator_amount)).toFixed(4)} FLOWER`;
    }

    totalNominal += parseFloat(balance.purchase_amount);

    // if (hostname) {
      if (parseFloat(balance.compensator_amount) > parseFloat(balance.purchase_amount)) {
        // if (helix.host.current_cycle_num > balance.cycle_num) {
        //   priorityBalances.push(balance);
        //   totalPriorityBalances = `${(parseFloat(totalPriorityBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
        // }

        // loseBalances.push(balance);
        // totalLoseBalances = `${(parseFloat(totalLoseBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
      // } else {
        totalProfit += (parseFloat(balance.compensator_amount) - parseFloat(balance.purchase_amount));

        winBalances.push(balance);
        totalWinBalances = `${(parseFloat(totalWinBalances) + parseFloat(balance.available)).toFixed(4)} FLOWER`;
      }
    // }
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
    totalProfit,
    totalNominal
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

  // let contract;

  // const totalShares = params.host.total_shares > 0 ? params.host.total_shares : 1;
  // const totalSharesAsset = `${((Number(userPower.power) / parseFloat(totalShares)) * parseFloat(params.host.quote_amount)).toFixed(4)} ${params.host.quote_symbol}`;
  // const sharesStake = ((100 * userPower.power) / totalShares).toFixed(4);

  // const skipForDemo = user.is_demo === false || !user.is_demo;

  // let toPrint = '';
  // toPrint += `\nКанал ${params.host.username.toUpperCase()}`;

  // toPrint += `\n\tРаунд: №${params.currentPool.pool_num}, цикл ${params.currentPool.cycle_num}`;
  // toPrint += `\n\tЦвет: ${params.currentPool.color === 'white' ? '⚪️ белый' : '⚫️ чёрный'}`;
  // toPrint += `\n\n\tДоходность одноцветных: +${params.incomeStep}%`;
  // toPrint += `\n\tДобро противоцветных: -${params.lossFactor}%`;

  // toPrint += `\n\n\tДо перезагрузки: ${params.currentPool.expired_time}`;
  // toPrint += `\n\tНа столе: ${params.currentPool.filled}`;
  // console.log(params.helix)
  // toPrint += `\n\tОсталось: ${params.currentPool.remain_quants / params.helix.quants_precision} фракций`;

  // toPrint += `\n\nМаксимальный взнос: ${maxDeposit === 0 ? 'не ограничен' : `${(maxDeposit / 10000).toFixed(4)} FLOWER`}`;
  // toPrint += '\n----------------------------------';

  // toPrint += '\nВаши вклады:';
  // toPrint += `\n\t⚪️ Белый баланс: ${balances.totalWhiteBalances}`;
  // toPrint += `\n\t⚫️ Чёрный баланс: ${balances.totalBlackBalances}`;

  // if (skipForDemo) {
    // toPrint += `\n\t💎 Опыт: ${totalSharesAsset} | ${sharesStake}%`;
  // }

  // toPrint += `\n\t🔗 В очереди: ${myTail.totalUserInTail}`;

  // if (hostname === bot.getEnv().DEMO_HOST) {
  //   contract = 'faketoken';
  //   const bal = await getLiquidBalance(bot, user.eosname, 'FLOWER', contract);
  //   toPrint += `\n\nВаш демо-баланс: ${bal}`;
  // } else {
  //   const bal = await getLiquidBalance(bot, user.eosname, 'FLOWER');
  //   toPrint += `\n\nВаш доступный баланс: ${bal}`;
  // }

  // const buttons = [];
  // let subscribedNow = false;

  // // eslint-disable-next-line no-param-reassign
  // if (!user.subscribed_to) user.subscribed_to = [];

  // if (user.subscribed_to.includes(hostname)) subscribedNow = true;

  // if (skipForDemo) buttons.push(Markup.button.callback('Назад', `backto helixs ${hostname}`));

  // buttons.push(Markup.button.callback('Обновить', `select ${hostname}`));

  // if (skipForDemo) {
  //   buttons.push(Markup.button.callback('Мой опыт', `showexp ${hostname} `));
    // buttons.push(Markup.button.callback('Цели', `showgoals ${hostname} `));
  // }

  // buttons.push(Markup.button.callback('Очередь', `tail ${hostname}`));

  // buttons.push(Markup.button.callback('Мои фракции', `mybalances ${hostname} `));

  // buttons.push(Markup.button.callback('Купить', `deposit ${hostname}`));

  // if (skipForDemo) {
  //   // if (subscribedNow) buttons.push(Markup.button.callback('✅ Подписка на обновления', `subscribe ${hostname}`));
  //   // else buttons.push(Markup.button.callback('☑️ Подписка на обновления', `subscribe ${hostname}`));
  // }

  // try {
  //   if (params.currentPool.expired_time === 'режим ожидания') {
  //     await ctx.deleteMessage();
  //     // eslint-disable-next-line max-len
  //     await sendMessageToUser(bot, user, { text: toPrint }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  //   } else {
  //     // console.log('params.currentPool.expired_time: ', params.currentPool.expired_time)
  //     await ctx.editMessageText(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  //   }
  // } catch (e) {
  //   // eslint-disable-next-line max-len
  //   await sendMessageToUser(bot, user, { text: toPrint }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
  // }
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
  const balances = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'balance4', balanceId, balanceId, 1);
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

async function getRefBalancesByStatus(bot, hostname, username) {
  let balances = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', username, 'refbalances');
  let status = await getPartnerStatus(bot, hostname, username);
  
  balances = balances.filter(el => el.level > status.level)
  let summ = 0
  balances.map(bal => {
    summ += parseFloat(bal.amount)
  })

  return (summ).toFixed(4) + " FLOWER"

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

  let refBalances = await getRefBalances(bot, user.eosname);
  let status = await getPartnerStatus(bot, "core", )
  refBalances = refBalances.filter(bal => bal.level > status.level)
  console.log(refBalances)

  const promises = refBalances.map((rb) => internalRefWithdrawAction(bot, user, rb));

  const results = await Promise.all(promises).catch((err) => {
    console.log('error on auto-ref-withdraw: ', err);
    return [];
  });
  const messagePromises = results.map((id) => {
    const target = refBalances.find((el) => Number(el.id) === Number(id));
    return sendMessageToUser(bot, user, { text: `Вы получили ${target.amount} от прибыли партнёра ${target.from.toUpperCase()} по фракциям ${target.host.toUpperCase()}` });
  });

  await Promise.all(messagePromises);
}

async function printWallet(bot, user) {
  const buttons = [];

  const status = await getPartnerStatus(bot, "core", user.eosname)

  // if(status.level == -1) {

    // buttons.push(Markup.button.callback('совершить взнос ⤴️', 'deposit'));
    // buttons.push(Markup.button.callback('совершить взнос ⤴️', 'deposit'));
    // buttons.push(Markup.button.callback('повысить статус 🔼', `buystatus ${JSON.stringify({})}`));

  // } else {
    buttons.push(Markup.button.callback('совершить взнос ⤴️', 'deposit'));
    buttons.push(Markup.button.callback('создать вывод ⤵️', 'prewithdrawbalance'));
    buttons.push(Markup.button.callback('внутренний перевод ➡️', 'transfer'));
    buttons.push(Markup.button.callback('моя структура 🔀', 'mypartners'));
    buttons.push(Markup.button.callback('повысить статус 🔼', `buystatus ${JSON.stringify({})}`));

  // }
  

  
  
  if (user && user.eosname) {

    const account = await bot.uni.readApi.getAccount(user.eosname);
    await withdrawAllUserRefBalances(bot, user);
    const refStat = await getRefStat(bot, user.eosname, 'FLOWER');
    
    const liquidBal = await getLiquidBalance(bot, user.eosname, 'FLOWER')

    const ram = `${((account.ram_quota - account.ram_usage) / 1024).toFixed(2)} kb`;

    // const balances = await getUserHelixBalances(bot, null, user.eosname);

    
    let hosts = await getHelixsList(bot)
    if (hosts.length > 0){
      let hostname = hosts[0].username
      
      const notAccessableRefBalance = await getRefBalancesByStatus(bot, hostname, user.eosname)
      const status = await getPartnerStatus(bot, hostname, user.eosname)
      console.log("status: ", status)
      const userPower = await bot.uni.coreContract.getUserPower(user.eosname, hostname);
      const balances = await getUserHelixBalances(bot, hostname, user.eosname);
      const assetBlockedNow = balances.totalBalances.replace("FLOWER", "FLOWER");

      const params = await getHelixParams(bot, hostname);
      
      let uPower = (userPower.power / params.helix.quants_precision).toFixed(4)
      let totalCost = parseFloat(params.currentRate.quant_sell_rate) * uPower


      const totalBal = `${(parseFloat(liquidBal) + parseFloat(assetBlockedNow)).toFixed(4)} FLOWER`;

      let text = '';
      const link = `https://t.me/${(await bot.telegram.getMe()).username}?&start=${user.eosname}`;

      text += '\n---------------------------------';
      text += `\n| Системное имя: ${user.eosname}`;
      text += `\n| Статус: ${status.status} ${status.icon}`;
      
      if (status.level > 0)
        text += `\n|\t\t\t\t\t до ${status.expiration}`
      
      text += `\n| Фракции: ${totalBal}`;//
      text += `\n|\t\t\t\t\tДоступные: ${liquidBal.replace("FLOWER", "FLOWER")}`;
      // text += `\n|\t\t\t\t\tЗаблокировано: ${assetBlockedNow.replace("FLOWER", "FLOWER")}`;
      text += `\n|\t\t\t\t\tПоступило от фракционеров: ${refStat.replace("FLOWER", "FLOWER")}`;
      text += `\n|\t\t\t\t\tЗаблокировано по статусу: ${notAccessableRefBalance.replace("FLOWER", "FLOWER")}`;
      
      // text += `\n|\t\t\t\t\tФракции: ${uPower} шт.\n`
      text += `\n|\t\t\t\t\tЗаложено: ${assetBlockedNow.replace("FLOWER", "FLOWER")}`
    

      // text += `\n| Ресурс аккаунта: ${ram} RAM`;

      text += '\n---------------------------------';
      text += `\n\nДля приглашения фракционеров используйте реферальную ссылку: ${link}\n`; //
      // eslint-disable-next-line max-len
      await sendMessageToUser(bot, user, { text }, {disable_web_page_preview: true, ...Markup.inlineKeyboard(buttons, { columns: 2 }).resize()});
    } else await sendMessageToUser(bot, user, { text: "Кооперативные участки не найдены" }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());

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
  })
}


async function sellBalance(bot, user, hostname, balanceId) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  
  let data = {
    username: user.eosname,
    host: hostname,
    balance_id: balanceId,
  }

  console.log(data)

  await eos.transact({
    actions: [{
      account: 'unicore',
      name: 'sellbalance',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: data,
    }],
  }, {
    blocksBehind: 3,
    expireSeconds: 30,
  })
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
  

  let helixs = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', bot.getEnv().CORE_HOST, 'ahosts');
  helixs = helixs.filter((el) => el.username !== bot.getEnv().DEMO_HOST);
  return helixs;
}

async function internalRefreshAction(bot, balance, username) {
  const eos = await bot.uni.getEosPassInstance(bot.getEnv().REFRESHER);
  console.log("REFRESH:", balance)
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
          host: balance.host,
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
    const collection = db.collection(`helixUsers_${bot.instanceName}`);
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


async function getForecast(bot, hostname, params){
  // console.log(params)
  let currentPool = params.currentPool
  let pools = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'pool', currentPool.id - currentPool.pool_num + 1, currentPool.id, 100);
  console.log(currentPool)
  
  const bcinfo = await bot.eosapi.getInfo({});
  const bctime = await new Date(bcinfo.head_block_time);

  const firstPoolStartedAt = await new Date(pools[0].pool_started_at);
  
  let cycleTimeInSeconds = (bctime - firstPoolStartedAt ) / 1000
  console.log('timeIncome: ', cycleTimeInSeconds)
  let humanResult = timestampToDHMS(cycleTimeInSeconds);
  console.log('human: ', humanResult)

  const targetRates = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'rate', params.currentPool.pool_num - 1, params.currentPool.pool_num, 2);
  
  console.log(targetRates)
  
  let factIncomeInCycle = parseFloat(targetRates[0].total_in_box) - parseFloat(targetRates[0].pool_cost) + parseFloat(currentPool.filled)
  
  let realRemainForHalfRotate = parseFloat(currentPool.remain).toFixed(4) + params.host.quote_symbol

  let realRemainForRotate = parseFloat(realRemainForHalfRotate) + parseFloat(targetRates[1].live_balance_for_sale)
  

  console.log("factIncomeInCycle: ", factIncomeInCycle)
  console.log("realRemainForRotate: ", realRemainForRotate)
  let factCycleIncomeInFlowersPerSecond = factIncomeInCycle / cycleTimeInSeconds

  let factCycleIncomeInFlowersPerMonth = factCycleIncomeInFlowersPerSecond * 86400 * 30
  // const targetRates = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'rate', params.currentPool.pool_num - 1, params.currentPool.pool_num + 1, 1000);
  console.log("factCycleIncomeInFlowersPerMonth: ", factCycleIncomeInFlowersPerMonth)
  
  //TODO filter pools, which older then 1 month
  //TODO add fact business budget per month

  let forecastedPercentIncomePerMonth = (factCycleIncomeInFlowersPerMonth / realRemainForRotate * 100).toFixed(4)
  console.log("forecastedPercentIncomePerMonth per mounth:", forecastedPercentIncomePerMonth)

  let forecastedTimeForRotate = realRemainForRotate / factCycleIncomeInFlowersPerSecond

  let forecastedTimeForHalfRotate = parseFloat(realRemainForHalfRotate) / factCycleIncomeInFlowersPerSecond

  return {forecastedPercentIncomePerMonth, forecastedTimeForRotate, forecastedTimeForHalfRotate}
}

async function printUserFractions(bot, ctx, user, hostname, nextIndex) {

  const userPower = await bot.uni.coreContract.getUserPower(user.eosname, hostname);
  const balances = await getUserHelixBalances(bot, hostname, user.eosname);

  const params = await getHelixParams(bot, hostname);
  
  let uPower = (userPower.power / params.helix.quants_precision).toFixed(4)
  let totalCost = parseFloat(params.currentRate.quant_sell_rate) * uPower


  let text = `Фракции ${hostname.toUpperCase()}\n`
  text += '------------------------------\n';
  text += `У вас: ${uPower} фракций\n`
  // text += `\nКурс: ${params.currentRate.quant_sell_rate.replace("FLOWER", "FLOWER")} за фракцию\n`
  // text += `\nПрирост: ${(balances.totalProfit).toFixed(4)} FLOWER`
  // text += `\n\t\t\t +${5}% на росте курса`;
  // text += `\n\nДоходность: `
  // text += `\n\t\t\t +${5}% на росте пула`;
  // text += `\n\nДоля: `
  // text += `\n\t\t\t +${5}% на росте пула`;
  text += `\nСтоимость: ${totalCost.toFixed(4)} FLOWER`
  
  text += '\n------------------------------';
  // text += uPower
  
  const buttons = [];

  buttons.push(Markup.button.callback('продать', `printbalances`));
  buttons.push(Markup.button.callback('обновить', `refreshaction`));
    

  ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize())


}

async function printUserBalances(bot, ctx, user, hostname, nextIndex, fresh) {
  const balances = await getUserHelixBalances(bot, hostname, user.eosname);
  const params = await getHelixParams(bot, hostname);
  // const estimateSysIncome = await getEstimateSystemIncome(bot, params.host.ahost, params);
  

  const currentIndex = nextIndex || 0;
  const currentBalance = balances.all[currentIndex];
  console.log("ON PRINT", currentIndex)
  console.log("currentBalance: ", currentBalance)

  if (currentBalance) {
    // let isPriority = false;
    // eslint-disable-next-line max-len
    // const priorBal = balances.priorityBalances.find((el) => Number(el.id) === Number(currentBalance.id));

    // if (priorBal) isPriority = true;

    const buttons = [];
    if (balances.all.length === 1) {
      // buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));
    } else {
      if (currentIndex === 0) buttons.push(Markup.button.callback('❎ Предыдущая', `nothing`));
      else 
        buttons.push(Markup.button.callback(`⬅️ Предыдущая`, `mybalances ${hostname} ${currentIndex - 1}`));

      if (balances.all.length - 1 - currentIndex === 0) buttons.push(Markup.button.callback('❎ Следующая', `nothing`));
      else 
        buttons.push(Markup.button.callback(`Следующая ➡️`, `mybalances ${hostname} ${currentIndex + 1}`));
    }

    buttons.push(Markup.button.callback('🔄 Обновить', `refreshaction ${hostname} ${currentBalance.id} ${currentIndex}`));
    

    if (currentBalance.status == "onsell") {
    
      buttons.push(Markup.button.callback('🟢 отменить замещение', `precancelsell ${hostname} ${currentBalance.id}`));
    
    } else if (currentBalance.status == "solded") {

      buttons.push(Markup.button.callback('🟢 вывести баланс', `precancelsell ${hostname} ${currentBalance.id}`));

    }

    else {

      buttons.push(Markup.button.callback('🛑 Требовать', `prewithdrawaction ${hostname} ${currentBalance.id}`));
    }

    // buttons.push(Markup.button.callback('Вывести прибыль', `withdrawaction ${hostname} ${currentBalance.id}`));
    
    // if (isPriority) buttons.push(Markup.button.callback('Войти в очередь', `prioroneaction ${hostname} ${currentBalance.id}`));

    let toPrint = '';
    // toPrint += `\nВзнос на ${currentBalance.pool_num} ${currentBalance.pool_color === 'white' ? '⚪️ белый' : '⚫️ чёрный'} стол ${currentBalance.cycle_num} цикла:`;
    // toPrint += `\n\t\t${currentBalance.purchase_amount}`;
    
    toPrint += `\nКлуб тDAO #${currentBalance.id}`//${hostname.toUpperCase()}

    let forecast = await getForecast(bot, hostname, params)
      
    // if (parseFloat(currentBalance.compensator_amount) > 0) toPrint += `\n\nНа крайнем одноцветном столе:\n\t\t${currentBalance.compensator_amount}`;

    // toPrint += `\n\nДоступно сейчас:\n\t\t${currentBalance.available}`; // (${parseFloat(currentBalance.root_percent / 10000).toFixed(1)}%)
    // TODO отобразить в следующем цикле
    let income = ((parseFloat(currentBalance.compensator_amount) / parseFloat(currentBalance.purchase_amount)) * 100 - 100).toFixed(1)
    //let current_step = 1 + (currentBalance.pool_num - 1) / 2 ;
    let current_step = currentBalance.pool_num

    if (parseFloat(currentBalance.available) >= parseFloat(currentBalance.purchase_amount)) {
      toPrint += `\n🟢 входящее предложение`
      toPrint += '\n------------------------------';
      toPrint += `\nСтол вклада: ${current_step} ${currentBalance.pool_color === 'white' ? '⚪️' : '⚫️'} `;
      
      toPrint += `\nДоступно: ${currentBalance.available.replace("FLOWER", "FLOWER")}`;
      toPrint += `\nДоход: +${income}%`;
      toPrint += `\n\t\tНоминал: ${currentBalance.purchase_amount.replace("FLOWER", "FLOWER")}`;
      toPrint += `\n\t\tПрибыль: +${(parseFloat(currentBalance.available) - parseFloat(currentBalance.purchase_amount)).toFixed(4) } FLOWER`;//${params.host.quote_symbol}
      
      toPrint += '\n------------------------------';
      toPrint += `\nКлуб предлагает заместить вашу фракцию с прибылью +${income}%. Предложение активно до открытия следующего стола распределения фракций.`
      
      
      // toPrint += `\nПрогноз дохода: +${params.incomeStep}% через ${timestampToDHMS(forecast.forecastedTimeForRotate)} секунд`;
      
    } else {
      
      let last_print

      if (currentBalance.status == "onsell"){
        toPrint += `\n🔴 на замещении`
        last_print = `Ваша фракция находится на обмене с фракционерами. Вы можете выводить блага из баланса заложенной фракции по мере их поступления.`
        toPrint += '\n------------------------------';
        toPrint += `\nСтол вклада: ${current_step} ${currentBalance.pool_color === 'white' ? '⚪️' : '⚫️'}`;
        toPrint += `\nНа замещении: ${currentBalance.compensator_amount.replace("FLOWER", "FLOWER")}`;
        toPrint += `\nПолучено: ${currentBalance.solded_for.replace("FLOWER", "FLOWER")}`;
        
      }
      
      if (currentBalance.status == "solded") {
        toPrint += `\n🔵 замещение завершено`
        toPrint += '\n------------------------------';
        toPrint += `\nСтол вклада: ${current_step} ${currentBalance.pool_color === 'white' ? '⚪️' : '⚫️'} `;
        toPrint += `\nНа замещении: ${currentBalance.compensator_amount.replace("FLOWER", "FLOWER")}`;
        toPrint += `\nПолучено: ${currentBalance.solded_for.replace("FLOWER", "FLOWER")}`;
        // toPrint += `\n\t\tНоминал: ${currentBalance.purchase_amount.replace("FLOWER", "FLOWER")}`;
        // toPrint += `\n\t\tПрибыль: +${(parseFloat(currentBalance.compensator_amount) - parseFloat(currentBalance.purchase_amount)).toFixed(4) } FLOWER`;//${params.host.quote_symbol}
        
        last_print = `Ваша фракция замещена. Вы можете вывести блага из баланса фракции, нажав на кнопку "вывести баланс".`
        
      }
      
      if (currentBalance.status == "process") {
        toPrint += `\n🟡 фракции в обороте`
        toPrint += '\n------------------------------';
        toPrint += `\nСтол вклада: ${current_step} ${currentBalance.pool_color === 'white' ? '⚪️' : '⚫️'} `;
        
        toPrint += `\nДоступно: ${currentBalance.compensator_amount.replace("FLOWER", "FLOWER")}`;
        toPrint += `\nДоход: +${income}%`;
        toPrint += `\n\t\tНоминал: ${currentBalance.purchase_amount.replace("FLOWER", "FLOWER")}`;
        toPrint += `\n\t\tПрибыль: +${(parseFloat(currentBalance.compensator_amount) - parseFloat(currentBalance.purchase_amount)).toFixed(4) } FLOWER`;//${params.host.quote_symbol}
        
        last_print = `Ваша фракция находится в обороте. В случае её требования, блага поступят на баланс, когда фракция будет замещена.`
        
      }
      

      
      // toPrint += `\nШтраф моментальной продажи: ${((parseFloat(currentBalance.available) / parseFloat(currentBalance.purchase_amount)) * 100 - 100).toFixed(1)}%`;
      // toPrint += `\n\t\tНоминал: ${currentBalance.purchase_amount}`;
      // toPrint += `\n\t\tУбыток: -${(parseFloat(currentBalance.available) - parseFloat(currentBalance.purchase_amount)).toFixed(4) } ${params.host.quote_symbol}`;
      

      toPrint += '\n------------------------------';
      toPrint += `\n${last_print}`
      
      // toPrint += `\nПрогноз дохода: +${params.incomeStep}% через ${timestampToDHMS(forecast.forecastedTimeForHalfRotate)}`
      
    }

    try {

      // eslint-disable-next-line max-len
      if (nextIndex === undefined || fresh === true) await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      else {
        try{
          await ctx.deleteMessage()
        } catch(e){}
        await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      }
        //ctx.editMessageText(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());

    } catch(e){
      ctx.reply(e.message)
      console.log('ERROR: ', e.messace)
    }

  } else {
    const buttons = [];
    // buttons.push(Markup.button.callback('Назад', `backto helixs`));
    // if (nextIndex > 0)
      await ctx.reply(`У вас нет прав требования FLOWER. Для получения прав, заложите FLOWER в любой клуб.`); // Markup.inlineKeyboard(buttons, { columns: 2 }).resize()
    // await printHelixs(bot, ctx, user);
  }
}



async function cancelSellAction(bot, ctx, user, hostname, balanceId) {
  const bal = await getOneUserHelixBalance(bot, hostname, user.eosname, balanceId);

    try {
      await ctx.deleteMessage();
      const eos = await bot.uni.getEosPassInstance(user.wif);

      await eos.transact({
        actions: [{
          account: 'unicore',
          name: 'cancelsellba',
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
      })

      if (parseFloat(bal.solded_for) > 0){
        ctx.reply(`Замещение фракций отменено, вы получили ${bal.solded_for.replace("FLOWER", "FLOWER")}`)
      } else {
        ctx.reply(`Замещение фракций отменено`)  
      }
      
      
      await printUserBalances(bot, ctx, user, hostname);

      
    } catch (e) {
      ctx.replyWithHTML(`Произошла ошибка при отмене замещении фракций: ${e.message}`);
    }

}
async function withdrawAction(bot, ctx, user, hostname, balanceId) {
  const bal = await getOneUserHelixBalance(bot, hostname, user.eosname, balanceId);

    try {
      await ctx.deleteMessage();
      if (bal.win == 1) {
        
        await internalWithdrawAction(bot, user, hostname, balanceId)
        ctx.reply(`Вы получили ${bal.available.replace("FLOWER", "FLOWER")} с чистой прибылью ${bal.root_percent / 10000}%`);
      
      } else {

        if (bal.last_recalculated_win_pool_id > bal.global_pool_id && bal.pool_num > 2){
          await sellBalance(bot, user, hostname, balanceId)
          
          ctx.reply(`Ваш баланс фракций поставлен на замещение. Когда замещение будет завершено, вы получите ${bal.compensator_amount.replace("FLOWER", "FLOWER")}`);

        } else {
          await internalWithdrawAction(bot, user, hostname, balanceId)
          ctx.reply(`Вы получили ${bal.available.replace("FLOWER", "FLOWER")}`);
        }
      }
      
      await printUserBalances(bot, ctx, user, hostname);

      // TODO get partner/withdraw balance and notify
      await withdrawPartnerRefBalance(bot, user.eosname);
      
    } catch (e) {
      if (e.message == "assertion failure with message: Cannot withdraw not refreshed balance. Refresh Balance first and try again." || e.message == "assertion failure with message: Cannot sell not refreshed balance. Refresh Balance first and try again.")
        ctx.replyWithHTML(`Оупс! Что-то изменилось! Пожалуйста, обновите ваш баланс.`);
      else
        ctx.replyWithHTML(`Произошла системная ошибка при требовании. Пожалуйста, обратитесь в поддержку @knouni_bot с сообщением: ${e.message}`);
    }

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
  
  const params = await getHelixParams(bot, hostname);
  let text = `Внимание! Открыт новый стол распределения фракций ${hostname.toUpperCase()} по курсу ${params.currentPool.quant_cost.replace("FLOWER", "FLOWER")}! Дешевле уже не будет.`

  const balances = await getAllHelixBalances(bot, hostname);
    

  // eslint-disable-next-line no-restricted-syntax
  for (const user of users) {
    let bals = balances.filter(b => b.owner == user.eosname)
    let win_bals = bals.filter(b => b.win == 1)
    
    if (win_bals.length > 0) {

      text += `\n\nКлуб предлагает заложить ваши фракции с прибылью от +5%. `
      await sendMessageToUser(bot, user, { text });

    } else {
      text += `\n\nЗаложите фракцию и получите долю в фондах выбранного кооперативного участка.`
      await sendMessageToUser(bot, user, { text });

    }
    
    // eslint-disable-next-line no-await-in-loop
    
  }
}


async function autoHostRefresh(bot) {
  const helixs = await getHelixsList(bot);
  console.log("on auto update")
  // eslint-disable-next-line no-restricted-syntax
  for (const helix of helixs) {
    // try {
    //   // eslint-disable-next-line no-await-in-loop
    //   await refreshState(bot, helix.username, { wif: bot.getEnv().REFRESHER, eosname: 'refresher' });
    // } catch (e) {
    //   console.log('ERROR ON AUTO HOST REFRESH!', e);
    // }

    const [onupdate] = await lazyFetchAllTableInternal(bot.eosapi, 'eosio', 'eosio', 'onupdate', helix.username, helix.username, 1);
    console.log(onupdate)
    if (onupdate.update_balances_is_finish == 1) {

      // eslint-disable-next-line no-await-in-loop
      const oldParams = await getDbHost(bot.instanceName, helix.username);

      // eslint-disable-next-line no-await-in-loop
      const newParams = await getHelixParams(bot, helix.username);

      newParams.new_cycle_sent_to = [];
      // eslint-disable-next-line no-await-in-loop
      await saveDbHost(bot.instanceName, newParams);

      if (newParams) {
        // if (oldParams.host.current_cycle_num < newParams.host.current_cycle_num) {
        //   // TODO notify about new cycle
        //   console.log('start notify cycle');
        //   // eslint-disable-next-line no-await-in-loop
        //   await notifyNewCycle(bot, helix.username, newParams);
        // }

        if (!oldParams || oldParams.host.current_pool_num < newParams.host.current_pool_num) {
          console.log('start notify table');
          // eslint-disable-next-line no-await-in-loop
          await notifyNewTable(bot, helix.username);
        }
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

async function getEstimateSystemIncome(bot, hostname, params) {
  // console.log('params:L ', params)
  const targetRates = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'rate', params.currentPool.pool_num - 1, params.currentPool.pool_num + 1, 1000);
  const systemRates = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', 'unicore', 'gpercents');
  // console.log('targetRates:', targetRates)

  // eslint-disable-next-line max-len
  let freeFlowPercent = ((parseFloat(targetRates[2].system_income) - parseFloat(targetRates[1].system_income)) / parseFloat(targetRates[1].live_balance_for_sale)).toFixed(1) * 100;

  let current_hfund_income = parseFloat(targetRates[0].system_income) / 1000000 * params.host.hfund_percent
  console.log("targetRates[0]: ", targetRates[0])
  console.log("currentPool: ", params.currentPool)
  let current_fractionary_box = 0
  let fraction_income_per_month = 0
  let target_business_income = 0.5
  
  if (params.currentPool.pool_num - 1 == 0) {
    current_fractionary_box = 0
  }
  else {
  
    current_fractionary_box = parseFloat(targetRates[0].total_in_box) - parseFloat(params.currentPool.remain)
    target_business_income = 0.05;//5% на cредства DAC распределяется на всех фракционеров

    fraction_income_per_month = (current_hfund_income * target_business_income / 1000000 * params.host.hfund_percent / current_fractionary_box * 100).toFixed(4)
    console.log("fraction_income_per_month: ", fraction_income_per_month)

  }
  console.log("CURRENT DAC INCOME: ", current_hfund_income)
  console.log("current_fractionary_box", current_fractionary_box, params.host.hfund_percent)


  // let factIncome = 100.0000 //месяц (поставляем из блокчейна)
  let untilFullRotate = parseFloat(params.currentPool.remain) + parseFloat(targetRates[1].live_balance_for_sale)
  // console.log('untilFullRotate: ', untilFullRotate)
  
  // let estimatePercent = (factIncome / untilFullRotate) * 100
  // console.log('estimatePercent: ', estimatePercent)
  // console.log(params.currentPool)
  console.log(targetRates)
  



  const growth = parseFloat(targetRates[2].sell_rate) / parseFloat(targetRates[0].buy_rate);
  // eslint-disable-next-line max-len
  const systemIncomeDiff = (parseFloat(targetRates[2].system_income) - parseFloat(targetRates[0].system_income)) / 2;

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
    // forecastedPercentIncome: forecastedPercentIncome,
    free_flow_percent: freeFlowPercent,
    system_percent: systemPercent,
    system_flow: systemFlow,
    free_ref_percent: freeRefPercent,
    until_full_rotate: untilFullRotate,
    fraction_income_per_month: fraction_income_per_month
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

    const estimateSysIncome = await getEstimateSystemIncome(bot, params.host.ahost, params);
    const forecast = await getForecast(bot, params.host.ahost, params)

    const buttons = [];

    if (helixs.length > 1) {
      buttons.push(Markup.button.callback(`⬅️ Предыдущая (${currentIndex})`, `next ${currentIndex - 1}`));
      buttons.push(Markup.button.callback(`Следующая (${helixs.length - 1 - currentIndex}) ➡️`, `next ${currentIndex + 1}`));
    }

    // buttons.push(Markup.button.callback('Купить', `select ${currentHelix.username}`));
    buttons.push(Markup.button.callback(' ❇️ Заложить FLOWER', `deposit ${params.host.username}`));

    // let incomeForecast = await calculateEstimateIncome(bot, hostname, params)
    let fractions_on_sale = await getBalancesOnSale(bot, params.host.username, user.eosname, params)
    console.log("balances on sale: ", fractions_on_sale)
    // let current_step = 1 + (params.currentPool.pool_num - 1) / 2 
    let current_step = params.currentPool.pool_num
    
    let toPrint = '';
    toPrint += `\nКлуб ${currentHelix.username.toUpperCase()}`;
    
    toPrint += '\n------------------------------';
    // toPrint += `\n${currentHelix.title}`;
    toPrint += `\nКлуб фракционеров телеграма`
    // toPrint += `\nЦвет: ${params.currentPool.color === 'white' ? '⚪️ белый' : '⚫️ чёрный'}`;
    // toPrint += `\nПрогнозируемая доходность: +${forecast.forecastedPercentIncomePerMonth}% в месяц`;
    toPrint += `\n\nСтол: ${current_step} ${params.currentPool.color === 'white' ? '⚪️' : '⚫️'} `;
    
    // toPrint += `\nНа распределении: ${(params.currentPool.remain_quants / params.helix.quants_precision + parseFloat(fractions_on_sale.fractions_on_sale)).toFixed(0)} FRACTION`;
    // toPrint += `\nКурс конвертации: ${params.currentPool.quant_cost.replace("FLOWER", "FLOWER")} / FRACTION`;
    toPrint += `\nДо следующего стола: ${params.currentPool.remain.replace("FLOWER", "FLOWER")}`;
    
    toPrint += `\n\nПрогноз дохода: `;
    toPrint += `\n\t\t\t +${params.incomeStep}% за полный стол;`;
    toPrint += `\n\t\t\t +${estimateSysIncome.fraction_income_per_month}% в месяц;`;
    // toPrint += `\nДобро противоцветных: -${params.lossFactor}%`;

    if (params.host.referral_percent > 0) {
      toPrint += '\n\nПодарки от партнеров: ';
      toPrint += `${params.host.levels.map((el, index) => `\n\t\t\t\t\t\t\t\t\t - уровень ${index + 1}: ${parseFloat(((Number(el) * (estimateSysIncome.free_ref_percent / 10000) * (params.host.referral_percent / 10000))) / 100 / 100).toFixed(2)}%`)}`;
    }

    // toPrint += `\n\nОписание: `;
    // toPrint += `\n\n${currentHelix.purpose}`;

    toPrint += '\n------------------------------';
    // toPrint += `\nВаш вклад: ${totalInHelix}`;
    toPrint += `\nℹ️ Фактическая доходность может отличаться от прогнозной. Доходность зависит от спроса на фракции и эффективности кооперации.`;

    // TODO если есть опыт - обновить и вывести опытный поток
    // Если что-то начислено - обновить карточку и сообщить отдельным сообщением
    //
    try{

      if (hostname) {
        await ctx.editMessageText(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      } else if (nextIndex === undefined) {
        await ctx.replyWithHTML(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      } else {
        await ctx.editMessageText(toPrint, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
      }
    } catch(e){
      console.log('on CATCH!')
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


async function payStatus(bot, hostname, user, status, amount) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  return eos.transact({
    actions: [{
      account: 'eosio.token',
      name: 'transfer',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: {
        from: user.eosname,
        to: "unicore",
        quantity: amount,
        memo: `800-${hostname}-${status}`
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
  transferToGateAction,
  getHelixParams,
  getUserHelixBalances,
  printHelixWallet,
  refreshState,
  transferAction,
  getLiquidBalance,
  getOneUserHelixBalance,
  printWallet,
  printUserBalances,
  printUserFractions,
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
  cancelSellAction,
  getHelixsList,
  getBalancesOnSale,
  payStatus,
  getAllHelixBalances,
  getPartnerStatus
};
