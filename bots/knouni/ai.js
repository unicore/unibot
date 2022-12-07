const { Configuration, OpenAIApi } = require("openai");


async function getAIAnswer(bot, text){
  console.log("start AI")
  const configuration = new Configuration({
    apiKey: "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",
  });
  console.log("config finish")
  const openai = new OpenAIApi(configuration);
  console.log("send request")
  
  const response = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: text,
    temperature: 0.9,
    max_tokens: 4000,
    top_p: 1,
    frequency_penalty: 0.0,
    presence_penalty: 0.6,
    stop: [" Human:", " AI:"],
  });

  console.log("get response")
  
  return response
}

module.exports = {
  getAIAnswer
};
