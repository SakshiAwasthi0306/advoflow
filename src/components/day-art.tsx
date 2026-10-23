/** The Today greeting's illustration: scales of justice that sway gently, a gavel that taps, law books. Decorative only. */
export function LawArt() {
  const gold = "rgb(232 190 110)";
  return (
    <div className="law-art theme-feature relative hidden h-[112px] w-[200px] shrink-0 overflow-hidden rounded-2xl shadow-glow sm:block" aria-hidden>
      <svg viewBox="0 0 200 112" className="relative h-full w-full">
        <defs>
          <radialGradient id="la-glow"><stop offset="0" stopColor="rgb(120 182 255)" stopOpacity=".35" /><stop offset="1" stopColor="rgb(120 182 255)" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="72" cy="50" r="52" fill="url(#la-glow)" />

        {/* Scales of justice */}
        <g>
          <rect x="70.5" y="24" width="3" height="66" rx="1.5" fill={gold} />
          <path d="M58 94h28l-4-6H62z" fill={gold} />
          <circle cx="72" cy="21" r="3.5" fill={gold} />
          <g className="la-beam" style={{ transformOrigin: "72px 27px" }}>
            <rect x="38" y="25.5" width="68" height="3" rx="1.5" fill={gold} />
            <g className="la-pan-l" style={{ transformOrigin: "42px 27px" }}>
              <path d="M42 27l-9 24M42 27l9 24" stroke={gold} strokeWidth="1" opacity=".8" />
              <path d="M30 51h24a12 6 0 0 1-24 0z" fill={gold} />
            </g>
            <g className="la-pan-r" style={{ transformOrigin: "102px 27px" }}>
              <path d="M102 27l-9 24M102 27l9 24" stroke={gold} strokeWidth="1" opacity=".8" />
              <path d="M90 51h24a12 6 0 0 1-24 0z" fill={gold} />
            </g>
          </g>
        </g>

        {/* Law books */}
        <g transform="translate(128 58)">
          <rect x="0" y="22" width="56" height="10" rx="1.5" fill="rgb(196 72 64)" />
          <rect x="4" y="12" width="50" height="10" rx="1.5" fill="rgb(40 110 170)" />
          <rect x="2" y="2" width="52" height="10" rx="1.5" fill="rgb(30 130 110)" />
          {[27, 17, 7].map((y) => <rect key={y} x="8" y={y - 1} width="22" height="1.6" rx=".8" fill={gold} opacity=".85" />)}
        </g>

        {/* Gavel tapping its sound block, which sits on the books */}
        <rect x="136" y="54" width="28" height="6" rx="2" fill="rgb(120 80 50)" />
        <g className="la-gavel" style={{ transformOrigin: "191px 42px" }}>
          <g transform="translate(150 42)">
            <rect x="5" y="-2" width="38" height="4" rx="2" fill="rgb(150 100 60)" />
            <rect x="-7" y="-12" width="14" height="24" rx="3.5" fill="rgb(160 108 64)" />
            <rect x="-7.5" y="-12" width="15" height="3" rx="1.2" fill={gold} />
            <rect x="-7.5" y="9" width="15" height="3" rx="1.2" fill={gold} />
          </g>
        </g>
        <g className="la-tap" fill={gold}>
          <rect x="131" y="50" width="5" height="1.6" rx=".8" transform="rotate(-25 131 50)" />
          <rect x="164" y="50" width="5" height="1.6" rx=".8" transform="rotate(25 164 50)" />
        </g>

        {/* Sparkles */}
        <circle className="empty-spark" cx="24" cy="20" r="1.6" fill="white" />
        <circle className="empty-spark empty-spark-2" cx="118" cy="14" r="1.3" fill="white" />
      </svg>
    </div>
  );
}
