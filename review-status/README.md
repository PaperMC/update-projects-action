# review-status

Sets a pull request's status on an org project based on review approvals from org teams:

## Usage

`review` mode sets the status of a pull request from its current reviews (a maintainer approval sets full approval,
otherwise a developer approval sets delayed approval).

Workflows triggered by `pull_request_review` on pull requests from forks run without secrets, so they cannot
authenticate an app token. Instead, you should run an unprivileged signal workflow and then run the action from a
privileged
`workflow_run` workflow. The affected pull request is resolved from the signal run's head commit:

```yaml
# pr_review_signal.yml — runs (without secrets) in the context of the fork
name: PR Review Signal

on:
  pull_request_review:
    types:
      - submitted

permissions: { }

jobs:
  signal:
    runs-on: ubuntu-latest
    steps:
      - run: echo "A PR review was submitted"
```

```yaml
# pr_review_status.yml — runs with secret access when the signal workflow completes
on:
  workflow_run:
    workflows:
      - PR Review Signal
    types:
      - completed

jobs:
  review-submitted:
    if: >
      github.event.workflow_run.event == 'pull_request_review' &&
      github.event.workflow_run.conclusion == 'success'
    concurrency:
      group: pr-review-status-${{ github.event.workflow_run.head_sha }}
      cancel-in-progress: false
    runs-on: ubuntu-latest
    steps:
      - uses: PaperMC/update-projects-action/review-status@v0.4.0
        with:
          github-token: ${{ steps.authenticate.outputs.token }}
          mode: review
          project-url: https://github.com/orgs/PaperMC/projects/2
          maintainer-teams: paper-maintainers
          developer-teams: paper-developers
```

If the repository only receives pull requests from branches of the repository itself, the action can run directly on the
`pull_request_review` event without the signal workflow. `review` mode can also be pointed at a specific pull request
via `pull-request-number`, e.g. from a`workflow_dispatch` input.

Promote stale delayed approvals on a schedule:

```yaml
on:
  schedule:
    - cron: "00 5 * * *"

jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - uses: PaperMC/update-projects-action/review-status@v0.4.0
        with:
          github-token: ${{ steps.authenticate.outputs.token }}
          mode: promote
          project-url: https://github.com/orgs/PaperMC/projects/2
          maintainer-teams: paper-maintainers
          developer-teams: paper-developers
          promote-after-days: "14"
```

The token needs org project read/write, pull request read and org members read permissions
(e.g. via `actions/create-github-app-token`).

### Parameters

| Input                     | Default            | Description                                      |
|---------------------------|--------------------|--------------------------------------------------|
| `github-token`            | *(required)*       | Token with the permissions above                 |
| `mode`                    | *(required)*       | `review` or `promote`                            |
| `project-url`             | *(required)*       | GitHub Projects URL                              |
| `status-field`            | `Status`           | Single-select field to update                    |
| `full-approval-status`    | `Full approval`    | Option set on maintainer approval / promotion    |
| `delayed-approval-status` | `Delayed approval` | Option set on developer approval                 |
| `maintainer-teams`        | *(required)*       | Comma-separated team slugs                       |
| `developer-teams`         | *(required)*       | Comma-separated team slugs                       |
| `pull-request-number`     | *(from event)*     | Explicit pull request to process (`review` mode) |
| `promote-after-days`      | `14`               | Quiet period before promotion (`promote` mode)   |
