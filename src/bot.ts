import { Probot } from "probot";
import { hasAcrImage, runAcrDocker, runAcrLocal } from "./run_acr.js";

const botMention = "@acr-bot";

/**
 * Wrapper to decide which ACR mode to dispatch.
 */
async function runAcr(
  issueId: number,
  issueUrl: string,
  issueText: string,
  repoName: string,
  repoUrl: string
): Promise<string> {
  if (await hasAcrImage()) {
    // run ACR in docker mode
    const result = await runAcrDocker(
      issueId,
      issueUrl,
      repoName,
      repoUrl
    );
    return result;
  } else {
    // run ACR on on the same machine as this script
    let result;
    try {
      result = await runAcrLocal(issueId, issueText, repoName);
    } catch (error) {
      console.log(error);
      result = `Error occurred when running ACR: ${error}`;
    }
    return result;
  }
}

export const robot = (app: Probot) => {
  app.on("issues.opened", async (context) => {
    const issueText = context.payload.issue.body;
    app.log.info(issueText);

    if (issueText == null) {
      return;
    }

    if (!issueText.includes(botMention)) {
      return;
    }

    const issueId = context.payload.issue.number;
    const issueUrl = context.payload.issue.html_url;

    const repoUrl = context.payload.repository.clone_url;
    const repoName = context.payload.repository.full_name;

    const acrResult = await runAcr(
      issueId,
      issueUrl,
      issueText,
      repoName,
      repoUrl
    );

    const resultComment = context.issue({
      body: acrResult,
    });
    await context.octokit.issues.createComment(resultComment);
  });

  app.on("issue_comment.created", async (context) => {
    const commentText = context.payload.comment.body;
    app.log.info(commentText);

    if (commentText == null) {
      return;
    }

    if (!commentText.includes(botMention)) {
      return;
    }

    const issueText = context.payload.issue.body;

    if (issueText == null) {
      console.log("Issue text is null");
      return;
    }

    const issueId = context.payload.issue.number;
    const issueUrl = context.payload.issue.html_url;

    const repoUrl = context.payload.repository.clone_url;
    const repoName = context.payload.repository.full_name;

    const acrResult = await runAcr(
      issueId,
      issueUrl,
      issueText,
      repoName,
      repoUrl
    );

    const resultComment = context.issue({
      body: acrResult,
    });
    await context.octokit.issues.createComment(resultComment);
  });
};
