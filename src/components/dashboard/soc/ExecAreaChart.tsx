import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
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
  cursor: { stroke: "rgba(0, 212, 255, 0.3)", strokeWidth: 1 },
};

export function ExecAreaChart({
  data,
  xKey,
  yKey,
  yName = "Valor",
  height = 280,
  referenceY,
  referenceLabel,
  gradientId = "socAreaGrad",
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  yName?: string;
  height?: number;
  referenceY?: number;
  referenceLabel?: string;
  gradientId?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00D4FF" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#0066FF" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: "#e6ebf2", fontSize: 11, fontFamily: "DM Sans, sans-serif" }} />
        <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "#e6ebf2", fontSize: 11, fontFamily: "DM Sans, sans-serif" }} />
        <Tooltip {...tooltipStyle} />
        {referenceY !== undefined && (
          <ReferenceLine
            y={referenceY}
            stroke="#FF3B5C"
            strokeDasharray="4 4"
            label={{ value: referenceLabel ?? "Licença", fill: "#FF3B5C", fontSize: 11 }}
          />
        )}
        <Area
          type="monotone"
          dataKey={yKey}
          name={yName}
          stroke="#00D4FF"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 4, fill: "#00D4FF", stroke: "#0a0d14", strokeWidth: 2 }}
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
