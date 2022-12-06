/* eslint-disable no-await-in-loop */
const { Markup } = require('telegraf');
const { mainButtons } = require('./utils/bot');
const { loadDB } = require('./db');

async function sendMessageToUser(bot, user, message, extra) {
  let id = {};

  try {
    if ('text' in message) id = await bot.telegram.sendMessage(user.id, message.text, extra);
    if ('photo' in message) id = await bot.telegram.sendPhoto(user.id, message.photo[3].file_id);
    if ('voice' in message) id = await bot.telegram.sendVoice(user.id, message.voice.file_id);
    if ('video_note' in message) id = await bot.telegram.sendVideoNote(user.id, message.video_note.file_id);
    if ('video' in message) id = await bot.telegram.sendVideo(user.id, message.video.file_id);
    if ('doc' in message) {
      // eslint-disable-next-line max-len
      id = await bot.telegram.sendDocument(user.id, { source: message.doc, filename: extra.filename });
    } if ('venue' in message) {
      // eslint-disable-next-line max-len
      id = await bot.telegram.sendVenue(user.id, message.location.latitude, message.location.longitude, message.venue.title, message.venue.address);
    } else if ('location' in message) {
      // eslint-disable-next-line max-len
      id = await bot.telegram.sendLocation(user.id, message.location.latitude, message.location.longitude);
    }

    return id.message_id;
  } catch (e) {
    console.log('error on send message: ', e, message, extra);
    return null;
  }
}

async function sendMessageToAll(bot, message, extra) {
  const db = await loadDB();
  const collection = db.collection(`dacomUsers_${bot.instanceName}`);
  const users = await collection.find({}).toArray();

  if (!extra) {
    // eslint-disable-next-line no-param-reassign
    extra = Markup
      .keyboard(mainButtons, { columns: 2 }).resize();
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const user of users) {
    try {
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
    } catch (e) {
      console.log('error on mass send: ', user.id, e.message);
    }
  }

  return users.length;
}

module.exports = {
  sendMessageToUser, sendMessageToAll,
};
