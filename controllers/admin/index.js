const Bot = require('../../models/Bot');
const { validateToken } = require('../../validators/telegram');
const { validateName } = require('../../validators/name');

module.exports.addBot = async (req) => {
  const {
    name,
    token,
  } = req.body;

  if (!validateName(name)) {
    return { ok: false, message: 'Invalid name' };
  }

  if (!validateToken(token)) {
    return { ok: false, message: 'Invalid token' };
  }

  const botByName = await Bot.findOne({ name });
  if (botByName) {
    return { ok: false, message: `Bot with name ${name} already exists` };
  }

  const botByToken = await Bot.findOne({ token });
  if (botByToken) {
    return { ok: false, message: 'Bot with same token already exists' };
  }

  await Bot.create({ name, token });

  return { ok: true };
};

module.exports.listBots = async () => {
  const rows = await Bot.find({});

  return { rows: rows.map((b) => ({ name: b.name, isActive: b.isActive })) };
};

module.exports.getBot = async (req) => {
  const { name } = req.body;
  const bot = await Bot.findOne({ name });

  return {
    data: {
      name: bot.name,
      token: bot.token,
      isActive: bot.isActive,
      mode: bot.mode,
      env: bot.env,
    },
  };
};

module.exports.setBotToken = async (req) => {
  const {
    name,
    token,
  } = req.body;

  const bot = await Bot.findOne({ name });
  if (!bot) {
    return { ok: false, message: 'Bot not found' };
  }

  if (!validateToken(token)) {
    return { ok: false, message: 'Invalid token' };
  }

  const botByToken = await Bot.findOne({ token });
  if (botByToken && botByToken.name !== name) {
    return { ok: false, message: 'Bot with same token already exists' };
  }

  bot.token = token;
  await bot.save();
  await bot.incVersion();

  return { ok: true };
};

module.exports.enableBot = async (req) => {
  const {
    name,
  } = req.body;

  const bot = await Bot.findOne({ name });
  if (!bot) {
    return { ok: false, message: 'Bot not found' };
  }

  if (bot.isActive) {
    return { ok: false, message: 'Bot already enabled' };
  }

  bot.isActive = true;
  await bot.save();
  await bot.incVersion();
  await bot.getTelegrafInstance();

  return { ok: true };
};

module.exports.disableBot = async (req) => {
  const {
    name,
  } = req.body;

  const bot = await Bot.findOne({ name });
  if (!bot) {
    return { ok: false, message: 'Bot not found' };
  }

  if (!bot.isActive) {
    return { ok: false, message: 'Bot already disabled' };
  }

  bot.isActive = false;
  await bot.save();
  const telegrafInstance = await bot.getTelegrafInstance();
  if (telegrafInstance) {
    await telegrafInstance.clearFunc();
    await telegrafInstance.telegram.deleteWebhook();
    bot.deleteTelegrafInstance();
  }

  await bot.incVersion();

  return { ok: true };
};

module.exports.changeBotMode = async (req) => {
  const ALLOWED_MODES = {
    base: 1,
    helix: 1,
    dacom: 1,
    loto: 1,
    auction: 1,
    man: 1,
    vac: 1
  };
  const {
    name,
    mode,
  } = req.body;

  const bot = await Bot.findOne({ name });
  if (!bot) {
    return { ok: false, message: 'Bot not found' };
  }

  if (!ALLOWED_MODES[mode]) {
    return { ok: false, message: `Mode ${mode} is not allowed` };
  }

  bot.mode = mode;
  await bot.save();
  const telegrafInstance = await bot.getTelegrafInstance();
  await bot.incVersion();
  if (telegrafInstance) {
    await telegrafInstance.clearFunc();
    await telegrafInstance.telegram.deleteWebhook();
    bot.deleteTelegrafInstance();
    await bot.getTelegrafInstance();
  }

  return { ok: true };
};

module.exports.setEnv = async (req) => {
  const {
    name,
    env,
  } = req.body;

  const bot = await Bot.findOne({ name });
  if (!bot) {
    return { ok: false, message: 'Bot not found' };
  }

  if (typeof env !== 'object' || !env) {
    return { ok: false, message: 'Env is invalid' };
  }

  bot.env = env;
  await bot.save();
  const telegrafInstance = await bot.getTelegrafInstance();
  await bot.incVersion();
  if (telegrafInstance) {
    await telegrafInstance.clearFunc();
    await telegrafInstance.telegram.deleteWebhook();
    bot.deleteTelegrafInstance();
    await bot.getTelegrafInstance();
  }

  return { ok: true };
};
