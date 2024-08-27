# AutoCodeRover GitHub Bot

## Set up as GitHub Action

1. In your repository, create a new workflow file (e.g. `acr_bot.yml`) in `.github/workflows/`. Then, copy the content of `workflow_template.yml` in this repository to your newly created workflow file.

2. Set `OPENAI_API_KEY` in your repository. This should set in `Settings -> Secrets and variables -> Actions`. In `Repository secrets`, create a new secret with name `OPENAI_API_KEY` whose value is your own key.


> [!NOTE]
> Currently the bot uses OpenAI GPT-4o as the backend model by default. Support to more models (from the bot) coming soon!


## Set up as GitHub App

