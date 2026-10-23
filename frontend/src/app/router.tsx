import { createBrowserRouter } from "react-router";
import { AppShell } from "./layout/AppShell";
import { AssetDetailPage } from "../features/assets/AssetDetailPage";
import { AssetListPage } from "../features/assets/AssetListPage";
import { HomePlaceholder } from "../features/projects/HomePlaceholder";

export const routes = [
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <HomePlaceholder /> },
      { path: "/projects/:projectId/assets", element: <AssetListPage /> },
      { path: "/projects/:projectId/assets/:assetId", element: <AssetDetailPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
