import { Botkit, BotkitMessage, BotWorker } from 'botkit';
import { SlackAdapter, SlackEventMiddleware, SlackMessageTypeMiddleware, SlackBotWorker } from 'botbuilder-adapter-slack';
import _ from 'lodash';

import Cleverbot from './vendor/cleverbot-ts';

// IMPORT SECRETS
const {
  clientSigningSecret,
  botToken,
  cleverBotApiToken,
} = process.env;


// VALIDATION
if (_.isNil(clientSigningSecret) || _.isEmpty(clientSigningSecret)) {
  throw new Error("Slack client signing secret missing. Please specify 'clientSigningSecret' in .env or specify it as an environment variable.");
}
if (_.isNil(botToken) || _.isEmpty(botToken)) {
  throw new Error("Slack bot token (single slack) missing. Please specify 'botToken' in .env or specify it as an environment variable.");
}
if (_.isNil(cleverBotApiToken) || _.isEmpty(cleverBotApiToken)) {
  throw new Error("Cleverbot API token missing. Please specify 'cleverBotApiToken' in .env or specify it as an environment variable.");
}


// CONFIGURE CLEVERBOT
const cleverbotInstance = new Cleverbot({ apiKey: cleverBotApiToken });


// CONFIGURE BOTKIT
const adapter = new SlackAdapter({
  clientSigningSecret,
  botToken,
  redirectUri: process.env.redirectUri || '',
});
adapter.use(new SlackEventMiddleware());
adapter.use(new SlackMessageTypeMiddleware());

const controller = new Botkit({
  adapter,
});


// Wait for bot to start
controller.ready(() => {
  // CLEVERBOT STATE
  /**
   * Cleverbot state. State is stored per channel per team.
   * Any response from Cleverbot is stored in the state map with respect
   *  to the channel and team the conversation occurred in.
   */
  const cleverbotStateMap: Record<string, Record<string, string>> = {};
  /**
   * Map of debounced timeout callbacks for clearing the state of a channel
   * with respect to a team. Whenever a message is sent it replaces the old
   * timeout i.e. "restarts the timer"
   */
  const clearStateHooksMap: Record<string, Record<string, NodeJS.Timeout>> = {};
  /**
   * Time without messages in a channel before Derpy forgets the conversation state
   */
  const CLEVERBOT_STATE_CLEAR_DEBOUNCE_TIME_SECONDS = 60 * 30;


  // CONTROLLERS
  /**
   * Debug hook to dump the current conversation state
   */
  controller.hears('!debug_dump-state', ['direct_message', 'direct_mention'], async function (bot, message) {
    // Type laundering
    const slackMessage = message as any;

    const teamId = slackMessage.team;
    const channelId = slackMessage.channel;

    const decodedState = getStateDecoded(teamId, channelId);
    await bot.reply(message, `Current conversation state:\r\n\`\`\`${decodedState}\`\`\``);
  });

  /**
   * Subscribe to any message directly referencing me
   */
  controller.hears(['.*'], ['direct_message', 'direct_mention', 'mention'], async function (bot, message) {
    // Type laundering
    const slackBot = bot as SlackBotWorker;
    const slackMessage = message as any;

    const teamId = slackMessage.team;
    const channelId = slackMessage.channel;

    // Asynchronous response hack
    replyLater(bot, message, async () => {
      try {
        if (_.isString(message.text)) {
          // Fire off parallel requests to both the cleverbot and the slack API
          const [
            /** Response from Cleverbot API */
            cleverbotResponse,
            /** Info about user who messaged me from Slack API */
            userInfo,
          ] = await Promise.all([
            cleverbotInstance.write(message.text, { cs: getState(teamId, channelId) }),
            slackBot.api.users.info({ user: message.user }) as any,
          ]);

          // Store cs value from Cleverbot
          putState(teamId, channelId, cleverbotResponse.cs);

          // Reply with response from Cleverbot
          await bot.reply(message, `${userInfo.user.name}: ${cleverbotResponse.output}`);
        } else {
          /* @TODO */
          console.error(`Heard message but contents were empty?`);
        }
      } catch (error) {
        // @TODO handle more gracefully, probably
        console.error(`Error occurred: `, JSON.stringify(error, null, 2));
        await slackBot.replyEphemeral(message, `An error occurred! Error: \`\`\`${JSON.stringify(error, null, 2)}\`\`\``);
      }
    });
  });


  // STATE MANAGEMENT
  /**
   * Get the current cleverbot state for a given channel with respect to a given team
   *
   * @param teamId Unique identifier for team
   * @param channelId Unique identifier for channel
   */
  function getState(teamId: string, channelId: string): string | undefined {
    // Look up team state
    let teamStateMap: Record<string, string> | undefined = cleverbotStateMap[teamId];
    if (teamStateMap === undefined) {
      cleverbotStateMap[teamId] = teamStateMap = {};
    }

    // Return channel state with respect to team
    return teamStateMap[channelId];
  }

  /**
   * Store the a conversation state string for a channel with respect to a team.
   * Registers a debounced callback which will clear the state after
   * `CLEVERBOT_STATE_CLEAR_DEBOUNCE_TIME_SECONDS` seconds of no updates.
   *
   * @param teamId
   * @param channelId
   * @param cleverbotState New state to store
   */
  function putState(teamId: string, channelId: string, cleverbotState: string): void {
    // Look up team state
    let teamStateMap: Record<string, string> | undefined = cleverbotStateMap[teamId];
    if (teamStateMap === undefined) {
      cleverbotStateMap[teamId] = teamStateMap = {};
    }

    // Store cleverbot state in team state with respect to channel
    teamStateMap[channelId] = cleverbotState;

    // (Debounced) clear conversation state after 1 hour
    // Look up team debounce hooks
    let teamDebounceHookMap: Record<string, NodeJS.Timeout> | undefined = clearStateHooksMap[teamId];
    if (teamDebounceHookMap === undefined) {
      clearStateHooksMap[teamId] = teamDebounceHookMap = {};
    }

    // If timeout exists for channel, clear it
    if (teamDebounceHookMap[channelId] !== undefined) {
      clearTimeout(teamDebounceHookMap[channelId]);
    }

    // Store new timeout
    teamDebounceHookMap[channelId] = setTimeout(() => {
      // Clear state from team state map
      if (teamStateMap !== undefined) {
        delete teamStateMap[channelId];
      }
      // Clear current hook from debounce hook map
      if (teamDebounceHookMap !== undefined) {
        delete teamDebounceHookMap[channelId];
      }
    }, CLEVERBOT_STATE_CLEAR_DEBOUNCE_TIME_SECONDS * 1000);
  }

  /**
   * Get the current conversation state for a channel with respect to a team
   * and decode it into a readable format
   *
   * @param teamId Unique identifier for team
   * @param channelId Unique identifier for channel
   */
  function getStateDecoded(teamId: string, channelId: string): string | undefined {
    const state = getState(teamId, channelId);
    if (state === undefined) {
      return undefined;
    } else {
      return Buffer.from(state, 'base64').toString('ascii');
    }
  }
});


// UTILITY FUNCTIONS
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
