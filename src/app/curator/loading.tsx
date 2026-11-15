export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Жүктелуде">
      <div className="skeleton h-9 w-56 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-[28px]" />)}</div>
      <div className="skeleton h-64 rounded-[28px]" />
    </div>
  );
}
