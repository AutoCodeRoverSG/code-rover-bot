import { execSync } from "child_process";
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

  const acrCodeDir = `${rootDir}/acr`;

  const passedOpenaiKey = process.env.OPENAI_API_KEY;

  const targetRepoPath = process.env.TARGET_REPO_PATH;

  // write the issue text to a file
  const issueTextFile = `${localAcrOutputDir}/issue.txt`;
  fs.writeFileSync(issueTextFile, issueText);

  console.log(`Wrote issue text to ${issueTextFile}`);

  const cmd =
    `python app/main.py local-issue ` +
    `--output-dir ${localAcrOutputDir} ` +
    `--model gpt-4o-2024-05-13 ` +
    `--task-id ${taskId} ` +
    `--local-repo ${targetRepoPath} ` +
    `--issue-file ${issueTextFile}`; // --no-print?

  console.log(
    `Running ACR GitHub Action with command: ${cmd}, in directory ${acrCodeDir}`
  );

  try {
    // TODO: stream the output of this execution
    const stdout = execSync(cmd, {
      cwd: acrCodeDir,
      env: {
        ...process.env,
        PYTHONPATH: acrCodeDir,
        OPENAI_KEY: passedOpenaiKey,
      },
      encoding: "utf-8",
    });
    console.log(`Output (stdout): ${stdout}`);
  } catch (error: any) {
    // TypeScript requires 'any' to access custom properties
    console.error(`Error: ${error.message}`);

    if (error.stdout) {
      console.error(`Captured stdout: ${error.stdout}`);
    }

    if (error.stderr) {
      console.error(`Captured stderr: ${error.stderr}`);
    }

    console.error(`Error occurred running ACR GitHub Action: ${error.message}`);
  }

  // TODO: improve this message to be more user-friendly.
  // We can potentially return the fix locations here.
  const failureMessage = "I could not generate a patch for this issue.";

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
