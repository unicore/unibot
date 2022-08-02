const path = require('path');

const api_id = process.env.API_ID;
const api_hash = process.env.API_HASH;
const storage = process.env.TG_STORAGE + "/1.json"

const { TelegramClient, Api } = require('telegram')
const { StringSession } = require('telegram/sessions')
const {insertUnion} = require('./db')

//KRASNOV
const apiId = process.env.API_ID
const apiHash = process.env.API_HASH

const stringSession = new StringSession(process.env.STRING_SESSION)


async function connect(){
  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 })
  await client.connect()
  return client
}

async function createChat(bot, user, unionName, type) {
  const client = await connect()
  // await client.sendMessage('me', { message: 'Hello!' });
  // const request = new Api.messages.SendMessage({peer: "me", message: "hello"})
  let result
  let chatId
  let channelId
  let chatLink
  let channelLink
  let channelTitle
  let chatTitle

  if (type == 'union'){
    channelTitle = `Канал союза ${unionName}` 
    chatTitle = `Союз ${unionName}` 
  } else if (type == 'goals'){
    channelTitle = `Канал целей союза ${unionName}` 
    chatTitle = `Обсуждение целей союза ${unionName}` 
  }

    result = await client.invoke(new Api.channels.CreateChannel({
      title: channelTitle,
      about: '',
      broadcast: true,
      megagroup: false,
      forImport: false,
    }));
  
    channelId = parseInt((result.chats[0].id.value))
  
    await client.invoke(new Api.channels.EditAdmin({
      channel: channelId,
      userId: bot.getEnv().BOTNAME,
      adminRights: new Api.ChatAdminRights({
          changeInfo: true,
          postMessages: true,
          editMessages: true,
          deleteMessages: true,
          banUsers: true,
          inviteUsers: true,
          pinMessages: true,
          addAdmins: true,
          anonymous: true,
          manageCall: true,
          other: true
      }),
      rank: 'оператор'
    }));

    result = await client.invoke(
      new Api.messages.CreateChat({
        users: ["me", bot.getEnv().BOTNAME],
        title: chatTitle,
      })
    );

    chatId = parseInt((result.chats[0].id.value))
  
    await client.invoke(new Api.messages.EditChatAdmin({
        chatId: chatId,
        userId: bot.getEnv().BOTNAME,
        isAdmin: true
    }));



    chatLink = await client.invoke(new Api.messages.ExportChatInvite({
      peer: chatId,
      // legacyRevokePermanent: true,
      // requestNeeded: false,
      title: 'Welcome'
    }));

    chatLink = chatLink.link

    channelLink = await client.invoke(new Api.messages.ExportChatInvite({
      peer: channelId,
      // legacyRevokePermanent: true,
      // requestNeeded: false,
      title: 'Welcome'
    }));

    channelLink = channelLink.link

    console.log("CHAT ID: ", chatId)
    chatId = await setDiscussionGroup(bot, parseInt(chatId), parseInt(channelId))    
  

    await insertUnion(bot.instanceName, {
      ownerId: user.id,
      ownerEosname: user.eosname, 
      id: chatId,
      type: type + 'Chat', 
      unionName,
      link: chatLink,
    })

    await insertUnion(bot.instanceName, {
      ownerId: user.id,
      ownerEosname: user.eosname, 
      id: channelId,
      type: type + "Channel", 
      unionName,
      link: channelLink,
    })
    // console.log('GOALS CHANNEL: ', result)

  return {chatId, channelId, chatLink, channelLink}
  
}   

async function MigrateChat(bot, chatId){
  
  
  // return {id: migratedTo, accessHash}

}

async function setDiscussionGroup(bot, chatId, channelId){
  const client = await connect()

  const result = await client.invoke(new Api.messages.MigrateChat({
    chatId: chatId
  }));

  console.log("result on migrate:" , result)

  let migratedTo = parseInt(result.chats[0].migratedTo.channelId.value)
  let accessHash = parseInt(result.chats[0].migratedTo.accessHash.value)
  
  console.log("migratedTo:" , migratedTo, "accessHash:", accessHash)
  
  await client.invoke(new Api.channels.TogglePreHistoryHidden({
    channel: `${migratedTo}`,
    enabled: false,
    accessHash
 }));
  
  const result2 = await client.invoke(new Api.channels.SetDiscussionGroup({
    broadcast: `-100${channelId}`,
    group: migratedTo,
    accessHash: accessHash
  }));

  console.log("result2", result2)
  
  return migratedTo
  // console.log('SET DISCUSSION: ', result)


}

async function createGroupCall(bot, chatId, userId) {
  const client = await connect()
  
  const result = await client.invoke(new Api.phone.CreateGroupCall({
    peer: chatId,
    randomId: Math.floor((Math.random() * 1000000000) + 1),
    rtmpStream: false,
    title: 'Совет',
    scheduleDate: 1659083752
  }));

}

async function makeAdmin(bot, chatId, userId, ctx){
  const client = await connect()
  
  let chat = await client.invoke(new Api.messages.GetFullChat({
    chatId: Math.abs(chatId),
  }));
  
  
  let newAdmin = chat.users.find(el => parseInt(el.id.value) == userId)
  console.log('newAdmin: ', newAdmin)
  let result
  
  try{
    if (newAdmin){

      await client.invoke(new Api.messages.EditChatAdmin({
          chatId: Math.abs(chatId),
          userId: parseInt(newAdmin.id.value),
          accessHash: parseInt(newAdmin.accessHash.value),
          isAdmin: true
      }));
      
      // await client.invoke(new Api.channels.EditAdmin({
      //   channel: "1619899041",
      //   userId: parseInt(newAdmin.id.value),
      //   accessHash: parseInt(newAdmin.accessHash.value),
      //   adminRights: new Api.ChatAdminRights({
      //       changeInfo: true,
      //       postMessages: true,
      //       editMessages: true,
      //       deleteMessages: true,
      //       banUsers: true,
      //       inviteUsers: true,
      //       pinMessages: true,
      //       addAdmins: true,
      //       anonymous: true,
      //       manageCall: true,
      //       other: true
      //   }),
      //   rank: ''
      // }));
      // await client.invoke(new Api.messages.EditChatAdmin({
      //   chatId: Math.abs(1619899041),
      //   userId: parseInt(newAdmin.id.value),
      //   accessHash: parseInt(newAdmin.accessHash.value),
      //   isAdmin: true
      // }));

    }
  } catch(e){
    result = e
    console.log("error: ", e)
    
  }
  
  return result

}

module.exports = {
  createChat,
  makeAdmin,
  createGroupCall, 
  setDiscussionGroup
};