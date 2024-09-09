export enum AgentType {
  GithubAction = "GitHub Action",
  GithubApp = "GitHub App",
}

export enum InstructType {
  PR = "pr",
  Patch = "patch",
}

export type Mode = {
  agentType: AgentType;
  instructType: InstructType;
  modelName?: string; // undefined if in PR mode
};
