"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Select over `{ value, label }` items. `labelledBy` is the id of the visible label element. */
export function SimpleSelect({
  items,
  value,
  onChange,
  labelledBy,
  disabled,
  className,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  labelledBy: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select items={items} value={value} disabled={disabled} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-labelledby={labelledBy} className={className ?? "w-full"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
