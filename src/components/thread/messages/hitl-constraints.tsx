import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStreamContext } from "@/providers/Stream";

type FoodConstraintPayload = {
  kind?: string;
  title?: string;
  hint?: string;
  mode?: string;
  options?: Array<{ label: string; value: string }>;
};

export function FoodConstraintsInterrupt({
  interrupt,
}: {
  interrupt: FoodConstraintPayload;
}) {
  const thread = useStreamContext();

  const handleChoice = (value: string) => {
    const textMap: Record<string, string> = {
      budget: "预算我来补充",
      time_limit: "时间要求我来补充",
      avoid_foods: "忌口我来补充",
      all: "预算、时间、忌口我都补充",
    };

    thread.submit(
      {
        messages: [
          {
            type: "human",
            content: textMap[value] ?? value,
          },
        ],
      },
      {
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
      },
    );
  };

  const options = interrupt.options ?? [
    { label: "补预算", value: "budget" },
    { label: "补时间", value: "time_limit" },
    { label: "补忌口", value: "avoid_foods" },
    { label: "都补", value: "all" },
  ];

  return (
    <Card className="border-muted-foreground/20 bg-background shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">{interrupt.title ?? "补充约束"}</CardTitle>
        <CardDescription>{interrupt.hint ?? "先点一个需要补充的方向。"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant="outline"
            onClick={() => handleChoice(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
