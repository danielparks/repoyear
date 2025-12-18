/// <reference types="@testing-library/jest-dom" />

declare global {
  namespace Vi {
    interface JestAssertion<T = unknown>
      extends jest.Matchers<void, T>,
        TestingLibraryMatchers<T, void> {}
  }
}

declare module "vitest" {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toHaveTextContent(text: string | RegExp): T;
    toBeChecked(): T;
    toHaveAttribute(attr: string, value?: string): T;
  }
}
