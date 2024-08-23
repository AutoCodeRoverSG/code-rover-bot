import { spawn } from "child_process";
import Docker from "dockerode";
import fs from "fs";
import { globSync } from "glob";
import path from "path";
import { getRootDir } from "./utils.js";

const dockerImageName = "autocoderover/acr:v1";

const OPENAI_KEY = "OPENAI_API_KEY";

let docker = new Docker();

export async function hasAcrImage(): Promise<boolean> {
  let images = await docker.listImages({
    filters: { reference: [dockerImageName] },
  });
  return images.length > 0;
}

/**
 * Run a command in the local environment and stream its output.
 *
 */
async function runCommandStreaming(
  cmd: string,
  args: string[],
  cwd: string,
  additionalEnv: any
) {
  try {
    await new Promise<void>((resolve, reject) => {
      const newProcess = spawn(cmd, args, {
        cwd: cwd,
        env: {
          ...process.env,
          ...additionalEnv,
        },
        shell: true,
      });

      newProcess.stdout.on("data", (data) => {
        console.log(data.toString());
      });

      newProcess.stderr.on("data", (data) => {
        console.error(data.toString());
      });

      newProcess.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });

      newProcess.on("error", (err) => {
        reject(err);
      });
    });

    console.log(`Command ${cmd} ${args.join(" ")} completed successfully`);
  } catch (error: any) {
    // TypeScript requires 'any' to access custom properties
    console.error(`Command failed: ${error.message}`);
  }
}

/**
 * Run ACR as a GitHub action.
 * This requires running ACR locally (not in its own container),
 * and uses different repository logic.
 * Assumptions:
 * - Using python and pip without conda.
 * - pip dependencies have already been installed.
 */
export async function runAcrLocal(
  issueId: number,
  issueText: string,
  repoName: string
) {
  // TODO: The issue text does not contain the issue title??

  console.log("Going to run ACR on the following issue text:");
  console.log(issueText);

  const modifiedRepoName = repoName.replace("/", "__");

  const taskId = `${modifiedRepoName}-${issueId}`;

  let rootDir = getRootDir();
  const localAcrOutputDir = `${rootDir}/acr_output/${taskId}`;
  if (!fs.existsSync(localAcrOutputDir)) {
    fs.mkdirSync(localAcrOutputDir, { recursive: true });
  }

  // NOTE: the environment variables must be set in the GitHub action
  const acrCodeDir = process.env.ACR_PATH!;
  const passedOpenaiKey = process.env.OPENAI_API_KEY!;
  const targetRepoPath = process.env.TARGET_REPO_PATH!;

  // write the issue text to a file
  const issueTextFile = `${localAcrOutputDir}/issue.txt`;
  fs.writeFileSync(issueTextFile, issueText);

  console.log(`Wrote issue text to ${issueTextFile}`);

  // const cmd =
  //   `python app/main.py local-issue ` +
  //   `--output-dir ${localAcrOutputDir} ` +
  //   `--model gpt-4o-2024-05-13 ` +
  //   `--task-id ${taskId} ` +
  //   `--local-repo ${targetRepoPath} ` +
  //   `--issue-file ${issueTextFile}`; // --no-print?
  const cmd_args = [
    "python",
    "app/main.py",
    "local-issue",
    "--output-dir",
    localAcrOutputDir,
    "--model",
    "gpt-4o-2024-05-13", // TODO: make this a parameter
    "--task-id",
    taskId,
    "--local-repo",
    targetRepoPath,
    "--issue-file",
    issueTextFile,
  ];

  console.log(
    `Running ACR GitHub Action with command: ${cmd_args}, in directory ${acrCodeDir}`
  );

  runCommandStreaming("python", cmd_args, acrCodeDir, {
    PYTHONPATH: acrCodeDir,
    OPENAI_KEY: passedOpenaiKey,
  });

  // TODO: improve this message to be more user-friendly.
  // We can potentially return the fix locations here.
  const failureIssueComment = "I could not generate a patch for this issue.";

  // read result
  const outDirsBeforeFiltering = globSync(`${localAcrOutputDir}/*`);
  console.log("Printing out dirs before filtering:");
  for (const dir of outDirsBeforeFiltering) {
    console.log(dir);
  }

  const realOutputDirs = globSync(`${localAcrOutputDir}/*`).filter((x) =>
    path.basename(x).includes(taskId)
  );
  if (realOutputDirs.length === 0) {
    console.error(`No output found in ${localAcrOutputDir}`);
    return failureIssueComment;
  }

  // sort them and get last one, since they are sorted by timestamp
  const realOutputDir = realOutputDirs.sort().reverse()[0];
  const patch_path = path.join(realOutputDir, "final_patch.diff");

  if (!fs.existsSync(patch_path)) {
    console.error(`No patch found in ${realOutputDir}`);
    return failureIssueComment;
  }

  let patch = fs.readFileSync(patch_path, "utf-8");
  // console.log(patch);
  if (!patch.startsWith("```")) {
    patch = "```diff\n" + patch + "\n```";
  }

  return patch;
}

/**
 * Run ACR in a docker container.
 * This requires the ACR image to be available on the machine.
 */
export async function runAcrDocker(
  issueId: number,
  issueUrl: string,
  repoName: string,
  repoUrl: string
) {
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
