# Add to Project

This action manages issues and PRs with GitHub's projects.

## Inputs

| Name                | Description                                                     |
|---------------------|-----------------------------------------------------------------|
| github-token        | Access Token with high enough permissions to change the project |
| project-url         | The full url to your project that will be modified              |
| column-field        | The field in the project that determines the columns            |
| label-to-column-map | A JSON object mapping labels to column names                    |

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
      - uses: Machine-Maker/add-to-project-action@RELEASE_VERSION
        with:
          github-token: ${{ secrets.SOME_TOKEN }}
          project-url: <the full url to your project> # e.g. https://github.com/users/Machine-Maker/projects/1/views/1
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

This project uses the yarn package manager.

```bash
yarn install # installs dependencies
```

```bash
yarn package # run before committing changes
```
