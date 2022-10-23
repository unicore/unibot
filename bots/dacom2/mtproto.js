const path = require('path');

const { TelegramClient, Api } = require('telegram')
const { StringSession } = require('telegram/sessions')
const {insertUnion, getProjectsCount} = require('./db')

const { createReadStream } = require("fs");
const { TGCalls, Stream } = require("tgcalls-next");

//KRASNOV
const apiId = parseInt(process.env.API_ID)
const apiHash = process.env.API_HASH

const stringSession = new StringSession(process.env.STRING_SESSION)


async function connect(){
  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 })
  await client.connect()
  return client
}

async function createChat(bot, user, hostname, unionName, type, is_private) {
  if (!is_private)
    is_private = false
  
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
  let projectCount 

  if (type === 'union'){
    channelTitle = `Канал союза ${unionName}` 
    chatTitle = `Союз ${unionName}` 
  } else if (type === 'goals'){
    channelTitle = `Канал целей союза ${unionName}` 
    chatTitle = `Обсуждение целей союза ${unionName}` 
  } else if (type === 'tasks'){
    channelTitle = `Канал действий союза ${unionName}` 
    chatTitle = `Обсуждение действий союза ${unionName}` 
  } else if (type === 'reports'){
    channelTitle = `Канал отчётов союза ${unionName}` 
    chatTitle = `Обсуждение отчётов союза ${unionName}` 
  } else if (type === 'project'){
    projectCount = await getProjectsCount(bot.instanceName, user.id)
    //todo get projects
    channelTitle = `Проект #${projectCount + 1} ${unionName}` 
    chatTitle = `Обсуждение проекта #${projectCount + 1} ${unionName}` 
  }


    result = await client.invoke(new Api.channels.CreateChannel({
      title: channelTitle,
      about: '',
      broadcast: true,
      megagroup: false,
      forImport: false,
    }));
  
    channelId = parseInt((result.chats[0].id.value))
  
    result = await client.invoke(
      new Api.messages.CreateChat({
        users: ["me", bot.getEnv().BOTNAME],
        title: chatTitle,
      })
    );

    chatId = parseInt((result.chats[0].id.value))
  
   

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
    console.log("AFTE RCREATE DISCUSS")

     let admin_result = await client.invoke(new Api.channels.EditAdmin({
        channel: chatId,
        userId: bot.getEnv().BOTNAME,
        isAdmin: true,
        adminRights: new Api.ChatAdminRights({
            changeInfo: true,
            postMessages: true,
            editMessages: true,
            deleteMessages: true,
            banUsers: true,
            inviteUsers: true,
            pinMessages: true,
            addAdmins: true,
            anonymous: false,
            manageCall: true,
            other: true
        }),
        rank: 'оператор'
    }));

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
          anonymous: false,
          manageCall: true,
          other: true
      }),
      rank: 'оператор'
    }));

    console.log("ADMIN RESULT: ", admin_result)

    await insertUnion(bot.instanceName, {
      ownerId: user.id,
      ownerEosname: user.eosname, 
      host: hostname,
      id: '-100' + chatId,
      type: type + 'Chat', 
      unionName,
      link: chatLink,
      projectCount: projectCount + 1,
      is_private
    })

    await insertUnion(bot.instanceName, {
      ownerId: user.id,
      ownerEosname: user.eosname, 
      host: hostname,
      id: '-100' + channelId,
      type: type + "Channel", 
      unionName,
      link: channelLink,
      projectCount: projectCount + 1,
      is_private
    })
    console.log('GOALS CHANNEL: ', result)

  return {chatId, channelId, chatLink, channelLink}
  
}   


async function checkBotIsAdmin(bot, user, ctx, chatId) {
  let res 
  
  try {

    res = await bot.telegram.getChatAdministrators(chatId)

  } catch(e) {
    ctx.reply(`Ошибка! Бот ${bot.getEnv().BOTNAME} должен быть назначен администратором в новостном канале DAO. Для отмены установки новостного канала вызовите команду /cancel_set_news_channel`)
    return {status: 'error', message: e.message}
  }

  let bot_is_admin = false
  let user_is_admin = false
  console.log("admins: ", res)

  res.map(u => {
    if (u.user.username === bot.getEnv().BOTNAME){
      bot_is_admin = true
    }

    if (u.user.id === user.id){
      user_is_admin = true
    }
  })

  return {bot_is_admin, user_is_admin, status: 'ok'}
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

async function createGroupCall(bot, chatId, scheduleDate) {
  // const client = await connect()
  
  // try{
  //   const result = await client.invoke(new Api.phone.CreateGroupCall({
  //     peer: chatId,
  //     randomId: Math.floor((Math.random() * 1000000000) + 1),
  //     rtmpStream: true,
  //     title: 'Совет',
  //     // scheduleDate: scheduleDate
  //   }));
  // } catch(e){
  //   console.error(e)
  // }
  
  // console.log("chatId: ", client, chatId)

  // const tgcalls = new TGCalls(client, chatId)
  
  // tgcalls.joinVoiceCall = () => {
    // console.log("HERE!", tgcalls, TGCalls)
  // }
  // const stream = new Stream({ audio: createReadStream("audio.raw"), video: createReadStream("video.raw") })
  
  // tgcalls.joinCall(client, chatId)
  // console.log("tgcalls", tgcalls, stream)
  // await tgcalls.stream(stream);
}

async function exportChatLink(channelId, messageId){
  const client = await connect()
  console.log("channelId: ", channelId, messageId)
  const result = await client.invoke(new Api.messages.GetDiscussionMessage({
      peer: channelId,
      msgId: messageId
  }));
  // const result = await client.invoke(new Api.messages.ReadDiscussion({
  //   peer: channelId,
  //   msgId: messageId,
  //   // readMaxId: 43
  // }));
  // const result = await client.invoke(new Api.messages.GetReplies({
  //     peer: channelId,
  //     msgId: messageId,
  //     // offsetId: 43,
  //     // offsetDate: 43,
  //     // addOffset: 0,
  //     // limit: 100,
  //     // maxId: 0,
  //     // minId: 0,
  //     // hash: BigInt('-4156887774564')
  // }));
  // const result = await client.invoke(new Api.messages.GetDiscussionMessage({
  //     peer: channelId,
  //     msgId: messageId,
  // }));

  console.log("exportChatLink: ", result)
  return result
}

async function makeAdmin(bot, chatId, userId, ctx){
  const client = await connect()
  
  let chat = await client.invoke(new Api.messages.GetFullChat({
    chatId: Math.abs(chatId),
  }));
  
  
  let newAdmin = chat.users.find(el => parseInt(el.id.value) === userId)
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



async function makeChannelAdmin(bot, chatId, userId, ctx, channelId){
  const client = await connect()
  
  // console.log("chatId: ", chatId)
  // chatId = chatId.substr(4, chatId.length)
  // (text.substr(entity.offset + 1, entity.length).replace(' ', ''))
  // console.log("newChatId: ", chatId)
  // console.log("userId:", userId)
  // let chat = await ctx.getChatMember({userId: Number(userId)})
  // console.log(chat)
  // let chat = await client.invoke(new Api.channels.GetFullChannel({
  //   channel: chatId,
  // }));
  
  
  // let newAdmin = chat.users.find(el => parseInt(el.id.value) === userId)
  // console.log('newAdmin: ', newAdmin)
  // let result
  
  // try{
  //   if (newAdmin){

  //     // await client.invoke(new Api.messages.EditChatAdmin({
  //     //     chatId: Math.abs(chatId),
  //     //     userId: parseInt(newAdmin.id.value),
  //     //     accessHash: parseInt(newAdmin.accessHash.value),
  //     //     isAdmin: true
  //     // }));
      
  //     // await client.invoke(new Api.messages.InviteToChannel({
  //     //     channel: channelId,
  //     //     users: [parseInt(newAdmin.id.value)],
  //     //     accessHash: parseInt(newAdmin.accessHash.value),
  //     //     isAdmin: true
  //     // }));
      
      


  //     // await client.invoke(new Api.channels.EditAdmin({
  //     //   channel: "1619899041",
  //     //   userId: parseInt(newAdmin.id.value),
  //     //   accessHash: parseInt(newAdmin.accessHash.value),
  //     //   adminRights: new Api.ChatAdminRights({
  //     //       changeInfo: true,
  //     //       postMessages: true,
  //     //       editMessages: true,
  //     //       deleteMessages: true,
  //     //       banUsers: true,
  //     //       inviteUsers: true,
  //     //       pinMessages: true,
  //     //       addAdmins: true,
  //     //       anonymous: true,
  //     //       manageCall: true,
  //     //       other: true
  //     //   }),
  //     //   rank: ''
  //     // }));

  //     // await client.invoke(new Api.messages.EditChatAdmin({
  //     //   chatId: Math.abs(1619899041),
  //     //   userId: parseInt(newAdmin.id.value),
  //     //   accessHash: parseInt(newAdmin.accessHash.value),
  //     //   isAdmin: true
  //     // }));

  //   }
  // } catch(e){
  //   result = e
  //   console.log("error: ", e)
    
  // }
  
  // return result

}

module.exports = {
  createChat,
  makeAdmin,
  createGroupCall, 
  setDiscussionGroup,
  exportChatLink,
  insertUnion,
  makeChannelAdmin,
  checkBotIsAdmin
};
