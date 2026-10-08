import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-4xl font-extrabold">This page does not exist</h1>
      <p className="mt-3 text-ink/80">
        The address may be mistyped. If you were opening a transfer, copy the link again from the
        sending device.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-11 items-center pill bg-sea px-6 text-xs text-on-sea hover:bg-sea-deep"
      >
        Go to the start page
      </Link>
    </div>
  );
}
