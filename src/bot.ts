import { Probot } from "probot";
import { AgentType, recordInvocation } from "./analytics.js";
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
  AnthropicModels,
  defaultModel,
  OpenaiModels,
  AllModels,
} from "./models.js";
import { openPR } from "./pr.js";

enum InstructType {
  PR = "pr",
  Patch = "patch",
}

type Mode = {
  agentType: AgentType;
  instructType: InstructType;
  modelName?: string; // undefined if in PR mode
};

/**
 * Wrapper to decide which ACR mode to dispatch.
 */
async function runAcr(
  mode: Mode,
  issueId: number,
  issueUrl: string,
  issueText: string,
  repoName: string,
  repoUrl: string
): Promise<AcrResult> {

  if (mode.modelName == "") {
    let result = dummyAcrResult;
    result.result =
      "No API key is set up. Please set up either OpenAI or Anthropic API key.";
    return result;
  }

  if (mode.modelName! in OpenaiModels && !process.env.OPENAI_API_KEY) {
    let result = dummyAcrResult;
    result.result =
      "OpenAI API key is missing. Please set it up in the repository.";
    return result;
  }

  if (mode.modelName! in AnthropicModels && !process.env.ANTHROPIC_API_KEY) {
    let result = dummyAcrResult;
    result.result =
      "Anthropic API key is missing. Please set it up in the repository.";
    return result;
  }

  const selectedModel = AllModels[mode.modelName!];

  if (mode.agentType == AgentType.GithubApp) {
    // run ACR in docker mode
    const result = await runAcrDocker(
      issueId,
      issueUrl,
      repoName,
      repoUrl,
      selectedModel
    );
    return result;
  } else {
    // run ACR on on the same machine as this script
    let result;
    try {
      result = await runAcrLocal(issueId, issueText, repoName, selectedModel);
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
  repoName: string,
  repoUrl: string
) {
  // record time of request
  const startTime = new Date();

  const acrResult = await runAcr(
    mode,
    issueId,
    issueUrl,
    issueFullText,
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

  const issueFullText = issueTitle + "\n" + issueText;

  const issueId = context.payload.issue.number;
  const issueUrl = context.payload.issue.html_url;

  const repoUrl = context.payload.repository.clone_url;
  const repoName = context.payload.repository.full_name;

  const ownerName = context.payload.repository.owner.login;

  if (mode.instructType == InstructType.Patch) {
    await resolveIssue(
      context,
      mode,
      issueId,
      issueUrl,
      issueTitle,
      issueFullText,
      repoName,
      repoUrl
    );
  }

  if (mode.instructType == InstructType.PR) {
    await openPR(context, issueId, issueTitle, repoName, ownerName);
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

    const comments = await context.octokit.issues.listComments();

    comments.data.forEach(x => {
      console.log(x.user);
      console.log(x.body_text);
      if(!x.user ||  x.user.login == "acr-bot") {
        return;
      }
      if(!x.body_text || x.body_text?.includes(botMention)) {
        return;
      }
      console.log(x.body_text);
    })

    console.log(`mode.agentType: ${mode.agentType}`);
    console.log(`mode.instructType: ${mode.instructType}`);
    console.log(`mode.modelName: ${mode.modelName}`);

    await dispatchWithMode(mode, context);
  });
};
