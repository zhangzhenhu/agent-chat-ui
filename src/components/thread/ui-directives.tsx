import { type ReactNode, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { type UIMessage } from "@langchain/langgraph-sdk/react-ui";

type DirectiveName = "choice" | "form" | "card" | "table" | "confirm";

export type UIResumePayload = {
  ui_id: string;
  kind: DirectiveName;
  value: unknown;
};

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

function getDirectiveKind(message: UIMessage): DirectiveName {
  return (message.name as DirectiveName) ?? "card";
}

function DirectiveShell({
  message,
  children,
}: {
  message: UIMessage;
  children: ReactNode;
}) {
  const props = message.props as Record<string, unknown>;
  const origin = props.origin as { kind?: string; name?: string } | undefined;
  const originLabel = origin?.kind === "subagent" ? `子代理 · ${origin.name ?? "unknown"}` : "主代理";

  return (
    <Card className="border-muted-foreground/20 bg-background shadow-sm">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{String(props.title ?? "UI directive")}</CardTitle>
          <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{originLabel}</span>
        </div>
        {props.description ? (
          <CardDescription className="whitespace-pre-wrap">{String(props.description)}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function FormDirective({
  message,
  onResume,
}: {
  message: UIMessage;
  onResume: (payload: UIResumePayload) => void;
}) {
  const props = message.props as Record<string, unknown>;
  const fields = useMemo(() => {
    const schema = (props.schema ?? {}) as Record<string, unknown>;
    const rawFields = Array.isArray(schema.fields) ? schema.fields : [];
    return rawFields as Array<{
      name: string;
      label?: string;
      type?: "text" | "textarea" | "boolean";
      placeholder?: string;
      defaultValue?: unknown;
    }>;
  }, [props.schema]);

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    fields.reduce<Record<string, unknown>>((acc, field) => {
      acc[field.name] = field.defaultValue ?? (field.type === "boolean" ? false : "");
      return acc;
    }, {}),
  );

  return (
    <DirectiveShell message={message}>
      <div className="space-y-4">
        {fields.map((field) => {
          const value = values[field.name];
          const label = field.label ?? field.name;
          if (field.type === "boolean") {
            return (
              <div key={field.name} className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
                <Label htmlFor={`${message.id}:${field.name}`}>{label}</Label>
                <Switch
                  id={`${message.id}:${field.name}`}
                  checked={Boolean(value)}
                  onCheckedChange={(checked) =>
                    setValues((prev) => ({ ...prev, [field.name]: checked }))
                  }
                />
              </div>
            );
          }

          if (field.type === "textarea") {
            return (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={`${message.id}:${field.name}`}>{label}</Label>
                <Textarea
                  id={`${message.id}:${field.name}`}
                  placeholder={field.placeholder}
                  value={String(value ?? "")}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                />
              </div>
            );
          }

          return (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={`${message.id}:${field.name}`}>{label}</Label>
              <Input
                id={`${message.id}:${field.name}`}
                placeholder={field.placeholder}
                value={String(value ?? "")}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
              />
            </div>
          );
        })}
        <div className="px-0">
          <Button
            onClick={() =>
              onResume({
                ui_id: message.id,
                kind: getDirectiveKind(message),
                value: values,
              })
            }
          >
            <Check className="size-4" />
            提交
          </Button>
        </div>
      </div>
    </DirectiveShell>
  );
}

export function UIDirectiveCard({
  message,
  onResume,
}: {
  message: UIMessage;
  onResume: (payload: UIResumePayload) => void;
}) {
  const props = message.props as Record<string, unknown>;
  const kind = getDirectiveKind(message);

  if (kind === "choice") {
    const options = Array.isArray(props.options) ? props.options : [];
    return (
      <DirectiveShell message={message}>
        <div className="flex flex-wrap gap-2">
          {options.map((option, index) => {
            const item = option as { label?: string; value?: string };
            return (
              <Button
                key={item.value ?? `${message.id}:${index}`}
                variant="outline"
                onClick={() =>
                  onResume({
                    ui_id: message.id,
                    kind,
                    value: item.value ?? item.label ?? String(index),
                  })
                }
              >
                {item.label ?? item.value ?? `选项 ${index + 1}`}
              </Button>
            );
          })}
        </div>
      </DirectiveShell>
    );
  }

  if (kind === "form") {
    return (
      <FormDirective
        message={message}
        onResume={onResume}
      />
    );
  }

  if (kind === "confirm") {
    const actions = Array.isArray(props.actions) ? props.actions : [];
    const items =
      actions.length > 0
        ? actions
        : [
            { label: "确认", value: "confirm", style: "primary" },
            { label: "取消", value: "cancel", style: "secondary" },
          ];
    return (
      <DirectiveShell message={message}>
        <div className="flex flex-wrap gap-2">
          {items.map((action, index) => {
            const item = action as { label?: string; value?: string; style?: "primary" | "secondary" };
            return (
              <Button
                key={item.value ?? `${message.id}:${index}`}
                variant={item.style === "primary" ? "default" : "outline"}
                onClick={() =>
                  onResume({
                    ui_id: message.id,
                    kind,
                    value: item.value ?? item.label ?? String(index),
                  })
                }
              >
                {item.label ?? item.value ?? `动作 ${index + 1}`}
              </Button>
            );
          })}
        </div>
      </DirectiveShell>
    );
  }

  return (
    <DirectiveShell message={message}>
      <pre className="overflow-auto rounded-md bg-muted p-3 text-sm">
        {toText(props.data)}
      </pre>
    </DirectiveShell>
  );
}

export function ThreadUIDirectives({
  messages,
  onResume,
}: {
  messages: UIMessage[];
  onResume: (payload: UIResumePayload) => void;
}) {
  if (!messages.length) return null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4">
      {messages.map((message) => (
        <UIDirectiveCard
          key={message.id}
          message={message}
          onResume={onResume}
        />
      ))}
    </div>
  );
}
