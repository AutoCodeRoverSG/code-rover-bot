import { spawn } from "child_process";
import Docker from "dockerode";
import fs from "fs";
import { globSync } from "glob";
import path from "path";
import { getRootDir } from "./utils.js";

export type AcrResult = {
  run_ok: boolean;
  result: string;
  additional_info: string | null;
  model: string;
  // these stats may not exist, depends on whether
  // the run was able to finish
  cost: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
};

export const dummyAcrResult: AcrResult = {
  run_ok: false,
  result: "I could not not generate a patch for this issue.",
  additional_info: null,
  model: "default-model",
  cost: null,
  input_tokens: null,
  output_tokens: null,
};

const dockerImageName = "autocoderover/acr:v1.0.0";

let docker = new Docker();

export async function hasAcrImage(): Promise<boolean> {
  let images = await docker.listImages({
    filters: { reference: [dockerImageName] },
  });
  return images.length > 0;
}

function readResultMeta(
  resultDir: string
): [number | null, number | null, number | null] {
  const metaPath = path.join(resultDir, "cost.json");
  if (!fs.existsSync(metaPath)) {
    return [null, null, null];
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

  return [
    meta["total_cost"],
    meta["total_input_tokens"],
    meta["total_output_tokens"],
  ];
}

function readAcrOutput(
  acrOutputDir: string,
  taskId: string,
  modelName: string
): AcrResult {
  // TODO: improve this message to be more user-friendly.
  // We can potentially return the fix locations here.
  const failureIssueComment = "I could not generate a patch for this issue.";

  const realOutputDirs = globSync(`${acrOutputDir}/*`).filter((x) =>
    path.basename(x).includes(taskId)
  );
  if (realOutputDirs.length === 0) {
    const errorMsg = `SetupError: No output found in ${acrOutputDir}`;
    console.error(errorMsg);
    return {
      run_ok: false,
      result: failureIssueComment,
      additional_info: errorMsg,
      model: modelName,
      cost: null,
      input_tokens: null,
      output_tokens: null,
    };
  }

  // sort them and get last one, since they are sorted by timestamp
  const realOutputDir = realOutputDirs.sort().reverse()[0];
  const patch_path = path.join(realOutputDir, "final_patch.diff");

  // read cost
  const [cost, inputTokens, outputTokens] = readResultMeta(realOutputDir);

  if (fs.existsSync(patch_path)) {
    let patch = fs.readFileSync(patch_path, "utf-8");
    // console.log(patch);
    if (!patch.startsWith("```")) {
      patch = "```diff\n" + patch + "\n```";
    }

    return {
      run_ok: true,
      result: patch,
      additional_info: null,
      model: modelName,
      cost: cost,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };
  }

  const fix_locations = path.join(realOutputDir, "fix_locations.json");
  if (fs.existsSync(fix_locations)) {
    const fixLocations: string[] = JSON.parse(
      fs.readFileSync(fix_locations, "utf-8")
    );
    const fixLocationsList = fixLocations
      .map((x) => {
        const fields = JSON.parse(x);
        return `* File: ${fields["file"]}, class: ${fields["class"]}, method: ${fields["method"]}`;
      })
      .join("\n");
    return {
      run_ok: true,
      result:
        "I could not generate a patch for this issue. Here are locations I have explored: " +
        fixLocationsList,
      additional_info: null,
      model: modelName,
      cost: cost,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };
  }

  const errorMsg = `PatchGenError: No patch and error locations found in ${realOutputDir}`;
  console.error(errorMsg);
  return {
    run_ok: false,
    result: failureIssueComment,
    additional_info: errorMsg,
    model: modelName,
    cost: cost,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
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
    // process.env entries which clash with additionalEnv should be removed
    for (const key in additionalEnv) {
      if (process.env[key] !== undefined) {
        delete process.env[key];
      }
    }

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
  repoName: string,
  selectedModel: string,
  openaiKey: string,
  anthropicKey: string
): Promise<AcrResult> {
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
  const targetRepoPath = process.env.TARGET_REPO_PATH!;

  // write the issue text to a file
  const issueTextFile = `${localAcrOutputDir}/issue.txt`;
  fs.writeFileSync(issueTextFile, issueText);

  console.log(`Wrote issue text to ${issueTextFile}`);

  const cmd_args = [
    "app/main.py",
    "local-issue",
    "--output-dir",
    localAcrOutputDir,
    "--model",
    selectedModel,
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

  await runCommandStreaming("python", cmd_args, acrCodeDir, {
    PYTHONPATH: acrCodeDir,
    OPENAI_KEY: openaiKey,
    ANTHROPIC_API_KEY: anthropicKey,
  });

  return readAcrOutput(localAcrOutputDir, taskId, selectedModel);
}

/**
 * Run ACR in a docker container.
 * This requires the ACR image to be available on the machine.
 */
export async function runAcrDocker(
  issueId: number,
  issueUrl: string,
  repoName: string,
  repoUrl: string,
  selectedModel: string,
  openaiKey: string,
  anthropicKey: string
): Promise<AcrResult> {
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
    selectedModel,
    "--task-id",
    taskId,
    "--clone-link",
    repoUrl,
    "--issue-link",
    issueUrl,
    // "--no-print",
    // omit commit hash -> default branch HEAD will be used
  ];

  console.log(`Start running ACR in Docker container with command: ${cmd}`);

  const data = await docker.run(dockerImageName, cmd, process.stdout, {
    name: containerName,
    Volumes: {
      dockerOutputDir: {},
    },
    HostConfig: {
      Binds: [`${localAcrOutputDir}:${dockerOutputDir}`],
    },
    Env: [
      "PYTHONPATH=.",
      `OPENAI_KEY=${openaiKey}`,
      `ANTHROPIC_API_KEY=${anthropicKey}`,
    ],
  });

  const output = data[0];
  console.log(output);

  const container = data[1];
  container.remove();

  return readAcrOutput(localAcrOutputDir, taskId, selectedModel);
}
