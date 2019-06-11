import { Botkit, BotkitMessage, BotWorker, BotkitDialogWrapper } from 'botkit';

import { SlackAdapter, SlackEventMiddleware, SlackMessageTypeMiddleware, SlackBotWorker } from 'botbuilder-adapter-slack';
import Cleverbot from './vendor/cleverbot-ts';
import _ from 'lodash';

// Load process.env values from .env file
import dotenv from 'dotenv';
dotenv.config();

// Import secrets from environment / .env
const {
  clientSigningSecret,
  botToken,
  cleverBotApiToken,
} = process.env;

// Validation
if (_.isNil(clientSigningSecret)) {
  throw new Error("Slack client signing secret missing. Please specify 'clientSigningSecret' in .env or specify it as an environment variable.");
}
if (_.isNil(botToken)) {
  throw new Error("Slack bot token (single slack) missing. Please specify 'botToken' in .env or specify it as an environment variable.");
}
if (_.isNil(cleverBotApiToken)) {
  throw new Error("Cleverbot API token missing. Please specify 'cleverBotApiToken' in .env or specify it as an environment variable.");
}

// Configure cleverbot
const cleverbotInstance = new Cleverbot({ apiKey: cleverBotApiToken });

// Configure botkit
const adapter = new SlackAdapter({
  clientSigningSecret: process.env.clientSigningSecret,
  botToken: process.env.botToken,
  redirectUri: process.env.redirectUri || '',
});
adapter.use(new SlackEventMiddleware());
adapter.use(new SlackMessageTypeMiddleware());

const controller = new Botkit({
  adapter,
});


// Wait for bot to start
controller.ready(() => {
  /**
   * Last-used "Cleverbot state" identifier used.
   * @TODO figure out how to distribute this across slacks, channels, users?
   */
  let lastCs: string | undefined;

  /**
   * Subscribe to any message directly referencing me
   */
  controller.hears(['.*'], ['direct_message', 'direct_mention', 'mention'], async function (bot, slackMessage) {
    // Type laundering
    const slackBot = bot as SlackBotWorker;

    // Asynchronous response hack
    replyLater(bot, slackMessage, async () => {
      try {
        if (_.isString(slackMessage.text)) {
          // Fire off parallel requests to both the cleverbot and the slack API
          const [
            /** Response from Cleverbot API */
            cleverbotResponse,
            /** Info about user who messaged me from Slack API */
            userInfo,
          ] = await Promise.all([
            cleverbotInstance.write(slackMessage.text, { cs: lastCs }),
            slackBot.api.users.info({ user: slackMessage.user }) as any,
          ]);

          // Store cs value from Cleverbot
          // @TODO do better
          lastCs = cleverbotResponse.cs;

          // Reply with response from Cleverbot
          await bot.reply(slackMessage, `${userInfo.user.name}: ${cleverbotResponse.output}`);
        } else {
          /* @TODO */
          console.error(`Heard message but contents were empty?`);
        }
      } catch (error) {
        // @TODO handle more gracefully, probably
        console.error(`Error occurred: `, JSON.stringify(error, null, 2));
        await slackBot.replyEphemeral(slackMessage, `An error occurred! Error: \`\`\`${JSON.stringify(error, null, 2)}\`\`\``);
      }
    });
  });
});

/**
 * @NOTE As suggested by: https://github.com/howdyai/botkit/issues/1684
 *
 * Cause botkit to respond to Slack immediately doing asynchronous work in the background.
 * Bit of a hack.
 *
 * @param bot BotWorker `bot` param from controller callback
 * @param message BotkitMessage `message` param from controller callback
 * @param callbackFn Callback function for asyncronous work
 */
function replyLater(bot: BotWorker, message: BotkitMessage, callbackFn: () => Promise<void>) {
  setTimeout(async () => {
    // Will have to reset context because turn has now ended
    await bot.changeContext(message.reference);
    // Call user processing function
    await callbackFn();
  });
}
