import { createBrowserRouter } from "react-router";
import { AppShell } from "./layout/AppShell";
import { AssetCreatePage } from "../features/assets/AssetCreatePage";
import { AssetDetailPage } from "../features/assets/AssetDetailPage";
import { AssetListPage } from "../features/assets/AssetListPage";
import { ProcessEditorPage } from "../features/processes/ProcessEditorPage";
import { ProcessFlowPage } from "../features/processes/ProcessFlowPage";
import { ProcessListPage } from "../features/processes/ProcessListPage";
import { ProcessOverviewPage } from "../features/processes/ProcessOverviewPage";
import { MaterialCreatePage } from "../features/materials/MaterialCreatePage";
import { MaterialDetailPage } from "../features/materials/MaterialDetailPage";
import { MaterialListPage } from "../features/materials/MaterialListPage";
import { ProductCreatePage } from "../features/products/ProductCreatePage";
import { ProductDetailPage } from "../features/products/ProductDetailPage";
import { ProductListPage } from "../features/products/ProductListPage";
import { RunComparePage } from "../features/runs/RunComparePage";
import { RunReportPage } from "../features/runs/RunReportPage";
import { RunDetailPage } from "../features/runs/RunDetailPage";
import { RunListPage } from "../features/runs/RunListPage";
import { ScenarioCreatePage } from "../features/scenarios/ScenarioCreatePage";
import { ScenarioDetailPage } from "../features/scenarios/ScenarioDetailPage";
import { ScenarioListPage } from "../features/scenarios/ScenarioListPage";
import { ScenarioVersionPage } from "../features/scenarios/ScenarioVersionPage";
import { ProjectCreatePage } from "../features/projects/ProjectCreatePage";
import { ProjectListPage } from "../features/projects/ProjectListPage";

export const routes = [
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <ProjectListPage /> },
      { path: "/projects/new", element: <ProjectCreatePage /> },
      { path: "/projects/:projectId/assets", element: <AssetListPage /> },
      { path: "/projects/:projectId/assets/new", element: <AssetCreatePage /> },
      { path: "/projects/:projectId/assets/:assetId", element: <AssetDetailPage /> },
      { path: "/projects/:projectId/materials", element: <MaterialListPage /> },
      { path: "/projects/:projectId/materials/new", element: <MaterialCreatePage /> },
      { path: "/projects/:projectId/materials/:materialId", element: <MaterialDetailPage /> },
      { path: "/projects/:projectId/products", element: <ProductListPage /> },
      { path: "/projects/:projectId/products/new", element: <ProductCreatePage /> },
      { path: "/projects/:projectId/products/:productId", element: <ProductDetailPage /> },
      { path: "/projects/:projectId/processes", element: <ProcessListPage /> },
      { path: "/projects/:projectId/flow", element: <ProcessFlowPage /> },
      { path: "/projects/:projectId/flow/all", element: <ProcessOverviewPage /> },
      { path: "/projects/:projectId/products/:productId/flow", element: <ProcessFlowPage /> },
      { path: "/projects/:projectId/scenarios", element: <ScenarioListPage /> },
      { path: "/projects/:projectId/scenarios/new", element: <ScenarioCreatePage /> },
      { path: "/projects/:projectId/scenarios/versions/:versionId", element: <ScenarioVersionPage /> },
      { path: "/projects/:projectId/scenarios/:scenarioId", element: <ScenarioDetailPage /> },
      { path: "/projects/:projectId/runs", element: <RunListPage /> },
      { path: "/projects/:projectId/runs/:runId", element: <RunDetailPage /> },
      { path: "/projects/:projectId/runs/:runId/compare/:otherId", element: <RunComparePage /> },
      { path: "/projects/:projectId/runs/:runId/report", element: <RunReportPage /> },
      {
        path: "/projects/:projectId/products/:productId/processes/:versionId",
        element: <ProcessEditorPage />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
