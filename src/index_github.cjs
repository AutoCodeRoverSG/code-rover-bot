const { run } = require("@probot/adapter-github-actions");
const { robot } = require("./bot.js");

/**
 * For running the bot as a GitHub Action.
 */
run(robot);
