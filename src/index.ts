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

    const issueId = context.payload.issue.number;
    const issueUrl = context.payload.issue.html_url;

    const repoUrl = context.payload.repository.clone_url;
    const repoName = context.payload.repository.full_name;

    const result = await runAcr(issueId, issueUrl, issueText, repoName, repoUrl);

    const resultComment = context.issue({
      body: result,
    });
    await context.octokit.issues.createComment(resultComment);
  });

  app.on("issue_comment.created", async (context) => {
    // console.log(context.payload);

    // console.log("haha");

    const commentText = context.payload.comment.body;
    app.log.info(commentText);

    if (commentText == null) {
      return;
    }

    if (!commentText.includes(botMention)) {
      return;
    }

    // const issueComment = context.issue({
    //   body: "I'm invoked! Going to create a solution for this issue.",
    // });
    // await context.octokit.issues.createComment(issueComment);

    const issueText = context.payload.issue.body;

    if (issueText == null) {
      console.log("Issue text is null");
      return;
    }

    console.log(issueText);

    const issueId = context.payload.issue.number;
    const issueUrl = context.payload.issue.html_url;

    const repoUrl = context.payload.repository.clone_url;
    const repoName = context.payload.repository.full_name;

    const result = await runAcr(issueId, issueUrl, issueText, repoName, repoUrl);

    const resultComment = context.issue({
      body: result,
    });
    await context.octokit.issues.createComment(resultComment);
  });
};
