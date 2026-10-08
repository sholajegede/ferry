"use client";

export default function ErrorPage({ reset }: { error: Error; reset(): void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-4xl font-extrabold">Something went wrong</h1>
      <p className="mt-3 text-ink/80">
        The page hit a problem it could not recover from. Files already saved are not affected.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-11 items-center pill bg-sea px-6 text-xs text-on-sea hover:bg-sea-deep"
      >
        Reload this page
      </button>
    </div>
  );
}
