const { Configuration, OpenAIApi } = require("openai");


async function getAIAnswer(bot, text){
  console.log("start AI")
  const configuration = new Configuration({
    apiKey: bot.getEnv().OPEN_AI_KEY,
  });
  console.log("config finish")
  const openai = new OpenAIApi(configuration);
  console.log("send request", text)
  
  const response = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: text,
    temperature: 0.9,
    max_tokens: 4000,
    top_p: 1,
    frequency_penalty: 0.1,
    presence_penalty: 0.8,
    stop: [" Human:", " AI:"],
  });

  console.log("get response")
  
  return response
}

module.exports = {
  getAIAnswer
};
