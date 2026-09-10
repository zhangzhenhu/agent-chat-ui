import { RuntimeConfigProvider } from "@/providers/runtime-config";
import { StateWorkbenchPage } from "@/components/state-workbench/state-workbench-page";
import React from "react";

export default function StateWorkbenchRoute() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          加载中…
        </div>
      }
    >
      <RuntimeConfigProvider>
        <StateWorkbenchPage />
      </RuntimeConfigProvider>
    </React.Suspense>
  );
}
