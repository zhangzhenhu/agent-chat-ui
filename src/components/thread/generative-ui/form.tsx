"use client";

import { useMemo, useState } from "react";
import { useStreamContext } from "@langchain/langgraph-sdk/react-ui";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { GenerativeComponentShell } from "./component-shell";

type FormField = {
  name: string;
  label?: string;
  type?: "text" | "textarea" | "boolean";
  placeholder?: string;
  defaultValue?: unknown;
};

type FormProps = {
  title?: string;
  description?: string;
  schema?: {
    fields?: FormField[];
  };
};

export function FormUI(props: FormProps) {
  const stream = useStreamContext();
  const fields = useMemo(() => {
    return Array.isArray(props.schema?.fields) ? props.schema.fields : [];
  }, [props.schema]);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    fields.reduce<Record<string, unknown>>((acc, field) => {
      acc[field.name] = field.defaultValue ?? (field.type === "boolean" ? false : "");
      return acc;
    }, {}),
  );

  return (
    <GenerativeComponentShell
      title={props.title}
      description={props.description}
    >
      <div className="space-y-4">
        {fields.map((field) => {
          const value = values[field.name];
          const label = field.label ?? field.name;

          if (field.type === "boolean") {
            return (
              <div key={field.name} className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2">
                <Label htmlFor={field.name}>{label}</Label>
                <Switch
                  id={field.name}
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
                <Label htmlFor={field.name}>{label}</Label>
                <Textarea
                  id={field.name}
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
              <Label htmlFor={field.name}>{label}</Label>
              <Input
                id={field.name}
                placeholder={field.placeholder}
                value={String(value ?? "")}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
              />
            </div>
          );
        })}

        <Button
          onClick={() => {
            // 当前阶段先把结构化表单值序列化成普通用户消息，优先打通非阻塞 UI 链路。
            stream.submit({
              messages: [{ type: "human", content: JSON.stringify(values, null, 2) }],
            });
          }}
        >
          提交
        </Button>
      </div>
    </GenerativeComponentShell>
  );
}
