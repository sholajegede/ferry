const QR_ROWS = [
  "1111111001011001111111",
  "1000001010110101000001",
  "1011101011001001011101",
  "1011101001110101011101",
  "1011101010011001011101",
  "1000001011100101000001",
  "1111111010101011111111",
  "0000000011010100000000",
  "1101011100111011010110",
  "0110100111001100101101",
  "1011011001110110110010",
  "0100110110011011001011",
  "1110101011100101110100",
  "0000000010110110101101",
  "1111111001011001011010",
  "1000001011101110100111",
  "1011101010010011011001",
  "1011101001101100110110",
  "1011101011011011101011",
  "1000001010100110010101",
  "1111111011011101101110",
];

export function FakeQr({ size = 150 }: { size?: number }) {
  const count = QR_ROWS.length;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`-1.5 -1.5 ${count + 3} ${count + 3}`}
      shapeRendering="crispEdges"
      className="rounded-[14px] bg-white"
      aria-hidden
    >
      {QR_ROWS.flatMap((row, y) =>
        row.split("").map((cell, x) =>
          cell === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#2f1b63" /> : null,
        ),
      )}
    </svg>
  );
}

const files = [
  { name: "holiday-photos", meta: "214 photos, 1.8 GB", tone: "bg-peach", bar: "bg-orange", width: "100%", state: "Received" },
  { name: "quarterly-report.pdf", meta: "4.2 MB", tone: "bg-pink", bar: "bg-magenta", width: "100%", state: "Received" },
  { name: "wedding-film.mov", meta: "6.4 GB, 48 MB/s, 1 min left", tone: "bg-mint", bar: "bg-signal", width: "62%", state: "" },
];

export function FileRows({ compact }: { compact?: boolean }) {
  return (
    <ul className="space-y-2">
      {files.slice(0, compact ? 2 : 3).map((file) => (
        <li key={file.name} className="rounded-[14px] border border-line bg-white p-3">
          <div className="flex items-center gap-3">
            <span className={`h-9 w-9 flex-none rounded-[10px] ${file.tone}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sea-deep">{file.name}</p>
              <p className="truncate text-xs text-ink">{file.meta}</p>
            </div>
            {file.state && (
              <span className="pill h-6 bg-mint px-2.5 text-[0.625rem] text-forest">{file.state}</span>
            )}
          </div>
          {!file.state && (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className={`h-full rounded-full ${file.bar}`} style={{ width: file.width }} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Bubbles() {
  const tones = [
    "bg-lilac",
    "bg-orange",
    "bg-mint",
    "bg-sea",
    "bg-peach",
    "bg-signal",
    "bg-pink",
    "bg-lilac",
    "bg-teal",
    "bg-peach",
    "bg-sea",
    "bg-mint",
    "bg-signal",
    "bg-orange",
  ];
  return (
    <div className="relative h-24 overflow-hidden bg-sunken sm:h-28" aria-hidden>
      <div className="absolute -bottom-10 left-0 flex w-[140%] -translate-x-6">
        {tones.map((tone, index) => (
          <span
            key={index}
            className={`-ml-3 h-24 w-24 flex-none rounded-full ${tone} ${index % 2 ? "translate-y-3" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

export function HeroMock() {
  return (
    <div className="relative" aria-hidden>
      <span className="flag absolute -top-3 left-6 z-10 -rotate-3 bg-signal sm:left-16">Your files</span>
      <span className="flag absolute -top-4 left-1/2 z-10 rotate-2 bg-flag-red">Scan to connect</span>
      <span className="flag absolute -top-2 right-6 z-10 -rotate-2 bg-orange sm:right-20">
        Sent
      </span>
      <div className="window">
        <div className="window-inner">
          <Bubbles />
          <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)] md:items-center">
            <FakeQr size={168} />
            <div>
              <p className="eyebrow">Transfer code</p>
              <p className="digits mt-2 text-6xl leading-none sm:text-7xl">482 107</p>
              <p className="mt-4 flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-signal" /> Phone (Safari) connected, same
                network
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-signal" /> End-to-end encrypted, code 913
                552
              </p>
            </div>
            <FileRows />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PhoneMock() {
  return (
    <div className="mx-auto w-44 rounded-[28px] border border-white/60 bg-white/15 p-2" aria-hidden>
      <div className="rounded-[22px] bg-night p-4">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/30" />
        <div className="relative grid aspect-square place-items-center rounded-[14px] bg-black/40">
          <FakeQr size={96} />
          <span className="pointer-events-none absolute inset-3 rounded-[10px] border-2 border-white/80" />
        </div>
        <p className="pill mt-3 h-7 w-full bg-paper text-[0.625rem] text-sea-deep">Open transfer</p>
      </div>
    </div>
  );
}
