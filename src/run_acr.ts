import Docker from "dockerode";

const dockerImageName = "autocoderover/acr:v1";

let docker = new Docker();

export function runAcr(
  issueId: number,
  repoName: string,
  repoUrl: string,
  issueText: string
) {
  console.log("Going to run ACR on the following issue text:");
  console.log(issueText);
  console.log(repoUrl);

  const taskId = `${repoName}-${issueId}`;
  const containerName = `acr-${taskId}`;




  const outputDir = "aa";
  const commitHash = "aa";
  const issueLink = "aa";

  const cmd = [
    "python",
    "app/main.py",
    "github-issue",
    "--output-dir",
    outputDir,
    "--setup-dir",
    "setup",
    "--model",
    "gpt-4o-2024-05-13",
    "--task-id",
    taskId,
    "--clone-link",
    repoUrl,
    "--commit-hash",
    commitHash,
    "--issue-link",
    issueLink,
  ];




  console.log(containerName);
  console.log(cmd);
  console.log(dockerImageName);
  console.log(docker);
}

// PYTHONPATH=. python app/main.py github-issue --output-dir output --setup-dir setup --model gpt-4o-2024-05-13 --model-temperature 0.2 --task-id langchain-20453 --clone-link https://github.com/langchain-ai/langchain.git --commit-hash cb6e5e5 --issue-link https://github.com/langchain-ai/langchain/issues/20453
