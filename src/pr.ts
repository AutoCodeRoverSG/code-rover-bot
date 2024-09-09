import { simpleGit, SimpleGitOptions } from "simple-git";
import { botMention, successMessagePrefix } from "./constants.js";
import { AgentType, Mode } from "./types.js";

import fs from "fs";

/**
 * SPECIFIC for GitHub App: we need a token to push changes to repo.
 */
async function getInstallationAccessToken(context: any) {
  const { token } = await context.octokit.auth({
    type: "installation",
  });

  return token;
}

export async function openPR(
  context: any,
  mode: Mode,
  issueId: number,
  issueTitle: string,
  repoName: string,
  repoOwner: string
) {
  // retrieve all comments from the issue
  const repoShortName = repoName.split("/")[1];

  const { data: comments } = await context.octokit.rest.issues.listComments({
    owner: repoOwner,
    repo: repoShortName,
    issue_number: issueId,
    per_page: 100,
  });

  // traverse the issue conversation history to find the latest patch

  let lastCommentWithPatch = "";

  comments.forEach((comment: any) => {
    // console.log(comment.user.type);
    // console.log(comment.body);

    if (comment.user.type == "Bot") {
      // bot created comment - let's see whether a patch is contained.
      if (comment.body.startsWith(successMessagePrefix)) {
        // this comment contains a patch!
        lastCommentWithPatch = comment.body;
      }
    }
  });

  if (lastCommentWithPatch == "") {
    // no patch found
    await context.octokit.issues.createComment(
      context.issue({
        body:
          "acr-bot has not generated a patch for this issue yet. " +
          `Before opening a PR, please generate a patch with ${botMention} <model-name>.`,
      })
    );

    return;
  }

  // parse the patch from the comment
  // extract the content between ```diff and ```
  const patchStart = "```diff";

  const patchEnd = "```";

  const patchStartIndex = lastCommentWithPatch.indexOf(patchStart);
  const patchEndIndex = lastCommentWithPatch.indexOf(
    patchEnd,
    patchStartIndex + patchStart.length
  );

  if (patchStartIndex == -1 || patchEndIndex == -1) {
    // patch format is not correct
    await context.octokit.issues.createComment(
      context.issue({
        body:
          "The patch format is not correct. " +
          `Please generate a new patch with ${botMention} <model-name>.`,
      })
    );

    return;
  }

  let patchContent = lastCommentWithPatch.substring(
    patchStartIndex + patchStart.length,
    patchEndIndex
  );

  // only trim leading spaces and new lines
  patchContent = patchContent.replace(/^\s+/g, "");

  let targetRepoDir = "";

  // setup the target repo, depending on whether we are in App or Action mode
  if (mode.agentType == AgentType.GithubApp) {
    // setup a local copy of the source code directory
    const sourceRepoUrl = context.payload.repository.clone_url;
    targetRepoDir = `/tmp/${repoOwner}_${repoShortName}_${issueId}`;
    if (fs.existsSync(targetRepoDir)) {
      fs.rmdirSync(targetRepoDir, { recursive: true });
    }
    await simpleGit().clone(sourceRepoUrl, targetRepoDir);
  } else {
    // GithubAction
    targetRepoDir = process.env.TARGET_REPO_PATH!;
  }

  // cd to the target repo
  const originalWorkingDir = process.cwd();

  process.chdir(targetRepoDir);

  const git = simpleGit(targetRepoDir);

  await git.addConfig("user.email", "acr@autocoderover.dev");
  await git.addConfig("user.name", "acr-bot");

  const currentBranch = (await git.status()).current;

  const timeStr = getFormattedTime();

  const newBranch = `AutoCodeRover-#${issueId}-${timeStr}`;

  await git.checkoutLocalBranch(newBranch);

  console.log(patchContent);

  // write patchContent to a local temp file
  const patchFilePath = `${targetRepoDir}/acr_patch_${issueId}.diff`;
  fs.writeFileSync(patchFilePath, patchContent);

  await git.applyPatch(patchFilePath);

  fs.unlinkSync(patchFilePath);

  await git.add(".");
  await git.commit(`Fix #${issueId}`);

  // push changes to remote
  if (mode.agentType == AgentType.GithubApp) {
    const token = await getInstallationAccessToken(context);
    const pushUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoShortName}.git`;
    await git.addRemote("pushRemote", pushUrl);
    await git.push("pushRemote", newBranch);
  } else {
    await git.push("origin", newBranch);
  }

  // create a PR
  const prTitle = `Fix #${issueId} (AutoCodeRover)`;

  const prBody = `This PR contains a patch for issue #${issueId}. Patch was created by AutoCodeRover.`;

  await context.octokit.pulls.create({
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    title: prTitle,
    body: prBody,
    head: newBranch,
    base: currentBranch,
  });

  console.log("PR created successfully");

  // clean up
  process.chdir(originalWorkingDir);

  if (mode.agentType == AgentType.GithubApp) {
    fs.rmdirSync(targetRepoDir, { recursive: true });
  }
}

function getFormattedTime() {
  // get time in the format of YYYYMMDD_HH_mm_ss
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const day = String(now.getDate()).padStart(2, "0");

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}_${hours}_${minutes}_${seconds}`;
}
