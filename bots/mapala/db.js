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

async function insertRequest(suffix, user, message_id, message) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomRequests_${suffix}`);

    await collection.insertOne({
      // eslint-disable-next-line camelcase
      message_id, user_id: user.id, eosname: user.eosname, message, time: new Date(), closed: false
    });
  } catch (e) {
    console.log('error: ', e.message);
  }
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

async function saveHost(suffix, user, env) {
  try {
    const db = await loadDB();
    const hosts = db.collection(`dacomHosts_${suffix}`);

    await hosts.updateOne(
      { id: user.id },
      {
        $set: {
          eosname: user.eosname,
          env,
        },
      },
      { upsert: true },
    );
  } catch (e) {
    console.log('error: ', e.message);
  }
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

async function getUserByResumeChannelId(suffix, resume_channel_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomUsers_${suffix}`);

    return await collection.findOne({ resume_channel_id });
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
async function insertMessage(suffix, user, from, message, message_id, type) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomChats_${suffix}`);

    await collection.insertOne({
      // eslint-disable-next-line camelcase
      type, message_id, id: user.id, eosname: user.eosname, from, message, time: new Date(),
    });
  } catch (e) {
    console.log('error: ', e.message);
  }
}

// eslint-disable-next-line camelcase
async function getMessage(suffix, message_id) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomChats_${suffix}`);

    console.log('find message_id', message_id);

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

async function insertTicket(suffix, user, ticket) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomTickets_${suffix}`);

    await collection.insertOne(ticket);
  } catch (e) {
    console.log('error: ', e.message);
  }
}

async function insertStudent(suffix, user, student) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomStudents_${suffix}`);

    await collection.insertOne(student);
  } catch (e) {
    console.log('error: ', e.message);
  }
}

async function insertGoal(suffix, user, goal) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomGoals_${suffix}`);

    await collection.insertOne(goal);
  } catch (e) {
    console.log('error: ', e.message);
  }
}

async function insertWithdraw(suffix, user, withdraw) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomWithdraws_${suffix}`);

    let res = await collection.insertOne(withdraw);
    console.log('INSERT RES', res)
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
      { '_id': mongoose.Types.ObjectId(withdraw_id) },
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
    return await collection.findOne({ '_id':  mongoose.Types.ObjectId(withdraw_id)});
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
  insertRequest,
  insertTicket,
  getTickets,
  insertStudent,
  insertGoal,
  insertWithdraw,
  updateWithdraw,
  getWithdraw
};
