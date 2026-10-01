import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
} from "recharts";

const tooltipStyle = {
  contentStyle: {
    background: "#0f1724",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    fontSize: 12,
    color: "#e6ebf2",
    fontFamily: "DM Sans, sans-serif",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  },
  cursor: { fill: "rgba(0, 212, 255, 0.06)" },
};

const palette: Record<string, { from: string; to: string }> = {
  primary: { from: "#0066FF", to: "#00D4FF" },
  critical: { from: "#FF3B5C", to: "#FF8A9C" },
  warning: { from: "#FFB020", to: "#FFD37A" },
  success: { from: "#00C896", to: "#5BE4BB" },
};

export function ExecBarChart({
  data,
  xKey,
  yKey,
  layout = "horizontal",
  height = 280,
  color = "primary",
  yAxisWidth = 120,
  labelSuffix,
  valueFormatter,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  layout?: "horizontal" | "vertical";
  height?: number;
  color?: keyof typeof palette;
  yAxisWidth?: number;
  labelSuffix?: string;
  valueFormatter?: (v: number) => string;
}) {
  const grad = palette[color];
  const gradientId = `socBarGrad-${color}-${layout}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: layout === "vertical" ? 40 : 16, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1={layout === "vertical" ? "0" : "0"} y1={layout === "vertical" ? "0" : "1"} x2={layout === "vertical" ? "1" : "0"} y2={layout === "vertical" ? "0" : "0"}>
            <stop offset="0%" stopColor={grad.from} />
            <stop offset="100%" stopColor={grad.to} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="rgba(255,255,255,0.04)"
          horizontal={layout === "horizontal"}
          vertical={layout === "vertical"}
        />
        {layout === "horizontal" ? (
          <>
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} interval={0} tick={{ fill: "#e6ebf2", fontSize: 11, fontFamily: "DM Sans, sans-serif" }} />
            <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "#e6ebf2", fontSize: 11, fontFamily: "DM Sans, sans-serif" }} />
          </>
        ) : (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "#e6ebf2", fontSize: 11, fontFamily: "DM Sans, sans-serif" }} />
            <YAxis type="category" dataKey={xKey} tickLine={false} axisLine={false} width={yAxisWidth} interval={0} tick={{ fill: "#e6ebf2", fontSize: 11, fontFamily: "DM Sans, sans-serif" }} />
          </>
        )}
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => [valueFormatter ? valueFormatter(v) : v.toLocaleString("pt-BR"), ""]}
        />
        <Bar
          dataKey={yKey}
          fill={`url(#${gradientId})`}
          radius={layout === "vertical" ? [0, 8, 8, 0] : [8, 8, 0, 0]}
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-out"
        >
          {labelSuffix && (
            <LabelList
              dataKey={yKey}
              position={layout === "vertical" ? "right" : "top"}
              formatter={(v: number) => `${valueFormatter ? valueFormatter(v) : v}${labelSuffix}`}
              style={{ fill: "#e6ebf2", fontSize: 11, fontFamily: "DM Sans, sans-serif", fontWeight: 500 }}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
