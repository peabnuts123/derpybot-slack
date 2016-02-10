var Botkit = require('botkit');
var Cleverbot = require('cleverbot-node');

var cleverbotInstance = new Cleverbot();

Cleverbot.prepare(function () {
    var tokens = {
        peabnuts123test: {
            derpy: "xoxb-20084304583-G2E20Lum8zLLIuZLUmwxJoXK",
        },
        becadevelopers: {
            derpy: "xoxb-20808795654-dSZSCRLuAkkhksvcACapGr1s"
        }
    };

    var controller = Botkit.slackbot({
        debug: false,
    });

    var bot = controller.spawn({
        token: tokens.becadevelopers.derpy
    }).startRTM();

    controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function (bot, message) {
        bot.reply(message, "Shutting down...");
        setTimeout(function () {
            process.exit();
        }, 3000);
    });

    controller.hears(['.*'], 'direct_message,direct_mention,mention', function (bot, slackMessage) {
        slackMessage.text = slackMessage.text.replace(/derpybot/ig, "CleverBot").replace(/Derpy/g, "CleverBot");

        cleverbotInstance.write(slackMessage.text, function (cbResponse) {
            cbResponse.message.replace(/cleverbot/ig, "Derpy");

            bot.reply(slackMessage, cbResponse.message);
        });
    });
});