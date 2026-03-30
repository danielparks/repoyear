/**
 * A URL or a `Repository`-shaped object.
 */
export type RepositorySource = string | {
  url: string;
  isFork?: boolean;
  isPrivate?: boolean;
};

/**
 * Represents a GitHub repository with contribution tracking.
 */
export class Repository {
  url: string;
  isFork: boolean;
  isPrivate: boolean;
  /** Hue assigned for visualization (as degrees) */
  hue = 285;
  /** Total contribution count across all days */
  contributions = 0;

  constructor(url: string, isFork = false, isPrivate = false) {
    this.url = url;
    this.isFork = isFork;
    this.isPrivate = isPrivate;
  }

  /**
   * Convenience method to generate a `Repository` from a URL, or from a
   * `Repository`-shaped object.
   */
  static from(source: RepositorySource) {
    if (typeof source == "string") {
      return new Repository(source);
    } else {
      return new Repository(
        source.url,
        source.isFork ?? false,
        source.isPrivate ?? false,
      );
    }
  }

  /**
   * Returns an [OKLCH](https://en.wikipedia.org/wiki/Oklab_color_space) color
   * string for this repository.
   */
  color(lightness = 55, chroma = 0.2) {
    if (this.url === "unknown") {
      return `oklch(${lightness}% 0 0deg)`;
    }
    return `oklch(${lightness}% ${chroma} ${this.hue}deg)`;
  }
}
