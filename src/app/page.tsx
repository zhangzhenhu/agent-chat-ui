"use client";

import { Thread } from "@/components/thread";
import { StreamProvider } from "@/providers/Stream";
import { ThreadProvider } from "@/providers/Thread";
import { ArtifactProvider } from "@/components/thread/artifact";
import { Toaster } from "@/components/ui/sonner";
import { RuntimeConfigProvider } from "@/providers/runtime-config";
import React from "react";

export default function DemoPage(): React.ReactNode {
  return (
    <React.Suspense fallback={<div>Loading (layout)...</div>}>
      <Toaster />
      <RuntimeConfigProvider>
        <ThreadProvider>
          <StreamProvider>
            <ArtifactProvider>
              <Thread />
            </ArtifactProvider>
          </StreamProvider>
        </ThreadProvider>
      </RuntimeConfigProvider>
    </React.Suspense>
  );
}
