# AutoCodeRover GitHub Bot

## Set up as GitHub App

1. Go to [this link](https://github.com/organizations/AutoCodeRoverSG/settings/apps/code-rover-bot/installations) and install code-rover-bot App in your repository. Note that this link should be changed to a marketplace link once the App is published.

2. Set `OPENAI_API_KEY` in your repository. This should set in `Settings -> Secrets and variables -> Actions`. In `Repository variables`, create a new variable with name `OPENAI_API_KEY` whose value is your own key.
  - If you want to use the Anthropic models, set `ANTHROPIC_API_KEY` with similar steps.

> [!NOTE]
> For GitHub App, you should set your keys in Repository **variables**.

## Set up as GitHub Action

1. In your repository, create a new workflow file (e.g. `acr_bot.yml`) in `.github/workflows/`. Then, copy the content of `workflow_template.yml` in this repository to your newly created workflow file.

2. Set `OPENAI_API_KEY` in your repository. This should set in `Settings -> Secrets and variables -> Actions`. In `Repository secrets`, create a new secret with name `OPENAI_API_KEY` whose value is your own key.
  - If you want to use the Anthropic models, set `ANTHROPIC_API_KEY` with similar steps.

> [!NOTE]
> For GitHub Action, you should set your keys in Repository **secrets**.

## Running the bot

You can now invoke acr-bot under an existing issue of your repository. The bot can be invoked by
writing `@acr-bot <instruction>` as a comment to the issue.

There are two modes of running acr-bot:

1. Patch mode. `<instruction>` should be a model name that you wish to invoke acr-bot with. List of currently supported model names:


| instruction | actual model |
| --- | --- |
| gpt-4o | gpt-4o-2024-05-13 |
| gpt-4o-2024-08-06 | gpt-4o-2024-08-06 |
| gpt-4o-2024-05-13 | gpt-4o-2024-05-13 |
| gpt-4-turbo-2024-04-09 | gpt-4-turbo-2024-04-09 |
| gpt-4-0125-preview | gpt-4-0125-preview |
| gpt-4-1106-preview | gpt-4-1106-preview |
| sonnet | claude-3-5-sonnet-20240620 |
| claude-3-5-sonnet-20240620 | claude-3-5-sonnet-20240620 |
| claude-3-opus-20240229 | claude-3-opus-20240229 |
| claude-3-sonnet-20240229 | claude-3-sonnet-20240229 |


NOTE:

1. The recommended models are `gpt-4o` and `sonnet`, which can be invoked by `@acr-bot gpt-4o` and `@acr-bot sonnet`.
2. You can also omit the instruction (i.e. just `@acr-bot`), and the default model will be used (currently `gpt-4o`).
3. The list of models may be updated from time to time. Refer to `src/model.ts` for the latest list of models.


2. Pull Request mode. `<instruction>` is "open-pr". In this mode, you can write `@acr-bot open-pr`. The bot will then processed the conversation history of the issue, and take the latest patch generated by itself to create a pull request. Note that you should use this mode only after acr-bot has generated a patch for this issue in the Patch mode.


After you make a new comment under an issue with `@acr-bot ...`, you can go to the `Actions` tab in your repository and see the bot being executed in real-time. In Patch mode, you can also see the process of running AutoCodeRover being streamed to the workflow run output.


## GitHub App vs. GitHub Action

### Action

- Takes longer since dependencies need to be installed each time.
- Currently uses AutoCodeRover-v1 (20240408) as the backend.
- Supports Python projects.
- OpenAI/Anthropic token can be set as repository secrets.

#### App

- Can use AutoCodeRover-v2 as the backend.
- Supports Python, Java, and C projects. Experimental support for C++ and Go.
- OpenAI/Anthropic token need to be set as repository variables, since GitHub App has no access to secrets.



## Create PR extra setup

if dont need PR feature:

```
permissions:
  contents: read
  issues: write
```

If need:

```
permissions:
  contents: write
  issues: write
  pull-requests: write
```

This is for action.

Or, just turn it on in settings.

Settings -> Action -> Allow GitHub Actions to create and approve pull requests


## Setting up GitHub App server

```
npm install
npm run build
npm start
```