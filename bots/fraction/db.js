const mongoose = require('mongoose');

const loadDB = () => mongoose.connection.db;

async function getUserHelixBalance(suffix, username) {
  try {
    const db = await loadDB();

    const collection = await db.collection(`helixBalances_${suffix}`);

    return await collection.find({ username }).toArray();
  } catch (e) {
    console.log('error: ', e.message);
  }
  return null;
}


async function insertWithdraw(suffix, user, withdraw) {
  try {
    const db = await loadDB();
    const collection = db.collection(`dacomWithdraws_${suffix}`);

    const res = await collection.insertOne(withdraw);
    console.log('INSERT RES', res);
    return res.insertedId.toString();
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
      { _id: mongoose.Types.ObjectId(withdraw_id) },
      {
        $set: {
          status,
        },
      },
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
    return await collection.findOne({ _id: mongoose.Types.ObjectId(withdraw_id) });
  } catch (e) {
    console.log('error: ', e.message);
  }
}

async function saveUser(suffix, user) {
  try {
    const db = await loadDB();
    const collection = db.collection(`helixUsers_${suffix}`);
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

async function addUserHelixBalance(suffix, username, balance) {
  if (balance) {
    try {
      const db = await loadDB();

      // eslint-disable-next-line no-param-reassign
      balance.username = username;

      const collection = db.collection(`helixBalances_${suffix}`);

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

    const collection = db.collection(`helixBalances_${suffix}`);

    await collection.deleteOne({ id: balanceId, username });
  } catch (e) {
    // empty
  }
}

async function getUserByEosName(suffix, eosname) {
  try {
    const db = await loadDB();
    const collection = db.collection(`helixUsers_${suffix}`);

    return await collection.findOne({ eosname });
  } catch (e) {
    console.log('error: ', e.message);
  }
  return null;
}

async function getNicknameByEosName(suffix, eosname) {
  try {
    const db = await loadDB();
    const collection = db.collection(`helixUsers_${suffix}`);

    const user = await collection.findOne({ eosname });

    if (user !== null) {
      return `${user.first_name ? user.first_name : ""} ${user.last_name ? user.last_name : ""}`;
    }
  } catch (e) {
    console.log('error: ', e.message);
  }

  return '-';
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

async function getTelegramByEosName(suffix, eosname) {
  try {
    const db = await loadDB();
    const collection = db.collection(`helixUsers_${suffix}`);

    const user = await collection.findOne({ eosname });
    if (user) return `${user.username ? '@' + user.username : '-'}`;
  } catch (e) {
    console.log('error: ', e.message);
  }
  return '-';
}

async function getDbHost(suffix, hostname) {
  try {
    const db = await loadDB();

    const collection = db.collection(`helixHosts_${suffix}`);

    return await collection.findOne({ username: hostname });
  } catch (e) {
    console.log('error: ', e.message);
  }

  return null;
}

async function saveDbHost(suffix, params) {
  try {
    const db = await loadDB();
    const collection = db.collection(`helixHosts_${suffix}`);

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

    const collection = db.collection(collectionName || `helixUsers_${suffix}`);

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

async function getSubscribers(bot, hostname) {
  try {
    const db = await loadDB();

    const collection = db.collection(`helixUsers_${bot.instanceName}`);
    let users;

    // eslint-disable-next-line max-len
    if (hostname === bot.getEnv().DEMO_HOST) users = await collection.find({ is_demo: true }).toArray();
    else users = await collection.find().toArray(); //{ subscribed_to: hostname }

    return users;
  } catch (e) {
    console.log('error: ', e.message);
  }

  return [];
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
  insertWithdraw,
  updateWithdraw,
  getWithdraw,
  getQuiz,
  getAllQuizzes,
  saveQuiz,
};
