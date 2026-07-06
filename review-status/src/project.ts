import type { Config, Octokit } from './config';

export interface StatusOption {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  field: {
    id: string;
    options: StatusOption[];
  };
}

export interface ProjectItem {
  id: string;
  status: string | null;
}

export function sameStatus(a: string | null | undefined, b: string): boolean {
  return a?.toLowerCase() === b.toLowerCase();
}

export async function getProject(octokit: Octokit, { org, projectNumber, statusField }: Config): Promise<Project> {
  const { organization } = await octokit.graphql<{
    organization: {
      projectV2: {
        id: string;
        field: { id: string; options: StatusOption[] } | null;
      } | null;
    };
  }>(`
    query($org: String!, $number: Int!, $field: String!) {
      organization(login: $org) {
        projectV2(number: $number) {
          id
          field(name: $field) {
            ... on ProjectV2SingleSelectField { id options { id name } }
          }
        }
      }
    }`, { org, number: projectNumber, field: statusField });
  const project = organization.projectV2;
  if (!project) {
    throw new Error(`Project ${projectNumber} not found in ${org} (or the token cannot see it)`);
  }
  if (!project.field?.options) {
    throw new Error(`Project ${projectNumber} has no single-select field named "${statusField}"`);
  }
  return { id: project.id, field: project.field };
}

export function findOption(project: Project, name: string): StatusOption {
  const option = project.field.options.find(o => sameStatus(o.name, name));
  if (!option) {
    throw new Error(`No "${name}" option on the status field`);
  }
  return option;
}

// Returns the PR's node id and its item on the project (null if not added yet)
export async function getPullRequestItem(
  octokit: Octokit,
  { owner, repo }: { owner: string; repo: string },
  prNumber: number,
  { projectNumber, statusField }: Config,
): Promise<{ contentId: string; item: ProjectItem | null }> {
  const { repository: { pullRequest: pr } } = await octokit.graphql<{
    repository: {
      pullRequest: {
        id: string;
        projectItems: {
          nodes: {
            id: string;
            project: { number: number };
            fieldValueByName: { name?: string } | null;
          }[];
        };
      };
    };
  }>(`
    query($owner: String!, $repo: String!, $pr: Int!, $field: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          id
          projectItems(first: 50) {
            nodes {
              id
              project { number }
              fieldValueByName(name: $field) {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }
    }`, { owner, repo, pr: prNumber, field: statusField });
  const node = pr.projectItems.nodes.find(n => n.project.number === projectNumber);
  return {
    contentId: pr.id,
    item: node ? { id: node.id, status: node.fieldValueByName?.name ?? null } : null,
  };
}

export async function addItemToProject(octokit: Octokit, projectId: string, contentId: string): Promise<ProjectItem> {
  const added = await octokit.graphql<{
    addProjectV2ItemById: { item: { id: string } };
  }>(`
    mutation($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
        item { id }
      }
    }`, { project: projectId, content: contentId });
  return { id: added.addProjectV2ItemById.item.id, status: null };
}

export async function setItemStatus(octokit: Octokit, project: Project, itemId: string, option: StatusOption): Promise<void> {
  await octokit.graphql(`
    mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project, itemId: $item, fieldId: $field,
        value: { singleSelectOptionId: $option }
      }) { projectV2Item { id } }
    }`, { project: project.id, item: itemId, field: project.field.id, option: option.id });
}

interface ProjectItemsPage {
  pageInfo: { hasNextPage: boolean; endCursor: string };
  nodes: {
    id: string;
    fieldValueByName: { name?: string } | null;
    content: {
      number?: number;
      state?: string;
      repository?: { name: string; owner: { login: string } };
    } | null;
  }[];
}

// Open PRs of the given repo whose status matches statusName
export async function listPullRequestsWithStatus(
  octokit: Octokit,
  project: Project,
  statusName: string,
  { owner, repo }: { owner: string; repo: string },
  { statusField }: Config,
): Promise<{ itemId: string; number: number }[]> {
  const result: { itemId: string; number: number }[] = [];
  let cursor: string | null = null;
  do {
    const { node: { items } }: { node: { items: ProjectItemsPage } } = await octokit.graphql(`
      query($project: ID!, $cursor: String, $field: String!) {
        node(id: $project) {
          ... on ProjectV2 {
            items(first: 100, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                fieldValueByName(name: $field) {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
                content {
                  ... on PullRequest { number state repository { name owner { login } } }
                }
              }
            }
          }
        }
      }`, { project: project.id, cursor, field: statusField });
    for (const item of items.nodes) {
      if (!sameStatus(item.fieldValueByName?.name, statusName)) continue;
      const pr = item.content;
      if (!pr?.number || pr.state !== 'OPEN') continue;
      if (pr.repository?.owner.login !== owner || pr.repository.name !== repo) continue;
      result.push({ itemId: item.id, number: pr.number });
    }
    cursor = items.pageInfo.hasNextPage ? items.pageInfo.endCursor : null;
  } while (cursor);
  return result;
}
