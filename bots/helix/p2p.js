const { encrypt, decrypt } = require('eos-encrypt');
const { Markup } = require('telegraf');
const btoa = require('btoa');
const atob = require('atob');
const { backToMainMenu } = require('./utils/bot');
const { notifyByEmail } = require('./utils/email');
const { lazyFetchAllTableInternal } = require('./utils/apiTable');
const {
  loadDB, getUserByEosName, saveUser, getUser,
} = require('./db');
const { sendMessageToUser } = require('./messages');

async function getOrders(bot) {
  const orders = await lazyFetchAllTableInternal(bot.eosapi, 'p2p', 'p2p', 'orders');

  orders.forEach((el) => {
    try {
      // eslint-disable-next-line no-param-reassign
      el.details = JSON.parse(el.details);
      // eslint-disable-next-line no-param-reassign
      el.root_remain_float = parseFloat(el.root_remain);
    } catch (e) {
      // eslint-disable-next-line no-param-reassign
      el.details = { address: el.details };
    }
  });

  return orders;
}

async function getMyOrders(bot, username) {
  const orders = await lazyFetchAllTableInternal(bot.eosapi, 'p2p', 'p2p', 'orders', username, username, 100, 5, 'i64');

  orders.forEach((el) => {
    try {
      // eslint-disable-next-line no-param-reassign
      el.details = JSON.parse(el.details);
      // eslint-disable-next-line no-param-reassign
      el.root_remain_float = parseFloat(el.root_remain);
    } catch (e) {
      // eslint-disable-next-line no-param-reassign
      el.details = { address: el.details };
    }
  });

  return orders;
}

async function delOrder(bot, orderId, username) {
  const user = await getUserByEosName(bot.instanceName, username);

  const eos = await bot.uni.getEosPassInstance(user.wif);

  try {
    await eos.transact({
      actions: [{
        account: 'p2p',
        name: 'del',
        authorization: [{
          actor: username,
          permission: 'active',
        }],
        data: {
          username,
          id: orderId,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });
  } catch (e) {
    console.error(e);
  }
}

async function encryptMessage(bot, wif, to, message) {
  // eslint-disable-next-line no-param-reassign
  message = btoa(unescape(encodeURIComponent(message)));

  const account = await bot.uni.readApi.getAccount(to);
  const pactivekey = account.permissions.find((el) => el.perm_name === 'active');
  const pkey = pactivekey.required_auth.keys[0].key;
  return encrypt(wif, pkey, message, { maxsize: 10000 });
}

async function decryptMessage(bot, wif, from, message) {
  let pactivekey; let pkey; let
    decryptedMessage;
  const account = await bot.uni.readApi.getAccount(from);

  try {
    pactivekey = account.permissions.find((el) => el.perm_name === 'gateway');
    pkey = pactivekey.required_auth.keys[0].key;
    decryptedMessage = decrypt(wif, pkey, message);
    decryptedMessage = decodeURIComponent(escape(atob(decryptedMessage)));

    return decryptedMessage;
  } catch (e) {
    try {
      pactivekey = account.permissions.find((el) => el.perm_name === 'active');
      pkey = pactivekey.required_auth.keys[0].key;
      decryptedMessage = decrypt(wif, pkey, message);
      decryptedMessage = decodeURIComponent(escape(atob(decryptedMessage)));

      return decryptedMessage;
    } catch (e2) {
      console.log(e2.message);
    }
  }

  return '';
}

async function getOrder(bot, orderId) {
  const orders = await lazyFetchAllTableInternal(bot.eosapi, 'p2p', 'p2p', 'orders', orderId, orderId);

  orders.forEach((el) => {
    try {
      // eslint-disable-next-line no-param-reassign
      el.details = JSON.parse(el.details);
      // eslint-disable-next-line no-param-reassign
      el.root_remain_float = parseFloat(el.root_remain);
    } catch (e) {
      // empty
    }
  });

  return orders[0];
}

async function getOrdersAndCheckThem(bot) {
  const db = await loadDB();

  const collection = db.collection(`helixUsers_${bot.instanceName}`);

  const users = await collection.find({ $and: [{ orderStatus: { $ne: 'finish' } }, { orderStatus: { $ne: null } }] }).toArray();
  const orders = await getOrders(bot);

  // eslint-disable-next-line no-restricted-syntax
  for (const user of users)
    if (user.active_order) {
      const order = orders.find((o) => Number(o.id) === Number(user.active_order.id));

      if (order && order.status === 'process' && (user.orderStatus === 'waiting' || user.orderStatus === 'waiting2')) {
      // TODO NOTIFY
        // eslint-disable-next-line no-await-in-loop
        const creator = await getUserByEosName(bot.instanceName, order.creator);

        if (creator) {
          const buttons3 = [];
          buttons3.push(Markup.button.callback('Отменить заявку', `cancelorder ${user.active_order.id}`));

          buttons3.push(Markup.button.callback('Подтвердить оплату', `confirmbuyorder ${order.id}`));

          // TODO decrypt message
          // eslint-disable-next-line no-await-in-loop,max-len
          const address = await decryptMessage(bot, creator.wif, order.parent_creator, order.details.address);
          // eslint-disable-next-line no-await-in-loop
          await sendMessageToUser(bot, creator, { text: `Перевод средств\n\nПартнёр ${order.parent_creator} подтвердил готовность принять средства. Совершите перевод ${order.out_quantity} ${order.details.network ? `в сети ${order.details.network}` : ''} по реквизитам в следующем сообщении.\n\nВНИМАНИЕ: сумма зачисления должна в точности равняться сумме в заявке.` });

          setTimeout(
            () => sendMessageToUser(bot, creator, { text: `${address}` }, Markup.inlineKeyboard(buttons3, { columns: 2 }).resize()),
            3 * 1000,
          );

          // eslint-disable-next-line no-await-in-loop
          // await notifyByEmail(creator.eosname, 1);
        } else {
          // eslint-disable-next-line no-await-in-loop
          // await notifyByEmail(order.parent_creator, 1);
        }

        user.active_order = order;
        user.orderStatus = order.status;
        // eslint-disable-next-line no-await-in-loop
        await saveUser(bot.instanceName, user);
      } else if (order && order.status === 'payed' && (user.orderStatus === 'process' || user.orderStatus === 'waiting2')) {
        // eslint-disable-next-line no-await-in-loop
        const parentCreator = await getUserByEosName(bot.instanceName, order.parent_creator);
        const buttons = [];
        buttons.push(Markup.button.callback('Не получил', 'disputeorder'));

        buttons.push(Markup.button.callback('Подтверждаю', `approvebuyorder ${order.id}`));

        // eslint-disable-next-line no-await-in-loop
        if (parentCreator) await sendMessageToUser(bot, parentCreator, { text: `Подтверждение\n\nПартнёр сообщил об отправке средств. Пожалуйста, сфокусируйтесь и проверьте поступление средств: ${order.out_quantity}.` }, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
        // eslint-disable-next-line no-await-in-loop
        // else await notifyByEmail(user.active_order.parent_creator, 2);

        user.active_order = order;
        user.orderStatus = order.status;
        // eslint-disable-next-line no-await-in-loop
        await saveUser(bot.instanceName, user);
      } else if (order && order.status === 'finish' && (user.orderStatus === 'payed' || user.orderStatus === 'waiting2')) {
        // eslint-disable-next-line no-await-in-loop
        const creator = await getUserByEosName(bot.instanceName, order.creator);

        // eslint-disable-next-line no-await-in-loop
        if (creator) await sendMessageToUser(bot, creator, { text: 'Обмен успешно завершён\n\nТеперь вы можете положить свои цветки на стол в кассе и извлекать прибыль по правилам системы.' });
        // eslint-disable-next-line no-await-in-loop
        // else await notifyByEmail(user.active_order.parent_creator, 2);

        // eslint-disable-next-line no-await-in-loop
        const parentOrder = await getOrder(bot, order.parent_id);

        if (parentOrder && parentOrder.root_completed === parentOrder.root_quantity) {
          // eslint-disable-next-line no-await-in-loop
          const parentCreator = await getUserByEosName(bot.instanceName, parentOrder.creator);

          // eslint-disable-next-line no-await-in-loop
          if (parentCreator) await delOrder(bot, parentOrder.id, parentCreator.eosname);
        }

        // eslint-disable-next-line no-await-in-loop
        await delOrder(bot, order.id, user.eosname);

        user.order_action = {};
        user.orderStatus = null;
        user.active_order = null;
        // eslint-disable-next-line no-await-in-loop
        await saveUser(bot.instanceName, user);
      } else {
        // console.log('NOT MODIFY')
      }
    }
}

async function cancelOrder(bot, orderId, ctx) {
  const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
  const eos = await bot.uni.getEosPassInstance(user.wif);
  const order = await bot.uni.p2pContract.getOrder(orderId);
  let parentCreator;
  let creator;

  if (order && order.parent_creator !== '') parentCreator = await getUserByEosName(bot.instanceName, order.parent_creator);

  if (order) creator = await getUserByEosName(bot.instanceName, order.creator);

  console.log('on cancel: ', user.eosname, orderId);

  try {
    await eos.transact({
      actions: [{
        account: 'p2p',
        name: 'cancel',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          username: user.eosname,
          id: orderId,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    // NOTIFY user
    user.order_action = {};
    user.active_order = null;
    user.orderStatus = '';
    saveUser(bot.instanceName, user).then();

    if (parentCreator)
      await sendMessageToUser(bot, parentCreator, { text: 'Заявка на обмен отменена.' });

    if (creator)
      await ctx.editMessageText(creator, { text: 'Заявка на обмен отменена.' });
  } catch (e) {
    console.error(e);
    await backToMainMenu(ctx, `Ошибка: ${e.message}`);
  }
}

async function getDetails(suffix, eosname, currency) {
  try {
    const db = await loadDB();
    const collection = db.collection(`details_${suffix}`);
    const details = await collection.findOne({ eosname, currency });

    if (details) return details.details;
  } catch (e) {
    console.log('error: ', e.message);
  }

  return '';
}

async function acceptBuyOrder(bot, orderId, user, isAuto) {
  let outSymbol = 'USDT';

  if (!isAuto) outSymbol = user.order_action.data.out_symbol;

  const orders = await bot.uni.p2pContract.getOrders();
  const order = orders.find((o) => Number(o.id) === Number(orderId));

  const eos = await bot.uni.getEosPassInstance(user.wif);

  if (order && user.order_action.data) {
    const details = await getDetails(bot.instanceName, user.eosname, outSymbol);
    const address = await encryptMessage(bot, user.wif, order.creator, details);

    await eos.transact({
      actions: [{
        account: 'p2p',
        name: 'accept',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          username: user.eosname,
          id: order.id,
          details: JSON.stringify({
            network: (outSymbol === 'USDT' ? 'TRC20' : ''),
            address,
          }),
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    await sendMessageToUser(bot, user, { text: 'Ожидание\n\nОжидаем обработки заявки. Вы получите оповещение, как только обработка будет завершена. В настоящий момент, все заявки обрабатываются полу-автоматически, и этот процесс может занять от нескольких минут до нескольких часов.' });
  } else
    await sendMessageToUser(bot, user, { text: 'Ордер отменён партнёром и не может быть принят.' });
}

async function approveActiveBuyOrder(bot, user, orderId) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  await eos.transact({
    actions: [{
      account: 'p2p',
      name: 'approve',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: {
        username: user.eosname,
        id: orderId,
      },
    }],
  }, {
    blocksBehind: 3,
    expireSeconds: 30,
  });

  await sendMessageToUser(bot, user, { text: 'Обмен успешно завершён. Возвращайтесь к нам ещё.\n\n' });

  // eslint-disable-next-line no-param-reassign
  user.orderStatus = null;
  // eslint-disable-next-line no-param-reassign
  user.active_order = null;
  await saveUser(bot.instanceName, user);
}

async function confirmActiveBuyOrder(bot, user, orderId, ctx) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  const isOperator = Number(user.id) === Number(bot.getEnv().OPERATOR_ID);

  if (user.active_order || isOperator) {
    await eos.transact({
      actions: [{
        account: 'p2p',
        name: 'confirm',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          username: user.eosname,
          id: orderId,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    const bcOrder = await getOrder(bot, orderId);

    if (isOperator)
      if (bcOrder) {
        const user2 = await getUserByEosName(bot.instanceName, bcOrder.parent_creator);

        await approveActiveBuyOrder(bot, user2, orderId);

        await delOrder(bot, bcOrder.id, bcOrder.creator);
        await delOrder(bot, bcOrder.parent_id, bcOrder.parent_creator);

        await ctx.editMessageText(user2, { text: 'Вывод подтвержден.' });
      } else
        console.log('ORDER ALREADY CONFIRMED');

    else
      await ctx.editMessageText(user, { text: 'Ожидание\n\nОжидаем несколько подтверждений от сети и дарим цветочки..' });
  }
}

async function startAutoChange(bot, userOrder) {
  const eos = await bot.uni.getEosPassInstance(bot.getEnv().GATEWAY_WIF);

  const usdRates = await bot.uni.p2pContract.getUSDRates();
  const outRate = bot.uni.p2pContract.getRateFromRates(usdRates, 'USDT', 4); // TODO move 4 to param
  console.log('out_rate: ', outRate);

  const outQuantity = `${(parseFloat(userOrder.quote_quantity) * outRate).toFixed(4)} USDT`;

  const operatorOrder = {
    username: bot.getEnv().GATEWAY_ACCOUNT,
    creator: bot.getEnv().GATEWAY_ACCOUNT,
    parent_id: userOrder.id,
    parent_creator: userOrder.creator,
    type: 'buy',
    root_contract: userOrder.root_contract,
    root_quantity: userOrder.root_quantity,
    quote_type: 'external',
    quote_rate: userOrder.quote_rate,
    quote_contract: '',
    quote_quantity: userOrder.quote_quantity,
    out_type: 'crypto',
    out_rate: outRate,
    out_contract: '',
    out_quantity: outQuantity,
    details: '',
  };

  const data = await eos.transact({
    actions: [{
      account: 'p2p',
      name: 'createorder',
      authorization: [{
        actor: bot.getEnv().GATEWAY_ACCOUNT,
        permission: 'active',
      }],
      data: operatorOrder,
    }],
  }, {
    blocksBehind: 3,
    expireSeconds: 30,
  });

  const cons = data.processed.action_traces[0].console;

  const [, orderId] = cons.split('ORDER_ID:');

  operatorOrder.id = orderId;

  const operator = await getUserByEosName(bot.instanceName, operatorOrder.creator);
  const user = await getUserByEosName(bot.instanceName, operatorOrder.parent_creator);
  // TODO add order to db
  await acceptBuyOrder(bot, orderId, user, true);

  const bcOrder = await getOrder(bot, orderId);

  const buttons2 = [];

  buttons2.push(Markup.button.callback('Подтвердить оплату', `confirmbuyorder ${bcOrder.id}`));

  // eslint-disable-next-line max-len
  const address = await decryptMessage(bot, bot.getEnv().GATEWAY_WIF, bcOrder.parent_creator, bcOrder.details.address); // order.details

  await sendMessageToUser(bot, operator, { text: `Перевод средств\n\nПартнёр ${bcOrder.parent_creator} подтвердил готовность принять средства. Совершите перевод ${bcOrder.out_quantity} ${bcOrder.details.network ? `в сети ${bcOrder.details.network}` : ''} по реквизитам: ${address}.\n\nВНИМАНИЕ: сумма зачисления должна в точности равняться сумме в заявке.` });

  setTimeout(
    () => sendMessageToUser(bot, operator, { text: `${address}` }, Markup.inlineKeyboard(buttons2, { columns: 1 }).resize()),
    3 * 1000,
  );
}

async function createOrder(bot, user, ctx) {
  const parentOrder = await bot.uni.p2pContract.getOrder(user.order_action.data.parent_id);
  const hostObj = await bot.uni.coreContract.getHost('core');
  const eos = await bot.uni.getEosPassInstance(user.wif);
  const usdRates = await bot.uni.p2pContract.getUSDRates(); // TODO get precision from currency
  const quoteRate = bot.uni.p2pContract.getRateFromRates(usdRates, hostObj.symbol, hostObj.precision);
  let outQuantity = 0;
  let outQuantity2 = 0;

  if (user.order_action.name === 'createorder') {
    // eslint-disable-next-line max-len
    let outRate = bot.uni.p2pContract.getRateFromRates(usdRates, user.order_action.data.out_symbol, 4); // TODO move 4 to param
    outQuantity = `${(parseFloat(user.order_action.data.out_quantity)).toFixed(4)} ${user.order_action.data.out_symbol}`;

    const quoteQuantity = `${(parseFloat(outQuantity) * parseFloat(outRate)).toFixed(4)} USD`; // TODO move 4 to param

    let rootQuantity = `${(parseFloat(quoteQuantity) / parseFloat(quoteRate)).toFixed(hostObj.precision)} ${hostObj.symbol}`;

    if (user.order_action.data.type === 'buy') {
      if (!parentOrder) {
        await backToMainMenu(ctx, 'Заявка на обмен закрыта партнёром. Начните процесс заново.');
        return;
      }

      if (parseFloat(parentOrder.root_remain) < parseFloat(rootQuantity)) {
        // Если расхождение больше одного процента - отмена.
        if (
          ((parseFloat(rootQuantity) - parseFloat(parentOrder.root_remain))
            / parseFloat(parentOrder.root_remain)) * 100 > 1
        ) {
          // TODO
          await backToMainMenu(ctx, 'Условия обмена в заявке изменились. Начните процесс заново.');
          return;
        }

        rootQuantity = parentOrder.root_remain;
      }
    } else if (user.order_action.data.type === 'sell') {
      // TODO
    }

    const actions = [];

    if (user.order_action.data.type === 'sell') {
      outQuantity2 = outQuantity;
      outQuantity = `${(0).toFixed(4)} ${user.order_action.data.out_symbol}`;
      outRate = 0;

      actions.push(
        {
          account: 'eosio.token',
          name: 'transfer',
          authorization: [{
            actor: user.eosname,
            permission: 'active',
          }],
          data: {
            from: user.eosname,
            to: 'p2p',
            quantity: rootQuantity,
            memo: '',
          },
        },
      );
    }

    const order = {
      username: user.eosname,
      creator: user.eosname,
      parent_id: user.order_action.data.parent_id,
      type: user.order_action.data.type,
      root_contract: hostObj.root_token_contract,
      root_quantity: rootQuantity,
      quote_type: 'external',
      quote_rate: quoteRate,
      quote_contract: '',
      quote_quantity: quoteQuantity,
      out_type: 'crypto',
      out_rate: outRate,
      out_contract: '',
      out_quantity: outQuantity,
      details: '',
    };

    actions.push({
      account: 'p2p',
      name: 'createorder',
      authorization: [{
        actor: user.eosname,
        permission: 'active',
      }],
      data: order,
    });

    eos.transact({
      actions,
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    }).then(async (data) => {
      let cons;

      if (order.type === 'sell') cons = data.processed.action_traces[1].console; else cons = data.processed.action_traces[0].console;

      const [, orderId] = cons.split('ORDER_ID:');

      order.id = orderId;

      if (user.order_action.data.type === 'buy') {
        const parentCreator = await getUserByEosName(bot.instanceName, parentOrder.creator);
        const buttons = [];
        buttons.push(Markup.button.callback('Отменить заявку', `cancelorder ${orderId}`));

        await ctx.editMessageText(user, { text: `Ожидаем сообщения о готовности партнёра ${parentOrder.creator.toUpperCase()} принять средства.` }, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

        if (parentCreator) {
          const buttons2 = [];
          buttons2.push(Markup.button.callback('Отклонить', `cancelorder ${orderId}`));
          buttons2.push(Markup.button.callback('Начать обмен', `acceptbuyorder ${orderId}`));
          await sendMessageToUser(bot, parentCreator, { text: `Предложение\n\nПоступило предложение на оказание помощи от партнёра ${order.creator} на сумму ${order.out_quantity}.\n\nНачать обмен?` }, Markup.inlineKeyboard(buttons2, { columns: 2 }).resize());
        }
        // else await notifyByEmail(order.parent_creator, 0);
      } else if (user.order_action.data.type === 'sell') {
        const buttons = [];

        if (user.order_action.data.out_symbol === bot.getEnv().GATEWAY_SYMBOL)
          await startAutoChange(bot, order);
        else
          buttons.push(Markup.button.callback('Отменить заявку', `cancelorder ${orderId}`));

        await ctx.editMessageText(user, { text: `Заявка создана\n\nЗаявка на получение помощи создана на сумму ${outQuantity2}.` }, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
      }

      // eslint-disable-next-line no-param-reassign
      user.state = '';
      // eslint-disable-next-line no-param-reassign
      user.active_order = order;
      saveUser(bot.instanceName, user).then();
    }).catch((e) => {
      console.error(e);
      ctx.editMessageText(`Ошибка: ${e.message}`);
    });
  }
}

async function setDetails(suffix, userid, eosname, currency, details) {
  try {
    const db = await loadDB();
    const collection = db.collection(`details_${suffix}`);
    await collection.updateOne(
      { userid },
      {
        $set: {
          userid,
          eosname,
          currency,
          details,
        },
      },
      { upsert: true },
    );
  } catch (e) {
    console.log('error: ', e.message);
  }
}

async function getChildOrders(bot, parentId) {
  const orders = await lazyFetchAllTableInternal(bot.eosapi, 'p2p', 'p2p', 'orders', parentId, parentId, 100, 3, 'i64');

  orders.forEach((el) => {
    try {
      // eslint-disable-next-line no-param-reassign
      el.details = JSON.parse(el.details);
      // eslint-disable-next-line no-param-reassign
      el.root_remain_float = parseFloat(el.root_remain);
    } catch (e) {
      // eslint-disable-next-line no-param-reassign
      el.details = { address: el.details };
    }
  });

  return orders;
}

module.exports = {
  delOrder,
  getOrders,
  getMyOrders,
  encryptMessage,
  decryptMessage,
  getOrdersAndCheckThem,
  cancelOrder,
  acceptBuyOrder,
  confirmActiveBuyOrder,
  approveActiveBuyOrder,
  createOrder,
  setDetails,
  getDetails,
  getChildOrders,
};
