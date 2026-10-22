"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted">Nothing was changed. Try again; if it keeps happening, reload the page.</p>
      <button className="btn-primary mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
