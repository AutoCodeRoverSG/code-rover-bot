const { run } = require("@probot/adapter-github-actions");
const { robot } = require("./bot.cjs");

/**
 * For running the bot as a GitHub Action.
 */
run(robot);
