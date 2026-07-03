import { Button } from "@/components/ui/button";

import {
  GenerativeComponentShell,
  GenericUIFallback,
} from "./component-shell";

type Candidate = {
  name?: string;
  reason?: string;
  estimate_cost?: string;
  estimate_time?: string;
};

type CardProps = {
  title?: string;
  description?: string;
  data?: unknown;
  actions?: Array<{ label?: string; value?: string }>;
};

function isCandidateList(value: unknown): value is { summary?: string; candidates?: Candidate[] } {
  return !!value && typeof value === "object" && "candidates" in value;
}

function renderStructuredData(data: unknown) {
  if (typeof data === "string") {
    return <div className="whitespace-pre-wrap text-sm leading-6">{data}</div>;
  }

  if (isCandidateList(data)) {
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    return (
      <div className="space-y-3">
        {data.summary ? (
          <p className="text-sm text-muted-foreground">{data.summary}</p>
        ) : null}
        {candidates.map((candidate, index) => (
          <div
            key={`${candidate.name ?? "candidate"}:${index}`}
            className="rounded-xl border border-border/70 bg-muted/30 p-4"
          >
            <div className="font-medium">{candidate.name ?? `候选 ${index + 1}`}</div>
            {candidate.reason ? (
              <p className="mt-2 text-sm text-muted-foreground">{candidate.reason}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {candidate.estimate_cost ? (
                <span className="rounded-full bg-background px-2 py-1">
                  预算：{candidate.estimate_cost}
                </span>
              ) : null}
              {candidate.estimate_time ? (
                <span className="rounded-full bg-background px-2 py-1">
                  时间：{candidate.estimate_time}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (Array.isArray(data)) {
    return (
      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={index} className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
            <GenericUIFallback value={item} />
          </div>
        ))}
      </div>
    );
  }

  return <GenericUIFallback value={data} />;
}

export function CardUI(props: CardProps) {
  const actions = Array.isArray(props.actions) ? props.actions : [];

  return (
    <GenerativeComponentShell
      title={props.title}
      description={props.description}
    >
      {renderStructuredData(props.data)}
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {actions.map((action, index) => (
            <Button key={`${action.value ?? action.label ?? "action"}:${index}`} variant="outline" disabled>
              {action.label ?? action.value ?? `动作 ${index + 1}`}
            </Button>
          ))}
        </div>
      ) : null}
    </GenerativeComponentShell>
  );
}
