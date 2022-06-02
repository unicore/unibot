const { lazyFetchAllTableInternal } = require('./utils/apiTable');

/* eslint-disable */
async function fetchGoals(bot, hostname) {
  const goals = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'goals');
  return goals
}

async function fetchCPartners(bot, hostname) {
  const cpartners = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'cpartners2');
  return cpartners
}


async function fetchCommunityFund(bot, hostname) {
  const communityFund = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'emission');
  return communityFund
}

async function fetchConditions(bot, hostname) {
  const conditions = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'conditions');
  return conditions
}


async function printGoalsMenu(bot, ctx, user, hostname){
  let cfund = await fetchCommunityFund(bot, hostname)
  console.log("cfund", cfund)
  let goals = await fetchGoals(bot, hostname)
  console.log("goals", goals)
  let cpartners = await fetchCPartners(bot, hostname)
  console.log("cpartners", cpartners)
  let conditions = await fetchConditions(bot, hostname)
  console.log("conditions", conditions)

}

module.exports = {
    printGoalsMenu
}