import * as core from "@actions/core";
import { GetColumnFieldId, MatchGroups, Options } from "add-to-project";
import * as github from "@actions/github";
import { readFileSync } from "node:fs";

const GET_PROJECT_FIELD = readFileSync(__dirname + "/query/getProjectField.graphql", { encoding: "utf-8" });

const PROJECT_URL_REGEX = /^.*github.com\/(?<type>users|orgs)\/(?<owner>[0-9a-zA-Z-]+)\/projects\/(?<id>\d+)\/views\/(?<view>\d+)\/?$/;

export async function parseOptions(): Promise<Options> {
  const ghToken = core.getInput("github-token", { required: true });
  const octokit = github.getOctokit(ghToken);

  // project info
  const projectUrl = core.getInput("project-url", { required: true });
  const match = projectUrl.match(PROJECT_URL_REGEX);
  core.debug(`match: ${JSON.stringify(match, null, 2)}`);
  if (match == null || !("groups" in match)) {
    throw new Error(`Invalid project-url: ${projectUrl}`);
  }
  const groups = match.groups as MatchGroups;
  core.debug(`groups: ${JSON.stringify(groups, null, 2)}`);

  // field info
  const columnField = core.getInput("column-field", { required: true });
  const getColumnFieldResult = await octokit.graphql<GetColumnFieldId>(GET_PROJECT_FIELD, {
    owner: groups.owner,
    projectId: parseInt(groups.id),
    fieldName: columnField,
  });
  core.debug(`GET_PROJECT_FIELD: ${JSON.stringify(getColumnFieldResult, null, 2)}`);
  if (!getColumnFieldResult?.repositoryOwner?.projectV2?.field) {
    throw new Error(`Couldn't find a select-type field with the name ${columnField}`);
  }
  const projectId = getColumnFieldResult.repositoryOwner.projectV2.id;
  const field = getColumnFieldResult.repositoryOwner.projectV2.field;
  core.info(`Found field "${columnField}" (${field.id}) on project "${projectId}"`);

  // labelToOptionsMap
  const labelToOptionsMap = JSON.parse(core.getInput("label-to-column-map", { required: true }));
  return {
    octokit: octokit,
    token: ghToken,
    project: {
      id: projectId,
      url: projectUrl,
      parts: groups,
    },
    field: {
      ...field,
      name: columnField,
    },
    labelToOptionsMap,
  };
}
