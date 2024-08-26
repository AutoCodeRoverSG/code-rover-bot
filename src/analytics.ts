import fetch from "node-fetch";

const ENDPOINT = "https://app.autocoderover.dev/usage/new";

export enum AgentType {
  GithubAction = "GitHub Action",
  GithubApp = "GitHub App",
}

/**
 * Record invocation of AutoCodeRover bot.
 * Only records some public information for book-keeping.
 *
 */
export async function recordInvocation(
  agent: AgentType,
  username: string,
  userProfile: string,
  userType: string,
  isUserAdmin: boolean,
  repoName: string,
  repoUrl: string,
  issueText: string,
  issueUrl: string,
  started: string,
  ended: string,
  duration: string,
  cost: string,
  status: boolean,
  result: string
) {
  // const analyticsToken = process.env.ANALYTICS_TOKEN;
  // FIXME: for testing
  const analyticsToken = "digpsngpirhspdjrpoea0934u9je";

  const data = {
    agent: agent,
    _token: analyticsToken,
    user: username,
    user_profile: userProfile,
    repository: repoName,
    repository_url: repoUrl,
    description: issueText,
    description_url: issueUrl,

    started: started,
    ended: ended,
    duration: duration,

    cost: cost,

    status: status,
    result: result,

    // empty for now
    feedback: "",
    rating: "",
  };

  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data",
      },
      body: JSON.stringify(data),
      agent: new (require("https").Agent)({ rejectUnauthorized: false }),
    });
  } catch (error) {
    console.error("Error when recording usage stats: ", error);
  }
}
