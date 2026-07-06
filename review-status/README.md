# review-status

Sets a pull request's status on an org project based on review approvals from org teams:

## Usage

Set the status when a review is submitted:

```yaml
on:
  pull_request_review:
    types:
      - submitted

jobs:
  review-submitted:
    if: github.event.review.state == 'approved'
    runs-on: ubuntu-latest
    steps:
      - uses: PaperMC/update-projects-action/review-status@v0.3.0
        with:
          github-token: ${{ steps.authenticate.outputs.token }}
          mode: review
          project-url: https://github.com/orgs/PaperMC/projects/2
          maintainer-teams: paper-maintainers
          developer-teams: paper-developers
```

Promote stale delayed approvals on a schedule:

```yaml
on:
  schedule:
    - cron: "00 5 * * *"

jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - uses: PaperMC/update-projects-action/review-status@v0.3.0
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

| Input                     | Default            | Description                                    |
|---------------------------|--------------------|------------------------------------------------|
| `github-token`            | *(required)*       | Token with the permissions above               |
| `mode`                    | *(required)*       | `review` or `promote`                          |
| `project-url`             | *(required)*       | GitHub Projects URL                            |
| `status-field`            | `Status`           | Single-select field to update                  |
| `full-approval-status`    | `Full approval`    | Option set on maintainer approval / promotion  |
| `delayed-approval-status` | `Delayed approval` | Option set on developer approval               |
| `maintainer-teams`        | *(required)*       | Comma-separated team slugs                     |
| `developer-teams`         | *(required)*       | Comma-separated team slugs                     |
| `promote-after-days`      | `14`               | Quiet period before promotion (`promote` mode) |
