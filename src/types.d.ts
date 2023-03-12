declare module "add-to-project" {
  import { GitHub } from "@actions/github/lib/utils";

  type Options = {
    token: string;
    octokit: InstanceType<typeof GitHub>;
    project: {
      id: string;
      url: string;
      parts: MatchGroups;
    };
    field: GetColumnFieldId["repositoryOwner"]["projectV2"]["field"] & { name: string };
    labelToOptionsMap: Record<string, string>;
  };

  type MatchGroups = {
    type: "users" | "orgs";
    owner: string;
    id: string; // number
    view: string; // number
  };

  type Labelled = {
    labels: {
      name: string;
    }[];
    html_url: string;
  };

  type GetColumnFieldId = {
    repositoryOwner: {
      projectV2: {
        id: string;
        field: {
          id: string;
          options: {
            id: string;
            name: string;
          }[];
        };
      };
    };
  };

  type GetIssuePrProjectStatus = {
    resource: {
      id: string;
      projectItems: {
        nodes: {
          itemId: string;
          project: {
            id: string;
          };
          field: {
            name: string;
            optionId: string;
          };
        }[];
      };
    };
  };

  type MutateAddIssuePrToProject = {
    addProjectV2ItemById: {
      item: {
        id: string;
      };
    };
  };

  type OptionPair = {
    option: {
      name: string;
      id: string;
    };
    label: string;
  };
}
