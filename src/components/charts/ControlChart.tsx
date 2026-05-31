import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Dot,
} from "recharts";

export interface ChartReferenceLine {
  y: number;
  label: string;
  color: string;
}

interface ControlChartProps {
  values: number[];
  referenceLines: ChartReferenceLine[];
  outOfControl?: number[];
  yLabel?: string;
  height?: number;
  color?: string;
}

export const ControlChart = ({
  values,
  referenceLines,
  outOfControl = [],
  yLabel,
  height = 220,
  color = "hsl(var(--primary))",
}: ControlChartProps) => {
  const data = values.map((v, i) => ({ i: i + 1, v, isOoc: outOfControl.includes(i) }));

  // Use IQR fences to exclude extreme outliers from domain calculation
  // so one bad point doesn't compress all reference lines into a tiny band.
  const sorted = [...values].filter(isFinite).sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? sorted[0];
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1];
  const iqr = q3 - q1;
  const fence = iqr * 3;
  const inliers = sorted.filter((v) => v >= q1 - fence && v <= q3 + fence);
  const refY = referenceLines.map((l) => l.y).filter(isFinite);
  const allY = [...inliers, ...refY];
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const pad  = (yMax - yMin) * 0.1 || 0.01;
  const domain: [number, number] = [yMin - pad, yMax + pad];

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 72, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="i" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            domain={domain}
            tickFormatter={(v: number) => v.toFixed(5)}
            label={
              yLabel
                ? { value: yLabel, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }
                : undefined
            }
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          {referenceLines.map((rl) => (
            <ReferenceLine
              key={rl.label}
              y={rl.y}
              stroke={rl.color}
              strokeDasharray="4 4"
              label={{ value: `${rl.label} ${rl.y.toFixed(3)}`, position: "right", fill: rl.color, fontSize: 10 }}
            />
          ))}
          <Line
            type="linear"
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              const isOoc = payload.isOoc;
              return (
                <Dot
                  key={`dot-${payload?.i ?? payload?.index ?? Math.random()}`}
                  cx={cx}
                  cy={cy}
                  r={isOoc ? 5 : 3}
                  fill={isOoc ? "hsl(var(--destructive))" : color}
                  stroke={isOoc ? "hsl(var(--destructive))" : color}
                />
              );
            }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
