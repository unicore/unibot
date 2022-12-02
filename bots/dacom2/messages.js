/* eslint-disable no-await-in-loop */
const { Markup } = require('telegraf');
const { mainButtons } = require('./utils/bot');
const { loadDB, getUserByEosName } = require('./db');
const { fetchReport, fetchGoal } = require('./goals');

async function sendMessageToUser(bot, user, message, extra) {
  try {
    let id = {};
    if ('text' in message) id = await bot.telegram.sendMessage(user.id, message.text, { ...extra, parse_mode: 'html' });
    if ('photo' in message) id = await bot.telegram.sendPhoto(user.id, message.photo[3].file_id, { ...extra, parse_mode: 'html' });
    if ('voice' in message) id = await bot.telegram.sendVoice(user.id, message.voice.file_id, { ...extra, parse_mode: 'html' });
    if ('audio' in message) id = await bot.telegram.sendAudio(user.id, message.audio.file_id, { ...extra, parse_mode: 'html' });
    if ('video_note' in message) id = await bot.telegram.sendVideoNote(user.id, message.video_note.file_id, { ...extra, parse_mode: 'html' });
    if ('document' in message) id = await bot.telegram.sendDocument(user.id, message.document.file_id, { ...extra, parse_mode: 'html' });

    if ('video' in message) id = await bot.telegram.sendVideo(user.id, message.video.file_id, { ...extra, parse_mode: 'html' });
    if ('doc' in message) {
      // eslint-disable-next-line max-len
      id = await bot.telegram.sendDocument(user.id, { source: message.doc, filename: extra.filename });
    } if ('venue' in message) {
      // eslint-disable-next-line max-len
      id = await bot.telegram.sendVenue(user.id, message.location.latitude, message.location.longitude, message.venue.title, message.venue.address, { ...extra, parse_mode: 'html' });
    } else if ('location' in message) {
      // eslint-disable-next-line max-len
      id = await bot.telegram.sendLocation(user.id, message.location.latitude, message.location.longitude, { ...extra, parse_mode: 'html' });
    }

    return id.message_id;
  } catch (e) {
    console.error(e);
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

async function constructReportMessage(bot, hostname, report, reportId) {
  if (!report && reportId) { report = await fetchReport(bot, hostname, reportId); }

  if (report) {
    const goal = await fetchGoal(bot, hostname, report.goal_id);

    console.log('total_shares: ', goal.second_circuit_votes, report.positive_votes, report.negative_votes);
    let text = '';
    let bonus;
    let votes;

    const user = await getUserByEosName(bot.instanceName, report.username);
    const from = (user.username && user.username !== '') ? '@' + user.username : report.username;
    text += `🏁 #ОТЧЁТ_${report.report_id} от ${from}: \n`;
    text += `${report.data}\n\n`;

    if (bot.octokit) {
      try {
        const githubPullRequestUrl = report.data.match(/https:\/\/github.com\/.*\/pull\/\d+/);
        if (githubPullRequestUrl) {
          const prData = await bot.octokit.pulls.get({
            owner: githubPullRequestUrl[0].split('/')[3],
            repo: githubPullRequestUrl[0].split('/')[4],
            pull_number: githubPullRequestUrl[0].split('/')[6],
          });

          text += `#PullRequest ${prData.data.title}\n`;
          // text + `В проекте: ${prData.data.base.repo.full_name}\n`;
          text += `📁 файлов затронуто: ${prData.data.changed_files}\n`;
          text += `\tстроки: +${prData.data.additions} -${prData.data.deletions}\n`;
        } else {
          const githubCommitUrl = report.data.match(/https:\/\/github.com\/.*\/commit\/\w+/);
          if (githubCommitUrl) {
            const commitData = await bot.octokit.repos.getCommit({
              owner: githubCommitUrl[0].split('/')[3],
              repo: githubCommitUrl[0].split('/')[4],
              ref: githubCommitUrl[0].split('/')[6],
            });

            const repoData = await bot.octokit.repos.get({
              owner: githubCommitUrl[0].split('/')[3],
              repo: githubCommitUrl[0].split('/')[4],
            });

            text += `#Commit ${commitData.data.commit.message}\n`;
            // text += `В проекте: ${repoData.data.full_name}\n`;
            text += `📁 файлов затронуто: ${commitData.data.files.length}\n`;
            text += `\tстроки: +${commitData.data.stats.additions} -${commitData.data.stats.deletions}\n`;
          }
        }
      } catch (e) {
        console.log('github error', e);
      }
    }

    text += `Одобрен: ${report.approved === '1' ? '🟢' : '🟡'}\n`;
    text += `Затрачено: ${parseFloat(report.duration_secs / 60).toFixed(0)} мин\n`;

    if (report.approved) {
      // votes = parseFloat((report.positive_votes - report.negative_votes) / (goal.second_circuit_votes === 0 ? 1 : goal.second_circuit_votes  ) * 100).toFixed(2)
      // text += `Голоса: ${}%\n`
      bonus = `${(report.positive_votes - report.negative_votes) / (goal.second_circuit_votes === 0 ? report.positive_votes : goal.second_circuit_votes) * goal.total_power_on_distribution} POWER\n`;
      bonus = parseFloat(bonus).toFixed(2) + ' POWER';
    } else {
      // votes = parseFloat((report.positive_votes - report.negative_votes) / (goal.second_circuit_votes === 0 ? 1 : goal.second_circuit_votes  ) * 100).toFixed(2)

      // text += `Голоса: ${parseFloat((report.positive_votes - report.negative_votes) / (goal.second_circuit_votes === report.positive_votes ? 1 : goal.second_circuit_votes + report.positive_votes  ) * 100).toFixed(2)}%\n`
      if (report.positive_votes === 0) {
        bonus = parseFloat(0).toFixed(2) + ' POWER';
      } else {
        bonus = `${parseFloat((report.positive_votes - report.negative_votes) / (goal.second_circuit_votes + report.positive_votes) * (goal.total_power_on_distribution + (parseFloat(report.requested) * 0.1))).toFixed(2)} POWER\n`;
      }
    }

    text += `Подарок: ${report.requested} + ${bonus}\n`;

    // text += `Бонус:

    // text += `Постановщик: ${report.creator}\n`
    // text += `Координатор: ${report.benefactor}\n`
    return text;
  } else return null;
}

module.exports = {
  sendMessageToUser, sendMessageToAll,
};
