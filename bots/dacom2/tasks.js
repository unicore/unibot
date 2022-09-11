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



async function printTasks(ctx, user, hostname, next_id){
  if (!hostname)
    hostname = "core"

  let reports = await get_reports(user.eosname, hostname)
  let tasks = await get_tasks(user.eosname, hostname, reports)
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

    await ctx.replyWithHTML("Доступных заданий пока нет. Приходите позже")
    // saveUser(bot.instanceName, user)
  }
}



function get_reports(bot, username, hostname){
    return lazyFetchAllTableInternal(bot.eosapi, "unicore", hostname, 'reports3', username, username, 100, 4, 'i64')
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



async function createTask(bot, ctx, user, task) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  let res 
  // if (!user.create_task)
  //   user.create_task = {}
  
  try {
    res = await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'settask',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: task
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    const cons = res.processed.action_traces[0].console;
    
    const [, taskId] = cons.split('TASK_ID:');
    console.log("TASKIS: ", taskId)
    // operatorOrder.id = orderId;

    const buttons = [];

    // buttons.push(Markup.button.callback('Показать все цели', `showgoals ${user.create_goal.hostname} `));
    // ctx.editMessageText('Ваша цель успешно создана и добавлена в общий список.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

    // eslint-disable-next-line no-param-reassign
    // user.create_task = {};
    console.log("TASK CREATED!", taskId)
    
    return taskId
  } catch (e) {
    ctx.reply(e.message);
    console.error(e);
  }
}



async function createReport(bot, ctx, user, report) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  let res 
  // if (!user.create_task)
  //   user.create_task = {}
  
  
    res = await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'setreport',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: report
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    const cons = res.processed.action_traces[0].console;
    console.log("CONSOLE: ", cons)

    const [, reportId] = cons.split('REPORT_ID:');
    console.log("REPORT_ID: ", reportId)
    // operatorOrder.id = orderId;

    const buttons = [];

    // buttons.push(Markup.button.callback('Показать все цели', `showgoals ${user.create_goal.hostname} `));
    // ctx.editMessageText('Ваша цель успешно создана и добавлена в общий список.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

    // eslint-disable-next-line no-param-reassign
    // user.create_task = {};
    console.log("REPORT CREATED!", reportId)
    
    return reportId
  
}



module.exports = {
    generateTaskOutput,
    createTask,
    createReport
}