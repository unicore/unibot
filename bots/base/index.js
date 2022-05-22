module.exports.init = async (botModel, bot) => {
  bot.command('/hello', async (ctx) => {
    await ctx.replyWithHTML('<b>Hello</b>');
  });

  return null;
};
