import { Probot } from "probot";
import { runAcr } from "./run_acr.js";

const botMention = "@code-rover-bot";

export default (app: Probot) => {
  app.on("issues.opened", async (context) => {
    const issueText = context.payload.issue.body;
    app.log.info(issueText);

    if (issueText == null) {
      return;
    }

    if (!issueText.includes(botMention)) {
      return;
    }

    const issueComment = context.issue({
      body: "I'm invoked! Going to create a solution for this issue.",
    });
    await context.octokit.issues.createComment(issueComment);

    const issueId = context.payload.issue.id;
    const issueUrl = context.payload.issue.html_url;

    const repoUrl = context.payload.repository.clone_url;
    const repoName = context.payload.repository.name;

    runAcr(issueId, repoName, repoUrl, issueText);
  });

  app.on("issue_comment.created", async (context) => {

    console.log("haha")

    const commentText = context.payload.comment.body;
    app.log.info(commentText);

    if (commentText == null) {
      return;
    }

    if (!commentText.includes(botMention)) {
      return;
    }

    const issueComment = context.issue({
      body: "I'm invoked! Going to create a solution for this issue.",
    });
    await context.octokit.issues.createComment(issueComment);

    const issueText = context.payload.issue.body;

    if (issueText == null) {
      return;
    }

    const issueId = context.payload.issue.id;
    const issueUrl = context.payload.issue.url;

    const issueHtmlUrl = context.payload.issue.html_url;

    const repoUrl = context.payload.repository.clone_url;
    const repoName = context.payload.repository.name;

    console.log(issueUrl);
    console.log(issueHtmlUrl);

    runAcr(issueId, repoName, repoUrl, issueText);
  });
};
