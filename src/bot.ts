import { Probot } from "probot";
import { recordInvocation } from "./analytics.js";
import {
  AcrResult,
  dummyAcrResult,
  hasAcrImage,
  runAcrDocker,
  runAcrLocal,
} from "./run_acr.js";

import {
  botMention,
  prInstruction,
  successMessagePrefix,
} from "./constants.js";

import {
  AllModels,
  AnthropicModels,
  defaultModel,
  OpenaiModels,
} from "./models.js";
import { openPR } from "./pr.js";

import { AgentType, InstructType, Mode } from "./types.js";

async function queryRepoVariable(
  context: any,
  repoOwner: string,
  repoShortName: string,
  varName: string
): Promise<string | null> {
  const { data } = (await context.octokit.request(
    "GET /repos/{owner}/{repo}/actions/variables/{name}",
    {
      owner: repoOwner,
      repo: repoShortName,
      name: varName,
    }
  )) as any;

  if (!data?.value) {
    return null;
  }
  return data.value;
}

async function queryOpenaiKey(
  context: any,
  repoOwner: string,
  repoShortName: string
): Promise<string | null> {
  return await queryRepoVariable(
    context,
    repoOwner,
    repoShortName,
    "OPENAI_API_KEY"
  );
}

async function queryAnthropicKey(
  context: any,
  repoOwner: string,
  repoShortName: string
): Promise<string | null> {
  console.log("querying anthropic key");
  return await queryRepoVariable(
    context,
    repoOwner,
    repoShortName,
    "ANTHROPIC_API_KEY"
  );
}

/**
 * Wrapper to decide which ACR mode to dispatch.
 */
async function runAcr(
  context: any,
  mode: Mode,
  issueId: number,
  issueUrl: string,
  issueText: string,
  repoOwner: string,
  repoName: string,
  repoUrl: string
): Promise<AcrResult> {
  // If mode is App, we need to send another request to retrieve the keys
  const repoShortName = repoName.split("/")[1];

  if (mode.modelName == "") {
    let result = dummyAcrResult;
    result.result =
      "No API key is set up. Please set up either OpenAI or Anthropic API key.";
    return result;
  }

  let openaiKey = "";
  let anthropicKey = "";

  if (mode.modelName! in OpenaiModels) {
    // user has requested for an OpenAI model
    if (mode.agentType == AgentType.GithubApp) {
      openaiKey =
        (await queryOpenaiKey(context, repoOwner, repoShortName)) ?? "";
    } else {
      // AgentType.GithubAction
      openaiKey = process.env.OPENAI_API_KEY ?? "";
    }

    if (openaiKey == "") {
      let result = dummyAcrResult;
      result.result =
        "OpenAI API key is missing. Please set it up in the repository.";
      return result;
    }
  }

  if (mode.modelName! in AnthropicModels) {
    // user has requested for an Anthropic model
    if (mode.agentType == AgentType.GithubApp) {
      anthropicKey =
        (await queryAnthropicKey(context, repoOwner, repoShortName)) ?? "";
    } else {
      // AgentType.GithubAction
      anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
    }

    if (anthropicKey == "") {
      let result = dummyAcrResult;
      result.result =
        "Anthropic API key is missing. Please set it up in the repository.";
      return result;
    }
  }


  const selectedModel = AllModels[mode.modelName!];

  if (mode.agentType == AgentType.GithubApp) {
    // run ACR in docker mode
    const result = await runAcrDocker(
      issueId,
      issueUrl,
      repoName,
      repoUrl,
      selectedModel,
      openaiKey,
      anthropicKey
    );
    return result;
  } else {
    // run ACR on on the same machine as this script
    let result;
    try {
      result = await runAcrLocal(
        issueId,
        issueText,
        repoName,
        selectedModel,
        openaiKey,
        anthropicKey
      );
    } catch (error) {
      console.log(error);
      result = dummyAcrResult;
    }
    return result;
  }
}

async function resolveIssue(
  context: any,
  mode: Mode,
  issueId: number,
  issueUrl: string,
  issueTitle: string,
  issueFullText: string,
  repoOwner: string,
  repoName: string,
  repoUrl: string
) {
  // record time of request
  const startTime = new Date();

  const acrResult = await runAcr(
    context,
    mode,
    issueId,
    issueUrl,
    issueFullText,
    repoOwner,
    repoName,
    repoUrl
  );

  let resultCommentBody = "";

  if (acrResult.run_ok) {
    resultCommentBody = successMessagePrefix + "\n" + acrResult.result;

    if (acrResult.cost) {
      resultCommentBody +=
        "\n\n---\n\n" + "This run costs " + acrResult.cost.toFixed(2) + " USD.";
    }
  } else {
    resultCommentBody = acrResult.result;
  }

  const resultComment = context.issue({
    body: resultCommentBody,
  });

  // webhook payload has: repository, sender, issue

  const endTime = new Date();

  const elapsedMs = endTime.getTime() - startTime.getTime();
  const elapsedS = elapsedMs / 1000;

  await recordInvocation(
    mode.agentType,
    context.payload.sender.login,
    context.payload.sender.html_url,
    context.payload.sender.type,
    context.payload.sender.site_admin,
    context.payload.repository.full_name,
    context.payload.repository.html_url,

    issueTitle,
    issueUrl,

    startTime.getTime() / 1000, // convert to seconds
    endTime.getTime() / 1000, // convert to seconds
    elapsedS,

    acrResult.cost ?? 0,
    acrResult.run_ok,
    acrResult.result
  );

  //Octokit read metadata and get OPENAI_API_KEY

  await context.octokit.issues.createComment(resultComment);
}

/**
 * Process user input and figure out which mode/model to run.
 */
async function setMode(inputText: string): Promise<Mode | null> {
  const hasDockerOnMachine = await hasAcrImage();
  const agentType = hasDockerOnMachine
    ? AgentType.GithubApp
    : AgentType.GithubAction;

  const botPattern = new RegExp(`^${botMention}\\s+([\\w-]+)$`);

  const match = inputText.trim().match(botPattern);

  if (match) {
    const instruction = match[1];
    if (instruction == prInstruction) {
      return { agentType: agentType, instructType: InstructType.PR };
    } else if (instruction in AllModels) {
      return {
        agentType: agentType,
        instructType: InstructType.Patch,
        modelName: instruction,
      };
    } else {
      // has instruction, but is not a valid instruction
      return null;
    }
  } else if (inputText.includes(botMention)) {
    // does not contain model name => run with default model
    return {
      agentType: agentType,
      instructType: InstructType.Patch,
      modelName: defaultModel,
    };
  }

  // no instruction and no bot mention
  return null;
}

function helpMessage(): string {
  const msg =
    "The instruction should be in the format of `@acr-bot <...>`.\n" +
    "If you would like to generate a patch, please provide a model name.\n" +
    "For example, `@acr-bot gpt-4o-2024-08-06`.\n" +
    "You can also just write @acr-bot, and I will use a default OpenAI model (gpt-4o-2024-08-06).\n" +
    "If you would like to open a PR, please provide the instruction `open-pr`.\n" +
    "For example, `@acr-bot open-pr`.";
  return msg;
}

async function dispatchWithMode(mode: Mode, context: any) {
  const issueTitle = context.payload.issue.title;
  const issueText = context.payload.issue.body;
  const issueId = context.payload.issue.number;
  const issueUrl = context.payload.issue.html_url;
  const repoUrl = context.payload.repository.clone_url;
  const repoName = context.payload.repository.full_name;
  const repoOwner = context.payload.repository.owner.login;

  let issueFullText = issueTitle + "\n" + issueText;
  const repoShortName = repoName.split("/")[1];

  const { data: comments } = await context.octokit.rest.issues.listComments({
    owner: repoOwner,
    repo: repoShortName,
    issue_number: issueId,
    per_page: 100
  });
  comments.forEach(comment => {
    if (!comment.user
      || comment.user.login == "acr-bot"
      || comment.user.type == "Bot"
      || !comment.body) {
      return;
    }
    issueFullText += `\n User: ${comment.user.login} \n Comment: ${comment.body}`;
  });

  if (mode.instructType == InstructType.Patch) {
    await resolveIssue(
      context,
      mode,
      issueId,
      issueUrl,
      issueTitle,
      issueFullText,
      repoOwner,
      repoName,
      repoUrl
    );
  }

  if (mode.instructType == InstructType.PR) {
    await openPR(context, mode, issueId, issueTitle, repoName, repoOwner);
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

    const mode = await setMode(issueText);

    if (mode == null) {
      console.log("Invalid instruction");
      const helpMsg = helpMessage();
      await context.octokit.issues.createComment(
        context.issue({ body: helpMsg })
      );
      return;
    }

    await dispatchWithMode(mode, context);
  });

  app.on("issue_comment.created", async (context) => {
    const commentText = context.payload.comment.body;
    app.log.info(commentText);

    // console.log(context);

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

    const mode = await setMode(commentText);

    if (mode == null) {
      console.log("Invalid instruction");
      const helpMsg = helpMessage();
      await context.octokit.issues.createComment(
        context.issue({ body: helpMsg })
      );
      return;
    }

    console.log(`mode.agentType: ${mode.agentType}`);
    console.log(`mode.instructType: ${mode.instructType}`);
    console.log(`mode.modelName: ${mode.modelName}`);

    await dispatchWithMode(mode, context);
  });
};
