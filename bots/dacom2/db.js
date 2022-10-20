const mongoose = require('mongoose');

const loadDB = () => mongoose.connection.db;

async function getUserHelixBalance(suffix, username) {
  try {
    const db = await loadDB();

    const collection = await db.collection(`dacomBalances_${suffix}`);

    return await collection.find({ username }).toArray();
  } catch (e) {
    console.log('error: ', e.message);
  }
  return null;
}

async function saveUser(suffix, user) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUsers_${suffix}`);
    // eslint-disable-next-line no-param-reassign
    user.join_at = new Date().getTime();
    await collection.updateOne(
      { id: user.id },
      { $set: user },
      { upsert: true },
    );
  } catch (e) {
    console.log('error: ', e.message);
  }
}
async function saveHost(suffix, host) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomHosts_${suffix}`);
    // eslint-disable-next-line no-param-reassign

    host.created_at = new Date().getTime();

    await collection.updateOne(
      { eosname: host.eosname },
      { $set: host },
      { upsert: true },
    );
  } catch (e) {
    console.log('error: ', e.message);
  }
}

async function getQuiz(suffix, id) {
  try {
    const db = await loadDB();

    const collection = db.collection(`dacomQuiz_${suffix}`);

    return await collection.findOne({ id });
  } catch (e) {
    console.log('error: ', e.message);
  }

  return null;
}

async function getAllQuizzes(suffix) {
  try {
    const db = await loadDB();

    const collection = db.collection(`dacomQuiz_${suffix}`);

    return await collection.find({});
  } catch (e) {
    console.log('error: ', e.message);
  }

  return null;
}


async function saveQuiz(suffix, user, quiz) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomQuiz_${suffix}`);

    await collection.updateOne(
      { id: quiz.id },
      { $set: quiz },
      { upsert: true },
    );
  } catch (e) {
    console.log('error: ', e.message);
  }
}

async function addUserHelixBalance(suffix, username, balance) {
  if (balance) {
    try {
      const db = await loadDB();

      // eslint-disable-next-line no-param-reassign
      balance.username = username;

      const collection = db.collection(`dacomBalances_${suffix}`);

      await collection.updateOne(
        { username, id: balance.id },
        { $set: balance },
        { upsert: true },
      );
    } catch (e) {
      console.log('error: ', e.message);
    }
  }
}

async function delUserHelixBalance(suffix, username, balanceId) {
  try {
    const db = await loadDB();

    const collection = db.collection(`dacomBalances_${suffix}`);

    await collection.deleteOne({ id: balanceId, username });
  } catch (e) {
    // empty
  }
}

async function getUserByEosName(suffix, eosname) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUsers_${suffix}`);

    return await collection.findOne({ eosname });
  } catch (e) {
    console.log('error: ', e.message);
  }
  return null;
}


async function getUserByUsername(suffix, username) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUsers_${suffix}`);

    return await collection.findOne({ username });
  } catch (e) {
    console.log('error: ', e.message);
  }
  return null;
}


async function getUserByResumeChannelId(suffix, partners_channel_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUsers_${suffix}`);

    return await collection.findOne({ partners_channel_id });
  } catch (e) {
    console.log('error: ', e.message);
  }
  return null;
}

async function getNicknameByEosName(suffix, eosname) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUsers_${suffix}`);

    const user = await collection.findOne({ eosname });

    if (user !== null) {
      return `${user.first_name} ${user.last_name}`;
    }
  } catch (e) {
    console.log('error: ', e.message);
  }

  return 'никнейм не определен';
}

async function getTelegramByEosName(suffix, eosname) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUsers_${suffix}`);

    const user = await collection.findOne({ eosname });
    if (user) return `@${user.username}`;
  } catch (e) {
    console.log('error: ', e.message);
  }
  return 'не определён';
}

async function getDbHost(suffix, hostname) {
  try {
    const db = await loadDB();

    const collection = db.collection(`dacomHosts_${suffix}`);

    return await collection.findOne({ username: hostname });
  } catch (e) {
    console.log('error: ', e.message);
  }

  return null;
}

async function saveDbHost(suffix, params) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomHosts_${suffix}`);

    await collection.updateOne(
      { username: params.host.username },
      { $set: params },
      { upsert: true },
    );
  } catch (e) {
    console.log('error: ', e.message);
  }
}

const getRestoredUserFromAnyBots = async (currentBotName, id) => {
  // eslint-disable-next-line global-require
  const Bot = require('../../models/Bot');
  const bots = await Bot.find({ name: { $ne: currentBotName } });
  const botsModes = ['dacom', 'helix'];

  // eslint-disable-next-line no-restricted-syntax
  for (const botMode of botsModes) {
    // eslint-disable-next-line no-restricted-syntax
    for (const bot of bots) {
      // eslint-disable-next-line no-await-in-loop,no-use-before-define
      const user = await getUser(bot.name, id, `${botMode}Users_${bot.name}`, true);

      if (user) {
        // eslint-disable-next-line no-await-in-loop
        await saveUser(currentBotName, user);
        return;
      }
    }
  }

  // eslint-disable-next-line no-use-before-define
  const user = await getUser(null, id, 'users', true);
  if (user) {
    // eslint-disable-next-line no-await-in-loop
    await saveUser(currentBotName, user);
  }
};

async function getUser(suffix, id, collectionName, disableRestoreFromAnyBots) {
  try {
    const db = await loadDB();

    const collection = db.collection(collectionName || `dacomUsers_${suffix}`);

    const user = await collection.findOne({ id });
    if (user) {
      return user;
    }
    if (!disableRestoreFromAnyBots) {
      await getRestoredUserFromAnyBots(suffix, id);
      return await getUser(suffix, id, null, true);
    }
  } catch (e) {
    console.log('error: ', e.message);
  }

  return null;
}

async function getHost(suffix, id) {
  try {
    const db = await loadDB();

    const collection = db.collection(`dacomHosts_${suffix}`);

    return await collection.findOne({ id });
  } catch (e) {
    console.log('error: ', e.message);
  }

  return null;
}

async function getSubscribers(bot, hostname) {
  try {
    const db = await loadDB();

    const collection = db.collection(`dacomUsers_${bot.instanceName}`);
    let users;

    // eslint-disable-next-line max-len
    if (hostname === bot.getEnv().DEMO_HOST) users = await collection.find({ is_demo: true }).toArray();
    else users = await collection.find({ subscribed_to: hostname }).toArray();

    return users;
  } catch (e) {
    console.log('error: ', e.message);
  }

  return [];
}

// eslint-disable-next-line camelcase
async function insertMessage(suffix, user, from, message, message_id, type, meta) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomChats_${suffix}`);

    await collection.insertOne({
      // eslint-disable-next-line camelcase
      type, message_id, id: user.id, eosname: user.eosname, from, message, time: new Date(),
      ...meta
    });
  } catch (e) {
    console.log('error: ', e.message);
  }
}

// eslint-disable-next-line camelcase
async function getMessage(suffix, chatId, message_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomChats_${suffix}`);

    console.log('find message_id', message_id, chatId);

    // eslint-disable-next-line camelcase
    const message = await collection.findOne({ message_id });
    return message;
  } catch (e) {
    console.log('error: ', e.message);
  }

  return null;
}

async function getChat(suffix, eosname) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomChats_${suffix}`);

    return await collection.find({ eosname }).toArray();
  } catch (e) {
    console.log('error: ', e.message);
  }

  return null;
}


// eslint-disable-next-line camelcase
async function insertUnion(suffix, union) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUnions_${suffix}`);

    await collection.insertOne({
      // eslint-disable-next-line camelcase
      ...union,
      created_at: new Date()
    });
  } catch (e) {
    console.log('error: ', e.message);
  }
}



// eslint-disable-next-line camelcase
async function insertGoal(suffix, goal) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomGoals_${suffix}`);

    await collection.insertOne({
      // eslint-disable-next-line camelcase
      ...goal,
      created_at: new Date()
    });
  } catch (e) {
    console.log('error: ', e.message);
  }
}



// eslint-disable-next-line camelcase
async function insertTask(suffix, task) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomTasks_${suffix}`);

    await collection.insertOne({
      // eslint-disable-next-line camelcase
      ...task,
      created_at: new Date()
    });
  } catch (e) {
    console.log('error: ', e.message);
  }
}



// eslint-disable-next-line camelcase
async function insertReport(suffix, report) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomReports_${suffix}`);

    await collection.insertOne({
      // eslint-disable-next-line camelcase
      ...report,
      created_at: new Date()
    });
  } catch (e) {
    console.log('error: ', e.message);
  }
}



async function addMainChatMessageToGoal(suffix, channel_message_id, chat_message_id, chat_id, channel_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomGoals_${suffix}`);
    // eslint-disable-next-line no-param-reassign
    
    await collection.updateOne(
      { channel_message_id, channel_id },
      { $set: {"chat_message_id": chat_message_id, "chat_id": chat_id.toString()} },
      { upsert: false },
    );
  } catch (e) {
    console.log('error: ', e.message);
  }
}


async function addMainChatMessageToReport(suffix, report_channel_message_id, updater) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomReports_${suffix}`);
    // eslint-disable-next-line no-param-reassign
    
    await collection.updateOne(
      { report_channel_message_id },
      { $set: updater },
      { upsert: false },
    );
  } catch (e) {
    console.log('error: ', e.message);
  }
}


// eslint-disable-next-line camelcase
async function getGoalByChatMessage(suffix, host, channel_message_id, channel_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomGoals_${suffix}`);

    let res = await collection.findOne({
      host,
      channel_message_id,
      channel_id
    });
    return res 
  } catch (e) {
    console.log('error: ', e.message);
  }
}



// eslint-disable-next-line camelcase
async function getGoal(suffix, goal_id, chat_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomGoals_${suffix}`);

    let res = await collection.findOne({
      goal_id,
      chat_id
    });
    return res 
  } catch (e) {
    console.log('error: ', e.message);
  }
}


// eslint-disable-next-line camelcase
async function getAllHeadGoalsMessages(suffix, goal_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomGoals_${suffix}`);

    let res = await collection.find({
      goal_id: goal_id.toString()
    }).toArray();

    return res 
  } catch (e) {
    console.log('error: ', e.message);
  }
}




// eslint-disable-next-line camelcase
async function getTaskByChatMessage(suffix, host, chat_message_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomTasks_${suffix}`);

    let res = await collection.findOne({
      host,
      chat_message_id
    });
    return res 
  } catch (e) {
    console.log('error: ', e.message);
  }
}


// eslint-disable-next-line camelcase
async function getTaskById(suffix, host, task_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomTasks_${suffix}`);

    let res = await collection.findOne({
      host,
      task_id
    });
    return res 
  } catch (e) {
    console.log('error: ', e.message);
  }
}





// eslint-disable-next-line camelcase
async function getUnion(suffix, chatId) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUnions_${suffix}`);
    console.log("GET UNION: ", chatId)
    let res = await collection.findOne({
      id: chatId
    });
    return res 
  } catch (e) {
    console.log('error: ', e.message);
  }
}



// eslint-disable-next-line camelcase
async function getUnionByType(suffix, ownerEosname, type) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUnions_${suffix}`);

    let res = await collection.findOne({
      ownerEosname,
      type
    });
    return res 
  } catch (e) {
    console.log('error: ', e.message);
  }
}


// eslint-disable-next-line camelcase
async function getUnionByHostType(suffix, host, type) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUnions_${suffix}`);

    let res = await collection.findOne({
      host,
      type
    });
    return res 
  } catch (e) {
    console.log('error: ', e.message);
  }
}


async function insertProject(suffix, project){
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomProjects_${suffix}`);

    let res = await collection.insertOne(project);


  } catch (e) {
    console.log('error: ', e.message);
  }
}

async function getProjectsCount(suffix) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUnions_${suffix}`);

    let tickets = await collection.find({type: 'projectChannel'}).toArray();

    return tickets.length

  } catch (e) {
    console.log('error: ', e.message);
  }
}


async function getProjects(suffix) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUnions_${suffix}`);

    let projects = await collection.find({type: 'projectChannel', is_private: false}).toArray();

    return projects

  } catch (e) {
    console.log('error: ', e.message);
  }
}


async function getMyProjects(suffix, host) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUnions_${suffix}`);

    let projects = await collection.find({type: 'projectChannel', host}).toArray();

    return projects

  } catch (e) {
    console.log('error: ', e.message);
  }
}



async function getProject(suffix, number) {
  try {

    const db = await loadDB();
    const collection = db.collection(`dacomUnions_${suffix}`);

    let project = await collection.findOne({type: 'projectChannel', projectCount: Number(number)})

    return project

  } catch (e) {
    console.log('error: ', e.message);
  }
}


async function insertWithdraw(suffix, user, withdraw) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomWithdraws_${suffix}`);

    let res = await collection.insertOne(withdraw);
    console.log("INSERT RES", res)
    return res.insertedId
  } catch (e) {
    console.log('error: ', e.message);
  }
}



async function updateWithdraw(suffix, withdraw_id, status) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomWithdraws_${suffix}`);
    // eslint-disable-next-line no-param-reassign
    await collection.updateOne(
      { "_id": mongoose.Types.ObjectId(withdraw_id) },
      { $set: {
        status
      } },
      { upsert: false },
    );

  } catch (e) {
    console.log('error: ', e.message);
  }
}



async function getWithdraw(suffix, withdraw_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomWithdraws_${suffix}`);
    // eslint-disable-next-line no-param-reassign
    return await collection.findOne({ "_id":  mongoose.Types.ObjectId(withdraw_id)});

  } catch (e) {
    console.log('error: ', e.message);
  }
}


async function getTickets(suffix, user) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomTickets_${suffix}`);

    let tickets = await collection.find({eosname: user.eosname}).toArray();

    return tickets

  } catch (e) {
    console.log('error: ', e.message);
  }
}


module.exports = {
  loadDB,
  getUserHelixBalance,
  getUserByEosName,
  getNicknameByEosName,
  getTelegramByEosName,
  saveUser,
  addUserHelixBalance,
  delUserHelixBalance,
  getUser,
  getDbHost,
  saveDbHost,
  getSubscribers,
  getQuiz,
  getAllQuizzes,
  saveQuiz,
  saveHost,
  getHost,
  insertMessage,
  getMessage,
  getChat,
  getUserByResumeChannelId,
  insertUnion,
  getUnion,
  getUnionByType,
  insertGoal,
  addMainChatMessageToGoal,
  getGoalByChatMessage,
  insertTask,
  getTaskByChatMessage,
  insertReport,
  addMainChatMessageToReport,
  getTaskById,
  getUserByUsername,
  insertWithdraw,
  updateWithdraw,
  getWithdraw,
  getProjectsCount,
  getProject,
  getProjects,
  getMyProjects,
  insertProject,
  getUnionByHostType,
  getAllHeadGoalsMessages,
  getGoal
};
