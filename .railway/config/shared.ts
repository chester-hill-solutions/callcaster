import { github, preserve } from "railway/iac";

export const repository = "chester-hill-solutions/callcaster";

export function source(branch: string) {
  return github(repository, { branch, checkSuites: false });
}

export function preservedVariables(names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, preserve()]));
}
