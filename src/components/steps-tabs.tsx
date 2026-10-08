"use client";

import { useState } from "react";
import { FakeQr, FileRows, PhoneMock } from "./mocks";

const steps = [
  {
    label: "Step 1",
    title: "Start",
    body: "Open Ferry on the device that has your files and choose Send files.",
    tone: "bg-signal",
    soft: "bg-mint",
  },
  {
    label: "Step 2",
    title: "Scan",
    body: "Point your other device at the QR code, or type the six digits.",
    tone: "bg-sea",
    soft: "bg-lilac",
  },
  {
    label: "Step 3",
    title: "Send",
    body: "Choose what to share, watch the progress, and save it on the other side.",
    tone: "bg-orange",
    soft: "bg-peach",
  },
];

export function StepsTabs() {
  const [active, setActive] = useState(0);
  const step = steps[active];

  return (
    <div>
      <div role="tablist" aria-label="How it works" className="grid grid-cols-3">
        {steps.map((entry, index) => (
          <button
            key={entry.title}
            type="button"
            role="tab"
            id={`step-tab-${index}`}
            aria-selected={active === index}
            aria-controls="step-panel"
            onClick={() => setActive(index)}
            className={`rounded-t-[14px] p-4 text-left text-on-sea transition-[padding,margin] sm:p-7 ${entry.tone} ${
              active === index ? "" : "mt-3 opacity-90 hover:mt-1.5"
            }`}
          >
            <span className="eyebrow block opacity-80">{entry.label}</span>
            <span className="serif mt-2 block text-2xl sm:text-[2rem]">{entry.title}</span>
            <span className="mt-2 hidden text-[0.9375rem] leading-snug sm:block">{entry.body}</span>
          </button>
        ))}
      </div>
      <div
        id="step-panel"
        role="tabpanel"
        aria-labelledby={`step-tab-${active}`}
        className={`rounded-b-[40px] p-5 text-on-sea sm:p-10 ${step.tone}`}
      >
        <p className="mb-6 text-[0.9375rem] leading-snug sm:hidden">{step.body}</p>
        <div className="grid items-center gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <p className="pill h-8 bg-white/15 px-4 text-[0.6875rem]">
              {active === 0 ? "On the sending device" : active === 1 ? "On the other device" : "On both"}
            </p>
            <p className="serif mt-6 text-3xl leading-[1.1] sm:text-4xl">
              {active === 0 && "One button gives you a QR code and a 6-digit code."}
              {active === 1 && "The camera app on a phone opens the transfer by itself."}
              {active === 2 && "Files are saved as they arrive. Nothing is uploaded on the way."}
            </p>
          </div>
          <div className={`rounded-[24px] p-3 ${step.soft}`}>
            <div className="rounded-[18px] bg-paper p-5 text-ink sm:p-7">
              {active === 0 && (
                <div className="flex flex-wrap items-center gap-6">
                  <FakeQr size={132} />
                  <div>
                    <p className="eyebrow">Transfer code</p>
                    <p className="digits mt-2 text-5xl leading-none sm:text-6xl">482 107</p>
                    <p className="pill mt-4 h-8 border border-sea px-4 text-[0.6875rem]">Copy link</p>
                  </div>
                </div>
              )}
              {active === 1 && (
                <div className="grid items-center gap-6 rounded-[14px] bg-sea p-6 sm:grid-cols-2">
                  <PhoneMock />
                  <div className="text-on-sea">
                    <p className="eyebrow opacity-80">No app to install</p>
                    <p className="serif mt-2 text-2xl leading-tight">
                      On a laptop, type the code or paste the link.
                    </p>
                  </div>
                </div>
              )}
              {active === 2 && <FileRows />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
