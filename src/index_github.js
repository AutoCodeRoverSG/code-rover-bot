import { run } from "@probot/adapter-github-actions";
import { robot } from "./bot.js";

/**
 * For running the bot as a GitHub Action.
 */
run(robot);
