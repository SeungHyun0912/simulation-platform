import { createBrowserRouter } from "react-router";
import { AppShell } from "./layout/AppShell";
import { AssetListPlaceholder } from "../features/assets/AssetListPlaceholder";
import { HomePlaceholder } from "../features/projects/HomePlaceholder";

export const routes = [
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <HomePlaceholder /> },
      { path: "/projects/:projectId/assets", element: <AssetListPlaceholder /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
