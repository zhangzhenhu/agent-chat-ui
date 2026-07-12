# Thread Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side thread workbench for `State` and `Skills`, keep `Runtime Trace` and `Telemetry` on `ThinkingTraceCard`, and wire the new backend debug endpoints into the UI.

**Architecture:** Add one thread-level workbench component rendered beside the chat pane, backed by focused fetch helpers and small view-model utilities. Keep the existing thinking card as the run-level surface by removing `ThreadStateSheet` from it and leaving `RuntimeTraceSheet` and `AnalyticsSheet` in place.

**Tech Stack:** Next.js, React 19, TypeScript, existing shadcn `Sheet`/`Button` primitives, node:test source and helper tests, browser `fetch`

---
