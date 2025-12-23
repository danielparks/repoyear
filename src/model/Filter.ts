/**
 * Manages which repositories are visible in the contribution graph.
 *
 * Maintains a default state (all on/off) and per-repository overrides.
 */
export class Filter {
  defaultState: boolean = true;
  states: Map<string, boolean> = new Map();

  /**
   * Creates a filter that only shows the specified repositories.
   */
  static withOnlyRepos(...urls: string[]) {
    const filter = new Filter();
    filter.defaultState = false;
    urls.forEach((url) => {
      filter.states.set(url, true);
    });
    return filter;
  }

  /**
   * Checks whether a repository should be visible.
   */
  isOn(url: string): boolean {
    const value = this.states.get(url);
    if (value === undefined) {
      return this.defaultState;
    } else {
      return value;
    }
  }

  /**
   * Clone this object.
   */
  clone() {
    const filter = new Filter();
    filter.defaultState = this.defaultState;
    filter.states = new Map(this.states);
    return filter;
  }

  /**
   * Enable or disable a repo by its URL.
   */
  switchRepo(url: string, enabled: boolean) {
    this.states.set(url, enabled);
  }
}

export const ALL_ON = new Filter();
