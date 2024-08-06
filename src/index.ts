import { Probot } from "probot";
import { run_acr } from "./run_acr.js";

const bot_mention = "@code-rover-bot";

export default (app: Probot) => {
  app.on("issues.opened", async (context) => {
    const issue_text = context.payload.issue.body;
    app.log.info(issue_text);

    if (issue_text == null) {
      return;
    }

    if (!issue_text.includes(bot_mention)) {
      return;
    }

    const issueComment = context.issue({
      body: "I'm invoked! Going to create a solution for this issue.",
    });
    await context.octokit.issues.createComment(issueComment);

    const repo_url = context.payload.repository.clone_url;

    run_acr(repo_url, issue_text);
  });

  app.on("issue_comment.created", async (context) => {
    const comment_text = context.payload.comment.body;
    app.log.info(comment_text);

    if (comment_text == null) {
      return;
    }

    if (!comment_text.includes(bot_mention)) {
      return;
    }

    const issueComment = context.issue({
      body: "I'm invoked! Going to create a solution for this issue.",
    });
    await context.octokit.issues.createComment(issueComment);

    const issue_text = context.payload.issue.body;

    if (issue_text == null) {
      return;
    }

    const repo_url = context.payload.repository.clone_url;

    run_acr(repo_url, issue_text);
  });
};
