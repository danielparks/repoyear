interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
  readonly VITE_FRONTEND_URL: string;
  readonly VITE_GITHUB_CLIENT_ID: string;
  readonly VITE_CONTRIBUTIONS_URL?: string;
  readonly VITE_CLICK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
