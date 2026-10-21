export default function AdminLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="A carregar">
      <div className="skeleton h-9 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton h-[520px]" />
    </div>
  );
}
