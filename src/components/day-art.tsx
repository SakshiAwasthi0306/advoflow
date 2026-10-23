/** A small animated scene for the Today greeting that follows the time of day in India. Decorative only. */
export function DayArt({ hour }: { hour: number }) {
  const part = hour >= 5 && hour < 11 ? "morning" : hour >= 11 && hour < 17 ? "day" : hour >= 17 && hour < 20 ? "evening" : "night";
  const sky = {
    morning: ["rgb(255 214 170)", "rgb(170 210 255)"],
    day: ["rgb(150 205 255)", "rgb(215 236 255)"],
    evening: ["rgb(255 150 120)", "rgb(120 110 200)"],
    night: ["rgb(16 30 62)", "rgb(40 60 120)"],
  }[part];
  return (
    <div className={`day-art day-${part} relative hidden h-[112px] w-[200px] shrink-0 overflow-hidden rounded-2xl shadow-lift sm:block`} aria-hidden>
      <svg viewBox="0 0 200 112" className="h-full w-full">
        <defs>
          <linearGradient id="da-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={sky[1]} /><stop offset="1" stopColor={sky[0]} /></linearGradient>
          <radialGradient id="da-glow"><stop offset="0" stopColor="rgb(255 240 200)" stopOpacity=".9" /><stop offset="1" stopColor="rgb(255 240 200)" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="200" height="112" fill="url(#da-sky)" />
        {part === "night" ? (
          <g>
            {[[20, 18], [46, 40], [80, 14], [120, 30], [160, 16], [178, 46], [100, 52], [30, 60]].map(([x, y], i) => <circle key={i} className="da-star" style={{ animationDelay: `${i * 0.37}s` }} cx={x} cy={y} r={i % 3 ? 1 : 1.6} fill="white" />)}
            <g className="da-float"><circle cx="150" cy="38" r="15" fill="rgb(245 240 220)" /><circle cx="157" cy="33" r="13" fill={sky[1]} /></g>
          </g>
        ) : (
          <g className={part === "morning" ? "da-rise" : part === "evening" ? "da-set" : ""}>
            <circle cx="150" cy={part === "day" ? 34 : 60} r="34" fill="url(#da-glow)" />
            <g className="da-rays" style={{ transformOrigin: `150px ${part === "day" ? 34 : 60}px` }}>
              {Array.from({ length: 12 }, (_, i) => <rect key={i} x="149" y={part === "day" ? 6 : 32} width="2" height="7" rx="1" fill="rgb(255 210 120)" opacity=".7" transform={`rotate(${i * 30} 150 ${part === "day" ? 34 : 60})`} />)}
            </g>
            <circle cx="150" cy={part === "day" ? 34 : 60} r="14" fill={part === "evening" ? "rgb(255 170 110)" : "rgb(255 205 90)"} />
          </g>
        )}
        {part !== "night" && <g className="da-cloud" fill="white" opacity=".85"><ellipse cx="40" cy="36" rx="18" ry="7" /><ellipse cx="52" cy="32" rx="12" ry="8" /></g>}
        {part !== "night" && <g className="da-cloud da-cloud-2" fill="white" opacity=".6"><ellipse cx="95" cy="22" rx="14" ry="5" /><ellipse cx="104" cy="19" rx="9" ry="6" /></g>}
        {/* A court building on the horizon */}
        <g fill={part === "night" ? "rgb(10 20 40)" : "rgb(10 37 64)"} opacity={part === "night" ? 1 : 0.85}>
          <rect x="0" y="96" width="200" height="16" />
          <path d="M44 96V74h56v22z" />
          <path d="M40 74l32-14 32 14z" />
          {[50, 60, 70, 80, 90].map((x) => <rect key={x} x={x} y="77" width="4" height="19" fill={part === "night" ? "rgb(255 220 140)" : "rgb(220 232 246)"} opacity={part === "night" ? 0.55 : 0.5} />)}
          <rect x="130" y="84" width="22" height="12" /><rect x="156" y="80" width="16" height="16" /><rect x="176" y="88" width="24" height="8" />
        </g>
      </svg>
    </div>
  );
}
