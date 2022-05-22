const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

const { Schema } = mongoose;

const Bots = require('../bots');

const botSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true,
    minLength: 1,
    maxLength: 32,
    trim: true,
  },
  token: {
    type: String, required: true, unique: true, minLength: 1, index: true,
  },
  isActive: { type: Boolean, default: false },
  botSecret: { type: String, unique: true, index: true },
  mode: { type: String, default: 'base' },
  env: Schema.Types.Mixed,
  version: { type: Number, default: 0 },
});

const BOT_INSTANCES = {};

botSchema.methods.getTelegrafInstance = async function getTelegrafInstance(workerMode, softMode) {
  if (!this.isActive) {
    BOT_INSTANCES[this.token] = null;
    return null;
  }

  const needUpdateHook = !workerMode && (!softMode || !BOT_INSTANCES[this.token]);
  const hasNewVersion = (
    BOT_INSTANCES[this.token] && BOT_INSTANCES[this.token].instanceVersion !== this.version
  );
  if (softMode && hasNewVersion) {
    console.log('Bot', this.name, 'has new version. Old:', BOT_INSTANCES[this.token].instanceVersion, ' New:', this.version);
  }

  if (
    !BOT_INSTANCES[this.token]
      || workerMode
      || (hasNewVersion && softMode)
  ) {
    console.log('INIT BOT', this.name, this.mode, this.version, 'IN PROGRESS...');
    BOT_INSTANCES[this.token] = new Telegraf(this.token);
    BOT_INSTANCES[this.token].instanceName = this.name;
    BOT_INSTANCES[this.token].instanceVersion = this.version;
    BOT_INSTANCES[this.token].getEnv = () => {
      const { env } = this;

      if (env && typeof env === 'object' && !Array.isArray(env)) {
        return env;
      }

      return {};
    };
    const clearFunc = await Bots.initBot(this, this.mode, BOT_INSTANCES[this.token]);
    BOT_INSTANCES[this.token].clearFunc = clearFunc || (() => {});
    if (needUpdateHook) {
      this.botSecret = BOT_INSTANCES[this.token].secretPathComponent();
      await this.save();
      try {
        await BOT_INSTANCES[this.token].telegram.setWebhook(`https://${process.env.DOMAIN}/telegraf/${this.botSecret}`);
      } catch (e) {
        console.error(e);
      }
    }
    console.log('INIT BOT', this.name, '[OK]');
  }

  return BOT_INSTANCES[this.token];
};

botSchema.methods.deleteTelegrafInstance = function deleteTelegrafInstance() {
  if (BOT_INSTANCES[this.token]) {
    BOT_INSTANCES[this.token] = null;
  }
};

botSchema.methods.incVersion = async function deleteTelegrafInstance() {
  this.version += 1;
  await this.save();
};

const Bot = mongoose.model('bot', botSchema);

module.exports = Bot;
