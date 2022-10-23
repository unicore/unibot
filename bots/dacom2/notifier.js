const { sendMessageToUser } = require('./messages');
const { saveUser, getUserByEosName, getUnion } = require('./db');
const { constructReportMessage } = require('./goals')

async function notify(bot, source, hostname, what, meta) {
  // let current_chat = await getUnion(bot.instanceName, (current_chat_id).toString())

  // if (current_chat){

  console.log('on notify')
  if (what === 'acceptReport') {
    console.log('on notify2')
    let to = await getUserByEosName(bot.instanceName, meta.username)
    console.log('on notify3', to, meta)
    let msg = await constructReportMessage(bot, hostname, meta)

    if (to) {
      await sendMessageToUser(bot, {id: to.id}, { text: `Ваш отчёт одобрен в проекте ${source.unionName}: \n\n${msg}` }, {});
    }
  }

  // }
}

module.exports = {
  notify
};
