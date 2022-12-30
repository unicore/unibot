/* eslint-disable no-param-reassign */
const fs = require('fs');
const { parse } = require('csv-parse');

const { generateAccount: generateUniAccount } = require('unicore');
const { Markup } = require('telegraf');
const { saveUser } = require('./db');

async function canRestoreAccount(user) {
  let data = fs.readFileSync('./static/partners.json');
  data = JSON.parse(data);

  const exist = data.find((el) => el.telegram === user.username);

  if (exist) return exist.username;
  return false;
}

async function setSupportMenu(ctx) {
  const menu = Markup
    .keyboard(['Поддержка'], { columns: 1 }).resize();

  ctx.reply('Произошёл системный сбой. Пожалуйста, напишите в службу поддержки для устранения проблемы: @knouni_bot', menu);
}

async function restoreAccount(bot, ctx, user, isRegister) {
  // ctx.reply("Пожалуйста, подождите..")
  user.app = bot.getEnv().APP;
  await saveUser(bot.instanceName, user);
  let eos;
  try {
    eos = await bot.uni.getEosPassInstance(bot.getEnv().REGISTRATOR_WIF);
  } catch (e) {
    console.error(e);
    return false;
  }
  const username = await canRestoreAccount(user);

  if (username) {
    try {
      const generatedAccount = await generateUniAccount();

      user.eosname = username;
      user.mnemonic = generatedAccount.mnemonic;
      user.wif = generatedAccount.wif;
      user.pub = generatedAccount.pub;
      user.is_demo = false;
      user.restored = false;
      await saveUser(bot.instanceName, user);

      await eos.transact({
        actions: [{
          account: 'registrator',
          name: 'changekey',
          authorization: [{
            actor: 'registrator',
            permission: 'active',
          }],
          data: {
            username: user.eosname,
            public_key: user.pub,
          },
        }],
      }, {
        blocksBehind: 3,
        expireSeconds: 30,
      });

      user.restored = true;
      await saveUser(bot.instanceName, user);

      console.log('restored account for: ', user.username, ' ->', user.eosname);

      return true;
    } catch (e) {
      setSupportMenu(ctx);
      console.log('cant restore account for: ', user.eosname, e);
      user.restore_error = e;
      await saveUser(bot.instanceName, user);
      return false;
    }
  } else {
    if (!isRegister) {
      // TODO set REPAIR MENU
      const generatedAccount = await generateUniAccount();
      user.eosname = '';
      user.mnemonic = generatedAccount.mnemonic;
      user.wif = generatedAccount.wif;
      user.pub = generatedAccount.pub;
      user.is_demo = false;
      user.restored = false;

      await saveUser(bot.instanceName, user);
    }

    return false;
  }
}

module.exports = {
  restoreAccount,
};
