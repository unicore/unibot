const { Markup } = require('telegraf');
const { getHelixParams, printHelixWallet } = require('./core');

async function getUserExpirience(bot, username, params) {
  const totalShares = params.host.total_shares > 0 ? params.host.total_shares : 1;

  const userPower = await bot.uni.coreContract.getUserPower(
    username,
    params.host.username,
  );

  const totalSharesRate = Number(userPower.power) / parseFloat(totalShares);

  const totalSharesAmount = totalSharesRate * parseFloat(params.host.quote_amount);

  const totalSharesAsset = `${totalSharesAmount.toFixed(4)} ${
    params.host.quote_symbol
  }`;
  const sharesStake = ((100 * userPower.power) / totalShares).toFixed(4);

  return {
    user_power: userPower,
    total_shares_asset: totalSharesAsset,
    shares_stake: sharesStake,
  };
}

async function sellSharesAction(bot, ctx, user, hostname, shares) {
  // console.log('shares: ', shares)
  const eos = await bot.uni.getEosPassInstance(user.wif);

  const params = await getHelixParams(bot, hostname);
  const userExp = await getUserExpirience(bot, user.eosname, params);

  eos
    .transact(
      {
        actions: [
          {
            account: 'unicore',
            name: 'sellshares',
            authorization: [
              {
                actor: user.eosname,
                permission: 'active',
              },
            ],
            data: {
              username: user.eosname,
              host: hostname,
              shares,
            },
          },
        ],
      },
      {
        blocksBehind: 3,
        expireSeconds: 30,
      },
    )
    .then(async () => {
      await ctx.replyWithHTML(
        `Вы успешно изъяли ${
          userExp.total_shares_asset
        } из пула опыта кассы ${hostname.toUpperCase()}`,
      );

      await printHelixWallet(bot, ctx, user, hostname);
    })
    .catch((e) => {
      ctx.replyWithHTML(e.message);
      console.error('ere: ', e);
    });
}

async function printExpirience(bot, ctx, user, hostname) {
  const params = await getHelixParams(bot, hostname);

  const userExp = await getUserExpirience(bot, user.eosname, params);
  let toPrint = '';
  toPrint += `Опыт в кассе ${hostname.toUpperCase()}`;
  toPrint += '\n------------------------------';
  // toPrint += `\nПул опыта: ${params.host.quote_amount}`
  toPrint += `\nВаша доля: ${userExp.shares_stake}%`;
  toPrint += `\n\nВам доступно: ${userExp.total_shares_asset}`;

  toPrint += `\n\nОпыт предоставляет долю в свободном потоке цветков со всех столов. Покупка опыта доступна с комиссией ${params.lossFactor}% на вашу долю в пуле, которая отправляется на благотворительность.`;

  const buttons = [];

  buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));
  buttons.push(
    Markup.button.callback(
      'Продать опыт',
      `sellexp ${hostname} ${userExp.user_power.power}`,
    ),
  );
  ctx.editMessageText(
    toPrint,
    Markup.inlineKeyboard(buttons, { columns: 2 }).resize(),
  );
}

module.exports = {
  getUserExpirience,
  sellSharesAction,
  printExpirience,
};
