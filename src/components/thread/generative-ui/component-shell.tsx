import { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function GenericUIFallback({ value }: { value: unknown }) {
  return (
    <pre className="overflow-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">
      {toText(value)}
    </pre>
  );
}

export function GenerativeComponentShell(props: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-muted-foreground/20 bg-background shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">{props.title || "Generated UI"}</CardTitle>
        {props.description ? (
          <CardDescription className="whitespace-pre-wrap">
            {props.description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">{props.children}</CardContent>
    </Card>
  );
}
