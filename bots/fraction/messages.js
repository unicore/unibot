/* eslint-disable no-await-in-loop */
const { Markup } = require('telegraf');
const { mainButtons } = require('./utils/bot');
const { loadDB } = require('./db');

async function sendMessageToUser(bot, user, message, extra) {
  if ('text' in message) await bot.telegram.sendMessage(user.id, message.text, extra);
  if ('photo' in message) await bot.telegram.sendPhoto(user.id, message.photo[3].file_id);
  if ('voice' in message) await bot.telegram.sendVoice(user.id, message.voice.file_id);
  if ('video_note' in message) await bot.telegram.sendVideoNote(user.id, message.video_note.file_id);
  if ('video' in message) await bot.telegram.sendVideo(user.id, message.video.file_id);
  if ('doc' in message) {
    await bot.telegram.sendDocument(user.id, { source: message.doc, filename: extra.filename });
  } if ('venue' in message) {
    // eslint-disable-next-line max-len
    await bot.telegram.sendVenue(user.id, message.location.latitude, message.location.longitude, message.venue.title, message.venue.address);
  } else if ('location' in message) {
    await bot.telegram.sendLocation(user.id, message.location.latitude, message.location.longitude);
  }
}

async function sendMessageToAll(bot, message, extra) {
  const db = await loadDB();
  const collection = db.collection(`helixUsers_${bot.instanceName}`);
  const users = await collection.find({}).toArray();

  if (!extra) {
    // eslint-disable-next-line no-param-reassign
    extra = Markup
      .keyboard(mainButtons, { columns: 2 }).resize();
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const user of users) {
    if ('text' in message) await bot.telegram.sendMessage(user.id, message.text, extra);
    if ('photo' in message) await bot.telegram.sendPhoto(user.id, message.photo[2].file_id, { caption: message.caption });
    if ('voice' in message) await bot.telegram.sendVoice(user.id, message.voice.file_id);
    if ('video_note' in message) await bot.telegram.sendVideoNote(user.id, message.video_note.file_id);
    if ('video' in message) await bot.telegram.sendVideo(user.id, message.video.file_id);
    if ('doc' in message) await bot.telegram.sendDocument(user.id, message.doc);
    if ('venue' in message) {
      // eslint-disable-next-line max-len
      await bot.telegram.sendVenue(user.id, message.location.latitude, message.location.longitude, message.venue.title, message.venue.address);
    } else if ('location' in message) {
      // eslint-disable-next-line max-len
      await bot.telegram.sendLocation(user.id, message.location.latitude, message.location.longitude);
    }
  }

  return users.length;
}

module.exports = {
  sendMessageToUser, sendMessageToAll,
};
