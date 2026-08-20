import React from "react";


// ============================================================
// TYPES
// ============================================================

export interface RatePoint {
  label: string;
  value: number;
}

export interface RateChartProps {
  points?: RatePoint[];

  currentRate?: number;
  fixedRate?: number;

  height?: number;

  title?: string;
  subtitle?: string;

  loading?: boolean;
}


// ============================================================
// HELPERS
// ============================================================

function formatRate(value: number): string {
  return `${value.toFixed(2)}%`;
}


// ============================================================
// COMPONENT
// ============================================================

export default function RateChart({
  points = [],
  currentRate,
  fixedRate,
  height = 220,
  title = "Interest Rate",
  subtitle = "Floating rate vs fixed rate",
  loading = false,
}: RateChartProps) {

  // ----------------------------------------------------------
  // Empty / loading state
  // ----------------------------------------------------------

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          minHeight: height,
          borderRadius: 16,
          background: "#111318",
          border: "1px solid #242832",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: 140,
            height: 18,
            borderRadius: 6,
            background: "#242832",
            marginBottom: 8,
          }}
        />

        <div
          style={{
            width: 210,
            height: 12,
            borderRadius: 6,
            background: "#1d2027",
            marginBottom: 24,
          }}
        />

        <div
          style={{
            width: "100%",
            height: height - 90,
            borderRadius: 12,
            background: "#0d0f13",
          }}
        />
      </div>
    );
  }


  // ----------------------------------------------------------
  // Normalize data
  // ----------------------------------------------------------

  const chartPoints =
    points.length > 0
      ? points
      : [
          {
            label: "Now",
            value:
              currentRate !== undefined
                ? currentRate
                : 0,
          },
        ];


  const values =
    chartPoints.map(
      (point) => point.value
    );


  const allValues = [
    ...values,

    ...(currentRate !== undefined
      ? [currentRate]
      : []),

    ...(fixedRate !== undefined
      ? [fixedRate]
      : []),
  ];


  const minValue =
    allValues.length > 0
      ? Math.min(...allValues)
      : 0;


  const maxValue =
    allValues.length > 0
      ? Math.max(...allValues)
      : 10;


  const range =
    maxValue - minValue === 0
      ? 1
      : maxValue - minValue;


  // ----------------------------------------------------------
  // Chart dimensions
  // ----------------------------------------------------------

  const chartWidth = 760;
  const chartHeight = 260;

  const paddingLeft = 52;
  const paddingRight = 24;
  const paddingTop = 20;
  const paddingBottom = 38;

  const innerWidth =
    chartWidth -
    paddingLeft -
    paddingRight;

  const innerHeight =
    chartHeight -
    paddingTop -
    paddingBottom;


  // ----------------------------------------------------------
  // Point coordinates
  // ----------------------------------------------------------

  const coordinates =
    chartPoints.map(
      (point, index) => {

        const x =
          chartPoints.length === 1
            ? paddingLeft +
              innerWidth / 2
            : paddingLeft +
              (index /
                (chartPoints.length - 1)) *
                innerWidth;

        const normalized =
          (point.value - minValue) /
          range;

        const y =
          paddingTop +
          innerHeight -
          normalized *
            innerHeight;

        return {
          ...point,
          x,
          y,
        };
      }
    );


  // ----------------------------------------------------------
  // SVG path
  // ----------------------------------------------------------

  const path =
    coordinates.length === 0
      ? ""
      : coordinates
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"} ${
                point.x
              } ${point.y}`
          )
          .join(" ");


  // ----------------------------------------------------------
  // Fixed rate position
  // ----------------------------------------------------------

  const fixedRateY =
    fixedRate !== undefined
      ? paddingTop +
        innerHeight -
        ((fixedRate - minValue) /
          range) *
          innerHeight
      : null;


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div
      style={{
        width: "100%",
        minHeight: height,
        borderRadius: 16,
        background: "#111318",
        border: "1px solid #242832",
        padding: 20,
        boxSizing: "border-box",
        color: "#f5f7fa",
      }}
    >

      {/* -------------------------------------------------- */}
      {/* HEADER */}
      {/* -------------------------------------------------- */}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >

        <div>

          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: 5,
              fontSize: 12,
              color: "#858b98",
            }}
          >
            {subtitle}
          </div>

        </div>


        {/* Current rate */}

        {currentRate !== undefined && (
          <div
            style={{
              textAlign: "right",
            }}
          >

            <div
              style={{
                fontSize: 11,
                color: "#858b98",
                marginBottom: 3,
              }}
            >
              Current
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              {formatRate(currentRate)}
            </div>

          </div>
        )}

      </div>


      {/* -------------------------------------------------- */}
      {/* LEGEND */}
      {/* -------------------------------------------------- */}

      {(currentRate !== undefined ||
        fixedRate !== undefined) && (
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            marginBottom: 10,
            fontSize: 11,
            color: "#8b919d",
          }}
        >

          {currentRate !== undefined && (
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#7c5cff",
                  display: "inline-block",
                }}
              />

              Floating
            </div>
          )}


          {fixedRate !== undefined && (
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#35c98b",
                  display: "inline-block",
                }}
              />

              Fixed
            </div>
          )}

        </div>
      )}


      {/* -------------------------------------------------- */}
      {/* CHART */}
      {/* -------------------------------------------------- */}

      <div
        style={{
          width: "100%",
          overflowX: "auto",
        }}
      >

        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          role="img"
          aria-label="Interest rate chart"
        >

          {/* Grid */}

          {[0, 0.25, 0.5, 0.75, 1].map(
            (ratio) => {

              const y =
                paddingTop +
                innerHeight * ratio;

              const value =
                maxValue -
                range * ratio;

              return (
                <React.Fragment
                  key={ratio}
                >

                  <line
                    x1={paddingLeft}
                    x2={
                      chartWidth -
                      paddingRight
                    }
                    y1={y}
                    y2={y}
                    stroke="#20242c"
                    strokeWidth="1"
                  />

                  <text
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="#656b76"
                  >
                    {value.toFixed(1)}%
                  </text>

                </React.Fragment>
              );
            }
          )}


          {/* Fixed rate line */}

          {fixedRateY !== null && (
            <>
              <line
                x1={paddingLeft}
                x2={
                  chartWidth -
                  paddingRight
                }
                y1={fixedRateY}
                y2={fixedRateY}
                stroke="#35c98b"
                strokeWidth="1.5"
                strokeDasharray="5 5"
                opacity="0.8"
              />

              <text
                x={
                  chartWidth -
                  paddingRight
                }
                y={fixedRateY - 7}
                textAnchor="end"
                fontSize="10"
                fill="#35c98b"
              >
                Fixed {formatRate(fixedRate!)}
              </text>
            </>
          )}


          {/* Rate line */}

          {path && (
            <path
              d={path}
              fill="none"
              stroke="#7c5cff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}


          {/* Area */}

          {coordinates.length > 1 && (
            <path
              d={`
                ${path}
                L ${
                  coordinates[
                    coordinates.length - 1
                  ].x
                } ${
                  paddingTop +
                  innerHeight
                }
                L ${
                  coordinates[0].x
                } ${
                  paddingTop +
                  innerHeight
                }
                Z
              `}
              fill="rgba(124, 92, 255, 0.08)"
            />
          )}


          {/* Points */}

          {coordinates.map(
            (point) => (
              <g
                key={`${point.label}-${point.x}`}
              >

                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="#111318"
                  stroke="#7c5cff"
                  strokeWidth="2"
                />

              </g>
            )
          )}


          {/* X axis labels */}

          {coordinates.map(
            (point) => (
              <text
                key={`label-${point.label}-${point.x}`}
                x={point.x}
                y={
                  chartHeight -
                  12
                }
                textAnchor="middle"
                fontSize="10"
                fill="#656b76"
              >
                {point.label}
              </text>
            )
          )}

        </svg>

      </div>


      {/* -------------------------------------------------- */}
      {/* EMPTY MESSAGE */}
      {/* -------------------------------------------------- */}

      {points.length === 0 && (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: "#656b76",
          }}
        >
          Rate history will appear as settlement data
          becomes available.
        </div>
      )}

    </div>
  );
}