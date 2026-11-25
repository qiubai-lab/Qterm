import { serverTabColors } from "./serverTabColors";

export function ServerTabColorField({ value, disabled, onChange }: {
  value: string | null; disabled: boolean; onChange(value: string | null): void;
}) {
  const preset = serverTabColors.some(color => color.value === value);
  return <div className="runtime-color-field">
    <label><span>标签颜色</span><select aria-label="标签颜色" value={value ?? ""} disabled={disabled}
      onChange={event => onChange(event.target.value || null)}>
      <option value="">无色</option>
      {serverTabColors.map(color => <option key={color.value} value={color.value}>{color.name}</option>)}
      {value && !preset && <option value={value}>自定义</option>}
    </select></label>
    <label className="runtime-custom-color" data-empty={!value || undefined}>
      <input type="color" aria-label="自定义标签颜色" disabled={disabled} value={value ?? serverTabColors[0].value}
        onChange={event => onChange(event.target.value)}/>
    </label>
  </div>;
}
