import React from "react";

interface StatStripProps {
  items: Array<{
    label: string;
    value: string;
    tone?: "green" | "red" | "blue" | "amber";
  }>;
}

export default function StatStrip({ items }: StatStripProps) {
  return (
    <div className="stat-strip">
      {items.map((item) => (
        <div className="stat-tile" key={item.label}>
          <span>{item.label}</span>
          <strong className={item.tone ? `tone-${item.tone}` : ""}>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
