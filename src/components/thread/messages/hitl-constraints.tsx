import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStreamContext } from "@/providers/Stream";

type FoodConstraintPayload = {
  kind?: string;
  title?: string;
  hint?: string;
  resume_mode?: string;
  options?: Array<{ label: string; value: string }>;
};

export function FoodConstraintsInterrupt({
  interrupt,
}: {
  interrupt: FoodConstraintPayload;
}) {
  const thread = useStreamContext();

  const handleChoice = (value: string) => {
    // 这类 food interrupt 来自官方 interrupt/resume 链路；点击后必须恢复当前 run，
    // 而不是再追加一条新的普通 human message。
    thread.submit(
      {},
      {
        command: { resume: value },
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
      },
    );
  };

  const options = interrupt.options ?? [
    { label: "选项 1", value: "option_1" },
    { label: "选项 2", value: "option_2" },
  ];

  return (
    <Card className="border-amber-200 bg-amber-50 shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base text-amber-950">
          {interrupt.title ?? "请补充一个关键信息"}
        </CardTitle>
        <CardDescription className="text-amber-900/80">
          {interrupt.hint ?? "点一个最接近的选项，我再继续。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant="outline"
            className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
            onClick={() => handleChoice(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
