# Update Projects Action

This action manages issues and PRs with GitHub's projects.

This repository also contains [review-status](review-status/), an action that sets a PR's
project status based on review approvals from org teams.

## Inputs

| Name                | Description                                                                     |
|---------------------|---------------------------------------------------------------------------------|
| github-token        | Access Token with high enough permissions to change the project                 |
| project-url         | The full url to your project that will be modified                              |
| column-field        | The field in the project that determines the columns                            |
| label-to-column-map | A JSON object mapping labels to column names                                    |
| issue-numbers       | Optional issue/PR numbers to process instead of the triggering event's issue/PR |

By default, the action processes the issue/PR of the triggering `issues` or `pull_request`
event. Setting `issue-numbers` (newline- or comma-separated) overrides that and allows
running from any event, e.g. manually via `workflow_dispatch`:

## Example usage

```yml
name: Update Projects

on:
  issues:
    types:
      - labeled
      - unlabeled

concurrency:
  group: update-projects-${{ github.event_name }}
  cancel-in-progress: true


jobs:
  issues:
    runs-on: ubuntu-latest
    steps:
      # substitute RELEASE_VERSION for the latest version available in releases
      - uses: PaperMC/update-projects-action@RELEASE_VERSION
        with:
          github-token: ${{ secrets.SOME_TOKEN }}
          project-url: <the full url to your project> # e.g. https://github.com/users/PaperMC/projects/2/views/1
          column-field: Status
          label-to-column-map: |
            {
              "bug": "Todo",
              "enhancement": "In Progress",
              "wontfix": "Invalid",
              "duplicate": "Invalid"
            }

```

## Development

```bash
npm install # installs dependencies
```

```bash
npm run build # typechecks and bundles to dist/ - run before committing changes
```
