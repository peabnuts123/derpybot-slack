/**
 * Options for configuring the Cleverbot interface
 */
export interface ConfigurationOptions {
  apiKey: string;
}

/**
 * Options for configuring Cleverbot when making a request
 */
interface CleverbotOptions {
  /** "Cleverbot State" (optional) */
  cs?: string;

  /** Alternative to `cs`, manually specify conversation history (optional) */
  vtext2?: string;
  /** Alternative to `cs`, manually specify conversation history (optional) */
  vtext3?: string;
  /** Alternative to `cs`, manually specify conversation history (optional) */
  vtext4?: string;
  /** Alternative to `cs`, manually specify conversation history (optional) */
  vtext5?: string;
  /** Alternative to `cs`, manually specify conversation history (optional) */
  vtext6?: string;
  /** Alternative to `cs`, manually specify conversation history (optional) */
  vtext7?: string;
  /** Alternative to `cs`, manually specify conversation history (optional) */
  vtext8?: string;
  /** Alternative to `cs`, manually specify conversation history (optional) */
  vtext9?: string;

  /** Value between 0 and 100. Varies Cleverbot’s reply from sensible (0) to wacky (100) */
  cb_settings_tweak1?: number;
  /** Value between 0 and 100. Varies Cleverbot’s reply from shy (0) to talkative (100) */
  cb_settings_tweak2?: number;
  /** Value between 0 and 100. Varies Cleverbot’s reply from self-centred (0) to attentive (100) */
  cb_settings_tweak3?: number;
}

/**
 * Options for making an actual request to the Cleverbot API
 */
interface CleverbotRequestOptions extends CleverbotOptions {
  /** API key (required) */
  key: string;
  /** Message for API (required) */
  input: string;
}

/**
 * Response from Cleverbot API on a successful request
 */
export interface SuccessfulCleverbotResponse {
  /** state of the conversation so far, which contains an encoded copy of the conversation id and history */
  cs: string;
  /** how many pairs of bot/user interactions have occurred so far */
  interaction_count: string;
  /** the entire user input, with any spaces trimmed off both ends */
  input: string;
  /** Cleverbot’s reply */
  output: string;
  /** identifier for this conversation between user and bot */
  conversation_id: string;
  /** any error information from Cleverbot, this is different from general the general errors described below */
  errorline?: string;
  /** the number of milliseconds the bot took to respond */
  time_taken: string;
  /** approximate number of seconds since conversation started */
  time_elapsed: string;
  /**
   * @TODO
   * interaction_1 to interaction_100: record of the previous interactions
   * The interaction variables come in pairs. For example interaction_1 contains
   * the last thing the user said, and interaction_1_other is the bot's reply.
   * interaction_2 was the user's previous input and so on.
   */
  // interaction_1: string;
  // ...
  // interaction_100: string;
  /**
   * @TODO don't know what type this is or when its used.
   *  Used by some versions of the software to store a callback function
   */
  // callback: string;
}

/**
 * Response from Cleverbot API on a failed request
 */
export interface FailedCleverbotResponse {
  status: string;
  error: string;
}


/**
 * Class for interacting with the Cleverbot API. You must supply an API token
 * when constructing an instance of this class.
 *
 * @example
 *
 * const cleverbotInstance = new Cleverbot({ apiKey: process.env.apiKey });
 */
export default class Cleverbot {
  /**
   * Token for authenticating with Cleverbot API. Keep it safe, keep it secret!
   */
  public apiKey: string;

  constructor(options: ConfigurationOptions) {
    this.apiKey = options.apiKey;
  }

  /**
   * Write a request to the Cleverbot API
   *
   * @param message Message to send to cleverbot
   * @param options Options for configuring this request e.g. `cs`
   */
  public async write(message: string, options?: CleverbotOptions): Promise<SuccessfulCleverbotResponse> {
    const requestQuery: CleverbotRequestOptions = {
      // Required params
      input: message,
      key: this.apiKey,

      // Optional params
      ...options,
    };

    // Make request
    const url = new URL('https://www.cleverbot.com/getreply');
    url.search = new URLSearchParams(formatRequestBody(requestQuery)).toString();
    const response = await fetch(url.toString());

    if (response.status === 200) {
      // Request succeeded
      const body: SuccessfulCleverbotResponse = await response.json();

      return body;
    } else {

      // Request failed
      const body: FailedCleverbotResponse = await response.json();
      throw new Error(`Request to Cleverbot failed. Code: ${response.status}. Status: ${body.status}. Error: ${body.error}`);
    }
  }

}

/**
 * Convert a requestOptions object to a `Record<string, string>` by removing any
 * empty values and casting all defined values to a string.
 *
 * @param requestOptions `CleverbotRequestOptions` instance with potentially optional parameters and such
 */
function formatRequestBody(requestOptions: CleverbotRequestOptions): Record<string, string> {
  const requestBody: Record<string, string> = {};
  for (const key in requestOptions) {
    /* @NOTE Type laundering ¯\_(ツ)_/¯ */
    const value = (requestOptions as any)[key];

    if (value) {
      // Convert all properties to string
      requestBody[key] = `${value}`;
    }
  }

  return requestBody;
}
