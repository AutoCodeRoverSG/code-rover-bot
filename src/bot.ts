import { Probot } from "probot";
import { recordInvocation, AgentType } from "./analytics.js";
import {
  hasAcrImage,
  runAcrDocker,
  runAcrLocal,
  AcrResult,
  dummyAcrResult,
} from "./run_acr.js";

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
): Promise<AcrResult> {
  if (await hasAcrImage()) {
    // run ACR in docker mode
    const result = await runAcrDocker(issueId, issueUrl, repoName, repoUrl);
    return result;
  } else {
    // run ACR on on the same machine as this script
    let result;
    try {
      result = await runAcrLocal(issueId, issueText, repoName);
    } catch (error) {
      console.log(error);
      result = dummyAcrResult;
    }
    return result;
  }
}

async function processIssue(
  context: any,
  issueId: number,
  issueUrl: string,
  issueText: string,
  repoName: string,
  repoUrl: string
) {
  // record time of request
  const startTime = new Date();

  const acrResult = await runAcr(
    issueId,
    issueUrl,
    issueText,
    repoName,
    repoUrl
  );

  const resultComment = context.issue({
    body: acrResult.result,
  });

  // webhook payload has: repository, sender, issue

  const endTime = new Date();

  const elapsed_ms = endTime.getTime() - startTime.getTime();
  const elapsed_s = elapsed_ms / 1000;

  // TODO: configure role from here
  recordInvocation(
    AgentType.GithubApp,
    context.payload.sender.login,
    context.payload.sender.html_url,
    context.payload.sender.type,
    context.payload.sender.site_admin,
    context.payload.repository.full_name,
    context.payload.repository.html_url,

    issueText,
    issueUrl,

    startTime.toISOString(),
    endTime.toISOString(),
    elapsed_s.toString(),

    String(acrResult.cost),
    acrResult.run_ok,
    acrResult.result
  );

  await context.octokit.issues.createComment(resultComment);
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

    processIssue(context, issueId, issueUrl, issueText, repoName, repoUrl);
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

    processIssue(context, issueId, issueUrl, issueText, repoName, repoUrl);
  });
};
