import Docker from "dockerode";
import fs from "fs";
import { getRootDir } from "./utils.js";
import { globSync } from "glob";
import path from "path";

const dockerImageName = "autocoderover/acr:v1";

const OPENAI_KEY = "OPENAI_API_KEY";

let docker = new Docker();


/**
 * Run ACR as a GitHub action.
 * This requires running ACR locally (not in its own container),
 * and uses different repository logic.
 * Assumptions:
 * - Using python and pip without conda.
 * - pip dependencies have already been installed.
 */
export async function runAcrGitHubAction(
  issueId: number,
  issueUrl: string,
  issueText: string,
  repoName: string,
  repoUrl: string
) {
  // console.log("Going to run ACR on the following issue text:");
  // console.log(issueText);
  // console.log(repoUrl)
  const modifiedRepoName = repoName.replace("/", "__");

  const taskId = `${modifiedRepoName}-${issueId}`;

  let rootDir = getRootDir();
  const localAcrOutputDir = `${rootDir}/acr_output/${taskId}`;
  if (!fs.existsSync(localAcrOutputDir)) {
    fs.mkdirSync(localAcrOutputDir, { recursive: true });
  }

  const acrCodeDir = `${rootDir}/acr`;

  const passedOpenaiKey = process.env.OPENAI_API_KEY;

  const targetRepoPath = process.env.TARGET_REPO_PATH;

  return `Running ACR GitHub Action for ${taskId}. ACR code dir is ${acrCodeDir}, target repo path is ${targetRepoPath}.`;
}

export async function runAcrDocker(
  issueId: number,
  issueUrl: string,
  issueText: string,
  repoName: string,
  repoUrl: string
) {
  // console.log("Going to run ACR on the following issue text:");
  // console.log(issueText);
  // console.log(repoUrl);

  const modifiedRepoName = repoName.replace("/", "__");

  const taskId = `${modifiedRepoName}-${issueId}`;

  let rootDir = getRootDir();
  const localAcrOutputDir = `${rootDir}/acr_output/${taskId}`;
  if (!fs.existsSync(localAcrOutputDir)) {
    fs.mkdirSync(localAcrOutputDir, { recursive: true });
  }
  const dockerOutputDir = `/tmp/acr_output`;

  const containerName = `acr-${taskId}`;

  const cmd = [
    "conda",
    "run",
    "-n",
    "auto-code-rover",
    "python",
    "app/main.py",
    "github-issue",
    "--output-dir",
    dockerOutputDir,
    "--setup-dir",
    "setup",
    "--model",
    "gpt-4o-2024-05-13",
    "--task-id",
    taskId,
    "--clone-link",
    repoUrl,
    "--issue-link",
    issueUrl,
    "--no-print",
    // omit commit hash -> default branch HEAD will be used
  ];

  const data = await docker.run(dockerImageName, cmd, process.stdout, {
    name: containerName,
    Volumes: {
      dockerOutputDir: {},
    },
    HostConfig: {
      Binds: [`${localAcrOutputDir}:${dockerOutputDir}`],
    },
    Env: ["PYTHONPATH=.", `OPENAI_KEY=${OPENAI_KEY}`],
  });

  const output = data[0];
  console.log(output);

  const container = data[1];
  container.remove();

  const failureMessage = "I could not generate a patch for this issue.";

  // read result
  const realOutputDirs = globSync(`${localAcrOutputDir}/*`).filter((x) =>
    path.basename(x).includes(taskId)
  );
  if (realOutputDirs.length === 0) {
    console.error(`No output found in ${localAcrOutputDir}`);
    return failureMessage;
  }

  // sort them and get last one, since they are sorted by timestamp
  const realOutputDir = realOutputDirs.sort().reverse()[0];
  const patch_path = path.join(realOutputDir, "final_patch.diff");

  if (!fs.existsSync(patch_path)) {
    console.error(`No patch found in ${realOutputDir}`);
    return failureMessage;
  }

  let patch = fs.readFileSync(patch_path, "utf-8");
  // console.log(patch);
  if (!patch.startsWith("```")) {
    patch = "```diff\n" + patch + "\n```";
  }

  return patch;
}

// PYTHONPATH=. python app/main.py github-issue --output-dir output --setup-dir setup --model gpt-4o-2024-05-13 --model-temperature 0.2 --task-id langchain-20453 --clone-link https://github.com/langchain-ai/langchain.git --commit-hash cb6e5e5 --issue-link https://github.com/langchain-ai/langchain/issues/20453
