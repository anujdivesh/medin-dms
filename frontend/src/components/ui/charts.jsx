import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from './chart'

// Bar Chart Component
export function BarChartComponent({ data, title, xKey, yKey, color = "#8884d8", height = 300, colors, xTickAngle = 0, showCategoryLegend = false }) {
  const config = {
    [yKey]: {
      label: title,
      color: color,
    },
  }

  return (
    <div className="w-full" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ChartContainer config={config} className="w-full h-full">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: xTickAngle !== 0 ? 56 : 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} interval={0} height={xTickAngle !== 0 ? 60 : 20} tick={{ fontSize: 10, angle: xTickAngle, textAnchor: xTickAngle !== 0 ? 'end' : 'middle' }} tickMargin={8} />
          <YAxis />
          <ChartTooltip content={<ChartTooltipContent />} />
          {!showCategoryLegend && <ChartLegend content={<ChartLegendContent />} />}
          <Bar dataKey={yKey} fill={color}>
            {Array.isArray(data) && data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={Array.isArray(colors) && colors?.length ? colors[i % colors.length] : color} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      {showCategoryLegend && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {Array.isArray(data) && data.map((entry, index) => (
            <div key={`legend-${index}`} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: Array.isArray(colors) && colors?.length ? colors[index % colors.length] : color }} />
              <span className="text-muted-foreground">{entry?.[xKey]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Pie Chart Component
export function PieChartComponent({ data, title, dataKey, nameKey, colors = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"], height = 300 }) {
  const config = {
    [dataKey]: {
      label: title,
    },
  }

  return (
    <div className="w-full" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ChartContainer config={config} className="w-full h-full">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey={dataKey}
            nameKey={nameKey}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent />} />
        </PieChart>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {Array.isArray(data) && data.map((entry, index) => (
          <div key={`legend-${index}`} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} />
            <span className="text-muted-foreground">{entry?.[nameKey]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Line Chart Component
export function LineChartComponent({ data, title, xKey, yKey, color = "#8884d8", height = 300, legendLabel }) {
  const config = {
    [yKey]: {
      label: title,
      color: color,
    },
  }

  return (
    <div className="w-full" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ChartContainer config={config} className="w-full h-full">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} interval={0} height={20} tick={{ fontSize: 10 }} tickMargin={8} />
          <YAxis />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} />
        </LineChart>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
          <span className="text-muted-foreground">{legendLabel || title || yKey}</span>
        </div>
      </div>
    </div>
  )
}

export function AreaChartComponent({ data, title, xKey, yKey, color = "#8884d8", height = 300, xTickAngle = 0, labelColors, areaType = "monotone", showSeriesLegend = false, legendLabel }) {
  const config = {
    [yKey]: {
      label: title,
      color: color,
    },
  }

  return (
    <div className="w-full" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ChartContainer config={config} className="w-full h-full">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: xTickAngle !== 0 ? 56 : 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey={xKey}
            interval={0}
            height={xTickAngle !== 0 ? 60 : 20}
            tick={(props) => {
              const { x, y, payload } = props
              const index = Array.isArray(data) ? data.findIndex(d => d?.[xKey] === payload?.value) : -1
              const fillColor = Array.isArray(labelColors) && labelColors.length ? labelColors[(index >= 0 ? index : 0) % labelColors.length] : '#64748b'
              const angle = xTickAngle || 0
              const anchor = angle !== 0 ? 'end' : 'middle'
              const offsetY = angle !== 0 ? 4 : 0
              return (
                <g transform={`translate(${x},${y})`}>
                  <text dy={offsetY} textAnchor={anchor} fill={fillColor} fontSize={10} transform={angle !== 0 ? `rotate(${angle})` : undefined}>
                    {payload?.value}
                  </text>
                </g>
              )
            }}
            tickMargin={8}
          />
          <YAxis />
          <ChartTooltip content={<ChartTooltipContent />} />
          {!showSeriesLegend && <ChartLegend content={<ChartLegendContent />} />}
          <Area type={areaType} dataKey={yKey} stroke={color} fill={color} fillOpacity={0.25} />
        </AreaChart>
      </ChartContainer>
      {showSeriesLegend && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">{legendLabel || title || yKey}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Radar (Spider) Chart Component
export function RadarChartComponent({ 
  data, 
  title, 
  angleKey, 
  radiusKey, 
  color = "#3b82f6", 
  height = 300,
  outerRadius = "80%",
  angleTickFontSize = 10,
  radiusTickFontSize = 10,
  angleTickMargin = 8,
}) {
  const config = {
    [radiusKey]: {
      label: title,
      color: color,
    },
  }

  return (
    <div className="w-full" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ChartContainer config={config} className="w-full h-full">
        <RadarChart data={data} outerRadius={outerRadius}>
          <PolarGrid />
          <PolarAngleAxis dataKey={angleKey} tick={{ fontSize: angleTickFontSize }} tickMargin={angleTickMargin} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: radiusTickFontSize }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Radar name={title} dataKey={radiusKey} stroke={color} fill={color} fillOpacity={0.3} />
        </RadarChart>
      </ChartContainer>
    </div>
  )
}
