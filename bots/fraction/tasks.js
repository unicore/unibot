const { lazyFetchAllTableInternal } = require('./utils/apiTable');
const {saveUser } = require('./db')
const { Markup } = require('telegraf');
/* eslint-disable */
async function generateTaskOutput(task) {
    let output = `Сила: ${task.badge.power} POWER   |   Цветки: ${task.for_each}\n___________________\n`;

    output += generateHTML(JSON.parse(task.title), [
        Document,
        Paragraph,
        Text,
        Bold,
        Heading,
        ListItem,
        Link
    ])

    output = output.replace(/<[^>]+>/g, '\n');
    output += "___________________"
    return output
}



async function printTasks(bot, ctx, user, hostname, next_id){
  if (!hostname)
    hostname = bot.getEnv().CORE_HOST

  let reports = await get_reports(bot, user.eosname, hostname)
  let tasks = await get_tasks(bot, user.eosname, hostname, reports)
  // const reports = await bot.uni.coreContract.getReports(user.eosname)
  // const tasks = await bot.uni.coreContract.getTasks(user.eosname, reports)

  if (tasks[0] && user){

    user.task = tasks[0]
    await saveUser(bot.instanceName, user)

    const buttons = []
              
    buttons.push(Markup.button.callback(`приступить`, `startaction ${user.task.task_id}`))
    // buttons.push(Markup.button.callback(`следующая`, `nextaction ${user.task.task_id}`))
    // buttons.push(Markup.button.callback(`оказать помощь`, `createorder`))
    // console.log(tasks[0].title)
    
    let output = await generateTaskOutput(tasks[0])
    
    await ctx.replyWithHTML(output, Markup.inlineKeyboard(buttons, {columns: 1}).resize())
    
  } else {

    await ctx.replyWithHTML("Доступных заданий пока нет. Приходите позже.")
    // saveUser(bot.instanceName, user)
  }
}



function get_reports(bot, username, hostname){
    return lazyFetchAllTableInternal(bot.eosapi, "unicore", hostname, 'reports3', username, username, 1000, 4, 'i64')
}

async function get_tasks(bot, username, hostname, reports) {
    let tasks = await lazyFetchAllTableInternal(bot.eosapi, "unicore", hostname, 'tasks')
    let badges = await lazyFetchAllTableInternal(bot.eosapi, "unicore", hostname, 'badges')

    tasks = tasks.filter(task => Number(task.validated) === 1)

    tasks.map(task => {
      

      let report = reports.find(report => Number(report.task_id) === Number(task.task_id) && report.username === username)
      task.reports = reports.filter(report => Number(report.task_id) === Number(task.task_id))
      task.user_reports = task.reports.filter(report => report.username === username)

      task.no_reports_on_check = true

      task.reports.map(report => {
        task.no_reports_on_check = task.no_reports_on_check && report.need_check === false && report.approved === true
      })

      task.has_report = !!report

      if (report){
        task.report_approved = report.approved === true
      } else {
        task.report_approved = false
      }
      if (task.with_badge){
        task.badge = badges.find(b=> Number(task.badge_id) === Number(b.id))
      }

      try { 
        task.meta = JSON.parse(task.meta)
      } catch(e){
        task.meta = {}
      }
    })
    
    tasks = tasks.filter(task => task.has_report === false)
    
    return tasks
      
}




module.exports = {
    generateTaskOutput,
    printTasks
}