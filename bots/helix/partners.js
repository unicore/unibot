const { stringify } = require('csv-stringify');
const string2fileStream = require('string-to-file-stream');
const { Markup } = require('telegraf');
const {
  saveUser, getUserHelixBalance, getNicknameByEosName, getTelegramByEosName,
} = require('./db');
const { mainButtons } = require('./utils/bot');
const { lazyFetchAllTableInternal } = require('./utils/apiTable');

const { sendMessageToUser } = require('./messages');

async function getPartner(bot, username) {
  const partner = await lazyFetchAllTableInternal(bot.eosapi, 'part', 'part', 'partners2', username, username, 1);

  return partner[0];
}

async function getPromoBudget(bot, username, contract = 'eosio.token') {
  let promo = await lazyFetchAllTableInternal(bot.eosapi, 'part', 'part', 'pbudgets', username, username, 100, 2, 'i64');
  promo = promo.find((el) => el.contract === contract);
  if (promo) return promo.budget;
  return '0.0000 FLOWER';
}

async function hasRequest(bot, username, contract) {
  let request = await lazyFetchAllTableInternal(bot.eosapi, 'part', 'part', 'prequests3', username, username, 100, 2, 'i64');
  request = request.find((r) => r.username === username && r.contract === contract);
  return !!request;
}

function getMyPartners(bot, username) {
  return lazyFetchAllTableInternal(bot.eosapi, 'part', 'part', 'partners2', username, username, 1000, 2, 'i64');
}

async function loadStructure(bot, partnerBase) {
  const partners = [];

  const line = await getMyPartners(bot, partnerBase);
  // eslint-disable-next-line no-restricted-syntax
  for (const row of line) {
    // eslint-disable-next-line no-await-in-loop
    row.partners = await loadStructure(bot, row.username);
    partners.push(row);
  }

  const str = [];

  partners.forEach((partner) => {
    str.push(partner);
    if (partner.partners && partner.partners.length > 0) {
      // eslint-disable-next-line no-restricted-syntax
      for (const row of partner.partners) {
        if (row.username) {
          row.username = `+${row.username}`;
          str.push(row);
        }
      }
    }
  });
  return str;
}

async function getStructure(bot, baseUsername) {
  const structure = await loadStructure(bot, baseUsername);

  const newStr = [];

  let k = 1;
  // eslint-disable-next-line no-restricted-syntax
  for (const row of structure) {
    if (row.username) {
      const regex = /([a-z]+)/gi;

      const reg = regex.exec(row.username);

      const username = reg[1];

      if (username) {
        // eslint-disable-next-line no-await-in-loop
        const [balances, nickname, telegram] = await Promise.all([
          getUserHelixBalance(username),
          getNicknameByEosName(bot.instanceName, username),
          getTelegramByEosName(bot.instanceName, username),
        ]);

        let totalWhite = '0.0000 FLOWER';
        let totalBlack = '0.0000 FLOWER';

        if (balances) {
          // eslint-disable-next-line no-restricted-syntax
          for (const bal of balances) {
            if (bal.pool_color === 'white') totalWhite = `${parseFloat(totalWhite) + parseFloat(bal.available)} FLOWER`;
            else totalBlack = `${parseFloat(totalBlack) + parseFloat(bal.available)} FLOWER`;
          }
        }

        newStr.push({
          '#': k,
          'Системное имя': row.username,
          // Никнейм: nickname,
          // Телеграм: telegram,
          'На белых столах': totalWhite,
          'На чёрных столах': totalBlack,
        });

        k += 1;
      }
    }
  }

  if (newStr.length === 0) {
    newStr.push({
      '#': 0,
      'Системное имя': 'партнёров нет',
      Никнейм: '-',
      Телеграм: '-',
      'Ликвидные цветки': '-',
      'На белых столах': '-',
      'На чёрных столах': '-',
    });
  }
  return newStr;
}

async function sendStructureFileToUser(bot, user, data) {
  stringify(data, {
    header: true,
  }, (err, output) => {
    const toSend = string2fileStream(output);
    sendMessageToUser(bot, user, { doc: toSend }, { filename: 'my-partners.csv' });
  });
}

async function printPartners(bot, user) {
  const me = await getPartner(bot, user.eosname);
  const ref = await getNicknameByEosName(bot.instanceName, me.referer) || ' не определен';
  const telegram = await getTelegramByEosName(bot.instanceName, me.referer);
  const promoBudget = await getPromoBudget(bot, user.eosname);

  // eslint-disable-next-line no-param-reassign
  user.promo_budget = parseFloat(promoBudget);
  await saveUser(bot.instanceName, user);

  const buttons = [];
  buttons.push(Markup.button.callback('Пополнить спонсорский бюджет', 'startpromotion'));

  await sendMessageToUser(bot, user, { text: `Ваш старший партнёр\n\t\t\tНикнейм:${ref}\n\t\t\tСистемное имя: ${me.referer}\n\t\t\tТелеграм: ${telegram}\n\nВаш рекламный бюджет: ${promoBudget}` }, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

  await getStructure(bot, user.eosname).then(async (structure) => {
    await sendStructureFileToUser(bot, user, structure);
  });
}

async function addPromoBudgetAction(bot, ctx, user, budget) {
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
        to: 'part',
        quantity: budget,
        memo: '',
      },
    }],
  }, {
    blocksBehind: 3,
    expireSeconds: 30,
  });

  // eslint-disable-next-line no-param-reassign
  user.promo_budget = parseFloat(budget);
  await saveUser(bot.instanceName, user);
  await ctx.editMessageText(user, { text: 'Спонсорский бюджет пополнен' });
  await printPartners(bot, user);
}

async function continueDemo(bot, user, from) {
  // TODO set menu
  let text = '';
  let menu;
  if (from === 'eosio') {
    text += 'Вы получили 1000 демо-цветков! 🌼 Давайте с их помощью заработаем еще цветков, и сотворим добро. 💵';
    text += '\n\nВаша задача - положить 🌼 цветки на стол и забрать их с последующих столов с прибылью.';
    text += '\n\nСтолы открываются последовательно после их полного заполнения взносами участников: сначала ⚪️ белый, затем ⚫️ чёрный, затем вновь ⚪️ белый, за ним - ⚫️ чёрный, и так далее..';
    text += '\n\n\t\t\t- Если положите 🌼 цветки на ⚪️ белый стол - то со следующего ⚪️ белого стола заберёте их с прибылью +100%. ';
    text += '\n\n\t\t\t- Если положите 🌼 цветки на ⚫️ чёрный стол - то со следующего ⚫️ чёрного стола заберёте их с прибылью +100%. ';
    text += '\n\n\t\t\t- Класть цветки и забирать их можно в любой момент с любого стола ⚪️🌼⚫️';
    text += '\n\n\t\t\t- Если первый последующий стол, после вашего взноса, не заполнится за сутки 🕐 - вы сотворите добро на -50%, вернув только половину своих цветков.';

    text += '\n\nУдачи! 🍀 Здесь всё зависит от внимания участников, а добро здесь всегда возвращается.';
    menu = Markup
      .keyboard(['Начать'], { columns: 2 }).resize();
  } else {
    text = 'Ваш спонсор подарил вам настоящий цветок! 🌼 Творите добро и зарабатывайте!';
    menu = Markup
      .keyboard(mainButtons, { columns: 2 }).resize();
  }

  await sendMessageToUser(bot, user, { text }, menu);
}

async function requestPromoBudgetAction(bot, user, from) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  try {
    await eos.transact({
      actions: [{
        account: 'part',
        name: 'request',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          to: user.eosname,
          from,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });
    await continueDemo(bot, user, from);
  } catch (e) {
    await sendMessageToUser(bot, user, { text: `Произошла ошибка на дарении. Пожалуйста, обратитесь в службу поддержки с сообщением: ${e.message}` });

    console.error(e);
  }
}

async function prepareSpreadAction(bot, user, ctx) {
  const structure = await loadStructure(bot, user.eosname);

  const regex = /([a-z]+)/gi;
  const nullUsers = structure.filter((u) => parseFloat(u['Ликвидные цветки']) === 0 && parseFloat(u['На белых столах'] === 0 && parseFloat(u['На чёрных столах']))).map((u) => {
    const username = regex.exec(u.username)[1];

    return { ...u, username };
  });

  const myPromoBalance = await getPromoBudget(bot, user.eosname);

  if (nullUsers.length > 0) {
    const buttons = [];

    buttons.push(Markup.button.callback('подтвердить', 'startspread'));
    buttons.push(Markup.button.callback('отмена', 'backto wallet '));

    ctx.reply(`Ваш рекламный бюджет: ${myPromoBalance}. В вашей структуре ${nullUsers.length} партнёров, не обладающими балансами. Распределить по 1 FLOWER для них из вашего рекламного бюджета на каждого из них?`, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
  } else {
    ctx.reply('У вас нет партнёров для распределения');
  }
}

async function spreadNowAction(ctx) {
  const buttons = [];
  buttons.push(Markup.button.callback('Отменить ', 'startspread'));

  ctx.reply('Распределить по 1 FLOWER по всем партнёрам, не обладающих ликвидным балансом?', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
}

module.exports = {
  printPartners,
  getPartner,
  prepareSpreadAction,
  spreadNowAction,
  addPromoBudgetAction,
  getPromoBudget,
  hasRequest,
  requestPromoBudgetAction,
  continueDemo,
};
