export const OpenaiModels: Record<string, string> = {
  "gpt-4o": "gpt-4o-2024-05-13", // short name
  "gpt-4o-2024-08-06": "gpt-4o-2024-08-06",
  "gpt-4o-2024-05-13": "gpt-4o-2024-05-13",
  "gpt-4-turbo-2024-04-09": "gpt-4-turbo-2024-04-09",
  "gpt-4-0125-preview": "gpt-4-0125-preview",
  "gpt-4-1106-preview": "gpt-4-1106-preview",
};


export const AnthropicModels: Record<string, string> = {
  sonnet: "claude-3-5-sonnet-20240620", // short name
  "claude-3-5-sonnet-20240620": "claude-3-5-sonnet-20240620",
  "claude-3-opus-20240229": "claude-3-opus-20240229",
  "claude-3-sonnet-20240229": "claude-3-sonnet-20240229",
};

export const AllModels = Object.assign({}, OpenaiModels, AnthropicModels);

function getDefaultModel() {
  if (process.env.OPENAI_API_KEY) {
    return "gpt-4o-2024-05-13";
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return "claude-3-5-sonnet-20240620";
  }

  return "";
}

export const defaultModel = getDefaultModel();
