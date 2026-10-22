import { Icon } from "../../Icon";

export function MergeSteps({ step }: { step: "source" | "confirm" | "done" }) {
  const current = ["source", "confirm", "done"].indexOf(step);
  return <ol className="configuration-merge-steps" aria-label="合并步骤">
    {["选择来源", "确认合并", "完成合并"].map((label, index) => <li key={label} data-state={index < current ? "complete" : index === current ? "current" : "pending"} aria-current={index === current ? "step" : undefined}>
      <span className="configuration-merge-step-number">{index < current ? <Icon name="check" size={12}/> : index + 1}</span>
      <span>{label}</span>
    </li>)}
  </ol>;
}
