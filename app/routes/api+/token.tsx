export { loader } from "./token.loader.server";

interface GenerateTokenParams {
  twilioAccountSid: string;
  twilioApiKey: string;
  twilioApiSecret: string;
  identity: string;
}

