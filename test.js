var Botkit = require('botkit');
var Cleverbot = require('cleverbot-node');
var argv = require('yargs').argv;

var cleverbotInstance = new Cleverbot();

var currentToken = argv.token;
var cleverbotApiKey = argv['cleverbot-api-token'];


if (toString.call(currentToken) !== '[object String]') {
	throw new Error("No valid token present. Please use --token to specify a token");
}
if (toString.call(cleverbotApiKey) !== '[object String]') {
	throw new Error("No valid cleverbot API key present. Please use --cleverbot-api-token to specify a token");
}

cleverbotInstance.configure({botapi: cleverbotApiKey});

var controller = Botkit.slackbot({
	debug: false
});

var bot = controller.spawn({
	token: currentToken
}).startRTM();

controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function (bot, message) {
	bot.reply(message, "Shutting down...");
	setTimeout(function () {
		process.exit();
	}, 3000);
});

controller.hears(['.*'], 'direct_message,direct_mention,mention', function (bot, slackMessage) {
	bot.api.users.info({token: currentToken, user: slackMessage.user}, function(error, response) {
		if(!error) {
			slackMessage.text = slackMessage.text.replace(/^@derpy\s*/, "").replace(/derpybot/ig, "CleverBot").replace(/(?:Derpy|@derpy)/g, "CleverBot")

			cleverbotInstance.write(slackMessage.text, function (cbResponse) {
				cbResponse.output.replace(/cleverbot/ig, "Derpy");

				bot.reply(slackMessage, response.user.name + ": " + cbResponse.output);
			});			
		} else {
			bot.reply("ERROR OCCURRED :(");
		}
	});
});